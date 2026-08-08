# Roles & permissions (RBAC)

[← All docs](README.md) · See also:
[capabilities-and-channel-types.md](capabilities-and-channel-types.md) ·
[service-layer.md](service-layer.md) · [attachments.md](attachments.md)

## Schema

- `Role` (`roles` table) is scoped by a nullable `room_id` — a room-scoped role
  (`room_id` set) grants only inside that one room; a global/instance-wide role
  (`room_id` null) grants in every room. Both scopes share the same table/model.
- `RolePermission` (`role_permissions`) is a flat `(role_id, permission)` pivot,
  `permission` a `Permission` enum value stored as a plain string (no DB enum).
- `RoleAssignment` (`role_assignments`) is `(role_id, user_id)` — a user can hold
  multiple roles, room-scoped and global at once; their effective permissions are the
  union of all of them.
- `RoleChannelCategory` (`role_channel_categories`) is a flat `(role_id, category)`
  pivot — a role's explicit per-`ChannelType::category()` channel-creation grants, see
  "Channel creation is category-gated" below. Same `HasUuids`-pivot convention as
  `ChannelRoleVisibility`/`role_permissions`: written via `firstOrCreate`/`delete()` on
  the model directly, never `BelongsToMany::attach()`/`sync()` (those bypass the
  `creating` event `HasUuids` relies on to generate the row's id).
- `roles.has_room_permission_ceiling` (bool, default `false`) — only meaningful for a
  global role. `RoleRoomPermissionCeiling` (`role_room_permission_ceilings`) and
  `RoleRoomChannelCategoryCeiling` (`role_room_channel_category_ceilings`) mirror
  `role_permissions`/`role_channel_categories`' shape exactly, storing that global
  role's room-permission ceiling — see "Room permission ceilings" below.
- `rooms.permission_ceiling_unrestricted` (bool, default `true`) — `RoomPermissionCeiling`
  (`room_permission_ceilings`) and `RoomChannelCategoryCeiling`
  (`room_channel_category_ceilings`) are a room's own snapshotted ceiling, populated once
  at creation.
- `ChannelPermissionOverride` (`channel_permission_overrides`,
  `(channel_id, role_id, permission, allowed)`) — a curated per-channel override of a
  role's room-tier permission; row absence means "inherit," not a nullable column, same
  mechanism `channel_role_visibility` uses for "empty set = visible to all." Read side is
  `PermissionChecker::canInChannel()`, write side is `Api\ChannelController::
  updatePermissionOverrides()` — see "Channel permissions" below.

All of the above are written via `firstOrCreate`/`delete()` on their own model, never
`BelongsToMany::attach()`/`sync()`, same reasoning as `RoleChannelCategory` above.

`App\Support\Permission` is the closed enum of grantable keys: `Administrator`,
`ManageRoom`, `ManageRoles`, `ManageChannels`, `ManageModChannels`, `ManageMembers`,
`BanMembers`, `ManageMessages`, `ManageEmojis`, `SeeAllChannels`,
`ManageChannelVisibility`, `SendDirectMessages`, `PostAnnouncements`, `Comment`, `Vote`,
`SendMessages`, `React`, `CreateRoom`, `InviteServer`, `InviteMembers`. **Adding a case
does not make it do anything** — enforcement sites today: `Administrator` (implies
every permission, checked first), `ManageChannels`/`ManageModChannels`/`ManageRoles`
(`ChannelPolicy`/`RolePolicy` — see "Channel creation is category-gated" below),
`InviteMembers`/`ManageMembers`/`BanMembers` (`RoomPolicy::invite`/`RoomMemberPolicy` —
invite/kick/ban, see "Kick and ban" below), `SeeAllChannels`/`ManageChannelVisibility`
(`Channel::isVisibleTo`/`ChannelPolicy::manageVisibility` — see "Channel visibility"
below), `SendDirectMessages` (`Api\ConversationController::store`/`TextMessageService::
authorizeSend` — see "Direct message restriction" below), `PostAnnouncements`
(`TextMessageService::authorizeSend`/`ChannelPolicy::post` — see "Announcement posting
restriction" below), `Comment` (`TextMessageService::authorizeSend`'s comment branch —
see `docs/comments-and-voting.md`), `Vote` (`VoteService`), `SendMessages`
(`TextMessageService::authorizeSend`'s ordinary-channel branch — closed a real gap,
ordinary posting previously had no `Permission::*` check at all, only membership +
capability), `React` (`ReactionController` — closed the same class of gap), `CreateRoom`
(`RoomPolicy::create`/`Web\RoomController` — room creation previously had no gate at
all). `ManageRoom`/`ManageMessages`/`ManageEmojis`/`InviteServer` are declared for
schema stability but are currently inert — `InviteServer` specifically has nothing to
enforce until closed registration exists (see `CLAUDE.md`'s `## Planned work`);
registration is fully open today.

`InviteMembers` was split out of `ManageMembers` (which now means "kick" only) so a
[room permission ceiling](#room-permission-ceilings) can grant invite rights without
granting kick rights — the two were previously inseparable, sharing one enum case.

Renaming or removing a case only silently orphans existing `role_permissions` rows —
there is no boot-time registry validating the stored string against this enum, unlike
`FeatureRegistry`'s capability keys. `Tests\Unit\Support\PermissionEnumStabilityTest`
pins every case's value and fails immediately if one changes; a real rename needs a
data migration backfilling `role_permissions.permission` alongside updating that test.

## Permission categories

Backend enforcement doesn't group permissions at all — `PermissionChecker::can()` treats
every `Permission` case identically, and any role can be granted a permission from any
group below. Two independent, frontend-only groupings sort the same 20 (`InviteServer`
included, still inert) `PermissionKey`s, both defined in `resources/js/types/index.ts`
with no backend equivalent — nothing server-side needs to know about either:

**`PERMISSION_TIERS`** (`Record<PermissionKey, ('server'|'room')[]>`) — which scope(s) a
permission is meaningful at, mirroring `Permission::serverTierCases()`/`roomTierCases()`
on the backend. `Administrator`/`ManageRoles` are tagged both (checked with `$room = null`
*or* a specific room, depending which scope the role itself is). This is what
`PermissionToggleList` (see "Channel permissions" below) is scoped by, and what drives
`RoleCard.tsx`'s section split for a global role: a **"Server permissions"** section
(`SERVER_TIER_PERMISSIONS`) and a **"Room permissions"** section
(`ROOM_ONLY_FOR_GLOBAL` — room-tier permissions minus the ones already shown in the
Server section, so `Administrator`/`ManageRoles` aren't rendered twice). A room-scoped
role only ever shows the room-tier section — `SendDirectMessages`/`CreateRoom`/
`InviteServer` are checked with `$room = null`, so granting one to a room-scoped role
would compile, save, and do precisely nothing; they simply never appear in a room role's
single section. This is the concrete fix behind "why is there a Send Direct Messages
permission that does nothing on this room role" — the permission itself is fine, it was
just being offered somewhere it could never take effect.

**`PERMISSION_GROUPS`** (`PermissionGroup = 'administration' | 'server' | 'membership' |
'channels' | 'content'`, via `PERMISSION_GROUP_LABELS`/`PERMISSION_GROUP_ORDER`) — the
headed subsections `PermissionToggleList` renders *within* whichever tier section it's
showing:

- **Administration** — `Administrator`, `ManageRoles`, `ManageRoom`, `ManageEmojis`.
- **Server** — `CreateRoom`, `InviteServer`, `SendDirectMessages`.
- **Membership** — `InviteMembers`, `ManageMembers`, `BanMembers`.
- **Channels** — `ManageChannels`, `ManageModChannels`, `SeeAllChannels`,
  `ManageChannelVisibility`.
- **Content** — `ManageMessages`, `SendMessages`, `PostAnnouncements`, `Comment`, `React`,
  `Vote`. Ordinary posting/reacting/commenting/voting/announcing — deliberately separate
  from **Membership**/**Channels** (day-to-day moderation), a fix for an earlier version
  of this grouping that lumped `Comment`/`Vote` in with moderation permissions, which
  read as "why are these baseline member abilities filed under Moderator."

Both groupings are labels, not enforced links — the mapping doesn't change what's
grantable, and nothing stops a role from holding a permission from any group alongside
one from any other. `PermissionToggleList` (`resources/js/components/roles/
PermissionToggleList.tsx`) is the one shared component every one of these checklists
renders through — RoleCard's own permissions, RoomCeilingSection's ceiling, and
ChannelPermissionsPanel's curated overrides all look and behave identically because they
share this one component. Adding a new `Permission` case end-to-end means: a backend
case + tier/group tagging (`serverTierCases()`/`roomTierCases()`/
`channelOverridableCases()` as applicable) and its frontend mirror
(`PermissionKey`/`PERMISSION_LABELS`/`PERMISSION_DESCRIPTIONS`/`PERMISSION_GROUPS`/
`PERMISSION_TIERS`) — no per-surface UI code to touch, every consumer of
`PermissionToggleList` picks it up automatically.

**Graying out what the viewer can't grant.** `Api\RoleController::decorateRole(Role
$role, User $viewer)` is the one place every `Role` JSON payload gets annotated —
`can_manage` (existing), plus `grantable_permissions`/`grantable_channel_categories`
(`PermissionCeiling::grantablePermissions()`/`grantableCategories()` for `$viewer`
against `$role`), plus, for a global role only, `can_manage_ceiling` and
`grantable_ceiling_permissions` (`PermissionCeiling::actorCeilingCapacity()` for
`$viewer` — the same value on every global role in a list, since it describes the
*viewer*, not the target role). Called from `index`/`indexGlobal`/`store`/`storeGlobal`,
so every surface that renders a `RoleCard`/`RoomCeilingSection` has this data from the
initial fetch, no extra round-trip. `PermissionToggleList`'s `grantable` prop consumes
it: a permission not in the list is disabled *for checking* (with a tooltip) but never
for *unchecking* — removing something already granted is always allowed, matching the
backend's own asymmetry (`grantablePermissions()` only gates additions). This is what
turns "you can't grant a permission you don't hold" from a 422 you discover on save into
something visible before you click a toggle at all.

## Permission resolution

`App\Support\PermissionChecker::can(User $user, Permission $permission, ?Room $room =
null)` is the one place the union is computed: it loads every role assigned to `$user`
that is either global or (when `$room` is passed) scoped to that room, and returns true
if any of them has `Administrator` or the requested permission. Passing no `$room`
deliberately excludes room-scoped roles entirely — a "global-only" check means
instance-wide staff, not "staff of no particular room."

## Default roles

Every new room is seeded with three roles by `Role::seedDefaultsForRoom(Room $room)`
(**must be called after `Room::snapshotPermissionCeiling()`** — see "Room permission
ceilings" below for why):

- **Owner** — `is_system: true`, assigned to the room's creator, entirely read-only (no
  name/position/permission edit, undeletable). Granted `Administrator` (the wildcard)
  when the room is unrestricted — the default, and what every room got before ceilings
  existed. A **restricted** room's Owner does **not** get the wildcard — that would defeat
  the ceiling entirely — it's granted exactly the room's ceiling permission set instead.
- **Moderator** — an ordinary custom role (`is_system: false`, `is_default: false`) that
  just starts pre-configured instead of blank: `ManageChannels`, `ManageChannelVisibility`,
  `InviteMembers`, `ManageMembers`, `BanMembers`, `PostAnnouncements` (the "moderator"
  category from "Permission categories" below), each individually intersected with the
  room's ceiling if restricted. Nobody is auto-assigned to it — a room owner assigns members explicitly, same
  as any custom role — and because it's a normal `is_system: false` row, it can be
  renamed, reordered, re-permissioned, or deleted via the same API any other custom role
  uses (`RolePolicy`/`Api\RoleController` don't special-case it at all). A room owner who
  wants no moderator tier can just delete it.
- **Member** — `is_system: true`, `is_default: true`, auto-assigned to every other
  joiner. Name/position are fixed, but unlike Owner its permissions are editable per room
  (e.g. granting it `manage_messages`). `administrator` is the one permission it can
  never hold. Starts with `Comment`, `Vote`, `SendMessages`, `React` — the baseline
  posting/reacting/commenting/voting abilities every ordinary member has — again each
  intersected with the room's ceiling if restricted.

Because Moderator is seeded at a fixed `position` (50) alongside Owner's cosmetic 100,
any custom role created *after* room creation starts at `max(existing custom positions) +
1` (see `Api\RoleController::store`) and so outranks Moderator by default — the existing,
unchanged "newest custom role starts most senior" behavior, not something specific to
Moderator. `Api\RoleController::reorder` treats Moderator as one of the room's "custom
roles" a reorder payload must fully account for, same as any other non-system role.

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

`ChannelPolicy::create(User, Room, ?string $type = null)` / `manage(User, Channel)` and
`RolePolicy::create(User, Room)` / `manage(User, Role)` delegate to
`PermissionChecker::can()` (`ManageChannels`/`ManageModChannels`/`ManageRoles`
respectively — see "Channel creation is category-gated" below for the first two).
`Api\ChannelController` (store/update/destroy/reorder) and `Api\RoleController`
(store/update/destroy/addMember/removeMember) are the enforcement points.
`Web\ChannelController::show` computes `creatable_channel_types` (via
`ChannelPolicy::creatableTypeKeys()`) and `can_manage_roles` via `Gate::allows(...)` and
passes them as Inertia props — `ChannelSidebar`'s affordances are purely driven by these
props, with no separate frontend permission check.

### Channel creation is category-gated

`ChannelType::category()` (see `docs/capabilities-and-channel-types.md`) is `'standard'`
(text, voice) or `'mod'` (announcement, and a future `reports` type) for every built-in
type. `ChannelPolicy::create()` requires `ManageModChannels` to create a `'mod'`-category
channel; `ManageChannels` alone is **not** sufficient for that — a deliberate strict split,
unlike `ManageChannelVisibility`'s sibling relationship to `ManageChannels` below.
`ManageModChannels` instead *implies* `ManageChannels`: a role holding it can also create
`'standard'`-category channels and perform all non-create channel management (edit/
delete/reorder), via `ChannelPolicy::canManageChannels()`'s
`ManageChannels || ManageModChannels` check. In short, `ManageModChannels` is a superset
of `ManageChannels`, not a disjoint permission — granting it is granting everything
`ManageChannels` grants, plus mod-category creation.

This was a deliberate behavior change from channel creation's pre-`ManageModChannels`
shape, where `ManageChannels` alone gated creation of every type regardless of category:
any room role that already held `ManageChannels` but not `ManageModChannels` lost the
ability to create `announcement` channels the moment this permission shipped, until
explicitly re-granted `ManageModChannels`. No automatic backfill was performed.

#### Per-category grants (finer than the two bucket permissions)

`RoleChannelCategory` (see "Schema" above) lets a role be granted creation rights for
one specific category directly, without holding the whole `ManageChannels`/
`ManageModChannels` bucket permission — e.g. a role scoped to just the `mod` category.
`ChannelPolicy::create()` checks `PermissionChecker::hasCategoryGrant($user, $category,
$room)` first and authorizes immediately if it matches, regardless of the two bucket
permissions; only when there's no matching category grant does it fall through to the
`ManageModChannels`/`canManageChannels()` check described above. This is purely
additive — a category grant never revokes what the bucket permissions already grant,
consistent with `PermissionChecker`'s no-explicit-deny union semantics. Category grants
are scoped to *creation* only, same as `ManageModChannels`'s original scope — they don't
extend to `manage()` (edit/delete/reorder of an already-existing channel).

The Roles UI (`RoleCard.tsx`) renders one `Toggle` per
`services/channelTypes.tsx`'s `KNOWN_CHANNEL_CATEGORIES` (today: `standard`, `mod` —
grows automatically as new categories are registered, no UI code change needed) below
the permission checklist. Each is independently clickable — checking/unchecking one
edits `channel_categories` in the `PATCH /api/roles/{role}` payload directly, same
full-replace-on-save shape as `permissions`. Checking "Manage User Channels" or "Manage
Mod Channels" bulk-applies its bucket's categories as a *convenience default*
(`Manage User Channels` → every non-`mod` category; `Manage Mod Channels` → `mod`) —
unchecking the permission afterward bulk-removes the same set, but a category toggled
independently afterward stays on regardless of the permission toggles' state.
This mirrors the backend precisely: a category toggle turned on (by either path) and
saved is a real `RoleChannelCategory` row, evaluated on its own by `ChannelPolicy::
create()`, not merely a visual reflection of the two permissions.

`RoomPolicy::invite` checks `Room::hasMember` OR `PermissionChecker::can($user,
Permission::InviteMembers, $room)` — membership remains sufficient (any member can
invite, unchanged from before), with `InviteMembers` added as an override so
instance-wide/room staff who hold it can invite even into a room they haven't joined.
Split from `ManageMembers` (which now means "kick" only) — see "Schema" above.

`Api\RoleController::index` (`GET /api/rooms/{room}/roles`) backs the room
role-management UI — `RoomRolesPanel.tsx`, one of the inline panels
`Channels/Show` swaps into its main pane in place of the channel content (see
`docs/capabilities-and-channel-types.md`), self-fetched rather than threaded
through Inertia props. `Api\RoleController::indexGlobal` (`GET
/api/settings/roles`) is its instance-wide equivalent, backing the Roles tab in
Settings (`components/settings/GlobalRolesSettings.tsx`) — see "Global
(instance-wide) roles" below. Both surfaces render the same `RoleCard`
component (`resources/js/components/roles/RoleCard.tsx`), which is
scope-agnostic — every API call it makes is keyed by role id, not room id.

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
role's rank in this per-room hierarchy is undefined. Its global-scope sibling,
`Role::highestGlobalRoleFor(User $user): ?Role`, is the same query over `room_id IS
NULL` roles — see "Global (instance-wide) roles" below for why this now exists.

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

On the frontend, `RoleCard`'s `removeMember`, and `RoomRolesPanel`/`GlobalRolesSettings`'s
`removeRole` and `moveCustomRole` (reorder) all follow their optimistic local update with
a `reload()` — a refetch of `fetchRoomRoles`/`fetchGlobalRoles` — since both panels'
`roles` state is otherwise seeded once on mount and would not see server-side side
effects otherwise. Reorder needs this for a different reason than remove/delete:
shifting positions can change which roles the viewer outranks (and therefore
`can_manage`) even for roles not directly touched, and the optimistic update only
patches `position`.

### `can_manage` must be computed by every endpoint that returns a Role

`can_manage` has to be computed and returned by every endpoint whose response the
frontend trusts for it, not just `Api\RoleController::index`/`indexGlobal`'s initial
fetch. `RoleCard` reads `role.can_manage ?? false`; any endpoint returning `Role` JSON
the frontend renders without going through `index`/`indexGlobal` first needs
`Gate::allows('manage', $role)` computed the same way those do.

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
`is_default: true` "Member" role, granting `SendDirectMessages`, `CreateRoom`, and
`React` by default (`React` because a conversation-scoped reaction has no room to check
`React` against — see "Room creation" and "Direct message restriction" below) — the
global mirror of `seedDefaultsForRoom()`'s room Member. It also idempotently seeds
**"Server Moderator"** — an ordinary custom global role (`is_system: false`, `position:
50`, no permissions pre-granted), deletable but present by default, giving server-wide
roles the same three-tier shape (top/moderator/member) room roles already have. There's
no existing precedent yet for what a server moderator concretely does, unlike room
Moderator's channel-management grants which map onto things that already exist — it's
left blank for a server admin to configure via the Roles tab. Called from a one-time
data migration (`2024_01_01_000027_seed_global_member_role.php`),
`AuthController::register` (every new user), `DatabaseSeeder`, and
`UserFactory::configure()`'s `afterCreating` hook (every factory-created user in tests)
— the same "every user needs at least one role" guarantee room membership has, now
enforced at the instance level too. `RoleAssignment::firstOrCreate`/`firstOrCreate` at
each call site keeps this idempotent.

**Management.** `ManageRoles` is reused for global role management, not a separate
ability — `RolePolicy::create(User, ?Room $room = null)` accepts a null room for the
same reason. Global roles now have **real hierarchy**, same shape as room roles:
`Role::rank()` already worked unmodified for global roles (it only inspects
`is_system`/`is_default`/`position`, never `room_id` — Administrator `is_system: true`
→ `INF`, the default Member → `-INF`, Server Moderator/any other custom global role →
its `position`), so closing the gap only needed a global-scope sibling to
`highestRoleFor()`: `Role::highestGlobalRoleFor(User $user): ?Role`. `RolePolicy::
manage`'s global branch used to grant management on `ManageRoles` alone with **no** rank
comparison — a custom global role holding `ManageRoles` could edit/delete a peer or
higher-ranked global role, including in principle promoting itself. It now runs the same
outranks-the-target check the room branch always has, sourced from
`highestGlobalRoleFor()` instead of `highestRoleFor()`. `Api\RoleController::reorderGlobal`
gained the matching `outranksOrEquals()` gate `reorder` (room) already had, for the same
reason: the actor's own role is necessarily in the full reorder payload.
`Api\RoleController::indexGlobal` (`GET /api/settings/roles`) returns every global role
+ every instance user, self-fetched by the Roles tab
(`components/settings/GlobalRolesSettings.tsx`) in Settings — only rendered at all when
`SettingsController::show`'s `can_manage_global_roles` prop (`Gate::allows('create',
[Role::class, null])`) is true, so the tab is invisible to anyone who isn't server
staff. `storeGlobal`/`reorderGlobal` are the room-less equivalents of `store`/`reorder`
(`update`/`destroy`/`addMember`/`removeMember` are already room-less, keyed by role id,
and work unchanged for global roles).

## Room permission ceilings

A server admin can cap what a given server role's rooms are ever allowed to grant, down
to individual permissions and channel-creation categories — binding even that room's
Owner. This closes a real gap: previously, any actor with `ManageRoles` who outranked a
target role could grant that role *any* permission (except `Administrator`), regardless
of what the actor held themselves.

**The core mechanism is one recursive rule, reused at every layer:** an actor can only
grant a permission they currently hold themselves. `App\Support\PermissionCeiling`
(`grantablePermissions(User $actor, Role $forRole): Collection`) is the single primitive
`Api\RoleController::update` checks before persisting an *addition* to `permissions[]`/
`channel_categories[]` (removals are always allowed) — it needs no ceiling-awareness of
its own, because by induction a room's Owner can never hold more than the room's
snapshot ceiling to begin with (see "Snapshot timing" below), so `PermissionChecker::
can()` against the room already reflects it at every level beneath Owner too.
**Revocation does not cascade** — tightening a ceiling or a role's permissions doesn't
retroactively strip what's already been granted further down, matching the existing
precedent that hierarchy checks are validated at edit time only, never continuously
re-checked against history.

**Setting a server role's ceiling** is authorization-wise just another way of changing
that role's abilities — gated by the same `ManageRoles` + strict-outranks pair as any
other global-role edit (`RolePolicy::manage`/`manageCeiling`), not a separate permission.
The additional check is `PermissionCeiling::actorCeilingCapacity(User $actor):
array|string` — every permission the *actor's own* global-role ceiling capacity allows
them to write into another global role's ceiling, or the sentinel `'unrestricted'` if
any global role they hold imposes no ceiling of its own (Administrator included — it's
never restricted). This is deliberately **not** "does the actor hold this in some room"
— a room ceiling caps rooms, it isn't evidence of what a server-wide actor personally
holds — it's whether the actor's *own* ceiling rows include it, sourced from
`RoleRoomPermissionCeiling`/`RoleRoomChannelCategoryCeiling`, not `PermissionChecker::
can()`. This is the server-tier instantiation of the exact same recursive rule
`grantablePermissions()` enforces at room tier: "role 3 can't let role 4 make rooms that
ban members if role 3's own ceiling excludes it," independent of the base `ManageRoles`
gate.

**Snapshot timing.** `Room::snapshotPermissionCeiling(User $creator): void` runs once, at
room creation, and is never recomputed live — a server admin tightening a role's ceiling
later does not retroactively re-cap existing rooms. "Reapply current server defaults to
an existing room" is a deliberately deferred idea, not built — see `CLAUDE.md`'s
`## Planned work`. It gathers the creator's global roles: if *any* is unrestricted
(including holding `Administrator`, or simply the default Member role — true for every
user today, which is what makes this a zero-behavior-change rollout for every room
created before or immediately after this shipped), the room stays unrestricted
(`rooms.permission_ceiling_unrestricted: true`, the default). Only if *every* global role
the creator holds is restricted does the room become restricted, snapshotting the union
of those roles' ceiling rows into `room_permission_ceilings`/`room_channel_category_ceilings`.
Must run **before** `Role::seedDefaultsForRoom()` — see "Default roles" above — since
Owner's/Moderator's/Member's seeded grants read the room's freshly-snapshotted
`effectivePermissionCeiling()`/`effectiveChannelCategoryCeiling()` to decide what they
actually start with.

Called at all 3 room-creation sites (`Web\RoomController::store`, `RoomFactory`,
`DatabaseSeeder`), matching `seedDefaultsForRoom`'s existing convention.

**Authoring UI.** `PATCH /api/settings/roles/{role}/room-ceiling`
(`Api\RoleRoomCeilingController::update`) is the one endpoint — full-replaces a global
role's ceiling permissions/categories in one request, same delete-then-recreate shape as
`Api\RoleController::update`. `resources/js/components/roles/RoomCeilingSection.tsx`
backs it: only rendered under a global role's card (Settings → Roles) when
`role.can_manage_ceiling` is true, a toggle for "this role imposes a ceiling" plus (when
on) a `PermissionToggleList` scoped to room-tier permissions only — a ceiling has
nothing to say about server-tier permissions like `CreateRoom`.

**Channel-tier overrides** (`channel_permission_overrides`, see "Schema" above) — the
curated set (`Permission::channelOverridableCases()`): `SendMessages`,
`PostAnnouncements`, `Comment`, `React`, `Vote`, `ManageChannelVisibility` — deliberately
small; room-management-style permissions (`ManageRoom`, `ManageRoles`, `BanMembers`,
etc.) never appear at channel scope. `ManageChannelVisibility`'s inclusion is a
deliberate exception to "content only": a role that holds it room-wide could be blocked
(or, conversely, force-granted) from managing visibility on one specific channel — this
is distinct from, and sits alongside, the *existing* `channel_role_visibility` table
(which controls who can **see** a channel, not who can **change** its visibility
settings). See "Channel permissions" below for the read/write/UI wiring.

## Room creation

`CreateRoom` gates `Web\RoomController::create`/`store` via `RoomPolicy::create` — room
creation previously had no gate at all, so it's granted to the global Member role by
default (`Role::seedGlobalDefaults()`), keeping this a zero-behavior-change rollout for
ordinary users. The frontend's `can_create_room`-style gating (hiding/disabling
`RoomRail`'s "create room" affordance for a user who lacks it) is not wired up yet —
today an ungated user simply hits the server-side 403; the affordance stays visible
regardless. `Web\RoomController::create` (the GET page load) is gated the same way as
`store`, not just the submit.

## Channel permissions

Covers two related-but-distinct things, edited together in one panel and saved as one
request: **visibility** (who sees this channel at all — `channel_role_visibility`) and
**permission overrides** (who can do what *in* it — `channel_permission_overrides`, the
curated set from "Room permission ceilings" above). Both are gated by
`ManageChannelVisibility`.

### Visibility

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
  "first text-capable channel" redirect, `channel.{channelId}`'s presence-auth
  callback in `routes/channels.php`, `Web\MessageController::show`'s "go to message"
  direct-link resolver (see docs/messages-and-pagination.md), and
  `TextMessageService::assertMember` — without the last of these, a room member
  denied by a restriction could still read or send a restricted channel's messages
  straight through `/api/channels/{channel}/messages`, bypassing everything else on
  this list (a real gap this milestone closed; see
  `tests/Feature/Messages/MessageVisibilityTest.php`).
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
  frontend (`ChannelPermissionsPanel`) doesn't replicate this rank comparison — it lets
  any role be toggled and surfaces the backend's 422 message on save, keeping the
  hierarchy logic in one place.

### Permission overrides

`PermissionChecker::canInChannel(User $user, Permission $permission, Channel $channel):
bool` is the read side — `Permission::can()` for a specific channel, with the curated
subset additionally checkable per-role via `ChannelPermissionOverride`. A row's `allowed`
replaces only *that one role's* contribution to the OR-union, not a global deny — a user
holding a second, non-overridden role that grants the permission still passes. Migrated
onto this from plain `can()`: `TextMessageService::authorizeSend`'s `Comment`/
`SendMessages`/`PostAnnouncements` checks, `ReactionController`'s `React` check,
`VoteService`'s `Vote` check (each only where a `Channel` is actually in scope — a
conversation-scoped message/reaction/vote has no channel to override against and keeps
calling plain `can()`).

`Api\ChannelController::updatePermissionOverrides` (the write side, folded into the same
`update()` mixed-request handling `updateVisibility` uses) full-replaces a channel's
override rows. Two guards: every `role_id` must belong to the channel's own room, and any
row with `allowed: true` additionally requires the actor currently hold that permission
room-wide themselves — the same "can't grant what you don't hold" rule
`PermissionCeiling` enforces for ordinary role grants, extended down to this layer.
Force-*denying* (`allowed: false`) has no such requirement.

**Capability-aware filtering, frontend-only.** Not every overridable permission means
something for every channel *type* — `Vote` on a plain text channel, or `Comment` on a
type whose `Content` component never renders a comment thread, would be a dead toggle.
`services/channelTypes.tsx`'s `overridablePermissionsFor(type)` narrows
`CHANNEL_OVERRIDABLE_PERMISSIONS` down using each `ChannelTypeDescriptor`'s hand-set
`supports` tags (`'text'`, `'ordinary_send'`, `'vote'`, `'comments'`, `'announcement'` —
`'text'` and `'ordinary_send'` are deliberately separate, since an announcement channel
has messages/reactions but never posts via `SendMessages`, only `PostAnnouncements`).
`manage_channel_visibility` needs no tag — it's always offered, even on a voice channel
with no messages at all. This is purely a frontend affordance (the backend has no
per-type validation of which override permissions "make sense" — it only checks the
curated set is valid and the grant-guard above); adding a new channel-overridable
permission means one line in `OVERRIDABLE_PERMISSION_REQUIREMENTS`, not touching every
existing type.

- **UI**: `Channels/Show` renders the 🔒 button in the channel header and, when
  `visibilityOpen`, `ChannelPermissionsPanel` directly below it — absolutely positioned
  (`top-full` off a `relative` header wrapper) so it reads visually as sitting right
  below the title, above the channel content, without actually pushing that content
  down: opening/closing it must never move the message list's scroll position. Not a
  Radix `Popover`/portal, not a centered modal, and not one of `Channels/Show`'s
  `mainView` panels either (see `docs/capabilities-and-channel-types.md`'s "Inline
  panels") — this is a header-attached toggle, not a full main-pane view, and it stays
  independent of which `mainView` is showing. `Channels/Show` owns the open/closed state
  and a `mousedown` listener scoped to the header's container ref for click-outside-to-
  close, since there's no Radix dismissal behavior to lean on here; `ChannelPermissionsPanel`
  itself only owns the form and closes via its `onClose` prop — clicking the lock icon
  again, clicking outside the header, clicking Cancel, or a successful save all call it.
  Visibility renders as a `Toggle` per role (same component RoleCard uses); overrides
  render as a `TriStateOverride` segmented control (Inherit/Allow/Deny) per role ×
  applicable permission — a real third state a binary `Toggle` can't represent, since "no
  row" (inherit) is meaningfully different from either forced state.

## Ordinary posting and reacting

`SendMessages` gates ordinary (non-comment, non-announcement) channel posting —
`TextMessageService::authorizeSend`'s default branch, checked only for a plain `Channel`
whose `type !== 'announcement'` (an announcement channel stays gated solely by
`PostAnnouncements`, never both). `React` gates adding/removing a reaction
(`ReactionController`), resolving `$room` the same way `Comment` does (`$message->
scopeEntity() instanceof Channel ? ...->room : null`, `$room = null` for a
conversation-scoped message — see "Direct message restriction" below for why `React` is
also granted to the global Member role). Both previously had **no** `Permission::*`
check at all, only room/conversation membership — closing that gap is what makes
`SendMessages`/`React` channel-overridable (see "Room permission ceilings" above)
meaningful: a channel can now express "disable ordinary sending but keep comments
enabled," which the code structurally could not represent before. Both are granted to
the seeded Member role by default (see "Default roles" above).

`ChannelPolicy::post(User, Channel): bool` was updated to match `authorizeSend` exactly
— it used to return `true` unconditionally for every non-`announcement` channel, which
meant `channel.can_post` (the prop `MessageInput`'s visibility is driven by) would lie
for a member lacking `SendMessages`, showing a composer the backend would then 403 on
submission. It now requires `SendMessages` for a non-announcement channel, same as
`authorizeSend`.

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

## Announcement posting restriction

`PostAnnouncements` gates sending into an `announcement`-type channel specifically —
`TextMessageService::authorizeSend` has a literal `$this->entity->type ===
'announcement'` branch requiring it, checked in addition to (not instead of) the normal
`hasCapability('text.send_text')` capability check every channel type goes through (see
`docs/capabilities-and-channel-types.md`'s "Announcement channels also gate posting, not
just creation" for why this is layered RBAC-on-capabilities rather than a capability
itself). Granted to the seeded Moderator role by default; Owner already holds it via
`Administrator`. Reading an announcement channel is unrestricted — only sending is
gated, same read/write split every other channel type has.

`ChannelPolicy::post(User, Channel): bool` mirrors the same check (`true` for every
non-`announcement` type) and backs `Web\ChannelController::show`'s `channel.can_post`
prop — `TextChannelContent` reads it to swap the composer for a read-only notice
instead of rendering a control that would just 403 on submit. This is the frontend
affordance only; `TextMessageService::authorizeSend` remains the actual enforcement
boundary, same pattern as every other `can_*` prop in this doc.

Like `SendDirectMessages`, there's no per-user override — moving a user off a role that
grants `PostAnnouncements` (or never granting it) is the only lever. Unlike
`SendDirectMessages`, this permission is checked with the room passed
(`PermissionChecker::can($user, Permission::PostAnnouncements, $room)`), so a
room-scoped role granting it works normally — no global-only special-case in `RoleCard`
is needed here.

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
