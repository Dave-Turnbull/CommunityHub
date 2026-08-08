# CommunityHub — Agent Guide

A lightweight chat app organized around **rooms**, each containing text
channels, plus direct messages. This file orients an AI agent working in the
repo: what the stack is, where things live, short cross-cutting conventions,
and a pointer to the traps that have already been hit (don't re-introduce
them — full write-ups are in [docs/traps.md](docs/traps.md)). Deep,
feature-specific reference material lives in `/docs` — see `## Docs` below.
New to the repo? [docs/quickstart.md](docs/quickstart.md) gets the stack
running and walks through one real change in under ten minutes.

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
- **Update this file and/or `/docs` in the same change that makes them stale.**
  New model, route, convention, directory, or trap → add it here (short,
  cross-cutting) or to the relevant `/docs/*.md` file (deep, feature-specific)
  before considering the work done. See `## Docs` for which goes where. An
  agent reading these next should not have to rediscover what you just learned.
- **Don't leave comments unless the meaning can't be inferred.** No comments
  restating what a line does, no "used by X" callouts, no commented-out code.
  A comment earns its place only for a non-obvious constraint, invariant, or
  workaround — see e.g. the pluralizer note on `CustomEmoji` or the cursor
  pagination doc-comment on `MessageController::paginate`.

## Docs

`/docs` holds formal, standalone reference documentation for specific
subsystems and features — see `docs/README.md` for the index.
[docs/architecture-vision.md](docs/architecture-vision.md) is the one
intent-stating exception: the design philosophy (base-primitive Features composed
into ChannelTypes, grants vs. parameters, the axes that stay separate) — read it
before proposing a new Feature, ChannelType, or extension mechanism, and keep it
consistent with any architectural change. Its hands-on companion is
[docs/build-a-channel-type.md](docs/build-a-channel-type.md), a worked
add-a-channel-type tutorial. Every other file in `/docs`
describes how the code currently works; they are **not** changelogs or
narrated histories ("this was a bug, fixed by...", "just added this
session") — that framing belongs in a commit message or in `## Traps` below
when it's a real gotcha worth flagging, not in `/docs`. Write `/docs` entries
in the same declarative, present-tense style you'd use documenting a system
you didn't build yourself.

**Where new information goes:**
- A short, cross-cutting fact that applies broadly (a naming convention, a
  one-line gotcha, a small architectural rule) → `CLAUDE.md`'s `## Conventions`
  or `## Traps`.
- A deep explanation of one subsystem or feature (how the capability system
  resolves grants, how voice call membership is tracked, the roles hierarchy,
  the notification pipeline) → its own or an existing `/docs/*.md` file,
  linked from `docs/README.md`.
- When in doubt: if explaining it well takes more than a few sentences and
  it's scoped to one feature, it's a `/docs` entry, not a `CLAUDE.md` bullet.

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
`dave@example.com` / `password`, `bove@example.com` / `password`, `peve@example.com` / `password`.

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
                               NotificationCreated, Channel* — see docs/
                               capabilities-and-channel-types.md)
  Console/Commands/
    BootstrapGlobalAdmin.php  `app:bootstrap-admin {email}` — the one bootstrap path for
                               the first instance-wide Administrator role, see docs/
                               roles-and-permissions.md
  Http/Controllers/
    Web/                      Inertia page controllers (return Inertia::render).
                               SettingsController::show computes can_manage_global_roles
                               (see docs/roles-and-permissions.md), which gates whether
                               Settings/Index.tsx's Roles tab renders at all;
                               MessageController::show is the "go to message" direct-link
                               resolver — GET /messages/{message} checks the same
                               visibility a normal page load would (via MessagePolicy,
                               see docs/attachments.md), then redirects to
                               the channel/conversation with ?message= (see docs/
                               messages-and-pagination.md's "Jumping to a message");
                               AttachmentController::show is the only place an
                               attachment's bytes are ever served from — GET
                               /attachments/{attachment}, gated by AttachmentPolicy
                               (see docs/attachments.md), never a direct storage URL;
                               EmailVerificationController is notice/verify/resend —
                               always registered regardless of
                               config('verification.enabled'), see
                               EnsureEmailIsVerifiedIfRequired
    Api/                      JSON controllers (axios targets), thin translators over
                               app/Services/ — see docs/service-layer.md.
                               ChannelFocusController is the focus/blur heartbeat
                               endpoint (see docs/notifications.md); ConversationController
                               (distinct from Web\ConversationController) handles
                               candidates/resolve/store/addParticipants (see docs/
                               conversations-and-invites.md); VoiceIceServersController/
                               VoiceDevicePreferenceController (see docs/voice.md);
                               ChannelController (distinct from Web\ChannelController) is
                               store/update/destroy/reorder — channel CRUD, plus
                               visibility_role_ids and permission_overrides on update (see
                               docs/roles-and-permissions.md's "Channel visibility"/"Room
                               permission ceilings") — both gated separately from the rest
                               of update, both behind the same ManageChannelVisibility
                               ability (docs/capabilities-and-channel-types.md);
                               RoleController is index/store/update/destroy/addMember/
                               removeMember for room roles, plus indexGlobal/storeGlobal/
                               reorderGlobal for instance-wide roles — index/indexGlobal
                               back RoomRolesPanel.tsx/Settings' self-fetching Roles tab
                               respectively, and decorate every returned Role with
                               can_manage/grantable_permissions/grantable_channel_categories
                               plus (global roles only) can_manage_ceiling/
                               grantable_ceiling_permissions/the current ceiling state
                               (see docs/roles-and-permissions.md); RoleRoomCeilingController
                               is update — a global role's room-permission ceiling, gated
                               by RolePolicy::manageCeiling (see docs/
                               roles-and-permissions.md's "Room permission ceilings");
                               RoomMemberController is
                               destroy/ban/unban — kick/ban a room member (see docs/
                               roles-and-permissions.md's "Kick and ban");
                               ThemePreferenceController is
                               show/update for the Appearance panel's preset + per-variable
                               overrides (see docs/theming.md); InstanceSettingsController
                               is show/update for the three signup-path toggles, backing
                               Settings' self-fetching "Server" tab, gated by
                               InstanceSettingPolicy (see docs/conversations-and-
                               invites.md's "Server invites"); ServerInviteController is
                               store only — creates an account-creation invite, gated by
                               ServerInvitePolicy/Permission::InviteServer (no list/revoke
                               UI yet)
    Controller.php            empty abstract base — Laravel ships none by default, keep it
  Http/Middleware/
    HandleInertiaRequests.php shares auth.user, rooms, conversations,
                               recentCustomStatuses (see docs/status.md),
                               registrationPaths (see docs/conversations-and-
                               invites.md's "Server invites"), flash
    EnsureEmailIsVerifiedIfRequired.php  wraps Laravel's stock
                               EnsureEmailIsVerified so verification enforcement
                               is a runtime config('verification.enabled') toggle
                               rather than baked into route registration —
                               always on the authenticated route group in
                               routes/web.php; see config/verification.php
  Mail/                       Mailable classes (RoomInviteMail, ServerInviteMail),
                               ShouldQueue — sent via the `worker` container, Mailpit
                               catches them in dev
  Models/                     all UUID-keyed (HasUuids); Notification is the exception to
                               the "table name matches model" convention — see trap #22.
                               User always implements MustVerifyEmail — inert on its own,
                               only enforced when EnsureEmailIsVerifiedIfRequired's runtime
                               config check is on, see config/verification.php.
                               NotificationPreference/VoiceDevicePreference — see docs/
                               notifications.md and docs/voice.md; Role/RolePermission/
                               RoleAssignment, ChannelRoleVisibility, RoomBan,
                               RoleRoomPermissionCeiling/RoleRoomChannelCategoryCeiling
                               (a global role's room-permission ceiling),
                               RoomPermissionCeiling/RoomChannelCategoryCeiling (a room's
                               own snapshotted ceiling), ChannelPermissionOverride
                               (schema only, not yet consumed) — see docs/
                               roles-and-permissions.md's "Room permission ceilings";
                               RecentCustomStatus — see docs/
                               status.md; ThemePreference
                               (one row per user: preset + jsonb overrides) — see docs/
                               theming.md; Vote, NotificationMute (schema only, not yet
                               enforced) — see docs/comments-and-voting.md;
                               InstanceSetting (single-row, instance-wide settings — today
                               just the three signup-path toggles, lazily seeded from
                               config/registration.php's env defaults via
                               InstanceSetting::current()), ServerInvite (grants account
                               creation, distinct from RoomInvite which grants room
                               membership) — see docs/conversations-and-invites.md's
                               "Server invites"
  Policies/                   authorization seams beyond simple membership checks —
                               see docs/roles-and-permissions.md and docs/
                               conversations-and-invites.md. RoomMemberPolicy backs
                               RoomMember (Laravel's convention-based auto-discovery
                               maps the RoomMember model to it) — kick/ban, a different
                               hierarchy comparison than RolePolicy's, see docs/
                               roles-and-permissions.md; MessagePolicy::view is "can this
                               user see this message" (channel room-membership +
                               visibility, or conversation participancy — a comment
                               defers to its root ancestor's scope, see docs/
                               comments-and-voting.md) starting from a
                               Message row — used by Web\MessageController::show and by
                               AttachmentPolicy::view, which defers to it once an
                               attachment is on a sent message (uploader-only before
                               that) — see docs/attachments.md; InstanceSettingPolicy and
                               ServerInvitePolicy both reuse the same ManageRoles-at-
                               global-tier check as managing global roles — see docs/
                               conversations-and-invites.md's "Server invites"
  Providers/
    ChannelTypeServiceProvider.php  registers every built-in ChannelType — see docs/
                               capabilities-and-channel-types.md (ForumChannelType,
                               MessageAndCommentChannelType — see docs/
                               comments-and-voting.md)
    FeatureServiceProvider.php      registers every built-in Feature — see docs/
                               capabilities-and-channel-types.md (TextFeature/
                               VoiceFeature/StatusFeature — the latter has no
                               ChannelType consumer yet, see docs/status.md;
                               VoteFeature — see docs/comments-and-voting.md)
  Services/                   {Operation}Service classes — see docs/service-layer.md.
                               Not the same thing as Support/Capabilities' Feature — a
                               Feature declares what a capability *is*, a Service is
                               where the operation actually lives and gets authorized.
                               RoomMembershipService is kick/ban + the owner-transfer
                               flow when the target is a room's Owner (see docs/
                               roles-and-permissions.md); VoteService — see docs/
                               comments-and-voting.md; ServerInviteService — creation +
                               token validation for account-creation invites, see docs/
                               conversations-and-invites.md's "Server invites"
  Support/                    ChannelFocus (see docs/notifications.md); Permission/
                               PermissionChecker/PermissionCeiling (the last is the
                               grant-time "can only grant what you hold" primitive, room
                               and server tier both — see docs/
                               roles-and-permissions.md's "Room permission ceilings");
                               ChannelTypes/ + Capabilities/ (see docs/
                               capabilities-and-channel-types.md); Theme/ThemeTokens —
                               the CSS-variable/preset allow-list ThemePreferenceController
                               validates against, mirrors resources/js/services/theme.ts
                               (see docs/theming.md)
bootstrap/
  app.php                     THE wiring file — routing, middleware groups
  providers.php               provider list (App\Providers\AppServiceProvider,
                               App\Providers\FeatureServiceProvider,
                               App\Providers\ChannelTypeServiceProvider)
config/                       hand-written; app.php has NO 'providers' key (see traps).
                               mail.php/services.php only override specific keys — the
                               rest is silently merged from framework defaults (trap #19);
                               turn.php is first-party voice infra config (coturn) — see
                               docs/voice.md
database/
  factories/                  one factory per model, all use HasFactory
  migrations/                 timestamped 2024_01_01_0000NN_*, UUID PKs
  seeders/DatabaseSeeder.php  demo data; never runs automatically.
                               DemoConversationSeeder holds the multi-week #general
                               backlog and also runs standalone (--class=...) against
                               an already-seeded DB — see docs/messages-and-pagination.md
docker/
  app/Dockerfile              two-stage (composer build → fpm runtime; composer binary
                               also copied into the runtime image, see traps)
  app/entrypoint.sh           mkdir storage, key:gen, wait-for-db, migrate, storage:link
  nginx/default.conf
resources/
  css/
    app.css                   theme variable definitions ([data-theme="classic"]) +
                               @layer base — see docs/theming.md
  views/
    app.blade.php              sets <html data-theme="classic">
    emails/                   plain Blade mail views (room-invite.blade.php) — no
                               markdown mail layout in this repo, keep them simple
  js/
    app.tsx                   Inertia bootstrap + QueryClientProvider; also owns the
                               one global presence subscription (see trap #38) —
                               keyed off router's 'navigate' event, not any page
    pages/                    one file per Inertia page (Auth, Channels, DM, Rooms,
                               Settings, Invite — the invite-accept landing page).
                               Room role management has no page of its own — it's
                               RoomRolesPanel.tsx, one of Channels/Show's inline
                               `mainView` panels (see docs/roles-and-permissions.md and
                               the ChannelSidebar/Channels entries below). Its
                               instance-wide equivalent is a Settings tab instead — see
                               components/settings/GlobalRolesSettings.tsx below
    components/
      chat/                   MessageList (the scroll container: a sentinel per
                               paging direction + element-anchored scroll
                               preservation, plus the `scrollTo` prop that scrolls to
                               and briefly flashes a "go to message" landing target),
                               MessageRow (its reply-context block is a button that
                               jumps to the replied-to message, rendering
                               ReplyPreviewContent for what it's replying to; its
                               optional "💬 comment" popout — see
                               `commentsEnabled`/`maxCommentDepth`/`broadcastScope`,
                               forwarded from TextChannelContent via MessageList — is
                               how the `message_and_comment` channel type surfaces
                               inline comments, see docs/comments-and-voting.md),
                               CommentThread (a message's comment tree — recursive,
                               lazy-loaded children, shared by MessageRow's popout and
                               ForumChannelContent's post detail — see docs/
                               comments-and-voting.md),
                               ReplyPreviewContent (the reply-target preview shared by
                               MessageRow's reply-context and MessageInput's "Replying
                               to…" bar — an actual thumbnail for an image attachment,
                               not just its filename; text content if present alongside
                               it; a plain 📎 filename fallback only for a non-image
                               attachment with no content; nothing extra if neither),
                               MessageAttachments
                               (renders a message's `attachments[]` as inline embeds —
                               image/video thumbnail or a generic 📎 download link —
                               reusable anywhere a list of Attachment needs rendering,
                               not just MessageRow), AttachmentPreviewModal (the
                               lightbox MessageAttachments opens on an image/video
                               thumbnail click), MessageInput (its
                               `leading` slot is where the jump-to-present button
                               renders, in line with the compose box, when a composer is
                               shown at all — `TextChannelContent` renders that same
                               button standalone instead when `canPost` is false, since
                               jumping to the present isn't a posting action and must
                               keep working even with no composer to hold it; it also
                               owns a composer-scoped error stack — see the Conventions
                               bullet on composer errors below; also reused as-is for
                               a forum post/comment composer, `scopeType: 'message'`
                               sending via `sendComment`, `showTitleField` for a
                               post's optional headline — see docs/
                               comments-and-voting.md),
                               TextChannelContent (owns the highlight state "go to
                               message" scrolls/flashes) — see docs/
                               messages-and-pagination.md's "Jumping to a message"
                               and docs/capabilities-and-channel-types.md;
                               ForumChannelContent (the `forum` channel type's post
                               list + detail view) — see docs/comments-and-voting.md
      layout/                 RoomRail, ChannelSidebar (the "🛡 Roles"/"+ Add
                               channel"/invite-people affordances don't open modals —
                               they call back up to Channels/Show, which swaps its
                               `mainView` state and renders the matching panel in place
                               of the channel content, showing that affordance as
                               "active" the same way an active channel row is — see
                               docs/capabilities-and-channel-types.md), DMSidebar,
                               MemberList (renders a per-member kick/ban dropdown when
                               roomId + canManageMembers/canBanMembers are passed, e.g.
                               from Channels/Show — see docs/roles-and-permissions.md),
                               ChannelPermissionsPanel (visibility — who sees this
                               channel — and, filtered to what the channel's type
                               actually supports, per-role curated permission overrides,
                               one panel/one save — see docs/roles-and-permissions.md's
                               "Room permission ceilings"; unlike the `mainView` panels
                               above, this one is toggled by Channels/Show independently
                               of `mainView`: absolutely positioned below the channel
                               header (not a modal, not a floating Radix popover) so it
                               reads as inline without resizing the channel content
                               beneath it or moving the message list's scroll position;
                               closes on a second click of the 🔒 button, a click outside
                               the header, or Cancel/a successful save), UserPanel
                               (the avatar+name trigger — see docs/status.md),
                               UserStatusPopover (the popup itself: status switcher,
                               custom status color+text+save, recent statuses,
                               Settings/Logout — see docs/status.md), InvitePanel,
                               CreateChannelPanel — the latter two render inline in
                               Channels/Show's main pane (see `mainView` above), not as
                               centered modals
      roles/                  RoleCard — one role's permission checklist + member
                               management, scope-agnostic (every API call is keyed by
                               role id, not room id) so it backs both RoomRolesPanel.tsx
                               and Settings' Roles tab — see docs/roles-and-permissions.md.
                               Splits a global role's checklist into "Server permissions"
                               (server-tier) and "Room permissions" (room-tier) sections;
                               a room role only ever shows the latter. RoomRolesPanel
                               self-fetches via GET /api/rooms/{room}/roles
                               (Api\RoleController::index) the same way
                               GlobalRolesSettings.tsx self-fetches the Settings Roles tab.
                               PermissionToggleList — the one shared, Toggle-switch-based
                               permission checklist (grouped by PERMISSION_GROUPS, each
                               row labeled + described from PERMISSION_DESCRIPTIONS, grayed
                               out per `grantable`) reused by RoleCard, RoomCeilingSection,
                               and ChannelPermissionsPanel — adding a new permission means
                               extending the PermissionKey/PERMISSION_* maps once, not
                               touching any of these three surfaces. RoomCeilingSection —
                               a global role's room-permission-ceiling editor (only
                               rendered when `role.can_manage_ceiling` is true), reuses
                               PermissionToggleList scoped to room-tier permissions,
                               PATCHes /api/settings/roles/{role}/room-ceiling. TriStateOverride
                               — the Inherit/Allow/Deny segmented control
                               ChannelPermissionsPanel's override grid uses (a channel
                               override has a real third state a binary Toggle can't
                               represent — see PermissionChecker::canInChannel())
      rooms/                  OwnerTransferModal — the confirmation shown when
                               kicking/banning a room's Owner would make the acting
                               admin the new Owner, see docs/roles-and-permissions.md
      messages/                NotificationFeed (see docs/notifications.md); UserPicker
                               — see docs/conversations-and-invites.md; VoteControl —
                               see docs/comments-and-voting.md
      settings/                NotificationPreferences (see docs/notifications.md);
                               AudioSettings (see docs/voice.md); AppearanceSettings —
                               the Settings → Appearance panel: preset picker + a
                               generated control per theme variable (see docs/theming.md);
                               GlobalRolesSettings — the Roles tab, self-fetching (GET
                               /api/settings/roles) like the other settings tabs rather
                               than Inertia-prop-driven, only rendered when
                               SettingsController::show's can_manage_global_roles is
                               true (see docs/roles-and-permissions.md);
                               RegistrationSettings — the "Server" tab: the three signup-
                               path toggles + a "generate server invite" affordance,
                               self-fetching (GET/PATCH /api/settings/instance), only
                               rendered when can_manage_instance_settings is true (see
                               docs/conversations-and-invites.md's "Server invites")
      voice/                  VoiceChannelPanel, VoiceBar — a channel/conversation's
                               main-pane voice UI. Both render ParticipantVolumeControl
                               per remote participant (speaking-ring Avatar + volume
                               Popover) which itself renders RemoteParticipantAudio (the
                               actual hidden <audio> playback element — see docs/voice.md).
                               VoiceChannelSidebarItem lives in
                               sidebar/, not here — see below
      sidebar/                Components that render *inside* ChannelSidebar's per-
                               channel-type row slot (`ChannelTypeDescriptor.
                               SidebarItem` — see docs/capabilities-and-channel-types.md),
                               as opposed to voice/'s main-pane content. VoiceChannelSidebarItem
                               (the row — a hover icon button toggles join/leave;
                               double-clicking the name also joins, but never leaves, see
                               docs/voice.md) composes the VoiceParticipantList molecule
                               (who's in the call including the current user, muted or
                               not) — kept separate because it's the "list of people/status
                               under a sidebar row" shape a future sidebar addition (a
                               music player's listener count, a per-channel elapsed-time
                               display) would also want, not something specific to voice
                               itself. See docs/voice.md.
      emoji/ ui/               EmojiPicker (wraps its lazy-loaded picker chunk in an
                               error boundary — a failed dynamic import degrades to a
                               small in-place fallback instead of crashing the channel
                               view, and calls the optional `onError` prop so a caller
                               like MessageInput can also surface it in its own error
                               stack), Avatar, Tooltip, Tabs (generic tabbed
                               container), Toggle (custom, no Radix Switch dependency),
                               Popover, DropdownMenu (thin Radix wrappers — EmojiPicker
                               and MessageRow's edit/delete menu are built on these
                               rather than importing Radix directly; UserStatusPopover
                               is too, see docs/status.md)
    hooks/                    useChat (one scope's message window: loadOlder/
                               loadNewer/jumpToPresent/commitSent — see docs/
                               messages-and-pagination.md), useAutoScroll, useNotifications,
                               useChannelFocus (see docs/notifications.md),
                               useVoiceChannel (see docs/voice.md)
    services/                 api.ts (axios — the only place a component may call axios
                               directly), channelTypes.tsx (frontend channel-type
                               registry — see docs/capabilities-and-channel-types.md),
                               echo.ts (Reverb subscriptions), voicePresence.ts,
                               webrtc.ts, voiceCallGuard.ts, voiceActivation.ts,
                               connectionQuality.ts (getStats()-based per-peer quality
                               polling, no signaling involved — see docs/voice.md),
                               messageCache.ts (per-scope contiguous run of fetched
                               history behind a swappable async driver) and
                               messageActions.ts (the optimistic reaction/edit/delete
                               path) — see docs/messages-and-pagination.md,
                               audioLevel.ts (dBFS level-meter math shared by the
                               AudioSettings mic test and voice activation — see
                               docs/voice.md), clientId.ts (localStorage-persisted
                               per-browser-install id), theme.ts (the token catalogue:
                               THEME_VARIABLES/THEME_PRESETS, resolveThemeValues/
                               applyThemeValues, hex↔"R G B" triplet conversion — see
                               docs/theming.md)
    stores/                   Zustand: useMessages (windowed + trimmed, see docs/
                               messages-and-pagination.md), usePresence, useUI, useNotifications,
                               useChannels (see docs/capabilities-and-channel-types.md),
                               useVoice, useVoiceRoster, useSpeaking, useVoiceVolume,
                               useRemoteStreamVersion, useConnectionQuality, useMicSensitivity
                               (send-threshold hysteresis + live AGC override — see docs/voice.md),
                               useTheme (current preset + per-variable overrides — see docs/theming.md)
    types/                    all shared interfaces + Inertia page-prop types;
                               `ChannelType` is `string`, not a closed union
    test/setup.ts             Vitest setup — @testing-library/jest-dom matchers +
                               an IntersectionObserver stub (jsdom has none, and
                               MessageList constructs one per paging direction)
    **/*.test.ts(x)           co-located next to the file under test
routes/
  web.php                     guest + auth Inertia routes; the authenticated group
                               carries EnsureEmailIsVerifiedIfRequired, and the
                               /email/verify|resend routes sit in their own
                               auth-only (not verified-gated) group so they're
                               reachable regardless of the flag
  api.php                     /api/* under auth (session), axios targets, including
                               /settings/roles (global role list/store/reorder, self-
                               fetched by Settings' Roles tab), /rooms/{room}/
                               members|bans (kick/ban — see docs/roles-and-permissions.md),
                               /settings/instance (signup-path toggles, self-fetched by
                               Settings' Server tab) and /server-invites (create only —
                               see docs/conversations-and-invites.md's "Server invites")
  channels.php                broadcast auth: channel.{id} presence (now also checks
                               Channel::isVisibleTo() — see docs/
                               roles-and-permissions.md's "Channel visibility"),
                               conversation.{id} private, room.{id} private (see docs/
                               capabilities-and-channel-types.md), voice.channel.{id}/
                               voice.conversation.{id} presence (see docs/voice.md)
  console.php
tests/
  Feature/                    one folder per feature area (Auth, Rooms, Channels,
                               Messages, Conversations, Reactions, Uploads, Settings,
                               Broadcasting, Invites, Notifications, Voice, Roles) — routes
                               through the real HTTP kernel
  Unit/Models/                pure model logic (reactionSummary, hasMember, sharesRoomWith,
                               Role::effectiveModerationRank, ...)
  Unit/Support/               ChannelFocus cache-logic tests — no HTTP, no RefreshDatabase;
                               PermissionCheckerTest — pure Role/RoleAssignment logic;
                               PermissionEnumStabilityTest — pins every Permission case's
                               string value, since nothing else validates it against
                               role_permissions rows (see docs/roles-and-permissions.md);
                               FeatureRegistryTest — group/wildcard expansion, unknown-key
                               rejection, against a throwaway fake Feature, no HTTP
phpunit.xml                   sqlite :memory:, null broadcaster, sync queue — see Testing
vitest.config.ts              jsdom env, '@' alias, loads resources/js/test/setup.ts;
                               pool: 'threads' — see trap #25
```

## Conventions

Short, cross-cutting rules that apply broadly. Feature-specific conventions live in
`/docs` (see `## Docs` above and `docs/README.md`'s index) — check there before
assuming something is undocumented.

- **Commenting is parameter-gated (`comments_enabled`), not capability-gated** —
  don't add a `text.*` capability for it. Whether a channel/conversation allows
  threaded comments is a per-instance setting (`channels.settings.comments_enabled`),
  not a `ChannelType`-level grant; a comment is a message, so it reuses
  `TextMessageService` almost unchanged. Who may author one is the separate,
  standalone `Permission::Comment` (RBAC), deliberately independent of whatever
  gates ordinary posting in the same channel — both are required, checked
  independently. See `docs/comments-and-voting.md`.
- **The display name ("CommunityHub") is one env var, not a hardcoded string** —
  `APP_NAME` (`config('app.name')`, default `CommunityHub`). Backend/Blade code reads
  `config('app.name')` directly. The React bundle can't call `config()`, so it's
  threaded through two paths: `HandleInertiaRequests::share()` adds `appName` to every
  page's shared props (`SharedProps.appName` in `types/index.ts`) for components inside
  the React tree; `app.blade.php` also emits a `<meta name="app-name" content="...">`
  tag that `app.tsx` reads directly, since the Inertia `title` callback runs outside the
  React tree. Never hardcode the app's display name in a new page/component/mailable.
- **Login accepts either email or username through one field**, not two. The form
  posts a single `login` string; `AuthController::login` disambiguates with
  `str_contains($login, '@')` — safe because the registration regex
  (`/^[a-z0-9_.]+$/`) forbids `@` in usernames. Validation errors key off `login`, not
  `email` — don't reintroduce a separate `email` request field on this route.
- **UUIDs everywhere.** Every model uses `HasUuids`; every migration uses
  `$table->uuid('id')->primary()` and `foreignUuid(...)`. Never introduce
  auto-increment ids or `id()` on a domain table.
- **Messages are scoped** by either `channel_id` OR `conversation_id` (never both) —
  see `docs/conversations-and-invites.md` for the full shape and every service/
  controller that enforces membership on message-adjacent endpoints.
- **Broadcasts use `->toOthers()`.** The sender adds their own message to the
  Zustand store from the HTTP response; the socket only informs everyone else.
  `useMessages.add` has a dup-guard on id anyway — keep it.
- **Echo listeners use a leading dot** (`.MessageSent`) to match `broadcastAs()`
  names without the `App\Events` namespace prefix.
- **Zustand message store is keyed by scopeId** so multiple channels/DMs coexist.
  Reducer-style: `setWindow / prependOlder / appendNewer / add / insert / update /
  remove / setReactions`.
- **Message history is cursor-paginated in both directions**, 50/page (`?before=`
  for older, `?after=` for newer, never both), and what the client holds is a
  *window* of at most 150 messages, not everything it has ever loaded — paging past
  that cap drops rows from the far end and records a cursor to re-fetch them with.
  A window whose `hasNewer` is true is detached from the live tail, which suppresses
  live appends (they'd render a gap as contiguous history) and shows the
  jump-to-present button. Already-fetched pages come from
  `services/messageCache.ts`'s per-scope contiguous run rather than the network.
  See `docs/messages-and-pagination.md` before touching `useChat`, `MessageList`'s
  scroll anchoring, or either half of the cursor contract.
- **"Go to message"** is the general mechanic for landing on one specific message —
  a third cursor mode, `?around=`, centers the window on a target instead of
  walking away from an edge. A reply preview click and a direct link
  (`GET /messages/{message}`, see `Web\MessageController`) both use it today;
  building search results or pinned-message jumping should reuse the same
  `around` cursor / `useChat.jumpToMessage` / `MessageList`'s `scrollTo` prop
  rather than growing a parallel path. See `docs/messages-and-pagination.md`'s
  "Jumping to a message".
- **A mutation a reader triggers is applied to the client first, then reconciled** —
  reactions, edits and deletes all go through `services/messageActions.ts`
  (optimistic write → await → replace with the server's payload, or restore the
  previous state and rethrow). Don't call `api.addReaction`/`editMessage`/
  `deleteMessage` straight from a component; that's what made these feel laggy
  before. See `docs/messages-and-pagination.md`.
- **Message attachments go to the private `local` disk, never `public`**, and are only
  ever served through the authorized `GET /attachments/{attachment}` route — never a
  direct storage URL. `UploadController` hardcodes the `local` disk regardless of
  `FILESYSTEM_DISK`/`config('filesystems.default')` (that env var — `public` dev /
  `r2` prod, see `config/filesystems.php` — governs the *default* disk other,
  unrelated code might use, not attachment storage specifically). See
  `docs/attachments.md` for storage, visibility (`AttachmentPolicy`/`MessagePolicy` —
  an attachment is exactly as accessible as the message it's on), and deletion.
- **Images are compressed client-side before upload**, in `services/imageCompression.ts`'s
  `compressImageFile()` — called from `services/api.ts`'s `uploadFile`, so every caller of
  the one reusable upload path gets it automatically rather than needing to remember to
  compress. Downscales to a 1920px max dimension and re-encodes (JPEG/WebP get a quality
  pass, PNG stays lossless to preserve transparency); GIF and SVG are skipped outright
  (canvas would flatten GIF animation to one frame and rasterize SVG), as are files
  already under 300 KB. Fails open at every step — no canvas/`createImageBitmap` support,
  a decode error, or a "compressed" result that isn't actually smaller all fall back to
  the original file untouched, so a browser quirk never blocks the upload. Video has no
  client-side compression yet — only images.
- **The upload size limit is one config value, not three independent hardcoded ones.**
  `config/uploads.php`'s `max_size_kb` (`UPLOAD_MAX_SIZE_KB` env var, default 100 MB) is
  the actual, user-facing limit — `UploadController` validates against it, and it's
  threaded to the frontend as `maxUploadSizeBytes` on every Inertia page (see
  `HandleInertiaRequests::share()`/`SharedProps`), which is what `MessageInput` checks
  client-side before ever uploading a file. nginx's `client_max_body_size`
  (`docker/nginx/default.conf`) and php.ini's `upload_max_filesize`/`post_max_size`
  (`docker/app/php.ini`) are separate, hard-coded ceilings set comfortably above this
  value — they exist so an over-limit request gets rejected at the edge instead of
  reaching PHP, not to be the tunable number themselves. Raising `UPLOAD_MAX_SIZE_KB`
  without also raising those ceilings just moves the 413 to a lower, still-wrong
  threshold — this exact mismatch (nginx defaulting to 1 MB with no override) is what
  originally made video uploads 413 before ever reaching Laravel's own (then 8 MB)
  validation.
- **The composer (`MessageInput`) has its own error stack**, local `useState`, scoped to
  that one composer instance — not a global toast system. It renders above the reply
  bar/file previews/textarea, inside the channel, one closable card per error (closing
  one never affects the others — see the id-capture note in `pushError`, a real bug this
  shipped with once already: capture the id before calling `setErrors`, don't read the
  ref from inside the updater). Every step of sending a message pushes into the same
  stack on failure: a rejected `sendChannelMessage`/`sendConversationMessage`/`onSend`,
  a rejected per-file `uploadFile` (named after the failing file), an oversized file
  caught client-side at selection/drop time (before ever uploading), and an
  `EmojiPicker` chunk-load failure (via its `onError` prop). `services/errorMessages.ts`'s
  `describeApiError()` turns an axios error into the user-facing sentence; a failed
  per-file upload wraps its message in `ComposerFriendlyError` first so send()'s outer
  catch knows not to re-describe it and lose the filename context. The whole stack
  clears at the start of the next send attempt (not on unmount, not on scope switch —
  same as the draft text/file list, which also don't reset on a channel switch today).
- **Every color, corner radius, border width, and typography value is a themed CSS
  variable, not a literal.** `tailwind.config.js` points its `colors`/`borderRadius`/
  `borderWidth`/`fontSize`/`fontWeight`/`fontFamily` theme keys at CSS custom
  properties defined in `resources/css/app.css` (scoped to `[data-theme="classic"]`,
  the one theme ever expressed as an actual CSS rule); ordinary utility classes
  (`bg-second`, `rounded-lg`, `text-text-muted`) resolve through them. The six
  background tones are top-level color keys named by prominence, largest-covered-
  area first — `primary` (main content pane) → `second` → `third` → `fourth` →
  `fifth` → `sixth` (borders/dividers) — not by component or elevation metaphor.
  The accent color is `accent-primary`/`accent-secondary`/`accent-tertiary` (a
  color *family*, not "DEFAULT/hover/muted" — `secondary` shows up as more than
  just a hover state, e.g. the room-rail's active-room background). Major chrome
  regions (`RoomRail`, `ChannelSidebar`/`DMSidebar`, `MemberList`, `UserPanel`,
  and the `MessageInput` compose box) also carry a `border-panel
  border-panel-border` pair (directional on the sidebar/rail/member-list edges,
  all sides on the standalone compose box), quarter-pixel-stepped and at 0
  width in every preset except `black` (where the background scale alone can't
  tell adjacent panels apart) — see docs/theming.md's "Panel border" section
  before assuming a 0-width border on one of those components is dead code;
  it's a real, theme-controlled affordance. Never hardcode a raw hex color or pixel
  radius/border value in a component — reach for an existing token, or add one
  to `app.css`/`tailwind.config.js` if it doesn't exist yet. On top of that
  static layer, Settings' Appearance panel
  (`AppearanceSettings`) lets a signed-in user pick a built-in preset (`classic`/
  `midnight`/`ocean`/`light`/`black`, defined as pure data in `resources/js/
  services/theme.ts` — no CSS block per preset) and tweak individual variables on
  top, persisted server-side (`ThemePreference`) and applied at runtime via
  `document.documentElement.style.setProperty()`, which is what actually shows the
  chosen theme on every page. See `docs/theming.md` for the full token reference
  (the background scale, text/accent/status colors, radius and border-width
  scale), how the preset/override system and its backend allow-list
  (`App\Support\Theme\ThemeTokens`) work, and how to add another preset or token.
  Utility classes are applied inline in JSX, not extracted into `@layer components`
  classes — `resources/css/app.css` only holds `@layer base` (plus the theme
  variable block). When the same class string repeats across a component, copy the
  literal utility string rather than introducing a shared CSS class; use
  `clsx(...)` for conditional variants.
- **`RoomRail` is a horizontal bar across the top of every authenticated page**
  (`h-room-rail`, 56px). Every page wraps it in `flex flex-col h-screen` with a
  `flex flex-1 min-h-0` row underneath holding the channel/DM sidebar + main content.

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
  `resources/js/test/setup.ts` — no per-file import needed. That file also stubs
  `IntersectionObserver` (jsdom ships none, and `MessageList` constructs one per
  paging direction, so rendering a message list at all would otherwise throw). The
  stub observes nothing on purpose — a test that wants to prove paging happens
  should call the load handler rather than fake an intersection.

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

Full write-ups (52 of them) live in [docs/traps.md](docs/traps.md), grouped by
subsystem, with the original numbering preserved for old references. The
short version, by group — read the full entry before touching adjacent code:

- **Infrastructure, Docker, Laravel bootstrap** — `config/app.php`'s empty
  `providers` key, named-volume ownership, no Horizon, seeding is never
  automatic, `.env`-reload timing for the `worker`/`reverb` containers,
  config-merging surprises (`mail.php`/`services.php`), migrations not
  auto-applying to the dev DB, rebuilding one of `app`/`worker`/`reverb`
  without the others, a Postgres-volume rename gotcha, nginx's default
  `client_max_body_size` (1 MB) silently 413-ing uploads php.ini/Laravel would
  otherwise allow, and `app_storage` needing to be mounted into `nginx` too
  (not just `app`/`worker`/`reverb`) or every uploaded file 404s — which looks
  exactly like a broken `<img>`/`<video>` frontend bug, not an infra one.
- **Model/table naming** — `CustomEmoji`'s pluralizer collision,
  `user_notifications` vs. Laravel's reserved `notifications` shape.
- **Auth & sessions** — stateful Sanctum requirements, the `Referer` header a
  manual `curl` session needs.
- **Frontend/CSS** — `@apply group`, `min-h-0` on flex sidebars, the
  `@routes`/Ziggy Blade trap, Inertia's eager page-glob picking up
  `*.test.tsx`, `min-h-screen` vs `h-screen` for scrollability.
- **Testing** — Vitest 4 constructor-mock semantics, the `forks` pool
  instability (pin `threads`), `assertJsonFragment`'s cross-element
  false-positive risk.
- **Realtime & presence** — `Broadcast::channel()`'s boot-time registration,
  `REVERB_HOST` vs `VITE_REVERB_HOST`, presence must be subscribed from
  `app.tsx` not a page component.
- **Voice** (see also [docs/voice.md](docs/voice.md)) — no `VITE_TURN_*`,
  `.here()` firing once, presence subscription ≠ call membership, shared
  hooks and unmount-triggered side effects, the roster teardown grace
  period, live vs. captured-at-join settings, peak-hold metering, `null` as
  a meaningful stored value.
- **Status** (see also [docs/status.md](docs/status.md)) — presence events
  firing once per connection, the status/custom-status data-model history.
- **Messages & pagination** (see also
  [docs/messages-and-pagination.md](docs/messages-and-pagination.md)) —
  recording *why* something is missing rather than inferring it, the
  `has_older`/`has_newer` rename, `offsetTop`'s `offsetParent` requirement.
- **Roles & permissions** (see also
  [docs/roles-and-permissions.md](docs/roles-and-permissions.md)) —
  `Rule::exists()->where()` against a boolean column, `BelongsToMany::attach()`/
  `sync()` bypassing `HasUuids`' id generation on a UUID-PK pivot table, an
  `if ($role->room)`-gated safety net silently going dead once `room_id` became
  legitimately nullable (global roles), a DB column default not existing on a
  freshly-`create()`d model until refreshed (a falsy check on it right after creation
  silently takes the wrong branch).
- **Notifications** (see also [docs/notifications.md](docs/notifications.md))
  — a preference category with no `Notification::notify()` producer is
  silently inert.
- **Channel types & capabilities** (see also
  [docs/capabilities-and-channel-types.md](docs/capabilities-and-channel-types.md))
  — `channels.type` has no DB-level enum constraint.

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
- **New message mutation (pin, react-with-X, bulk delete, ...):** put it in
  `services/messageActions.ts` next to the existing three, following the same
  optimistic-write → await → reconcile-or-restore shape, and patch
  `services/messageCache.ts` alongside the store so a message changed outside the
  current window doesn't page back in stale. Have the endpoint return the
  authoritative payload the reconcile step needs (both reaction endpoints return the
  full `ReactionSummary[]` for exactly this). See `docs/messages-and-pagination.md`.
- **New way to land on a specific message (search result, pinned list, ...):**
  don't build a new fetch-and-scroll path — reuse "go to message" (see
  `docs/messages-and-pagination.md`'s "Jumping to a message"). Render a control
  that calls `useChat`'s `jumpToMessage(id)` (a no-op if the message is already
  in the window, otherwise an `?around=` fetch that replaces it) and set
  `MessageList`'s `scrollTo` to `{ id, token }` to scroll/flash it, the same two
  calls `TextChannelContent`'s reply-click handler already makes. A cross-scope
  result (a different channel/conversation than the one currently open) instead
  needs a full navigation to that scope's `?message={id}` URL — see
  `Web\MessageController::show`, the direct-link resolver.
- **New feature, either side:** add the Feature/Vitest test alongside it (see
  `## Testing`), then update the relevant `CLAUDE.md` section or `/docs/*.md`
  file in the same change (see `## Docs`).
- **New Feature operation (send X, join Y, change Z):** don't write it inline in a
  controller — add or extend an `app/Services/{Operation}Service.php` class (see
  `docs/service-layer.md`). The method does its own authorization first
  (`hasCapability()`/`PermissionChecker`/membership/ownership, whichever applies), then
  the operation itself; the controller becomes validate-request → call the Service →
  return JSON. If the operation is genuinely client-orchestrated (like voice — see
  `docs/voice.md`), the Service can be thin or absent on the backend and the real logic
  lives in a same-named frontend module under `resources/js/services/` instead —
  "give it a Service" means "put the logic in one clearly-owned place," not "put it on
  the backend."
- **New permission-gated action:** if the action needs a genuinely new
  permission, add a case to `App\Support\Permission` (and know that adding
  the case alone does nothing — see the trap-#24-shaped warning in
  `docs/roles-and-permissions.md`). Add a policy method (`create`/`manage`, or a new
  ability name) that calls `PermissionChecker::can($user, Permission::Whatever,
  $room)` — see `ChannelPolicy`/`RolePolicy` for the shape — rather than an
  inline `abort_unless($room->hasMember(...))`. Call it via `Gate::authorize(...)`
  in the controller. If the frontend needs to conditionally show the
  affordance (a button, a menu item), compute a `can_xxx` boolean server-side
  with `Gate::allows(...)` and thread it through as an Inertia prop — don't
  re-implement the permission check in JS.
- **New capability on an *existing* Feature (not a whole new Feature):** add a suffix
  to that Feature's `capabilities()` array (e.g. a new `'send_polls' => '...'` entry on
  `TextFeature`) — the auto-derived `all` group picks it up with no extra step. Add a
  named group in `groups()` only if the new capability should be bundleable with a
  subset of the others (see `docs/capabilities-and-channel-types.md`). Then, the two
  things that make it real rather than inert (same trap shape as trap #24): (1) add the
  actual `hasCapability('feature.send_polls')` enforcement check at the operation's real
  call site, normally inside that Feature's Service (`docs/service-layer.md`); (2) add
  the new key/group to whichever `ChannelType::capabilities()` list(s) should grant it —
  a capability nobody's `ChannelType` requests is unreachable. Capability keys are
  effectively permanent once shipped (`FeatureRegistryTest` documents the boot-time
  failure an unknown key produces) — don't rename one casually.
- **New built-in channel type reusing existing Features (text/voice):**
  implement `App\Support\ChannelTypes\ChannelType` (see `docs/
  capabilities-and-channel-types.md` for the shape) with a `capabilities()` returning
  the capability/group keys you want granted, a `category()` (`'standard'` or `'mod'` —
  `'mod'` requires `Permission::ManageModChannels` to create, see `docs/
  roles-and-permissions.md`'s "Channel creation is category-gated"), and a `description()`
  for the create-channel UI, then register it in `ChannelTypeServiceProvider::boot()`. No
  separate allow-list to update — `hasCapability()` resolves through `FeatureRegistry`
  automatically, and `ChannelPolicy::creatableTypeKeys()` picks the new type up
  automatically too. On the frontend, add a matching entry to
  `services/channelTypes.tsx`'s `REGISTRY` (icon/label/order/category/description/
  capabilities, plus a `Content` component and a `SidebarItem` if it needs custom
  sidebar rendering; omit either to get an empty-state main pane / a plain link).
  `KNOWN_CHANNEL_TYPES`'s ordering falls out automatically.
- **New built-in channel type needing a genuinely new Feature (not just
  text/voice):** first add the Feature — `App\Support\Capabilities\Feature` (see
  `docs/capabilities-and-channel-types.md` for the shape), register it in
  `FeatureServiceProvider::boot()`, and give it a real backend enforcement site (a
  Service/controller checking `hasCapability()` — see `docs/service-layer.md` for why
  a permission with no enforcement site is a real trap, same shape as trap #24). On the
  frontend, build the Feature's own component (own hook or state, own UI) the way
  `TextChannelContent`/`VoiceChannelPanel` are built, then reference it from whichever
  `ChannelType`'s `Content` wants it. Both of the above are the code-level
  extensibility mechanism available today — see `## Planned work` for the larger,
  not-yet-built runtime-installable plugin version of this same idea, and don't start
  building that without an explicit go-ahead.
- **New outbound email:** add a `Mailable` in `app/Mail/` (`implements
  ShouldQueue` so it goes through the `worker` container, not the request), a
  plain Blade view in `resources/views/emails/`, send via
  `Mail::to($x)->send(new SomeMail(...))`. Check it lands in Mailpit
  (`localhost:8025`) — and remember to `docker compose restart worker` after
  changing any `MAIL_*` env var (see trap #18).
- **New notification category — two halves, both required (see trap #24 for what
  happens if you skip the second), full detail in `docs/notifications.md`:**
  1. *Make it configurable:* add it to `NotificationPreference::DEFAULTS`, the
     `NotificationCategory` union in `types/index.ts`, and a label in
     `NOTIFICATION_CATEGORY_LABELS`.
  2. *Make it fire:* call `Notification::notify($userId, 'your_category', [...data])`
     at the triggering action, checking `ChannelFocus::isFocused()` first if it's
     channel-scoped, and `NotificationPreference::for()['email']` if it needs email too.

  On the frontend, add a `{Category}NotificationData` interface in `types/index.ts`
  and a matching arm to the `AppNotification` discriminated union, then a `case` to the
  `present()` switch in `components/messages/NotificationFeed.tsx`. `tsconfig.json`
  sets `noImplicitReturns` specifically so a forgotten `case` here is a real compile
  error rather than a silent `undefined` at runtime — don't remove that flag.
- **New voice-adjacent feature:** don't reach for a new `ShouldBroadcast` event for
  anything latency-sensitive (SDP/ICE, mute state) — whisper on the existing
  `voice.channel.{id}`/`voice.conversation.{id}` presence channel instead (see
  `docs/voice.md`), and mint a new dedicated `voice.*` channel rather than
  reusing `channel.{id}`/`conversation.{id}` if a new scope needs its own roster/auth
  rule. To observe or join a voice scope, always go through
  `services/voicePresence.ts`'s `subscribeVoiceRoster()` — never call `services/
  echo.ts`'s `joinVoiceChannel()` directly a second time for the same scope (see trap
  #32). `RTCPeerConnection`/`MediaStream` objects go in `services/webrtc.ts`'s
  module-level maps; the current user's own call state (mute/connection/scope) goes
  in `useVoice`; the shared, anyone-can-read participant list goes in `useVoiceRoster`
  — never merge these three. `useVoiceChannel` is shared by every surface that can
  join/leave/display a given scope's call (`VoiceChannelPanel`, `VoiceBar`,
  `VoiceChannelSidebarItem`) — don't add an unmount-triggered `leaveVoice()` to it or
  a new consumer, `webrtc.ts`'s `joinVoice()` already leaves any previous call itself
  (see trap #37).

## Planned work

**These are plans, not tasks in progress.** Do not implement any item below unless
the user explicitly asks for it by name — don't start it as a side effect of touching
notification code nearby, and don't treat its presence here as pre-approval. Each one
is a real architectural commitment (new tables, new UI surfaces, or a delivery
mechanism this app doesn't have yet) and deserves its own explicit go-ahead.

- **Frontend `ChannelCapabilityContext` + hook self-gating.** Each Feature's
  hook (`useChat`/a future `useCanvas`/etc.) would check a per-page context
  populated from the entity's resolved capabilities and throw a loud,
  clear error if used somewhere its capability wasn't granted — a
  programmer-error catcher, not a security control (the backend's `hasCapability()`
  checks remain the only real boundary — see `docs/capabilities-and-channel-types.md`).
  Deliberately deferred from the initial capability-system build: worth adding once
  there are enough Features for this class of mistake to actually be a papercut.
- **A persistent `MessageCacheDriver`, Capacitor/native SQLite in particular.**
  `services/messageCache.ts` is already driver-based and async precisely for this —
  `setMessageCacheDriver()` takes a `read`/`write`/`clear` triple, and a SQLite
  driver would store one run per scope as a `cached_messages` table keyed by
  `(scope_id, id)` ordered on `created_at` plus the run's two boundary flags. What
  is *not* designed yet, and needs deciding before any code: whether a persisted run
  may seed first paint (today the Inertia prop always wins, since it's server-fresh
  for that navigation — an offline-capable shell wants the opposite), how a run is
  invalidated across sessions when the server has moved on, and eviction policy for
  scopes a user hasn't opened in weeks. See `docs/messages-and-pagination.md`'s
  "Storage drivers" section.
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
  notifying, the same way `room_message` does (see `docs/notifications.md`).
- **Remaining `Permission` cases getting real enforcement.** `ManageMessages`
  (delete/pin others' messages) and `ManageEmojis` are declared in `App\Support\
  Permission` but have no `PermissionChecker::can()` call site anywhere yet — see the
  trap-#24-shaped warning in `docs/roles-and-permissions.md`. `ManageMembers`/
  `BanMembers` (kick/ban) and `InviteServer` (server invites) now do — see
  `docs/roles-and-permissions.md`'s "Kick and ban" section for the
  `Role::effectiveModerationRank`-based comparison a future `ManageMessages`
  moderation feature should look at before picking its own hierarchy semantics,
  since it likely wants the peer-eligible `>=` shape, not `RolePolicy::manage`'s
  role-management one.
- **Reapplying a server role's current room-permission ceiling to an already-created
  room.** `Room::snapshotPermissionCeiling()` (see `docs/roles-and-permissions.md`'s
  "Room permission ceilings") is deliberately one-shot, captured at creation time —
  tightening or loosening a server role's ceiling later does not retroactively re-cap
  rooms already created under it. A "reapply current defaults to this room" action
  (presumably room-owner- or server-admin-triggered) was explicitly deferred rather than
  built; needs a product decision on exactly what it does to a room's *already-granted*
  role permissions (revoke anything outside the new ceiling? leave existing grants alone
  and only change what's grantable going forward?) before any code.
- **Onboarding flow for first-time server owners.** Every user holds the global `Member`
  role by default, and that role is unrestricted (`has_room_permission_ceiling: false`)
  — so as shipped, *every* room is unrestricted and every permission is available to
  every room's Owner, until a server admin deliberately builds a restricted global role,
  configures its ceiling, and moves the relevant users onto *only* that role (not also
  the default Member — the union means holding any unrestricted role cancels a
  restriction out). Nothing in the product surfaces this today; a new server owner has
  no signal that this system exists or how to use it. A guided setup flow (e.g. shown
  once to the first bootstrapped Administrator) walking through "do you want to cap what
  rooms on this server can do — messaging, specific emoji sets, etc. — before anyone
  creates one" would make the ceiling system discoverable and usable without reading
  this doc first. Needs its own design pass (what it asks, when it's shown, whether it's
  skippable/revisitable from Settings later) before any code.
- **Runtime-installable channel-type plugins.** `App\Support\ChannelTypes\
  ChannelType` + `ChannelTypeRegistry` (see `docs/capabilities-and-channel-types.md`)
  is deliberately built as a **code-level** extension point — a new type ships
  in a normal deploy via its own service provider, no code in this app needs
  to change. Making that installable by a room owner *without* a deploy is a
  much bigger, security-sensitive undertaking that this milestone explicitly
  did not attempt: executing arbitrary third-party PHP inside the main
  Laravel process for every request touching that room is a serious
  multi-tenancy/RCE risk, and a frontend plugin bundle needs a real sandbox
  (a restricted-API iframe + postMessage bridge, not a raw dynamic
  `import()`) rather than trusting arbitrary JS with full DOM/network access.
  If this is ever built, look hard at an out-of-process contract instead of
  in-process code execution — e.g. the plugin author runs their own backend
  and CommunityHub calls declared webhook-style endpoints for
  server-side logic (similar to a Slack/Discord bot), while the frontend
  half loads in a sandboxed iframe with a typed SDK object instead of raw
  page access. This needs its own explicit design discussion before any code
  — don't start it as a side effect of touching `ChannelTypeRegistry`.
- **Code-gated ephemeral voice rooms.** A private voice channel type where clicking it
  prompts for a self-chosen 4/6/8-digit code rather than joining a fixed roster —
  entering the same code as someone else joins their spawned room; being one digit off
  puts you alone in a different one (no "wrong code" error, no enumeration signal). A
  real departure from every existing voice surface, which assumes a persisted `Channel`
  row is a hard precondition: `voice.channel.{id}`'s `Broadcast::channel` closure
  (`routes/channels.php`) does `Channel::find($id)` and denies auth outright if it
  returns null, and `VoiceSignalingService::canJoin()`/`ChannelPolicy` both take a real
  `Channel` model. A code-keyed room has no such row, so this needs either (a) a new,
  parallel presence-channel scheme (e.g. `voice.code.{roomId}.{code}`, room-membership
  checked directly with no `Channel`/`hasCapability()` involved — TURN/coturn creds
  already need no change, `VoiceSignalingService::iceServers()` is unscoped to any
  channel today) or (b) actually persisting a throwaway `Channel` row per code, which
  turns "ephemeral" into real rows needing a cleanup/expiry story. No existing pattern
  in this codebase to model an ephemeral, non-DB-backed room after — this would be a
  genuinely new concept, not an extension of `ChannelType`/`ChannelTypeRegistry`. Needs
  a design pass on: room lifecycle (expires when empty? after a timeout regardless?),
  whether codes are scoped per-room or instance-wide, and rate-limiting code entry
  (guessing adjacent codes to land in someone else's room is the obvious abuse case)
  before any code.

## Deploying behind a reverse proxy

`docker-compose.yml`'s `app`/`postgres`/`redis`/`reverb`/`mailpit`/`vite` ports are
bound to `127.0.0.1` on the host, not `0.0.0.0` — none of them should ever be reachable
directly from outside the host. Put a reverse proxy in front of the host and route it
to `127.0.0.1:8000` (HTTP/Inertia/API) and `127.0.0.1:8080` (Reverb — needs WebSocket
`Upgrade`/`Connection` headers passed through, since Reverb isn't behind the app's
`nginx` container). `coturn`'s ports are the one exception left bound to `0.0.0.0` —
WebRTC media relay is UDP/TCP, not something an HTTP reverse proxy can front, so it
must stay directly reachable by real clients. `bootstrap/app.php` trusts `*` for
`trustProxies()` specifically because of this — that's only safe as long as the port
bindings above stay loopback-only. If you ever need to expose one of those ports
publicly again, narrow `trustProxies()` to the actual proxy IP/CIDR first. Also set,
per-environment, not in this file: `APP_URL` (real public URL), `SANCTUM_STATEFUL_DOMAINS`
(real domain), `SESSION_SECURE_COOKIE=true`, `VITE_REVERB_HOST`/`VITE_REVERB_SCHEME`/
`TURN_PUBLIC_HOST` (the public domain instead of `localhost`).

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
`UPLOAD_MAX_SIZE_KB` (default 102400, i.e. 100 MB — `config/uploads.php`'s `max_size_kb`,
the real upload size limit; raising it also means raising `docker/nginx/default.conf`'s
`client_max_body_size` and `docker/app/php.ini`'s `upload_max_filesize`/`post_max_size`,
see the Conventions bullet above),
`UPLOAD_ALLOWED_MIMES` (default `jpeg,png,gif,webp,mp4,webm,mov,mp3,wav,ogg,pdf,txt,zip`
— `config/uploads.php`'s `allowed_mimes`; deliberately excludes `svg`/`html`/`htm`, see
`UploadController`'s doc-comment for why), `CORS_ALLOWED_ORIGINS` (comma-separated,
empty by default — `config/cors.php` always allows `APP_URL` itself; this adds any
additional origin, e.g. a future separate mobile app, that also needs credentialed
access to `api/*`/`sanctum/csrf-cookie`/`broadcasting/auth`),
`SIGNUP_MANUAL_ENABLED`/`SIGNUP_EMAIL_INVITE_ENABLED`/`SIGNUP_OAUTH_ENABLED` (all
default `true` — `config/registration.php`; first-boot defaults only, seeding
`InstanceSetting`'s single row the first time it's read — see
`docs/conversations-and-invites.md`'s "Server invites" for how an admin overrides
them afterward from Settings without touching these env vars again),
`EMAIL_VERIFICATION_ENABLED` (default `false` — `config/verification.php`; a live
runtime toggle, not a boot-time one — see `EnsureEmailIsVerifiedIfRequired`),
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
