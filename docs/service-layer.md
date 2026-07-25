# Service layer

## Purpose

A Feature's actual server-side operations live in a companion `{Operation}Service`
class under `app/Services/`, not inline in a controller. `Feature`
(`app/Support/Capabilities/`, see `docs/capabilities-and-channel-types.md`) stays pure
metadata — `key()`/`capabilities()`/`groups()`. It declares what a capability *is*; it
does not do anything. A Service is where the operation actually happens.

## Design rules

- **Authorization lives inside the Service method itself**, not pre-checked by the
  caller. Every public method on a Service asserts its own membership/capability/
  ownership check (`abort_unless(...)`) as its first act, so the Service is the real
  enforcement boundary and cannot be called unsafely by a future second caller (a
  console command, a queued job) that forgot to check first.
- **Controllers are thin HTTP-to-Service translators**: validate the request shape,
  call the Service, return JSON.
- **Services take plain typed arguments, never a `Request` object**, so they remain
  reusable outside an HTTP context.
- **No formal contract is required.** There is no `FeatureService` interface and no
  registry-driven resolution — a Service is just a class, resolved via constructor
  injection like anything else in Laravel's container.
- **Not every Service implies a capability check.** `UserStatusService`/
  `UserSettingsService` exist for the same "operation lives in one place" reason, with a
  trivial authorization rule (self-service only, guaranteed by every call site using
  `$request->user()`). "Service" means "this operation's logic and its authorization
  rule live together in one class," whatever that rule is.

## Current services

### `TextMessageService`

Bound to a specific `Channel|Conversation` via `TextMessageService::for($entity)` —
`list()`/`send()` are naturally scoped to one entity per call, so binding once up front
avoids re-passing it to every method.

- `list(User $user, ?string $before = null, ?string $after = null): array` — checks
  membership (`hasMember`/`hasParticipant`) and `hasCapability('text.read')`, then
  returns one page (50) of history walking away from a cursor in one direction —
  `$before` for older, `$after` for newer, neither for the live tail, both is a 422 —
  along with a flag and cursor per edge. See `docs/messages-and-pagination.md` for the
  full contract and the client-side window it exists to serve.
- `send(User $user, array $validated): Message` — checks membership and capability,
  then `authorizeSend()`s the specific pieces of the payload (`text.send_text` for
  content, `text.send_images`/`text.send_video` per attachment by mime type), creates
  the message, attaches files, updates the parent's `last_message_id`, broadcasts
  `MessageSent` with `->toOthers()`, and fires the appropriate notification
  (`notifyOtherRoomMembers` for channels, `notifyOtherParticipants` for conversations —
  see `docs/notifications.md`).
- `updateMessage(User $user, Message $message, string $content): Message` and
  `destroyMessage(User $user, Message $message): void` are `static` rather than
  instance methods — editing/deleting a message needs no entity at all, only "is this
  the author," and there is nothing to bind `for()` to at that call site (the route
  only resolves a `Message`).

`MessageController` is a thin translator over this service for every one of its routes.

### `VoiceSignalingService`

Deliberately thin — voice call orchestration (join/leave/mute) stays entirely
client-orchestrated for latency (see `docs/voice.md`). This service only covers what is
genuinely server-side:

- `iceServers(User $user): array` — issues ephemeral STUN/TURN credentials.
- `canJoin(User $user, Channel|Conversation $entity): bool` / `assertCanJoin(...): void`
  — the membership + `hasCapability('voice.join')` check a client needs before
  attempting to join. Backs both `VoiceIceServersController` and `routes/channels.php`'s
  `voice.channel.{id}`/`voice.conversation.{id}` broadcast-auth gates (resolved there via
  `app(VoiceSignalingService::class)`) — one authoritative place for "can this user join
  this call," not duplicated inline in the route file.

### `UserStatusService`

Self-service only, no capability check beyond authentication — see `docs/status.md`
for the full schema (a single 5-value `status` column, `custom` being one of the 5
rather than a modifier on the others), broadcast contract, and UI.

- `setStatus(User $user, string $status, ?string $customStatus = null, ?string $customStatusColor = null): void`
  — the only write path, for every status including `custom`. Passing anything other
  than `'custom'` nulls `custom_status`/`custom_status_color` as part of the same
  update; passing `'custom'` also records the (text, color) pair into the per-user
  recent-statuses list (capped at 3, deduped on reapply). Used identically by
  `AuthController`'s login/register/logout (forcing `online`/`offline`, which also
  clears any active custom status — no exception carved out for that) and
  `Api\UserStatusController` (the popover).
- `recentCustomStatuses(User $user): Collection` — the up-to-3 most recent distinct
  custom statuses, most recent first.

Broadcasts the full presence snapshot (status + custom_status + color) via
`UserStatusChanged`, a `ShouldBroadcastNow` event (not the queued `ShouldBroadcast`
most events here use — see `docs/status.md` for why).

### `UserSettingsService`

Self-service only, no capability check beyond authentication.

- `notificationPreferences(User $user): array` — the effective (override-or-default)
  preference for every known category (see `docs/notifications.md`).
- `updateNotificationPreference(User $user, string $category, bool $email, bool $inApp): NotificationPreference`
  — rejects (422) disabling `in_app` for a locked category.
- `devicePreference(User $user, string $clientId): array` /
  `updateDevicePreference(...): VoiceDevicePreference` — per-`(user, client_id)` mic/
  speaker preference (see `docs/voice.md`).

## Voice's split: thin backend, real frontend

Voice is the one Feature where "the operation" does not mostly happen on the backend.
`VoiceSignalingService` covers only what is genuinely server-side. The frontend
counterpart, `resources/js/services/voiceCallGuard.ts`, is where the real logic for
enforcing "one active call per user" lives instead (see `docs/voice.md`). Giving a
Feature a Service does not mean moving its logic to PHP — it means putting the
operation's logic in one clearly-owned place, wherever that correctly is.
