using Meziantou.Framework.Win32;
using PulseMail.Core.Security;

namespace PulseMail.App.Services;

public sealed class WindowsCredentialStore : ICredentialStore
{
    public void Save(string target, string username, string secret)
    {
        CredentialManager.WriteCredential(
            applicationName: target,
            userName: username,
            secret: secret,
            persistence: CredentialPersistence.LocalMachine);
    }

    public string? Load(string target)
    {
        try
        {
            var cred = CredentialManager.ReadCredential(target);
            return cred?.Password;
        }
        catch
        {
            return null;
        }
    }

    public void Delete(string target)
    {
        try { CredentialManager.DeleteCredential(target); }
        catch { /* already gone */ }
    }
}

/// <summary>
/// Tries Windows Credential Manager, falls back to DPAPI files transparently.
/// </summary>
public sealed class HybridCredentialStore : ICredentialStore
{
    private readonly WindowsCredentialStore _win = new();
    private readonly FileCredentialStore _file = new();

    public void Save(string target, string username, string secret)
    {
        try { _win.Save(target, username, secret); }
        catch { _file.Save(target, username, secret); return; }
        // Also mirror to file as backup
        try { _file.Save(target, username, secret); } catch { }
    }

    public string? Load(string target) =>
        _win.Load(target) ?? _file.Load(target);

    public void Delete(string target)
    {
        _win.Delete(target);
        _file.Delete(target);
    }
}
