# Roles & permissions (RBAC)

[← All docs](README.md) · See also:
[capabilities-and-channel-types.md](capabilities-and-channel-types.md) ·
[service-layer.md](service-layer.md)

## Schema

- `Role` (`roles` table) is scoped by a nullable `room_id` — a room-scoped role
  (`room_id` set) grants only inside that one room; a global/instance-wide role
  (`room_id` null) grants in every room. Both scopes share the same table/model.
- `RolePermission` (`role_permissions`) is a flat `(role_id, permission)` pivot,
  `permission` a `Permission` enum value stored as a plain string (no DB enum).
- `RoleAssignment` (`role_assignments`) is `(role_id, user_id)` — a user can hold
  multiple roles, room-scoped and global at once; their effective permissions are the
  union of all of them.

`App\Support\Permission` is the closed enum of grantable keys: `Administrator`,
`ManageRoom`, `ManageRoles`, `ManageChannels`, `ManageMembers`, `BanMembers`,
`ManageMessages`, `ManageEmojis`, `SeeAllChannels`, `ManageChannelVisibility`,
`SendDirectMessages`. **Adding a case does not make it do anything** — enforcement
sites today: `Administrator` (implies every permission, checked first),
`ManageChannels`/`ManageRoles` (`ChannelPolicy`/`RolePolicy`), `ManageMembers`/
`BanMembers` (`RoomMemberPolicy` — kick/ban, see "Kick and ban" below),
`SeeAllChannels`/`ManageChannelVisibility` (`Channel::isVisibleTo`/`ChannelPolicy::
manageVisibility` — see "Channel visibility" below), `SendDirectMessages`
(`Api\ConversationController::store`/`TextMessageService::authorizeSend` — see
"Direct message restriction" below). `ManageRoom`/`ManageMessages`/`ManageEmojis`
are declared for schema stability but are currently inert.

Renaming or removing a case only silently orphans existing `role_permissions` rows —
there is no boot-time registry validating the stored string against this enum, unlike
`FeatureRegistry`'s capability keys. `Tests\Unit\Support\PermissionEnumStabilityTest`
pins every case's value and fails immediately if one changes; a real rename needs a
data migration backfilling `role_permissions.permission` alongside updating that test.

## Permission resolution

`App\Support\PermissionChecker::can(User $user, Permission $permission, ?Room $room =
null)` is the one place the union is computed: it loads every role assigned to `$user`
that is either global or (when `$room` is passed) scoped to that room, and returns true
if any of them has `Administrator` or the requested permission. Passing no `$room`
deliberately excludes room-scoped roles entirely — a "global-only" check means
instance-wide staff, not "staff of no particular room."

## Default roles

Every room gets two `is_system: true` roles, seeded together by
`Role::seedDefaultsForRoom(Room $room)`:

- **Owner** — `Administrator`, assigned to the room's creator, entirely read-only (no
  name/position/permission edit, undeletable).
- **Member** — `is_default: true`, auto-assigned to every other joiner. Name/position
  are fixed, but unlike Owner its permissions are editable per room (e.g. granting it
  `manage_messages`). `administrator` is the one permission it can never hold.

Roles are freely combinable — Owner holding Member too (or any other role) is valid.
Nothing enforces exclusivity, and `PermissionChecker::can()`'s union means holding a
lesser role alongside a greater one never downgrades anything. Only the *starting*
assignment is exclusive-by-construction.

`Room::addMember(User $user, bool $asOwner = false): RoomMember` is the one place a room
membership is ever created — idempotent (`RoomMember::firstOrCreate`) and assigns the
Owner or default role in the same call. `RoomController::store`/`join` and
`RoomInvite::accept()` all call it; a new room-joining call site must not construct a
raw `RoomMember` directly, or it will skip role assignment.

## Enforcement points

`ChannelPolicy::create(User, Room)` / `manage(User, Channel)` and `RolePolicy::create(User,
Room)` / `manage(User, Role)` delegate to `PermissionChecker::can()`
(`ManageChannels`/`ManageRoles` respectively). `Api\ChannelController` (store/update/
destroy/reorder) and `Api\RoleController` (store/update/destroy/addMember/removeMember)
are the enforcement points. `Web\ChannelController::show` computes
`can_manage_channels`/`can_manage_roles` via `Gate::allows(...)` and passes them as
Inertia props — `ChannelSidebar`'s affordances are purely driven by these props, with no
separate frontend permission check.

`RoomPolicy::invite` checks `Room::hasMember` OR `PermissionChecker::can($user,
Permission::ManageMembers, $room)` — membership remains sufficient (any member can
invite, unchanged from before), with `ManageMembers` added as an override so
instance-wide/room staff who hold it can invite even into a room they haven't joined.

`Web\RoleController::index` (`GET /rooms/{room}/roles`) is the room role-management page
(`Rooms/Roles.tsx`); `Api\RoleController::indexGlobal` (`GET /api/settings/roles`) is its
instance-wide equivalent, backing the Roles tab in Settings
(`components/settings/GlobalRolesSettings.tsx`) — see "Global (instance-wide) roles"
below. Both surfaces render the same `RoleCard` component
(`resources/js/components/roles/RoleCard.tsx`), which is scope-agnostic — every API
call it makes is keyed by role id, not room id.

## Hierarchy

Roles are ranked in a per-room hierarchy — Owner top, custom roles by `position` in the
middle, Member bottom — and a role can only manage another role strictly below its own
rank.

`Role::rank(): float` is the single source of truth: Owner (`is_system && !is_default`)
always returns `INF`, Member (`is_default`) always returns `-INF`, regardless of stored
`position` — only custom roles rank by their actual `position` value. `Role::outranks(Role
$other): bool` is `$this->rank() > $other->rank()` — strict, so a role can never manage
a role at its own rank, including itself.

`Role::highestRoleFor(User $user, Room $room): ?Role` finds the highest-ranked
room-scoped role a user holds there — only room-scoped roles are considered; a global
role's rank in this per-room hierarchy is undefined.

`RolePolicy::manage` requires both the base `ManageRoles` permission and that the
actor's `highestRoleFor()` outranks the target role. Granting `ManageRoles` to Member
does not let every member manage every role, because Member's rank (`-INF`) never
outranks anything, not even another Member holder acting on Member itself.

`Api\RoleController::reorder` is a deliberate exception: it requires the *complete* set
of a room's custom role ids, which necessarily includes the actor's own role, so it
checks `Role::outranksOrEquals()` (`>=`) instead of `outranks()`. This looser comparison
must not be reused for anything that changes a role's *capabilities* — only for
repositioning, which grants nothing by itself.

`administrator` can only ever be granted to Owner — `Api\RoleController::update` rejects
(422) any `permissions` payload containing it for every other role.

### Acting on a role's membership

Adding or removing a user from a role is gated by a *second*, separate hierarchy
comparison: actor vs. the target user, not actor vs. the role.
`RolePolicy::manage(User $user, Role $role, ?User $target = null)` takes an optional
third argument for exactly this: `addMember`/`removeMember` call `Gate::authorize('manage',
[$role, $target])`, while `update`/`destroy` call it with just `$role`. When `$target` is
given, the actor's `highestRoleFor()` must also outrank (strict `>`) the target's
`highestRoleFor()` — both checks (role-vs-actor and target-vs-actor) must pass.

Exempted when `$target` is the actor themselves — without this, nobody could act on
their own membership in any role, since a user's highest role always ties with itself.
The exemption only skips the target-vs-actor comparison, not the role-vs-actor one, so a
user still cannot remove themselves from their own *highest* role — they can remove
themselves from a lower secondary role they also hold.

### Every user needs at least one role

The enforcement is not symmetric: losing your last *custom* role falls back to Member
automatically; losing Member while it's your last role is a hard block. This applies
identically in both scopes — room and global — via two private helpers on
`Api\RoleController`:

- `hasOtherRoleInScope(Role $role, string $userId): bool` — does `$userId` hold any
  *other* role with the same `room_id` as `$role` (room-scoped or global alike,
  compared directly on `room_id` rather than on `$role->room`'s truthiness).
- `defaultRoleFor(Role $role): ?Role` — the `is_default: true` role sharing that same
  `room_id`.

`removeMember` checks `hasOtherRoleInScope`; if false, `$role->is_default` decides what
happens next — `true` (removing Member itself, room-scoped or global) aborts 422,
`false` (removing a custom role) instead `RoleAssignment::firstOrCreate`s them onto
`defaultRoleFor($role)` before proceeding, so the request succeeds (200) and they land
on Member. `destroy` (deleting a custom role outright) applies the same fallback to
every assignee who would otherwise be orphaned, before the role itself is deleted. Both
use `firstOrCreate` specifically so a user who already holds Member alongside the
removed role does not get a duplicate row.

**Regression note:** both helpers used to be a single inline `if ($role->room) { ... }`
block — since `$role->room` is always falsy for a global role, that gated the entire
fallback/hard-block logic out of existence for global roles, silently letting a global
role holder be left with zero global roles. `hasOtherRoleInScope`/`defaultRoleFor`
compare on `room_id` (which correctly matches `whereNull` for a global role) instead of
branching on `$role->room`'s truthiness, closing that gap — see
`GlobalRoleTest::test_removing_a_users_only_global_role_the_default_member_role_is_blocked`
and its neighboring tests.

On the frontend, `RoleCard`'s `removeMember`, the page's `removeRole`, and
`moveCustomRole` (reorder) all follow their optimistic local update with
`router.reload({ only: ['room'] })` — the component's `roles` state is otherwise seeded
once from the `room` prop and would not see server-side side effects otherwise. Reorder
needs this for a different reason than remove/delete: shifting positions can change
which roles the viewer outranks (and therefore `can_manage`) even for roles not directly
touched, and the optimistic update only patches `position`.

### `can_manage` must be computed by every endpoint that returns a Role

`can_manage` has to be computed and returned by every endpoint whose response the
frontend trusts for it, not just `Web\RoleController::index`'s initial page load.
`RoleCard` reads `role.can_manage ?? false`; any endpoint returning `Role` JSON the
frontend renders without going through `index` first needs `Gate::allows('manage',
$role)` computed the same way `index` does.

### Known, unfixed edge case

`store`'s new-role `position` is always "current max custom position + 1," with no
regard for the creator's own rank — a custom-role holder ranked below some other
existing custom role can create a role that ends up outranking themselves, and
`can_manage` (correctly) reports `false` on their own new role.
`RoleManagementTest::test_a_low_ranked_creator_may_not_be_able_to_manage_the_role_they_just_created`
documents this as current behavior. Fixing it requires a product decision (cap the
position below the creator's rank? place it just under their highest role instead of
the global max? what if their `ManageRoles` grant comes from a role with no finite rank,
e.g. Member?).

## The hierarchy is broader than role management

This hierarchy is more than role-management needs — it is also the seam the kick/ban
moderation feature hooks into (see "Kick and ban" below), with different comparison
semantics than either check above: a moderation action compares the actor's effective
rank against the target's using `>=` (not `outranks()`'s strict `>`, and not the same
as the `addMember`/`removeMember` target-user check either) — a Member with a granted
`ban_members` permission acting on another Member (same rank) succeeds; only acting on
someone in a strictly higher role is blocked.

## Global (instance-wide) roles

A global role (`room_id: null`) applies in every room — this has worked end-to-end in
`PermissionChecker`/`RolePolicy` since the RBAC system's initial build; what was
missing was a UI and a bootstrap path, both now present.

**Bootstrap.** The very first global Administrator is granted via
`php artisan app:bootstrap-admin {email}` (`app/Console/Commands/BootstrapGlobalAdmin.php`)
— idempotent (`firstOrCreate` on the role, `firstOrCreate` on the assignment), run once
at deploy time rather than via an env var or "first registered user" convention (both
of which are races). **This command is also the only way to add a second (or third...)
global Administrator** — re-run it with a different email; it reuses the same global
Administrator role and just adds another `RoleAssignment`. There is deliberately no UI
path to grant `Administrator` to a role: `Api\RoleController::update`'s `permissions`
validation unconditionally rejects `administrator` in the payload for every role,
global or room-scoped (it predates global roles having any UI at all, written with
only room Owner's "top of the hierarchy" semantics in mind — see its "Administrator is
exclusively the Owner tier" comment). A global role can hold any *other* permission via
the Roles tab; `Administrator` specifically is console-only.

**Default role.** `Role::seedGlobalDefaults()` idempotently creates the single global
`is_default: true` "Member" role (granting `SendDirectMessages` by default) — the
global mirror of `seedDefaultsForRoom()`'s room Member. Called from a one-time data
migration (`2024_01_01_000027_seed_global_member_role.php`), `AuthController::register`
(every new user), `DatabaseSeeder`, and `UserFactory::configure()`'s `afterCreating`
hook (every factory-created user in tests) — the same "every user needs at least one
role" guarantee room membership has, now enforced at the instance level too.
`RoleAssignment::firstOrCreate` at each call site keeps this idempotent.

**Management.** `ManageRoles` is reused for global role management, not a separate
ability — `RolePolicy::manage`'s existing `!$role->room` branch already grants this on
`ManageRoles` alone, with no hierarchy comparison (global roles have no per-room rank).
`RolePolicy::create(User, ?Room $room = null)` accepts a null room for the same reason.
`Api\RoleController::indexGlobal` (`GET /api/settings/roles`) returns every global role
+ every instance user, self-fetched by the Roles tab
(`components/settings/GlobalRolesSettings.tsx`) in Settings — only rendered at all when
`SettingsController::show`'s `can_manage_global_roles` prop (`Gate::allows('create',
[Role::class, null])`) is true, so the tab is invisible to anyone who isn't server
staff. `storeGlobal`/`reorderGlobal` are the room-less equivalents of `store`/`reorder`
(`update`/`destroy`/`addMember`/`removeMember` are already room-less, keyed by role id,
and work unchanged for global roles).

## Channel visibility

Opt-in per-channel restriction — a channel with no `channel_role_visibility` rows is
visible to every room member (empty set means open, not closed, so existing channels
are unaffected until someone deliberately restricts one).

- `channel_role_visibility` (`channel_id`, `role_id`) — a join table, but written via
  the `ChannelRoleVisibility` model directly (`create`/`delete`), never
  `BelongsToMany::attach()`/`sync()`. Those bulk-insert through the query builder and
  bypass Eloquent's `creating` event, which is what `HasUuids` relies on to generate
  the row's `id` — the same reason `role_permissions`/`role_assignments` are written
  through their models elsewhere in this codebase rather than pivot helpers.
- `Channel::isVisibleTo(User $user): bool` — true if the visibility set is empty, if
  the user holds `SeeAllChannels` (room-scoped; `Administrator` implies it), or if the
  user holds any role in the channel's visibility set (room-scoped or global).
  Enforced in `Web\ChannelController::show` (the channel itself, and filtering the
  room's channel list passed to the page), `Web\RoomController::show`/`join`'s
  "first text-capable channel" redirect, and `channel.{channelId}`'s presence-auth
  callback in `routes/channels.php`.
- Two permissions, deliberately separate: `SeeAllChannels` (bypass when *viewing*) and
  `ManageChannelVisibility` (required to *set* the list) — kept apart from
  `ManageChannels` so "who can restrict a channel" is delegable independently of full
  channel CRUD. `Api\ChannelController::update` only requires `ManageChannels` when the
  request touches name/topic/is_nsfw/slow_mode_seconds; a request containing only
  `visibility_role_ids` is gated solely by `ChannelPolicy::manageVisibility`
  (`ManageChannelVisibility`).
- **Both authorizations for a mixed request are checked before either mutation runs**,
  and the mutations themselves run inside one `DB::transaction()`. A request combining
  e.g. `name` and `visibility_role_ids` needs both `ManageChannels` and
  `ManageChannelVisibility` — checking one, mutating, then checking the other used to
  let the first field's change commit even when the request as a whole ends in a 403 or
  422 (the hierarchy guard below aborts *inside* `updateVisibility()`, after any
  name/topic update already ran). See
  `ChannelVisibilityTest::test_a_mixed_update_request_does_not_partially_apply_when_only_one_permission_is_held`
  and `test_a_hierarchy_violation_in_a_mixed_request_rolls_back_the_name_change_too`.
- **Hierarchy guard**: a lower-ranked role can never lock a higher-ranked one out.
  When `visibility_role_ids` is submitted, every room role whose `Role::rank()` exceeds
  the actor's own rank must be included in the list (else 422) — practically, this
  means Owner (`rank() === INF`) must be explicitly included in *any* non-empty
  visibility list set by a room-scoped actor, since nothing in a room outranks Owner.
  An actor whose `ManageChannelVisibility` grant is global (checked via
  `PermissionChecker::can($user, Permission::ManageChannelVisibility, null)`) is exempt
  from this guard entirely — they hold no room-scoped rank to compare against, mirroring
  `Role::effectiveModerationRank`'s global-supersedes-room-hierarchy pattern below. The
  frontend (`ChannelVisibilityModal`) doesn't replicate this rank comparison — it lets
  any role be toggled and surfaces the backend's 422 message on save, keeping the
  hierarchy logic in one place.

## Direct message restriction

`SendDirectMessages` gates starting a new conversation
(`Api\ConversationController::store`), sending in an existing one
(`TextMessageService::authorizeSend`, when the entity is a `Conversation`), and adding
participants to a group (`Api\ConversationController::addParticipants` — added after an
initial gap where a restricted user could still grow a group they were already in;
`ConversationPolicy::addParticipants`'s membership/group-type check is orthogonal and
stays in place alongside it) — granted to the global Member role by default. `resolve`/
`candidates` (read-only lookups, not mutations) are deliberately not gated.

Since `PermissionChecker` is a pure additive union with no explicit "deny," there is no
way to revoke a permission from a specific user while they still hold a role that
grants it. **The supported moderation workflow** is to move the user off the global
Member role onto a different global role (e.g. a hand-created "Restricted" role with no
permissions) via Settings → Roles — removing their `SendDirectMessages` grant by
removing its source, not by an override mechanism. This is a real operational step, not
a UI nicety: an admin doing this should confirm the user holds no *other* role that
also grants `SendDirectMessages` before assuming the restriction took effect.

## Kick and ban

`ManageMembers` (kick) and `BanMembers` (kick + block rejoin) have real enforcement now
— `RoomMemberPolicy::kick`/`ban`, backed by `RoomMembershipService`, called from
`Api\RoomMemberController` (`DELETE /rooms/{room}/members/{user}`,
`POST`/`DELETE /rooms/{room}/bans/{user}`).

`Role::effectiveModerationRank(User $user, Room $room): float` is a **different**
comparison from `highestRoleFor()`/`rank()` alone: it returns `INF` if the user holds a
*global* `Administrator` role (checked via `PermissionChecker::can($user,
Permission::Administrator, null)`), else falls back to their highest room-scoped role's
rank (`-INF` if they hold none there). This is what lets a global Administrator act on
a room's Owner — nothing room-scoped ever outranks Owner (`rank() === INF`), so only a
global Administrator, tying at `INF`, can. `RoomMemberPolicy` compares both sides with
`effectiveModerationRank(actor) >= effectiveModerationRank(target)` (`>=`, not
`outranks()`'s strict `>` — same-rank peers, e.g. two Members where one holds
`BanMembers`, may act on one another) and additionally requires the actor hold the
relevant permission in that room and not be acting on themselves.

This is deliberately **not** the same comparison `RolePolicy::manage` uses for role
management — that policy's Owner-immutability guard
(`abort_if($role->is_system && ..., 422, ...)` in `Api\RoleController::update`/
`destroy`) is untouched by hierarchy and stays in force regardless: a global
Administrator can act on a room's Owner *as a member* (kick/ban) but can never
edit/delete the Owner *role* itself.

**Ban** additionally writes a `room_bans` row (`room_id`, `user_id`, `banned_by_id`) —
`Room::isBanned()` is checked in `Room::addMember()`, the single choke point every
room-join path (`RoomController::store`/`join`, `RoomInvite::accept`) already funnels
through, so a ban blocks rejoining via invite link, invite code, or email invite alike
with one guard. Unbanning (`DELETE /rooms/{room}/bans/{user}`) is gated by the same
`ban` ability.

**Removing a room's Owner.** Since only a global Administrator can ever kick/ban
Owner, and doing so necessarily leaves the room without one,
`RoomMembershipService::removeMembership` doesn't auto-promote another member or block
the action outright — the *acting admin becomes the room's new Owner* (both `owner_id`
and the Owner role assignment transfer to them). This requires an explicit
`confirm_owner_transfer: true` on the request; without it, the endpoint responds `409
{ requires_owner_transfer: true, message }` (via `OwnerTransferRequiredException`) so
the frontend can show `OwnerTransferModal`'s confirmation before resubmitting. The new
owner can hand the role off again afterward through the normal room role UI.

## Backfill migration

`2024_01_01_000017_backfill_room_roles.php` is a one-way data migration that gave every
room that existed before this system landed the same Owner/Member roles, using raw
`DB::table(...)` rather than Eloquent models.
