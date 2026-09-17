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
