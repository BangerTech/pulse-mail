<p align="center">
  <img src="frontend/public/logo.png" alt="Pulse Mail" width="380">
</p>

# Pulse Mail

Self-hosted web mail client with an Apple Mail-style layout. IMAP/SMTP, unified inbox, signatures, and a local SQLite cache.

## Features

- Three-pane layout (sidebar, message list, reading pane)
- Multiple accounts with a unified inbox and collapsible mailboxes
- Account colors, names and server settings can be edited later
- IMAP IDLE + WebSocket for new mail
- Rich-text signatures with resizable images
- Send and receive attachments, inline image preview
- Full-text search across folders and accounts
- Dark mode and a compact mobile layout

## Quick start

```bash
git clone https://github.com/BangerTech/pulse-mail.git
cd pulse-mail
mkdir -p data backend/uploads/signatures
docker compose up -d --build
```

Open **http://localhost:8080**

1. Open Settings
2. Add an IMAP/SMTP account
3. For Gmail use an [app password](https://support.google.com/accounts/answer/185833), not your normal password

| | Host | Port |
|---|---|---|
| IMAP | `imap.gmail.com` | `993` |
| SMTP | `smtp.gmail.com` | `587` |

## Configuration

Optional environment variables for the backend (see `docker-compose.yml`):

- `ENCRYPTION_KEY` — used to encrypt stored IMAP/SMTP passwords. Set a long random value in production.
- `DB_PATH` — SQLite path inside the container (default `/app/data/mail.db`)
- `PORT` — backend port (default `3001`)

Mail data stays on the host:

- `./data/mail.db` — accounts, signatures, message cache (not committed)
- `./backend/uploads/` — signature images (not committed)

```bash
docker compose logs -f
docker compose down
```

## Development

```bash
cd backend && npm install && npm run dev
cd frontend && npm install --legacy-peer-deps && npm run dev
```

Frontend Vite proxy: `/api` and `/ws` → `localhost:3001`.

## Docs

See [pulse-mail.md](./pulse-mail.md) for the database schema and API.
