# Conversations and invites

[← All docs](README.md) · See also:
[messages-and-pagination.md](messages-and-pagination.md) ·
[roles-and-permissions.md](roles-and-permissions.md) ·
[notifications.md](notifications.md) ·
[auth-and-sso.md](auth-and-sso.md)

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

`InvitePanel` surfaces two independent invite mechanisms:

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

## Server invites

A `RoomInvite` grants membership in one room — it has no bearing on whether the
invited email may create an account in the first place. `ServerInvite` (its own
model/table, deliberately not a nullable `room_id` on `RoomInvite` — the two gate
entirely different actions) grants exactly that: the right to create an account at
all, checked by `AuthController::showRegister`/`register` via
`ServerInviteService::validateToken()`.

This is one of three independently-toggleable **signup paths** — see
`App\Models\InstanceSetting`, a single-row, instance-wide settings table:

- `signup_manual_enabled` — the plain `/register` form, open to anyone.
- `signup_email_invite_enabled` — registering via a valid, unexpired, unaccepted
  `ServerInvite` token (`?invite={token}` on `/register`, or an `invite_token` field on
  the POST) works *regardless* of whether manual signup is also open. An invite may be
  scoped to one email (`ServerInvite.email` set — the registering email must match) or
  left open (`email` null — a shareable link, anyone who has it may use it once).
- `signup_oauth_enabled` — whether an unmatched Authentik/OAuth identity may provision
  a brand-new account (see `docs/auth-and-sso.md`); unrelated to whether OAuth login
  exists at all (`AUTHENTIK_ENABLED`).

Turning all three off closes registration entirely — existing accounts (password or
OAuth-linked) can still log in. Env vars (`SIGNUP_MANUAL_ENABLED`/
`SIGNUP_EMAIL_INVITE_ENABLED`/`SIGNUP_OAUTH_ENABLED`, see `config/registration.php`)
only seed `InstanceSetting`'s single row the *first* time it's read
(`InstanceSetting::current()`) — after that, the row is the live source of truth, and
an admin holding `ManageRoles` at global tier (the same check gating the Roles tab —
see `InstanceSettingPolicy`) can flip any of the three from Settings' "Server" tab
(`RegistrationSettings.tsx`, self-fetching `GET`/`PATCH /api/settings/instance`) with
no redeploy. Changing the env var after the row already exists has no further effect.

Creating a `ServerInvite` (`POST /api/server-invites`, `ServerInviteController`) is
gated by `Permission::InviteServer` — previously declared but intentionally inert (see
`CLAUDE.md`'s trap notes); this is its first real enforcement site.

Listing and revoking use the same permission, with no per-inviter ownership rule: any
holder of `InviteServer` sees and can revoke every outstanding invite
(`ServerInvitePolicy::viewAny`/`delete` both delegate to `create`; `ServerInviteService::
outstanding()`/`revoke()` re-check it, as `create()` does). `GET /api/server-invites`
returns invites that are neither accepted nor expired, newest first, with `id`, `email`
(null for an open link), `invited_by`, `expires_at` and `created_at`. The token is
stored raw but is deliberately omitted from the list — it is only returned by the
create response. `DELETE /api/server-invites/{serverInvite}` hard-deletes the row (as
`RoomInvite` does), so `validateToken()` no longer finds the token. Settings' "Server"
tab renders the list below the create-invite card, with a Revoke button per row.

### Default room

`InstanceSetting.default_room_id` (nullable; the foreign key nulls itself if the room
row is deleted) names one room accounts are joined to automatically. Unset — the
default — nothing is joined. `App\Services\DefaultRoomService` owns every part of it.

**Setting it.** Settings' "Server" tab (`RegistrationSettings.tsx`) has a "Default
room" card: a dropdown fed by `GET /api/settings/instance/rooms` (every room on the
instance, id and name only — deliberately not limited to rooms the acting admin belongs
to), an explicit Save, and a Clear button. It saves through
`PUT /api/settings/instance/default-room` (`room_id`, nullable to clear;
`enroll_existing`, optional boolean), separate from the signup toggles' auto-saving
`PATCH` — that `PATCH` never touches `default_room_id`. Both endpoints sit behind the
same `InstanceSettingPolicy` gate as the toggles.

**Who gets enrolled, and when.** Every path goes through
`DefaultRoomService::enrollIn()` and from there `Room::addMember()`, so an enrolled
user holds the room's default ("Member") role exactly as if they had used its invite
link.

- *A new account* is enrolled at creation — `AuthController::register` (manual and
  server-invite signup alike) and `AuthentikLoginService::provision`.
- *While email verification is enforced* (`config('verification.enabled')`), an
  unverified account is skipped at creation and enrolled when it verifies instead, by a
  `Verified` listener registered in `AppServiceProvider`. That listener doesn't
  distinguish new accounts from old ones: any account verifying while a default room is
  set is enrolled.
- *Existing accounts* are only enrolled when the admin ticks "Also add all existing
  users now" on save (`enroll_existing`), which dispatches the queued
  `EnrollExistingUsersInDefaultRoom` job. It walks every user, re-adds anyone previously
  kicked (a kick leaves no record), and does nothing if the default room has changed
  again by the time the worker runs it.

Turning verification enforcement off (`EMAIL_VERIFICATION_ENABLED`, an env var — there
is no event when it changes) does not enrol the accounts that were skipped while it was
on: they stay out until a bulk run includes them or they follow their old verification
link.

`enrollIn()` skips a user banned from the room rather than letting `addMember()` abort,
and skips unverified accounts while verification is enforced — on every path, the bulk
job included. Enrolment is otherwise a one-off: a member who is later kicked is not
re-added by anything except another bulk run.

A pending `RoomInvite` is honoured independently, so an invited signup joins both
rooms.

**Where a new account lands.** In order: the invited room's channel if signup completed
a pending room invite (`AcceptsPendingRoomInvite`), else the default room's first
visible text-capable channel (`DefaultRoomService::landingPath()` →
`Room::firstVisibleTextChannelFor()`), else `/`. The same `landingPath()` decides where
`EmailVerificationController::verify` redirects after a successful verification. An
ordinary login by an existing account is unaffected.

There is no "member joined" broadcast, so a bulk-enrolled user sees the room on their
next page load, not live.

### Direct message restriction

Starting a conversation (this file's `store`) and sending in an existing one both
require `Permission::SendDirectMessages` — see `docs/roles-and-permissions.md`'s
"Direct message restriction" section for the permission and the moderation workflow
used to revoke it from a specific user.
