# Attachments: storage, visibility, and deletion

[← All docs](README.md) · See also: [messages-and-pagination.md](messages-and-pagination.md) ·
[roles-and-permissions.md](roles-and-permissions.md) · [conversations-and-invites.md](conversations-and-invites.md)

How an uploaded file is stored, why its URL isn't a plain storage link, who can
actually view it, and what happens to it when its message is deleted.

## Storage

`POST /api/upload` (`App\Http\Controllers\Api\UploadController`) is the one upload
endpoint every attachment goes through (see `services/api.ts`'s `uploadFile` —
compressed client-side first for images, see `CLAUDE.md`'s "Images are compressed
client-side" convention). It stores the file on the **private** `local` disk
(`storage_path('app/private')`, `config/filesystems.php`) — not the `public` disk, and
never symlinked into `public/storage`. `Attachment::path` (hidden from JSON, an
internal implementation detail) records where it landed; `Attachment::uploader_id`
records who uploaded it.

`Attachment::url` is **not a database column** — it's an accessor
(`Attachment::url()`, appended via `$appends`) that always resolves to
`route('attachments.show', $this->id)`. This means the URL can never drift out of
sync with the actual serving route, and callers (the frontend, `Message::toArray()`,
`MessageSent::broadcastWith()`) don't need to know or care that anything changed —
`attachment.url` was always just an opaque string to them.

## Visibility

An attachment is exactly as accessible as the message it's on — never independently
reachable by URL regardless of channel/room membership or bans, which was a real gap
before this existed (an unguessable-but-unauthenticated direct link worked forever,
even after being kicked or banned, since only the *message* row was ever gated).

`Web\AttachmentController::show` is the only place an attachment's bytes are served
from. It authorizes via `AttachmentPolicy::view`, which:

- If the attachment is already on a sent message (`message_id` set): defers to
  `MessagePolicy::view($user, $message)` — the same two-branch check
  `TextMessageService::assertMember` applies when listing/sending against a
  Channel/Conversation directly (room membership + `Channel::isVisibleTo()` for a
  channel message; `Conversation::hasParticipant()` for a conversation message),
  expressed here starting from a `Message` row instead. `Web\MessageController::show`
  (the "go to message" direct-link resolver, see `messages-and-pagination.md`) uses
  the same policy, so a message link and its attachment's link are authorized
  identically.
- If it isn't yet (`message_id` still null — the brief window between `POST
  /api/upload` succeeding and the message actually being sent): only the uploader may
  view it. There's no channel/conversation to check yet.
- A legacy row with no `path` (predates the `path` column — its file lived on the old
  public disk at a location this schema has no record of) 404s rather than erroring.

A guest hitting `/attachments/{id}` gets redirected to `/login` like any other
`auth`-gated web route; an authenticated-but-unauthorized user gets a 403.

## Deletion

`Message` soft-deletes (`SoftDeletes` — kept around for reply-context/audit purposes),
so `TextMessageService::destroyMessage` deleting a `Message` never actually removes the
row, and the `attachments.message_id` foreign key's `cascadeOnDelete()` never fires (it
only fires on a real `DELETE`, not a soft one). Attachments are handled explicitly and
asymmetrically instead: deleting a message is a **real** delete for its attachments —
each file is removed from the `local` disk and its `Attachment` row is actually deleted
(not soft), storage first (an orphaned row pointing at a missing file is harmless; an
orphaned file nothing ever cleans up isn't). The message row lives on as a
soft-deleted stub, same as one with no attachments ever did.

## Tests

| | |
| --- | --- |
| `tests/Feature/Uploads/UploadTest.php` | validation, size limits, dimension extraction |
| `tests/Feature/Uploads/AttachmentVisibilityTest.php` | every branch of `AttachmentPolicy`/`MessagePolicy` (member, non-member, visibility-restricted, `SeeAllChannels` bypass, participant, non-participant, uploader-only pre-attach window, guest redirect, legacy-row 404, the `url` shape) |
| `tests/Feature/Messages/MessageDeleteTest.php` | deleting a message removes its attachment's file and row, leaves the message soft-deleted |
