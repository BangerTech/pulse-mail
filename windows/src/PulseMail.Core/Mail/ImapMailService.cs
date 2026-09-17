using MailKit;
using MailKit.Net.Imap;
using MailKit.Security;
using MimeKit;
using PulseMail.Core.Data;
using PulseMail.Core.Models;
using PulseMail.Core.Security;
using PulseMail.Core.Threading;
using System.Text.Json;

namespace PulseMail.Core.Mail;

public sealed class ImapMailService : IAsyncDisposable
{
    private readonly MailDatabase _db;
    private readonly ICredentialStore _creds;
    private readonly IAuthTokenProvider? _tokens;
    private readonly Dictionary<int, AccountConnections> _connections = new();
    private readonly object _lock = new();
    private CancellationTokenSource? _cts;
    private bool _disposed;

    public event EventHandler<NewMailEventArgs>? NewMail;
    public event EventHandler<MessagesUpdatedEventArgs>? MessagesUpdated;

    public ImapMailService(MailDatabase db, ICredentialStore creds, IAuthTokenProvider? tokens = null)
    {
        _db = db;
        _creds = creds;
        _tokens = tokens;
    }

    public async Task StartAsync()
    {
        _cts = new CancellationTokenSource();
        foreach (var account in _db.GetAccounts())
        {
            try { await EnsureConnectionsAsync(account.Id, _cts.Token); }
            catch { /* reconnect loop will retry */ }
        }
        _ = PollLoopAsync(_cts.Token);
    }

    public async Task StopAsync()
    {
        _cts?.Cancel();
        List<AccountConnections> copy;
        lock (_lock) { copy = _connections.Values.ToList(); _connections.Clear(); }
        foreach (var c in copy) await c.DisposeAsync();
    }

    public async ValueTask DisposeAsync()
    {
        if (_disposed) return;
        _disposed = true;
        await StopAsync();
    }

    private async Task EnsureConnectionsAsync(int accountId, CancellationToken ct)
    {
        var account = _db.GetAccount(accountId) ?? throw new InvalidOperationException("Account missing");
        AccountConnections conn;
        lock (_lock)
        {
            if (_connections.TryGetValue(accountId, out var existing) && existing.IsAlive)
                return;
            conn = new AccountConnections(accountId);
            _connections[accountId] = conn;
        }

        conn.Idle = await ConnectAsync(account, ct);
        conn.Work = await ConnectAsync(account, ct);
        await OpenInboxIdleAsync(conn, account, ct);
    }

    private async Task<ImapClient> ConnectAsync(Account account, CancellationToken ct)
    {
        var client = new ImapClient();
        client.Timeout = 60_000;
        await client.ConnectAsync(account.ImapHost, account.ImapPort, SecureSocketOptions.SslOnConnect, ct);

        if (account.AuthType is "oauth_google" or "oauth_microsoft" && _tokens is not null)
        {
            var access = await _tokens.GetAccessTokenAsync(account, ct);
            var oauth = new SaslMechanismOAuth2(account.Username, access);
            await client.AuthenticateAsync(oauth, ct);
        }
        else
        {
            var password = _creds.Load(account.CredentialKey)
                ?? throw new InvalidOperationException($"Kein Passwort für {account.Email}");
            await client.AuthenticateAsync(account.Username, password, ct);
        }
        return client;
    }

    private async Task OpenInboxIdleAsync(AccountConnections conn, Account account, CancellationToken ct)
    {
        var inbox = conn.Idle!.Inbox;
        await inbox.OpenAsync(FolderAccess.ReadOnly, ct);
        inbox.CountChanged += (_, _) =>
        {
            _ = Task.Run(async () =>
            {
                try
                {
                    await FetchRecentAsync(account.Id, "INBOX", 30, ct);
                    NewMail?.Invoke(this, new NewMailEventArgs { AccountId = account.Id, Count = 1 });
                }
                catch { }
            }, ct);
        };
        inbox.MessageExpunged += (_, _) =>
        {
            _ = Task.Run(async () =>
            {
                try
                {
                    await ReconcileFolderAsync(account.Id, "INBOX", ct);
                    MessagesUpdated?.Invoke(this, new MessagesUpdatedEventArgs { AccountId = account.Id, Folder = "INBOX" });
                }
                catch { }
            }, ct);
        };
        inbox.MessageFlagsChanged += (_, e) =>
        {
            try
            {
                if (e.UniqueId is not { } uid) return;
                var flags = FlagsToJson(e.Flags);
                _db.UpdateFlags(account.Id, "INBOX", uid.Id, flags);
                MessagesUpdated?.Invoke(this, new MessagesUpdatedEventArgs { AccountId = account.Id, Folder = "INBOX" });
            }
            catch { }
        };

        _ = IdleLoopAsync(conn, account, ct);
    }

    private async Task IdleLoopAsync(AccountConnections conn, Account account, CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                if (conn.Idle is null || !conn.Idle.IsConnected)
                {
                    await Task.Delay(5000, ct);
                    await EnsureConnectionsAsync(account.Id, ct);
                    continue;
                }
                using var idleCts = CancellationTokenSource.CreateLinkedTokenSource(ct);
                idleCts.CancelAfter(TimeSpan.FromMinutes(9));
                await conn.Idle.IdleAsync(idleCts.Token);
            }
            catch (OperationCanceledException) when (ct.IsCancellationRequested) { break; }
            catch
            {
                try
                {
                    if (conn.Idle is not null) await conn.Idle.DisconnectAsync(true, ct);
                }
                catch { }
                conn.Idle = null;
                await Task.Delay(5000, ct);
                try { await EnsureConnectionsAsync(account.Id, ct); } catch { }
            }
        }
    }

    private async Task PollLoopAsync(CancellationToken ct)
    {
        while (!ct.IsCancellationRequested)
        {
            try
            {
                await Task.Delay(TimeSpan.FromSeconds(60), ct);
                foreach (var a in _db.GetAccounts())
                {
                    try
                    {
                        await FetchRecentAsync(a.Id, "INBOX", 20, ct);
                        if (DateTime.UtcNow.Minute % 5 == 0)
                            await ReconcileFolderAsync(a.Id, "INBOX", ct);
                    }
                    catch { }
                }
            }
            catch (OperationCanceledException) { break; }
        }
    }

    public async Task FetchRecentAsync(int accountId, string folder, int count, CancellationToken ct = default)
    {
        var work = await GetWorkClientAsync(accountId, ct);
        var f = await work.GetFolderAsync(folder, ct);
        await f.OpenAsync(FolderAccess.ReadOnly, ct);

        var sync = _db.GetFolderSync(accountId, folder);
        if (sync?.UidValidity is not null && f.UidValidity != sync.UidValidity)
        {
            _db.ClearFolder(accountId, folder);
        }
        _db.SetFolderSync(accountId, folder, f.UidValidity);

        if (f.Count == 0) return;
        var start = Math.Max(0, f.Count - count);

        var summaries = await f.FetchAsync(start, -1,
            MessageSummaryItems.UniqueId | MessageSummaryItems.Envelope | MessageSummaryItems.Flags |
            MessageSummaryItems.BodyStructure | MessageSummaryItems.Headers,
            ct);

        foreach (var s in summaries)
            UpsertSummary(accountId, folder, s);

        MessagesUpdated?.Invoke(this, new MessagesUpdatedEventArgs { AccountId = accountId, Folder = folder });
    }

    public async Task ReconcileFolderAsync(int accountId, string folder, CancellationToken ct = default)
    {
        var work = await GetWorkClientAsync(accountId, ct);
        var f = await work.GetFolderAsync(folder, ct);
        await f.OpenAsync(FolderAccess.ReadOnly, ct);

        var sync = _db.GetFolderSync(accountId, folder);
        if (sync?.UidValidity is not null && f.UidValidity != sync.UidValidity)
        {
            _db.ClearFolder(accountId, folder);
            _db.SetFolderSync(accountId, folder, f.UidValidity);
            await FetchRecentAsync(accountId, folder, 100, ct);
            return;
        }
        _db.SetFolderSync(accountId, folder, f.UidValidity);

        var summaries = await f.FetchAsync(0, -1,
            MessageSummaryItems.UniqueId | MessageSummaryItems.Flags, ct);
        var remote = summaries.ToDictionary(s => s.UniqueId.Id, s => s);
        var local = _db.GetUidsInFolder(accountId, folder);
        var pending = _db.GetPendingKeys(accountId, folder);

        foreach (var uid in local)
        {
            if (pending.Contains($"{accountId}:{folder}:{uid}")) continue;
            if (!remote.ContainsKey(uid))
                _db.DeleteMessage(accountId, folder, uid);
        }

        foreach (var (uid, s) in remote)
        {
            if (local.Contains(uid))
                _db.UpdateFlags(accountId, folder, uid, FlagsToJson(s.Flags));
        }

        MessagesUpdated?.Invoke(this, new MessagesUpdatedEventArgs { AccountId = accountId, Folder = folder });
    }

    public async Task FetchBodyAsync(int accountId, string folder, uint uid, CancellationToken ct = default)
    {
        var existing = _db.GetMessage(accountId, folder, uid);
        if (existing is not null && (!string.IsNullOrEmpty(existing.BodyHtml) || !string.IsNullOrEmpty(existing.BodyText)))
            return;

        var work = await GetWorkClientAsync(accountId, ct);
        var f = await work.GetFolderAsync(folder, ct);
        await f.OpenAsync(FolderAccess.ReadOnly, ct);
        var msg = await f.GetMessageAsync(new UniqueId(uid), ct);
        var cached = existing ?? new CachedMessage { AccountId = accountId, Folder = folder, Uid = uid };
        ApplyMime(cached, msg);
        _db.UpsertMessage(cached);
    }

    public async Task<byte[]?> DownloadAttachmentAsync(int accountId, string folder, uint uid, string filename, CancellationToken ct = default)
    {
        var work = await GetWorkClientAsync(accountId, ct);
        var f = await work.GetFolderAsync(folder, ct);
        await f.OpenAsync(FolderAccess.ReadOnly, ct);
        var msg = await f.GetMessageAsync(new UniqueId(uid), ct);
        foreach (var att in msg.Attachments)
        {
            if (att is not MimePart part) continue;
            var name = part.FileName ?? part.ContentDisposition?.FileName ?? "";
            if (!string.Equals(name, filename, StringComparison.OrdinalIgnoreCase)) continue;
            if (part.Content is null) continue;
            using var ms = new MemoryStream();
            await part.Content.DecodeToAsync(ms, ct);
            return ms.ToArray();
        }
        // also check body parts with Content-Id / inline
        foreach (var part in msg.BodyParts.OfType<MimePart>())
        {
            var name = part.FileName ?? "";
            if (!string.Equals(name, filename, StringComparison.OrdinalIgnoreCase)) continue;
            if (part.Content is null) continue;
            using var ms = new MemoryStream();
            await part.Content.DecodeToAsync(ms, ct);
            return ms.ToArray();
        }
        return null;
    }

    public async Task<Dictionary<string, string>> GetCidMapAsync(int accountId, string folder, uint uid, CancellationToken ct = default)
    {
        var map = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        var work = await GetWorkClientAsync(accountId, ct);
        var f = await work.GetFolderAsync(folder, ct);
        await f.OpenAsync(FolderAccess.ReadOnly, ct);
        var msg = await f.GetMessageAsync(new UniqueId(uid), ct);
        foreach (var part in msg.BodyParts.OfType<MimePart>())
        {
            if (part.ContentId is null || part.Content is null) continue;
            using var ms = new MemoryStream();
            await part.Content.DecodeToAsync(ms, ct);
            var b64 = Convert.ToBase64String(ms.ToArray());
            var mime = part.ContentType.MimeType;
            var cid = part.ContentId.Trim('<', '>');
            map[cid] = $"data:{mime};base64,{b64}";
        }
        return map;
    }

    public async Task<List<FolderInfo>> ListFoldersAsync(int accountId, CancellationToken ct = default)
    {
        var work = await GetWorkClientAsync(accountId, ct);
        var personal = work.GetFolder(work.PersonalNamespaces[0]);
        var folders = new List<FolderInfo>();
        await WalkFoldersAsync(personal, folders, ct);
        _db.SaveFolders(accountId, folders);
        return folders;
    }

    private static async Task WalkFoldersAsync(IMailFolder root, List<FolderInfo> dest, CancellationToken ct)
    {
        foreach (var f in await root.GetSubfoldersAsync(false, ct))
        {
            string? special = null;
            if (f.Attributes.HasFlag(FolderAttributes.Inbox)) special = "Inbox";
            else if (f.Attributes.HasFlag(FolderAttributes.Sent)) special = "Sent";
            else if (f.Attributes.HasFlag(FolderAttributes.Trash)) special = "Trash";
            else if (f.Attributes.HasFlag(FolderAttributes.Drafts)) special = "Drafts";
            else if (f.Attributes.HasFlag(FolderAttributes.Archive)) special = "Archive";
            else if (f.Attributes.HasFlag(FolderAttributes.Junk)) special = "Junk";
            else if (f.Attributes.HasFlag(FolderAttributes.Flagged)) special = "Flagged";

            var unread = 0;
            try
            {
                if (!f.Attributes.HasFlag(FolderAttributes.NoSelect))
                {
                    await f.OpenAsync(FolderAccess.ReadOnly, ct);
                    unread = f.Unread;
                    await f.CloseAsync(false, ct);
                }
            }
            catch { }

            dest.Add(new FolderInfo
            {
                Name = f.Name,
                FullName = f.FullName,
                SpecialUse = special,
                UnreadCount = unread,
                TotalCount = f.Count
            });

            if (f.Attributes.HasFlag(FolderAttributes.HasChildren))
                await WalkFoldersAsync(f, dest, ct);
        }
    }

    public async Task SetFlagsAsync(int accountId, string folder, IEnumerable<uint> uids, MessageFlags flags, bool add, CancellationToken ct = default)
    {
        var work = await GetWorkClientAsync(accountId, ct);
        var f = await work.GetFolderAsync(folder, ct);
        await f.OpenAsync(FolderAccess.ReadWrite, ct);
        var set = new UniqueIdSet(uids.Select(u => new UniqueId(u)));
        if (add) await f.AddFlagsAsync(set, flags, true, ct);
        else await f.RemoveFlagsAsync(set, flags, true, ct);

        foreach (var uid in uids)
        {
            var msg = _db.GetMessage(accountId, folder, uid);
            if (msg is null) continue;
            var list = JsonSerializer.Deserialize<List<string>>(msg.Flags) ?? new();
            var name = FlagName(flags);
            if (add && !list.Contains(name)) list.Add(name);
            if (!add) list.Remove(name);
            _db.UpdateFlags(accountId, folder, uid, JsonSerializer.Serialize(list));
        }
        MessagesUpdated?.Invoke(this, new MessagesUpdatedEventArgs { AccountId = accountId, Folder = folder });
    }

    public async Task MoveAsync(int accountId, string folder, IEnumerable<uint> uids, string destFolder, CancellationToken ct = default)
    {
        var list = uids.ToList();
        foreach (var uid in list)
        {
            var opId = _db.AddPendingOp(new PendingOp
            {
                AccountId = accountId, Folder = folder, Uid = uid, OpType = "move",
                PayloadJson = JsonSerializer.Serialize(new { dest = destFolder })
            });
            _db.DeleteMessage(accountId, folder, uid);
            try
            {
                var work = await GetWorkClientAsync(accountId, ct);
                var src = await work.GetFolderAsync(folder, ct);
                await src.OpenAsync(FolderAccess.ReadWrite, ct);
                var dest = await work.GetFolderAsync(destFolder, ct);
                await src.MoveToAsync(new UniqueId(uid), dest, ct);
            }
            finally { _db.RemovePendingOp(opId); }
        }
        MessagesUpdated?.Invoke(this, new MessagesUpdatedEventArgs { AccountId = accountId, Folder = folder });
    }

    public async Task DeleteAsync(int accountId, string folder, IEnumerable<uint> uids, CancellationToken ct = default)
    {
        var trash = FindSpecial(accountId, "Trash") ?? "Trash";
        await MoveAsync(accountId, folder, uids, trash, ct);
    }

    public async Task ArchiveAsync(int accountId, string folder, IEnumerable<uint> uids, CancellationToken ct = default)
    {
        var archive = FindSpecial(accountId, "Archive") ?? "Archive";
        await MoveAsync(accountId, folder, uids, archive, ct);
    }

    private string? FindSpecial(int accountId, string special)
    {
        return _db.GetFolders(accountId).FirstOrDefault(f => f.SpecialUse == special)?.FullName;
    }

    public async Task AddAccountAndConnectAsync(Account account, string password, CancellationToken ct = default)
    {
        // temp key until we have an id
        account.CredentialKey = AppPaths.CredentialTarget(0);
        var id = _db.InsertAccount(account);
        account.Id = id;
        account.CredentialKey = AppPaths.CredentialTarget(id);
        _db.UpdateAccount(account);
        _creds.Save(account.CredentialKey, account.Username, password);

        await EnsureConnectionsAsync(id, ct);
        await ListFoldersAsync(id, ct);
        await FetchRecentAsync(id, "INBOX", 50, ct);
    }

    private async Task<ImapClient> GetWorkClientAsync(int accountId, CancellationToken ct)
    {
        lock (_lock)
        {
            if (_connections.TryGetValue(accountId, out var c) && c.Work is { IsConnected: true, IsAuthenticated: true })
                return c.Work;
        }
        await EnsureConnectionsAsync(accountId, ct);
        lock (_lock)
        {
            return _connections[accountId].Work
                ?? throw new InvalidOperationException("Work connection missing");
        }
    }

    private void UpsertSummary(int accountId, string folder, IMessageSummary s)
    {
        var env = s.Envelope;
        var from = env?.From?.Mailboxes.FirstOrDefault();
        var to = env?.To?.Mailboxes.Select(m => new MailAddress { Name = m.Name ?? "", Address = m.Address ?? "" }).ToList() ?? new();
        var cc = env?.Cc?.Mailboxes.Select(m => new MailAddress { Name = m.Name ?? "", Address = m.Address ?? "" }).ToList() ?? new();
        var replyTo = env?.ReplyTo?.Mailboxes.Select(m => new MailAddress { Name = m.Name ?? "", Address = m.Address ?? "" }).ToList() ?? new();

        var messageId = env?.MessageId;
        var inReplyTo = env?.InReplyTo;
        string? references = null;
        try { references = s.Headers?["References"]; } catch { }

        var subject = env?.Subject;
        var threadId = ThreadingHelper.ComputeThreadId(messageId, inReplyTo, references, subject, from?.Address);

        var hasAtt = s.Attachments?.Any() == true ||
                     (s.Body is BodyPartMultipart mp && mp.BodyParts.OfType<BodyPartBasic>().Any(b =>
                         b.ContentDisposition?.IsAttachment == true));

        var msg = new CachedMessage
        {
            AccountId = accountId,
            Folder = folder,
            Uid = s.UniqueId.Id,
            MessageId = messageId,
            Subject = subject,
            FromAddress = from?.Address,
            FromName = from?.Name,
            ToAddress = JsonSerializer.Serialize(to),
            CcAddress = JsonSerializer.Serialize(cc),
            ReplyToAddress = JsonSerializer.Serialize(replyTo),
            Date = env?.Date?.UtcDateTime,
            Snippet = "",
            Flags = FlagsToJson(s.Flags),
            HasAttachments = hasAtt,
            InReplyTo = inReplyTo,
            ReferencesHeader = references,
            ThreadId = threadId,
        };
        _db.UpsertMessage(msg);
    }

    private static void ApplyMime(CachedMessage cached, MimeMessage msg)
    {
        cached.BodyHtml = msg.HtmlBody;
        cached.BodyText = msg.TextBody;
        if (string.IsNullOrEmpty(cached.Snippet))
        {
            var plain = msg.TextBody ?? StripTags(msg.HtmlBody ?? "");
            cached.Snippet = plain.Length > 200 ? plain[..200] : plain;
        }
        var atts = new List<AttachmentMeta>();
        foreach (var part in msg.BodyParts.OfType<MimePart>())
        {
            if (part.IsAttachment || !string.IsNullOrEmpty(part.FileName))
            {
                atts.Add(new AttachmentMeta
                {
                    Filename = part.FileName ?? "attachment",
                    ContentType = part.ContentType.MimeType,
                    Size = MeasurePartSize(part),
                    ContentId = part.ContentId,
                    IsInline = part.ContentDisposition?.IsAttachment == false
                });
            }
        }
        cached.AttachmentsMeta = JsonSerializer.Serialize(atts);
        cached.HasAttachments = atts.Any(a => !a.IsInline);
        try { cached.RawHeaders = msg.Headers.ToString(); } catch { }
    }

    private static long MeasurePartSize(MimePart part)
    {
        var declared = part.ContentDisposition?.Size;
        if (declared is long s && s > 0) return s;

        var cl = part.Headers[HeaderId.ContentLength];
        if (long.TryParse(cl, out var parsed) && parsed > 0) return parsed;

        try
        {
            if (part.Content is null) return 0;
            using var ms = new MemoryStream();
            part.Content.DecodeTo(ms);
            return ms.Length;
        }
        catch
        {
            return 0;
        }
    }

    private static string StripTags(string html) =>
        System.Text.RegularExpressions.Regex.Replace(html, "<[^>]+>", " ");

    private static string FlagsToJson(MessageFlags? flags)
    {
        var list = new List<string>();
        if (flags is null) return "[]";
        if (flags.Value.HasFlag(MessageFlags.Seen)) list.Add("\\Seen");
        if (flags.Value.HasFlag(MessageFlags.Flagged)) list.Add("\\Flagged");
        if (flags.Value.HasFlag(MessageFlags.Answered)) list.Add("\\Answered");
        if (flags.Value.HasFlag(MessageFlags.Deleted)) list.Add("\\Deleted");
        if (flags.Value.HasFlag(MessageFlags.Draft)) list.Add("\\Draft");
        return JsonSerializer.Serialize(list);
    }

    private static string FlagName(MessageFlags flags)
    {
        if (flags.HasFlag(MessageFlags.Seen)) return "\\Seen";
        if (flags.HasFlag(MessageFlags.Flagged)) return "\\Flagged";
        if (flags.HasFlag(MessageFlags.Answered)) return "\\Answered";
        return flags.ToString();
    }

    private sealed class AccountConnections : IAsyncDisposable
    {
        public int AccountId { get; }
        public ImapClient? Idle { get; set; }
        public ImapClient? Work { get; set; }
        public bool IsAlive => Idle is { IsConnected: true } || Work is { IsConnected: true };

        public AccountConnections(int accountId) => AccountId = accountId;

        public async ValueTask DisposeAsync()
        {
            try { if (Idle is not null) await Idle.DisconnectAsync(true); } catch { }
            try { if (Work is not null) await Work.DisconnectAsync(true); } catch { }
            Idle?.Dispose();
            Work?.Dispose();
        }
    }
}

public interface IAuthTokenProvider
{
    Task<string> GetAccessTokenAsync(Account account, CancellationToken ct = default);
}
