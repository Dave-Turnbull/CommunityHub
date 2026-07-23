# Notifications

## Delivery foundation

Every user has a private `App.Models.User.{id}` channel (`routes/channels.php`),
matching the naming Laravel's own `Notifiable::receivesBroadcastNotificationsOn()`
defaults to — the foundation for anything targeted at a specific user rather than a
room/DM scope.

`Notification::notify(userId, category, data)` (`app/Models/Notification.php`) creates
a row and broadcasts `NotificationCreated` on it in one call — this is the pattern for
any notification-worthy event, not a bare `broadcast(new NotificationCreated(...))` at
each call site. `$category` is stored as the `type` column and doubles as the
`NotificationPreference` lookup key.

The `user_notifications` table is deliberately not named `notifications` — Laravel's own
`Notifiable` trait expects a `notifications` table with `notifiable_type`/`notifiable_id`
morph columns, a different shape than this app's simple `user_id`-keyed one. The `User`
relation is `appNotifications()`, not `notifications()`.

### Producers

- `TextMessageService::send()` → `notifyOtherParticipants` — every DM message, category
  `direct_message`. DMs are never focus-suppressed.
- `TextMessageService::send()` → `notifyOtherRoomMembers` — every channel message, to
  every other room member (membership is at the room level, not per-channel), category
  `room_message`, default `in_app` off. Skips a focused recipient (see below).
- `RoomInviteController::store` — category `room_invite`, only when the invited email
  belongs to an existing `User`.

**A category with no producer wired up is inert** — adding a category to
`NotificationPreference::DEFAULTS` makes it visible and configurable, not functional.
Something must actually call `Notification::notify($userId, 'your_category', ...)` or
the preference does nothing.

## Focus suppression

Channel-scoped notifications (`room_message` today, `mention` when it is added) are
suppressed while the recipient is looking at the channel. DMs are not covered by this —
they always notify immediately regardless of anything on the DM page.

`App\Support\ChannelFocus` is a pure cache wrapper (no table, no queue) tracking, per
`(userId, channelId)`, whether the channel is open right now — a 30s-TTL cache key
refreshed by a heartbeat from `hooks/useChannelFocus.ts` (POST `/api/channels/{channel}/focus`
on mount + every 15s, POST `.../blur` on unmount). `TextMessageService::send()` calls
`ChannelFocus::isFocused()` synchronously and skips `Notification::notify()` entirely
for a focused recipient — no delay, no queue, no grace period.

Any future channel-scoped category should check `ChannelFocus::isFocused()` the same way
before calling `Notification::notify()`.

## Preferences

`NotificationPreference` (`app/Models/NotificationPreference.php`) is a sparse override
table, not a fully-seeded one — a user with zero rows gets `NotificationPreference::DEFAULTS`
for every category; a row only exists once they have changed something.
`NotificationPreference::for($userId, $category)` resolves the effective `{email,
in_app}` pair (override-or-default) and is what both `Notification::notify()` (gates
the `in_app` row+broadcast) and `RoomInviteController::store` (gates the `Mail::send`)
consult. There is no separate "send the email" pathway for other categories yet.

API: `GET/PUT /api/notification-preferences` (`NotificationPreferenceController`,
delegating to `UserSettingsService` — see `docs/service-layer.md`). Frontend panel:
`components/settings/NotificationPreferences.tsx`, rendered inside `Settings/Index.tsx`'s
"Notifications" tab.

### `direct_message`'s `in_app` cannot be turned off

`NotificationPreference::IN_APP_LOCKED` (currently `['direct_message']`) is enforced
twice: `NotificationPreferenceController::update` (via `UserSettingsService`) rejects
(422) a write that tries to disable it, and `NotificationPreference::for()` forces
`in_app` to `true` in the read path regardless of what is stored, so a pre-existing bad
row cannot slip through either. The frontend mirrors the list as
`NOTIFICATION_IN_APP_LOCKED` (`types/index.ts`) purely to grey out the toggle — cosmetic
only; the backend rule is the actual enforcement. `email` for `direct_message` is
unaffected and freely toggleable.

## Delivery surface

There is no notification bell. `NotificationFeed` (`components/messages/
NotificationFeed.tsx`) lives inside `DM/Index.tsx` (the "Messages" hub, below
`DMSidebar`), with filter chips for each category the user currently has `in_app`
enabled for — a chip (and that category's notifications) disappears the moment the
category is disabled, it does not just stop growing.

This filtering happens twice: `NotificationController::index` excludes disabled
categories at the query level (`whereIn('type', $enabledCategories)`) so the data never
leaves the server, and `NotificationFeed` filters again client-side against
`fetchNotificationPreferences()` before building the chip list. The backend filter is
what actually matters for privacy/correctness.

`RoomRail` calls `useNotifications(currentUserId)` itself, just for `unreadCount`, to
draw a badge on the 💬 "Messages" icon — the same hook `NotificationFeed` uses, so the
two independently re-fetch/re-subscribe on every page (matches the existing
presence-subscription redundancy pattern).

## Adding a new category

See `CLAUDE.md`'s "Adding things" recipe for the full two-halves checklist
(configurable vs. functional).
