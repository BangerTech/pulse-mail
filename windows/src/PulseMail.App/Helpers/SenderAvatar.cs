using System.Net.Http;

namespace PulseMail.App.Helpers;

/// <summary>
/// Favicon for company senders (Google sz=64). Private mail hosts stay on initials.
/// </summary>
public static class SenderAvatar
{
    private static readonly HashSet<string> PrivateHosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
        "icloud.com", "me.com", "mac.com", "yahoo.com", "gmx.de", "gmx.net",
        "web.de", "t-online.de", "mail.de"
    };

    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(5) };
    private static readonly Dictionary<string, byte[]?> Cache = new(StringComparer.OrdinalIgnoreCase);

    public static bool IsPrivate(string? email)
    {
        var host = email?.Split('@').LastOrDefault();
        return string.IsNullOrEmpty(host) || PrivateHosts.Contains(host) ||
               PrivateHosts.Any(p => host.EndsWith("." + p, StringComparison.OrdinalIgnoreCase));
    }

    public static async Task<byte[]?> GetFaviconAsync(string? email, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(email) || IsPrivate(email)) return null;
        var host = email.Split('@').Last();
        if (Cache.TryGetValue(host, out var cached)) return cached;

        try
        {
            var url = $"https://www.google.com/s2/favicons?domain={Uri.EscapeDataString(host)}&sz=64";
            var bytes = await Http.GetByteArrayAsync(url, ct);
            // Reject tiny globe placeholders (~16x16 often < 200 bytes for 16px)
            if (bytes.Length < 200) { Cache[host] = null; return null; }
            Cache[host] = bytes;
            return bytes;
        }
        catch
        {
            Cache[host] = null;
            return null;
        }
    }
}
