namespace PulseMail.Core;

public static class AppPaths
{
    public const string AppId = "de.bangertech.pulsemail.winui";
    public const string ProductName = "Pulse Mail";
    public const string Version = "1.0.6";

    public static string DataRoot
    {
        get
        {
            var root = Path.Combine(
                Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
                "PulseMail");
            Directory.CreateDirectory(root);
            return root;
        }
    }

    public static string DatabasePath => Path.Combine(DataRoot, "mail.db");
    public static string UploadsDir
    {
        get
        {
            var dir = Path.Combine(DataRoot, "uploads");
            Directory.CreateDirectory(dir);
            return dir;
        }
    }

    public static string SignaturesDir
    {
        get
        {
            var dir = Path.Combine(UploadsDir, "signatures");
            Directory.CreateDirectory(dir);
            return dir;
        }
    }

    public static string AttachmentsCacheDir
    {
        get
        {
            var dir = Path.Combine(DataRoot, "attachments");
            Directory.CreateDirectory(dir);
            return dir;
        }
    }

    public static string CredentialTarget(int accountId) =>
        $"{AppId}/account/{accountId}";

    public static string OAuthCredentialTarget(int accountId) =>
        $"{AppId}/oauth/{accountId}";
}
