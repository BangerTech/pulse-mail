# Pulse Mail Native (WinUI 3)

Eigenständige Windows-App für Kunden — **kein Docker, kein Server, kein Pulse-Login**.

App-ID: `de.bangertech.pulsemail.winui` · Version **1.0.0**

Die Tauri-Hülle unter `../desktop/` bleibt das Produkt „Fenster um deinen Docker-Server“.

## Voraussetzungen (Build)

- Windows 10/11 x64
- [.NET 8 SDK](https://dotnet.microsoft.com/download/dotnet/8.0)
- Windows App SDK (kommt über NuGet)

## Lokal bauen

```powershell
cd windows
dotnet restore PulseMail.sln
dotnet test
dotnet publish src\PulseMail.App\PulseMail.App.csproj -c Release -r win-x64 --self-contained true -p:Platform=x64 -p:WindowsPackageType=None -o ..\artifacts\PulseMail-native
```

Start: `artifacts\PulseMail-native\PulseMail.App.exe`

## CI

GitHub Action **Windows Native App** (`.github/workflows/windows-native.yml`) baut ein ZIP-Release `native-v1.0.0`.

## Erster Start

1. Postfach hinzufügen (Gmail / Outlook / Custom IMAP)
2. Gmail: [App-Passwort](https://support.google.com/accounts/answer/185833) **oder** OAuth unter Einstellungen → OAuth (Client-ID)
3. Mails erscheinen im Posteingang; IDLE hält den Abruf live

Daten: `%LOCALAPPDATA%\PulseMail\`  
Passwörter: Windows Credential Manager (`de.bangertech.pulsemail.winui/account/<id>`)

## Architektur

| Projekt | Rolle |
|---------|--------|
| `PulseMail.Core` | SQLite, MailKit IMAP/SMTP, Threading, Suche, HTML-Builder, OAuth PKCE |
| `PulseMail.App` | WinUI 3 UI, WebView2 (Mail-HTML + Composer), Toasts, Badge |

Siehe `../pulse-mail.md` Abschnitt „Native Windows-App (WinUI)“.
