using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PulseMail.Core;
using PulseMail.Core.Models;
using PulseMail.Core.Services;
using System.Collections.ObjectModel;

namespace PulseMail.App.ViewModels;

public partial class SettingsViewModel : ObservableObject
{
    private readonly MailAppService _mail;

    public SettingsViewModel(MailAppService mail)
    {
        _mail = mail;
        Reload();
    }

    public ObservableCollection<Account> Accounts { get; } = new();
    public ObservableCollection<Signature> Signatures { get; } = new();

    [ObservableProperty] private string selectedTab = "accounts";
    [ObservableProperty] private string theme = "system";
    [ObservableProperty] private string density = "comfortable";
    [ObservableProperty] private bool loadRemoteImages = true;
    [ObservableProperty] private bool notifyDesktop = true;
    [ObservableProperty] private bool notifySound = true;
    [ObservableProperty] private bool notifyWhenFocused;
    [ObservableProperty] private double notifyVolume = 0.7;
    [ObservableProperty] private bool confirmDelete;
    [ObservableProperty] private bool showTabUnread = true;
    [ObservableProperty] private bool conversations = true;
    [ObservableProperty] private string previewPane = "right";
    [ObservableProperty] private string version = AppPaths.Version;
    [ObservableProperty] private string googleClientId = "";
    [ObservableProperty] private string microsoftClientId = "";

    // Account wizard
    [ObservableProperty] private bool wizardOpen;
    [ObservableProperty] private string wizardPreset = "Gmail";
    [ObservableProperty] private string wizardName = "";
    [ObservableProperty] private string wizardEmail = "";
    [ObservableProperty] private string wizardUsername = "";
    [ObservableProperty] private string wizardPassword = "";
    [ObservableProperty] private string wizardImapHost = "imap.gmail.com";
    [ObservableProperty] private int wizardImapPort = 993;
    [ObservableProperty] private string wizardSmtpHost = "smtp.gmail.com";
    [ObservableProperty] private int wizardSmtpPort = 587;
    [ObservableProperty] private string wizardColor = "#007AFF";
    [ObservableProperty] private string? wizardError;
    [ObservableProperty] private bool wizardBusy;

    // Signature editor
    [ObservableProperty] private Signature? editingSignature;
    [ObservableProperty] private string sigName = "";
    [ObservableProperty] private string sigContent = "";
    [ObservableProperty] private bool sigDefault;

    public void Reload()
    {
        Accounts.Clear();
        foreach (var a in _mail.Db.GetAccounts()) Accounts.Add(a);
        Signatures.Clear();
        foreach (var s in _mail.Db.GetSignatures()) Signatures.Add(s);

        Theme = _mail.Db.GetSetting("theme") ?? "system";
        Density = _mail.Db.GetSetting("density") ?? "comfortable";
        LoadRemoteImages = _mail.Db.GetBoolSetting("loadRemoteImages", true);
        NotifyDesktop = _mail.Db.GetBoolSetting("notifyDesktop", true);
        NotifySound = _mail.Db.GetBoolSetting("notifySound", true);
        NotifyWhenFocused = _mail.Db.GetBoolSetting("notifyWhenFocused", false);
        ConfirmDelete = _mail.Db.GetBoolSetting("confirmDelete", false);
        ShowTabUnread = _mail.Db.GetBoolSetting("showTabUnread", true);
        Conversations = _mail.Db.GetBoolSetting("conversations", true);
        PreviewPane = _mail.Db.GetSetting("previewPane") ?? "right";
        if (double.TryParse(_mail.Db.GetSetting("notifyVolume"), out var vol)) NotifyVolume = vol;
        GoogleClientId = _mail.Db.GetSetting("oauth.google.client_id") ?? "";
        MicrosoftClientId = _mail.Db.GetSetting("oauth.microsoft.client_id") ?? "";
    }

    [RelayCommand]
    public void SaveAppearance()
    {
        _mail.Db.SetSetting("theme", Theme);
        _mail.Db.SetSetting("density", Density);
        _mail.Db.SetBoolSetting("loadRemoteImages", LoadRemoteImages);
        _mail.Db.SetBoolSetting("conversations", Conversations);
        _mail.Db.SetSetting("previewPane", PreviewPane);
        _mail.Db.SetBoolSetting("confirmDelete", ConfirmDelete);
        _mail.Db.SetBoolSetting("showTabUnread", ShowTabUnread);
    }

    [RelayCommand]
    public void SaveNotifications()
    {
        _mail.Db.SetBoolSetting("notifyDesktop", NotifyDesktop);
        _mail.Db.SetBoolSetting("notifySound", NotifySound);
        _mail.Db.SetBoolSetting("notifyWhenFocused", NotifyWhenFocused);
        _mail.Db.SetSetting("notifyVolume", NotifyVolume.ToString("0.##"));
    }

    [RelayCommand]
    public void SaveOAuth()
    {
        _mail.Db.SetSetting("oauth.google.client_id", GoogleClientId.Trim());
        _mail.Db.SetSetting("oauth.microsoft.client_id", MicrosoftClientId.Trim());
    }

    [RelayCommand]
    public void OpenWizard()
    {
        WizardOpen = true;
        WizardError = null;
        ApplyPreset("Gmail");
    }

    [RelayCommand]
    public void ApplyPreset(string name)
    {
        WizardPreset = name;
        var preset = AccountPresets.All.FirstOrDefault(p => p.Name == name);
        if (preset.Name is null) return;
        WizardImapHost = preset.ImapHost;
        WizardImapPort = preset.ImapPort;
        WizardSmtpHost = preset.SmtpHost;
        WizardSmtpPort = preset.SmtpPort;
    }

    partial void OnWizardEmailChanged(string value)
    {
        if (string.IsNullOrWhiteSpace(WizardUsername))
            WizardUsername = value;
        if (string.IsNullOrWhiteSpace(WizardName))
            WizardName = value.Split('@')[0];
    }

    [RelayCommand]
    public async Task SaveAccountAsync()
    {
        try
        {
            WizardBusy = true;
            WizardError = null;
            if (string.IsNullOrWhiteSpace(WizardEmail) || string.IsNullOrWhiteSpace(WizardPassword))
                throw new InvalidOperationException("E-Mail und Passwort sind Pflicht.");
            if (string.IsNullOrWhiteSpace(WizardImapHost) || string.IsNullOrWhiteSpace(WizardSmtpHost))
                throw new InvalidOperationException("IMAP- und SMTP-Host sind Pflicht.");

            var account = new Account
            {
                Name = string.IsNullOrWhiteSpace(WizardName) ? WizardEmail : WizardName,
                Email = WizardEmail.Trim(),
                Username = string.IsNullOrWhiteSpace(WizardUsername) ? WizardEmail.Trim() : WizardUsername.Trim(),
                ImapHost = WizardImapHost.Trim(),
                ImapPort = WizardImapPort,
                SmtpHost = WizardSmtpHost.Trim(),
                SmtpPort = WizardSmtpPort,
                Color = WizardColor,
                AuthType = "password"
            };
            await _mail.Imap.AddAccountAndConnectAsync(account, WizardPassword);
            WizardOpen = false;
            WizardPassword = "";
            Reload();
        }
        catch (Exception ex)
        {
            WizardError = ex.Message;
        }
        finally { WizardBusy = false; }
    }

    [RelayCommand]
    public async Task DeleteAccountAsync(Account account)
    {
        _mail.Credentials.Delete(account.CredentialKey);
        if (account.OAuthRefreshTokenKey is not null)
            _mail.Credentials.Delete(account.OAuthRefreshTokenKey);
        _mail.Db.DeleteAccount(account.Id);
        Reload();
        await Task.CompletedTask;
    }

    [RelayCommand]
    public void NewSignature()
    {
        EditingSignature = new Signature();
        SigName = "Neue Signatur";
        SigContent = "";
        SigDefault = false;
    }

    [RelayCommand]
    public void EditSignature(Signature s)
    {
        EditingSignature = s;
        SigName = s.Name;
        SigContent = s.Content;
        SigDefault = s.IsDefault;
    }

    [RelayCommand]
    public void SaveSignature()
    {
        if (EditingSignature is null) return;
        EditingSignature.Name = SigName;
        EditingSignature.Content = SigContent;
        EditingSignature.IsDefault = SigDefault;
        if (EditingSignature.Id == 0)
            EditingSignature.Id = _mail.Db.InsertSignature(EditingSignature);
        else
            _mail.Db.UpdateSignature(EditingSignature);
        EditingSignature = null;
        Reload();
    }

    [RelayCommand]
    public void DeleteSignature(Signature s)
    {
        _mail.Db.DeleteSignature(s.Id);
        Reload();
    }
}
