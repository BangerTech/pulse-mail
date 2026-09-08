# Pulse Mail - Projektdokumentation

## Architektur

- **Frontend:** React 19 + TypeScript + Vite, TipTap Editor, Zustand, `@tanstack/react-virtual`
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

### folder_sync
| Spalte | Typ | Beschreibung |
|--------|-----|-------------|
| account_id | INTEGER | Account |
| folder | TEXT | IMAP-Ordner |
| uid_validity | INTEGER | Zuletzt gesehene UIDVALIDITY des Ordners |
| last_sync_at | DATETIME | Zeitpunkt des letzten Reconcile |

PRIMARY KEY (account_id, folder)

### Migrationen
Neue Spalten werden in `backend/src/db.js` Funktion `migrate()` per `ALTER TABLE` ergänzt:
- `in_reply_to`, `references_header`, `thread_id`, `cc_address`, `reply_to_address`, `attachments_meta`
- Index `idx_mail_thread`, Index `idx_mail_message_id`
- `raw_headers` — Rohheader für den Prototyp-Klassifikator
- `extracted_pdf_text` — Klartext aus Rechnungs-PDFs (Prototyp-Anreicherung)
- Tabelle `folder_sync` — merkt sich `uid_validity` pro Ordner für den Reconcile

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
- **Virtualisierte Listen** mit `@tanstack/react-virtual` und dynamischer Höhenmessung in `MailList.tsx` sowie in den Prototyp-Linsen Direkt/Feed. Nachladen koppelt an den sichtbaren Range, nicht an `scrollHeight`.
- **Granulare Zustandswahl:** Komponenten abonnieren einzelne Felder über `useStore(s => s.x)` bzw. `useShallow`. Der HTML-Body liegt in `messageBody`, nicht in `selectedMessage`, damit das Öffnen einer Mail nicht die Liste neu rendert.
- `React.memo` auf `MailRow`, `Sidebar`, `Toolbar`, `MailContent`.
- Optimistisches Ausblenden nach Löschen/Archivieren bleibt in Zustand `hiddenKeys` (geteilt zwischen App, Liste und WebSocket-Reload). `useOptimistic` ist komponentenlokal und würde hier desynchronisieren.

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
- **Kein doppeltes Transfer-Dekodieren:** ImapFlows `client.download()` löst Base64/Quoted-Printable bereits selbst auf. `loadPart` wendet auf diesen Puffer deshalb nur noch den Zeichensatz an. Nur der Fallback über `fetchOne({ bodyParts })` liefert den Teil roh und braucht die Kodierung.
- Dekodierung versucht bei kaputtem UTF-8 automatisch `windows-1252` / `iso-8859-1` (die Variante mit dem geringsten Anteil an Steuer-/Replacement-Zeichen gewinnt)
- `repairEncodedText` übernimmt eine „Reparatur" nur, wenn das Ergebnis sauberer ist als die Eingabe — verhindert, dass ein Fehlalarm von `looksLikeBase64` einen intakten Body in Binärmüll verwandelt
- `db.js` leert beim Start Bodies, die als Binärmüll im Cache liegen (`dropCorruptBodies`); sie werden beim nächsten Öffnen sauber nachgeladen
- Gemeinsamer Mail-Renderer unter `frontend/src/shared/mail-html.ts` und `useMailFrame.ts`: baut ein sauberes HTML5-Dokument, löst `cid:`-Inline-Bilder auf, überschreibt Farben im Dark Mode nur bei Mails ohne eigenen Hintergrund, misst per Same-Origin-Sandbox die Höhe und skaliert breite Newsletter proportional herunter. Genutzt von `MailContent.tsx` und dem Prototyp `Reader.tsx`.
- **Höhenmessung immer über `body.scrollHeight`, nie über `documentElement.scrollHeight`.** Letzteres ist mindestens so hoch wie das iframe-Viewport; damit fließt die gesetzte Höhe in die nächste Messung zurück und die Mail wächst endlos. Dazu gehören: `html, body { height: auto !important }` im injizierten CSS, ein Epsilon von 2px vor dem Schreiben, ein Flag gegen selbst ausgelöste ResizeObserver-Callbacks und ein Pass-Limit.
- Plain-Text-Mails werden über `frontend/src/shared/plain-text.ts` gerendert: `format=flowed` wird nach RFC 3676 entpackt, URLs/E-Mails verlinkt, `>`-Zitatebenen als geschachtelte `<blockquote>` gestylt
- **Externe Bilder standardmäßig blockiert.** `buildMailDocument({ blockRemote: true })` nimmt `src`/`srcset`/`url()` für http(s) heraus (Original in `data-blocked-src`), `cid:` und `data:` bleiben. Beide Reader zeigen `RemoteImagesBar` („Laden“ einmal, oder Absenderdomain dauerhaft erlauben). Allowlist in `localStorage` unter `pulse:imageAllowlist:v1`, geteilt zwischen App und Prototyp.

### Barrierefreiheit
- `useFocusTrap` (`frontend/src/shared/useFocusTrap.ts`) auf Compose, Einstellungen, Befehlspalette, Vollbild-Reader, Prototyp-Reader und Triage. Tab zyklisch, Escape schließt, Fokus kehrt zurück.
- `:focus-visible`-Ring über `--focus-ring` in `global.css` und den Prototyp-Tokens. Globales `outline: none` auf Eingabefeldern ist weg.
- Listenzeilen, Suchtreffer, Feed-Gruppenköpfe und Sachen-Karten reagieren auf Enter/Leertaste. Icon-Buttons haben `aria-label`.
- `prefers-reduced-motion` in Produktions-App und Prototyp.

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

### Zwei-Wege-Abgleich (`backend/src/sync.js`)
- `reconcileFolder` fetcht `1:*` mit `{ uid, flags }` und gleicht damit sowohl Löschungen als auch Flag-Änderungen ab, die in anderen Clients (z. B. Apple Mail) passiert sind
- Ausgelöst durch IDLE-Events `expunge` / `flags`, durch `pollInboxes` bei sinkendem Zähler, bei jedem List-Fetch mit `offset === 0`, und zusätzlich alle 5 Minuten als Sicherheitsnetz
- Lokale Löschungen bleiben über `pendingDeletes` (`backend/src/pending.js`) aus dem Reconcile ausgeklammert, damit die Mail nicht doppelt gelöscht wird, während die IMAP-Aktion noch läuft
- Bei geänderter `UIDVALIDITY` wird der Cache des Ordners geleert und neu aufgebaut

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
- **Triage-Modus** — bildschirmfüllend, `←` Archiv / `→` Behalten / `↑` Später / `⌘Z` Undo. Archiv und Behalten schreiben über `POST /api/mail/:accountId/archive` bzw. `flags` (`\Seen`) ins Backend (`frontend/src/prototype/data/actions.ts`).
- **Scrubber** — Sparkline der Mail-Dichte pro Woche am Listenrand; Klick springt zur ersten Zeile dieser Woche (`data-week`).
- **Reader** setzt `\Seen` beim Öffnen und blockiert externe Bilder analog zur Produktions-App.
- **Design-System** in `src/prototype/styles/tokens.css`: oklch-Farben (Akzent in einer Zeile umfärbbar), Spacing-/Radius-/Typo-Skalen, Absenderfarbe aus Domain-Hash bei fixer Helligkeit/Chroma

### Tastatur
- `1` `2` `3` Linsen (Pfeiltasten im Tablist) · `T` Triage · `D` Theme · `Esc` Reader schliessen

### Dateistruktur
```
frontend/prototype.html
frontend/src/prototype/
├── main.tsx                 Entry
├── Prototype.tsx            Shell, Lens-Switch, Keyboard
├── data/
│   ├── types.ts             RawMessage-Typ
│   ├── fixtures.ts          ~40 Nachrichten mit echten Rohheadern
│   └── actions.ts           Archivieren, Löschen, `\Seen` über die Produktions-API
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

frontend/src/shared/               Von App und Prototyp gemeinsam genutzt
├── mail-html.ts                   HTML5-Dokument, cid:, blockRemote
├── useMailFrame.ts                iframe-Höhe (body.scrollHeight)
├── plain-text.ts                  format=flowed, Zitate, Links
├── imageAllowlist.ts              Absenderdomain in localStorage
├── RemoteImagesBar.tsx            „N externe Bilder blockiert"
├── useFocusTrap.ts                Tab-Zyklus, Restore-Fokus
├── keyboard.ts                    Enter/Leertaste
└── shared.css                     Focus-Ring, Remote-Bar, reduced-motion
```

### Portierungspfad in die Produktions-App
`classify.ts` und `extract.ts` sind reine Funktionen ohne DOM- oder Framework-Abhängigkeiten. Für einen späteren Backend-Umzug:

- Dateien nach `backend/src/logic/` verschieben, `type RawMessage` gegen `mail_cache`-Row mappen
- Klassifikations-Ergebnis pro Mail bei Upsert speichern (neue Spalten `lane`, `category`, `is_bulk`, `trust_overall`)
- Neuer Index `idx_mail_lane` auf `(account_id, lane, date DESC)` für die Menschen/Feed-Trennung im Listen-Endpoint
- Extrahierte Entitäten in separate Tabellen (`parcels`, `subscriptions`, `events`, `otp_codes`, `invoices`) mit Foreign Key auf `mail_cache.id`
