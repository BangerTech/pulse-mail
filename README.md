<p align="center">
  <img src="frontend/public/logo.png" alt="Pulse Mail" width="140">
</p>

<h1 align="center">Pulse Mail</h1>

<p align="center">
  Self-hosted Webmail mit Apple-Mail-Layout.<br>
  IMAP/SMTP, eigener Login, mehrere Postfächer, lokale SQLite-Cache.
</p>

Aktuelle Version: **1.5.0** · Doku: [pulse-mail.md](./pulse-mail.md)

## Zwei Windows-Apps

| | Server-Hülle (Tauri) | Native Kunden-App (WinUI) |
|---|---|---|
| Ordner | [`desktop/`](desktop/) | [`windows/`](windows/) |
| Für wen | Du / Self-Host mit Docker | Andere Kunden ohne Server |
| Braucht Docker? | Ja | Nein |
| Login | Pulse-Benutzer → IMAP | Direkt Postfach (IMAP/OAuth) |
| Daten | Auf dem Server | `%LOCALAPPDATA%\PulseMail\` |
| App-ID | `de.bangertech.pulsemail` | `de.bangertech.pulsemail.winui` |
| Build | Actions → **Windows App** | Actions → **Windows Native App** |

### Server-Hülle (bestehend)

1. [Releases](https://github.com/BangerTech/pulse-mail/releases) → `Pulse Mail_x.y.z_x64-setup.exe`
2. Server-URL eintragen, z. B. `http://192.168.2.83:8080`
3. Mit dem Pulse-Mail-Benutzer anmelden

### Native Kunden-App (neu, v1.0.0)

1. Release `native-v1.0.0` → ZIP entpacken → `PulseMail.App.exe`
2. Postfach hinzufügen (Gmail / Outlook / Custom IMAP)
3. Optional: OAuth Client-IDs unter Einstellungen → OAuth

Details: [windows/README.md](windows/README.md)

## Features

- Drei-Spalten-Layout, Vorschau rechts oder unten
- Mehrere IMAP-Konten, **Alle Eingänge**, eigene App-Benutzer (Web/Docker)
- Ungelesen im Tab, als Badge und in der Windows-Taskbar
- Neue-Mail-Ton und Desktop-Hinweis
- Konversationen, Suche im Cache, Signaturen, Anhänge, PDF-Vorschau
- Dark Mode, Tastaturkürzel, Command-Palette
- Mobile Ansicht (Drawer, Wischen, volle Leseansicht)

## Server starten

```bash
git clone https://github.com/BangerTech/pulse-mail.git
cd pulse-mail
mkdir -p data backend/uploads/signatures backend/uploads/avatars
docker compose up -d --build
```

Öffnen: **http://localhost:8080** (im LAN z. B. `http://192.168.2.83:8080`)

1. Ersten Benutzer anlegen (wird Admin)
2. Unter Einstellungen ein IMAP/SMTP-Postfach hinzufügen
3. Gmail: [App-Passwort](https://support.google.com/accounts/answer/185833), nicht das normale Passwort

| | Host | Port |
|---|---|---|
| IMAP | `imap.gmail.com` | `993` |
| SMTP | `smtp.gmail.com` | `587` |

## Konfiguration

Optional für das Backend (`docker-compose.yml`):

- `ENCRYPTION_KEY` — verschlüsselt gespeicherte IMAP/SMTP-Passwörter. In Produktion einen langen Zufallswert setzen.
- `DB_PATH` — SQLite im Container (Standard `/app/data/mail.db`)
- `PORT` — Backend (Standard `3001`)

Daten auf dem Host:

- `./data/mail.db` — Benutzer, Konten, Signaturen, Mail-Cache (nicht im Git)
- `./backend/uploads/` — Signaturbilder und Avatare (nicht im Git)

```bash
docker compose logs -f
docker compose down
```

Nach Frontend- oder Backend-Änderungen:

```bash
docker compose up -d --build
```

Die Tauri-Hülle danach nur neu laden, keine neue `.exe` nötig. Die native WinUI-App hat ihren eigenen Cache und Sync.

## Entwicklung

```bash
cd backend && npm install && npm run dev
cd frontend && npm install --legacy-peer-deps && npm run dev
```

Vite-Proxy: `/api` und `/ws` → `localhost:3001`.

Native App (nur Windows): siehe [windows/README.md](windows/README.md).

## Weitere Doku

Schema, API, Shortcuts und Changelog stehen in [pulse-mail.md](./pulse-mail.md).
