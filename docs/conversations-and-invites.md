# Conversations and invites

[← All docs](README.md) · See also:
[messages-and-pagination.md](messages-and-pagination.md) ·
[roles-and-permissions.md](roles-and-permissions.md) ·
[notifications.md](notifications.md)

## Message scoping

Messages are scoped by either `channel_id` OR `conversation_id`, never both.
`TextMessageService`'s internal `scope()` helper returns `['channel'|'conversation',
id]` (see `docs/service-layer.md`). Broadcast events take `(scopeType, scopeId)` and
pick presence vs. private channel accordingly.

Every controller/service that touches a message checks membership/participancy —
`Room::hasMember` for channel-scoped, `Conversation::hasParticipant` for
conversation-scoped, via `abort_unless(..., 403)`. A new message-adjacent endpoint
(pins, read receipts, etc.) needs the same check or any authenticated user can act on a
channel/DM they are not in.

## Conversation creation

A `Conversation` row is only created when its first message is actually sent — picking
recipients (and optionally naming a group) in `NewConversationModal`
(`components/messages/NewConversationModal.tsx`) is client-side draft state with
nothing persisted yet.

`Api\ConversationController::store` (`POST /api/conversations`) both resolves/creates
the conversation and sends the first message atomically. It deliberately duplicates
`TextMessageService::send()`'s tail rather than sharing it, matching this app's
no-`FormRequest`/no-shared-validation-trait convention elsewhere.

### Eligibility

Users can only message people they share a room with. Enforced by
`User::sharesRoomWith(string $otherUserId): bool`, checked inline in
`ConversationController` (not a policy — there is no existing `Conversation` resource
yet at creation time to gate). `User::messageableUsers(?string $search)` backs `GET
/api/conversations/candidates`, the search endpoint behind `UserPicker`.

### Deduplication

Starting a conversation with exactly one person silently reuses an existing 1:1 DM if
one exists — no prompt, it just opens the existing thread.

A group match is different: an exact-participant-set match on an existing `type:
'group'` conversation is never reused automatically. `GET /api/conversations/resolve`
(called right after picking recipients, before compose) surfaces it as a confirm step,
and `ConversationController::store` re-checks the same match server-side, returning
`409 { message, existing }` unless the request carries `confirm_duplicate: true` — the
confirmation is enforced by the backend, not just a frontend nicety.

Both `resolve` and `store` share a private `findExactMatch()` helper (`whereHas` per
participant id + `withCount('participants')` + `firstWhere`) — portable across the
sqlite test DB and Postgres, no raw `HAVING`.

### Growing a group

`ConversationController::addParticipants` (`POST /conversations/{conversation}/participants`)
only works on `type: 'group'` conversations — a 2-person `dm` has no "add a third
person" path. Gated by `ConversationPolicy::addParticipants`. It reuses the
`direct_message` notification category to nudge newly-added users —
`DirectMessageNotificationData.message_id` is nullable for exactly this case (an "added
to group" notification has no associated message).

## Invites

`InviteModal` surfaces two independent invite mechanisms:

- **Shareable link**, built from `Room.invite_code` (generated in `Room::booted()`),
  pointing at `GET /join/{code}` (`RoomController::join` — `GET`, since it is meant to
  be opened directly as a URL). No record is kept of who used it, it never expires, and
  it adds whoever visits it (redirecting through login/register first if a guest) —
  copy/paste only, no email involved.
- **Per-email invites** (`RoomInvite`) that always go through an emailed accept link,
  whether or not the invited email already has an account — there is no "instantly add
  an existing user" path. `RoomInvite::accept(User $user)` does the actual join and is
  called from both `InviteController::show` (already logged in) and
  `AuthController::login`/`register` (via `session('pending_invite_token')`, set when a
  guest visits `/invite/{token}`).

`RoomPolicy::invite` checks `Room::hasMember` OR a global/room `ManageMembers` grant via
`PermissionChecker` — see `docs/roles-and-permissions.md`.

### Direct message restriction

Starting a conversation (this file's `store`) and sending in an existing one both
require `Permission::SendDirectMessages` — see `docs/roles-and-permissions.md`'s
"Direct message restriction" section for the permission and the moderation workflow
used to revoke it from a specific user.
