namespace PulseMail.Core.Models;

public sealed class Account
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Email { get; set; } = "";
    public string ImapHost { get; set; } = "";
    public int ImapPort { get; set; } = 993;
    public string SmtpHost { get; set; } = "";
    public int SmtpPort { get; set; } = 587;
    public string Username { get; set; } = "";
    /// <summary>Credential Manager target key, not the password itself.</summary>
    public string CredentialKey { get; set; } = "";
    public string Color { get; set; } = "#007AFF";
    public string? AuthType { get; set; } = "password"; // password | oauth_google | oauth_microsoft
    public string? OAuthRefreshTokenKey { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class MailAddress
{
    public string Name { get; set; } = "";
    public string Address { get; set; } = "";

    public override string ToString() =>
        string.IsNullOrWhiteSpace(Name) ? Address : $"{Name} <{Address}>";
}

public sealed class AttachmentMeta
{
    public string Filename { get; set; } = "";
    public string ContentType { get; set; } = "application/octet-stream";
    public long Size { get; set; }
    public string? ContentId { get; set; }
    public bool IsInline { get; set; }
}

public sealed class CachedMessage
{
    public int Id { get; set; }
    public int AccountId { get; set; }
    public string Folder { get; set; } = "INBOX";
    public uint Uid { get; set; }
    public string? MessageId { get; set; }
    public string? Subject { get; set; }
    public string? FromAddress { get; set; }
    public string? FromName { get; set; }
    public string? ToAddress { get; set; } // JSON array
    public string? CcAddress { get; set; }
    public string? ReplyToAddress { get; set; }
    public DateTime? Date { get; set; }
    public string? Snippet { get; set; }
    public string Flags { get; set; } = "[]";
    public bool HasAttachments { get; set; }
    public string? BodyHtml { get; set; }
    public string? BodyText { get; set; }
    public string? AttachmentsMeta { get; set; }
    public string? InReplyTo { get; set; }
    public string? ReferencesHeader { get; set; }
    public string? ThreadId { get; set; }
    public string? RawHeaders { get; set; }
    public string? ExtractedPdfText { get; set; }
    public DateTime CachedAt { get; set; } = DateTime.UtcNow;

    public bool IsSeen => Flags.Contains("\\Seen", StringComparison.OrdinalIgnoreCase)
        || Flags.Contains("\"Seen\"", StringComparison.OrdinalIgnoreCase)
        || Flags.Contains("'Seen'", StringComparison.OrdinalIgnoreCase);
    public bool IsFlagged => Flags.Contains("\\Flagged", StringComparison.OrdinalIgnoreCase)
        || Flags.Contains("\"Flagged\"", StringComparison.OrdinalIgnoreCase);

    public string DisplayName =>
        string.IsNullOrWhiteSpace(FromName) ? (FromAddress ?? "") : FromName!;

    public string Key => $"{AccountId}:{Folder}:{Uid}";
}

public sealed class FolderInfo
{
    public string Name { get; set; } = "";
    public string FullName { get; set; } = "";
    public string? SpecialUse { get; set; } // Inbox, Sent, Trash, Drafts, Archive, Junk, Flagged
    public int UnreadCount { get; set; }
    public int TotalCount { get; set; }
}

public sealed class Signature
{
    public int Id { get; set; }
    public string Name { get; set; } = "";
    public string Content { get; set; } = "";
    public bool IsDefault { get; set; }
    public int? AccountId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class FolderSyncState
{
    public int AccountId { get; set; }
    public string Folder { get; set; } = "";
    public uint? UidValidity { get; set; }
    public DateTime? LastSyncAt { get; set; }
}

public sealed class PendingOp
{
    public int Id { get; set; }
    public int AccountId { get; set; }
    public string Folder { get; set; } = "";
    public uint Uid { get; set; }
    public string OpType { get; set; } = ""; // move | delete | archive | flags
    public string? PayloadJson { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
}

public sealed class SearchQuery
{
    public string Q { get; set; } = "";
    public int? AccountId { get; set; }
    public string? Folder { get; set; }
    public string? From { get; set; }
    public bool? HasAttachments { get; set; }
    public DateTime? Since { get; set; }
    public DateTime? Before { get; set; }
}

public sealed class ComposeRequest
{
    public int AccountId { get; set; }
    public List<MailAddress> To { get; set; } = new();
    public List<MailAddress> Cc { get; set; } = new();
    public List<MailAddress> Bcc { get; set; } = new();
    public string Subject { get; set; } = "";
    public string HtmlBody { get; set; } = "";
    public string? TextBody { get; set; }
    public string? InReplyTo { get; set; }
    public string? References { get; set; }
    public List<ComposeAttachment> Attachments { get; set; } = new();
    public bool SaveAsDraft { get; set; }
}

public sealed class ComposeAttachment
{
    public string Filename { get; set; } = "";
    public string ContentType { get; set; } = "application/octet-stream";
    public byte[] Data { get; set; } = Array.Empty<byte>();
    public string? ContentId { get; set; }
    public bool IsInline { get; set; }
}

public sealed class NewMailEventArgs : EventArgs
{
    public int AccountId { get; init; }
    public string? Subject { get; init; }
    public string? FromName { get; init; }
    public string? FromAddress { get; init; }
    public int Count { get; init; } = 1;
}

public sealed class MessagesUpdatedEventArgs : EventArgs
{
    public int AccountId { get; init; }
    public string Folder { get; init; } = "INBOX";
}

public static class AccountPresets
{
    public static readonly (string Name, string ImapHost, int ImapPort, string SmtpHost, int SmtpPort)[] All =
    [
        ("Gmail", "imap.gmail.com", 993, "smtp.gmail.com", 587),
        ("Outlook / Microsoft 365", "outlook.office365.com", 993, "smtp.office365.com", 587),
        ("Yahoo", "imap.mail.yahoo.com", 993, "smtp.mail.yahoo.com", 587),
        ("iCloud", "imap.mail.me.com", 993, "smtp.mail.me.com", 587),
        ("Custom IMAP", "", 993, "", 587),
    ];
}
