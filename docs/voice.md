# Voice

[← All docs](README.md) · See also: [service-layer.md](service-layer.md) ·
[capabilities-and-channel-types.md](capabilities-and-channel-types.md) ·
[traps.md](traps.md#voice--see-voicemd-for-the-full-design-these-traps-sit-inside)

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

## Per-remote-participant speaking indicator

Whether each remote peer's incoming audio currently sits above a fixed level
threshold (`webrtc.ts`'s `SPEAKING_THRESHOLD`, 0.15 — not user-configurable,
unlike the local mic's send threshold) is computed **locally by this tab**,
independently for each peer, from the already-decoded `MediaStream` it
receives — never whispered or otherwise transmitted, since every participant's
own tab can already see this for themselves from the audio they're decoding.
Tracked in `stores/index.ts`'s `useSpeaking` (keyed by userId, not by scope —
same reasoning as the `peers`/`remoteStreams` maps: only one call is ever
active per tab). Reuses `services/voiceActivation.ts`'s generic
`startVoiceActivation(stream, threshold, onGateChange)` — the same gate-crossing
primitive the send-threshold feature uses, just pointed at a remote stream
instead of the local mic, with its own fixed threshold and callback.

`webrtc.ts`'s `createPeerConnection`'s `ontrack` starts an activation handle
per remote stream (`speakingHandles`, mirroring `remoteStreams`); `teardownPeer`
stops it and explicitly zeroes that user's `useSpeaking` entry. `useVoiceChannel`
merges `useSpeaking`'s live map onto each roster participant it returns
(`{ ...participant, speaking }`) — `VoiceParticipant` (the whisper/roster wire
type) deliberately does not gain a `speaking` field, since that would wrongly
imply it's shared/serializable state. `VoiceChannelPanel`/`VoiceBar` render it
as a `ring-2 ring-success` around the participant's `Avatar`.
`VoiceParticipantList` (the sidebar's read-only roster row) does not show it —
it's deliberately kept generic/non-voice-specific (see its own doc comment) and
takes a plain `VoiceParticipant[]`, not the speaking-augmented shape
`useVoiceChannel` produces.

## Remote audio playback and per-participant volume

`services/webrtc.ts` decodes every remote peer's incoming track into
`remoteStreams` (a module-level `Map`, per the "never in a store" rule above)
but does not itself play it anywhere — something has to attach each
`MediaStream` to a real `<audio>` element for the browser to actually output
sound. `components/voice/RemoteParticipantAudio.tsx` is that element: one per
remote participant, hidden, `autoPlay`, rendered by
`components/voice/ParticipantVolumeControl.tsx`.

Since `remoteStreams` isn't a store, a mounted `RemoteParticipantAudio` has no
built-in way to learn "the track for this userId just arrived" (peer
connection negotiation is asynchronous, so it may not exist yet at mount
time). `stores/index.ts`'s `useRemoteStreamVersion` is a bare tick counter —
`webrtc.ts` bumps it from `ontrack` and `teardownPeer` — that
`RemoteParticipantAudio` subscribes to purely to know when to re-read
`getRemoteStream(userId)` and re-assign `srcObject`. This keeps the actual
`MediaStream` object out of React/Zustand state entirely; only a number ever
crosses that boundary.

`ParticipantVolumeControl` wraps a remote participant's `Avatar` (with the
speaking ring from the section above) as a `Popover` trigger; opening it
reveals a 0-100 volume slider backed by `stores/index.ts`'s `useVoiceVolume`
(keyed by userId, default 1/100% when unset). This is purely local
*playback* attenuation via `HTMLMediaElement.volume` (0.0-1.0, so it can only
turn someone down, not boost them above their actual sent volume) — it never
touches what that participant sends, is never shared, and is not persisted
across page reloads.

**The `<audio>` element lives outside the `Popover`, not inside it** —
Radix's `Popover.Content` unmounts from the DOM when closed, so an
`<audio>` placed inside it would silently stop playing that person's audio
the moment you closed the volume slider. If a future change touches
`ParticipantVolumeControl`, keep `RemoteParticipantAudio` a sibling of the
`Popover`, not a child of it.

`components/sidebar/VoiceParticipantList.tsx` (the sidebar's read-only
roster row) intentionally does not get a volume control or audio element —
per its own doc comment it stays generic/non-voice-specific and takes a
plain `VoiceParticipant[]`, and it's never the surface actually playing a
call's audio (that's always `VoiceChannelPanel`/`VoiceBar`, both of which
render `ParticipantVolumeControl` per remote participant).

## Deafen

`useVoice.deafened` silences every remote participant's playback for this
tab, independent of both `selfMuted` (deafening does not stop your own mic
from sending — this app does not couple the two the way some voice apps do)
and each participant's individual `useVoiceVolume` level, which stays
untouched underneath it. `RemoteParticipantAudio` is the single place this is
enforced: `audioEl.volume = deafened ? 0 : volume`, so un-deafening instantly
restores exactly what each participant was set to before, with nothing to
recompute or re-fetch.

`useVoiceChannel`'s `toggleDeafen` flips `useVoice`'s `deafened` field
directly — unlike `toggleMute`, it never calls into `services/webrtc.ts`,
since deafening never touches a track or a peer connection, only local
playback volume. `VoiceChannelPanel`/`VoiceBar` render it as a Deafen/Undeafen
button alongside Mute.

## Per-remote-participant connection quality indicator

Every `RTCPeerConnection` already exposes `getStats()`, which reports figures
like round-trip time and packet loss without any signaling at all — so this
indicator, unlike almost everything else in this file, needs no whisper
messages and no coordination with the other side. `services/
connectionQuality.ts`'s `startConnectionQualityMonitor(pc, onQualityChange)`
polls one peer connection's `getStats()` every 3s, reads:

- the selected `candidate-pair` report's `currentRoundTripTime` (instantaneous,
  no diffing needed), and
- the audio `inbound-rtp` report's `packetsLost`/`packetsReceived` (cumulative
  counters — a loss *rate* needs a delta against the previous sample, computed
  internally),

and classifies the pair into `'good' | 'fair' | 'poor' | 'unknown'` against
fixed heuristic thresholds (150ms/300ms RTT, 3%/8% loss — see the constants at
the top of the file; not a formal spec, just "would a person notice"). `'unknown'`
only means "no candidate-pair or inbound-rtp report was found yet" (e.g. before
ICE has connected), not a quality tier itself.

`webrtc.ts`'s `createPeerConnection` starts a monitor per peer immediately
(right alongside the peer connection itself, not gated on `ontrack` like
speaking detection — `getStats()` is meaningful the moment a `pc` exists) and
`teardownPeer` stops it and resets that user's entry to `'unknown'`. Reported
into `stores/index.ts`'s `useConnectionQuality` (keyed by userId, same
rationale as `useSpeaking`/`useVoiceVolume` — local-only, never whispered).
`useVoiceChannel` merges it onto each participant the same way it merges
`speaking`; `ParticipantVolumeControl` renders it as a small colored dot in the
avatar's bottom-right corner (reusing the same visual slot `Avatar`'s own
`showStatus` presence dot would use, since these components don't pass
`showStatus` — reused, not doubled up).

Caveat worth knowing: in `relay` voice_mode (forced through the `coturn` TURN
server), RTT includes the relay hop, so a "poor" reading there reflects the
detour through TURN, not necessarily how far apart the two people actually
are.

## Audio constraints

`echo_cancellation`/`noise_suppression`/`auto_gain_control` (all on
`VoiceDevicePreference`, defaults `true`/`true`/`false` — matching what used to be
hardcoded) are user-configurable per `(user_id, client_id)`, exposed as three
toggles in `AudioSettings.tsx`'s "Audio Processing" section. Every
`getUserMedia({ audio: ... })` call in the voice path (`webrtc.ts`'s `joinVoice`,
`AudioSettings.tsx`'s mic test) reads these from the fetched preference rather than
hardcoding any of the three — `JoinVoiceOptions.echoCancellation`/
`noiseSuppression`/`autoGainControl` default to the same values (`?? true`/`?? true`/
`?? false`) if not provided, so any caller that doesn't pass them (there are none
left, but the fallback is deliberate) sees the historical behavior.

**Unlike the send-threshold slider, these three are not live-reactive** — they're
`getUserMedia` constraints, fixed at the moment a stream is acquired, so a toggle
change only takes effect on the *next* join or the *next* mic test, same as the
input/output device pickers right above them in the same page. Don't treat this as
a bug to fix the way send_threshold's non-reactivity was (see trap #42 in
`CLAUDE.md`) — it's a fundamentally different kind of setting (hardware/track-level
constraint vs. a software-side comparison against a live threshold), not an
oversight.

**`auto_gain_control: true` disables the sensitivity slider, both visually and
functionally.** AGC continuously boosts quiet input toward a target loudness,
including pure noise-floor silence with no one talking, which produces a fixed
non-zero level reading that never actually reflects "not talking" (diagnosed from a
real report — the mic-test meter would settle at a stable non-zero level even with
the mic muted). That defeats the premise of the level-based send-threshold gate
(`services/voiceActivation.ts`), which assumes silence reads near 0. Turning AGC on
in `AudioSettings.tsx`'s `updateProcessingToggle()` therefore also forces
`send_threshold` to `0` (both the persisted preference and the live
`useMicSensitivity` store) and the slider renders `disabled`, rather than leaving a
threshold value that would silently stop meaning anything. If a future change adds
a way to set AGC and sensitivity independently, re-solve this conflict deliberately
— don't just remove the guard.

## Voice activation (send threshold)

`VoiceDevicePreference.send_threshold` (0-100, default 0) is a per-`(user_id,
client_id)` mic sensitivity setting, same scope as the device-id fields it sits
alongside. `0` means "always transmit" (the original, and still default,
behavior) — anyone who hasn't touched the slider in `AudioSettings` sees no
change.

`services/audioLevel.ts`'s `computeLevel()` converts an `AnalyserNode`'s raw
time-domain samples to a 0..1 level using a dBFS conversion (with a -60dB
floor) rather than a linear RMS scale — linear RMS badly underrepresents
normal speech (conversational levels sit well under 0.25 of full scale), which
is also why the `AudioSettings` mic-test meter uses it instead of a bare
`rms * constant` multiplier.

**The threshold is live, not captured once at join time.** `stores/
index.ts`'s `useMicSensitivity` (`{ threshold, closeGap, autoGainControl }`) is
the single shared, reactive source of truth — deliberately its own store, not
part of `useVoice`, because `useVoice.reset()` runs on every `leaveVoice()` and
these values have to survive across calls (they're persisted device
preferences, not per-call ephemeral state). `AudioSettings.tsx` writes to it on
load and on every slider/select/toggle change; `useVoiceChannel`'s `join()`
seeds it from the fetched device preference in case Settings was never visited
this session. `services/voiceActivation.ts`'s `startVoiceActivation(stream,
getThresholds, onGateChange)` takes a **getter**, re-read on every tick, not a
plain value — so a change reaches an already-running call immediately. An
earlier version captured the threshold as a fixed value at join time; that
version could never react to a later Settings change without leaving and
rejoining the call, which was a real bug, not just a documentation gap. Don't
reintroduce a plain non-getter parameter here.

The `AudioSettings.tsx` "Test Microphone" loopback now also actually gates on
the live thresholds (muting the loopback `<audio>` element when below the
open threshold, per the hysteresis rules below), reading `useMicSensitivity`
fresh on every tick the same way `webrtc.ts` does — previously the marker line
on the meter was purely cosmetic and moving the slider had no effect on what
played back, which made the control impossible to verify from the Settings
page itself.

### Hysteresis (Close threshold)

A single fixed threshold "chatters" — rapidly flips open/closed — when the
level hovers right at the boundary, since real audio naturally fluctuates
even during sustained speech. `VoiceDevicePreference.close_threshold_gap`
(one of `0`/`10`/`20`/`30`, default `20`/Medium) adds a gap: the level needed
to *open* the gate stays `send_threshold`, but once open, the level has to
drop all the way down to `send_threshold - close_threshold_gap` (clamped at
0) before it closes again. `0` ("Off") reproduces the original
single-threshold behavior exactly.

`services/voiceActivation.ts` models this as a `ThresholdPair` (`{ open,
close }`, both 0..1) rather than a single number. `nextGateState(currentlyOpen,
level, thresholds)` is the pure state-transition function — exported
separately from `startVoiceActivation` specifically so a caller that already
owns an analyser loop for another purpose (`AudioSettings.tsx`'s mic-test
meter) can reuse the exact same decision without a second `AudioContext`
tapping the same stream. `computeThresholds({ threshold, closeGap,
autoGainControl })` converts the raw 0-100/0-30 preference values into a
`ThresholdPair`.

`AudioSettings.tsx`'s "Hysteresis band" select (the field itself and every
other reference in this doc still call it "close threshold" — only the
Settings-page label reads "Hysteresis band") deliberately shows *labels*
(Large/Medium/Small/Off), not percentages — the mapping (Large=30,
Medium=20, Small=10) describes how large the gap between the two thresholds
is, not a literal number the user needs to reason about. The meter's marker
is a translucent band spanning from the close threshold to the open
threshold (a solid border at the open edge) rather than a single line, so
the gap is visible directly instead of needing the numbers explained. This
band is hidden entirely while `auto_gain_control` is on (see below) since
there's no manual threshold to show.

Remote-participant speaking detection (`webrtc.ts`'s `SPEAKING_THRESHOLD`)
passes the same fixed value as both `open` and `close` — no hysteresis there,
since it's a fixed, non-user-configurable threshold with no chattering
concern serious enough to justify it.

### Peak hold — why a single `computeLevel()` reading isn't enough

A `computeLevel()` call is an *instantaneous* RMS over one small (512-sample,
~10ms) analyser window, sampled once per animation frame (~16ms at 60fps).
Real speech varies enormously frame-to-frame — syllable boundaries, brief
consonant gaps, natural pauses — so a genuine, audible spike can land
entirely between two sampled windows and never register at all, and a
sustained word can dip under a threshold for a single frame purely from
sampling luck, not because the person actually stopped talking. Reported
symptom this caused: the level meter visibly failing to reach the sensitivity
marker even when the mic clearly picked up a spike, and — more subtly — the
open/close hysteresis appearing to only ever respect the (lower) close
threshold, because the (higher) open threshold's bar was inconsistently
sampled.

`services/audioLevel.ts`'s `createPeakHold(decayPerSecond)` is a fast-attack/
slow-decay peak-hold, the same technique real VU meters use: `update(instantLevel,
deltaSeconds)` immediately jumps to a new, louder reading, but only decays
back down gradually (`DEFAULT_DECAY_PER_SECOND = 1.2` — roughly 0.83s to
fully decay from a full-scale peak) when the instant reading is quieter. Both
`services/voiceActivation.ts`'s `startVoiceActivation` (the real gate) and
`AudioSettings.tsx`'s mic-test tick loop run the *same* raw `computeLevel()`
reading through their own `createPeakHold()` instance before doing anything
else with it — feeding the held level, not the raw instant one, into both
`nextGateState()` and the meter's displayed value. This is why the meter
itself now visibly holds a spike for a moment instead of only ever showing
whatever the current frame's instant reading happens to be, and why the gate
no longer perceives a mid-word dip as "you stopped talking."

Timestamps for decay come from `requestAnimationFrame`'s own
`DOMHighResTimeStamp` argument (milliseconds) — both tick loops track
`lastTimestamp` and skip decay (`deltaSeconds = 0`) until there are two real
timestamps to diff, since the very first tick (called synchronously, with no
timestamp) has nothing to compare against yet. This only delays when decay
starts mattering by one frame in production; tests drive it by calling the
mocked `requestAnimationFrame` callback with explicit millisecond values (see
`voiceActivation.test.ts`'s `stubAudioContext().nextFrame(timestamp)`) — the
first `nextFrame()` call after construction always establishes the baseline
(`deltaSeconds = 0` regardless of the value passed), so a test needs *two*
calls to observe real decay.

Peak hold itself has no debounce/timeout — its decay is level-based math
driven by real elapsed time, not a fixed delay before acting. (A genuine,
user-facing timeout was added later — see "Close threshold timeout" below —
but it sits on top of hysteresis as an independent force-close condition,
not inside `createPeakHold`.)

### Close threshold timeout (hang time) — for continuous background noise

Hysteresis alone assumes the level eventually drops below the close
threshold on its own. It doesn't help against a *continuous* noise source
(a fan, an AC unit, keyboard clatter) that sits steady somewhere inside the
hysteresis band — loud enough to have opened the gate once, never quiet
enough to close it again — which would otherwise keep the mic open
indefinitely. `VoiceDevicePreference.close_threshold_timeout_ms` (one of
`500`/`1000`/.../`5000` in 500ms steps, or `null` for "Off", default `2000`)
adds an independent, time-based force-close: once open, if the level hasn't
touched the *open* threshold again within this many milliseconds, the gate
force-closes even though hysteresis alone would keep it open. Touching the
open threshold at any point resets the clock. `null` disables this entirely
and hysteresis behaves exactly as described above with no timeout.

`services/voiceActivation.ts`'s `createHangTimeGate()` implements this as a
thin wrapper around the existing pure `nextGateState()` — it never overrides
a legitimate level-based close, it only ever forces an *additional* close
`nextGateState()` wouldn't have made on its own:

```ts
update(level, thresholds, timeoutMs, timestamp) {
    if (level >= thresholds.open && timestamp !== undefined) lastOpenHitAt = timestamp
    const hysteresisOpen = nextGateState(open, level, thresholds)
    const timedOut = open && timeoutMs !== null && lastOpenHitAt !== null && timestamp !== undefined
        && timestamp - lastOpenHitAt > timeoutMs
    open = hysteresisOpen && !timedOut
    return open
}
```

Both `startVoiceActivation` (the real gate) and `AudioSettings.tsx`'s
mic-test tick loop construct one `createHangTimeGate()` and feed it the
peak-held level plus the current `timeoutMs` (from `useMicSensitivity`) every
frame, the same way they already shared `nextGateState()`/`createPeakHold()`.
`useMicSensitivity.timeoutMs` (`number | null`) round-trips through
`useVoiceChannel.join()` (seeded from the fetched device preference,
including an explicit `null` for "Off") and `AudioSettings.tsx`'s new
"Close threshold timeout" slider — 500ms increments, its rightmost step
(`max + step`, i.e. one step past 5000) represents "Off" and persists as
`null`, not a literal large number.

On the backend, `null` is a meaningful *stored* value ("Off"), not "field
omitted" — `Api\VoiceDevicePreferenceController::update()` uses
`array_key_exists('close_threshold_timeout_ms', $validated)` rather than `??`
to tell "the request didn't send this field" (defaults to `2000`) apart from
"the request explicitly sent `null`" (stays `null`). A naive `??` would
silently coerce an explicit "Off" back to the 2000ms default.

### Auto Gain Control disables sensitivity without erasing it

`auto_gain_control: true` (the default) collapses the *effective* thresholds
to `{ open: 0, close: 0 }` (see `computeThresholds`) — always-on, regardless
of whatever `send_threshold`/`close_threshold_gap` are stored. Critically,
**it does not reset the stored preference values** — `AudioSettings.tsx`'s
`updateProcessingToggle()` only calls `useMicSensitivity.getState().
setAutoGainControl(value)`, never `setThreshold(0)`. The Mic Sensitivity
slider, the Hysteresis band select, and the Close threshold timeout slider
all render `disabled` (and at reduced opacity — `disabled:opacity-50`) while
AGC is on (same condition, `preference.auto_gain_control`) but keep
displaying whatever value is stored, so turning AGC back off resumes with
exactly what was set before — nothing to remember or re-configure. An
earlier version reset `send_threshold` to 0 when AGC was enabled; that was
real but avoidable data loss for a value the user had deliberately set, not a
necessary side effect — don't reintroduce it. The meter's hysteresis-band
marker (the `[aria-hidden]` translucent band) is hidden outright rather than
just dimmed while AGC is on, since there's no manual threshold for it to
represent.

The mic-test level meter itself renders unconditionally in `AudioSettings.tsx`
— even before "Start Test" is clicked, or after "Stop Test" — so the
threshold/hysteresis markers stay visible as a reference while adjusting the
sliders. Only the live moving level (`aria-valuenow`) depends on the test
actually running; it sits at `0` the rest of the time.

`webrtc.ts` tracks the gate's open/closed state as `gateOpen` (module-level,
alongside `localStream`), kept deliberately independent of
`useVoice.selfMuted` — an explicit mute always wins. `applyTrackState()` is
the single place that reconciles both: `track.enabled = !selfMuted &&
gateOpen`. Both `setMuted()` and the activation gate's `onGateChange` callback
go through it, so unmuting while the gate is currently closed (quiet) does not
force the track on, and the gate reopening while manually muted does not
un-mute. If a future change touches muting or the activation gate, keep both
funneling through `applyTrackState()` rather than writing `track.enabled`
directly from either path.

**What this fixes, and what's still unverified.** This corrects two concrete,
code-level bugs found by reading the source (threshold never reactive; the
loopback test never gated at all) — both are real regardless of hardware.
What it does *not* do is guarantee the gate behaves well against real
microphone input: `computeLevel()`'s dB floor/scale was tuned for the level
*meter* (task: make normal speech look adequately loud), and reusing the same
function for a gating *threshold* is a different job with different needs —
in particular, ambient room noise may still read a non-trivial fraction of
the 0-100 scale even with `autoGainControl` off, which could make the
threshold's practical useful range narrower than the slider implies. This has
not been confirmed against a real microphone in this environment (no browser
available in this sandbox — see `## Testing`'s "Manual/live verification"
section) and should not be assumed correct just because the unit tests
(which exercise the wiring with synthetic signals, not real hardware/DSP
behavior) pass.

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
