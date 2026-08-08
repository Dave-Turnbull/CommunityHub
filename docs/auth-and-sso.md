# Authentication and SSO

[← All docs](README.md) · See also:
[conversations-and-invites.md](conversations-and-invites.md) ·
[roles-and-permissions.md](roles-and-permissions.md) ·
[service-layer.md](service-layer.md)

Password login (`AuthController`) is always available. Authentik/OAuth
(`AuthentikController`) is an **optional, additional** login method, config-gated —
never a replacement. A server can run with password login only, Authentik only for
existing accounts plus password for others, or both fully open; nothing about the
password path changes when Authentik is enabled.

## Password login

`POST /login` takes one `login` field (email or username, disambiguated by
`str_contains($login, '@')` — see CLAUDE.md's Conventions) and a `password`. Before
calling `Auth::attempt()`, `AuthController::login()` looks the user up and checks
`password !== null` — an OAuth-only provisioned account (see below) has no password
to check, and letting `Auth::attempt()` run anyway would just be a slower way to reach
the same rejection. Either way the response is the same generic "these credentials do
not match our records" — nothing about the failure ever reveals whether an account
exists or how it authenticates.

## Authentik/OAuth

Built on `laravel/socialite` + the community `socialiteproviders/authentik` package
(a thin OIDC adapter over Socialite's OAuth2 driver). The event listener wiring it up
(`Event::listen(SocialiteWasCalled::class, ...)`) lives in `AppServiceProvider::boot()`
— registering the listener is cheap and unconditional; whether the driver is actually
*reachable* is a separate, per-request check.

### Config

`config/services.php`'s `'authentik'` key (not a dedicated `config/authentik.php` —
Socialite's own convention, and `socialiteproviders/authentik` specifically, read
OAuth driver credentials from `config('services.<driver>')`, so splitting this feature
across two files would fight that convention for no benefit):

```php
'authentik' => [
    'enabled'       => (bool) env('AUTHENTIK_ENABLED', false),
    'client_id'     => env('AUTHENTIK_CLIENT_ID'),
    'client_secret' => env('AUTHENTIK_CLIENT_SECRET'),
    'redirect'      => env('AUTHENTIK_REDIRECT_URI', env('APP_URL') . '/auth/authentik/callback'),
    'base_url'      => env('AUTHENTIK_BASE_URL'), // e.g. https://authentik.example.com
],
```

`enabled` is checked **per-request**, inside `AuthentikController::redirect()`/
`callback()` (`abort_unless(..., 404)`), not at route-registration time in
`routes/web.php`. Both routes are always registered — gating route *registration*
itself on a config value would fix the set of registered routes at application-boot
time, which is both unnecessary here and awkward to toggle/test at runtime; a
per-request check is simpler and makes the flag genuinely live.

### The "auto sign-on" behavior

`AuthentikController::redirect()` calls `Socialite::driver('authentik')->redirect()`
with no `prompt=login` (or any similar forced-reauth) override. If the browser already
has an active Authentik session, the redirect round-trip completes with no credentials
prompt — that's the entire "auto sign-on" requirement. It's inherent OIDC behavior,
not a mechanism this codebase builds; don't add a forced-reauth parameter later
without knowing that's what you're trading away.

### Account resolution — `AuthentikLoginService`

On callback, `AuthentikLoginService` resolves the incoming Socialite user in order:

1. **Already linked** (`user_oauth_identities` has a row for `(provider, provider_user_id)`,
   `provider_user_id` being the stable OIDC `sub` claim) → log straight in.
2. **Email matches an existing local account, no linked identity yet** → do **not**
   auto-link. `AuthentikLoginService` deliberately doesn't trust the IdP's `email`
   claim alone as proof of ownership — an attacker able to get an arbitrary `email`
   claim through a misconfigured or compromised IdP could otherwise hijack an existing
   local account with no further proof. Instead, `AuthentikController` stashes the
   pending identity in the session and redirects to `/auth/link-account`
   (`Auth/LinkAccount.tsx`), which asks for the *existing account's actual password*.
   A correct password creates the `user_oauth_identities` row and logs in through the
   normal `Auth::attempt()`-backed path; a wrong one fails the same way password login
   always does.
3. **No match at all** → new-account provisioning, gated by the `oauth` signup path
   (`InstanceSetting::current()->signup_oauth_enabled` — see
   `docs/conversations-and-invites.md`'s "Server invites" for the other two signup
   paths and how all three interact). If closed, the callback redirects to `/login`
   with a flash error instead of silently failing. If open, a new `User` is created
   with `password: null`, a username derived from the OIDC `preferred_username`/email
   local-part (with a numeric suffix on collision), and the default global role — the
   same `Role::seedGlobalDefaults()` assignment `AuthController::register()` does.

### Data model

`user_oauth_identities` (`App\Models\UserOAuthIdentity`) is a join table — `user_id`,
`provider`, `provider_user_id`, an `email` snapshot for audit — not `provider`/
`provider_id` columns bolted onto `users`. A user can hold a password *and* one or
more linked OAuth identities at once (OAuth is additive, never a replacement — the
whole point of this being optional), which a join table supports naturally and a
pair of nullable columns on `users` would not once a second provider ever showed up.
Its table name is set explicitly (`protected $table = 'user_oauth_identities'`) —
Laravel's pluralizer mangles `UserOAuthIdentity` into `user_o_auth_identities`
(splits on the capital-letter run in "OAuth"), the same class of trap as `CustomEmoji`
(see `CLAUDE.md`'s trap notes).

`users.password` is nullable (migration `2024_01_01_000047_make_users_password_nullable`)
for exactly this reason — an OAuth-only account has nothing to hash. Nullable rather
than a random/unusable placeholder hash: honest about what "no password" means, and
never leaves a real bcrypt hash of a meaningless value sitting in the column.

### Shared login-completion logic

Both `AuthController` (password login/register) and `AuthentikController` (OAuth
login/provisioning/linking) need to run the same "join the room behind a pending
invite" step right after `Auth::login()` — factored into the
`App\Http\Controllers\Web\Concerns\AcceptsPendingRoomInvite` trait rather than
duplicated, since it's the exact same `session('pending_invite_token')` → `RoomInvite`
lookup either way (see `InviteController`'s guest flow for where that session key gets
set).

### Frontend

`HandleInertiaRequests::share()` adds `authentikEnabled` (from
`config('services.authentik.enabled')`) to every page's shared props.
`Login.tsx` conditionally renders a "Log in with Authentik" link to
`/auth/authentik/redirect` — a plain `<a href>`, not an Inertia/axios call, since this
has to be a real full-page browser navigation to Authentik's own domain.

## Env vars

`AUTHENTIK_ENABLED`, `AUTHENTIK_CLIENT_ID`, `AUTHENTIK_CLIENT_SECRET`,
`AUTHENTIK_BASE_URL`, `AUTHENTIK_REDIRECT_URI` (optional override) — see CLAUDE.md's
"Env vars that matter". None of these have a working default; Authentik login simply
404s (via the `abort_unless` calls above) until `AUTHENTIK_ENABLED=true` and the
client id/secret/base URL are set to a real Authentik application's OAuth2 provider
config.
