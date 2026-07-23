# Voice

## Scope and orchestration model

Every dm/group `Conversation` always has voice available — a first-class, always-on
capability via `HybridConversationType`'s grant, not an optional add-on. A room
`Channel` of type `voice` has voice as its only capability. See
`docs/capabilities-and-channel-types.md` for how capability grants work.

`voice_mode` (`auto | direct | relay`) lives on `channels` and `conversations` directly
— a property of the call, not a per-user preference. Every participant gets the same
behavior:

- `auto` supplies both STUN and TURN servers with `iceTransportPolicy: 'all'`. Ordinary
  ICE candidate priority prefers a direct P2P pair over a relayed one and falls back to
  relay automatically per-pair when direct fails.
- `direct` strips TURN servers from the ICE config entirely (`services/webrtc.ts`'s
  `isTurnUrl` filter) — a pair that can't connect directly does not connect.
- `relay` sets `iceTransportPolicy: 'relay'`, forcing every pair through TURN.

There is no UI to change `voice_mode` after channel/conversation creation.

## Signaling transport: whisper, not `ShouldBroadcast`

SDP offer/answer, ICE candidates, and call membership all travel as Reverb client
events ("whisper"), a deliberate exception to this app's usual broadcasting convention.
Whisper payloads are relayed peer-to-peer by the Reverb server and never reach PHP, the
queue, or Redis — voice signaling is latency-sensitive in a way message/reaction
broadcasts are not. There is no `App\Events\Voice*` class and no "send a signal" API
route.

`voice.channel.{id}`/`voice.conversation.{id}` (`routes/channels.php`) are dedicated
**presence** channels, not a reuse of `channel.{id}`/`conversation.{id}` (the
text-message channels). `.whisper('signal', ...)`/`.listenForWhisper('signal', ...)` is
the SDP/ICE transport — a `signal` payload carries a `to` user id; every other
participant receives every signal and filters client-side by `to === myUserId`.

## Call membership vs. presence subscription

Presence-channel *subscription* is not the same thing as being "in the call."
`ChannelSidebar` subscribes to a voice channel's presence channel purely to observe and
display who is in it, with no mic and no `RTCPeerConnection` involved — and Reverb
presence membership cannot distinguish an observer from an actual participant at the
protocol level. Call membership is therefore tracked as its own explicit, whispered
state, entirely separate from presence subscription:

- `useVoice.selfParticipant` (`stores/index.ts`) is non-null exactly while *this*
  browser tab has actually joined a call (set by `webrtc.ts`'s `joinVoice()`, cleared by
  `reset()` on leave) — the one place "am I really in this call" is knowable.
- On joining, `webrtc.ts` whispers a `call-state` event
  (`{userId, displayName, avatarUrl, muted, inCall: true}`); on leaving, it whispers
  `{userId, inCall: false}`. `useVoiceRoster` (the shared, observable "who's actually in
  this call" store, used by both `ChannelSidebar` and the call's own UI) is populated
  **exclusively** by these `call-state` announcements — never by raw
  `.here()`/`.joining()` presence-membership events.
- Whisper events never reach their own sender. A brand-new subscriber needs to learn who
  is already actually in the call, not just who subscribes going forward, so
  `services/voicePresence.ts`'s shared `.joining()` handler checks `useVoice.getState()`
  on every new arrival and, if this client is itself an active participant of that
  scope, re-whispers its own `call-state`.
- `.leaving()` (a real presence-membership event, fired on socket disconnect) is kept as
  a safety net that removes a participant from `useVoiceRoster` regardless of whether an
  explicit "leaving" `call-state` was whispered first — covers a crashed tab or dropped
  connection.

## Sidebar interaction

`VoiceChannelSidebarItem` offers two ways to join a call, both single-purpose:

- A hover icon button (opacity-0 until the row is hovered, or connected — then it stays
  visible) — single click, toggles join/leave.
- Double-clicking the channel name — join only. It deliberately never leaves: a
  double-click is two `click` events (each of which already navigates via the `Link`'s
  own `href`, into the very channel the row represents) followed by a `dblclick`. If the
  `dblclick` handler also left when already connected, double-clicking a call you're
  already in would immediately kick you out the moment you land back on its own page —
  reads as the sidebar randomly dropping your call, not a deliberate leave action. Leaving
  has its own explicit affordance (the hover button, or the main-pane panel's Leave
  button) instead.

`ChannelSidebar` and `DMSidebar`'s `<nav>` are `select-none` — double-clicking a row (to
join voice, or just landing an errant double-click while navigating) shouldn't highlight
the row's text the way a normal double-click-on-text would.

## Shared roster

The roster ("who's actually in this call," as opposed to who's merely observing) is
shared, observable state keyed by `${scopeType}.${scopeId}`, decoupled from actually
joining the call, and powers both `ChannelSidebar`'s participant list and the call mesh
itself.

`services/voicePresence.ts`'s `subscribeVoiceRoster(scopeType, scopeId)` is a
ref-counted wrapper around `services/echo.ts`'s `joinVoiceChannel()`: the first
subscriber for a given scope actually joins the presence channel and wires the
`.joining()`/`.leaving()`/`call-state`/`mute-state` handling once; every subsequent
subscriber for that same scope increments a ref count and gets the same channel object
back.

This also avoids a presence channel's `.here()` callback firing only once, at the
moment its own subscription succeeds — Echo/Pusher do not replay it for a callback
registered afterward — which is why this module does not call `.here()` at all.

Two independent consumers call `subscribeVoiceRoster`: `components/sidebar/
VoiceChannelSidebarItem` (via `hooks/useVoiceChannel.ts`, the same hook `VoiceChannelPanel`
uses to join/leave — the sidebar row and the main-pane panel share one hook so the roster
and join/leave state never drift between the two surfaces) and its `VoiceParticipantList`
molecule (who's in the call including the current user, muted or not — a plain
presentational component over a participant list, kept in `sidebar/` rather than `voice/`
since it's a "sidebar row's live sub-list" shape, not something inherently voice-specific),
and `services/webrtc.ts`'s
`joinVoice()` for the actual call, which reads the current `useVoiceRoster` snapshot and
reconciles its `RTCPeerConnection` map against that store on every change
(`reconcilePeers`) — opening a connection for a roster id it doesn't have one for yet,
closing one for an id no longer in the roster. This also means the call's own main-pane
view (`VoiceChannelPanel`/`VoiceBar`, via `useVoiceChannel`) shows participants who are
already in the call before the viewer has clicked Join.

**To observe or join a voice scope, always go through `subscribeVoiceRoster()`** — never
call `echo.ts`'s `joinVoiceChannel()` directly a second time for the same scope. Two
independent direct subscribers to the same presence channel produce the `.here()`
callback-never-fires failure mode above.

Tearing down the underlying subscription when refCount hits 0 is deliberately delayed by
a grace period (`TEARDOWN_GRACE_MS`, 5s), not immediate. An Inertia navigation within the
same scope — e.g. double-clicking a voice channel's sidebar name, which also navigates
there on the double-click's underlying single clicks — unmounts every current subscriber
before the new page's subscribers mount, and that gap isn't guaranteed to be zero-width
(the visit is an async fetch). Tearing down immediately would wipe the roster via
`clearRoster` and force the new page's subscribers to rebuild it from a fresh,
network-round-trip-slow handshake — visibly, everyone already in the call flickering out
and back in. A resubscribe for the same scope within the grace window cancels the pending
teardown and reuses the still-alive subscription (roster included) instead.

## Negotiation

Glare is resolved with the Perfect Negotiation pattern (the standard WebRTC approach).
Every peer runs identical negotiation code (`onnegotiationneeded` calls the
argument-less `pc.setLocalDescription()`); glare is resolved by comparing user ids to
decide which side is "polite" and backs off on an offer collision
(`services/webrtc.ts`'s `isPolite`/`ignoreOffer`).

`RTCPeerConnection` and `MediaStream` objects live in `webrtc.ts`'s own module-level
`Map`s — never in a Zustand store. `useVoice` (scope/selfMuted/connectionState) holds
only the current user's own call state; `useVoiceRoster` holds the shared, serializable
participant list. These are not merged into one store: the roster needs to be
meaningful without having joined.

## Single active call, even across tabs

A user can only be in one voice call at a time, even across rooms and browser tabs,
enforced entirely client-side and best-effort.

- **Same tab**: `webrtc.ts`'s `joinVoice()` checks its own module-level `currentKey`
  first and calls `leaveVoice()` on the old scope before joining a new one —
  deterministic, no signaling needed.
- **Cross tab**: needs a signal to reach the other tab. Every open tab already
  subscribes to its own private `App.Models.User.{id}` channel (via
  `subscribeNotifications()`), so `joinVoice()` also whispers a `voice-join`
  announcement there (`services/voiceCallGuard.ts`'s `announceJoin()`, backed by
  `services/echo.ts`'s `announceVoiceJoin()`/`subscribeVoiceCallGuard()`) — any other
  tab currently in a different call hears it and calls its own `leaveVoice()`.

This is deliberately not backend-mediated — no join/leave endpoint, no server-tracked
call membership. It is also explicitly best-effort: whisper has no delivery guarantee,
so a tab mid-reconnect at the exact moment of the announcement could miss it, the same
risk tolerance already accepted for `.leaving()`'s role as a presence safety net.

`subscribeVoiceCallGuard()`'s cleanup removes only its own whisper listener
(`channel.stopListeningForWhisper(...)`), never `echo.leave()` — that private channel is
independently, permanently subscribed by `subscribeNotifications()` for the whole
session, and leaving it out from under that subscription would break notifications.

`services/webrtc.ts` and `services/voiceCallGuard.ts` deliberately do not import each
other. `joinVoice()`/`leaveVoice()` pass `leaveVoice` itself into
`guardAgainstOtherTabsJoining()` as a parameter rather than `voiceCallGuard.ts`
importing `webrtc.ts`, avoiding a circular import.

## Device preference

Mic/speaker device choice is scoped per `(user_id, client_id)`, not just per user.
`client_id` is a `crypto.randomUUID()` generated once and persisted in `localStorage`
(`services/clientId.ts`), representing "this browser on this machine," since the same
user picks different devices on their laptop vs. desktop. `VoiceDevicePreference` has no
`DEFAULTS` const — a `null` device id legitimately means "use the browser's current
default."

`components/settings/AudioSettings.tsx` keeps "pick a device" and "test a device" as two
independent affordances. The input/output `<select>`s always render (device *labels* are
blank until mic permission is granted, so a small "Grant Access" prompt appears above
the pickers only when needed). "Test Microphone" is separate: it acquires the currently
selected input device, feeds it through a Web Audio `AnalyserNode` to drive a live level
meter, and loops it back through an `<audio>` element routed to the selected output
device via `HTMLMediaElement.setSinkId` (feature-detected). Starting a test also
refreshes the device list.

## TURN credentials

Ephemeral, generated per-request via coturn's `use-auth-secret` REST scheme
(`VoiceSignalingService::iceServers()`, HMAC-SHA1 of a `{expiry}:{userId}` username,
keyed by `config('turn.secret')`) — not a long-lived username/password baked into the
frontend. Not scoped to any room/channel/conversation — there is no membership check
beyond auth, since credentials are identical for every call a user joins and expire on
their own (`config('turn.credential_ttl')`).

`TURN_PUBLIC_HOST` is the browser-facing value even though it is read by PHP, not Vite
— the browser learns the TURN host from the JSON response at runtime, not a
`VITE_TURN_*` build-time env var (which does not exist).
