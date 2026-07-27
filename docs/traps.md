# Traps already hit — do NOT reintroduce

[← All docs](README.md)

Every one of these was a real bug or a real confusing hour, discovered by hitting it once
in this repo. They are grouped by the subsystem they belong to, not by when they were
found — each group also lives, in short-bullet form, under a "Traps" note in that
subsystem's own doc, linking back here. Original trap numbers are kept in parentheses so
old references/commit messages still resolve.

## Infrastructure, Docker, and Laravel bootstrap

1. **(#1) `config/app.php` must have NO `'providers'` key.** Since Laravel 11's
   bootstrap-based app structure, an empty `providers` array disables ALL
   framework providers → "Target class [files] does not exist". Providers
   live in `bootstrap/providers.php`.
2. **(#4) Named volumes overlay bind mounts.** The whole project is bind-mounted
   (`.:/var/www/html`), which would clobber the image's `vendor/`, so `vendor`,
   `storage/framework`, `storage/logs`, `storage/app`, `bootstrap/cache`,
   `node_modules` are all named volumes. Named volumes mount root-owned, so the
   entrypoint chowns storage + bootstrap/cache to `www-data` every boot.
3. **(#7) No Horizon.** It needs `pcntl` and broke on the Windows host. Queues run via
   plain `php artisan queue:work` in the `worker` service.
4. **(#8) Dockerfile composer stage** uses `php:8.4-cli-alpine` + composer binary +
   `--ignore-platform-reqs --no-scripts`; `package:discover` runs in the entrypoint,
   not at build (no booted app at build time). `pecl redis` needs
   `autoconf g++ make` (added then `apk del`).
5. **(#9) Seeding is never automatic.** The entrypoint does not seed. Fresh builds are
   a clean slate; seed only on explicit request.
6. **(#11) Composer only lived in the build stage.** `vendor/` is a named volume
   populated `--no-dev` at image build time, and with no local PHP there was
   no way to install dev-only packages (phpunit, mockery, collision) short of
   a full rebuild. The Dockerfile now also copies the composer binary into
   the runtime stage, so `docker compose exec app composer ...` works
   directly for future dependency changes.
7. **(#14) Laravel 13 requires PHP >= 8.3.** The security fixes for the CRLF-in-email-rule
   and signed-URL-path-confusion advisories were never backported to the 11.x
   branch (11.55.0 was still the latest 11.x release and still vulnerable), so
   fixing them meant a real major-version upgrade, not a constraint bump. Both
   Dockerfile stages now use `php:8.4-*-alpine`; `laravel/sanctum`,
   `laravel/reverb`, and `inertiajs/inertia-laravel` didn't need version bumps,
   just a `composer update`. `HasUuids` also now generates UUIDv7 (time-ordered)
   instead of UUIDv4 as of Laravel 12 — ids still work everywhere the same way,
   but don't be surprised if they sort chronologically.
8. **(#17) `config/mail.php` didn't exist either** (same shape as trap #12 below) — no
   mail had ever been sent from this app. Added it hand-written, pointed at a new
   `mailpit` docker-compose service (SMTP on 1025, web UI on `localhost:8025`)
   as the dev mailer, so invite emails are visible without any real SMTP
   credentials. `phpunit.xml` pins `MAIL_MAILER=array` so the test suite never
   tries to reach it (tests use `Mail::fake()` regardless). `MAIL_MAILER` is
   the switch for which mailer is active — `mailpit` (dev default), `smtp`
   (any real provider), `ses`, `log`, `array` are all defined in
   `config/mail.php`; see the README's `## Email` table before adding another.
9. **(#18) The `worker` container is a long-running daemon (`queue:work`) that reads
   `.env` once at process start**, unlike `app`/`nginx` requests which
   re-bootstrap (and re-read `.env` via dotenv) on every request. Adding new
   env vars (e.g. the `MAIL_*` ones for trap #17) to `.env` does nothing for
   already-running queue workers — `docker compose restart worker` is required,
   or queued jobs that depend on the new vars (like `RoomInviteMail`, which
   `implements ShouldQueue`) fail silently into `failed_jobs` using stale
   config. Same would apply to `reverb` if its config vars changed.
10. **(#19) Laravel 11+'s zero-config skeleton means `config/mail.php` and
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
11. **(#20) `/join/{code}` was `POST`-only (`RoomController::join`) with no frontend
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
12. **(#23) `app`, `worker`, and `reverb` build from the same `docker/app/Dockerfile` but
    are three separate images** — rebuilding one (e.g. `docker compose up -d --build
    app`) does not rebuild the others. `reverb` drifted to a stale PHP 8.2 image
    while `app`/`worker` were rebuilt onto PHP 8.4 (trap #14), it kept running fine
    because the long-lived `reverb:start` process doesn't reload anything, but the
    moment it was restarted it crash-looped on `Composer detected issues in your
    platform: ... require PHP >= 8.4.1. You are running 8.2.32` — the container's own
    PHP binary against the (named-volume, shared) `vendor/` built for 8.4. Fixed with
    `docker compose build reverb && docker compose up -d reverb`. If any single
    service is rebuilt or its base image bumped, rebuild all three
    (`docker compose up -d --build app worker reverb`) or the others will look fine
    until their next restart.
13. **(#28) Changing `DB_DATABASE`/`DB_USERNAME` in `.env` does not rename anything inside an
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
    recreate it under the new name — is simpler but discards all dev data.
14. **(#34) New migration files don't apply themselves to the already-running dev
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
    manual/live verification is part of proving it works, run `docker compose
    exec app php artisan migrate --force` first — don't assume the dev DB is
    already current just because the test suite passes.
15. **(#29) Adding the `coturn` service's wide relay port range (`49160-49200/udp`, 41 ports)
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

16. **(#52) nginx has no `client_max_body_size` by default — 1 MB, well under any
    real image/video upload.** A request over that limit gets a 413 from nginx itself,
    before it ever reaches php-fpm/Laravel, regardless of what `upload_max_filesize`/
    `post_max_size` in `docker/app/php.ini` or the app's own validation (`config/
    uploads.php`'s `max_size_kb`) allow. `docker/nginx/default.conf` now sets
    `client_max_body_size` explicitly, comfortably above the app-level limit. The three
    layers (nginx, php.ini, `config/uploads.php`) are independent ceilings/limits that
    must be kept in that relative order (nginx/php.ini >= `config/uploads.php`) — raising
    only the Laravel-level config value without also raising the other two just moves
    the 413 to a lower, still-wrong threshold instead of fixing it.

17. **(#53) `app_storage` (the named volume holding `storage/app`, and so
    `storage/app/public` — every uploaded file) was mounted into `app`/`worker`/`reverb`
    but not `nginx`.** `public/storage` is an absolute-path symlink
    (`/var/www/html/storage/app/public`, made by `storage:link`), and nginx serves
    `/storage/*` as a static file straight off disk via `try_files`. Without the volume
    mounted, nginx's copy of that path resolved through the bind-mounted host repo
    instead of the named volume — an empty directory — so every upload 404'd (Laravel's
    catch-all route, not nginx's own 404) no matter how correct the upload/API/frontend
    layers were. The failure mode looks like a frontend bug, not an infra one: a 404'd
    `<img>` renders its `alt` text (the filename) in place of the broken image, and a
    `<video>` fed an HTML error page instead of real bytes throws exactly "no video with
    supported format and MIME type found." `docker-compose.yml` now mounts
    `app_storage:/var/www/html/storage/app:ro` into `nginx` too. If a newly-uploaded
    file's URL 404s (or a browser reports a format/MIME error for a file you can prove
    decodes fine), curl the URL directly and check whether nginx or Laravel answered
    (`X-Powered-By: PHP` means Laravel's catch-all, i.e. nginx never found the file on
    disk) before suspecting the application code.

### Model/table naming

18. **(#3) Model table names.** Laravel's pluralizer treats "Emoji" as already plural.
    `CustomEmoji` needs `protected $table = 'custom_emojis'`. Check the pluralizer
    before trusting a convention-derived table name.
19. **(#22) The `user_notifications` table is deliberately not named `notifications`.**
    Laravel's own `Illuminate\Notifications\Notifiable` trait (used by `User` for
    password-reset emails) defines a `notifications()` MorphMany that expects a
    `notifications` table with `notifiable_type`/`notifiable_id` morph columns — a
    different shape than this app's simple `user_id`-keyed one. Naming this app's
    table `notifications` would silently collide the day anything calls
    `$user->notify(...)` with the `database` channel. The model (`app/Models/
    Notification.php`) sets `protected $table = 'user_notifications'` and the `User`
    relation is `appNotifications()`, not `notifications()`, so it doesn't shadow the
    trait method either. Same shape of trap as #3 — a Laravel-reserved name looking
    available when it isn't. See [notifications.md](notifications.md).

## Auth & sessions

20. **(#2) `/api/*` needs stateful Sanctum.** `bootstrap/app.php` prepends
    `EnsureFrontendRequestsAreStateful` to the `api` middleware group, and axios
    sets `withCredentials` + `withXSRFToken`. Without both, every `/api` call 401s.
21. **(#27) A `curl`-driven session against `/api/*` 401s with `{"message":"Unauthenticated."}`
    even with a valid, freshly-logged-in `communityhub_session` cookie in the jar — unless
    the request also carries a `Referer` (or `Origin`) header matching one of
    `SANCTUM_STATEFUL_DOMAINS` (`config/sanctum.php`; defaults include
    `localhost:8000`).** A real browser sends this automatically on every request, so
    it's invisible in normal frontend dev, but `curl -b cookies.txt
    /api/conversations/candidates` with no `Referer` silently falls through to
    Sanctum's stateless (bearer-token) guard, finds no token, and 401s — with the
    session cookie itself perfectly valid, which makes it look like the login didn't
    work when it did. Add `-H "Referer: http://localhost:8000/"` to any manual-curl
    verification session (see `CLAUDE.md`'s "Manual/live verification" section) and
    it resolves the same way a browser's request would.

## Frontend/CSS

22. **(#5) `@apply group` is illegal.** `group` is a marker class; apply it in JSX, not
    in a CSS `@apply` rule.
23. **(#6) Flex sidebars need `min-h-0`** on the scrolling `<nav>` or the UserPanel gets
    pushed off-screen.
24. **(#16) `@routes` in `app.blade.php` with no Ziggy installed renders as literal
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
25. **(#36) `app.tsx`'s Inertia page resolver eagerly globs every `.tsx` file under
    `pages/`, including test files, and executes them all in the browser at
    startup.** `resolve: (name) => import.meta.glob('./pages/**/*.tsx', {
    eager: true })` — `eager: true` means Vite doesn't just register these
    modules, it *runs* them immediately as part of the app bundle. A
    `*.test.tsx` file co-located inside `pages/` (this repo's own convention)
    matches the same glob and gets bundled and executed in the real browser,
    not just in Vitest. Its `vi.mock(...)` calls throw `Error: Vitest mocker
    was not initialized in this environment` at page load, because Vitest's
    mocking runtime doesn't exist outside the test runner — this broke every
    page in the browser (not just the page the test file was for) the moment
    `pages/Rooms/Roles.test.tsx` was added, since the glob (and the crash)
    runs once for the whole app, not per-page. Fixed with a second, negated
    glob pattern: `import.meta.glob(['./pages/**/*.tsx', '!./pages/**/*.test.tsx'],
    { eager: true })` — Vite's `import.meta.glob` treats a `!`-prefixed
    pattern in the array as an exclusion. This bug was latent from the start
    (nothing under `pages/` happened to be named `*.test.tsx` before), so if a
    future `.test.tsx` file needs to live somewhere this exclusion doesn't
    cover — a subfolder glob pattern changes, for instance — re-verify this
    still holds rather than assuming it does.
26. **(#43) `min-h-screen` does not make a page scrollable — `h-screen` does.**
    `Settings/Index.tsx` used `min-h-screen bg-surface-600 overflow-y-auto` as its
    root div, and as the Voice settings tab grew (device pickers, audio-processing
    toggles, mic test, sensitivity controls) the page silently stopped scrolling to
    reveal the overflow. `min-height` has no upper bound, so the div just grows
    taller than the viewport instead of ever exceeding *its own* height — and
    `overflow-y-auto` only ever activates when an element's content exceeds that
    same element's own bounded height. The actual clip happens further up, at
    `body` (`resources/css/app.css`'s `overflow-hidden` combined with
    `app.blade.php`'s `html`/`body` both being `h-full`) — `body` silently cuts off
    anything taller than the viewport before the inner `overflow-y-auto` div ever
    gets a chance to engage. Every other page in this app follows the convention
    documented in `CLAUDE.md`'s `RoomRail` bullet — root `flex flex-col h-screen`
    (a real, fixed height matching `body`), then `flex flex-1 min-h-0` for the row
    underneath — specifically so the scrollable region has a real bound to overflow
    against; `Settings/Index.tsx` was the one page that didn't follow it. Fixed by
    changing `min-h-screen` to `h-screen`. If a future page (a modal, a
    settings-style panel) isn't scrolling when its content should overflow, check
    for exactly this `min-h-screen`-instead-of-`h-screen` shape before assuming the
    content itself or `overflow-y-auto` placement is wrong.

## Testing

27. **(#10) `pdo_sqlite`/`sqlite3` are already in the PHP image** (bundled with
    `php:8.4-fpm-alpine`) — no Dockerfile change was needed to add the test
    suite's in-memory SQLite connection in `config/database.php`.
28. **(#12) `config/inertia.php` didn't exist**, so Inertia fell back to its package
    defaults: `page_paths` pointed at `resources/js/Pages` (capital P — this
    repo uses lowercase `pages`) and `ssr.enabled` defaulted to `true` with no
    SSR bundle or service anywhere in the stack. The first broke
    `assertInertia()->component(...)` in every test ("component file does not
    exist"); the second meant every page render silently attempted (and
    swallowed the failure of) an SSR HTTP call. `config/inertia.php` now pins
    the real page path and turns SSR off explicitly.
29. **(#15) Vitest 4's `vi.fn().mockImplementation(fn)` respects real constructor
    semantics** — if the mocked module is invoked with `new` (e.g. mocking
    `laravel-echo`'s default export), the implementation must be a `function`,
    not an arrow function, or `new` throws "is not a constructor". This broke
    `echo.test.ts`'s `laravel-echo` mock when bumping vitest 2 → 4 (`npm audit
    fix --force`, needed to clear the esbuild/vite dev-server advisories since
    they aren't fixed on any vite version vitest 2 can depend on).
30. **(#25) Vitest's default `forks` pool is unstable inside the `vite` container** —
    workers randomly segfault or time out (`Worker exited unexpectedly` / `Timeout
    terminating forks worker`), a different test file each run, with no code change
    involved; a failed run tells you nothing about correctness. `vitest.config.ts` now
    pins `pool: 'threads'`, which doesn't fork a child process per file and has run
    clean repeatedly where `forks` failed roughly 1 run in 2. If `npm run test` ever
    reports a file-level crash (not a normal assertion failure) rather than a specific
    failing test, suspect this class of issue again before suspecting the test itself
    — rerun with `npx vitest run --pool=threads` to check whether it's real.
31. **(#26) `assertJsonFragment` checks that each field's value appears *somewhere* in the
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

## Realtime & presence (general)

32. **(#13) `Broadcast::channel()` registers against whatever the *default*
    broadcaster is at the moment `routes/channels.php` runs** (app boot), not
    at request time. Switching `config(['broadcasting.default' => ...])`
    later (e.g. mid-test) does not move the already-registered channel
    closures onto the new driver — you have to re-`require
    base_path('routes/channels.php')` after switching, or the new driver's
    channel registry is empty and every `/broadcasting/auth` call 403s with
    "no channel matched," authorized or not.
33. **(#21) `REVERB_HOST` cannot be one value for both the browser and the app/worker
    containers.** The browser (via `VITE_REVERB_HOST` → `services/echo.ts`) needs
    `localhost`, since it's reaching Reverb through the port docker-compose publishes
    to the host. But the `app`/`worker` containers use the *same-named* `REVERB_HOST`
    in `config/broadcasting.php`'s `reverb` connection to PUBLISH events — that's an
    HTTP call from inside the `app`/`worker` container's own network namespace, where
    `localhost` means itself, not the `reverb` service. With both vars pointing at
    `localhost`, every broadcast — messages, reactions, notifications — silently
    failed with `Pusher error: cURL error 7: Failed to connect to localhost:8080` on
    the queue worker (visible in `storage/logs/laravel.log` and `php artisan
    queue:failed`), while the HTTP request that triggered it still returned 200 — so
    this reads as "real-time doesn't work" with no error surfaced anywhere the user
    would look. Fixed by decoupling them: `REVERB_HOST=reverb` (the docker-compose
    service name, server-side) and `VITE_REVERB_HOST=localhost` hardcoded
    (browser-facing), no longer interpolated from the same var. If real-time delivery
    of *anything* silently stops working, check `queue:failed` /
    `storage/logs/laravel.log` for this exact cURL error before assuming the bug is in
    application code — and remember `docker compose restart worker` after touching
    either var.
34. **(#38) Presence (`presence.global`) must not be subscribed from inside a specific
    page component.** `subscribePresence()` used to be called from `Channels/Show.tsx`
    and `DM/Show.tsx`'s own `useEffect`, which meant a user only showed up as "online"
    to everyone else while sitting on one of those two page types — visiting Settings,
    Rooms/Create, or anywhere else silently dropped them off the global roster, and
    every Inertia navigation between page types (no persistent layout in this app)
    caused a real leave+rejoin blip on the WebSocket. Fixed by driving the subscription
    from `app.tsx` instead, keyed off `auth.user.id` from Inertia's own
    `router.on('navigate')` event (plus the initial page load) rather than any single
    page's mount lifecycle — this is the one place that's genuinely tied to "is
    someone logged in in this tab," not "which page are they currently on." A future
    page that needs to know about presence should read `usePresence`'s store, never
    call `subscribePresence()` itself. Separately, `.joining()`'s handler had
    hardcoded every newly-joining member's status to `'online'` regardless of their
    actual `status` column — see [status.md](status.md)'s own trap note for the fix.

## Voice — see [voice.md](voice.md) for the full design these traps sit inside

35. **(#29) coturn port-range/Docker networking** — see the Infrastructure group above
    (shared with every other published port, not voice-specific in cause).
36. **(#31) There is deliberately no `VITE_TURN_*` env var pair, unlike `REVERB_HOST`/
    `VITE_REVERB_HOST`.** Reverb's browser-facing host has to be baked into the JS
    bundle at build time (Echo connects directly on page load), but TURN credentials
    are ephemeral and fetched at runtime from an authenticated endpoint — the browser
    gets the host from that JSON response, not `import.meta.env`. Don't "fix" the
    apparent asymmetry by adding a `VITE_TURN_HOST` — it would be dead code the bundle
    never reads.
37. **(#32) A presence channel's `.here()` callback only fires once, at the moment its own
    subscription succeeds — Echo/Pusher don't replay it for a callback registered
    afterward.** Early voice code had both `ChannelSidebar` (wanting a read-only
    roster) and `services/webrtc.ts` (wanting to actually join the call) independently
    call `services/echo.ts`'s `joinVoiceChannel()` for the same `voice.channel.{id}`.
    Whichever caller subscribed *second* got the same channel object back — but its
    own `.here()` handler registered on an event that had already fired for the first
    caller, so it silently never received the initial member list. Fixed by
    `services/voicePresence.ts`'s ref-counted `subscribeVoiceRoster()`. If a future
    feature wants to observe a voice scope's presence directly, it must go through
    `subscribeVoiceRoster()`, never call `echo.ts`'s `joinVoiceChannel()` a second
    time for the same scope. This same class of bug (two independent subscribers to
    one channel, only one teardown) also applies to the per-user
    `App.Models.User.{id}` channel — see `subscribeVoiceCallGuard()`'s cleanup note
    below.
38. **(#33) Presence-channel *subscription* is not "being in the call" — don't conflate
    them, that was a real bug here.** The very first version of the sidebar roster
    feature populated `useVoiceRoster` directly from `.here()/.joining()/.leaving()`
    — raw presence membership, which can't distinguish an observer from a real
    participant. The fix was to track "actually in the call" as its own explicit,
    whispered state, completely independent of presence subscription. If a future
    voice-adjacent feature needs to know who's *really* in a call, it must key off
    `useVoiceRoster` or `useVoice.selfParticipant` — never off a presence channel's
    raw member list.
39. **(#37) A hook shared by multiple mounted consumers must not tie a side effect to any
    one consumer's unmount.** `useVoiceChannel` originally left the call in an
    unmount cleanup ("navigating away from the page mid-call should hang up") — fine
    when only `VoiceChannelPanel`/`VoiceBar` called it. Once `VoiceChannelSidebarItem`
    started calling the same hook, a voice channel you'd joined had *two* mounted
    `useVoiceChannel` instances for the same scope. Since Inertia re-renders the whole
    page tree per navigation, switching to any other channel/room unmounted both
    instances, and the cleanup fired `leaveVoice()` even when navigating *back into
    the same still-open call*. `services/webrtc.ts`'s `joinVoice()` already leaves any
    previously-active call itself before joining a new one, which is the only
    "auto-leave" this app actually wants. Removed the unmount-triggered leave entirely
    — a call now only ends via an explicit Leave click, joining a different call, or a
    real socket disconnect. Every consumer of `useVoiceChannel` unmounts on every
    in-app navigation, shared hook or page-specific — don't reintroduce a leave there.
40. **(#40) `subscribeVoiceRoster`'s ref-counted teardown originally assumed the last
    subscriber's unmount and the next subscriber's mount happen in the same tick** —
    true for a React StrictMode double-invoke, false for an Inertia page navigation,
    which is an async fetch. Double-clicking a voice channel's sidebar name to join it
    also navigates there on the underlying single clicks, and that navigation unmounts
    every current subscriber before the new page's own subscribers mount moments
    later. With immediate-teardown-at-refCount-0 logic, that gap tore down the
    underlying presence channel and wiped `useVoiceRoster` — then the new page's
    subscribers rebuilt it from a fresh, genuinely network-round-trip-slow handshake.
    Visibly: everyone already in the call would disappear, then reappear one by one —
    looked exactly like a state management bug even though each individual store
    update was correct. Fixed with a grace period (`TEARDOWN_GRACE_MS`, 5s) in
    `services/voicePresence.ts`: refCount hitting 0 schedules the real teardown
    instead of running it inline, and a resubscribe for the same scope within that
    window cancels it and reuses the still-alive subscription instead of rejoining
    from scratch. Don't remove this grace period to "simplify" the ref-counting back
    to synchronous — the whole point is covering a gap that isn't guaranteed to be
    zero-width.
41. **(#42) A value captured once at `joinVoice()` time is not "live" just because a
    Settings page can change it** — the mic-sensitivity threshold
    (`VoiceDevicePreference.send_threshold`) was originally passed into
    `startVoiceActivation()` as a plain `number` argument, baked in at join time.
    Adjusting the slider in `AudioSettings` while already in a call did nothing —
    not a bug in the gating math, just nothing left to read the new value until the
    user left and rejoined. Separately, `AudioSettings.tsx`'s "Test Microphone"
    loopback rendered the same threshold as a marker line on the meter but never
    actually gated the loopback `<audio>` playback on it — the marker was purely
    cosmetic. Both were reported as "the sensitivity slider clearly isn't working,"
    which two rounds of fixing OTHER things (logarithmic meter math,
    `autoGainControl: false`) didn't touch, because neither was actually the
    threshold-reactivity problem. Fixed by `stores/index.ts`'s `useMicSensitivity` (a
    live, shared store, deliberately *not* part of `useVoice` since `useVoice.reset()`
    on every `leaveVoice()` would wipe a persisted preference) and changing
    `startVoiceActivation()`'s signature to take a `getThresholds: () =>
    ThresholdPair` re-read every tick. The general lesson: when a "live adjustable"
    control is threaded through a value captured at connection/session start, and a
    user reports "changing it does nothing," check for exactly this shape of bug
    before assuming the underlying feature is broken — and don't declare a
    hardware/audio-behavior bug fixed from passing unit tests alone; unit tests here
    exercise wiring with synthetic signals, not real microphone/DSP behavior.
42. **(#44) A single per-frame `computeLevel()` reading is not a substitute for peak
    tracking, and removing the peak-hold layer to "simplify" the level meter or gate
    would reintroduce a real, reported bug.** `computeLevel()` is an instantaneous RMS
    over one small (~10ms) analyser window, sampled once per animation frame
    (~16ms) — real speech varies enormously frame-to-frame, so a genuine spike can
    land entirely between two sampled windows and never register, and a sustained
    word can dip under a threshold for a single frame from sampling luck alone.
    Reported symptom: the mic-test level meter visibly failing to reach the
    sensitivity marker on a real spike, and — more subtly — voice-activation
    hysteresis appearing to only ever respect the lower close threshold, because the
    higher open threshold's bar was inconsistently sampled. `services/audioLevel.ts`'s
    `createPeakHold()` (fast-attack, slow-decay — the same technique real VU meters
    use) sits between every `computeLevel()` call and its consumer in both
    `services/voiceActivation.ts` and `AudioSettings.tsx`'s mic-test tick loop. Don't
    strip this back to a bare `computeLevel()` call thinking it's redundant
    indirection — it's the fix for a real, user-reported failure mode, not
    speculative hardening.
43. **(#45) `null` is a meaningful stored value for `close_threshold_timeout_ms`
    ("Off"), not "field omitted" — `??`/`?:` coalescing would silently erase it.**
    Same shape as the `Rule::exists()` boolean gotcha in
    [roles-and-permissions.md](roles-and-permissions.md)'s own trap note: a
    falsy-ish value that PHP's short-circuit operators treat as "absent." Both
    `Api\VoiceDevicePreferenceController::update()` (`array_key_exists(...)` instead
    of `$validated['close_threshold_timeout_ms'] ?? 2000`) and
    `UserSettingsService::devicePreference()` (`$preference ? $preference->
    close_threshold_timeout_ms : 2000`, not `$preference?->close_threshold_timeout_ms
    ?? 2000`) have to distinguish "no request field / no stored row" (→ default
    `2000`) from "the value is explicitly `null`" (→ stays `null`, meaning the
    hang-time force-close is off). If a future nullable preference field is added,
    check whether `null` is a real state or genuinely means "unset" before reaching
    for `??`.

## Status — see [status.md](status.md)

44. **(#39) `.here()`/`.joining()` only ever fire once, at the moment a tab's own
    `presence.global` subscription is (re)established — a status change afterward
    (the status popover, or the forced online/offline `UserStatusService::setStatus`
    does on login/logout) is invisible to every already-connected tab, including the
    tab that made the change itself, until it reconnects.** This was easy to miss
    before the `presence.global`-lives-in-`app.tsx` fix (see the Realtime group
    above), because the old per-page `subscribePresence()` churned enough on
    ordinary navigation that reconnecting happened often enough to paper over it.
    Once presence became one persistent connection for the whole tab session, a
    status change stopped updating anywhere without a hard refresh. Fixed with
    `UserStatusChanged` (`app/Events/UserStatusChanged.php`), a `ShouldBroadcast` on
    `presence.global` fired from `UserStatusService::setStatus()` itself, and a
    matching `.listen('.UserStatusChanged', ...)` in `subscribePresence()`.
    Deliberately **not** sent `->toOthers()` — `UserStatusService` is called from
    plain Inertia requests (login, logout) and Api endpoints, none of which carry
    the `X-Socket-ID` header axios adds, so `toOthers()` would have nothing to
    exclude. Any future status-adjacent change should go through
    `UserStatusService`, not a direct `$user->update(['status' => ...])`, or it
    silently won't broadcast.
45. **(#41) Status went through two overcomplicated designs before landing on the current
    one — a single `status` column with 5 values, where `custom_status`/
    `custom_status_color` only ever hold something when `status === 'custom'`.**
    Earlier iterations tried to track a plain status and a custom status as two
    semi-independent things (separate `setStatus()`/`setCustomStatus()`/
    `setStatusAndClearCustom()` methods, a frontend merge step, then a monotonic
    `updatedAt` guard bolted on to fix an out-of-order-broadcast symptom that design
    created). Each fix added real complexity to work around a problem the *data
    model itself* caused. The 5-value model makes it structurally impossible: every
    status change goes through one `UserStatusService::setStatus()` call and always
    sets all three columns together. If a future status-adjacent feature is tempted
    to add a second "is custom active" flag alongside `status`, or a second write
    path that doesn't go through `UserStatusService::setStatus()`, don't — that
    reintroduces the exact shape of bug this rebuild removed.

## Messages & pagination — see [messages-and-pagination.md](messages-and-pagination.md)

46. **(#46) A message store that drops messages must record *that* it dropped them —
    "not loaded" and "does not exist" are different states, and conflating them
    silently loses messages.** The client holds a 150-message window, so paging up
    far enough trims the newest rows out of memory. The first thing that breaks if
    the trim isn't recorded as an explicit `hasNewer`/`newerCursor` pair is the live
    socket: `useMessages.add` appends an arriving `MessageSent` to the end of the
    array, which — with unfetched messages sitting between the window's newest row
    and that one — renders a gap as though it were contiguous history, with nothing
    anywhere reporting a problem. The same reasoning is why `services/
    messageCache.ts` refuses to serve a partial page, refuses a cursor its run
    doesn't contain, and refuses `appendLive` onto a run that has fallen behind the
    tail. Any future change to windowing, the cache, or live message handling needs
    to keep "I know I am missing something here" a real, stored fact rather than
    something inferred from array length.
47. **(#47) `has_more`/`next_cursor` was renamed to `has_older`/`older_cursor` +
    `has_newer`/`newer_cursor` in one pass, deliberately.** Once the messages
    endpoint gained an `?after=` direction, a field literally called `has_more`
    sitting next to `has_newer` is a trap — nothing in the name says which direction
    "more" is, and a caller reading the wrong one gets plausible-looking wrong
    behaviour rather than a type error. The same rename covered `PaginatedMessages`
    in `types/index.ts` and every caller/test, so there is no half-migrated name
    left; don't reintroduce a direction-less name for a two-directional cursor.
48. **(#48) `offsetTop` is only measured from the scroll container if that container
    is the `offsetParent`.** `MessageList`'s scroll anchoring reads `row.offsetTop`
    and compares it to `container.scrollTop`; those are only in the same coordinate
    space because the container carries `relative`. Without it, `offsetParent`
    walks up to whatever positioned ancestor exists (or the body), every reading is
    off by a constant, and the restore silently scrolls to the wrong place — no
    error, just a jump on every page load. The `relative` on that div is
    load-bearing, not decoration.

## Roles & permissions — see [roles-and-permissions.md](roles-and-permissions.md)

49. **(#35) `Rule::exists(...)->where($column, false)` silently never matches —
    pass `0`, not `false`.** Laravel's `Exists`/`Unique` validation rules aren't a
    query builder call; `where()` just appends to an array that later gets
    serialized into the classic `exists:table,column,field,"value"` string form via
    `DatabaseRule::formatWheres()`, which runs each value through
    `str_replace('"', '""', $value)` — and PHP's `str_replace` coerces a `bool`
    subject to a *string* first, so `false` becomes `''` (empty string) before it
    ever reaches SQL. The rule silently compiles to `is_system,""` instead of
    `is_system,"0"`, which matches nothing, so every id "fails" the exists check
    with a generic "is invalid" validation error — no exception, no hint the
    `where()` clause itself is the problem. Hit this in
    `Api\RoleController::reorder`'s `Rule::exists('roles', 'id')->where('is_system',
    false)`, which rejected every valid custom role id. Fixed by passing `0` instead
    of `false`. If a `Rule::exists()`/`Rule::unique()` `->where()` clause targets a
    boolean column, use `0`/`1` — never a literal `false`/`true` — and if a
    `Rule::exists()` check is unexpectedly failing for rows that plainly satisfy
    every condition, suspect a boolean `where()` value before suspecting the data.

50. **`BelongsToMany::attach()`/`sync()` bypass `HasUuids`' id generation — write
    pivot rows with UUID PKs through their own model, not attach()/sync().** Every
    UUID-PK pivot table in this app (`role_permissions`, `role_assignments`,
    `channel_role_visibility`) generates its `id` via `HasUuids`' `creating` model
    event. `attach()`/`sync()` on a `BelongsToMany` relation insert pivot rows with a
    bulk query-builder statement, not by instantiating and saving an Eloquent model —
    so the `creating` event never fires, `id` is never set, and the insert throws a
    `NOT NULL constraint failed` (sqlite) / equivalent integrity error at the database
    layer. Hit this building `Channel::visibilityRoles()->sync($roleIds)` in
    `Api\ChannelController::updateVisibility` — every insert failed. Fixed by writing
    through the `ChannelRoleVisibility` model directly (`::create()`/`::delete()` by
    id pair) instead of `sync()`, matching how `role_permissions`/`role_assignments`
    were already written through their own models elsewhere in this codebase rather
    than pivot helpers — that existing pattern was the answer, not a new one. If a new
    UUID-PK join table needs `attach`/`detach`/`sync`-shaped semantics, either give the
    pivot model an explicit `id` before insert, or just don't use those helpers.

51. **A safety-net check gated on `if ($model->relation)` silently stops applying the
    moment that relation can be legitimately null/absent — audit the null case
    explicitly, don't assume "no relation" means "guard doesn't apply here."**
    `Api\RoleController::removeMember`/`destroy`'s "every user needs at least one role"
    fallback (reassign to the default role, or hard-block removing the last one) used
    to be wrapped in `if ($role->room) { ... }`, written back when every `Role` was
    room-scoped and `$role->room` was just a defensive null-check. Once global roles
    (`room_id: null`) shipped, `$role->room` is *always* falsy for one, so the entire
    fallback/hard-block block silently stopped running for global roles — a global
    role holder could be removed from their last global role with no fallback and no
    block, leaving them with zero roles at the instance level, contradicting the
    documented "every user needs at least one role" invariant with no error of any
    kind. Caught by asking "does this room-shaped guard still apply now that a
    room-shaped precondition itself is nullable?" rather than by a failing test (none
    existed for the global-scope case until added alongside the fix). Fixed by
    comparing on `room_id` directly (`Role::where('room_id', $role->room_id)`, which
    Eloquent correctly turns into `whereNull` for a null `room_id`) instead of
    branching on `$role->room`'s truthiness. When a room-scoped invariant is extended
    to also cover a global/room-less variant, re-audit every `if ($room)`-shaped guard
    near it — the falsy check that used to mean "defensive, should never happen" can
    silently become "this is the normal path for half of all cases now."

## Notifications — see [notifications.md](notifications.md)

50. **(#24) A `NotificationPreference` category with no producer is silently inert.**
    When `room_message` (Room Messages) was added to `NotificationPreference::
    DEFAULTS` and the Settings UI, no controller anywhere ever called
    `Notification::notify($userId, 'room_message', ...)` — the toggle rendered,
    saved, and read back correctly, but turning it on had zero effect: a user could
    enable it, have another account send a channel message, and see nothing, with
    no error anywhere because nothing was actually broken, just never wired up. The
    general lesson: adding a category to `DEFAULTS` + the frontend `CATEGORIES` list
    makes it *visible and configurable*, not *functional* — always add or point to
    the actual `Notification::notify()` call site in the same change, and check for
    it when a "notifications aren't arriving" report names a specific category.

## Channel types & capabilities — see [capabilities-and-channel-types.md](capabilities-and-channel-types.md)

51. **(#30) `channels.type`/`conversations.voice_mode` have no DB-level enum constraint** —
    same shape as the model-naming traps above's "looks safe by convention, isn't
    actually enforced." Before voice channels existed, nothing stopped
    `MessageController` from accepting a message against any channel regardless of
    type. Fixed as an allow-list, not a per-type special case, specifically so the
    *next* new channel type (a drawing channel, a music channel, ...) is
    text-incapable by default too, without anyone needing to remember to add another
    `abort_if($channel->type === '...')` check for it. Any new message-adjacent or
    channel-adjacent endpoint should still assume `Channel::find()`/`Channel
    $channel` route binding can resolve to any type and guard explicitly (via
    `isTextCapable()` or a new equivalent) if it only makes sense for some.
