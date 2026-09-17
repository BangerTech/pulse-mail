using MailKit.Net.Smtp;
using MailKit.Security;
using MimeKit;
using PulseMail.Core.Data;
using PulseMail.Core.Models;
using PulseMail.Core.Security;

namespace PulseMail.Core.Mail;

public sealed class SmtpMailService
{
    private readonly MailDatabase _db;
    private readonly ICredentialStore _creds;
    private readonly IAuthTokenProvider? _tokens;

    public SmtpMailService(MailDatabase db, ICredentialStore creds, IAuthTokenProvider? tokens = null)
    {
        _db = db;
        _creds = creds;
        _tokens = tokens;
    }

    public async Task SendAsync(ComposeRequest req, CancellationToken ct = default)
    {
        var account = _db.GetAccount(req.AccountId)
            ?? throw new InvalidOperationException("Account nicht gefunden");

        var message = BuildMime(account, req);

        if (req.SaveAsDraft)
        {
            await SaveDraftAsync(account, message, ct);
            return;
        }

        using var client = new SmtpClient();
        await client.ConnectAsync(account.SmtpHost, account.SmtpPort, SecureSocketOptions.StartTls, ct);

        if (account.AuthType is "oauth_google" or "oauth_microsoft" && _tokens is not null)
        {
            var access = await _tokens.GetAccessTokenAsync(account, ct);
            await client.AuthenticateAsync(new SaslMechanismOAuth2(account.Username, access), ct);
        }
        else
        {
            var password = _creds.Load(account.CredentialKey)
                ?? throw new InvalidOperationException("Passwort fehlt");
            await client.AuthenticateAsync(account.Username, password, ct);
        }

        await client.SendAsync(message, ct);
        await client.DisconnectAsync(true, ct);
    }

    private async Task SaveDraftAsync(Account account, MimeMessage message, CancellationToken ct)
    {
        using var imap = new MailKit.Net.Imap.ImapClient();
        await imap.ConnectAsync(account.ImapHost, account.ImapPort, SecureSocketOptions.SslOnConnect, ct);
        if (account.AuthType is "oauth_google" or "oauth_microsoft" && _tokens is not null)
        {
            var access = await _tokens.GetAccessTokenAsync(account, ct);
            await imap.AuthenticateAsync(new SaslMechanismOAuth2(account.Username, access), ct);
        }
        else
        {
            var password = _creds.Load(account.CredentialKey)!;
            await imap.AuthenticateAsync(account.Username, password, ct);
        }

        var drafts = _db.GetFolders(account.Id).FirstOrDefault(f => f.SpecialUse == "Drafts")?.FullName
            ?? "Drafts";
        var folder = await imap.GetFolderAsync(drafts, ct);
        await folder.OpenAsync(MailKit.FolderAccess.ReadWrite, ct);
        await folder.AppendAsync(new MailKit.AppendRequest(message, MailKit.MessageFlags.Draft), ct);
        await imap.DisconnectAsync(true, ct);
    }

    private static MimeMessage BuildMime(Account account, ComposeRequest req)
    {
        var message = new MimeMessage();
        message.From.Add(new MailboxAddress(account.Name, account.Email));
        foreach (var a in req.To) message.To.Add(new MailboxAddress(a.Name, a.Address));
        foreach (var a in req.Cc) message.Cc.Add(new MailboxAddress(a.Name, a.Address));
        foreach (var a in req.Bcc) message.Bcc.Add(new MailboxAddress(a.Name, a.Address));
        message.Subject = req.Subject;

        if (!string.IsNullOrEmpty(req.InReplyTo))
            message.InReplyTo = req.InReplyTo;
        if (!string.IsNullOrEmpty(req.References))
            message.References.AddRange(req.References.Split(' ', StringSplitOptions.RemoveEmptyEntries));

        var builder = new BodyBuilder
        {
            HtmlBody = req.HtmlBody,
            TextBody = req.TextBody ?? Strip(req.HtmlBody)
        };

        foreach (var att in req.Attachments)
        {
            if (att.IsInline && !string.IsNullOrEmpty(att.ContentId))
            {
                var entity = builder.LinkedResources.Add(att.Filename, att.Data, ContentType.Parse(att.ContentType));
                entity.ContentId = att.ContentId;
            }
            else
            {
                builder.Attachments.Add(att.Filename, att.Data, ContentType.Parse(att.ContentType));
            }
        }

        message.Body = builder.ToMessageBody();
        return message;
    }

    private static string Strip(string html) =>
        System.Text.RegularExpressions.Regex.Replace(html ?? "", "<[^>]+>", " ");
}
