<p align="center">
  <img src="frontend/public/logo.png" alt="Pulse Mail" width="140">
</p>

<h1 align="center">Pulse Mail</h1>

<p align="center">
  Self-hosted Webmail mit Apple-Mail-Layout.<br>
  IMAP/SMTP, eigener Login, mehrere Postfächer, lokale SQLite-Cache.
</p>

Aktuelle Version: **1.4.16** · Doku: [pulse-mail.md](./pulse-mail.md)

## Windows-App

Die offizielle Desktop-App ist ein Tauri-2-Fenster um deinen Pulse-Mail-Server (WebView2). Sie speichert keine Mails extra — Login und Postfächer sind dieselben wie im Browser.

1. Unter [Releases](https://github.com/BangerTech/pulse-mail/releases) die Datei `Pulse Mail_x.y.z_x64-setup.exe` laden und installieren
2. Beim ersten Start die Server-URL eintragen, z. B. `http://192.168.2.83:8080`
3. Mit dem Pulse-Mail-Benutzer anmelden

Falls noch kein Release da ist: **Actions → Windows App** → Artifact `pulse-mail-windows` (nur mit GitHub-Login, 90 Tage).

Pake nicht mehr nutzen. Die offizielle App hat einen eigenen Cache; nach Server-Updates reicht **Datei → Neu laden**.

| | |
|---|---|
| Gespeicherte URL | `%APPDATA%\de.bangertech.pulsemail\config.json` |
| Server ändern | Menü **Datei → Server ändern…**, Start mit `--setup`, oder `--url` / `PULSE_MAIL_URL` |
| Neu laden | **Datei → Neu laden** |

Die Hülle selbst (Icon, Badge, Hinweise) ändert sich nur mit einer neuen `.exe`. Die Mail-Oberfläche kommt vom Server nach einem Docker-Rebuild.

Lokal unter Windows (Rust + Node): `cd desktop && npm install && npm run build`.

## Features

- Drei-Spalten-Layout, Vorschau rechts oder unten
- Mehrere IMAP-Konten, **Alle Eingänge**, eigene App-Benutzer
- Ungelesen im Tab, als Badge und in der Windows-Taskbar
- Neue-Mail-Ton und Desktop-Hinweis (in der Windows-App nativ)
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

Die Windows-App danach nur neu laden, keine neue `.exe` nötig.

## Entwicklung

```bash
cd backend && npm install && npm run dev
cd frontend && npm install --legacy-peer-deps && npm run dev
```

Vite-Proxy: `/api` und `/ws` → `localhost:3001`.

## Weitere Doku

Schema, API, Shortcuts und Changelog stehen in [pulse-mail.md](./pulse-mail.md).
