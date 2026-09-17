namespace PulseMail.Core.Security;

/// <summary>
/// Abstraction over Windows Credential Manager. The App layer provides the
/// real implementation; Core stays free of Win32 dependencies for tests.
/// </summary>
public interface ICredentialStore
{
    void Save(string target, string username, string secret);
    string? Load(string target);
    void Delete(string target);
}

/// <summary>
/// In-memory store for unit tests and non-Windows development hosts.
/// </summary>
public sealed class InMemoryCredentialStore : ICredentialStore
{
    private readonly Dictionary<string, (string User, string Secret)> _store = new(StringComparer.OrdinalIgnoreCase);

    public void Save(string target, string username, string secret) =>
        _store[target] = (username, secret);

    public string? Load(string target) =>
        _store.TryGetValue(target, out var v) ? v.Secret : null;

    public void Delete(string target) => _store.Remove(target);
}
