using PulseMail.Core.Data;
using PulseMail.Core.Mail;
using PulseMail.Core.Models;
using PulseMail.Core.Security;

namespace PulseMail.Core.Services;

/// <summary>
/// Facade used by the WinUI layer: database, IMAP/SMTP, settings, credentials.
/// </summary>
public sealed class MailAppService : IAsyncDisposable
{
    public MailDatabase Db { get; }
    public ICredentialStore Credentials { get; }
    public ImapMailService Imap { get; }
    public SmtpMailService Smtp { get; }
    public OAuthTokenProvider OAuth { get; }

    public MailAppService(ICredentialStore credentials, string? dbPath = null)
    {
        Credentials = credentials;
        Db = new MailDatabase(dbPath);
        OAuth = new OAuthTokenProvider(credentials, Db.GetSetting);
        Imap = new ImapMailService(Db, credentials, OAuth);
        Smtp = new SmtpMailService(Db, credentials, OAuth);
    }

    public async Task InitializeAsync()
    {
        // defaults
        if (Db.GetSetting("theme") is null) Db.SetSetting("theme", "system");
        if (Db.GetSetting("density") is null) Db.SetSetting("density", "comfortable");
        if (Db.GetSetting("loadRemoteImages") is null) Db.SetBoolSetting("loadRemoteImages", true);
        if (Db.GetSetting("notifyDesktop") is null) Db.SetBoolSetting("notifyDesktop", true);
        if (Db.GetSetting("notifySound") is null) Db.SetBoolSetting("notifySound", true);
        if (Db.GetSetting("conversations") is null) Db.SetBoolSetting("conversations", true);
        if (Db.GetSetting("previewPane") is null) Db.SetSetting("previewPane", "right");

        await Imap.StartAsync();
    }

    public bool HasAccounts => Db.GetAccounts().Count > 0;

    public async ValueTask DisposeAsync()
    {
        await Imap.DisposeAsync();
        Db.Dispose();
    }
}
