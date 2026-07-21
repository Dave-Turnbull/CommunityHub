# CommunityHub

A self-hostable chat room server with multiple rooms and channels supported including voice via WebRTC and text chat. Laravel 13 + React 18 + Inertia + Postgres + Redis + Reverb, fully Dockerised.

## Requirements

- Docker Desktop (with WSL2 backend on Windows)
- Nothing else. No local PHP, Node, or Postgres needed.

## Quick start

```bash
docker compose up -d --build
```

First build takes ~3-5 minutes (compiling PHP extensions, installing npm packages).
Then open **http://localhost:8000**

You'll land on the login page. Click **Register** to create an account, or seed
demo data first (see below).

## Optional: seed demo data

The database boots **empty** by design. To load two demo users, a server with
three channels, and a DM thread:

```bash
docker compose exec app php artisan db:seed --force
```

Login with:
| Email | Password |
|---|---|
| alice@example.com | password |
| bob@example.com | password |

## Ports

| Service | URL |
|---|---|
| App | http://localhost:8000 |
| Vite dev server | http://localhost:5173 |
| Reverb (WebSockets) | ws://localhost:8080 |
| Postgres | localhost:5432 |
| Redis | localhost:6379 |
| Mailpit (caught emails) | http://localhost:8025 |

## Email

Outgoing mail (room invites, currently) is queued (`ShouldQueue`) and sent by
the `worker` container. Which mailer handles it is picked with `MAIL_MAILER`
in `.env` — see `config/mail.php`:

| `MAIL_MAILER` | What it does | Extra setup |
|---|---|---|
| `mailpit` (default) | Sends over SMTP to the local **Mailpit** container — nothing leaves your machine. Open **http://localhost:8025** to read every email the app has sent. | none |
| `smtp` | Sends over SMTP to any real provider (SendGrid, Mailgun, a plain mail server, ...). | set `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_ENCRYPTION` |
| `ses` | Sends via AWS SES, using the SDK already pulled in by `league/flysystem-aws-s3-v3`. | set `MAIL_SES_KEY`, `MAIL_SES_SECRET`, `MAIL_SES_REGION` in `.env` (`config/services.php`) — deliberately **separate** from the `AWS_*` vars used for R2 storage, which are R2 credentials and won't authenticate against real AWS |
| `log` | Writes the full email (headers + body) to `storage/logs/laravel.log` instead of sending it. | none |
| `array` | Keeps mail in memory only; used automatically by the test suite (`phpunit.xml`). Not useful outside tests. | none |
| `postmark`, `resend`, `sendmail`, `failover`, `roundrobin` | Supported by Laravel's mail layer and already wired via its zero-config defaults, but the packages aren't installed in this project (`composer require symfony/postmark-mailer` or `resend/resend-php` to enable). | package install + provider credentials |

If you change any `MAIL_*` var, restart the worker — it's a long-running
daemon that only reads `.env` once, at process start:

```bash
docker compose restart worker
```

## Common commands

```bash
# Watch logs
docker compose logs -f app

# Shell into the app container
docker compose exec app sh

# Run migrations manually
docker compose exec app php artisan migrate

# Wipe the database and start over
docker compose exec app php artisan migrate:fresh

# Wipe database AND re-seed
docker compose exec app php artisan migrate:fresh --seed

# Stop everything
docker compose down

# Nuke everything including data volumes
docker compose down -v
```

## Architecture

```
Browser
  ├── HTTP  ──► nginx :80 ──► php-fpm (app) ──► Postgres
  │                             └──────────────► Redis (cache, sessions, queue)
  ├── WS    ──► Reverb :8080  (broadcasts messages, reactions, presence)
  └── HMR   ──► Vite :5173    (dev only)

worker: php artisan queue:work  (processes broadcast jobs + queued emails)
                                  └──────────────► Mailpit :1025 (SMTP, dev only)
```

### Backend
- **Laravel 13** — no Kernel.php, routing wired in `bootstrap/app.php`
- **UUID primary keys** on every table
- **Session auth** (Sanctum SPA mode), not tokens
- **Broadcast events** fire on message send/edit/delete and reaction change
- **Cursor pagination** for message history (50 per page, walks backwards)
- **Queued mail** (`ShouldQueue` Mailables) sent through the `worker`
  container — Mailpit catches everything in dev, see [Email](#email)

### Frontend
- **Inertia.js** — server-driven routing, no client-side router, no API glue for page loads
- **Zustand** for message/presence state, keyed by channel or conversation ID
- **laravel-echo + pusher-js** talking to Reverb
- Messages you send are added to your own store from the HTTP response;
  the broadcast uses `->toOthers()` so you don't get a duplicate

## Features

- Servers, channels (text / announcement / voice placeholder)
- Real-time messages: send, edit, soft-delete, reply
- Image + file attachments (drag-drop or picker, 8 MB cap)
- Unicode emoji picker + reactions
- Direct messages and group DMs
- Presence (online / idle / dnd / offline) and a live member list
- Profile settings with live preview
- Room invites — a copyable/shareable join link, or invite someone by email
  (they get a link to accept; new emails register an account on accept, known
  emails just log in) — see [Email](#email)

## Production notes

- Set `FILESYSTEM_DISK=r2` and fill the `AWS_*` vars to store uploads in
  Cloudflare R2 instead of local disk.
- Swap `UploadController` for presigned URLs so files bypass the app server.
- Put Reverb behind TLS and set `REVERB_SCHEME=https`.
- Swap Mailpit for a real mailer — set `MAIL_MAILER`/`MAIL_HOST`/`MAIL_PORT`
  (or add credentials for a transactional provider) and drop the `mailpit`
  service from `docker-compose.yml`.
- Run `php artisan config:cache route:cache view:cache` in the image build.
