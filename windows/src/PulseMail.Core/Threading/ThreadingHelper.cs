using System.Text.RegularExpressions;
using PulseMail.Core.Models;

namespace PulseMail.Core.Threading;

public static partial class ThreadingHelper
{
    [GeneratedRegex(@"<[^>]+@[^>]+>", RegexOptions.Compiled)]
    private static partial Regex MessageIdRegex();

    [GeneratedRegex(@"^(re|aw|wg|fwd|fw|odp|sv|enc|rv|antw|antwort|tr|rif)\.?\s*(\[\d+\])?\s*:\s*",
        RegexOptions.IgnoreCase | RegexOptions.Compiled)]
    private static partial Regex ReplyPrefixRegex();

    /// <summary>
    /// Extract real message-ids. Prefer &lt;id@host&gt;; a lone unbracketed id@host is
    /// accepted only when the whole header is that token (newsletter junk rejected).
    /// </summary>
    public static List<string> ExtractMessageIds(string? header)
    {
        if (string.IsNullOrWhiteSpace(header)) return new();
        var bracketed = MessageIdRegex().Matches(header)
            .Select(m => NormalizeId(m.Value))
            .Where(id => id.Length > 0)
            .Distinct()
            .ToList();
        if (bracketed.Count > 0) return bracketed;

        var trimmed = header.Trim();
        if (Regex.IsMatch(trimmed, @"^\S+@\S+$"))
        {
            var id = NormalizeId(trimmed);
            if (id.Contains('@')) return new List<string> { id };
        }
        return new();
    }

    public static string NormalizeId(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return "";
        return value.Trim().Trim('<', '>').ToLowerInvariant();
    }

    public static string NormalizeSubject(string? subject)
    {
        if (string.IsNullOrWhiteSpace(subject)) return "";
        var s = Regex.Replace(subject.Trim(), @"\s+", " ");
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
            return ids[0];

        var self = ExtractMessageIds(messageId);
        if (self.Count > 0)
            return self[0];

        var norm = NormalizeSubject(subject);
        if (string.IsNullOrEmpty(norm))
            return string.IsNullOrWhiteSpace(messageId) ? Guid.NewGuid().ToString("N") : NormalizeId(messageId);

        var looksLikeReply = !string.Equals(norm, subject?.Trim().ToLowerInvariant(), StringComparison.Ordinal);
        if (looksLikeReply)
            return $"subj:{norm}";

        return messageId is not null && messageId.Contains('@')
            ? NormalizeId(messageId)
            : $"solo:{fromAddress}:{norm}:{Guid.NewGuid():N}";
    }

    /// <summary>
    /// Union-Find threading matching backend/src/threading.js — merges by
    /// Message-ID / In-Reply-To / References, then subject fallback for replies.
    /// Mutates <see cref="CachedMessage.ThreadId"/> on each message.
    /// </summary>
    public static List<CachedMessage> AssignThreadIds(IReadOnlyList<CachedMessage> messages)
    {
        var uf = new UnionFind();

        string SelfKey(CachedMessage msg)
        {
            var id = ExtractMessageIds(msg.MessageId).FirstOrDefault();
            if (!string.IsNullOrEmpty(id)) return id!;
            return $"uid-{msg.AccountId}-{msg.Folder}-{msg.Uid}";
        }

        bool HasReplyCue(CachedMessage msg)
        {
            if (ReplyPrefixRegex().IsMatch((msg.Subject ?? "").Trim())) return true;
            if (ExtractMessageIds(msg.InReplyTo).Count > 0) return true;
            if (ExtractMessageIds(msg.ReferencesHeader).Count > 0) return true;
            return false;
        }

        foreach (var msg in messages)
        {
            var self = SelfKey(msg);
            uf.Find(self);
            foreach (var link in ExtractMessageIds(msg.InReplyTo)
                         .Concat(ExtractMessageIds(msg.ReferencesHeader)))
                uf.Union(self, link);
        }

        var bySubject = new Dictionary<string, List<CachedMessage>>();
        foreach (var msg in messages)
        {
            var subject = NormalizeSubject(msg.Subject);
            if (subject.Length < 5) continue;
            var bucket = $"{msg.AccountId}::{msg.Folder}::{subject}";
            if (!bySubject.TryGetValue(bucket, out var list))
                bySubject[bucket] = list = new List<CachedMessage>();
            list.Add(msg);
        }

        foreach (var group in bySubject.Values)
        {
            if (group.Count < 2) continue;
            if (!group.Any(HasReplyCue)) continue;
            var root = SelfKey(group[0]);
            for (var i = 1; i < group.Count; i++)
                uf.Union(root, SelfKey(group[i]));
        }

        foreach (var msg in messages)
            msg.ThreadId = uf.Find(SelfKey(msg));

        return messages.ToList();
    }

    private sealed class UnionFind
    {
        private readonly Dictionary<string, string> _parent = new();

        public string Find(string key)
        {
            if (!_parent.ContainsKey(key))
            {
                _parent[key] = key;
                return key;
            }

            var root = key;
            while (_parent[root] != root) root = _parent[root];

            var cursor = key;
            while (_parent[cursor] != root)
            {
                var next = _parent[cursor];
                _parent[cursor] = root;
                cursor = next;
            }
            return root;
        }

        public void Union(string a, string b)
        {
            if (string.IsNullOrEmpty(a) || string.IsNullOrEmpty(b)) return;
            var ra = Find(a);
            var rb = Find(b);
            if (ra != rb) _parent[ra] = rb;
        }
    }
}
