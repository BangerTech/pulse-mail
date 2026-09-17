using PulseMail.Core.Models;
using PulseMail.Core.Threading;
using Xunit;

namespace PulseMail.Core.Tests;

public class ThreadingHelperTests
{
    [Fact]
    public void ExtractMessageIds_OnlyAngleBracketIds()
    {
        var header = "something without brackets id@newsletter.example and <real@host.example>";
        var ids = ThreadingHelper.ExtractMessageIds(header);
        Assert.Single(ids);
        Assert.Equal("real@host.example", ids[0]);
    }

    [Fact]
    public void NormalizeSubject_StripsReplyPrefixes()
    {
        Assert.Equal("hello", ThreadingHelper.NormalizeSubject("Re: AW: Hello"));
        Assert.Equal("invoice", ThreadingHelper.NormalizeSubject("Fwd: Invoice"));
    }

    [Fact]
    public void ComputeThreadId_UsesReferencesRoot()
    {
        var tid = ThreadingHelper.ComputeThreadId(
            "<c@x>",
            "<b@x>",
            "<a@x> <b@x>",
            "Re: Hi",
            "me@x");
        Assert.Equal("a@x", tid);
    }

    [Fact]
    public void AssignThreadIds_GroupsSameSubjectAndFrom()
    {
        var msgs = new List<CachedMessage>
        {
            new() { AccountId = 1, Folder = "INBOX", Uid = 1, MessageId = "<1@x>", Subject = "Miles Angebot", FromAddress = "miles@lh.com", Date = DateTime.UtcNow.AddHours(-2) },
            new() { AccountId = 1, Folder = "INBOX", Uid = 2, MessageId = "<2@x>", Subject = "Miles Angebot", FromAddress = "miles@lh.com", Date = DateTime.UtcNow.AddHours(-1) },
            new() { AccountId = 1, Folder = "INBOX", Uid = 3, MessageId = "<3@x>", Subject = "Andere Mail", FromAddress = "miles@lh.com", Date = DateTime.UtcNow },
        };
        ThreadingHelper.AssignThreadIds(msgs);
        Assert.Equal(msgs[0].ThreadId, msgs[1].ThreadId);
        Assert.NotEqual(msgs[0].ThreadId, msgs[2].ThreadId);
    }
}
