# Status, custom status, and the status popover

## Schema

`users.status` is one column with 5 possible values: `online`, `idle`, `dnd`,
`offline`, `custom` (`string(16)`, default `offline`, no DB-level enum constraint —
validated at the request layer). `custom` **replaces** the other 4 rather than
combining with them — it's a fifth status, not a modifier on top of one of the others.

Two more columns only ever hold something when `status` is `custom`:

| Column | Type | Notes |
|---|---|---|
| `custom_status` | `string(128)`, nullable | Free-text message. `null` whenever `status !== 'custom'`. |
| `custom_status_color` | `string(7)`, nullable | A `#RRGGBB` hex string, free-form (no preset palette) via a native `<input type="color">`. `null` whenever `status !== 'custom'`. |

This is an invariant `UserStatusService::setStatus()` enforces on every write, not
just a convention: setting any status other than `custom` always nulls both columns
in the same update, and setting `custom` always requires both. The three columns can
never disagree about whether a custom status is active.

`recent_custom_statuses` (UUID PK, `HasUuids`) records the last-3-used (text, color)
pairs per user, for the popover's quick-reapply chips:

| Column | Type |
|---|---|
| `user_id` | `foreignUuid`, cascade-deletes with the user |
| `text` | `string(128)` |
| `color` | `string(7)` |
| `created_at`/`updated_at` | standard timestamps |

`unique(['user_id', 'text'])` — the status **text is a recent entry's identity**, not
the (text, color) pair. Reapplying the same text — with the same color or a different
one — overwrites that row's `color` and bumps its `updated_at` (via `updateOrCreate`)
rather than inserting a duplicate; a user never has two recent entries with the same
text. `App\Models\RecentCustomStatus::recentForUser($userId, $limit = 3)` returns them
ordered by `updated_at` desc with `id` (a time-ordered UUIDv7 — see CLAUDE.md trap #14)
as a tiebreaker, since several statuses recorded within the same second would
otherwise sort arbitrarily on `updated_at` alone.

## `StatusFeature`

`App\Support\Capabilities\StatusFeature` (`key='status'`, one capability
`set_status`) is registered in `FeatureRegistry` alongside `TextFeature`/
`VoiceFeature` — but unlike those, **no `ChannelType` requests it**. Status isn't
scoped to a `Channel`/`Conversation` row, so there's nothing with a `type` column for
it to attach to via the existing `ChannelTypeRegistry` mechanism (see
`docs/capabilities-and-channel-types.md`). It's registered purely for forward
compatibility: if a future `ChannelType` (or a future non-channel-scoped attachment
point) wants to gate status-setting, `status.all` is already there to request, with no
change needed to `StatusFeature` itself. Today, changing status is unconditionally
available to any authenticated user acting on themself — `UserStatusService` enforces
that directly, not via `hasCapability()`.

## `UserStatusService`

One method, one write path, for every status change (`app/Services/
UserStatusService.php`):

```php
public function setStatus(User $user, string $status, ?string $customStatus = null, ?string $customStatusColor = null): void
{
    $isCustom = $status === 'custom';

    $user->update([
        'status'              => $status,
        'custom_status'       => $isCustom ? $customStatus : null,
        'custom_status_color' => $isCustom ? $customStatusColor : null,
    ]);

    if ($isCustom) {
        $this->recordRecentCustomStatus($user, $customStatus, $customStatusColor);
    }

    broadcast(new UserStatusChanged($user->id, $user->status, $user->custom_status, $user->custom_status_color));
}
```

Picking `online`/`idle`/`dnd`/`offline` and setting `custom` are the *same* call —
just with or without the two optional args. There's no separate "clear the custom
status" step and no second method to keep in sync with this one: passing anything
other than `'custom'` as `$status` clears both columns as a side effect of the single
`update()` call above.

`AuthController::login`/`register`/`logout` call this too (forcing `online`/
`offline`) — since it's the same unconditional rule, logging in or out also clears
any custom status that was active. There is no special-cased "preserve custom status
across a session boundary" path; if that's ever wanted, it needs its own explicit
design decision, not a silent exception carved into this method.

`recentCustomStatuses(User $user): Collection` returns the up-to-3 most recent
distinct custom statuses, most recent first — used both for the Inertia-shared
`recentCustomStatuses` prop (`HandleInertiaRequests::share()`) and echoed back in
every `PATCH /api/user-status` response so the popover's chip list is never one
request behind.

## Broadcast contract

`UserStatusChanged` (`app/Events/UserStatusChanged.php`) implements
**`ShouldBroadcastNow`**, not the queued `ShouldBroadcast` most events in this app
use — deliberately. It's the one broadcast not sent `->toOthers()` (it goes to the
acting user's own tabs too, see below), so a queued delivery delay is directly visible
to the person who just changed their own status, not just to other users watching
them. `ShouldBroadcastNow` sends it synchronously within the request instead.

It's not sent `->toOthers()` because it's fired from plain Inertia requests
(login/logout) and the status Api endpoint, neither of which carry the `X-Socket-ID`
header axios adds for `toOthers()` exclusion — broadcasting to everyone (including
the user who changed it) is simpler than also threading a local optimistic update
through every `UserStatusService` call site. (`UserStatusPopover` *does* also apply
the change locally from its own HTTP response, for instant feedback in the acting
tab — see below — so the broadcast mainly matters for the user's other tabs and
everyone else.)

`routes/channels.php`'s `presence.global` channel-auth closure returns the same
shape (`user_id`, `status`, `custom_status`, `custom_status_color`) as the initial
snapshot every already-connected tab needs — this is what backs `.here()`'s initial
roster in `services/echo.ts`.

### Frontend: `usePresence`

`resources/js/stores/index.ts`'s `usePresence` store keys `statuses` by `user_id`,
one full `PresenceEntry` per user:

```ts
export interface PresenceEntry {
    status: UserStatus // 'online' | 'idle' | 'dnd' | 'offline' | 'custom'
    customStatus: string | null
    customStatusColor: string | null
}
```

`services/echo.ts`'s `subscribePresence()` populates this from `.here()`/`.joining()`/
`.listen('.UserStatusChanged')` — all three carry the same payload shape, all three
write a full `PresenceEntry`. `.leaving()` sets `{ status: 'offline', customStatus:
null, customStatusColor: null }`. `setPresence` is a plain overwrite — the newest
call always wins, no merge, no ordering guard, because every write (broadcast or
optimistic) always carries the complete three-field snapshot already.

Anything reading live presence (`Avatar`, `MemberList`, `UserPanel`) reads
`.status`/`.customStatus`/`.customStatusColor` off this entry, falling back to the
seeded prop values (`user.status`/`user.custom_status`/`user.custom_status_color`)
when there's no live entry yet — and branches on `status === 'custom'` before using
the custom fields at all, the frontend mirror of the same invariant the backend
enforces:

- `Avatar`'s status dot shows one of the 4 plain status colors when `status !==
  'custom'`, or `customStatusColor` directly when it is — never both, never neither.
- `UserPanel`/`MemberList` show the custom status message only when `status ===
  'custom'`; otherwise they show nothing (`UserPanel` falls back to `@username`).

## The status popover

Clicking the avatar+name in the bottom-left `UserPanel` (`resources/js/components/
layout/UserPanel.tsx`) opens `UserStatusPopover` (same directory), anchored above it.
Top to bottom: the 4 plain-status buttons, a color input + text input + save button
for a custom status, up to 3 recent-status chips (click to reapply), then Settings
and Logout.

`UserStatusPopover` composes `components/ui/Popover` (not `components/ui/
DropdownMenu`) — the panel mixes dismiss-on-click status buttons with a persistent
text/color input that needs to survive keystrokes without the panel closing, which
fits `Popover`'s free-form content model, not `DropdownMenu`'s auto-closing `Item`
model. It's deliberately left **uncontrolled** (no forced close on selection): every
action fires its request but leaves the popover open. Only navigating to Settings or
logging out actually leaves it behind.

One function, `applyStatus(status, customStatus?, customStatusColor?)`, backs all
three interactions — a plain-status click, the save button, and a recent chip click
(which just calls `applyStatus('custom', chip.text, chip.color)`, identical to saving
a new one). It calls the one `PATCH /api/user-status` endpoint
(`Api\UserStatusController`, via `services/api.ts`'s `updateUserStatus()`) and applies
the full response onto `usePresence` immediately — the acting tab doesn't wait on the
broadcast round-trip for its own feedback, even though `ShouldBroadcastNow` makes
that round-trip fast now anyway.

Because every call always specifies the complete new state (there's no "change this
one field, leave the others as they were" call), there's nothing to merge or carry
forward from a previous render — the entire class of stale-partial-update bug that
motivated an `updatedAt` ordering guard in an earlier iteration of this feature
doesn't apply here; see CLAUDE.md trap #41 for that history and why it's gone now.

`Settings/Index.tsx`'s Profile tab has no status/custom-status section — the popover
is the only place status is edited.

## Shared UI primitives

`components/ui/Popover.tsx` and `components/ui/DropdownMenu.tsx` are thin wrappers
around `@radix-ui/react-popover`/`@radix-ui/react-dropdown-menu`, extracted so the
Radix usage pattern (Root/Trigger/Portal/Content, `z-50 animate-fade-in` stacking) is
written once. `EmojiPicker` and `MessageRow`'s edit/delete menu are built on these
too, not just `UserStatusPopover` — see CLAUDE.md's directory map. Both wrappers keep
visual chrome (rounding, border, shadow) out of the shared component and
caller-supplied via `className`, so no one consumer's styling opinion becomes "the"
look for every future popover/dropdown.
