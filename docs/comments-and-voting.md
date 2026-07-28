# Comments and voting

[← All docs](README.md) · See also: [capabilities-and-channel-types.md](capabilities-and-channel-types.md) ·
[service-layer.md](service-layer.md) · [messages-and-pagination.md](messages-and-pagination.md) ·
[roles-and-permissions.md](roles-and-permissions.md) · [notifications.md](notifications.md)

## Overview

Any message — a channel/conversation message or another comment — can carry threaded
comments (comments on comments, unbounded), plus a simple up/down vote and a
score+timeframe sort. This is deliberately **not** a new Feature: a comment *is* a
message, so it rides `TextMessageService`'s existing cursor-paginated, windowed,
cached, live-broadcast list almost unchanged (see
[architecture-vision.md](architecture-vision.md)'s "a forum is not a new primitive").
Voting *is* a new Feature (`vote`) — a genuinely different primitive, a mutable ranked
aggregate, not a text operation.

## The polymorphic message scope

`messages` gained five columns:

- `parent_message_id` — the immediate parent for a comment (another message), null
  for a normal channel/conversation message. A comment's own `channel_id`/
  `conversation_id` stay null — it is scoped by `parent_message_id` alone, preserving
  the existing "exactly one scope" invariant (now three mutually exclusive scopes,
  enforced in `Message::booted()`'s `creating` hook rather than a DB CHECK constraint
  — sqlite, the phpunit driver, has never supported adding CHECK constraints via
  `ALTER TABLE`, only at `CREATE TABLE` time, same reason the original channel_id/
  conversation_id exclusivity has no DB-level constraint either).
- `root_message_id` — the denormalized top-level ancestor, set once at creation.
  Avoids an unbounded parent-chain walk every time visibility/capability needs to
  reach the channel/conversation a comment tree hangs off.
- `depth` — 0 for a normal message, else parent's depth + 1. Also what
  `max_comment_depth` (below) checks against.
- `is_tombstoned` — see "Deletion" below.
- `title` — an optional headline, `null` for every ordinary message and every
  comment. Used today by a forum post (see "Titles" below); a plain column on
  `Message` rather than a forum-specific table, since a title is a property of the
  message itself and any future `ChannelType` gets it for free.

`Message::children()`/`parent()`(as `parentMessage()`)/`root()` are the three
relations; `Message::scopeEntity(): Channel|Conversation|null` walks to `root` first
for a comment, then returns whichever of `channel`/`conversation` is set —
`hasCapability()`, `isVisibleTo()`, `commentsEnabled()`, and `maxCommentDepth()` all
delegate through it. `Message::logicalScope(): [scopeType, scopeId]`
(`'channel'|'conversation'|'message'`) is what realtime events route by — see
"Realtime" below.

`TextMessageService::for()` now accepts `Channel|Conversation|Message`. Given a
`Message`, `list()`/`send()` operate on `$entity->children()` instead of
`$entity->messages()` — same cursor contract (`before`/`after`/`around`), same
windowing, same cache. `GET`/`POST /api/messages/{message}/comments` are the routes;
`Api\MessageController::indexComments`/`storeComment` are thin translators over the
same service, same shape as the channel/conversation endpoints. Every message in a
list also carries `comment_count` (`withCount('children as comment_count')` on the
shared `hydratedQuery()`/`hydrate()` — a single indexed-column subquery, cheap even
for a channel that never uses it) — the frontend's "💬 N comments" affordance reads
it without a separate fetch.

## Nesting limit: `max_comment_depth`

A second parameter alongside `comments_enabled`: `channels.settings.
max_comment_depth` caps how deep a comment tree may nest — `null` (the default
everywhere except `message_and_comment`) means unlimited, `1` means only top-level
comments on the root message are allowed and a reply to a comment is rejected.
Enforced in `TextMessageService::send()`'s comment branch (422 if the new depth
would exceed it) via `Message::maxCommentDepth()`, and mirrored on the frontend:
`CommentThread` takes a `maxDepth` prop and, per comment, only renders the
"Reply"/expand affordance when `comment.depth < maxDepth` (or `maxDepth` is `null`)
— rather than showing a disabled control for a reply that would always be rejected,
it's simply not offered. `CommentThread`'s own composer is likewise gated by its
`parentDepth` prop (0 for a post) against the same rule.

## Comment gating: a parameter + a standalone permission, not a capability

This is the one place this feature deliberately does **not** follow the "add a
capability" recipe. Whether a channel/conversation allows comments at all is a
**parameter** — `channels.settings.comments_enabled` (bool) — not a `text.*`
capability key. A capability answers whether a `ChannelType` may support something in
principle; a parameter tunes whether a specific channel instance has it switched on
right now (see [architecture-vision.md](architecture-vision.md)'s "grants and
parameters are different things" — this is the first parameter any built-in
`ChannelType` actually declares and reads, previously a "designed but unexercised
seam"). Any existing `ChannelType` (`text`, `announcement`, the `conversation`
hybrid) can enable comments later just by setting `comments_enabled: true` in its own
`defaultSettings()` — commenting is not forum-exclusive by construction.
`Conversation` has no `settings` column at all today, so a DM/group thread has no way
to enable comments yet (`Message::commentsEnabled()` returns `false` for a
conversation-rooted thread).

Separately, `Permission::Comment` (RBAC) gates *authorship*, deliberately independent
of whatever gates sending an ordinary message in the same channel — there is no
generic "can send messages" permission today to make this a sibling of. A room can
grant a role `Comment` without normal posting rights, or vice versa. Both checks are
required and enforced independently in `TextMessageService`'s comment-send branch:
the `comments_enabled` setting (422 if off) and `PermissionChecker::can($user,
Permission::Comment, $room)` (403 if missing). Neither alone is sufficient.
`Permission::Vote` mirrors this shape for casting a vote, checked in `VoteService`.
Both are granted to the seeded room Member role by default (`Role::seedDefaultsForRoom`)
and were backfilled onto every pre-existing room's Member role by a one-way data
migration, same precedent as `2024_01_01_000017_backfill_room_roles.php`.

## Voting

`VoteFeature` (`key = 'vote'`, one capability `cast`) is registered like any other
Feature. `votes` mirrors `reactions`'s shape but is exclusive rather than additive:
unique `(message_id, user_id)`, `value` is `1` or `-1`, casting again *changes* the
row (`Vote::updateOrCreate`) rather than adding a second one. `Message::voteSummary(
$userId): array` returns `{score, mine}` — `score` is the signed sum, `mine` is this
viewer's own vote or null.

`VoteService::for($message)->cast($user, $value)` / `->remove($user)` — authorizes
(`isVisibleTo` + `hasCapability('vote.cast')` + `Permission::Vote`), upserts/deletes
the row, broadcasts `MessageVoted`, returns the fresh summary. `POST`/`DELETE
/api/messages/{message}/votes`.

A message's `votes` summary must be attached everywhere a message is returned to a
client, not just from the vote endpoints themselves — `TextMessageService::list()`,
`listTop()`, and `hydrate()` (used by `send()`/`updateMessage()`) each call
`$message->voteSummary($userId)` and set it as the `votes` attribute, mirroring how
`reactions` is attached in the same three places. Missing this on even one of them
means a message fetched through that path shows `votes: undefined` — the frontend's
`VoteControl` defaults that to `{score: 0, mine: null}`, which looks like "the vote
reset to 0 on refresh" and can make a repeat click on an already-cast vote look like
a no-op (the client computes its optimistic delta from a wrong baseline). This
happened once already — keep it in mind when adding a fourth message-returning path.

## Titles

`Message::title` is an optional headline (max 300 chars), threaded through
`Api\MessageController::validateMessage()`/`TextMessageService::send()` like any
other field — no channel-type-specific validation, any message may carry one.
`MessageInput`'s `showTitleField` prop renders a headline input above the compose
box and includes it in the `SendPayload` as `title`; only `ForumChannelContent`'s
post composer sets it today. In the post list, a titled post shows its title (bold)
instead of a content preview; the full body only appears once the post is opened
("expandable" in that sense — clicking the post is the expand action, there is no
separate collapse/expand toggle in the list itself).

## Deletion: tombstone by default, cascade opt-in

Deleting a message with live children either **tombstones** it (soft-delete +
`is_tombstoned = true`, children stay attached and readable — the `[deleted]`
placeholder is a frontend rendering decision, `CommentThread` checks the flag) or, if
the channel's `cascade_delete_comments` setting is `true`, cascades the soft-delete
through every descendant (`TextMessageService::cascadeDelete`, recursive). A childless
message keeps the plain soft-delete behavior unchanged. `cascade_delete_comments`
defaults to `false` (tombstone) in `ForumChannelType::defaultSettings()`.

## Sorting: score+timeframe is a distinct, offset-paginated contract

`TextMessageService::listTop($user, $period, $start, $end, $offset, $limit)` — **not**
a fourth cursor mode on `list()`. Score is mutable (a row's rank shifts as votes
arrive), so it can't share the `before`/`after`/`around` contract without producing
duplicate/missing rows across pages; this is offset-paginated instead, returning
`{data, next_offset, has_more}`. `$period` is one of `hour|day|week|month|all|custom`
(`custom` requires `start`, `end` optional); it works identically whether `$this
->entity` is a `Channel` (a forum's top-level post list) or a `Message` (top-sorted
comments within a thread) — same "score-ranked, timeframe-filtered" shape over
whichever scope column applies.

Reached via `?sort=top&period=...` on the *same* routes as the chronological list —
`GET /api/channels/{channel}/messages`/`GET /api/messages/{message}/comments` branch
on the `sort` query param in `Api\MessageController` rather than growing a parallel
`/posts` endpoint, since it's the identical entity/authorization, just a different
list shape. `?sort=top` with no `sort` param (or `sort=new`) is the plain existing
cursor path, unaffected.

Frontend: `services/api.ts`'s `fetchTopPosts()` returns a `TopPage`, distinct from
`PaginatedMessages` — don't feed one into `useChat`, which only understands the
cursor contract. `ForumChannelContent`'s "Top" tab uses it directly with local
component state, not the windowed `useMessages` store.

## Realtime

No per-message broadcast channel (would be unbounded, one per post/comment). A
comment's `MessageSent`/`MessageUpdated`/`MessageDeleted` and a vote's `MessageVoted`
ride the **existing** `channel.{id}`/`conversation.{id}` presence/private channel of
the root — `MessageSent::broadcastOn()`/`MessageVoted::broadcastOn()` resolve that
root via `$message->scopeEntity()` when `scopeType === 'message'`. Every payload
carries `scope_type`/`scope_id` (`Message::logicalScope()`) so the frontend can route
by logical scope (the comment's parent id) rather than the physical channel it arrived
on. `services/echo.ts`'s `subscribe()` reads `scope_type`/`scope_id` off each event
and dispatches into that scope's slice of the `useMessages` store instead of the
channel/conversation's own.

`useChat`'s `scopeType` widened to include `'message'`. A `'message'`-scoped call
takes an extra `broadcastScope: { id, type: 'channel' | 'conversation' }` — the
root's physical channel to subscribe on, since there is no `message.{id}` channel to
join. `CommentThread`/`ForumChannelContent`'s `PostDetail` are the two places that
thread it through.

## Frontend

- `components/chat/MessageInput.tsx` is reused as-is for every composer in this
  feature — a forum post, a comment, a top-level `message_and_comment` message.
  `scopeType` widened to accept `'message'` (sends via `services/api.ts`'s
  `sendComment` instead of `sendChannelMessage`/`sendConversationMessage`); an
  optional `showTitleField` prop renders a headline input above the compose box
  (see "Titles"). Reusing this one component rather than a bespoke composer per
  surface is what gives every composer here attachments, the emoji picker, and the
  same closable per-composer error stack for free — see `CLAUDE.md`'s Conventions
  bullet on the composer error stack.
- `components/chat/CommentThread.tsx` — one message's top-level comments via
  `useChat({ scopeType: 'message', ... })`, plus a `MessageInput` composer at the
  bottom (gated by `canComment`/`maxDepth`, see "Nesting limit" above). Each comment
  is collapsed behind a "Reply"/reply-count affordance (hidden entirely once
  `maxDepth` is reached — see above); expanding it lazily fetches (`fetchComments`)
  and mounts another `CommentThread` for *that comment's* children. This recursive
  shape, not a depth-specific component, is what delivers unbounded nesting without
  ever fetching a whole subtree at once (top-level comments page via the normal
  cursor; a comment's children are not fetched until expanded).
- `components/messages/VoteControl.tsx` — up/down arrows + score. Optimistic
  write → await → reconcile-or-restore, same shape as `services/messageActions.ts`'s
  reaction/edit/delete handling, but takes an `onChange(next)` callback rather than
  assuming a `useMessages` scope — not every list a `VoteControl` sits in is a
  windowed/live store slice (`ForumChannelContent`'s post list is plain local state).
- `components/chat/ForumChannelContent.tsx` — the `forum` `ChannelType`'s `Content`:
  a post list (New/Top tabs, Top adding a period selector) and a post detail view
  composing a `VoteControl` + `MessageInput` (with `showTitleField`) + `CommentThread`.
  A known simplification: the "New" tab shows only the newest page (no infinite
  scroll yet).
- `comment_reply` is a new notification category — `NOTIFICATION_CATEGORY_LABELS`,
  `NotificationFeed`'s `present()` switch (links to `/messages/{message_id}`, the
  existing "go to message" direct-link resolver — see
  [messages-and-pagination.md](messages-and-pagination.md); note
  `Web\MessageController::show` does not yet have a comment-aware branch, so a
  comment-reply link today resolves via whatever that endpoint currently does with a
  `parent_message_id`-scoped message — a follow-up, not yet built).

## The `message_and_comment` channel type

An ordinary Slack-style text channel (`TextChannelContent`, same composer/message
list as a plain `text` channel) where every message also carries an inline "💬
comment" popout, rather than comments only living on a dedicated forum post.
`MessageAndCommentChannelType::defaultSettings()` sets `comments_enabled: true` and
`max_comment_depth: 1` — first-level comments only, no replies-to-replies, since a
quick aside on a chat message isn't meant to grow its own sub-thread (a room can
still raise this per-channel later since it's a parameter, not a capability).

`TextChannelContent` gained `commentsEnabled`/`maxCommentDepth` props, forwarded
through `MessageList` to `MessageRow` along with a `broadcastScope` (`{id: scopeId,
type: scopeType}` — the channel/conversation the comment thread's realtime events
should ride, see "Realtime" above). `MessageRow` renders a "💬 N comments" button
under any message when `commentsEnabled` is true (omitted for every other channel
type, matching the setting defaulting to off); clicking it lazily fetches
(`fetchComments`) and mounts an inline `CommentThread` (`parentDepth={0}`,
`maxDepth={maxCommentDepth}`) directly under that row. `channelTypes.tsx`'s registry
entry (`MessageAndCommentChannelTypeContent`) reads `comments_enabled`/
`max_comment_depth` from the channel's own `settings` rather than hardcoding them,
so a future settings-editing UI needs no frontend change to take effect.

## Notifications

`comment_reply` notifies **only the immediate parent's author** — not every ancestor,
not every other thread participant — mirroring "reply to your content", not a
thread-wide mailing list. `TextMessageService::notifyParentAuthor()` is the producer,
called from the comment-send branch of `send()`; it skips notifying an author who
replied to themselves. Default preference: `{email: false, in_app: true}`.

**Per-message mute is schema-only in this pass**, not enforced or exposed in the UI.
`notification_mutes` (`user_id`, `message_id`, unique pair) and the `NotificationMute`
model exist; `NotificationMute::isMuted($userId, $messageId)` is ready to be called
from `notifyParentAuthor()` before it notifies, but nothing calls it yet — same
"declared but not yet enforced" convention as `Permission::ManageMessages`/
`ManageEmojis` (see `App\Support\Permission`'s docblock). A future pass wires in the
enforcement check plus a mute-this-message affordance in the UI.

## Testing

`tests/Feature/Comments/` (nesting, gating, tombstone/cascade deletion, visibility,
notifications, top-sort, `max_comment_depth` enforcement, `title`) and
`tests/Feature/Voting/` (cast/change/remove, score aggregation, capability/permission
gating) — see those directories for the concrete scenarios. Frontend:
`useChat.test.ts` covers the `'message'` scope path, `MessageInput.test.tsx` covers
the `'message'` scopeType branch and `showTitleField`, `CommentThread.test.tsx`
covers the `maxDepth` gating, `VoteControl.test.tsx` covers the
optimistic/reconcile/restore cycle, `NotificationFeed.test.tsx` covers the
`comment_reply` case.

## A note on the dev database

The migrations this feature adds (threading columns, `votes`, `notification_mutes`,
`title`) do not apply themselves — `docker compose exec app php artisan migrate`
still has to be run after pulling them in, same as any other migration (see
`CLAUDE.md`'s traps on migrations not auto-applying to the dev DB). Before they're
run, every comment/vote request 500s, which surfaces in the UI as "the vote
optimistically applies then silently reverts to its previous value" and "posting a
comment does nothing" — not a application-logic bug, a missing-migration symptom.
