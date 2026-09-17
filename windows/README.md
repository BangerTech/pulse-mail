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

## CI / Installer

GitHub Action **Windows Native App** baut:

| Datei | Nutzen |
|-------|--------|
| `PulseMail-Native-1.0.2-Setup.exe` | **Inno-Setup-Wizard** (Sprache, Zielordner, Startmenü, Desktop-Icon, Starten) |
| `PulseMail-Native-1.0.2-win-x64.zip` | Portable Variante ohne Installation |

Release-Tag: `native-v1.0.2`.

Bei Startproblemen: `%LOCALAPPDATA%\PulseMail\startup.log`

Lokal Installer bauen (nach `dotnet publish` nach `artifacts/PulseMail-native`):

```powershell
# Inno Setup 6 installieren, dann:
& "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe" windows\installer\PulseMail.iss
```

## Erster Start

1. Setup ausführen **oder** ZIP starten
2. Postfach hinzufügen (Gmail / Outlook / Custom IMAP)
2. Gmail: [App-Passwort](https://support.google.com/accounts/answer/185833) **oder** OAuth unter Einstellungen → OAuth (Client-ID)
3. Mails erscheinen im Posteingang; IDLE hält den Abruf live

Daten: `%LOCALAPPDATA%\PulseMail\`  
Passwörter: Windows Credential Manager (`de.bangertech.pulsemail.winui/account/<id>`)

## Design

Farben und Flächen folgen den Tokens der Web-App (`frontend/src/styles/global.css`): Sidebar `#F4F6FB` / Dark `#1C1C1E`, Accent `#007AFF` / Dark `#0A84FF`, Light/Dark/System über Theme-Dictionaries und `T` bzw. Einstellungen → Darstellung. Die Steuerung ist WinUI (kein 1:1-HTML), Layout und Kontraste sollen aber sehr nah an Docker/Desktop wirken.
