# Pulse Mail - Projektdokumentation

## Architektur

- **Frontend:** React 18 + TypeScript + Vite, TipTap Editor, Zustand State Management
- **Backend:** Node.js + Express, imapflow (IMAP), nodemailer (SMTP), better-sqlite3
- **Deployment:** Docker Compose (Frontend via Nginx, Backend als Node.js Container)

## Datenbank Schema (SQLite)

Daten liegen lokal in `./data/mail.db` (nicht im Git-Repository).

### accounts
| Spalte | Typ | Beschreibung |
|--------|-----|-------------|
| id | INTEGER PK | Auto-increment |
| name | TEXT | Anzeigename |
| email | TEXT | E-Mail-Adresse |
| imap_host | TEXT | IMAP Server |
| imap_port | INTEGER | Default 993 |
| smtp_host | TEXT | SMTP Server |
| smtp_port | INTEGER | Default 587 |
| username | TEXT | Login-Benutzername |
| password_encrypted | TEXT | AES-256 verschlüsselt |
| color | TEXT | Account-Farbe |
| created_at | DATETIME | Erstellungsdatum |

### signatures
| Spalte | Typ | Beschreibung |
|--------|-----|-------------|
| id | INTEGER PK | Auto-increment |
| name | TEXT | Signatur-Name |
| content | TEXT | HTML-Inhalt |
| is_default | INTEGER | 1 = Standard-Signatur |
| account_id | INTEGER FK | Zugeordneter Account (null = alle) |
| created_at | DATETIME | Erstellungsdatum |

### mail_cache
| Spalte | Typ | Beschreibung |
|--------|-----|-------------|
| id | INTEGER PK | Auto-increment |
| account_id | INTEGER FK | Account |
| folder | TEXT | IMAP-Ordner |
| uid | INTEGER | IMAP UID |
| message_id | TEXT | Message-ID Header |
| subject | TEXT | Betreff |
| from_address | TEXT | Absender-Adresse |
| from_name | TEXT | Absender-Name |
| to_address | TEXT | Empfänger (JSON) |
| cc_address | TEXT | CC (JSON) |
| reply_to_address | TEXT | Reply-To (JSON) |
| date | DATETIME | Datum |
| snippet | TEXT | Vorschautext |
| flags | TEXT | IMAP Flags (JSON) |
| has_attachments | INTEGER | Hat Anhänge |
| body_html | TEXT | HTML-Body |
| body_text | TEXT | Text-Body |
| attachments_meta | TEXT | Anhang-Metadaten (JSON) |
| in_reply_to | TEXT | In-Reply-To Header |
| references_header | TEXT | References Header |
| thread_id | TEXT | Konversations-ID |
| cached_at | DATETIME | Cache-Zeitpunkt |
| raw_headers | TEXT | Rohheader-Block (List-Id, Auth-Results, …) |
| extracted_pdf_text | TEXT | Klartext aus Rechnungs-PDFs |

UNIQUE(account_id, folder, uid)

### Migrationen
Neue Spalten werden in `backend/src/db.js` Funktion `migrate()` per `ALTER TABLE` ergänzt:
- `in_reply_to`, `references_header`, `thread_id`, `cc_address`, `reply_to_address`, `attachments_meta`
- Index `idx_mail_thread`, Index `idx_mail_message_id`
- `raw_headers` — Rohheader für den Prototyp-Klassifikator
- `extracted_pdf_text` — Klartext aus Rechnungs-PDFs (Prototyp-Anreicherung)

## API Endpoints

- `GET /api/accounts` - Alle Accounts
- `PUT /api/accounts/:id` - Account bearbeiten (Name, Server, Farbe; Passwort optional)
- `DELETE /api/accounts/:id` - Account löschen
- `GET /api/accounts/:id/folders` - IMAP-Ordner inkl. Ungelesen-Zähler
- `GET /api/mail/unified/inbox` - Zusammengeführter Posteingang aller Accounts
- `GET /api/mail/unified/unread` - Ungelesen-Summe aller Posteingänge
- `GET /api/mail/:accountId/messages` - Mails auflisten (`folder`, `limit`, `offset`), liefert `messages` und `threads`
- `GET /api/mail/:accountId/message/:uid` - Mail-Detail (Cache zuerst, sonst IMAP nur Body-Parts)
- `GET /api/mail/:accountId/attachment/:uid/:filename` - Anhang download
- `GET /api/mail/:accountId/unread-counts` - Ungelesen-Zähler pro Ordner
- `POST /api/mail/:accountId/send` - Mail senden (multipart/form-data)
- `POST /api/mail/:accountId/draft` - Entwurf im IMAP-Drafts-Ordner speichern
- `POST /api/mail/:accountId/move` - Verschieben (Antwort sofort, IMAP im Hintergrund)
- `POST /api/mail/:accountId/delete` - In den Papierkorb (Antwort sofort, IMAP im Hintergrund)
- `POST /api/mail/:accountId/archive` - Archivieren (Antwort sofort, IMAP im Hintergrund)
- `POST /api/mail/:accountId/flags` - Flags setzen/entfernen (`\Seen`, `\Flagged`)
- `GET /api/mail/search` - Suche im Cache (`q`, `accountId`, `folder`, `from`, `hasAttachments`, `since`, `before`)
- `GET /api/signatures` - Alle Signaturen
- `POST /api/signatures` - Signatur erstellen
- `PUT /api/signatures/:id` - Signatur bearbeiten
- `DELETE /api/signatures/:id` - Signatur löschen
- `POST /api/signatures/upload-image` - Signatur-Bild hochladen
- `GET /api/signatures/images/:filename` - Signatur-Bild abrufen
- `GET /api/prototype/messages` — Unified Inbox aus `mail_cache` (INBOX). `?sync=1` zieht zuerst die letzten IMAP-Nachrichten nach, dann antwortet der Cache.
- `POST /api/prototype/refresh` — IMAP-Pull, Header-Backfill und PDF-Anreicherung erzwingen
- `WS /ws` - WebSocket (`new_mail`, `messages_updated`)

## Features

### Geschwindigkeit
- Zwei IMAP-Verbindungen pro Account (`backend/src/imap-pool.js`): eine für IDLE, eine für Abruf/Aktionen
- SQLite-Cache liefert die Liste sofort, IMAP aktualisiert im Hintergrund
- Mail öffnen: Kopfzeile und Snippet sofort, Body aus Cache oder nur die Text-/HTML-MIME-Teile (kein vollständiger RFC822-Download)
- Gelesen-Flag (`\Seen`) wird im Hintergrund gesetzt, ohne das Öffnen zu blockieren
- Löschen, Archivieren und Verschieben entfernen die Mail sofort in der UI; IMAP läuft danach
- Solange die IMAP-Aktion läuft, schreibt der Cache die Mail nicht erneut in die Liste

### Toolbar
- Links: Seitenleiste ein/aus, **Neue E-Mail**
- Mitte: Archivieren, Löschen, Verschieben, Antworten, Allen antworten, Weiterleiten, Markieren, Gelesen-Status
- Rechts: Suche, Command-Palette, Aktualisieren, Account-Avatar

### Navigation
- Bei mehreren Accounts: **Alle Eingänge** oben in der Sidebar (wie Apple Mail)
- Jedes Postfach ist in der Sidebar ausklappbar und zeigt die eigenen Ordner
- Accounts nachträglich bearbeitbar: Name, Server, Passwort, Farbe
- Account-Farbe in den Einstellungen wählbar (Punkte in der Sidebar und Liste)
- Einstellungen und Theme am unteren Rand der Sidebar
- Ungelesen-Zähler als Badge an Ordnern, Accounts und Alle Eingänge
- Account-Farbe in den Einstellungen wählbar (Punkte in der Sidebar und Liste)
- Command-Palette mit Cmd/Ctrl+K
- Dark Mode (System / Hell / Dunkel)

### Mail-Aktionen
- Konversations-Threading über Message-ID / In-Reply-To / References, plus Betreff bei Antworten (Re:, AW:, Odp. …)
- Ein/aus unter Einstellungen → Darstellung → Konversationen
- Allen antworten, Weiterleiten, Archivieren, Favorit, als ungelesen markieren
- Löschen sucht den Papierkorb über IMAP Special-Use (`\Trash`) inkl. Papierkorb / INBOX.Trash
- Mehrfachauswahl: Cmd/Ctrl-Klick und Shift-Klick, Schnellaktionen beim Hover
- Nachladen beim Scrollen
- Entwürfe: Button oder automatisch beim Schließen des Editors, wenn Inhalt vorhanden ist

### Suche
- Alle Ordner und optional alle Accounts
- Filter: Absender, Anhang, Zeitraum, Ordner

### Tastatur
- `N`/`C` neue Mail, `R` antworten, `A` allen antworten, `F` weiterleiten
- `E` archivieren, `#`/`Backspace` löschen, `L` markieren, `U` gelesen umschalten
- `J`/`K` bzw. Pfeile navigieren, `/` Suche, `.` aktualisieren, `⌘K` Palette, `Esc` schließen

### Darstellung
- Vorschaufenster rechts oder unten (verschiebbar)
- Einzelklick zeigt rechts nur eine Vorschau; Doppelklick öffnet die Mail in einem eigenen Fenster
- Mail-Header mit Avatar, Absenderkarte und Antwort-Pills (Vorschau und Vollansicht)
- Kompakte oder komfortable Listenansicht
- Schriftart und -größe für das Verfassen
- Logo und Favicon unter `frontend/public/`

### MIME / Anzeige
- HTML- und Textteile werden inkl. Base64 und Quoted-Printable dekodiert
- Alte Cache-Einträge mit Roh-Encoding werden beim Öffnen und in der Liste repariert

### Mobile
- Ab 860px Breite: eigene Smartphone-Ansicht
- Ordner als Schublade, Liste und Nachricht jeweils vollflächig
- Zurück-Button beim Lesen, runder Button unten rechts zum Verfassen
- Compose und Einstellungen als Vollbild
- Wischgesten in der Liste: nach links löschen, nach rechts archivieren

### Automatischer Abruf
- IMAP IDLE auf dem Posteingang, neue Mails kommen per WebSocket in die UI
- Zusätzliche Prüfung alle 60 Sekunden, falls IDLE eine Änderung verpasst
- Verbindung wird nach Verbindungsabbruch automatisch neu aufgebaut

### Signatur-Bilder
- Upload über den Signatur-Editor
- Bildbreite (`style="width: …px"`) wird gespeichert und beim erneuten Öffnen wiederhergestellt
- Speicherung unter `backend/uploads/signatures/` auf dem Host
- Bind-Mount in Docker: `./backend/uploads:/app/uploads` — bleibt bei Container-Neustart und Image-Rebuild erhalten
- Beim Versand als CID-Inline-Attachments eingebettet

## Prototyp „Pulse Mail 2026"

Klickbarer Design-Prototyp neben der bestehenden App. Die Logik (`classify.ts`, `extract.ts`) läuft im Frontend; Live-Daten kommen aus dem SQLite-Cache (`GET /api/prototype/messages`), nicht aus den Fixtures, sobald das Backend erreichbar ist.

### Erreichbarkeit
- Produktion: `http://<host>:8080/prototype.html`
- Dev: `http://localhost:5173/prototype.html`
- Bestehende App unter `/` bleibt unverändert. Vite ist auf Multi-Entry (`main`, `prototype`) konfiguriert, nginx bedient `prototype.html` über `try_files` ohne zusätzliche Regel.

### Live-Sync
- IMAP IDLE und die 60-Sekunden-Prüfung schreiben neue INBOX-Mails direkt in `mail_cache` (nicht nur WebSocket-Ping).
- Die UI lädt mit `?sync=1`, pollt alle 20 Sekunden und reagiert auf `new_mail` / `messages_updated`.
- Fixtures bleiben als Fallback, wenn der Cache leer oder das Backend down ist.

### Konzept: drei Linsen statt Ordnerbaum
- **Direkt** — persönlich adressierte Konversationen, Threads mit proportionaler Zeit-Timeline
- **Feed** — Newsletter und Broadcasts, nach Absender gruppiert, mit Frequenz, benannten geblockten Trackern und One-Click-Abmeldung
- **Sachen** — Entitäten aus Mails: Pakete (auch ohne Tracking-Nummer, aus „Sendung unterwegs“), Abos, Termine (ICS oder Datumsangaben im Text), Bestellungen, Rechnungen und Mahnungen (Betrag auch bei `€ 12,00`-Schreibweise), OTP-Codes zum Kopieren

### Kern-Features
- **Reader** zeigt die HTML-Mail wie Apple Mail (Tracker bleiben geblockt, Chip zum Einblenden). Nur ohne HTML fällt er auf den Klartext zurück. Kein Umschalter Lesbar/Original.
- **Zwei-Spalten-Layout** beim Lesen: Liste links, Nachricht rechts. Kein Spine-Kollaps. In der Sachen-Linse bleibt der Reader ein Overlay.
- **Trust-Chip** aus `Authentication-Results` (SPF/DKIM/DMARC/Alignment), Warnung bei Lookalike-Domains und Anzeigename-Spoofing
- **Triage-Modus** — bildschirmfüllend, `←` Archiv / `→` Behalten / `↑` Später / `⌘Z` Undo
- **Scrubber** — Sparkline der Mail-Dichte pro Woche am Listenrand
- **Design-System** in `src/prototype/styles/tokens.css`: oklch-Farben (Akzent in einer Zeile umfärbbar), Spacing-/Radius-/Typo-Skalen, Absenderfarbe aus Domain-Hash bei fixer Helligkeit/Chroma

### Tastatur
- `1` `2` `3` Linsen · `T` Triage · `D` Theme · `Esc` Reader schliessen

### Dateistruktur
```
frontend/prototype.html
frontend/src/prototype/
├── main.tsx                 Entry
├── Prototype.tsx            Shell, Lens-Switch, Keyboard
├── data/
│   ├── types.ts             RawMessage-Typ
│   └── fixtures.ts          ~40 Nachrichten mit echten Rohheadern
├── logic/
│   ├── classify.ts          Klassifikator (Lane/Category), Trust, Spoofing
│   ├── extract.ts           JSON-LD/ICS/Regex-Extraktoren, Tracker-Detektion
│   └── util.ts              Frequenz, Dichte, Datums-/Money-Formatierung
├── views/
│   ├── MessageRow.tsx
│   ├── PeopleLens.tsx       Threads mit Zeit-Timeline
│   ├── FeedLens.tsx         Absender-Gruppen mit Frequenz
│   ├── ThingsLens.tsx       Entitäten-Karten
│   ├── Reader.tsx           HTML-Mail, Trust, Tracker, Anhänge
│   ├── TriageMode.tsx       Vollbild-Karten mit Undo
│   └── Scrubber.tsx         Dichte-Sparkline
└── styles/
    ├── tokens.css
    └── prototype.css
```

### Portierungspfad in die Produktions-App
`classify.ts` und `extract.ts` sind reine Funktionen ohne DOM- oder Framework-Abhängigkeiten. Für einen späteren Backend-Umzug:

- Dateien nach `backend/src/logic/` verschieben, `type RawMessage` gegen `mail_cache`-Row mappen
- Klassifikations-Ergebnis pro Mail bei Upsert speichern (neue Spalten `lane`, `category`, `is_bulk`, `trust_overall`)
- Neuer Index `idx_mail_lane` auf `(account_id, lane, date DESC)` für die Menschen/Feed-Trennung im Listen-Endpoint
- Extrahierte Entitäten in separate Tabellen (`parcels`, `subscriptions`, `events`, `otp_codes`, `invoices`) mit Foreign Key auf `mail_cache.id`
