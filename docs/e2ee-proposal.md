# End-to-end encrypted communication — proposal

[← All docs](README.md)

**Status: proposal only. Nothing here is implemented or approved.** Same rule as
`CLAUDE.md`'s `## Planned work`: this needs an explicit go-ahead before any code, and
isn't pre-approved by existing here. Written up as a requirements sketch so a future
discussion/implementation doesn't start from scratch.

**Not on any near-term roadmap.** This is a speculative, ground-up subsystem (see the
multi-device section below) on the scale of weeks of work minimum, not a small
feature — there is no timeline or commitment to build it. Don't treat its presence
here as a signal that it's coming soon, and don't start any part of it as a side
effect of touching messaging/voice/notifications code nearby.

## Why a new Feature, not encrypting existing messaging

Per `docs/architecture-vision.md`, a new `Feature` is justified only by a genuine new
primitive existing ones can't express. E2EE qualifies: the server-can't-read-content
property changes behavior at every layer (no server-side search, no notification
previews, no moderation, no link previews) in a way that would otherwise mean forking
`TextMessageService` with conditionals. Scoping it as its own Feature + ChannelType,
deliberately narrower than normal messaging, keeps it tractable:

- Fixed membership at conversation creation — no adding participants later. Turns
  group re-keying (MLS-shaped, hard) into pairwise Double Ratchet sessions (Signal
  Protocol shape, well-understood, existing libraries).
- Text-only for v1. No attachments, no comments/votes/forum, no search, no
  moderation tooling, no notification content previews (notify "encrypted message
  received" only).
- Additive: existing DMs/channels/messaging are untouched.
- Use a vetted implementation (e.g. a WASM build of `libsignal`) for the actual
  Double Ratchet/X3DH math — do not hand-roll it. The library de-risks the
  algorithm; it does not de-risk the system design below.

## Multi-device key system (prerequisite, not a follow-up)

Required before the encrypted Feature can ship at all — a second browser/device that
can't decrypt anything is a launch blocker, not a v2 gap.

1. **Per-device identity keys.** Generated client-side on first use, keyed by this
   app's existing `client_id` (`services/clientId.ts`) rather than inventing a new
   device concept. X25519 (ECDH) + Ed25519 (signing), via a WASM crypto lib (native
   WebCrypto X25519 support is inconsistent across browsers).
2. **Server-side public-key directory.** New tables: per-device identity key, signed
   prekey + signature, a pool of one-time prekeys. A replenish-when-low endpoint. A
   session-start endpoint that atomically consumes one one-time prekey (no reuse
   across concurrent session starts).
3. **Per-device session fan-out.** A message to a recipient with N devices means N
   independent Double Ratchet sessions and N ciphertexts, not one. Applies
   symmetrically to the sender's own other devices too.
4. **Device linking.** No existing analog (Sanctum sessions carry no key material).
   New flow: an unlinked device shows a QR/short code, an already-linked device
   scans/confirms, key material transfers over a temporary out-of-band channel. The
   existing private per-user Reverb channel (`App.Models.User.{id}`, already used for
   notifications and cross-tab voice-call guarding) is usable as that transport —
   new payload types on an existing channel, not new realtime plumbing.
5. **Loss/recovery.** Pure E2EE loses history if every device is lost — decide
   up front whether to offer an opt-in recovery-phrase-encrypted backup (weakens the
   guarantee, but is the realistic user expectation) or accept the loss as by-design.
6. **Trust verification.** Safety-number-style comparison of a contact's identity
   key(s), with re-verification when they add a new device. Without this, the
   server (as key-distribution point) could substitute its own key and MITM even
   with multi-device solved — decide whether v1 targets "opaque to the server
   operator" or the stronger "resistant to a malicious server," since that decides
   whether this is in scope.

## Explicit non-goals for v1

Attachments, message search, edit history, comments/threads, moderation tooling,
notification content previews, group conversations with post-creation membership
changes.

## Open decisions before implementation starts

- "Opaque to operator" vs. "malicious-server-resistant" threat model (drives whether
  §6 trust verification ships in v1).
- Whether key-loss recovery backup is offered at all.
- Whether v1 supports groups (even fixed-membership ones) or ships 1:1-only first.
