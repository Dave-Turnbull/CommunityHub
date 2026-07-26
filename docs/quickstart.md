# Quickstart

*Get the stack running and make one real change, in under ten minutes.*

[← All docs](README.md)

## 1. Boot it

```bash
docker compose up -d --build     # first boot; ~3-5 min (compiles PHP exts, npm install)
```

That's it — no local PHP/Node/Postgres is expected or wanted. Everything (app,
worker, reverb, vite, nginx, postgres, redis, mailpit, coturn) runs in Docker.

| Service | URL |
|---|---|
| App | http://localhost:8000 |
| Vite (HMR) | http://localhost:5173 |
| Mailpit (dev mail UI) | http://localhost:8025 |
| Reverb (WebSockets) | ws://localhost:8080 |

The database boots **empty by design** — nothing seeds automatically.

## 2. Get some data to look at

```bash
docker compose exec app php artisan db:seed --force
```

Log in at http://localhost:8000 with `dave@example.com` / `password` (also
`bove@example.com`, `peve@example.com`). You'll land in a seeded room with a
multi-week `#general` backlog to scroll through.

## 3. Where the four pieces live

```
Browser
  ├── HTTP  → nginx :80 → php-fpm (app) → Postgres / Redis
  ├── WS    → Reverb :8080   (message + reaction + presence broadcasts)
  └── HMR   → Vite :5173     (dev only)
worker container: php artisan queue:work   (processes broadcast jobs)
```

- **Backend**: Laravel 13 (PHP 8.4) — `app/Http/Controllers`, `app/Services`,
  `app/Models`.
- **Frontend**: React 18 via Inertia.js (server-driven routing, no client
  router) — `resources/js/pages`, `.../components`, `.../stores` (Zustand).
- **Realtime**: Laravel Reverb, a self-hosted Pusher-protocol WebSocket
  server — `resources/js/services/echo.ts` is the one place the frontend
  talks to it.

Full directory map: [CLAUDE.md](../CLAUDE.md#directory-map).

## 4. Make one change and see it live

Pick something small and trace it end to end — this exercises all four
pieces at once:

1. Open `resources/js/components/chat/MessageRow.tsx` and change something
   visible (a color, a label).
2. Save — Vite HMR updates the open browser tab in place, no reload.
3. Send a message from two different logged-in sessions (e.g. two browser
   profiles) in the same channel — the second tab's message arrives over the
   Reverb WebSocket, not a page refresh. That round trip is
   `MessageController` → `TextMessageService::send()` → `MessageSent` event
   (`->toOthers()`) → `services/echo.ts`'s listener → `useMessages` (Zustand)
   → re-render. See
   [messages-and-pagination.md](messages-and-pagination.md) for the full
   shape.

## 5. Run the tests

```bash
docker compose exec app php artisan test      # backend, PHPUnit, ~1s, sqlite in-memory
docker compose exec vite npm run test         # frontend, Vitest, ~2s
```

Every new or changed feature needs a test in the same change — see
[CLAUDE.md](../CLAUDE.md#testing) for the conventions (what `RefreshDatabase`
buys you, how broadcasts are asserted, how to mock `echo`/`api` on the
frontend).

## 6. Next, read...

- **Adding a feature?** [CLAUDE.md's "Adding things — quick
  recipes"](../CLAUDE.md#adding-things--quick-recipes) — one recipe per kind
  of change (new model, new realtime action, new permission-gated action,
  new channel type, ...).
- **Something behaving strangely?** [traps.md](traps.md) — every
  non-obvious gotcha already hit in this repo, so you don't re-hit it.
- **Want the map of every subsystem?** [README.md](README.md)'s index.

---

*Agents: this file is a valid starting point for orienting on the repo — the
directory map and traps index it links to are the two highest-value
follow-up reads before touching code.*
