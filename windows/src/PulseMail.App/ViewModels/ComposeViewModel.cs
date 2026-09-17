using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using PulseMail.Core.Models;
using PulseMail.Core.Services;
using System.Collections.ObjectModel;
using System.Text.Json;

namespace PulseMail.App.ViewModels;

public partial class ComposeViewModel : ObservableObject
{
    private readonly MailAppService _mail;

    public ComposeViewModel(MailAppService mail, Account account)
    {
        _mail = mail;
        SelectedAccount = account;
        Accounts = new ObservableCollection<Account>(_mail.Db.GetAccounts());
        var sig = _mail.Db.GetSignatures(account.Id).FirstOrDefault(s => s.IsDefault)
            ?? _mail.Db.GetSignatures().FirstOrDefault(s => s.IsDefault);
        if (sig is not null)
            HtmlBody = "<div><br/><br/></div>" + sig.Content;
    }

    public ObservableCollection<Account> Accounts { get; }
    public ObservableCollection<ComposeAttachmentItem> Attachments { get; } = new();

    [ObservableProperty] private Account selectedAccount = null!;
    [ObservableProperty] private string to = "";
    [ObservableProperty] private string cc = "";
    [ObservableProperty] private string bcc = "";
    [ObservableProperty] private string subject = "";
    [ObservableProperty] private string htmlBody = "";
    [ObservableProperty] private bool showCc;
    [ObservableProperty] private bool isSending;
    [ObservableProperty] private string? error;
    [ObservableProperty] private ComposeMode mode = ComposeMode.New;
    [ObservableProperty] private string? inReplyTo;
    [ObservableProperty] private string? references;

    public static ComposeViewModel FromReply(MailAppService mail, Account account, CachedMessage msg, bool all)
    {
        var vm = new ComposeViewModel(mail, account)
        {
            Mode = all ? ComposeMode.ReplyAll : ComposeMode.Reply,
            Subject = PrefixSubject(msg.Subject, "Re:"),
            InReplyTo = msg.MessageId,
            References = string.Join(" ", new[] { msg.ReferencesHeader, msg.MessageId }.Where(s => !string.IsNullOrEmpty(s)))
        };

        var replyTo = ParseAddresses(msg.ReplyToAddress);
        if (replyTo.Count == 0) replyTo = new List<MailAddress>
        {
            new() { Name = msg.FromName ?? "", Address = msg.FromAddress ?? "" }
        };
        vm.To = FormatAddresses(replyTo);

        if (all)
        {
            var to = ParseAddresses(msg.ToAddress)
                .Where(a => !string.Equals(a.Address, account.Email, StringComparison.OrdinalIgnoreCase));
            var cc = ParseAddresses(msg.CcAddress)
                .Where(a => !string.Equals(a.Address, account.Email, StringComparison.OrdinalIgnoreCase));
            vm.Cc = FormatAddresses(to.Concat(cc));
            vm.ShowCc = !string.IsNullOrWhiteSpace(vm.Cc);
        }

        var quote = msg.BodyHtml ?? Core.Html.MailHtmlBuilder.PlainTextToHtml(msg.BodyText ?? "");
        vm.HtmlBody = $"<div><br/></div><blockquote>{quote}</blockquote>" + (vm.HtmlBody.Contains("<div><br/><br/></div>") ? "" : "");
        // keep signature after quote if present
        var sig = mail.Db.GetSignatures(account.Id).FirstOrDefault(s => s.IsDefault);
        if (sig is not null)
            vm.HtmlBody = $"<div><br/></div>{sig.Content}<br/><blockquote>{quote}</blockquote>";

        return vm;
    }

    public static ComposeViewModel FromForward(MailAppService mail, Account account, CachedMessage msg)
    {
        var vm = new ComposeViewModel(mail, account)
        {
            Mode = ComposeMode.Forward,
            Subject = PrefixSubject(msg.Subject, "Fwd:"),
        };
        var body = msg.BodyHtml ?? Core.Html.MailHtmlBuilder.PlainTextToHtml(msg.BodyText ?? "");
        vm.HtmlBody = $"<div><br/></div><p>---------- Weitergeleitete Nachricht ----------</p>{body}";
        return vm;
    }

    [RelayCommand]
    public async Task SendAsync(Func<Task<string>>? getHtmlFromWebView = null)
    {
        try
        {
            IsSending = true;
            Error = null;
            if (getHtmlFromWebView is not null)
                HtmlBody = await getHtmlFromWebView();

            var req = new ComposeRequest
            {
                AccountId = SelectedAccount.Id,
                To = ParseLine(To),
                Cc = ParseLine(Cc),
                Bcc = ParseLine(Bcc),
                Subject = Subject,
                HtmlBody = HtmlBody,
                InReplyTo = InReplyTo,
                References = References,
                Attachments = Attachments.Select(a => new ComposeAttachment
                {
                    Filename = a.Filename,
                    ContentType = a.ContentType,
                    Data = a.Data,
                    IsInline = false
                }).ToList()
            };
            await _mail.Smtp.SendAsync(req);
        }
        catch (Exception ex)
        {
            Error = ex.Message;
            throw;
        }
        finally { IsSending = false; }
    }

    [RelayCommand]
    public async Task SaveDraftAsync(Func<Task<string>>? getHtmlFromWebView = null)
    {
        if (getHtmlFromWebView is not null)
            HtmlBody = await getHtmlFromWebView();
        var req = new ComposeRequest
        {
            AccountId = SelectedAccount.Id,
            To = ParseLine(To),
            Cc = ParseLine(Cc),
            Bcc = ParseLine(Bcc),
            Subject = Subject,
            HtmlBody = HtmlBody,
            SaveAsDraft = true,
            Attachments = Attachments.Select(a => new ComposeAttachment
            {
                Filename = a.Filename,
                ContentType = a.ContentType,
                Data = a.Data
            }).ToList()
        };
        await _mail.Smtp.SendAsync(req);
    }

    public void AddAttachment(string path)
    {
        var data = File.ReadAllBytes(path);
        Attachments.Add(new ComposeAttachmentItem
        {
            Filename = Path.GetFileName(path),
            ContentType = GuessMime(path),
            Data = data,
            Size = data.Length
        });
    }

    private static string GuessMime(string path) => Path.GetExtension(path).ToLowerInvariant() switch
    {
        ".pdf" => "application/pdf",
        ".png" => "image/png",
        ".jpg" or ".jpeg" => "image/jpeg",
        ".gif" => "image/gif",
        ".txt" => "text/plain",
        ".html" or ".htm" => "text/html",
        ".zip" => "application/zip",
        _ => "application/octet-stream"
    };

    private static string PrefixSubject(string? subject, string prefix)
    {
        var s = subject ?? "";
        if (s.StartsWith(prefix, StringComparison.OrdinalIgnoreCase)) return s;
        return $"{prefix} {s}";
    }

    private static List<MailAddress> ParseLine(string line) =>
        line.Split(new[] { ',', ';' }, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(ParseOne).Where(a => !string.IsNullOrEmpty(a.Address)).ToList();

    private static MailAddress ParseOne(string raw)
    {
        var m = System.Text.RegularExpressions.Regex.Match(raw, @"^(.*)<([^>]+)>$");
        if (m.Success)
            return new MailAddress { Name = m.Groups[1].Value.Trim().Trim('"'), Address = m.Groups[2].Value.Trim() };
        return new MailAddress { Address = raw.Trim() };
    }

    private static List<MailAddress> ParseAddresses(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return new();
        try { return JsonSerializer.Deserialize<List<MailAddress>>(json) ?? new(); }
        catch { return new(); }
    }

    private static string FormatAddresses(IEnumerable<MailAddress> list) =>
        string.Join(", ", list.Select(a => string.IsNullOrEmpty(a.Name) ? a.Address : $"{a.Name} <{a.Address}>"));
}

public sealed class ComposeAttachmentItem
{
    public string Filename { get; set; } = "";
    public string ContentType { get; set; } = "";
    public byte[] Data { get; set; } = Array.Empty<byte>();
    public long Size { get; set; }
}
