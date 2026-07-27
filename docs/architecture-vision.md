# Architecture vision

[← All docs](README.md) · See also:
[capabilities-and-channel-types.md](capabilities-and-channel-types.md) ·
[service-layer.md](service-layer.md) · [build-a-channel-type.md](build-a-channel-type.md)

Unlike the rest of `/docs`, this file states **intent**: why the application is
shaped the way it is, what belongs at each layer, and where the architecture is
deliberately headed. The mechanics it rests on are documented in
[capabilities-and-channel-types.md](capabilities-and-channel-types.md) and
[service-layer.md](service-layer.md) — read those for *how*; read this for *why*.

## The goal

CommunityHub is an all-in-one communication hub. The internet has a vast array of
ways to communicate — chat, voice/video calls, forums, wikis, file drops,
scoreboards, public pages — and most of them decompose into a small number of base
primitives. This application is built by implementing those primitives once, well,
as **Features**, and building everything user-facing by composing them:

> **Every user-facing surface is a ChannelType composing capability grants from a
> small set of Features. Features are added reluctantly; ChannelTypes are added
> freely.**

A forum is not a new primitive — a comment section is messaging, so a forum post's
discussion rides on the text Feature, and only the post itself (the showcased
thing) is new. A files-only channel is not new code at all — it is a ChannelType
requesting `['text.read', 'text.send_images']` and nothing else. The measure of
success for this architecture is how often the answer to "can we build X?" is
"compose it from what exists" rather than "write a new subsystem."

`HybridConversationType` is the existing proof: it requests
`['text.all', 'voice.all']` — two Features composed into one surface, with no
Feature knowing the other exists.

## The three layers

The vocabulary is the one already used throughout the code and docs — do not
introduce parallel terms for these:

- **Feature** (`app/Support/Capabilities/Feature.php` implementations) — a
  capability *provider*: one base communication primitive. A Feature is three
  coordinated pieces: its metadata class (declares capability keys — pure data,
  does nothing), its Service (`app/Services/` — where the operations live and are
  authorized, see [service-layer.md](service-layer.md)), and its frontend
  hook/component pair (`useChat` + `TextChannelContent` is the template). Current
  Features: `text`, `voice`, `status`.
- **Capability** — a grant string (`text.send_images`, `voice.join`). Boolean:
  a channel type has it or it doesn't. Effectively permanent once shipped.
- **ChannelType** (`app/Support/ChannelTypes/ChannelType.php` implementations +
  a `resources/js/services/channelTypes.tsx` descriptor) — a capability
  *consumer*: a user-facing surface assembled by requesting capability/group keys
  from any number of Features, plus its own presentation (`Content` component,
  sidebar rendering, default settings).

## Principles

**Features are added reluctantly.** A new Feature is justified only by a genuine
new primitive that existing ones cannot express — *documents* (canonical current
version, revisions, internal links — what a wiki needs) or *structured data*
(typed columns, sorting — what a scoreboard needs) would qualify; a forum, a
gallery, or an announcements surface would not. Forcing a non-fit onto an existing
primitive is as much a failure as adding a redundant one. When something new
arrives, build the smallest genuine primitive and compose the rest. (The
cautionary tales, in both directions: protocols that let every extension invent
its own primitives fragment their ecosystem; platforms that force everything onto
one chat substrate end up bolting real applications on as escape hatches.)

**Grants and parameters are different things.** A capability answers *whether* a
channel type may do something; a **parameter** tunes *how*. "Can this channel
receive text?" is `text.send_text`. "Messages here are at most N characters" is a
parameter. Parameters flow through one pipeline: declared as defaults by
`ChannelType::defaultSettings()`, stored per-channel in `channels.settings`
(JSON), enforced by the owning Feature's Service reading the entity's settings.
Today no built-in type declares any parameter, so the enforcement read is a
designed-but-unexercised seam — the first parameterized type establishes the
pattern. Never express a parameter as a capability key or vice versa.

**Capabilities and RBAC are separate axes.** Capabilities gate what a *channel
type* can do; roles and permissions (`App\Support\Permission`,
[roles-and-permissions.md](roles-and-permissions.md)) gate what a *user* may do.
`TextMessageService::send()` checks both, independently: the channel must have
`text.send_text`, and (for DMs) the user must hold `SendDirectMessages`. Keep
them unmerged — a "who" question is never answered with a capability check, and a
"what can this surface do" question is never answered with a role check.

**The backend Service is the only enforcement boundary.** Frontend capability
data (`channelTypes.tsx`'s `capabilities` arrays, `isTextCapable`) exists for
rendering decisions and developer ergonomics, never for security. Every operation
authorizes itself inside its Service, first thing, so no future caller can reach
it unsafely (see [service-layer.md](service-layer.md)'s design rules).

**Users see curated types; composition is a developer-facing act.** End users and
room owners choose from opinionated, named channel types ("Text", "Voice",
"Announcements") — they never assemble capabilities by hand. `KNOWN_CHANNEL_TYPES`
is a deliberately curated list, and there is intentionally no capability-checkbox
UI for room owners: raw composition exposed to users becomes a permission-matrix
support burden. New compositions ship as new ChannelTypes with clear names.

**Extension is explicit registries, not hooks.** New Features and ChannelTypes
register in dedicated service providers against typed interfaces
(`FeatureServiceProvider`, `ChannelTypeServiceProvider`). There is deliberately no
WordPress-style action/filter hook system: implicit, ordered, untyped extension
points make "what code runs when a message sends?" unanswerable, which is the
wrong trade for an open-source codebase. If you need a new extension point, add a
registry with an interface, following the two that exist.

## Direction

These are directions, not commitments — the same rule as `CLAUDE.md`'s
`## Planned work` applies: nothing below is pre-approved, and each item needs its
own explicit go-ahead before code. They are recorded so contributors know which
way the architecture intends to grow.

**Audience/visibility as its own axis — including a public-page substrate.** Who
can *see* a surface is independent of what the surface *is*, so visibility is a
property of a channel, not a Feature to compose in. The narrowing half already
exists: role-restricted channel visibility (`Channel::isVisibleTo()`,
[roles-and-permissions.md](roles-and-permissions.md)). The widening half —
public, unauthenticated access — is future work with a known shape:
`isVisibleTo()` accepting a null user (today it is typed `User`, non-nullable,
with five call sites), Services' read-path membership assertions becoming
"can-view" assertions, and a guest route group. Crucially, "public" is more than
access: a public page needs presentation and plumbing no authenticated page has —
per-page metadata/OpenGraph, robots/indexing config, a read-only UI shell — and
none of that exists today (`app.blade.php` carries four meta tags; there is no
robots.txt, sitemap, or SEO layer). That substrate should be built **once, shared
by any ChannelType that opts into being public**, not reinvented per type. The
one existing anonymous surface, the invite landing page
(`Web\InviteController::show`), is the precedent to extend: tolerant of a null
user, and building its props by explicit `only()` whitelist rather than shipping
loaded relations — the discipline every public surface must keep.

**A real frontend Feature contract.** The backend composition story is solid; the
frontend one is informal — `Content` is typed `ComponentType<any>`, the
descriptor's `capabilities` array is informational, and nothing gates a hook to
the capability it serves. The intended shape: a TypeScript interface for what a
Feature's frontend module exports (its hook + component pair), and the planned
`ChannelCapabilityContext` (see `CLAUDE.md ## Planned work`) so a Feature's hook
fails loudly when used in a surface that wasn't granted its capability — a
programmer-error catcher, not a security control. This becomes the enabling
investment as the ChannelType count grows.

**Plugins consume these seams; they don't replace them.** The long-term
runtime-installable plugin idea (see `CLAUDE.md ## Planned work` for its scope
and security constraints) is not a different architecture — a plugin would
*register* Features and ChannelTypes through exactly these registries. Every
improvement to the Feature/ChannelType contract is groundwork for plugins; nothing
about plugins requires abandoning it.

## Known gaps

Honest, current divergences between the model above and the code — worth knowing
before extending, and each a reasonable contribution:

- **Channel pages over-share props.** `Web\ChannelController::show` sends the
  room's member list, custom emojis, roles, and several permission booleans to
  every channel page regardless of type — a "channel types only receive what
  they're granted" model would scope these.
- **`ChannelCreated` ignores visibility.** Channel CRUD broadcasts go to
  `room.{roomId}` gated only on membership, so a role-restricted channel's
  creation still reaches every member's sidebar store (see
  [capabilities-and-channel-types.md](capabilities-and-channel-types.md)).
- **The two channel-type registries are hand-mirrored.** Backend
  `ChannelTypeRegistry` and frontend `REGISTRY` agree by convention; no test
  compares them, so they can drift silently.
