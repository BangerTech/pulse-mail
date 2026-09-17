using System.Text.RegularExpressions;

namespace PulseMail.Core.Threading;

public static partial class ThreadingHelper
{
    [GeneratedRegex(@"<[^>]+@[^>]+>", RegexOptions.Compiled)]
    private static partial Regex MessageIdRegex();

    [GeneratedRegex(@"^(re|aw|wg|fwd|fw|odp|sv|antw|antwort)\s*:\s*", RegexOptions.IgnoreCase | RegexOptions.Compiled)]
    private static partial Regex ReplyPrefixRegex();

    /// <summary>
    /// Extract only real &lt;id@host&gt; message-ids. Newsletter References without
    /// angle brackets must not create false threads (heyOBI case).
    /// </summary>
    public static List<string> ExtractMessageIds(string? header)
    {
        if (string.IsNullOrWhiteSpace(header)) return new();
        return MessageIdRegex().Matches(header)
            .Select(m => m.Value.Trim().ToLowerInvariant())
            .Distinct()
            .ToList();
    }

    public static string NormalizeSubject(string? subject)
    {
        if (string.IsNullOrWhiteSpace(subject)) return "";
        var s = subject.Trim();
        while (true)
        {
            var next = ReplyPrefixRegex().Replace(s, "");
            if (next == s) break;
            s = next.Trim();
        }
        return s.ToLowerInvariant();
    }

    public static string ComputeThreadId(
        string? messageId,
        string? inReplyTo,
        string? references,
        string? subject,
        string? fromAddress)
    {
        var ids = ExtractMessageIds(references);
        ids.AddRange(ExtractMessageIds(inReplyTo));
        if (ids.Count > 0)
            return ids[0]; // root of the chain

        if (!string.IsNullOrWhiteSpace(messageId) && ExtractMessageIds(messageId).Count > 0)
            return ExtractMessageIds(messageId)[0];

        // Fallback: normalized subject + from domain for reply-looking subjects
        var norm = NormalizeSubject(subject);
        if (string.IsNullOrEmpty(norm))
            return messageId ?? Guid.NewGuid().ToString("N");

        var looksLikeReply = !string.Equals(norm, subject?.Trim().ToLowerInvariant(), StringComparison.Ordinal);
        if (looksLikeReply)
            return $"subj:{norm}";

        return messageId is not null && messageId.Contains('@')
            ? messageId.Trim().ToLowerInvariant()
            : $"solo:{fromAddress}:{norm}:{Guid.NewGuid():N}";
    }
}
