using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using PulseMail.Core.Models;
using PulseMail.Core.Security;

namespace PulseMail.Core.Mail;

/// <summary>
/// OAuth2 + PKCE for Google and Microsoft. Client IDs come from environment
/// or settings; until configured, password/app-password login remains available.
/// </summary>
public sealed class OAuthTokenProvider : IAuthTokenProvider
{
    private readonly ICredentialStore _creds;
    private readonly Func<string, string?> _settings;

    public OAuthTokenProvider(ICredentialStore creds, Func<string, string?> settings)
    {
        _creds = creds;
        _settings = settings;
    }

    public static bool IsConfigured(Func<string, string?> settings, string provider) =>
        !string.IsNullOrWhiteSpace(settings($"oauth.{provider}.client_id"));

    public async Task<string> GetAccessTokenAsync(Account account, CancellationToken ct = default)
    {
        var refreshKey = account.OAuthRefreshTokenKey ?? AppPaths.OAuthCredentialTarget(account.Id);
        var refresh = _creds.Load(refreshKey)
            ?? throw new InvalidOperationException("OAuth-Refresh-Token fehlt — bitte Konto erneut verbinden.");

        var provider = account.AuthType == "oauth_microsoft" ? "microsoft" : "google";
        var clientId = _settings($"oauth.{provider}.client_id")
            ?? Environment.GetEnvironmentVariable($"PULSE_OAUTH_{provider.ToUpperInvariant()}_CLIENT_ID")
            ?? throw new InvalidOperationException($"OAuth Client-ID für {provider} nicht konfiguriert.");

        var (tokenUrl, scope) = provider == "microsoft"
            ? ("https://login.microsoftonline.com/common/oauth2/v2.0/token",
               "https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send offline_access")
            : ("https://oauth2.googleapis.com/token",
               "https://mail.google.com/");

        using var http = new HttpClient();
        using var content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["client_id"] = clientId,
            ["grant_type"] = "refresh_token",
            ["refresh_token"] = refresh,
            ["scope"] = scope
        });
        using var resp = await http.PostAsync(tokenUrl, content, ct);
        var json = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
            throw new InvalidOperationException($"Token-Refresh fehlgeschlagen: {json}");

        using var doc = JsonDocument.Parse(json);
        var access = doc.RootElement.GetProperty("access_token").GetString()
            ?? throw new InvalidOperationException("Kein access_token");
        if (doc.RootElement.TryGetProperty("refresh_token", out var rt) && rt.GetString() is { } newRefresh)
            _creds.Save(refreshKey, account.Username, newRefresh);
        return access;
    }

    public static PkceSession BeginPkce(string provider, string clientId, string redirectUri)
    {
        var verifier = Base64Url(RandomNumberGenerator.GetBytes(32));
        var challenge = Base64Url(SHA256.HashData(Encoding.ASCII.GetBytes(verifier)));
        var state = Base64Url(RandomNumberGenerator.GetBytes(16));

        string authUrl;
        if (provider == "microsoft")
        {
            var scope = Uri.EscapeDataString("https://outlook.office.com/IMAP.AccessAsUser.All https://outlook.office.com/SMTP.Send offline_access");
            authUrl = $"https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id={Uri.EscapeDataString(clientId)}&response_type=code&redirect_uri={Uri.EscapeDataString(redirectUri)}&response_mode=query&scope={scope}&state={state}&code_challenge={challenge}&code_challenge_method=S256";
        }
        else
        {
            var scope = Uri.EscapeDataString("https://mail.google.com/");
            authUrl = $"https://accounts.google.com/o/oauth2/v2/auth?client_id={Uri.EscapeDataString(clientId)}&response_type=code&redirect_uri={Uri.EscapeDataString(redirectUri)}&scope={scope}&state={state}&code_challenge={challenge}&code_challenge_method=S256&access_type=offline&prompt=consent";
        }

        return new PkceSession(provider, clientId, redirectUri, verifier, state, authUrl);
    }

    public static async Task<(string AccessToken, string RefreshToken, string? Email)> ExchangeCodeAsync(
        PkceSession session, string code, CancellationToken ct = default)
    {
        var tokenUrl = session.Provider == "microsoft"
            ? "https://login.microsoftonline.com/common/oauth2/v2.0/token"
            : "https://oauth2.googleapis.com/token";

        using var http = new HttpClient();
        using var content = new FormUrlEncodedContent(new Dictionary<string, string>
        {
            ["client_id"] = session.ClientId,
            ["code"] = code,
            ["code_verifier"] = session.Verifier,
            ["grant_type"] = "authorization_code",
            ["redirect_uri"] = session.RedirectUri
        });
        using var resp = await http.PostAsync(tokenUrl, content, ct);
        var json = await resp.Content.ReadAsStringAsync(ct);
        if (!resp.IsSuccessStatusCode)
            throw new InvalidOperationException($"Code-Austausch fehlgeschlagen: {json}");

        using var doc = JsonDocument.Parse(json);
        var access = doc.RootElement.GetProperty("access_token").GetString()!;
        var refresh = doc.RootElement.TryGetProperty("refresh_token", out var rt)
            ? rt.GetString() ?? ""
            : "";

        string? email = null;
        try
        {
            // Prefer id_token email claim if present
            if (doc.RootElement.TryGetProperty("id_token", out var idt))
            {
                var parts = idt.GetString()!.Split('.');
                if (parts.Length >= 2)
                {
                    var payload = Encoding.UTF8.GetString(Base64UrlDecode(parts[1]));
                    using var idDoc = JsonDocument.Parse(payload);
                    if (idDoc.RootElement.TryGetProperty("email", out var em))
                        email = em.GetString();
                }
            }
        }
        catch { }

        return (access, refresh, email);
    }

    private static string Base64Url(byte[] data) =>
        Convert.ToBase64String(data).TrimEnd('=').Replace('+', '-').Replace('/', '_');

    private static byte[] Base64UrlDecode(string input)
    {
        var s = input.Replace('-', '+').Replace('_', '/');
        switch (s.Length % 4) { case 2: s += "=="; break; case 3: s += "="; break; }
        return Convert.FromBase64String(s);
    }
}

public sealed record PkceSession(
    string Provider,
    string ClientId,
    string RedirectUri,
    string Verifier,
    string State,
    string AuthorizationUrl);
