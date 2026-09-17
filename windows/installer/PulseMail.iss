; Pulse Mail Native — Inno Setup wizard installer
#define MyAppName "Pulse Mail"
#define MyAppVersion "1.0.1"
#define MyAppPublisher "BangerTech"
#define MyAppURL "https://github.com/BangerTech/pulse-mail"
#define MyAppExeName "PulseMail.App.exe"
#define MyAppId "de.bangertech.pulsemail.winui"

[Setup]
AppId={{A7C3E9F1-4B2D-4E8A-9C1F-6D5E8A2B3C4D}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppVerName={#MyAppName} {#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\PulseMail
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
; Output
OutputDir=..\..\artifacts
OutputBaseFilename=PulseMail-Native-{#MyAppVersion}-Setup
SetupIconFile=src\PulseMail.App\Assets\app.ico
UninstallDisplayIcon={app}\{#MyAppExeName}
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
DisableProgramGroupPage=no
InfoBeforeFile=
LicenseFile=
; Show typical wizard pages: welcome, dir, group, ready, install, finish
DisableWelcomePage=no
DisableDirPage=no
DisableFinishedPage=no

[Languages]
Name: "german"; MessagesFile: "compiler:Languages\German.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "quicklaunchicon"; Description: "{cm:CreateQuickLaunchIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked; OnlyBelowVersion: 6.1; Check: not IsAdminInstallMode

[Files]
; Published self-contained app folder from CI
Source: "..\..\artifacts\PulseMail-native\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

[Run]
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent

[UninstallDelete]
Type: filesandordirs; Name: "{localappdata}\PulseMail"
