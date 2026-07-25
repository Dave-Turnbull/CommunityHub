# CommunityHub

CommunityHub is a self-hosted chat application. Content is organized into rooms,
each containing channels; users can also message each other directly if they
share a room. Text, images and files, voice calls, and presence are all
supported, and updates — messages, reactions, edits, who's online, who's
talking — appear in real time without a page refresh.

## Features

**Rooms and channels**

A room is a space with its own members, channels, and roles. Anyone with
permission can create a room, and create, rename, or reorder channels within it.
Channels can be text (send, edit, delete, and reply to messages; attach images
and files by drag-drop or file picker; react with emoji) or voice.

**Direct messaging**

Message another user directly, one-to-one or in a group, with the same
attachments, reactions, editing, and live delivery as a channel — plus the
option to start a voice call.

**Granular permissions**

Each room has its own roles, each with a colour, a rank, and a set of
permissions (manage channels, manage roles, invite members, and more). Members
can hold multiple roles at once. A role can only be edited by someone holding a
higher-ranked role.

**Voice chat**

Real-time voice calls in voice channels or direct messages, connecting
peer-to-peer with an automatic fallback when a direct connection isn't
possible. Includes per-participant volume control, speaking indicators, mute,
adjustable voice-activation sensitivity, a microphone test, and device
selection.

**Customisable themes**

A choice of built-in colour presets, plus the ability to override individual
colours, corner radius, border widths, and fonts. Preferences are saved to the
account and applied on every device.

**Also included**

Presence and status (online, idle, do-not-disturb, or a custom message and
colour), a member list per room, per-category notification preferences (email
and in-app), and room invites by link or by email.

## Design principles

**Usability first.**

Features are evaluated first on how they affect the everyday experience of
sending and reading messages — responsiveness and clarity take priority over
adding surface area.

**Maximum optimisation.**

Actions such as sending a message, reacting, or editing apply to the local view
immediately and reconcile with the server in the background, rather than
waiting on a round trip. Message history is fetched and cached in bounded
windows so scrolling through long histories doesn't degrade performance or
grow memory usage unbounded.

**Full customisation.**

Branding (app name) and appearance (themes, per-variable overrides) are
configuration, not hardcoded — a self-hosted instance isn't locked into the
project's default look or name.

**Free and open source.**

AGPL-3.0. No paid tiers, no feature gates, no telemetry. Fork it, change it,
run it.

**Web technologies.**

Built on a boring, proven stack — Laravel, React, Postgres, Redis — because
it's well understood, easy to contribute to, and runs anywhere.

## Roadmap

Planned, not yet built:

- **Screen sharing and live streaming** in voice channels
- **Native Android and iOS apps**, with offline message history and push notifications
- **Runtime-installable channel types**, so a room can add new kinds of channel
  without a redeploy
- **Mentions** (`@user`) with per-channel notification overrides
- **Room-level notification defaults** set by room owners
- **Instance-wide administration** — global roles and a proper admin surface
- **More moderation tools** — kicks, bans, and message management

## Installation

You need [Docker](https://docs.docker.com/get-docker/). Nothing else — no local PHP,
Node, or Postgres.

```bash
git clone https://github.com/Dave-Turnbull/CommunityHub.git
cd CommunityHub
docker compose up -d --build
```

The first build takes 3–5 minutes. Then open **http://localhost:8000** and click
**Register** to create your account.

The database starts empty on purpose. If you'd rather poke around with demo content
first:

```bash
docker compose exec app php artisan db:seed --force
```

That creates three accounts — `dave@example.com`, `bove@example.com`, and
`peve@example.com`, all with the password `password` — plus a room with channels and
some conversation history.

### Ports

| Service | URL |
|---|---|
| App | http://localhost:8000 |
| Reverb (WebSockets) | ws://localhost:8080 |
| Mailpit (caught emails, dev) | http://localhost:8025 |
| Vite dev server | http://localhost:5173 |
| Postgres | localhost:5432 |
| Redis | localhost:6379 |

### Configuration

Settings live in `.env`. The ones most worth knowing:

| Variable | What it does |
|---|---|
| `APP_NAME` | The display name shown throughout the app. Change it and the whole instance rebrands. |
| `MAIL_MAILER` | Which mailer sends invites. Defaults to `mailpit`, which keeps everything local — read it at http://localhost:8025. Set to `smtp`, `ses`, or `log` for anything else. |
| `FILESYSTEM_DISK` | Where uploads go. `public` (local disk) by default; `r2` stores them in Cloudflare R2 via the `AWS_*` variables. |
| `TURN_*` | Credentials and public host for the bundled TURN relay used by voice. |

After changing any `MAIL_*` variable, restart the background worker — it only reads
`.env` once, when it starts:

```bash
docker compose restart worker
```

### Everyday commands

```bash
docker compose logs -f app       # watch logs
docker compose exec app sh       # shell into the app container
docker compose down              # stop everything
docker compose down -v           # stop and delete all data
```

### Running in production

- Put the app and Reverb behind TLS, and set `REVERB_SCHEME=https`.
- Set `FILESYSTEM_DISK=r2` with real `AWS_*` credentials for uploads.
- Point `MAIL_MAILER` at a real provider and drop the `mailpit` service from
  `docker-compose.yml`.
- Cache configuration in the image build:
  `php artisan config:cache route:cache view:cache`.

## Contributing

Developer documentation lives in [`CLAUDE.md`](CLAUDE.md) (stack, layout,
conventions, known pitfalls) and [`docs/`](docs/README.md) (per-subsystem
references). Every change is expected to ship with tests:

```bash
docker compose exec app php artisan test     # backend
docker compose exec vite npm run test        # frontend
```

## Licence

CommunityHub is free software, licensed under the **GNU Affero General Public
License v3.0**. You may use, modify, and redistribute it; if you run a modified
version as a network service, you must offer that version's source to its users. See
[LICENSE](LICENSE) for the full text.
