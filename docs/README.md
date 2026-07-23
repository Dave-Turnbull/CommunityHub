# CommunityHub documentation

Formal, standalone reference documentation for specific subsystems and features. These
files describe how the code currently works — they are not changelogs or narrated
histories of how a feature was built. For repo-wide orientation (stack, directory map,
run commands, testing, known traps), see `CLAUDE.md` at the project root.

## Index

- [capabilities-and-channel-types.md](capabilities-and-channel-types.md) — the
  Feature/ChannelType capability system, built-in channel types, and channel
  create/update/delete management.
- [service-layer.md](service-layer.md) — the `app/Services/{Operation}Service`
  convention: where a Feature's server-side operations and their authorization live.
- [voice.md](voice.md) — WebRTC call orchestration, presence vs. call-membership,
  signaling transport, the single-active-call guard, device preferences, TURN.
- [roles-and-permissions.md](roles-and-permissions.md) — the RBAC schema, permission
  resolution, default roles, the per-room rank hierarchy, and every enforcement point.
- [notifications.md](notifications.md) — the notification model, producers, focus
  suppression, preferences, and the delivery surface.
- [conversations-and-invites.md](conversations-and-invites.md) — message scoping,
  conversation creation/deduplication, group participants, and room invite mechanisms.

## Keeping this up to date

When a change adds or meaningfully alters a subsystem covered here, update the relevant
file in the same change — or add a new file if the subsystem doesn't have one yet, and
link it from this index. See `CLAUDE.md`'s "Docs" section for the ground rules.
