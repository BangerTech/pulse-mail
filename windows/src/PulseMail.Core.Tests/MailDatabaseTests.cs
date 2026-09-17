using PulseMail.Core.Data;
using PulseMail.Core.Html;
using PulseMail.Core.Models;
using PulseMail.Core.Security;
using Xunit;

namespace PulseMail.Core.Tests;

public class MailDatabaseTests
{
    [Fact]
    public void AccountRoundtrip_And_Search()
    {
        var path = Path.Combine(Path.GetTempPath(), $"pulse-test-{Guid.NewGuid():N}.db");
        try
        {
            using var db = new MailDatabase(path);
            var id = db.InsertAccount(new Account
            {
                Name = "Test",
                Email = "a@b.de",
                ImapHost = "imap.example",
                SmtpHost = "smtp.example",
                Username = "a@b.de",
                CredentialKey = "test/1"
            });
            Assert.True(id > 0);

            db.UpsertMessage(new CachedMessage
            {
                AccountId = id,
                Folder = "INBOX",
                Uid = 1,
                Subject = "heyOBI Rechnung",
                FromAddress = "shop@obi.de",
                FromName = "OBI",
                Snippet = "Ihre Bestellung",
                BodyText = "mobile payment hello",
                Flags = "[]"
            });

            var hits = db.Search(new SearchQuery { Q = "obi" });
            Assert.NotEmpty(hits);

            var shortHits = db.Search(new SearchQuery { Q = "obi" });
            Assert.Contains(shortHits, m => m.Subject!.Contains("OBI", StringComparison.OrdinalIgnoreCase));
        }
        finally
        {
            try { File.Delete(path); } catch { }
        }
    }

    [Fact]
    public void MailHtmlBuilder_BlocksRemote()
    {
        var html = MailHtmlBuilder.BuildDocument(
            "<img src=\"https://tracker.example/x.png\"/><p>Hi</p>",
            null,
            blockRemote: true,
            darkMode: false);
        Assert.Contains("data-blocked-src=\"https://tracker.example/x.png\"", html);
        // Active src must be emptied; avoid matching the "src=" inside "data-blocked-src="
        Assert.Matches(@"src\s*=\s*""""", html);
        Assert.DoesNotMatch(@"\ssrc\s*=\s*""https://tracker\.example", html);
    }
}

public class CredentialStoreTests
{
    [Fact]
    public void InMemoryStore_Works()
    {
        var store = new InMemoryCredentialStore();
        store.Save("t", "u", "secret");
        Assert.Equal("secret", store.Load("t"));
        store.Delete("t");
        Assert.Null(store.Load("t"));
    }
}
