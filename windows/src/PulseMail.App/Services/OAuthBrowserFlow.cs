using System.Net;
using System.Text;
using PulseMail.Core;
using PulseMail.Core.Mail;
using PulseMail.Core.Models;
using PulseMail.Core.Services;

namespace PulseMail.App.Services;

/// <summary>
/// Localhost redirect listener for OAuth2 PKCE (http://127.0.0.1:8733/).
/// </summary>
public static class OAuthBrowserFlow
{
    public const string RedirectUri = "http://127.0.0.1:8733/";

    public static async Task ConnectAsync(MailAppService mail, string provider, string clientId, CancellationToken ct = default)
    {
        var session = OAuthTokenProvider.BeginPkce(provider, clientId, RedirectUri);

        using var listener = new HttpListener();
        listener.Prefixes.Add(RedirectUri);
        listener.Start();

        await Windows.System.Launcher.LaunchUriAsync(new Uri(session.AuthorizationUrl));

        var ctxTask = listener.GetContextAsync();
        var completed = await Task.WhenAny(ctxTask, Task.Delay(TimeSpan.FromMinutes(5), ct));
        if (completed != ctxTask)
            throw new TimeoutException("OAuth-Anmeldung abgelaufen.");

        var ctx = await ctxTask;
        var query = ctx.Request.Url?.Query ?? "";
        var qs = System.Web.HttpUtility.ParseQueryString(query);
        // System.Web may not be available — parse manually
        var code = GetQuery(query, "code");
        var state = GetQuery(query, "state");
        var error = GetQuery(query, "error");

        var html = "<html><body><h3>Pulse Mail</h3><p>Du kannst dieses Fenster schließen.</p></body></html>";
        var buf = Encoding.UTF8.GetBytes(html);
        ctx.Response.ContentLength64 = buf.Length;
        ctx.Response.ContentType = "text/html; charset=utf-8";
        await ctx.Response.OutputStream.WriteAsync(buf, ct);
        ctx.Response.Close();
        listener.Stop();

        if (!string.IsNullOrEmpty(error))
            throw new InvalidOperationException($"OAuth-Fehler: {error}");
        if (state != session.State)
            throw new InvalidOperationException("OAuth state mismatch.");
        if (string.IsNullOrEmpty(code))
            throw new InvalidOperationException("Kein Authorization-Code.");

        var (access, refresh, email) = await OAuthTokenProvider.ExchangeCodeAsync(session, code!, ct);
        if (string.IsNullOrEmpty(email))
            email = "user@account";

        var preset = provider == "microsoft"
            ? AccountPresets.All.First(p => p.Name.StartsWith("Outlook"))
            : AccountPresets.All.First(p => p.Name == "Gmail");

        var account = new Account
        {
            Name = email.Split('@')[0],
            Email = email,
            Username = email,
            ImapHost = preset.ImapHost,
            ImapPort = preset.ImapPort,
            SmtpHost = preset.SmtpHost,
            SmtpPort = preset.SmtpPort,
            Color = "#007AFF",
            AuthType = provider == "microsoft" ? "oauth_microsoft" : "oauth_google",
            CredentialKey = "" // set after insert
        };

        // Store a placeholder password credential (unused for oauth) and refresh token
        var id = mail.Db.InsertAccount(account);
        account.Id = id;
        account.CredentialKey = AppPaths.CredentialTarget(id);
        account.OAuthRefreshTokenKey = AppPaths.OAuthCredentialTarget(id);
        mail.Db.UpdateAccount(account);
        mail.Credentials.Save(account.CredentialKey, account.Username, access); // cache last access optionally
        mail.Credentials.Save(account.OAuthRefreshTokenKey, account.Username, refresh);

        await mail.Imap.ListFoldersAsync(id, ct);
        await mail.Imap.FetchRecentAsync(id, "INBOX", 50, ct);
        // Start idle for new account — restart service connections
        await mail.Imap.StopAsync();
        await mail.Imap.StartAsync();
    }

    private static string? GetQuery(string query, string key)
    {
        if (string.IsNullOrEmpty(query)) return null;
        var q = query.TrimStart('?');
        foreach (var part in q.Split('&'))
        {
            var kv = part.Split('=', 2);
            if (kv.Length == 2 && string.Equals(Uri.UnescapeDataString(kv[0]), key, StringComparison.OrdinalIgnoreCase))
                return Uri.UnescapeDataString(kv[1]);
        }
        return null;
    }
}
