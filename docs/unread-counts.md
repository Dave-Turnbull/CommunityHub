# Unread counts

[← All docs](README.md) · See also: [messages-and-pagination.md](messages-and-pagination.md) ·
[notifications.md](notifications.md) · [roles-and-permissions.md](roles-and-permissions.md) ·
[conversations-and-invites.md](conversations-and-invites.md)

How the app knows where new messages are: a per-user read marker per channel and
conversation, the counts derived from it, and where they surface. Unread counts are
separate from [notifications](notifications.md) — they are computed from messages and
markers, not stored per message, and nothing here sends an email or an in-app notification.

## Read markers

`read_markers` (model `ReadMarker`, UUID PK) holds one row per `(user, channel)` or
`(user, conversation)` — exactly one of `channel_id`/`conversation_id` is set, the same
either/or shape as `messages`. `last_read_at` is the only payload. Two unique indexes,
`(user_id, channel_id)` and `(user_id, conversation_id)`, back an atomic upsert; rows
cascade away with the user, channel, or conversation.

`ReadMarkerService` owns every read and write:

- `markChannelRead(Channel, User)` — authorizes first (room member **and**
  `Channel::isVisibleTo`, else 403), then upserts `last_read_at = now()`.
- `markConversationRead(Conversation, User)` — participants only (403 otherwise).

Marking happens in three places: `POST /api/channels/{channel}/read` and
`POST /api/conversations/{conversation}/read` (204, unthrottled — they sit beside the
`/focus` routes), and the Inertia page controllers `Web\ChannelController::show` /
`Web\ConversationController::show`, which mark the scope read as part of the page load so
the response already reports it as 0.

## What counts as unread

A message counts when all of these hold:

- it is top-level (`parent_message_id` null) — comments never count, and a comment has no
  `channel_id`/`conversation_id` of its own anyway;
- `deleted_at` is null — soft-deleted rows, including `[deleted]` tombstones, are excluded;
- it was not authored by the viewer;
- `created_at` is strictly after the viewer's `last_read_at`.

With **no marker** the baseline is when the viewer joined that scope instead:
`room_members.joined_at` for a channel (membership is per room, so every channel in a room
shares one join time) and the `conversation_participants.created_at` for a conversation
(that pivot has no `joined_at`). A channel joined before markers existed therefore shows only
messages newer than the join, never the historical backlog. A scope the user has opened (or
marked) always uses the marker, which only moves forward.

Timestamps are second-precision (`timestamp(0)`-shaped, written as `Y-m-d H:i:s`), so a
message created in the same second as a marker is treated as read.

## Computing counts

All counts are set-based queries on the query builder — no per-row queries, and nothing
Postgres-specific, so the same SQL runs on the in-memory SQLite test database. The
comparison is `m.created_at > coalesce(rm.last_read_at, <join baseline>)` over a
`LEFT JOIN read_markers`.

| Method | Used by | Shape |
|---|---|---|
| `conversationUnreadCounts(User, ?ids)` | `HandleInertiaRequests` `conversations` prop (`unread_count`) | 1 query: `conversation_participants` ⨝ `messages` ⟕ `read_markers`, `GROUP BY conversation_id` |
| `channelUnreadCounts(roomId, User)` | `Web\ChannelController::show` → `room.channels[].unread_count` | `messages` ⨝ `channels` ⨝ `room_members` ⟕ `read_markers`, `WHERE c.room_id = ?`, `GROUP BY c.id` |
| `roomIdsWithUnread(User)` | `HandleInertiaRequests` `rooms` prop (`has_unread`) | same join without the room filter, `GROUP BY c.room_id` |

Both channel queries cost the same fixed number of queries however many channels or rooms
exist: the count itself plus one lookup of the viewer's roles (and their permissions).

### Channel visibility inside the query

Hidden channels must neither be counted nor light up a room, so the channel queries apply a
set-based mirror of `Channel::isVisibleTo()`:

```
(c.room_id IN (<rooms where the viewer holds a see-all role>)
 OR NOT EXISTS (SELECT 1 FROM channel_role_visibility v WHERE v.channel_id = c.id)
 OR EXISTS (SELECT 1 FROM channel_role_visibility v
            JOIN role_assignments ra ON ra.role_id = v.role_id
            WHERE v.channel_id = c.id AND ra.user_id = :viewer))
```

"See-all" is `Administrator` or `Permission::SeeAllChannels`, resolved from the viewer's
assigned roles in PHP: a global role holding either bypasses the clause entirely, a room role
adds that room to the `IN` list — the same global-plus-own-room union
`PermissionChecker::can()` uses. If `isVisibleTo`'s rules change, change
`ReadMarkerService::applyChannelVisibility` with them; `UnreadCountsTest` asserts parity for
the restricted, see-all-role, and global-administrator cases.

## Where it surfaces

- **`ChannelSidebar`** — an unread channel's name renders `font-semibold text-text-primary`
  and a count badge (capped at `99+`) sits in the shared row wrapper next to the hover `⋯`
  menu, so every channel type gets it. The active channel never shows one. The count is read
  from the page's `channels` prop (fresh per navigation), not the `useChannels` store.
- **`DMSidebar`** — renders the conversation's `unread_count` with the same `99+` cap.
- **`RoomRail`** — a small dot on a room's icon when its `has_unread` is true.
- **`hooks/useMarkRead(scopeType, scopeId)`** — called from `Channels/Show` and `DM/Show`.
  While the page is open it POSTs the read endpoint whenever the scope's newest message in
  `useMessages` changes and the tab is visible (at most once every 2 seconds, trailing edge
  kept), and once when the tab becomes visible again. Failures are swallowed.

## Limitations

Counts are accurate **as of the last navigation**. The client only subscribes to the channel
it has open, so there is no live increment for a channel (or room, or DM) the user is not
viewing, and nothing pushes a count to another tab. Reading a channel and navigating clears
it through the next page's fresh props. Live increments would need a per-user broadcast and
are deliberately not built.
