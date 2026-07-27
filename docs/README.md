# CommunityHub documentation

Formal, standalone reference documentation for specific subsystems and features. These
files describe how the code currently works — they are not changelogs or narrated
histories of how a feature was built. For repo-wide orientation (stack, directory map,
run commands, testing conventions), see `CLAUDE.md` at the project root.

This page is the hub every doc links back to. Every file here (plus `CLAUDE.md`) starts
with a `[← All docs](README.md) · See also: ...` line and, where relevant, ends with
cross-links to the docs it most overlaps with — follow those rather than searching, they
encode the actual dependency graph between subsystems.

**New to the repo?** Start at [quickstart.md](quickstart.md), not here.

## Index

- [quickstart.md](quickstart.md) — boot the stack, seed demo data, make one real
  change and watch it go out over HTTP and the WebSocket. Read this first.
- [traps.md](traps.md) — every non-obvious gotcha already hit in this codebase,
  grouped by subsystem, so it doesn't get hit twice. `CLAUDE.md`'s own traps section
  is now just a short index into this file.
- [capabilities-and-channel-types.md](capabilities-and-channel-types.md) — the
  Feature/ChannelType capability system, built-in channel types, and channel
  create/update/delete management.
- [service-layer.md](service-layer.md) — the `app/Services/{Operation}Service`
  convention: where a Feature's server-side operations and their authorization live.
- [voice.md](voice.md) — WebRTC call orchestration, presence vs. call-membership,
  signaling transport, the single-active-call guard, device preferences, TURN.
- [roles-and-permissions.md](roles-and-permissions.md) — the RBAC schema, permission
  resolution, default roles (room and global/instance-wide), the per-room rank
  hierarchy, channel visibility restriction, direct-message restriction, kick/ban, and
  every enforcement point.
- [notifications.md](notifications.md) — the notification model, producers, focus
  suppression, preferences, and the delivery surface.
- [messages-and-pagination.md](messages-and-pagination.md) — the two-way cursor
  endpoint, the trimmed client-side message window and its jump-to-present
  affordance, the contiguous-run message cache and its driver seam, and the
  optimistic edit/reaction/delete path.
- [conversations-and-invites.md](conversations-and-invites.md) — message scoping,
  conversation creation/deduplication, group participants, and room invite mechanisms.
- [status.md](status.md) — the status/custom-status/color schema, `StatusFeature`,
  `UserStatusService`, the live-broadcast contract, and the `UserStatusPopover` UI.
- [theming.md](theming.md) — the CSS-variable-backed theme token system
  (backgrounds, panel borders, text, accent/status/feedback colors, radius,
  border width, typography), the
  built-in presets and per-variable overrides in Settings' Appearance panel
  (`ThemePreference`, `ThemeTokens`), and how to add another preset or a new token.

## Keeping this up to date

When a change adds or meaningfully alters a subsystem covered here, update the relevant
file in the same change — or add a new file if the subsystem doesn't have one yet, and
link it from this index. See `CLAUDE.md`'s "Docs" section for the ground rules.
