# Messages: windowed pagination, caching, optimistic mutations

[← All docs](README.md) · See also: [service-layer.md](service-layer.md) ·
[conversations-and-invites.md](conversations-and-invites.md) ·
[capabilities-and-channel-types.md](capabilities-and-channel-types.md) ·
[attachments.md](attachments.md)

How a text channel's or conversation's history is paged, how much of it the client
holds at once, where already-fetched pages are cached, and how reader-triggered
mutations are applied before the server confirms them.

Message *scoping* (`channel_id` vs `conversation_id`) and the membership rules on
message-adjacent endpoints are in
[conversations-and-invites.md](conversations-and-invites.md); which channels may
have text at all is in
[capabilities-and-channel-types.md](capabilities-and-channel-types.md).

## The endpoint contract

`GET /api/channels/{channel}/messages` and
`GET /api/conversations/{conversation}/messages` both delegate to
`TextMessageService::list($user, $before, $after)`. The Inertia page controllers
(`Web\ChannelController::show`, `Web\ConversationController::show`) call the same
method with no cursor for the first page a browser renders, so the server-rendered
props and every subsequent fetch have identical shape by construction.

A `Message` is also a valid scope for this same contract — `GET`/`POST
/api/messages/{message}/comments` page a comment thread with the identical cursor
shape described here (a comment is a message whose parent is another message rather
than a channel/conversation). See [comments-and-voting.md](comments-and-voting.md)
for the polymorphic scope this rests on, and for `?sort=top&period=...`, a
deliberately *different*, offset-paginated contract used for score-ranked results —
not a fourth cursor mode on this endpoint.

One page is `TextMessageService::PAGE_SIZE` (50) messages, **always oldest-first**,
walking away from a cursor in exactly one direction:

| Query | Returns |
| --- | --- |
| *(no cursor)* | the newest page — the live tail |
| `?before={id}` | the page immediately older than that message |
| `?after={id}` | the page immediately newer than that message |

Passing both is a `422`, not a silent preference for one. So is a cursor that
resolves to no message at all — silently falling back to the tail would serve a
page from a completely different part of history under a cursor the client believed
in. A *soft-deleted* message still works as a cursor (`Message::withTrashed()`),
because a cursor is whichever message sits at the edge of the client's window and
that message may since have been deleted.

Every page reports both of its edges:

```json
{
  "data":         [ /* 50 messages, oldest first */ ],
  "has_older":    true,
  "older_cursor": "019f…",   // the page's oldest id, or null
  "has_newer":    false,
  "newer_cursor": null       // the page's newest id, or null
}
```

`has_older`/`has_newer` are real `EXISTS` queries against the boundary rows rather
than the "fetch `PAGE_SIZE + 1` and check the overflow" trick, which can only ever
answer for the direction it was fetched in. `has_newer: false` is the definition of
"this page reaches the present".

The frontend mirror of this shape is `PaginatedMessages` in `types/index.ts`.

## The client's window

`useMessages` (`stores/index.ts`) holds **a window into history, not all of it**:

```
messages[scopeId]  Message[]        at most MAX_WINDOW_MESSAGES (150) rows
windows[scopeId]   MessageWindow    { hasOlder, olderCursor, hasNewer, newerCursor }
```

Paging past the cap drops rows from the end the reader is scrolling *away* from, and
records the boundary as a cursor:

- `prependOlder` (scroll up) drops from the bottom → `hasNewer: true`,
  `newerCursor` = the newest row still held.
- `appendNewer` (scroll down) drops from the top → `hasOlder: true`,
  `olderCursor` = the oldest row still held.

The cursors are what makes a dropped stretch *"gone but re-fetchable"* rather than
indistinguishable from *"does not exist"*. Nothing infers either flag from the array
length.

**`hasNewer: true` means the window is detached from the live tail**, and that one
flag drives everything that follows from it:

- `useMessages.add` ignores incoming live messages entirely. There are unfetched
  messages between the window's newest row and the arriving one, so appending it
  would render a gap as contiguous history. The next forward page (or a jump to the
  present) picks it up.
- `useAutoScroll` stops pinning to the bottom — the bottom of a detached window is
  not the present.
- `TextChannelContent` renders the jump-to-present button.

### Paging, jumping, sending

`useChat` owns one scope's window:

| | |
| --- | --- |
| `loadOlder()` | fetch/serve `{ before: olderCursor }`, `prependOlder` |
| `loadNewer()` | fetch/serve `{ after: newerCursor }`, `appendNewer` |
| `jumpToPresent()` | fetch the tail with no cursor, `setWindow` (replace) |
| `commitSent(m)` | append a just-sent message, or jump if detached |
| `hasOlder` / `hasNewer` | the window's two flags, for the UI |

`jumpToPresent` deliberately refetches the tail rather than paging forward or just
scrolling: everything between a detached window and the present is unfetched, and
the tail is the only page whose position is known without walking to it.

`commitSent` exists because a reader who sends a message while scrolled back into
history plainly wants to be at the present — without it, `add`'s gap rule would
correctly-but-uselessly discard their own message. Sending while detached jumps.

A single `loading` ref serialises all three, so overlapping sentinel hits can't
interleave two pages into one window.

### Scroll position

`MessageList` owns the scroll container and two `IntersectionObserver` sentinels —
one above the rows (`onLoadOlder`, mounted while `hasOlder`), one below
(`onLoadNewer`, mounted while `hasNewer`).

Keeping the reader's place across a mutation is done by **anchoring to an element**,
not by `scrollTop` arithmetic: a single update can prepend a page *and* trim the
other end, and no arithmetic covers both. Every scroll event records the topmost
visible row's id and its offset (`data-message-id` + `offsetTop`, binary-searched
so the per-scroll cost is logarithmic in the window size). After a commit whose
first row changed — i.e. rows were added or dropped *above* the viewport — a layout
effect finds that row again and restores its offset.

Two details are load-bearing:

- The scroll container is `relative`, making it the rows' `offsetParent`, so
  `offsetTop` is measured from the top of the scrollable content and nothing else.
- The anchor restore runs in a layout effect registered *after* `useAutoScroll`'s,
  so when both apply to one render the anchor wins. A live message arriving at the
  bottom doesn't change the first row, so anchoring stays out of the way and
  auto-scroll handles it.

`jumpToPresent` is paired with a `jumpToken` counter rather than inferred from the
flags: `hasNewer` also goes false when a reader pages forward to the end by hand,
where holding position is the correct behaviour and yanking to the bottom is not.

## Jumping to a message

"Go to message" is the general mechanic behind landing on one specific message
rather than paging through history to find it — a reply preview click and a
direct link both use it today; search results and pinned messages are planned
to reuse the same pieces rather than growing their own (see CLAUDE.md).

**The `around` cursor.** `TextMessageService::list()` takes a third, mutually
exclusive cursor alongside `before`/`after`: `around={id}` returns a window
*centered* on that message — the target included, up to `PAGE_SIZE / 2`
messages fetched independently on each side (`pageAround()`). Unlike
before/after there's no single edge to walk away from, so both sides are
filled separately; `describeWindow()`'s `has_older`/`has_newer` EXISTS checks
are unchanged, since they only ever look at the resulting window's first/last
row. A target that doesn't resolve (wrong id, or soft-deleted — `pageAround`
deliberately does *not* use `withTrashed()`, since the point is to display an
actual message, not just resolve a position) is a `422`, the same "unknown
cursor" contract before/after already have.

**Direct links.** `Web\MessageController::show` (`GET /messages/{message}`) is
the entry point a shareable link points at: it resolves the message to its
channel or conversation, runs the exact same visibility check the page itself
would (`Channel::isVisibleTo()` + room membership, or
`Conversation::hasParticipant()`), and redirects to that page with
`?message={id}`. `ChannelController::show`/`ConversationController::show` read
that query param and pass it as `around` to `TextMessageService::list()`
instead of fetching the tail, plus forward it as the `highlight_message_id`
Inertia prop. A soft-deleted message 404s at the route-model-binding step,
before any of this runs — nothing to link to.

**On the frontend**, `useChat`'s `jumpToMessage(id)` is the network half: a
no-op if `id` is already in the current window (the common case for a reply —
same scope, usually already loaded), otherwise a `fetchPage({ around: id })`
that replaces the window via `setWindow`/`cache.seedRun`, the same shape
`jumpToPresent` already uses. `TextChannelContent` wraps it with the "where to
land" half — a `{ id, token }` highlight state (seeded from
`initialHighlightMessageId` on mount for a direct link, updated by
`jumpToMessageAndHighlight` for a reply click) passed to `MessageList` as
`scrollTo`. `MessageList` scrolls the row into view
(`Element.scrollIntoView`, optionally chained since jsdom ships none) and
flashes it (`bg-accent-primary/10`) for two seconds; `token` bumps on every
jump so clicking the same reply twice still re-triggers both, rather than
being a no-op state update. `MessageRow`'s reply-context block is a button
precisely so it has something to call `onJumpToMessage` from.

## The message cache

`services/messageCache.ts` keeps pages this tab has already fetched, so changing
scroll direction doesn't re-request them — without it, the window's own trimming
guarantees a round trip every time the reader turns around.

The unit of storage is **one contiguous run per scope**, not a set of pages:

```ts
interface CachedRun {
    messages: Message[]     // ascending, contiguous, no gaps
    reachedOldest: boolean  // its oldest message is the scope's oldest
    reachedNewest: boolean  // its newest message is the live tail
    updatedAt: number
}
```

Contiguity is the only property correctness depends on, so a run that cannot prove
it covers what the caller asked for refuses to answer instead of returning a gap:

- `readOlder`/`readNewer` serve a **whole** page or `null` — never a partial page
  stitched onto a network fetch, and never anything for a cursor the run doesn't
  hold. The caller's decision stays binary: cache or network.
- `appendLive` takes a new message onto the run only while `reachedNewest`. A run
  that has already fallen behind the present would otherwise gain a message with
  unfetched history in front of it — a cached gap, which nothing would report as an
  error and which would silently lose messages later.
- `extendRun` folds a fetched page onto whichever end it came from; a page that
  doesn't touch the run replaces it rather than being spliced into a hole.

Cached copies are kept in step with live changes — `patchMessage`,
`patchReactions` and `dropMessage` are called from both `services/echo.ts`'s live
handlers and `services/messageActions.ts`'s optimistic ones. Without that, a
message edited while it sits outside the window pages back in with its old content.
All three ignore a message the run doesn't hold, for the same reason `appendLive`
does.

The Inertia prop always wins for first paint: it is a page the server rendered for
*this* navigation, so `useChat`'s seed effect calls `setWindow` + `seedRun` from it
and never consults the cache. The cache answers paging, not first paint.

### Storage drivers

Storage sits behind an async driver:

```ts
interface MessageCacheDriver {
    read(scopeId: string): Promise<CachedRun | null>
    write(scopeId: string, run: CachedRun): Promise<void>
    clear(scopeId?: string): Promise<void>
}
```

`createMemoryDriver()` is the default and the only one shipped today.
`setMessageCacheDriver(driver)` swaps it — which is what tests use, and what the
native shell will use for a SQLite-backed run (a `cached_messages` table keyed by
`(scope_id, id)` ordered on `created_at`, plus the run's two boundary flags). The
interface is async *for the memory driver too*, precisely so that swap needs no
caller to change; don't "simplify" it to a synchronous signature.

## Optimistic mutations

`services/messageActions.ts` is the one place reader-triggered message mutations
live. Each follows the same three beats: apply the expected result to the store,
await the server, then either replace the guess with the authoritative payload or
put the previous state back and rethrow.

| Action | Optimistic step | Reconcile | Rollback |
| --- | --- | --- | --- |
| `toggleReaction` | `predictReactions` (count ±1, `reacted` flipped, pill added/dropped) | the summary both reaction endpoints return | previous summary |
| `saveEdit` | `{ content, is_edited: true }` | the updated message | the previous message |
| `removeMessage` | `remove` | — | `insert` (see below) |

`removeMessage`'s rollback is why the store has `insert` alongside `add`: a message
that was deleted mid-window has to go back *where it was*, and `add` appends. Both
`addReaction` and `removeReaction` in `services/api.ts` return
`ReactionSummary[]` — the reconcile step depends on it, and the response body was
previously discarded.

`MessageRow` is a thin caller: it closes the edit box on submit rather than on the
server's answer, and reopens it with the draft intact if `saveEdit` rejects.

## Demo data

`DemoConversationSeeder` writes a multi-week backlog into one text channel —
several pages deep, with day dividers, replies and reactions spread through it
rather than only at the tail, so paging can be exercised by hand. `DatabaseSeeder`
calls it for the demo room's `#general`; it also runs standalone against an
already-seeded database, without recreating users or rooms:

```bash
docker compose exec app php artisan db:seed --class=DemoConversationSeeder --force
```

## Tests

| | |
| --- | --- |
| `tests/Feature/Messages/MessageWindowTest.php` | the `after` direction, both window flags, one-direction-only, unknown/deleted cursors |
| `tests/Feature/Messages/ChannelMessageTest.php` | backwards paging, membership |
| `tests/Feature/Messages/MessageAroundCursorTest.php` | the `around` cursor's two-sided window, unknown/deleted targets, one-cursor-only, channel + conversation |
| `tests/Feature/Messages/MessageLinkTest.php` | `Web\MessageController::show`'s permission checks and redirect shape, deleted-message 404, the receiving page's `highlight_message_id`/windowed seed |
| `stores/index.test.ts` | trimming from each end, the cursors it records, `add`'s gap rule, `insert` ordering |
| `hooks/useChat.test.ts` | both directions, cache hits, `jumpToPresent`, `commitSent` while detached, `jumpToMessage` (in-window no-op vs. fetch) |
| `services/messageCache.test.ts` | whole-page-or-nothing, contiguity refusals, live/patch/drop behaviour |
| `services/messageActions.test.ts` | prediction, reconcile, rollback, cache write-through |
| `components/chat/MessageRow.test.tsx` | reply preview click calls `onJumpToMessage`, `highlighted` renders the flash background |
| `components/chat/MessageList.test.tsx` | row tagging for anchoring, day dividers, one sentinel per loadable direction, `scrollTo`'s scroll-into-view + timed flash |
| `components/chat/TextChannelContent.test.tsx` | when the jump button shows, what jumping does, direct-link highlight on mount, in-window vs. out-of-window reply jumps |

`resources/js/test/setup.ts` stubs `IntersectionObserver` globally — jsdom ships
none, and `MessageList` constructs one per loadable direction, so rendering a
message list at all would otherwise throw.
