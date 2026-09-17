using System.Net.Http;
using Windows.UI;

namespace PulseMail.App.Helpers;

/// <summary>
/// Favicon for company senders (Google sz=64). Private mail hosts stay on initials.
/// Matches frontend/src/shared/senderIcon.ts + SenderAvatar.tsx.
/// </summary>
public static class SenderAvatar
{
    private static readonly HashSet<string> PrivateHosts = new(StringComparer.OrdinalIgnoreCase)
    {
        "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com",
        "icloud.com", "me.com", "mac.com", "yahoo.com", "yahoo.de",
        "gmx.de", "gmx.net", "gmx.at", "web.de", "t-online.de", "freenet.de", "mail.de",
        "proton.me", "protonmail.com", "mailbox.org", "posteo.de", "aol.com"
    };

    private static readonly string[] Colors =
    {
        "#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#007AFF", "#5856D6", "#AF52DE", "#FF2D55"
    };

    private static readonly HttpClient Http = new() { Timeout = TimeSpan.FromSeconds(5) };
    private static readonly Dictionary<string, byte[]?> Cache = new(StringComparer.OrdinalIgnoreCase);

    public static string ColorHex(string? emailOrName)
    {
        var key = emailOrName ?? "";
        if (key.Length == 0) return "#8E8E93";
        var hash = 0;
        foreach (var c in key) hash = c + ((hash << 5) - hash);
        return Colors[Math.Abs(hash) % Colors.Length];
    }

    public static Color Color(string? emailOrName)
    {
        var hex = ColorHex(emailOrName).TrimStart('#');
        var value = Convert.ToUInt32(hex, 16);
        return Windows.UI.Color.FromArgb(0xFF,
            (byte)((value >> 16) & 0xFF),
            (byte)((value >> 8) & 0xFF),
            (byte)(value & 0xFF));
    }

    public static bool IsPrivate(string? email)
    {
        var host = email?.Split('@').LastOrDefault()?.Trim().ToLowerInvariant();
        return string.IsNullOrEmpty(host) || PrivateHosts.Contains(host) ||
               PrivateHosts.Any(p => host.EndsWith("." + p, StringComparison.OrdinalIgnoreCase));
    }

    public static async Task<byte[]?> GetFaviconAsync(string? email, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(email) || IsPrivate(email)) return null;
        var host = email.Split('@').Last().Trim().ToLowerInvariant();
        if (Cache.TryGetValue(host, out var cached)) return cached;

        var hosts = new List<string> { host };
        var parts = host.Split('.', StringSplitOptions.RemoveEmptyEntries);
        if (parts.Length > 2) hosts.Add(string.Join('.', parts[^2], parts[^1]));

        foreach (var h in hosts)
        {
            if (PrivateHosts.Contains(h)) continue;
            try
            {
                var url = $"https://www.google.com/s2/favicons?domain={Uri.EscapeDataString(h)}&sz=64";
                var bytes = await Http.GetByteArrayAsync(url, ct);
                // Reject tiny globe placeholders (~16×16)
                if (bytes.Length < 200) continue;
                Cache[host] = bytes;
                return bytes;
            }
            catch { }
        }

        Cache[host] = null;
        return null;
    }
}
