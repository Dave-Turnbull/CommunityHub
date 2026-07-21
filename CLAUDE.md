# CommunityHub — Agent Guide

A lightweight chat app organized around **rooms**, each containing text
channels, plus direct messages. This file orients an AI agent working in the
repo: what the stack is, where things live, the conventions to follow, and the
traps that have already been hit (don't re-introduce them).

## Stack

- **Backend:** Laravel 13 (PHP 8.4), PostgreSQL 16, Redis 7
- **Realtime:** Laravel Reverb (WebSockets) over `laravel-echo` + `pusher-js`
- **Auth:** Sanctum SPA mode — session cookies, NOT bearer tokens
- **Frontend:** React 18 + Inertia.js (server-driven routing, no client router) + Vite + Tailwind
- **Client state:** Zustand (messages/presence), TanStack Query available but sparse
- **Everything runs in Docker.** No local PHP/Node/Postgres is expected.

## Best practices

- **Every new or changed feature gets a test** — a Laravel Feature test for
  backend behavior (routes, authorization, validation, broadcasts), a Vitest
  test for frontend logic (stores, hooks, services, components). Write the
  test in the same change as the feature, not as follow-up. See `## Testing`.
- **Update this file in the same change that makes it stale.** New model,
  route, convention, directory, or trap → add it to the relevant section here
  before considering the work done. An agent reading this file next should not
  have to rediscover what you just learned.
- **Don't leave comments unless the meaning can't be inferred.** No comments
  restating what a line does, no "used by X" callouts, no commented-out code.
  A comment earns its place only for a non-obvious constraint, invariant, or
  workaround — see e.g. the pluralizer note on `CustomEmoji` or the cursor
  pagination doc-comment on `MessageController::paginate`.

## Run commands

```bash
docker compose up -d --build     # first boot; ~3-5 min (compiles PHP exts, npm install)
docker compose logs -f app       # tail app logs
docker compose exec app sh       # shell into app container
docker compose exec app php artisan db:seed --force   # optional demo data
docker compose down              # stop; add -v to also drop data volumes

docker compose exec app php artisan test      # backend suite (PHPUnit, ~1s, sqlite in-memory)
docker compose exec app composer install      # (re)install PHP dev deps after a composer.json change
docker compose exec vite npm run test         # frontend suite (Vitest, ~2s)
docker compose exec vite npm run test:watch   # frontend suite, watch mode
docker compose exec vite npm install          # (re)install JS deps after a package.json change
docker compose exec vite npx tsc --noEmit     # typecheck the frontend
```

App: http://localhost:8000 · Vite: :5173 · Reverb: :8080 · Postgres: :5432 · Redis: :6379

DB boots **empty by design**. Seed only when asked. Seeded logins:
`alice@example.com` / `password`, `bob@example.com` / `password`.

## Request lifecycle

```
Browser
  ├── HTTP  → nginx :80 → php-fpm (app) → Postgres / Redis
  ├── WS    → Reverb :8080   (message + reaction + presence broadcasts)
  └── HMR   → Vite :5173     (dev only)
worker container: php artisan queue:work   (processes broadcast jobs)
```

Page loads go through Inertia (controller returns `Inertia::render`, props hydrate
a React page). Mutations (send/edit/delete/react/upload) go through `/api/*` via
axios. There is no REST layer for page navigation — don't add one.

## Directory map

```
app/
  Events/                     ShouldBroadcast events (Message*, ReactionChanged,
                               NotificationCreated)
  Http/Controllers/
    Web/                      Inertia page controllers (return Inertia::render)
    Api/                      JSON controllers (axios targets) — ChannelFocusController
                               is the focus/blur heartbeat endpoint (see Conventions);
                               ConversationController (distinct from Web\ConversationController)
                               handles candidates/resolve/store/addParticipants — creating
                               and growing conversations, see Conventions; VoiceIceServersController
                               issues ephemeral STUN/TURN credentials (no resource to authorize
                               beyond auth, see Conventions); VoiceDevicePreferenceController is
                               index/update keyed on (user, client_id), not just user
    Controller.php            empty abstract base — Laravel ships none by default, keep it
  Http/Middleware/
    HandleInertiaRequests.php shares auth.user, rooms, conversations, flash
  Mail/                       Mailable classes (RoomInviteMail), ShouldQueue — sent via
                               the `worker` container, Mailpit catches them in dev
  Models/                     all UUID-keyed (HasUuids); Notification is the exception to
                               the "table name matches model" convention — see trap #22;
                               NotificationPreference is the per-user/per-category email+
                               in_app override table (only rows that override a default
                               are stored — see Conventions); VoiceDevicePreference is the
                               per-(user, client_id) mic/speaker override table — see
                               Conventions, "Voice"
  Policies/                   authorization seams beyond simple membership checks
                               (RoomPolicy::invite — see Conventions; ConversationPolicy::
                               addParticipants gates the one conversation action with an
                               existing resource to authorize — creation itself has none,
                               so it's inline validation instead, see Conventions)
  Support/                    ChannelFocus — cache-backed "is this user looking at this
                               channel right now" tracker (see Conventions), not a model
                               (nothing here is persisted to a table, no queue involved)
bootstrap/
  app.php                     THE wiring file — routing, middleware groups
  providers.php               provider list (App\Providers\AppServiceProvider only)
config/                       hand-written; app.php has NO 'providers' key (see traps).
                               mail.php/services.php only override specific keys — the
                               rest is silently merged from framework defaults (trap #19);
                               turn.php is first-party voice infra config (coturn), shaped
                               like broadcasting.php rather than folded into services.php —
                               see Conventions, "Voice"
database/
  factories/                  one factory per model, all use HasFactory
  migrations/                 timestamped 2024_01_01_0000NN_*, UUID PKs
  seeders/DatabaseSeeder.php  demo data; never runs automatically
docker/
  app/Dockerfile              two-stage (composer build → fpm runtime; composer binary
                               also copied into the runtime image, see traps)
  app/entrypoint.sh           mkdir storage, key:gen, wait-for-db, migrate, storage:link
  nginx/default.conf
resources/
  views/
    emails/                   plain Blade mail views (room-invite.blade.php) — no
                               markdown mail layout in this repo, keep them simple
  js/
    app.tsx                   Inertia bootstrap + QueryClientProvider
    pages/                    one file per Inertia page (Auth, Channels, DM, Rooms,
                               Settings, Invite — the invite-accept landing page)
    components/
      chat/                   MessageList, MessageRow, MessageInput
      layout/                 RoomRail (renders the unread badge on the Messages icon —
                               see below; no notification bell/popover anymore),
                               ChannelSidebar, DMSidebar, MemberList, UserPanel, InviteModal
      messages/               NotificationFeed — the category-filterable notification list
                               that replaced the notification bell, renders inside
                               DM/Index.tsx (the "Messages" hub) below the conversation list;
                               UserPicker — search + multi-select over users sharing a room
                               with you, used by both NewConversationModal (creation) and
                               AddParticipantsModal (growing an existing group); see
                               Conventions for the conversation-creation flow
      settings/               NotificationPreferences (category/email/in_app toggle grid,
                               renders inside Settings/Index's "Notifications" tab; the
                               direct_message row's in_app `Toggle` is `disabled` — see
                               Conventions); AudioSettings (mic/speaker device pickers,
                               renders inside Settings/Index's "Voice & Video" tab — no
                               connection-mode UI here, that's channel/conversation-level,
                               not a user setting, see Conventions)
      voice/                  VoiceChannelPanel (a room voice channel's entire main-pane
                               content — participant tiles + join/leave, no text chat),
                               VoiceBar (persistent bar above the message thread in DM/Show —
                               every Conversation always has voice available, so this always
                               renders — both drive useVoiceChannel), and
                               VoiceChannelSidebarItem (a voice channel's row in
                               ChannelSidebar plus a live list of who's currently in its
                               call, driven by useVoiceChannelRoster — read-only, doesn't
                               join the call); see Conventions "Voice"
      emoji/ ui/              EmojiPicker, Avatar, Tooltip, Tabs (generic tabbed container —
                               takes `tabs: {value, label, content}[]`, not settings-specific),
                               Toggle (on/off switch, custom — no Radix Switch dependency)
    hooks/                    useChat (seeds store + subscribes; `enabled: false` skips both
                               for a voice channel), useAutoScroll,
                               useNotifications (seeds store + subscribes, same shape as
                               useChat — used by both RoomRail for the badge and
                               NotificationFeed for the list), useChannelFocus (focus/blur
                               heartbeat while a channel page is mounted, `null` channelId
                               no-ops for a voice channel — see Conventions), useVoiceChannel
                               (join/leave/toggleMute for a voice-capable channel/conversation
                               — also observes its roster, so participants show up before you
                               join), useVoiceChannelRoster (read-only "who's in this call,"
                               used by ChannelSidebar; see Conventions "Voice")
    services/                 api.ts (axios), echo.ts (Reverb subscriptions — also
                               joinVoiceChannel(), see Conventions "Voice"),
                               voicePresence.ts (ref-counted shared subscription to a voice
                               scope's presence roster — the thing both
                               useVoiceChannelRoster and webrtc.ts go through, never
                               echo.ts's joinVoiceChannel() directly a second time for the
                               same scope, see trap #32), webrtc.ts (the actual
                               RTCPeerConnection/Perfect Negotiation layer — module-level
                               state, not a Zustand store, see Conventions "Voice"),
                               clientId.ts (localStorage-persisted per-browser-install id)
    stores/                   Zustand: useMessages, usePresence, useUI, useNotifications,
                               useVoice (the current user's own call state — scope, mute,
                               connection — never RTCPeerConnection/MediaStream objects,
                               those live in webrtc.ts), useVoiceRoster (shared, anyone-can-
                               read "who's in this scope's call" — see Conventions "Voice")
    types/                    all shared interfaces + Inertia page-prop types
    test/setup.ts             Vitest setup — @testing-library/jest-dom matchers
    **/*.test.ts(x)           co-located next to the file under test
routes/
  web.php                     guest + auth Inertia routes
  api.php                     /api/* under auth (session), axios targets
  channels.php                broadcast auth: channel.{id} presence, conversation.{id} private,
                               voice.channel.{id}/voice.conversation.{id} presence (roster +
                               signaling transport for calls — see Conventions "Voice")
  console.php
tests/
  Feature/                    one folder per feature area (Auth, Rooms, Channels,
                               Messages, Conversations, Reactions, Uploads, Settings,
                               Broadcasting, Invites, Notifications, Voice) — routes through
                               the real HTTP kernel
  Unit/Models/                pure model logic (reactionSummary, hasMember, sharesRoomWith, ...)
  Unit/Support/               ChannelFocus cache-logic tests — no HTTP, no RefreshDatabase
phpunit.xml                   sqlite :memory:, null broadcaster, sync queue — see Testing
vitest.config.ts              jsdom env, '@' alias, loads resources/js/test/setup.ts;
                               pool: 'threads' — see trap #25
```

## Conventions

- **The display name ("CommunityHub") is one env var, not a hardcoded string** —
  `APP_NAME` (`config('app.name')`, default `CommunityHub`). Backend/Blade code
  (`RoomInviteMail`, `emails/room-invite.blade.php`, `app.blade.php`'s `<title>`)
  reads `config('app.name')` directly. The React bundle can't call `config()`, so it's
  threaded through two paths: `HandleInertiaRequests::share()` adds `appName` to every
  page's shared props (`SharedProps.appName` in `types/index.ts`) for use inside
  components via `usePage<SharedProps>().props.appName` (see `Login.tsx`,
  `Invite/Accept.tsx`); and `app.blade.php` also emits a `<meta name="app-name"
  content="...">` tag that `app.tsx` reads directly, since the Inertia `title`
  callback runs outside the React tree and has no access to page props. Never
  hardcode the app's display name in a new page/component/mailable — use one of
  these two paths depending on whether the code is inside the React tree.
- **Login accepts either email or username through one field**, not two. The form
  (`Login.tsx`, and the existing-account half of `Invite/Accept.tsx`) posts a single
  `login` string; `AuthController::login` disambiguates with
  `str_contains($login, '@')` — safe because the registration regex
  (`/^[a-z0-9_.]+$/`) forbids `@` in usernames — and calls `Auth::attempt(['email' =>
  ...])` or `Auth::attempt(['username' => ...])` accordingly. Validation errors and
  `onlyInput()` key off `login`, not `email` — don't reintroduce a separate `email`
  request field on this route.
- **UUIDs everywhere.** Every model uses `HasUuids`; every migration uses
  `$table->uuid('id')->primary()` and `foreignUuid(...)`. Never introduce
  auto-increment ids or `id()` on a domain table.
- **Messages are scoped** by either `channel_id` OR `conversation_id` (never both).
  The `scope()` helper in `MessageController` returns `['channel'|'conversation', id]`.
  Broadcast events take `(scopeType, scopeId)` and pick presence vs private channel.
- **Every controller that touches a message checks membership/participancy** —
  `Room::hasMember` for channel-scoped, `Conversation::hasParticipant` for
  conversation-scoped, via `abort_unless(..., 403)`. `MessageController` and
  `ReactionController` both do this; a new message-adjacent endpoint (pins,
  read receipts, etc.) needs the same check or any authenticated user can act
  on a channel/DM they're not in.
- **Broadcasts use `->toOthers()`.** The sender adds their own message to the
  Zustand store from the HTTP response; the socket only informs everyone else.
  `useMessages.add` has a dup-guard on id anyway — keep it.
- **Echo listeners use a leading dot** (`.MessageSent`) to match `broadcastAs()`
  names without the `App\Events` namespace prefix.
- **Zustand message store is keyed by scopeId** so multiple channels/DMs coexist.
  Reducer-style: `setMessages / prepend / add / update / remove / setReactions`.
- **Message history is cursor-paginated**, 50/page, walking backwards from the
  oldest loaded message. `useChat.loadMore` + an IntersectionObserver sentinel at
  the top of `MessageList`.
- **File uploads** go to the `public` disk in dev; production swaps
  `FILESYSTEM_DISK=r2` (Cloudflare R2, S3-compatible) — see `config/filesystems.php`.
- **Tailwind palette** is defined in `tailwind.config.js` (surface/brand/status/text).
  Utility classes are applied inline in JSX, not extracted into `@layer components`
  classes — `resources/css/app.css` only holds `@layer base` (global element resets,
  scrollbar styling). When the same class string repeats across a component
  (e.g. active vs. inactive sidebar item, the field/button styling shared across
  Auth/Rooms/Settings forms), copy the literal utility string rather than
  introducing a shared CSS class; use `clsx(...)` for conditional variants.
- **`RoomRail` is a horizontal bar across the top of every authenticated page**
  (`h-room-rail`, 56px). Every page wraps it in `flex flex-col h-screen` with a
  `flex flex-1 min-h-0` row underneath holding the channel/DM sidebar + main
  content.
- **Every user has a private `App.Models.User.{id}` channel** (`routes/channels.php`),
  matching the naming Laravel's own `Notifiable::receivesBroadcastNotificationsOn()`
  defaults to. This is the foundation for anything targeted at a specific user rather
  than a room/DM scope. `Notification::notify(userId, category, data)` (`app/Models/
  Notification.php`) creates a row and broadcasts `NotificationCreated` on it in one
  call — that's the pattern to follow for any new notification-worthy event, not a
  bare `broadcast(new NotificationCreated(...))` at each call site. `$category` is
  stored as the `type` column and doubles as the `NotificationPreference` lookup key
  (see below) — the two are the same string today. Producers: `MessageController::
  notifyOtherParticipants` (every DM message, category `direct_message`, calls
  `Notification::notify()` directly — DMs are never focus-suppressed, see below) and
  `MessageController::notifyOtherRoomMembers` (every channel message, to every other
  room member — not just the channel, since membership is at the room level; category
  `room_message`, default `in_app` off so this is silent until a member opts in; skips
  `notify()` for a focused recipient — see next bullet) and
  `RoomInviteController::store` (category `room_invite`, only when the invited email
  belongs to an existing `User`). **A category with no producer wired up is a real
  trap** — see trap #24: `room_message`'s toggle existed in Settings for a while with
  nothing ever calling `notify()` for it, so turning it on visibly did nothing. Adding
  a category to `NotificationPreference::DEFAULTS` is necessary but not sufficient;
  something has to actually call `Notification::notify($userId, 'your_category', ...)`
  or the preference is inert. See trap #22 for why the table isn't just called
  `notifications`.
- **Channel-scoped notifications (`room_message` today, `mention` when it's added — see
  "## Planned work") are suppressed while the recipient is looking at the channel** —
  DMs are *not* covered by this, they always notify immediately regardless of anything
  on the DM page. `App\Support\ChannelFocus` is a pure cache wrapper (no table, no
  queue) tracking, per `(userId, channelId)`, whether the channel is open right now —
  a 30s-TTL cache key refreshed by a heartbeat from `hooks/useChannelFocus.ts` (POST
  `/api/channels/{channel}/focus` on mount + every 15s, POST `.../blur` on unmount).
  `MessageController::notifyOtherRoomMembers` calls `ChannelFocus::isFocused()`
  synchronously and skips `Notification::notify()` entirely for a focused recipient —
  no delay, no queue, no grace period; a version of this with a 30s "just navigated
  away" grace window (a queued job that re-checked focus at execution time) was tried
  and pulled back out for being clunkier than it was worth. Any future channel-scoped
  category should check `ChannelFocus::isFocused()` the same way before calling
  `Notification::notify()`.
- **`NotificationPreference` (`app/Models/NotificationPreference.php`) is a sparse
  override table, not a fully-seeded one** — a user with zero rows gets
  `NotificationPreference::DEFAULTS` for every category; a row only exists once they've
  changed something. `NotificationPreference::for($userId, $category)` resolves the
  effective `{email, in_app}` pair (override-or-default) and is what both
  `Notification::notify()` (gates the `in_app` row+broadcast) and
  `RoomInviteController::store` (gates the `Mail::send`) consult — there's no separate
  "send the email" pathway for other categories yet (`room_message`/`direct_message`
  defaults never need email, so none was built; see "## Planned work" before adding
  one). This override-or-default shape is deliberate: it's the same shape the planned
  room-level/channel-level layers are meant to slot into later (see "## Planned work").
  API: `GET/PUT /api/notification-preferences` (`NotificationPreferenceController`),
  frontend panel: `components/settings/NotificationPreferences.tsx`, rendered inside
  `Settings/Index.tsx`'s "Notifications" tab (`components/ui/Tabs.tsx` — generic, not
  settings-specific; `components/ui/Toggle.tsx` — plain button-based switch, no Radix
  Switch dependency).
- **`direct_message`'s `in_app` can never be turned off** —
  `NotificationPreference::IN_APP_LOCKED` (currently just `['direct_message']`) is
  enforced twice: `NotificationPreferenceController::update` rejects (422) a write that
  tries to disable it, and `NotificationPreference::for()` forces `in_app` to `true` in
  the *read* path regardless of what's stored, so a pre-existing bad row (e.g. from
  before the lock existed — see the migration-less nature of this rule, it's pure app
  code) can't slip through either. The frontend mirrors the list as
  `NOTIFICATION_IN_APP_LOCKED` (`types/index.ts`) purely to grey out the toggle
  (`NotificationPreferences.tsx` passes `disabled` to `Toggle`) — the backend rule is
  the actual enforcement, the frontend one is only cosmetic. Reason: notifications now
  live on the Messages page (`NotificationFeed`, see below) instead of a bell dropdown,
  and DMs are that page's *reason to exist* — hiding them entirely isn't a coherent
  state. `email` for `direct_message` is unaffected and freely toggleable.
- **The notification bell is gone — `NotificationFeed` (`components/messages/
  NotificationFeed.tsx`) lives inside `DM/Index.tsx`** (the "Messages" hub, below
  `DMSidebar`) instead, with filter chips for each category **the user currently has
  `in_app` enabled for** — a chip (and that category's notifications) disappears the
  moment the category is disabled, it doesn't just stop growing. This filtering happens
  twice, deliberately: `NotificationController::index` excludes disabled categories at
  the query level (`whereIn('type', $enabledCategories)`, computed via
  `NotificationPreference::for()` per category) so the data never leaves the server,
  and `NotificationFeed` filters again client-side against `fetchNotificationPreferences()`
  before building the chip list — belt-and-suspenders, but the backend one is what
  actually matters for privacy/correctness. `RoomRail` no longer renders a bell; it
  calls `useNotifications(currentUserId)` itself now, just for `unreadCount`, to draw a
  badge on the 💬 "Messages" icon (`href="/"`) — same hook `NotificationFeed` uses, so
  the two independently re-fetch/re-subscribe on every page (matches the existing
  presence-subscription pattern's redundancy, e.g. `subscribePresence()` — not worth
  deduplicating given how cheap this is).
- **`RoomPolicy::invite` is the one seam for "who can act on a room" beyond plain
  membership.** There's no roles/permissions system yet — it currently just checks
  `Room::hasMember`, same as everything else — but it exists specifically so a
  future roles system only has to change this one method instead of every
  controller that currently does `abort_unless($room->hasMember(...), 403)`
  inline. If you add another action that should eventually be role-gated (kick,
  ban, manage channels, ...), add it here as a new policy method rather than an
  inline membership check.
- **`InviteModal` surfaces two independent invite mechanisms** — don't conflate
  them:
  - A **shareable link** built from `Room.invite_code` (pre-existing;
    generated in `Room::booted()`) pointing at `GET /join/{code}`
    (`RoomController::join` — `GET`, not `POST`, since it's meant to be opened
    directly as a URL; see trap #20). No record is kept of who used it, it
    never expires, and it adds whoever visits it (redirecting through
    login/register first if they're a guest) — copy/paste only, no email
    involved.
  - **Per-email invites (`RoomInvite`) that always go through an emailed accept
    link**, whether or not the invited email already has an account — there's
    no "instantly add an existing user" path. `RoomInvite::accept(User $user)`
    does the actual join and is called from both `InviteController::show`
    (already logged in) and `AuthController::login`/`register` (via
    `session('pending_invite_token')`, set when a guest visits
    `/invite/{token}`) — see `## Adding things` for the shape of this if you
    need to touch it.
- **A `Conversation` row is only created when its first message is actually sent** —
  picking recipients (and optionally naming a group) in `NewConversationModal`
  (`components/messages/NewConversationModal.tsx`) is a client-side draft state with
  nothing persisted yet, mirroring picking recipients before hitting send in a mail
  client. `Api\ConversationController::store` (`POST /api/conversations`) is the one
  place that both resolves/creates the conversation *and* sends the first message,
  atomically — it deliberately duplicates `MessageController::storeConversation`'s
  message-creation tail (attach files, set `last_message_id`, hydrate, broadcast,
  notify) rather than sharing a trait, matching this app's no-`FormRequest`/
  no-shared-validation-trait convention elsewhere.
- **Users can only message people they share a room with** — friends are a planned but
  unbuilt future relaxation of this (see `## Planned work` if adding it). Enforced by
  `User::sharesRoomWith(string $otherUserId): bool` (`app/Models/User.php`), checked
  inline in `ConversationController` (not a policy — there's no existing `Conversation`
  resource yet at creation time to gate). `User::messageableUsers(?string $search)`
  backs `GET /api/conversations/candidates`, the search endpoint behind `UserPicker`.
- **Starting a conversation with exactly one person silently reuses an existing 1:1
  DM** if one exists — no prompt, it just opens the existing thread. **A group match
  is different: an exact-participant-set match on an existing `type: 'group'`
  conversation is never reused automatically** — `GET /api/conversations/resolve`
  (called by `NewConversationModal` right after picking recipients, before compose)
  surfaces it as a confirm step ("go to existing" vs. "create new anyway"), and
  `ConversationController::store` re-checks the same match server-side, returning
  `409 { message, existing }` unless the request carries `confirm_duplicate: true` —
  so the confirmation is enforced by the backend, not just a frontend nicety (same
  belt-and-suspenders shape as the `direct_message` `IN_APP_LOCKED` rule). Both
  `resolve` and `store` share a private `findExactMatch()` helper (`whereHas` per
  participant id + `withCount('participants')` + `firstWhere`) — portable across the
  sqlite test DB and postgres dev, no raw `HAVING`.
- **`ConversationController::addParticipants` (`POST
  /conversations/{conversation}/participants`) only works on `type: 'group'`**
  conversations — a 2-person `dm` has no "add a third person" path (that would be a
  dm→group conversion this app doesn't do). Gated by `ConversationPolicy::
  addParticipants`. It reuses the `direct_message` notification category (rather than
  inventing a new category or a realtime membership-change broadcast event) to nudge
  newly-added users — `DirectMessageNotificationData.message_id` is nullable for
  exactly this case (an "added to group" notification has no associated message).

### Voice

- **Room channel types are open-ended by design — `channel.type` is a free string
  (no DB enum), and text-capability is an allow-list, not a per-type special case.**
  `Channel::TEXT_CAPABLE_TYPES` (currently `['text', 'announcement']`) is the single
  source of truth for "does this channel type have a message thread"; a type not
  listed there — `voice` today, and any future custom type (a drawing channel, a
  music channel, ...) — gets no text chat *by default*, with no code change needed
  when a new type is introduced. `Channel::isTextCapable()` is what
  `MessageController::indexChannel`/`storeChannel` check (422 if not) and what
  `ChannelController::show` checks before querying messages at all (`messages` prop is
  `null`, not an empty paginator, for a non-text-capable channel —
  `ChannelPageProps.messages: PaginatedMessages | null` on the frontend, mirrored by
  `isTextCapableChannelType()`/`TEXT_CAPABLE_CHANNEL_TYPES` in `types/index.ts`).
  `Channels/Show.tsx` dispatches its main-pane content through a small
  `CUSTOM_CHANNEL_PANELS: Partial<Record<ChannelType, Component>>` registry keyed by
  type (today: `voice → VoiceChannelPanel`) rather than an `if (isVoice)` branch — a
  new non-text-capable type adds one entry there instead of another special case.
  `ChannelSidebar` groups channels by type using `CHANNEL_TYPE_ORDER`/
  `channelTypeLabel()`/`channelIcon()` (`types/index.ts`): known types get their
  preferred order/label/icon, and **any other type present still renders**, appended
  after the known ones with an auto-generated label (`"Drawing" → "Drawing
  Channels"`) — a channel of an unlisted type used to simply vanish from the sidebar
  before this, which would have been a bad failure mode for a scalable type system.
  `RoomController::store` creates both a `general` (text) and a `Voice Chat` (voice)
  channel for every new room — there's still no general "create an additional
  channel" endpoint/UI (that's deferred, same as before this feature), so this is the
  only way a voice channel comes into existence today; a future custom-type channel
  would need the same kind of seeding, or the deferred create-channel UI, to exist at
  all. **Conversations (dm/group) are explicitly not part of this — they stay the one
  hybrid text+voice type, see the next bullet.**
- **Every dm/group `Conversation` always has voice available — it's a first-class,
  always-on capability, not an optional add-on and not a separate entity.** "Hybrid
  channel" (text + voice together) describes every `Conversation`, not a new model —
  the `Conversation`/`conversation_participants` tables, `ConversationController`,
  `ConversationPolicy`, and every convention above are unchanged. `VoiceBar`
  (`components/voice/VoiceBar.tsx`) renders unconditionally above `MessageList`/
  `MessageInput` in `DM/Show.tsx` for exactly this reason — there's no per-conversation
  flag to check before showing it.
- **`voice_mode` (`auto | direct | relay`) lives on `channels` and `conversations`
  directly — it is a property of the call, not a per-user preference.** Every
  participant in a given channel/conversation's call gets the same behavior. `auto`
  supplies both STUN and TURN servers with the default `iceTransportPolicy: 'all'` —
  ordinary ICE candidate priority already prefers a direct P2P pair over a relayed one
  and falls back to relay automatically per-pair when direct fails, so "prefer P2P,
  fall back to TURN" needs no custom logic. `direct` strips TURN servers from the ICE
  config entirely (a pair that can't connect directly just doesn't connect — see
  `services/webrtc.ts`'s `isTurnUrl` filter). `relay` sets
  `iceTransportPolicy: 'relay'`, forcing every pair through TURN. There is currently no
  UI to change `voice_mode` after creation — same tier as `is_nsfw`/`slow_mode_seconds`,
  a column with a sensible default and no edit endpoint yet.
- **SDP offer/answer, ICE candidates, and call membership all travel as Reverb client
  events ("whisper"), not `ShouldBroadcast` events — a deliberate exception to this
  app's one broadcasting convention.** Whisper payloads are relayed peer-to-peer by
  the Reverb server itself and never reach PHP, the queue, or Redis, which matters
  because voice signaling is latency-sensitive in a way message/reaction broadcasts
  aren't. There is no `App\Events\Voice*` class and no "send a signal" API route —
  `voice.channel.{id}`/`voice.conversation.{id}` (`routes/channels.php`) are dedicated
  **presence** channels (not a reuse of `channel.{id}`/`conversation.{id}`, which are
  the text-message channels — coupling voice onto those would tie two unrelated
  concerns to one socket subscription). `.whisper('signal', ...)`/
  `.listenForWhisper('signal', ...)` is the SDP/ICE signaling transport — a `signal`
  payload carries a `to` user id; every other participant receives every signal and
  filters client-side by `to === myUserId`, simpler than a channel per pair and fine
  at the mesh sizes P2P voice already implies.
- **Presence-channel *subscription* is not the same thing as being "in the call" —
  this was a real bug, not just a hypothetical.** Once ChannelSidebar started
  subscribing to a voice channel's presence channel too (just to observe and display
  who's in it), every room member simply *browsing any channel in that room* showed
  up as an active call participant for every voice channel, because Reverb presence
  membership is exactly "who is subscribed," and subscribing-to-observe is
  indistinguishable from subscribing-to-actually-join at the protocol level. Fixed by
  tracking call membership as its own explicit, whispered state, entirely separate
  from presence subscription:
  - `useVoice.selfParticipant` (`stores/index.ts`) is non-null exactly while *this*
    browser tab has actually joined a call (set by `services/webrtc.ts`'s
    `joinVoice()`, cleared by `reset()` on leave) — this is the one place "am I
    really in this call" is knowable, and it's what distinguishes a participant from
    an observer.
  - On joining, `webrtc.ts` whispers a `call-state` event
    (`{userId, displayName, avatarUrl, muted, inCall: true}`) announcing itself, and
    on leaving whispers `{userId, inCall: false}`. `useVoiceRoster` (the shared,
    observable "who's actually in this call" store used by both ChannelSidebar and
    the call's own UI) is populated **exclusively** by these `call-state`
    announcements — never by raw `.here()`/`.joining()` presence-membership events.
  - Whisper events never reach their own sender, and a brand-new subscriber (observer
    or someone about to join for real) needs to learn who's *already* actually in the
    call, not just who subscribes going forward — so `services/voicePresence.ts`'s
    shared `.joining()` handler checks `useVoice.getState()` on every new arrival and,
    if *this* client is itself an active participant of *that* scope, re-whispers its
    own `call-state`. This is safe to do on every arrival (participant counts in a
    P2P voice channel are small) and requires no event history/replay.
  - `.leaving()` (a real presence-membership event, fired on actual socket
    disconnect) is kept as a pure safety net that removes a participant from
    `useVoiceRoster` regardless of whether they got to whisper an explicit "leaving"
    `call-state` first — covers a crashed tab/dropped connection.
- **The roster ("who's actually in this call," as opposed to who's merely observing)
  is shared, observable state, keyed by `${scopeType}.${scopeId}` — decoupled from
  actually joining the call — and is what powers both ChannelSidebar's participant
  list and the call mesh itself.** `services/voicePresence.ts`'s
  `subscribeVoiceRoster(scopeType, scopeId)` is a ref-counted wrapper around
  `services/echo.ts`'s `joinVoiceChannel()`: the *first* subscriber for a given scope
  actually joins the presence channel and wires the `.joining()`/`.leaving()`/
  `call-state`/`mute-state` handling described above (once); every subsequent
  subscriber for that same scope just increments a ref count and gets the same
  channel object back — this also sidesteps a presence channel's `.here()` callback
  only ever firing once, at the moment its own subscription succeeds (Echo/Pusher
  don't replay it for a callback registered afterward — see trap #32), which is why
  this file no longer calls `.here()` at all rather than trying to work around it.
  Two independent things call `subscribeVoiceRoster`: `ChannelSidebar` (via
  `hooks/useVoiceChannelRoster.ts`) for read-only display of everyone in a voice
  channel, whether or not the viewer has joined — see `components/voice/
  VoiceChannelSidebarItem.tsx` — and `services/webrtc.ts`'s `joinVoice()` for the
  actual call, which reads the current `useVoiceRoster` snapshot and then reconciles
  its `RTCPeerConnection` map against that store on every change (`reconcilePeers`),
  opening a connection for a roster id it doesn't have one for yet and closing one for
  an id no longer in the roster. This also means the call's own main-pane view
  (`VoiceChannelPanel`/`VoiceBar`, via `useVoiceChannel`) shows participants who are
  already in the call before you've clicked Join, not just after.
- **Glare is resolved with the Perfect Negotiation pattern** (the standard WebRTC
  approach — see MDN/W3C's reference implementation — not an ad-hoc "joiner offers,
  incumbent answers" rule). Every peer runs identical negotiation code
  (`onnegotiationneeded` calls the argument-less `pc.setLocalDescription()`); glare is
  resolved by comparing user ids to decide which side is "polite" and backs off on an
  offer collision (`services/webrtc.ts`'s `isPolite`/`ignoreOffer`). `RTCPeerConnection`
  and `MediaStream` objects live in `webrtc.ts`'s own module-level `Map`s — never in a
  Zustand store. `useVoice` (scope/selfMuted/connectionState) holds only the current
  user's own call state; `useVoiceRoster` (see above) holds the shared, serializable
  participant list — don't merge them back into one store, the whole point of the
  split is that the roster is meaningful without having joined.
- **Mic/speaker device choice is scoped per `(user_id, client_id)`, not just per user**
  — `client_id` is a `crypto.randomUUID()` generated once and persisted in
  `localStorage` (`services/clientId.ts`), representing "this browser on this
  machine," since the same user picks different devices on their laptop vs desktop.
  `VoiceDevicePreference` (`voice_device_preferences` table) has no `DEFAULTS` const
  unlike `NotificationPreference` — a `null` device id legitimately means "use the
  browser's current default," there's nothing to fall back to.
- **`components/settings/AudioSettings.tsx` keeps "pick a device" and "test a device"
  as two independent affordances — don't re-merge them.** The input/output `<select>`s
  always render; they're never gated behind a permission or test button (device
  *labels* are blank until mic permission is granted, so a separate small "Grant
  Access" prompt appears above the pickers only when needed — see
  `navigator.mediaDevices.enumerateDevices()`'s empty-`label` behavior). "Test
  Microphone" is a second, separate section: it acquires the currently-selected input
  device, feeds it through a `Web Audio` `AnalyserNode` to drive a live level meter
  (`role="progressbar"`), and loops it back through an `<audio>` element routed to the
  selected output device (via the non-standard-but-widely-supported
  `HTMLMediaElement.setSinkId`, feature-detected) — so the user actually hears
  themselves, not just sees a number. Starting a test also refreshes the device list
  (covers the case where "Start Test" is the very first permission grant, without
  requiring "Grant Access" to have been clicked first). A real sensitivity-threshold
  / voice-activity feature is still deferred (see `## Planned work` before adding
  one) — this meter is read-only feedback, not a mute/highlight trigger.
- **TURN credentials are ephemeral, generated per-request via coturn's
  `use-auth-secret` REST scheme** (`VoiceIceServersController`, HMAC-SHA1 of a
  `{expiry}:{userId}` username, keyed by `config('turn.secret')`) — not a
  long-lived username/password baked into the frontend. The endpoint isn't scoped to
  any room/channel/conversation (unlike almost every other controller in this app) —
  there's no membership check beyond auth, since credentials are identical for every
  call a user joins and expire on their own (`config('turn.credential_ttl')`).

## Testing

**Backend — PHPUnit, no Pest.** `phpunit.xml` points every test run at an
in-memory SQLite DB (`DB_CONNECTION=sqlite`, `DB_DATABASE=:memory:`) with
`BROADCAST_CONNECTION=null`, `QUEUE_CONNECTION=sync`, `SESSION_DRIVER=array`,
`CACHE_STORE=file` — the suite never touches the dev Postgres/Redis data and
needs nothing running beyond the `app` container.
- Every domain model has a matching factory in `database/factories/` and uses
  `HasFactory`. Add both together for any new model.
- Feature tests use `RefreshDatabase` and go through the real HTTP kernel
  (`$this->post(...)`, `->postJson(...)`) rather than calling controllers
  directly — that's what actually exercises route middleware/authorization.
- Assert broadcasts with `Event::fake([SomeEvent::class])` +
  `Event::assertDispatched(...)`; don't try to assert on the actual socket
  payload since the suite runs on the `null` broadcaster.
- `Inertia::render` assertions (`assertInertia(fn (Assert $page) => ...)`) need
  `config/inertia.php` to point at the real `resources/js/pages` (lowercase) —
  see traps below if this starts failing with "component file does not exist".
- To test `routes/channels.php` authorization (i.e. hit `/broadcasting/auth`
  for real), see `tests/Feature/Broadcasting/ChannelAuthTest.php` — the null
  broadcaster can't exercise it, so that test swaps in the `reverb` driver
  with throwaway credentials and re-requires `routes/channels.php`.
- Any test touching `App\Support\ChannelFocus` (directly or via a controller that uses
  it) should `Cache::flush()` in `setUp()` — it has no `RefreshDatabase`-style
  auto-reset since it's not backed by the database, and stale keys from an earlier test
  in the same run will otherwise leak in.

**Frontend — Vitest + Testing Library + jsdom.** Config lives in
`vitest.config.ts` (not merged into `vite.config.ts`, to keep the dev-server
config separate from test config). Tests are co-located as `*.test.ts` /
`*.test.tsx` next to the file they cover, not in a parallel `__tests__` tree.
- Mock `@/services/api` and `@/services/echo` with `vi.mock(...)` in
  component/hook tests — never let a test hit real `axios` or construct a
  real `Echo` instance.
- Zustand stores are plain modules; reset state with `useStore.setState(...)`
  in `beforeEach` rather than remounting providers.
- `@testing-library/jest-dom` matchers are loaded globally via
  `resources/js/test/setup.ts` — no per-file import needed.

**Manual/live verification (browser-driven changes, "verify this works").** No
`chromium-cli`/Playwright/other browser-automation tool is set up in this repo or its
sandbox — don't spend a turn checking for one each session, it isn't there. Go straight
to driving the real `docker compose` stack over HTTP instead, which is just as capable
of proving a change works and needs nothing installed:
- Log in with `curl` against the live `app` container (`http://localhost:8000`) using a
  cookie jar (`-c cookies.txt -b cookies.txt`) — fetch `/login` first for the
  `XSRF-TOKEN` cookie, URL-decode it, `POST /login` with it as the `X-XSRF-TOKEN`
  header. See trap #27 below for the one non-obvious header this needs beyond that.
- Drive `/api/*` endpoints and Inertia page loads with the resulting cookie jar; for
  Inertia pages, `grep`/`python3 -m json.tool` the `data-page` attribute's JSON instead
  of trying to render React server-side.
- Prefer throwaway data over the seeded `alice`/`bob` accounts when a test needs to
  mutate state (register fresh users via `POST /register`, create a room via
  `POST /rooms`, join via `GET /join/{code}`) — clean it up with a `docker compose exec
  postgres psql` `DELETE` afterward so the dev DB returns to exactly what it was.
  Never guess a real human's account password to "test as them."
- This is a real substitute for a browser, not a lesser one — it exercises the actual
  routes/middleware/Postgres, catching the same class of bugs a screenshot would.
  Report it as what it is (HTTP-level verification) rather than implying a browser
  was driven, but don't withhold it waiting for tooling that doesn't exist here.

## Traps already hit — do NOT reintroduce

1. **`config/app.php` must have NO `'providers'` key.** Since Laravel 11's
   bootstrap-based app structure, an empty `providers` array disables ALL
   framework providers → "Target class [files] does not exist". Providers
   live in `bootstrap/providers.php`.
2. **`/api/*` needs stateful Sanctum.** `bootstrap/app.php` prepends
   `EnsureFrontendRequestsAreStateful` to the `api` middleware group, and axios
   sets `withCredentials` + `withXSRFToken`. Without both, every `/api` call 401s.
3. **Model table names.** Laravel's pluralizer treats "Emoji" as already plural.
   `CustomEmoji` needs `protected $table = 'custom_emojis'`. Check the pluralizer
   before trusting a convention-derived table name.
4. **Named volumes overlay bind mounts.** The whole project is bind-mounted
   (`.:/var/www/html`), which would clobber the image's `vendor/`, so `vendor`,
   `storage/framework`, `storage/logs`, `storage/app`, `bootstrap/cache`,
   `node_modules` are all named volumes. Named volumes mount root-owned, so the
   entrypoint chowns storage + bootstrap/cache to `www-data` every boot.
5. **`@apply group` is illegal.** `group` is a marker class; apply it in JSX, not
   in a CSS `@apply` rule.
6. **Flex sidebars need `min-h-0`** on the scrolling `<nav>` or the UserPanel gets
   pushed off-screen.
7. **No Horizon.** It needs `pcntl` and broke on the Windows host. Queues run via
   plain `php artisan queue:work` in the `worker` service.
8. **Dockerfile composer stage** uses `php:8.4-cli-alpine` + composer binary +
   `--ignore-platform-reqs --no-scripts`; `package:discover` runs in the entrypoint,
   not at build (no booted app at build time). `pecl redis` needs
   `autoconf g++ make` (added then `apk del`).
9. **Seeding is never automatic.** The entrypoint does not seed. Fresh builds are
   a clean slate; seed only on explicit request.
10. **`pdo_sqlite`/`sqlite3` are already in the PHP image** (bundled with
    `php:8.4-fpm-alpine`) — no Dockerfile change was needed to add the test
    suite's in-memory SQLite connection in `config/database.php`.
11. **Composer only lived in the build stage.** `vendor/` is a named volume
    populated `--no-dev` at image build time, and with no local PHP there was
    no way to install dev-only packages (phpunit, mockery, collision) short of
    a full rebuild. The Dockerfile now also copies the composer binary into
    the runtime stage, so `docker compose exec app composer ...` works
    directly for future dependency changes.
12. **`config/inertia.php` didn't exist**, so Inertia fell back to its package
    defaults: `page_paths` pointed at `resources/js/Pages` (capital P — this
    repo uses lowercase `pages`) and `ssr.enabled` defaulted to `true` with no
    SSR bundle or service anywhere in the stack. The first broke
    `assertInertia()->component(...)` in every test ("component file does not
    exist"); the second meant every page render silently attempted (and
    swallowed the failure of) an SSR HTTP call. `config/inertia.php` now pins
    the real page path and turns SSR off explicitly.
13. **`Broadcast::channel()` registers against whatever the *default*
    broadcaster is at the moment `routes/channels.php` runs** (app boot), not
    at request time. Switching `config(['broadcasting.default' => ...])`
    later (e.g. mid-test) does not move the already-registered channel
    closures onto the new driver — you have to re-`require
    base_path('routes/channels.php')` after switching, or the new driver's
    channel registry is empty and every `/broadcasting/auth` call 403s with
    "no channel matched," authorized or not.
14. **Laravel 13 requires PHP >= 8.3.** The security fixes for the CRLF-in-email-rule
    and signed-URL-path-confusion advisories were never backported to the 11.x
    branch (11.55.0 was still the latest 11.x release and still vulnerable), so
    fixing them meant a real major-version upgrade, not a constraint bump. Both
    Dockerfile stages now use `php:8.4-*-alpine`; `laravel/sanctum`,
    `laravel/reverb`, and `inertiajs/inertia-laravel` didn't need version bumps,
    just a `composer update`. `HasUuids` also now generates UUIDv7 (time-ordered)
    instead of UUIDv4 as of Laravel 12 — ids still work everywhere the same way,
    but don't be surprised if they sort chronologically.
15. **Vitest 4's `vi.fn().mockImplementation(fn)` respects real constructor
    semantics** — if the mocked module is invoked with `new` (e.g. mocking
    `laravel-echo`'s default export), the implementation must be a `function`,
    not an arrow function, or `new` throws "is not a constructor". This broke
    `echo.test.ts`'s `laravel-echo` mock when bumping vitest 2 → 4 (`npm audit
    fix --force`, needed to clear the esbuild/vite dev-server advisories since
    they aren't fixed on any vite version vitest 2 can depend on).
16. **`@routes` in `app.blade.php` with no Ziggy installed renders as literal
    text**, not a directive. Blade leaves an unrecognized `@word` as plain text
    in the compiled view; because it sat in `<head>`, the HTML5 parser's error
    recovery moved that stray text node to the *start of `<body>`* (text tokens
    aren't allowed in "in head" mode), pushing every layout down by one line
    and clipping whatever sat at a flex container's bottom edge (`body` has
    `overflow-hidden`, so the overflow was silently cut off instead of
    scrolling). This repo doesn't use Laravel's `route()` JS helper anywhere,
    so the fix was deleting the directive, not installing `tightenco/ziggy`.
    If `route()` ever gets used from the frontend, install Ziggy properly
    instead of re-adding a bare `@routes`.
17. **`config/mail.php` didn't exist either** (same shape as trap #12) — no mail
    had ever been sent from this app. Added it hand-written, pointed at a new
    `mailpit` docker-compose service (SMTP on 1025, web UI on `localhost:8025`)
    as the dev mailer, so invite emails are visible without any real SMTP
    credentials. `phpunit.xml` pins `MAIL_MAILER=array` so the test suite never
    tries to reach it (tests use `Mail::fake()` regardless). `MAIL_MAILER` is
    the switch for which mailer is active — `mailpit` (dev default), `smtp`
    (any real provider), `ses`, `log`, `array` are all defined in
    `config/mail.php`; see the README's `## Email` table before adding another.
18. **The `worker` container is a long-running daemon (`queue:work`) that reads
    `.env` once at process start**, unlike `app`/`nginx` requests which
    re-bootstrap (and re-read `.env` via dotenv) on every request. Adding new
    env vars (e.g. the `MAIL_*` ones for trap #17) to `.env` does nothing for
    already-running queue workers — `docker compose restart worker` is required,
    or queued jobs that depend on the new vars (like `RoomInviteMail`, which
    `implements ShouldQueue`) fail silently into `failed_jobs` using stale
    config. Same would apply to `reverb` if its config vars changed.
19. **Laravel 11+'s zero-config skeleton means `config/mail.php` and
    `config/services.php` are silently deep-merged with the framework's own
    default copies of those files** (`LoadConfiguration::mergeableOptions()` —
    applies to `mail.mailers`, plus `auth`, `broadcasting.connections`,
    `cache.stores`, `database.connections`, `filesystems.disks`,
    `logging.channels`, `queue.connections`). This is *why* `mailers.postmark`
    / `mailers.resend` / `mailers.sendmail` / `mailers.failover` /
    `mailers.roundrobin` are selectable via `MAIL_MAILER` even though this
    repo's `config/mail.php` never defines them — Laravel's own
    `vendor/laravel/framework/config/mail.php` supplies them, keyed in
    alongside ours. It also means the framework's default `services.ses` (which
    reads `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY` — the **R2** credentials
    in this app) would be live if `config/services.php` didn't explicitly
    override `ses` with the dedicated `MAIL_SES_*` vars. Don't assume a
    hand-written config file is the complete picture for these specific
    keys — check `php artisan config:show <file>` if a mailer/guard/disk/queue
    connection seems to exist that nobody defined.
20. **`/join/{code}` was `POST`-only (`RoomController::join`) with no frontend
    caller** — only `RoomJoinTest` hit it directly via `->post(...)`. Once
    `InviteModal` started building it into a real copy/paste URL
    (`invite_code`-based), pasting or clicking that link is a browser `GET`,
    which 405'd against a `POST`-only route. It's now `Route::get('/join/{code}',
    ...)`. Any route meant to be a *link* a human opens (as opposed to one an
    in-app form/axios call submits) needs to accept `GET` — check who's
    actually going to hit it before picking a verb. This also means
    `AuthController::register()` now uses `redirect()->intended('/')` (matching
    `login()`) instead of a hardcoded `redirect('/')`, so a brand-new user who
    follows a `/join/{code}` link while logged out completes the join after
    registering too, not just after logging in.
21. **`REVERB_HOST` cannot be one value for both the browser and the app/worker
    containers.** The browser (via `VITE_REVERB_HOST` → `services/echo.ts`) needs
    `localhost`, since it's reaching Reverb through the port docker-compose publishes
    to the host. But the `app`/`worker` containers use the *same-named* `REVERB_HOST`
    in `config/broadcasting.php`'s `reverb` connection to PUBLISH events — that's an
    HTTP call from inside the `app`/`worker` container's own network namespace, where
    `localhost` means itself, not the `reverb` service. With both vars pointing at
    `localhost` (the original, pre-decoupling default), every broadcast — messages,
    reactions, notifications — silently failed with `Pusher error: cURL error 7:
    Failed to connect to localhost:8080` on the queue worker (visible in
    `storage/logs/laravel.log` and `php artisan queue:failed`), while the HTTP request
    that triggered it still returned 200 — so this reads as "real-time doesn't work"
    with no error surfaced anywhere the user would look. Fixed by decoupling them:
    `REVERB_HOST=reverb` (the docker-compose service name, server-side) and
    `VITE_REVERB_HOST=localhost` hardcoded (browser-facing), no longer interpolated
    from the same var. If real-time delivery of *anything* silently stops working,
    check `queue:failed` / `storage/logs/laravel.log` for this exact cURL error before
    assuming the bug is in application code — and remember `docker compose restart
    worker` after touching either var (trap #18).
22. **The `user_notifications` table is deliberately not named `notifications`.**
    Laravel's own `Illuminate\Notifications\Notifiable` trait (used by `User` for
    password-reset emails) defines a `notifications()` MorphMany that expects a
    `notifications` table with `notifiable_type`/`notifiable_id` morph columns — a
    different shape than this app's simple `user_id`-keyed one. Naming this app's
    table `notifications` would silently collide the day anything calls
    `$user->notify(...)` with the `database` channel. The model (`app/Models/
    Notification.php`) sets `protected $table = 'user_notifications'` and the `User`
    relation is `appNotifications()`, not `notifications()`, so it doesn't shadow the
    trait method either. Same shape of trap as #3 (`CustomEmoji` pluralization) — a
    Laravel-reserved name looking available when it isn't.
23. **`app`, `worker`, and `reverb` build from the same `docker/app/Dockerfile` but
    are three separate images** — rebuilding one (e.g. `docker compose up -d --build
    app`) does not rebuild the others. `reverb` drifted to a stale PHP 8.2 image
    while `app`/`worker` were rebuilt onto PHP 8.4 (trap #14); it kept running fine
    because the long-lived `reverb:start` process doesn't reload anything, but the
    moment it was restarted it crash-looped on `Composer detected issues in your
    platform: ... require PHP >= 8.4.1. You are running 8.2.32` — the container's own
    PHP binary against the (named-volume, shared) `vendor/` built for 8.4. Fixed with
    `docker compose build reverb && docker compose up -d reverb`. If any single
    service is rebuilt or its base image bumped, rebuild all three
    (`docker compose up -d --build app worker reverb`) or the others will look fine
    until their next restart.
24. **A `NotificationPreference` category with no producer is silently inert.** When
    `room_message` (Room Messages) was added to `NotificationPreference::DEFAULTS` and
    the Settings UI, no controller anywhere ever called `Notification::notify($userId,
    'room_message', ...)` — the toggle rendered, saved, and read back correctly, but
    turning it on had zero effect: a user could enable it, have another account send a
    channel message, and see nothing, with no error anywhere because nothing was
    actually broken, just never wired up. `MessageController::storeChannel` now calls
    `notifyOtherRoomMembers` (mirroring `notifyOtherParticipants` for DMs) to fix this.
    The general lesson: adding a category to `DEFAULTS` + the frontend `CATEGORIES`
    list makes it *visible and configurable*, not *functional* — always add or point to
    the actual `Notification::notify()` call site in the same change, and check for it
    when a "notifications aren't arriving" report names a specific category.
25. **Vitest's default `forks` pool is unstable inside the `vite` container** —
    workers randomly segfault or time out (`Worker exited unexpectedly` / `Timeout
    terminating forks worker`), a different test file each run, with no code change
    involved; a failed run tells you nothing about correctness. `vitest.config.ts` now
    pins `pool: 'threads'`, which doesn't fork a child process per file and has run
    clean repeatedly where `forks` failed roughly 1 run in 2. If `npm run test` ever
    reports a file-level crash (not a normal assertion failure) rather than a specific
    failing test, suspect this class of issue again before suspecting the test itself
    — rerun with `npx vitest run --pool=threads` to check whether it's real.
26. **`assertJsonFragment` checks that each field's value appears *somewhere* in the
    response, not that they all appear *together* on the same element.** A test
    asserting `assertJsonFragment(['category' => 'direct_message', 'email' => true,
    'in_app' => false])` against a 3-element array response passed even when no single
    element actually had that combination — `email: true` existed on a *different*
    category's entry, `in_app: false` on yet another. This produced a false-positive
    test (`tests/Feature/Notifications/NotificationPreferenceTest.php`) that kept
    passing after a behavior change made its asserted values factually wrong. For an
    array-of-objects response where you need to confirm several fields co-occur on one
    specific element, decode the response and compare that element directly (e.g.
    `collect($response->json())->firstWhere('category', 'x')`) instead of
    `assertJsonFragment` — reserve `assertJsonFragment` for single-field checks or
    fragments unique enough that cross-element false positives can't happen.
27. **A `curl`-driven session against `/api/*` 401s with `{"message":"Unauthenticated."}`
    even with a valid, freshly-logged-in `communityhub_session` cookie in the jar — unless
    the request also carries a `Referer` (or `Origin`) header matching one of
    `SANCTUM_STATEFUL_DOMAINS` (`config/sanctum.php`; defaults include
    `localhost:8000`).** A real browser sends this automatically on every request, so
    it's invisible in normal frontend dev, but `curl -b cookies.txt
    /api/conversations/candidates` with no `Referer` silently falls through to
    Sanctum's stateless (bearer-token) guard, finds no token, and 401s — with the
    session cookie itself perfectly valid, which makes it look like the login didn't
    work when it did. Add `-H "Referer: http://localhost:8000/"` to any manual-curl
    verification session (see `## Testing`'s "Manual/live verification" section) and
    it resolves the same way a browser's request would.
28. **Changing `DB_DATABASE`/`DB_USERNAME` in `.env` does not rename anything inside an
    already-initialized Postgres data volume** — the official `postgres` image only
    runs its `POSTGRES_DB`/`POSTGRES_USER` bootstrap on a *fresh* (empty)
    `postgres_data` volume; against an existing volume those vars are simply ignored on
    restart. Since the `app`/`worker` containers re-read `.env` on every request (no
    config cache in dev — see trap #18), editing those two vars against a live volume
    immediately breaks the DB connection (wrong role/database name) until the Postgres
    side is made to match. To rename in place without losing data: connect as the
    existing superuser role and run `ALTER DATABASE old_name RENAME TO new_name;` /
    `ALTER USER old_name RENAME TO new_name;` — but Postgres refuses to rename the
    *session user you're currently connected as*, and refuses to rename a database
    with other active connections, so do it via a throwaway second superuser role
    (`CREATE ROLE tmp WITH SUPERUSER LOGIN PASSWORD '...'`, connect as `tmp`,
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname =
    'old_name'` to clear the app container's connection, then the two `ALTER`
    statements, then `DROP ROLE tmp` connected as the renamed superuser instead).
    The alternative — `docker compose down -v` to drop the volume and let bootstrap
    recreate it under the new name — is simpler but discards all dev data, which
    matters less here since `## Run commands` already treats the dev DB as disposable
    (empty-by-design, seed-on-request), but still confirm with whoever's running the
    stack before doing it.
29. **Adding the `coturn` service's wide relay port range (`49160-49200/udp`, 41 ports)
    to a *running* `docker compose` stack broke host→container port forwarding for
    every other service** — nginx, vite, mailpit, reverb all stopped responding on
    their published ports (`curl` got `Connection reset by peer` on all of them, even
    ones untouched by the change), while container-to-container traffic on the same
    bridge network kept working fine (confirmed via `docker compose exec vite wget
    http://nginx:80/...` succeeding) — i.e. purely a host-side NAT/iptables problem,
    not an application or container-health one. Stopping/removing the `coturn`
    container did **not** fix it, and neither did `docker compose down && up -d`
    (recreating the containers/network) — the corruption was at the Docker daemon's
    iptables level, requiring a full `sudo systemctl restart docker` (or equivalent)
    to reprogram NAT rules cleanly. If host-published ports stop responding right
    after touching `docker-compose.yml`'s `ports:` (especially adding a large range),
    suspect this class of issue before suspecting the app — check that
    container-to-container requests still work as the differentiator, and know that a
    daemon restart (not just a compose cycle) may be the actual fix.
30. **`channels.type`/`conversations.voice_mode` have no DB-level enum constraint** —
    same shape as trap #3/#22's "looks safe by convention, isn't actually enforced."
    Before voice channels existed, nothing stopped `MessageController` from accepting
    a message against any channel regardless of type. Fixed as an allow-list, not a
    per-type special case — see `Channel::TEXT_CAPABLE_TYPES`/`isTextCapable()` in
    Conventions "Voice" — specifically so the *next* new channel type (a drawing
    channel, a music channel, ...) is text-incapable by default too, without anyone
    needing to remember to add another `abort_if($channel->type === '...')` check for
    it. Any new message-adjacent or channel-adjacent endpoint should still assume
    `Channel::find()`/`Channel $channel` route binding can resolve to any type and
    guard explicitly (via `isTextCapable()` or a new equivalent) if it only makes
    sense for some.
31. **There is deliberately no `VITE_TURN_*` env var pair, unlike `REVERB_HOST`/
    `VITE_REVERB_HOST` (trap #21).** Reverb's browser-facing host has to be baked into
    the JS bundle at build time (Echo connects directly on page load), but TURN
    credentials are ephemeral and fetched at runtime from an authenticated endpoint
    (`GET /api/voice/ice-servers`) — the browser gets the host from that JSON
    response, not `import.meta.env`. `TURN_PUBLIC_HOST` is still the browser-facing
    value (`localhost` in dev) even though it's read by PHP, not Vite — same
    reasoning as `VITE_REVERB_HOST`, different consumer. Don't "fix" the apparent
    asymmetry by adding a `VITE_TURN_HOST` — it would be dead code the bundle never
    reads.
32. **A presence channel's `.here()` callback only fires once, at the moment its own
    subscription succeeds — Echo/Pusher don't replay it for a callback registered
    afterward.** Early voice code had both `ChannelSidebar` (wanting a read-only
    roster) and `services/webrtc.ts` (wanting to actually join the call) independently
    call `services/echo.ts`'s `joinVoiceChannel()` for the same `voice.channel.{id}`.
    Echo/Pusher dedupe the underlying subscription by channel name, so whichever
    caller subscribed *second* got the same channel object back — but its own
    `.here()` handler registered on an event that had already fired for the first
    caller, so it silently never received the initial member list. In practice this
    meant: open a room (ChannelSidebar subscribes first for the roster display), then
    click Join Voice — and `webrtc.ts`'s peer-connection setup would see an empty
    roster forever, connecting to no one, with no error anywhere. Fixed by
    `services/voicePresence.ts`'s ref-counted `subscribeVoiceRoster()` — every event
    handler for a scope's presence channel is bound exactly once, centrally, no matter
    how many consumers call it; every consumer reads the resulting shared state
    instead of registering its own presence callbacks (see Conventions "Voice", and
    trap #33 for why `.here()` isn't actually one of the handlers bound there anymore).
    If a future feature wants to observe a voice scope's presence directly, it must go
    through `subscribeVoiceRoster()`, never call `echo.ts`'s `joinVoiceChannel()` a
    second time for the same scope.
33. **Presence-channel *subscription* is not "being in the call" — don't conflate
    them, that was a real bug here.** The very first version of the sidebar roster
    feature populated `useVoiceRoster` directly from `.here()/.joining()/.leaving()`
    — i.e., from raw presence membership. That's wrong: `ChannelSidebar` subscribes to
    every voice channel's presence channel purely to *observe*, with no mic and no
    `RTCPeerConnection` involved, and presence membership can't distinguish that from
    someone who actually joined. The visible symptom: every member simply browsing
    any channel in a room showed up as an active participant in every voice channel in
    that room, whether or not they'd ever clicked Join. There is no fix that keeps
    deriving the roster from presence membership — observing and joining are
    fundamentally the same subscription at the Reverb/Pusher protocol level. The fix
    was to track "actually in the call" as its own explicit, whispered state
    (`call-state`, carrying `inCall: true|false`), completely independent of presence
    subscription — see the Conventions "Voice" bullet on this. If a future
    voice-adjacent feature needs to know who's *really* in a call (not just who's
    watching), it must key off `useVoiceRoster` (populated only by `call-state`) or
    `useVoice.selfParticipant` (this client's own status) — never off a presence
    channel's raw member list.

## Adding things — quick recipes

- **New model + table:** migration with UUID PK → model with `HasUuids` (+ explicit
  `$table` if the pluralizer is wrong) → relations both directions.
- **New realtime action:** Api controller mutates → create/broadcast a
  `ShouldBroadcast` event `(scopeType, scopeId)` with `->toOthers()` → add a
  `.EventName` listener in `services/echo.ts` that updates the Zustand store.
- **New page:** Web controller returns `Inertia::render('Folder/Name', props)` →
  `resources/js/pages/Folder/Name.tsx` → add the route in `routes/web.php` →
  add the prop interface in `types/index.ts`.
- **New /api endpoint:** add under the `auth` group in `routes/api.php`, add the
  axios wrapper in `services/api.ts` (never call axios inline in a component).
- **New feature, either side:** add the Feature/Vitest test alongside it (see
  `## Testing`), then update the relevant section of this file — directory
  map, conventions, or traps — in the same change.
- **New action that should eventually be role-gated:** add a method to the
  relevant model's `app/Policies/*Policy.php` (see `RoomPolicy::invite`) rather
  than an inline `abort_unless($room->hasMember(...))` — gives a future roles
  system one place to change instead of every controller.
- **New outbound email:** add a `Mailable` in `app/Mail/` (`implements
  ShouldQueue` so it goes through the `worker` container, not the request), a
  plain Blade view in `resources/views/emails/`, send via
  `Mail::to($x)->send(new SomeMail(...))`. Check it lands in Mailpit
  (`localhost:8025`) — and remember to `docker compose restart worker` after
  changing any `MAIL_*` env var (see trap #18).
- **New notification category — two halves, both required (see trap #24 for what
  happens if you skip the second):**
  1. *Make it configurable:* add it to `NotificationPreference::DEFAULTS`
     (app/Models/NotificationPreference.php) with its `{email, in_app}` defaults, the
     `NotificationCategory` union in `types/index.ts`, and a label in
     `NOTIFICATION_CATEGORY_LABELS` (same file — feeds both
     `components/settings/NotificationPreferences.tsx`'s `CATEGORY_ORDER` list and
     `NotificationFeed`'s filter chips, so add it to `CATEGORY_ORDER` too, plus a
     `DESCRIPTIONS` entry). This makes it show up in Settings → Notifications with a
     working, persisted toggle, and (once it has notifications) as a filter chip on the
     Messages page — and nothing else yet.
  2. *Make it fire:* wherever the triggering action happens (a controller, typically):
     - If it's a DM-style category (not tied to a specific channel), call
       `Notification::notify($userId, 'your_category', [...data])` directly — see
       `notifyOtherParticipants`.
     - If it's a **channel-scoped** category (a specific channel is the relevant
       context — like a future `mention`), check `ChannelFocus::isFocused($userId,
       $channelId)` first and skip the call if true, the same way
       `notifyOtherRoomMembers` does — see the Conventions bullet on `ChannelFocus`.
     - Either way, if the category needs email too, check
       `NotificationPreference::for($userId, 'your_category')['email']` at the send
       site yourself (see `RoomInviteController::store`) — `notify()` only handles the
       in-app half. If it should never be disableable like `direct_message`, add it to
       `NotificationPreference::IN_APP_LOCKED` (backend) and
       `NOTIFICATION_IN_APP_LOCKED` (`types/index.ts`, frontend — cosmetic only, see
       Conventions).

  On the frontend, add a `{Category}NotificationData` interface in `types/index.ts`
  and a matching arm to the `AppNotification` discriminated union (keyed on `type`)
  if the new category's payload shape differs from the existing ones, then add a
  `case` to the `present()` switch in `components/messages/NotificationFeed.tsx` (href
  to link to + title/subtitle to render). `tsconfig.json` sets `noImplicitReturns`
  specifically so a forgotten `case` here is a real compile error (the switch falls
  through with no return) rather than a silent `undefined` at runtime — don't remove
  that flag.
- **New voice-adjacent feature:** don't reach for a new `ShouldBroadcast` event for
  anything latency-sensitive (SDP/ICE, mute state) — whisper on the existing
  `voice.channel.{id}`/`voice.conversation.{id}` presence channel instead (see
  Conventions "Voice"), and mint a new dedicated `voice.*` channel rather than
  reusing `channel.{id}`/`conversation.{id}` if a new scope needs its own roster/auth
  rule. To observe or join a voice scope, always go through
  `services/voicePresence.ts`'s `subscribeVoiceRoster()` — never call `services/
  echo.ts`'s `joinVoiceChannel()` directly a second time for the same scope (see trap
  #32). `RTCPeerConnection`/`MediaStream` objects go in `services/webrtc.ts`'s
  module-level maps; the current user's own call state (mute/connection/scope) goes
  in `useVoice`; the shared, anyone-can-read participant list goes in `useVoiceRoster`
  — never merge these three.

## Planned work

**These are plans, not tasks in progress.** Do not implement any item below unless
the user explicitly asks for it by name — don't start it as a side effect of touching
notification code nearby, and don't treat its presence here as pre-approval. Each one
is a real architectural commitment (new tables, new UI surfaces, or a delivery
mechanism this app doesn't have yet) and deserves its own explicit go-ahead.

- **Push notifications** as a third delivery endpoint alongside `email`/`in_app` on
  `NotificationPreference`. Needs a device-token/subscription model (web push or a
  native path), a `push` boolean column (or a normalized per-endpoint table if a third
  endpoint makes the flat-boolean shape awkward), browser permission UX, and a
  service-worker or push-gateway integration this app has none of today.
- **Room-level notification preference defaults.** A room's owner/host sets the
  room's default `{email, in_app}` (and eventually `push`) per category for members
  who haven't overridden it themselves — i.e. a middle layer between
  `NotificationPreference::DEFAULTS` (hardcoded, global) and a user's own override
  row. Needs a `room_notification_defaults`-shaped table keyed by `(room_id,
  category)`, a settings surface scoped to `RoomPolicy` (probably a new policy method,
  same pattern as `RoomPolicy::invite`), and a resolution order — user override →
  room default → hardcoded default — added to `NotificationPreference::for()`.
- **Channel-level notification preference overrides**, per user per channel, with
  their own category set: `general_message` and `mention` (the user's display name
  or `@username` appears in the message content, Discord/social-style — this app's
  `MessageInput`/message rendering has no @-mention parsing today either, that's a
  prerequisite). These sit below the room-level defaults above in the same
  resolution chain: user's channel override → room default → hardcoded default.
  The focus-suppression piece doesn't need inventing when this lands — `mention` is
  channel-scoped, so it should check `App\Support\ChannelFocus::isFocused()` before
  notifying, the same way `room_message` does; see the Conventions bullet on
  `ChannelFocus` and the "New notification category" recipe.

## Env vars that matter

`APP_NAME` (default `CommunityHub` — the one knob for the display name; see the
Conventions bullet on how it's threaded to the frontend. `DB_DATABASE`/`DB_USERNAME`/
`REVERB_APP_ID` etc. deliberately do **not** derive from it — they default to the
plain lowercase `communityhub` literal instead, since Postgres/Reverb identifiers
don't tolerate arbitrary display-name casing/spacing and coupling them to `APP_NAME`
would make renaming the display name a database-migration hazard),
`APP_KEY` (auto-generated on boot), `DB_*` (host `postgres`), `REDIS_HOST=redis`,
`BROADCAST_CONNECTION=reverb`, `REVERB_APP_ID`/`REVERB_APP_KEY`/`REVERB_APP_SECRET`,
`REVERB_HOST` (server-side — the docker-compose service name `reverb`, used by
`app`/`worker` to publish events; **not** the same value as `VITE_REVERB_HOST`,
which is `localhost` for the browser — see trap #21) + `REVERB_PORT`/`REVERB_SCHEME`
+ matching `VITE_REVERB_*`, `REVERB_SCALING_ENABLED` (Redis-backed Reverb pub/sub
scaling, `config/reverb.php` `servers.reverb.scaling`, `true` here since Redis is
already a hard dependency — lets multiple Reverb instances share subscriber state),
`FILESYSTEM_DISK` (`public` dev / `r2` prod), `AWS_*` for R2,
`MAIL_MAILER=mailpit` (dev default; other options: `smtp`, `ses`, `log`, `array`
— see README's `## Email`) + `MAIL_HOST`/`MAIL_PORT`/`MAIL_USERNAME`/
`MAIL_PASSWORD`/`MAIL_ENCRYPTION` (used by `mailpit`/`smtp`) +
`MAIL_SES_KEY`/`MAIL_SES_SECRET`/`MAIL_SES_REGION` (only `ses`, kept separate
from the R2 `AWS_*` vars — see trap #19) + `MAIL_FROM_ADDRESS`/`MAIL_FROM_NAME`.
`TURN_SECRET`/`TURN_REALM`/`TURN_PORT` (server-side — also consumed directly by the
`coturn` docker-compose service's `command:` args, via compose's own `.env`
substitution, separate from Laravel's dotenv reading the same file) +
`TURN_PUBLIC_HOST` (the browser-facing value, `localhost` in dev, read by PHP to
build the ICE servers JSON response — **no** `VITE_TURN_*` pair exists, see trap #31).
