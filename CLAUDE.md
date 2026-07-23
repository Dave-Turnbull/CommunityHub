# CommunityHub — Agent Guide

A lightweight chat app organized around **rooms**, each containing text
channels, plus direct messages. This file orients an AI agent working in the
repo: what the stack is, where things live, short cross-cutting conventions,
and the traps that have already been hit (don't re-introduce them). Deep,
feature-specific reference material lives in `/docs` — see `## Docs` below.

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
subsystems and features — see `docs/README.md` for the index. These files
describe how the code currently works; they are **not** changelogs or
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
  Http/Controllers/
    Web/                      Inertia page controllers (return Inertia::render)
    Api/                      JSON controllers (axios targets), thin translators over
                               app/Services/ — see docs/service-layer.md.
                               ChannelFocusController is the focus/blur heartbeat
                               endpoint (see docs/notifications.md); ConversationController
                               (distinct from Web\ConversationController) handles
                               candidates/resolve/store/addParticipants (see docs/
                               conversations-and-invites.md); VoiceIceServersController/
                               VoiceDevicePreferenceController (see docs/voice.md);
                               ChannelController (distinct from Web\ChannelController) is
                               store/update/destroy/reorder — channel CRUD (see docs/
                               capabilities-and-channel-types.md); RoleController
                               (distinct from Web\RoleController) is store/update/destroy/
                               addMember/removeMember for room roles (see docs/
                               roles-and-permissions.md)
    Controller.php            empty abstract base — Laravel ships none by default, keep it
  Http/Middleware/
    HandleInertiaRequests.php shares auth.user, rooms, conversations, flash
  Mail/                       Mailable classes (RoomInviteMail), ShouldQueue — sent via
                               the `worker` container, Mailpit catches them in dev
  Models/                     all UUID-keyed (HasUuids); Notification is the exception to
                               the "table name matches model" convention — see trap #22.
                               NotificationPreference/VoiceDevicePreference — see docs/
                               notifications.md and docs/voice.md; Role/RolePermission/
                               RoleAssignment — see docs/roles-and-permissions.md
  Policies/                   authorization seams beyond simple membership checks —
                               see docs/roles-and-permissions.md and docs/
                               conversations-and-invites.md
  Providers/
    ChannelTypeServiceProvider.php  registers every built-in ChannelType — see docs/
                               capabilities-and-channel-types.md
    FeatureServiceProvider.php      registers every built-in Feature — see docs/
                               capabilities-and-channel-types.md
  Services/                   {Operation}Service classes — see docs/service-layer.md.
                               Not the same thing as Support/Capabilities' Feature — a
                               Feature declares what a capability *is*, a Service is
                               where the operation actually lives and gets authorized
  Support/                    ChannelFocus (see docs/notifications.md); Permission/
                               PermissionChecker (see docs/roles-and-permissions.md);
                               ChannelTypes/ + Capabilities/ (see docs/
                               capabilities-and-channel-types.md)
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
    app.tsx                   Inertia bootstrap + QueryClientProvider; also owns the
                               one global presence subscription (see trap #38) —
                               keyed off router's 'navigate' event, not any page
    pages/                    one file per Inertia page (Auth, Channels, DM, Rooms,
                               Settings, Invite — the invite-accept landing page);
                               Rooms/Roles.tsx is the minimal room role-management page
                               — see docs/roles-and-permissions.md
    components/
      chat/                   MessageList, MessageRow, MessageInput, TextChannelContent
                               — see docs/capabilities-and-channel-types.md
      layout/                 RoomRail, ChannelSidebar (renders "+ Add Channel"/"🛡
                               Roles" affordances), DMSidebar, MemberList, UserPanel,
                               InviteModal, CreateChannelModal
      messages/                NotificationFeed (see docs/notifications.md); UserPicker
                               — see docs/conversations-and-invites.md
      settings/                NotificationPreferences (see docs/notifications.md);
                               AudioSettings (see docs/voice.md)
      voice/                  VoiceChannelPanel, VoiceBar — a channel/conversation's
                               main-pane voice UI. VoiceChannelSidebarItem lives in
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
      emoji/ ui/               EmojiPicker, Avatar, Tooltip, Tabs (generic tabbed
                               container), Toggle (custom, no Radix Switch dependency)
    hooks/                    useChat, useAutoScroll, useNotifications,
                               useChannelFocus (see docs/notifications.md),
                               useVoiceChannel (see docs/voice.md)
    services/                 api.ts (axios — the only place a component may call axios
                               directly), channelTypes.tsx (frontend channel-type
                               registry — see docs/capabilities-and-channel-types.md),
                               echo.ts (Reverb subscriptions), voicePresence.ts,
                               webrtc.ts, voiceCallGuard.ts (see docs/voice.md),
                               clientId.ts (localStorage-persisted per-browser-install id)
    stores/                   Zustand: useMessages, usePresence, useUI, useNotifications,
                               useChannels (see docs/capabilities-and-channel-types.md),
                               useVoice, useVoiceRoster (see docs/voice.md)
    types/                    all shared interfaces + Inertia page-prop types;
                               `ChannelType` is `string`, not a closed union
    test/setup.ts             Vitest setup — @testing-library/jest-dom matchers
    **/*.test.ts(x)           co-located next to the file under test
routes/
  web.php                     guest + auth Inertia routes
  api.php                     /api/* under auth (session), axios targets
  channels.php                broadcast auth: channel.{id} presence, conversation.{id}
                               private, room.{id} private (see docs/
                               capabilities-and-channel-types.md), voice.channel.{id}/
                               voice.conversation.{id} presence (see docs/voice.md)
  console.php
tests/
  Feature/                    one folder per feature area (Auth, Rooms, Channels,
                               Messages, Conversations, Reactions, Uploads, Settings,
                               Broadcasting, Invites, Notifications, Voice, Roles) — routes
                               through the real HTTP kernel
  Unit/Models/                pure model logic (reactionSummary, hasMember, sharesRoomWith, ...)
  Unit/Support/               ChannelFocus cache-logic tests — no HTTP, no RefreshDatabase;
                               PermissionCheckerTest — pure Role/RoleAssignment logic;
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
  Reducer-style: `setMessages / prepend / add / update / remove / setReactions`.
- **Message history is cursor-paginated**, 50/page, walking backwards from the
  oldest loaded message. `useChat.loadMore` + an IntersectionObserver sentinel at
  the top of `MessageList`.
- **File uploads** go to the `public` disk in dev; production swaps
  `FILESYSTEM_DISK=r2` (Cloudflare R2, S3-compatible) — see `config/filesystems.php`.
- **Tailwind palette** is defined in `tailwind.config.js` (surface/brand/status/text).
  Utility classes are applied inline in JSX, not extracted into `@layer components`
  classes — `resources/css/app.css` only holds `@layer base`. When the same class
  string repeats across a component, copy the literal utility string rather than
  introducing a shared CSS class; use `clsx(...)` for conditional variants.
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
    Laravel-reserved name looking available when it isn't. See `docs/notifications.md`.
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
    actually broken, just never wired up. The general lesson: adding a category to
    `DEFAULTS` + the frontend `CATEGORIES` list makes it *visible and configurable*,
    not *functional* — always add or point to the actual `Notification::notify()`
    call site in the same change (see `docs/notifications.md`), and check for it
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
    per-type special case — see `docs/capabilities-and-channel-types.md` — specifically
    so the *next* new channel type (a drawing channel, a music channel, ...) is
    text-incapable by default too, without anyone needing to remember to add another
    `abort_if($channel->type === '...')` check for it. Any new message-adjacent or
    channel-adjacent endpoint should still assume `Channel::find()`/`Channel $channel`
    route binding can resolve to any type and guard explicitly (via `isTextCapable()`
    or a new equivalent) if it only makes sense for some.
31. **There is deliberately no `VITE_TURN_*` env var pair, unlike `REVERB_HOST`/
    `VITE_REVERB_HOST` (trap #21).** Reverb's browser-facing host has to be baked into
    the JS bundle at build time (Echo connects directly on page load), but TURN
    credentials are ephemeral and fetched at runtime from an authenticated endpoint —
    the browser gets the host from that JSON response, not `import.meta.env`. See
    `docs/voice.md`. Don't "fix" the apparent asymmetry by adding a `VITE_TURN_HOST` —
    it would be dead code the bundle never reads.
32. **A presence channel's `.here()` callback only fires once, at the moment its own
    subscription succeeds — Echo/Pusher don't replay it for a callback registered
    afterward.** Early voice code had both `ChannelSidebar` (wanting a read-only
    roster) and `services/webrtc.ts` (wanting to actually join the call) independently
    call `services/echo.ts`'s `joinVoiceChannel()` for the same `voice.channel.{id}`.
    Whichever caller subscribed *second* got the same channel object back — but its
    own `.here()` handler registered on an event that had already fired for the first
    caller, so it silently never received the initial member list. Fixed by
    `services/voicePresence.ts`'s ref-counted `subscribeVoiceRoster()` — see
    `docs/voice.md`. If a future feature wants to observe a voice scope's presence
    directly, it must go through `subscribeVoiceRoster()`, never call `echo.ts`'s
    `joinVoiceChannel()` a second time for the same scope. This same class of bug
    (two independent subscribers to one channel, only one teardown) also applies to
    the per-user `App.Models.User.{id}` channel — see `docs/voice.md`'s note on
    `subscribeVoiceCallGuard()`'s cleanup.
33. **Presence-channel *subscription* is not "being in the call" — don't conflate
    them, that was a real bug here.** The very first version of the sidebar roster
    feature populated `useVoiceRoster` directly from `.here()/.joining()/.leaving()`
    — raw presence membership, which can't distinguish an observer from a real
    participant. The fix was to track "actually in the call" as its own explicit,
    whispered state, completely independent of presence subscription — see
    `docs/voice.md`. If a future voice-adjacent feature needs to know who's *really*
    in a call, it must key off `useVoiceRoster` or `useVoice.selfParticipant` — never
    off a presence channel's raw member list.
34. **New migration files don't apply themselves to the already-running dev
    Postgres volume.** `docker/app/entrypoint.sh` runs `php artisan migrate`
    once, at container boot — adding a migration to the repo afterward (the
    normal case while iterating) does nothing to the live `app` container
    until something explicitly re-runs it. This bit while adding the RBAC
    tables (`roles`/`role_permissions`/`role_assignments`): the backend test
    suite never noticed (`RefreshDatabase` runs every migration fresh against
    sqlite `:memory:` on every test run), but a manual-curl verification
    session against the real dev stack 500'd with `SQLSTATE[42P01]: Undefined
    table: relation "roles" does not exist` until `docker compose exec app php
    artisan migrate --force` was run by hand. If a change adds migrations and
    manual/live verification (see `## Testing`) is part of proving it works,
    run `docker compose exec app php artisan migrate --force` first — don't
    assume the dev DB is already current just because the test suite passes.
35. **`Rule::exists(...)->where($column, false)` silently never matches —
    pass `0`, not `false`.** Laravel's `Exists`/`Unique` validation rules
    aren't a query builder call; `where()` just appends to an array that
    later gets serialized into the classic `exists:table,column,field,"value"`
    string form via `DatabaseRule::formatWheres()`, which runs each value
    through `str_replace('"', '""', $value)` — and PHP's `str_replace`
    coerces a `bool` subject to a *string* first, so `false` becomes `''`
    (empty string) before it ever reaches SQL. The rule silently compiles to
    `is_system,""` instead of `is_system,"0"`, which matches nothing, so
    every id "fails" the exists check with a generic "is invalid" validation
    error — no exception, no hint the `where()` clause itself is the problem.
    Hit this in `Api\RoleController::reorder`'s `Rule::exists('roles',
    'id')->where('is_system', false)`, which rejected every valid custom
    role id. Fixed by passing `0` instead of `false`. If a `Rule::exists()`/
    `Rule::unique()` `->where()` clause targets a boolean column, use `0`/`1`
    — never a literal `false`/`true` — and if a `Rule::exists()` check is
    unexpectedly failing for rows that plainly satisfy every condition,
    suspect a boolean `where()` value before suspecting the data.
36. **`app.tsx`'s Inertia page resolver eagerly globs every `.tsx` file under
    `pages/`, including test files, and executes them all in the browser at
    startup.** `resolve: (name) => import.meta.glob('./pages/**/*.tsx', {
    eager: true })` — `eager: true` means Vite doesn't just register these
    modules, it *runs* them immediately as part of the app bundle. A
    `*.test.tsx` file co-located inside `pages/` (this repo's own convention
    — see `## Testing`) matches the same glob and gets bundled and executed
    in the real browser, not just in Vitest. Its `vi.mock(...)` calls throw
    `Error: Vitest mocker was not initialized in this environment` at page
    load, because Vitest's mocking runtime doesn't exist outside the test
    runner — this broke every page in the browser (not just the page the
    test file was for) the moment `pages/Rooms/Roles.test.tsx` was added,
    since the glob (and the crash) runs once for the whole app, not per-page.
    Fixed with a second, negated glob pattern: `import.meta.glob(['./pages/
    **/*.tsx', '!./pages/**/*.test.tsx'], { eager: true })` — Vite's
    `import.meta.glob` treats a `!`-prefixed pattern in the array as an
    exclusion. This bug was latent from the start (nothing under `pages/`
    happened to be named `*.test.tsx` before), so if a future `.test.tsx`
    file needs to live somewhere this exclusion doesn't cover — a subfolder
    glob pattern changes, for instance — re-verify this still holds rather
    than assuming it does.
37. **A hook shared by multiple mounted consumers must not tie a side effect to any
    one consumer's unmount.** `useVoiceChannel` originally left the call in an
    unmount cleanup ("navigating away from the page mid-call should hang up") — fine
    when only `VoiceChannelPanel`/`VoiceBar` called it (one mounted instance per active
    call, tied to the page actually showing that channel/conversation). Once
    `VoiceChannelSidebarItem` started calling the same hook (to back the sidebar's
    hover join/leave button), a voice channel you'd joined had *two* mounted
    `useVoiceChannel` instances for the same scope — the page's and the sidebar row's.
    Since Inertia re-renders the whole page tree per navigation (no persistent layout —
    see trap #38), switching to any other channel/room unmounted both instances, and
    the cleanup fired `leaveVoice()` even when navigating *back into the same still-open
    call*. `services/webrtc.ts`'s `joinVoice()` already leaves any previously-active
    call itself before joining a new one (`if (currentKey && currentKey !== newKey)
    leaveVoice()`), which is the only "auto-leave" this app actually wants — the
    unmount-triggered leave in the hook was redundant with that and actively wrong once
    a second consumer existed. Removed entirely; a call now only ends via an explicit
    Leave click, joining a different call, or a real socket disconnect. If a future
    voice surface needs its own "left the page" behavior, don't reintroduce this in
    the shared hook — every consumer of `useVoiceChannel` unmounts on every in-app
    navigation, shared hook or page-specific.
38. **Presence (`presence.global`) must not be subscribed from inside a specific
    page component.** `subscribePresence()` used to be called from `Channels/Show.tsx`
    and `DM/Show.tsx`'s own `useEffect`, which meant a user only showed up as "online"
    to everyone else while sitting on one of those two page types — visiting Settings,
    Rooms/Create, or anywhere else silently dropped them off the global roster, and
    every Inertia navigation between page types (no persistent layout in this app — see
    `## Conventions`' `RoomRail` bullet, every page rebuilds its own tree) caused a real
    leave+rejoin blip on the WebSocket. Fixed by driving the subscription from
    `app.tsx` instead, keyed off `auth.user.id` from Inertia's own `router.on('navigate')`
    event (plus the initial page load) rather than any single page's mount lifecycle —
    this is the one place that's genuinely tied to "is someone logged in in this tab,"
    not "which page are they currently on." A future page that needs to know about
    presence should read `usePresence`'s store, never call `subscribePresence()` itself.
    Separately, `.joining()`'s handler had hardcoded every newly-joining member's status
    to `'online'` regardless of their actual `status` column (idle/dnd/invisible) — only
    `.here()`'s initial snapshot used the real value. Both handlers now read `u.status`
    from the presence channel's own payload (`routes/channels.php`'s `presence.global`
    closure already returns it).
39. **`.here()`/`.joining()` only ever fire once, at the moment a tab's own
    `presence.global` subscription is (re)established — a status change afterward
    (Settings, or the forced online/offline `UserStatusService::setStatus` does on
    login/logout) is invisible to every already-connected tab, including the tab that
    made the change itself, until it reconnects.** This was easy to miss before trap
    #38's fix, because the old per-page `subscribePresence()` churned enough on
    ordinary navigation that reconnecting (and re-running `.here()`) happened often
    enough to paper over it. Once presence became one persistent connection for the
    whole tab session, a status change stopped updating anywhere without a hard
    refresh. Fixed with `UserStatusChanged` (`app/Events/UserStatusChanged.php`), a
    `ShouldBroadcast` on `presence.global` fired from `UserStatusService::setStatus()`
    itself (the one place every status mutation already funnels through), and a
    matching `.listen('.UserStatusChanged', ...)` in `subscribePresence()`. Deliberately
    **not** sent `->toOthers()` like this app's other broadcasts (see `## Conventions`)
    — `UserStatusService` is called from plain Inertia requests (Settings, login,
    logout), which never carry the `X-Socket-ID` header axios adds, so `toOthers()`
    would have nothing to exclude; broadcasting to everyone including the user who
    changed it keeps the live update on one path instead of also threading a local
    optimistic update through every call site. Any future status-adjacent change
    should go through `UserStatusService`, not a direct `$user->update(['status' =>
    ...])`, or it silently won't broadcast.
40. **`subscribeVoiceRoster`'s ref-counted teardown originally assumed the last
    subscriber's unmount and the next subscriber's mount happen in the same tick** —
    true for a React StrictMode double-invoke, false for an Inertia page navigation,
    which is an async fetch. Double-clicking a voice channel's sidebar name to join it
    also navigates there on the underlying single clicks (a double-click is two clicks
    then a dblclick — see the "New voice-adjacent feature" recipe), and that
    navigation unmounts every current subscriber (`ChannelSidebar`'s row,
    `VoiceChannelPanel`) before the new page's own subscribers mount moments later.
    With the original immediate-teardown-at-refCount-0 logic, that gap tore down the
    underlying presence channel and wiped `useVoiceRoster` via `clearRoster` — then the
    new page's subscribers rebuilt it from a fresh, genuinely network-round-trip-slow
    `.joining()`/call-state handshake. Visibly: everyone already in the call would
    disappear from the roster, then the joining user would appear, then everyone else
    would reappear as their whispers arrived — looked exactly like a state management
    bug even though each individual store update was correct. Fixed with a grace
    period (`TEARDOWN_GRACE_MS`, 5s) in `services/voicePresence.ts`: refCount hitting 0
    schedules the real teardown instead of running it inline, and a resubscribe for the
    same scope within that window cancels it and reuses the still-alive subscription
    (and its already-populated roster) instead of rejoining from scratch. Don't remove
    this grace period to "simplify" the ref-counting back to synchronous — the whole
    point is covering a gap that isn't guaranteed to be zero-width.

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
  the capability/group keys you want granted and register it in
  `ChannelTypeServiceProvider::boot()`. No separate allow-list to update —
  `hasCapability()` resolves through `FeatureRegistry` automatically. On the frontend,
  add a matching entry to `services/channelTypes.tsx`'s `REGISTRY` (icon/label/order/
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
- **Instance-wide (global) role management UI.** The `Role`/`RolePermission`/
  `RoleAssignment` schema and `PermissionChecker` (see `docs/roles-and-permissions.md`)
  already fully support a `room_id: null` global role that grants a permission in
  every room — this was built deliberately, not as a stub — but there is no UI to
  create or assign one yet, nor a concept of who is allowed to create one (an
  instance-admin/superuser notion this app doesn't have at all today). Needs: a "who
  can manage global roles" seam (almost certainly *not* `PermissionChecker` itself,
  since that would be circular), a settings surface outside any single room's context,
  and a decision on bootstrapping the very first instance admin (env var? first
  registered user? a console command?).
- **More `Permission` cases getting real enforcement, and the user-hierarchy
  comparison they need.** `ManageMembers` (kick), `BanMembers`,
  `ManageMessages` (delete/pin others' messages), and `ManageEmojis` are
  declared in `App\Support\Permission` but have no `PermissionChecker::can()`
  call site anywhere yet — see the trap-#24-shaped warning in
  `docs/roles-and-permissions.md`. Each needs the actual moderation feature built (a
  kick endpoint, a ban list, etc.), not just a permission check. See `docs/
  roles-and-permissions.md`'s "The hierarchy is broader than role management" section
  for the comparison semantics a moderation action needs — don't reuse `RolePolicy::
  manage`'s exact shape for it without picking the right one deliberately.
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
