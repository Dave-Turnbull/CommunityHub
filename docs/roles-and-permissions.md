# Roles & permissions (RBAC)

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
`ManageMessages`, `ManageEmojis`. **Adding a case does not make it do anything** — only
`Administrator` (implies every permission, checked first) and
`ManageChannels`/`ManageRoles` have a real enforcement site today (`ChannelPolicy`/
`RolePolicy`). `ManageMembers`/`BanMembers`/`ManageMessages`/`ManageEmojis` are declared
for schema stability but are currently inert.

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

`RoomPolicy::invite` still checks plain `Room::hasMember`, not `PermissionChecker` — it
predates the RBAC system and has not been migrated onto it.

`Web\RoleController::index` (`GET /rooms/{room}/roles`) is the room role-management page
(`Rooms/Roles.tsx`). There is no UI for global/instance-wide roles — a global role can
only be created via `tinker`/a seeder.

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
automatically; losing Member while it's your last role is a hard block.

`Api\RoleController::removeMember` checks whether the target holds any other room-scoped
role; if not, `$role->is_default` decides what happens next — `true` (removing Member
itself) aborts 422, `false` (removing a custom role) instead
`RoleAssignment::firstOrCreate`s them onto the room's default role before proceeding, so
the request succeeds (200) and they land on Member. `destroy` (deleting a custom role
outright) applies the same fallback to every assignee who would otherwise be orphaned,
before the role itself is deleted. Both use `firstOrCreate` specifically so a user who
already holds Member alongside the removed role does not get a duplicate row.

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

This hierarchy is intentionally more than role-management needs today — it is also the
seam a future per-user moderation feature (kick, ban) hooks into, with different
comparison semantics than either check above: a moderation action should compare the
actor's `highestRoleFor()` against the target user's using `rank() >=` (not
`outranks()`'s strict `>`, and not the same as the `addMember`/`removeMember`
target-user check either) — a Member with a granted `ban_members` permission acting on
another Member (same rank) should succeed; only acting on someone in a strictly higher
role should be blocked. See `CLAUDE.md`'s "Planned work" before building this.

## Backfill migration

`2024_01_01_000017_backfill_room_roles.php` is a one-way data migration that gave every
room that existed before this system landed the same Owner/Member roles, using raw
`DB::table(...)` rather than Eloquent models.
