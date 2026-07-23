# Capabilities, Channel types, and Channel management

## Overview

What a channel or conversation can *do* is governed by a capability system with two
distinct roles:

- A **Feature** (`app/Support/Capabilities/`) is a capability *provider*. It declares
  the atomic operations it offers and any named groupings of them.
- A **ChannelType** (`app/Support/ChannelTypes/`) is a capability *consumer*. It
  requests a set of capability/group keys, which get resolved into a flat grant.

These are different jobs. Today's built-in types (`TextChannelType`, `VoiceChannelType`,
`AnnouncementChannelType`) each map to exactly one Feature, which makes the distinction
easy to miss, but `HybridConversationType` requests capabilities from two Features at
once (`['text.all', 'voice.all']`), which is the clearer illustration of the split. A
channel/conversation is never tied to a single Feature — it is tied to a ChannelType,
which composes whatever capabilities it needs from any number of Features.

## Feature

Interface: `App\Support\Capabilities\Feature`.

- `key(): string` — the namespace prefix for every capability this Feature defines
  (e.g. `text`, `voice`).
- `capabilities(): array<string, string>` — capability suffix → human description
  (e.g. `'read'`, `'send_text'`, `'send_images'`, `'send_video'` for text).
- `groups(): array<string, string[]>` — named aliases that expand to a subset of this
  Feature's own capability suffixes at registration time (e.g. `text`'s `send_all` =
  `['send_text', 'send_images', 'send_video']`).

Every Feature automatically gets an `all` group, auto-derived from `capabilities()` —
never hand-maintained, so it cannot drift stale as new atomic capabilities are added.

Features are registered in `App\Providers\FeatureServiceProvider::boot()`.

`StatusFeature` (`key='status'`, one capability `set_status`) is a registered Feature
with **no `ChannelType` consumer at all** — status isn't scoped to
any `Channel`/`Conversation` row, so there's nothing with a `type` column for it to
attach to via `ChannelTypeRegistry`. It's registered anyway so a future `ChannelType`
(or a future non-channel-scoped attachment point, if one is ever built) can request
`status.all` the same mechanical way `HybridConversationType` requests `text.all`/
`voice.all` — see `docs/status.md`. Real enforcement for status changes today is just
"is this the authenticated user acting on themself" (`UserStatusService`, see
`docs/service-layer.md`), not a `hasCapability()` check.

Capability keys are plain strings, not a PHP enum, unlike `App\Support\Permission` (the
closed, hand-maintained set for room RBAC — see `docs/roles-and-permissions.md`, a
different axis: RBAC gates *who* can act, capabilities gate *what a channel type can
do*). Capabilities must be definable by any Feature a future plugin registers, so the
vocabulary cannot be centrally closed — same free-string shape as `channels.type`. A
capability key, once shipped, is effectively permanent: `FeatureRegistryTest` documents
the boot-time failure (`InvalidArgumentException`) an unknown key produces.

## ChannelType

Interface: `App\Support\ChannelTypes\ChannelType`.

- `key(): string` — the value stored in `channels.type`.
- `label()`, `icon()`, `order()` — sidebar presentation.
- `capabilities(): array` — the capability/group keys this type requests, e.g.
  `['text.all']` or `['text.read', 'text.send_text']`. There is no default: an empty
  array is valid and means the type is granted nothing, not even reading messages.
- `defaultSettings(): array` — seed value for `Channel.settings` when a channel of this
  type is created with none supplied.

`FeatureRegistry::resolveGrants(array $requested): array` expands every group into its
atomic members once, at the point something asks. Enforcement code never resolves
hierarchy itself — it only ever checks flat, fully-qualified atomic key membership (e.g.
`'text.send_text'`), via `Channel::hasCapability(string $key): bool` /
`Conversation::hasCapability(string $key): bool` (both delegate to
`ChannelTypeRegistry::hasCapability()`). `Channel::isTextCapable()` is a convenience
wrapper for `hasCapability('text.read')`.

Granular capabilities gate exactly the action they name, not a whole feature at once.
`TextMessageService::authorizeSend()` (see `docs/service-layer.md`) checks
`text.send_text` only when message content is present, and `text.send_images` /
`text.send_video` per attachment by its mime type — a channel granted
`['text.read', 'text.send_text']` (no `send_all`/`all`) can be posted to with plain text
but any attachment is rejected.

### Built-in types

Registered in `App\Providers\ChannelTypeServiceProvider::boot()` — a dedicated provider
(not folded into `AppServiceProvider`) so a future runtime-installed channel-type plugin
has an established pattern to imitate: register its own `ChannelType` implementation
from its own provider, nothing else in the app needs to change.

| Type | Capabilities |
|---|---|
| `text` | `['text.all']` |
| `announcement` | `['text.all']` |
| `voice` | `['voice.all']` |
| `conversation` (`HybridConversationType`) | `['text.all', 'voice.all']` |

`channels.type` is a free string with no DB-level enum constraint. `routes/channels.php`'s
voice broadcast-auth gates check `hasCapability('voice.join')` rather than a literal
type-string comparison. `Web\RoomController::show`/`join` land on the room's first
*text-capable* channel via `ChannelTypeRegistry::typeKeysWithCapability('text.read')`
rather than a hardcoded `where('type', 'text')`.

### Conversations join the same system without merging data models

`Conversation` and `Channel` remain separate Eloquent models/tables with their own
membership semantics (`Room::hasMember` vs. `Conversation::hasParticipant`).
`Conversation::typeKey(): string` always returns `'conversation'` — `dm` and `group`
behave identically today, so one registration covers both. `Conversation::hasCapability()`
mirrors `Channel`'s. `MessageController`'s conversation methods and the
`voice.conversation.{id}` broadcast-auth gate both check capability the same way the
channel-scoped equivalents do — conversations have no special-cased bypass.

## Frontend mirror

`resources/js/services/channelTypes.tsx` is the single registry — one
`ChannelTypeDescriptor` per type: `key/label/icon/order/capabilities/isTextCapable`,
plus optional `Content` and `SidebarItem` components.

- `capabilities` mirrors the backend registration but is informational only today —
  there is no JS-side `FeatureRegistry`/group-expansion port (see "Planned work" in
  `CLAUDE.md`).
- `isTextCapable` is hand-set per type and is what actually drives
  `useChannelFocus`/`useChat` gating.
- `Channels/Show.tsx` and `DM/Show.tsx` both look up `channelTypeDescriptor(type).Content`
  to render a type's *entire* main-pane content. There is no default/fallback UI — a
  type with no `Content` renders an explicit "this channel type has no features enabled"
  empty state.
- `ChannelSidebar` looks up `.SidebarItem` per channel, falling back to a plain link
  when a type has none. Any type still renders in the sidebar, appended after known
  ones with an auto-generated label (`"drawing"` → `"Drawing Channels"`).
- `ChannelType` (`types/index.ts`) is `string`, not a closed union — the registry, not
  the type system, is where a type's existence is declared.
- `KNOWN_CHANNEL_TYPES` (the static list backing `CreateChannelModal`'s type picker)
  excludes the `conversation` hybrid type (never user-creatable as a room channel) and
  has no backend round-trip.
- `Content`'s prop shape is not one fixed interface: a channel-scoped type's `Content`
  receives `{ channel, currentUser, initialMessages }`; the `conversation` type's
  receives `{ conversation, currentUser, initialMessages }`. Each registry entry is
  only ever backed by one kind of entity, so `Content` is typed loosely
  (`ComponentType<any>`) rather than as a discriminated union.

`resources/js/components/chat/TextChannelContent.tsx` is the text Feature's frontend
piece — it owns its own `useChat()` call (scope-agnostic, taking `scopeId`/`scopeType`
directly), so any registered type can drop it in without the page needing to know it's
there. `text`/`announcement` wrap it in a small `TextChannelTypeContent` adapter;
`HybridConversationContent` reuses it directly alongside `VoiceBar`.

### What frontend capability-checking can't do

The backend is the only real enforcement boundary. There is no frontend equivalent of
`FeatureRegistry` that gates which hooks a `Content` component is allowed to call —
React's Rules of Hooks means a component cannot be handed a dynamic subset of hooks to
call conditionally. Every capability that exposes *data* must be enforced on the
specific endpoint/query returning that data. `Web\ChannelController::show` currently
sends the room's member list to every channel page regardless of type — a known gap
relative to a "channel types only see what they're granted" model.

## Channel management

Room admins can create/update/delete/reorder channels of any registered type, gated by
the `manage_channels` permission (see `docs/roles-and-permissions.md`).

`Api\ChannelController` (`POST /api/rooms/{room}/channels`, `PATCH`/`DELETE
/api/channels/{channel}`, `PATCH /api/rooms/{room}/channels/reorder`) validates `type`
against `ChannelTypeRegistry::registeredTypeKeys()` and seeds `channels.settings` (a
nullable JSON column, array-cast on `Channel`) from the type's `defaultSettings()` when
none is supplied. `channels.settings` is a flexible JSON bucket rather than a new column
per type — the seam for type-specific config without a migration every time a type is
added. A channel's `type` is immutable after creation.

`RoomController::store`'s two hardcoded `Channel::create()` calls are still the only way
a room's default `general`/`Voice Chat` channels come into existence — default
scaffolding at room creation, ad-hoc creation after, via the same
`ChannelTypeRegistry::registeredTypeKeys()` validation either way.

### Creation path, file by file

1. `Web\ChannelController::show` computes `can_manage_channels` (`Gate::allows('create',
   [Channel::class, $room])`) and passes it as an Inertia prop.
2. `ChannelSidebar` only renders the "+" button when that prop is true (a UI
   convenience — the same `Gate::authorize` re-runs server-side regardless) and opens
   `CreateChannelModal`.
3. The modal calls `createChannel()` (`resources/js/services/api.ts`).
4. `POST /api/rooms/{room}/channels` → `Api\ChannelController::store` re-checks
   authorization, validates `type`, creates the row (`position` = current max + 1,
   `settings` seeded from `defaultSettings()`), and broadcasts `ChannelCreated`.
5. The HTTP response updates the creator's own tab (`onCreated` calls `addChannel()` on
   the shared `useChannels` Zustand store) — no Inertia reload involved.
6. Every other room member's tab picks up the change from the broadcast (below).

### Realtime propagation

Channel create/update/delete broadcast to the whole room via `room.{roomId}`, a private
channel distinct from `channel.{id}` (per-channel presence) and `voice.channel.{id}`
(per-channel voice roster). `routes/channels.php` gates it on `Room::hasMember`; it
carries no roster payload, just the three CRUD events.

`Api\ChannelController::store`/`update`/`destroy` each dispatch
`ChannelCreated`/`ChannelUpdated`/`ChannelDeleted` (`app/Events/`) with `->toOthers()`.
`ChannelUpdated`/`ChannelDeleted` broadcast even though no frontend UI currently
triggers channel `update`/`destroy` — the backend endpoints are real and policy-gated,
so the realtime propagation exists regardless of whether an edit/delete UI exists yet.

Frontend: `services/echo.ts`'s `subscribeRoomChannels(roomId)` joins `room.{roomId}` and
dispatches all three events into `useChannels` (`stores/index.ts`, keyed by `roomId`,
same reducer-style shape as `useMessages`, with the same id-based dup-guard on
`addChannel`). `ChannelSidebar` seeds `useChannels` from its `channels` prop on
mount/room-change and calls `subscribeRoomChannels()` alongside it, then reads its
channel list from the store instead of local component state.

## Extending this system

Three distinct things can be added here — pick the narrowest one that fits:

1. **A new capability on an existing Feature** (e.g. a `send_polls` suffix on
   `TextFeature`). Add the suffix to that Feature's `capabilities()` — the
   auto-derived `all` group picks it up automatically. Add a named group only if the
   capability should be bundleable with a subset of the others. Then: add the real
   `hasCapability('feature.send_polls')` enforcement check at the operation's call site
   (normally inside that Feature's Service — see `docs/service-layer.md`), and add the
   key/group to whichever `ChannelType::capabilities()` list(s) should grant it. A
   capability nobody's `ChannelType` requests is unreachable.
2. **A new ChannelType reusing existing Features.** Implement `ChannelType` with a
   `capabilities()` list drawn from Features that already exist, register it in
   `ChannelTypeServiceProvider::boot()`. No enforcement code to write — `hasCapability()`
   resolves through `FeatureRegistry` for any registered type automatically. Mirror it
   on the frontend in `channelTypes.tsx`'s `REGISTRY`.
3. **A new Feature** (the operation doesn't fit `text`/`voice` at all). Add a `Feature`
   implementation, register it in `FeatureServiceProvider::boot()`, give it a real
   backend enforcement site, build its frontend component/hook the way
   `TextChannelContent`/`VoiceChannelPanel` are built, then reference it from whichever
   `ChannelType`'s `Content` wants it.

Capability keys are effectively permanent once shipped — `FeatureRegistryTest`
documents the boot-time failure (`InvalidArgumentException`) an unknown key produces.
Don't rename one casually.
