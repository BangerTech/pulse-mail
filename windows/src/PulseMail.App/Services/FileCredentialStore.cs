using System.Security.Cryptography;
using System.Text;
using PulseMail.Core;
using PulseMail.Core.Security;

namespace PulseMail.App.Services;

/// <summary>
/// DPAPI-protected file vault under LocalAppData — works without Credential Manager.
/// </summary>
public sealed class FileCredentialStore : ICredentialStore
{
    private static string Dir
    {
        get
        {
            var d = Path.Combine(AppPaths.DataRoot, "secrets");
            Directory.CreateDirectory(d);
            return d;
        }
    }

    private static string PathFor(string target)
    {
        var safe = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(target)))[..32];
        return Path.Combine(Dir, safe + ".bin");
    }

    public void Save(string target, string username, string secret)
    {
        var payload = Encoding.UTF8.GetBytes(username + "\n" + secret);
        var protectedBytes = ProtectedData.Protect(payload, null, DataProtectionScope.CurrentUser);
        File.WriteAllBytes(PathFor(target), protectedBytes);
    }

    public string? Load(string target)
    {
        try
        {
            var path = PathFor(target);
            if (!File.Exists(path)) return null;
            var raw = ProtectedData.Unprotect(File.ReadAllBytes(path), null, DataProtectionScope.CurrentUser);
            var text = Encoding.UTF8.GetString(raw);
            var idx = text.IndexOf('\n');
            return idx >= 0 ? text[(idx + 1)..] : text;
        }
        catch { return null; }
    }

    public void Delete(string target)
    {
        try { File.Delete(PathFor(target)); } catch { }
    }
}
