using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using MailKit;
using Microsoft.UI.Dispatching;
using PulseMail.App.Services;
using PulseMail.Core;
using PulseMail.Core.Models;
using PulseMail.Core.Services;
using System.Collections.ObjectModel;
using System.Text.Json;

namespace PulseMail.App.ViewModels;

public partial class MainViewModel : ObservableObject
{
    private readonly MailAppService _mail;
    private readonly DispatcherQueue _dispatcher;

    public MainViewModel(MailAppService mail, DispatcherQueue dispatcher)
    {
        _mail = mail;
        _dispatcher = dispatcher;
        _mail.Imap.NewMail += OnNewMail;
        _mail.Imap.MessagesUpdated += OnMessagesUpdated;
    }

    public ObservableCollection<AccountNavItem> Accounts { get; } = new();
    public ObservableCollection<MailListItem> Messages { get; } = new();
    public ObservableCollection<FolderNavItem> CurrentFolders { get; } = new();
    public ObservableCollection<CachedMessage> ThreadMessages { get; } = new();
    public ObservableCollection<CommandItem> Commands { get; } = new();

    [ObservableProperty] private bool needsSetup;
    [ObservableProperty] private bool sidebarVisible = true;
    [ObservableProperty] private bool settingsOpen;
    [ObservableProperty] private bool composeOpen;
    [ObservableProperty] private bool paletteOpen;
    [ObservableProperty] private bool searchOpen;
    [ObservableProperty] private string searchText = "";
    [ObservableProperty] private string statusText = "";
    [ObservableProperty] private int totalUnread;
    [ObservableProperty] private AccountNavItem? selectedAccount;
    [ObservableProperty] private FolderNavItem? selectedFolder;
    [ObservableProperty] private MailListItem? selectedMessage;
    [ObservableProperty] private CachedMessage? readingMessage;
    [ObservableProperty] private string? readingHtml;
    [ObservableProperty] private string theme = "system";
    [ObservableProperty] private string density = "comfortable";
    [ObservableProperty] private string previewPane = "right";
    [ObservableProperty] private bool conversationsEnabled = true;
    [ObservableProperty] private bool loadRemoteImages = true;
    [ObservableProperty] private ComposeViewModel? compose;
    [ObservableProperty] private string windowTitle = "Pulse Mail";

    public bool IsUnifiedInbox => SelectedAccount is null && (SelectedFolder?.FullName is "INBOX" or null);

    public async Task LoadAsync()
    {
        NeedsSetup = !_mail.HasAccounts;
        Theme = _mail.Db.GetSetting("theme") ?? "system";
        Density = _mail.Db.GetSetting("density") ?? "comfortable";
        PreviewPane = _mail.Db.GetSetting("previewPane") ?? "right";
        ConversationsEnabled = _mail.Db.GetBoolSetting("conversations", true);
        LoadRemoteImages = _mail.Db.GetBoolSetting("loadRemoteImages", true);
        RefreshAccounts();
        BuildCommands();
        if (!NeedsSetup)
        {
            SelectedFolder = new FolderNavItem { Name = "Alle Eingänge", FullName = "INBOX", IsUnified = true };
            await RefreshMessagesAsync();
            UpdateUnread();
        }
    }

    public void RefreshAccounts()
    {
        Accounts.Clear();
        foreach (var a in _mail.Db.GetAccounts())
        {
            var folders = _mail.Db.GetFolders(a.Id);
            var item = new AccountNavItem
            {
                Account = a,
                Unread = _mail.Db.CountUnread(a.Id),
                Folders = new ObservableCollection<FolderNavItem>(
                    folders.Select(f => new FolderNavItem
                    {
                        Name = f.Name,
                        FullName = f.FullName,
                        SpecialUse = f.SpecialUse,
                        Unread = f.UnreadCount,
                        AccountId = a.Id
                    }))
            };
            Accounts.Add(item);
        }
    }

    [RelayCommand]
    public async Task RefreshMessagesAsync()
    {
        Messages.Clear();
        var accountId = SelectedAccount?.Account.Id;
        var folder = SelectedFolder?.FullName ?? "INBOX";
        if (SelectedFolder?.IsUnified == true) accountId = null;

        var rows = _mail.Db.GetMessages(accountId, folder, 100, 0);
        var pending = accountId is not null
            ? _mail.Db.GetPendingKeys(accountId.Value, folder)
            : new HashSet<string>();

        if (ConversationsEnabled)
        {
            var groups = rows
                .Where(m => !pending.Contains(m.Key))
                .GroupBy(m => m.ThreadId ?? m.Key)
                .Select(g =>
                {
                    var latest = g.OrderByDescending(x => x.Date).First();
                    return new MailListItem
                    {
                        Message = latest,
                        ThreadCount = g.Count(),
                        ThreadId = g.Key,
                        IsExpanded = false
                    };
                })
                .OrderByDescending(i => i.Message.Date)
                .ToList();
            foreach (var g in groups) Messages.Add(g);
        }
        else
        {
            foreach (var m in rows.Where(m => !pending.Contains(m.Key)))
                Messages.Add(new MailListItem { Message = m, ThreadCount = 1 });
        }

        UpdateUnread();
        StatusText = $"{Messages.Count} Nachrichten";
    }

    [RelayCommand]
    public async Task SelectFolderAsync(FolderNavItem folder)
    {
        SelectedFolder = folder;
        SelectedAccount = folder.IsUnified ? null : Accounts.FirstOrDefault(a => a.Account.Id == folder.AccountId);
        SelectedMessage = null;
        ReadingMessage = null;
        ReadingHtml = null;
        await RefreshMessagesAsync();
        if (SelectedAccount is not null)
        {
            try { await _mail.Imap.FetchRecentAsync(SelectedAccount.Account.Id, folder.FullName, 50); }
            catch { }
            await RefreshMessagesAsync();
        }
        else
        {
            foreach (var a in Accounts)
            {
                try { await _mail.Imap.FetchRecentAsync(a.Account.Id, "INBOX", 30); } catch { }
            }
            await RefreshMessagesAsync();
        }
    }

    [RelayCommand]
    public async Task OpenMessageAsync(MailListItem item)
    {
        SelectedMessage = item;
        ReadingMessage = item.Message;
        try
        {
            await _mail.Imap.FetchBodyAsync(item.Message.AccountId, item.Message.Folder, item.Message.Uid);
            ReadingMessage = _mail.Db.GetMessage(item.Message.AccountId, item.Message.Folder, item.Message.Uid)
                ?? item.Message;

            Dictionary<string, string>? cid = null;
            try { cid = await _mail.Imap.GetCidMapAsync(item.Message.AccountId, item.Message.Folder, item.Message.Uid); }
            catch { }

            var allow = _mail.Db.GetImageAllowlist();
            var block = !LoadRemoteImages;
            var dark = Theme == "dark";
            if (Theme == "system")
            {
                try
                {
                    var settings = new Windows.UI.ViewManagement.UISettings();
                    var color = settings.GetColorValue(Windows.UI.ViewManagement.UIColorType.Background);
                    dark = color.R < 128;
                }
                catch { }
            }
            ReadingHtml = Core.Html.MailHtmlBuilder.BuildDocument(
                ReadingMessage.BodyHtml, ReadingMessage.BodyText, cid, block, dark, allow);

            if (!ReadingMessage.IsSeen)
            {
                _ = _mail.Imap.SetFlagsAsync(item.Message.AccountId, item.Message.Folder,
                    new[] { item.Message.Uid }, MessageFlags.Seen, true);
            }

            if (ConversationsEnabled && !string.IsNullOrEmpty(item.ThreadId) && item.ThreadCount > 1)
            {
                ThreadMessages.Clear();
                foreach (var m in _mail.Db.GetThreadMessages(item.Message.AccountId, item.Message.Folder, item.ThreadId!))
                    ThreadMessages.Add(m);
            }
            else ThreadMessages.Clear();
        }
        catch (Exception ex)
        {
            StatusText = ex.Message;
        }
    }

    [RelayCommand]
    public async Task ArchiveSelectedAsync()
    {
        if (SelectedMessage is null) return;
        var m = SelectedMessage.Message;
        Messages.Remove(SelectedMessage);
        SelectedMessage = null;
        ReadingMessage = null;
        await _mail.Imap.ArchiveAsync(m.AccountId, m.Folder, new[] { m.Uid });
    }

    [RelayCommand]
    public async Task DeleteSelectedAsync()
    {
        if (SelectedMessage is null) return;
        if (_mail.Db.GetBoolSetting("confirmDelete", false))
        {
            // UI layer shows dialog; for now proceed
        }
        var m = SelectedMessage.Message;
        Messages.Remove(SelectedMessage);
        SelectedMessage = null;
        ReadingMessage = null;
        await _mail.Imap.DeleteAsync(m.AccountId, m.Folder, new[] { m.Uid });
    }

    [RelayCommand]
    public async Task ToggleFlagAsync()
    {
        if (SelectedMessage is null) return;
        var m = SelectedMessage.Message;
        await _mail.Imap.SetFlagsAsync(m.AccountId, m.Folder, new[] { m.Uid },
            MessageFlags.Flagged, !m.IsFlagged);
        await RefreshMessagesAsync();
    }

    [RelayCommand]
    public async Task ToggleSeenAsync()
    {
        if (SelectedMessage is null) return;
        var m = SelectedMessage.Message;
        await _mail.Imap.SetFlagsAsync(m.AccountId, m.Folder, new[] { m.Uid },
            MessageFlags.Seen, !m.IsSeen);
        await RefreshMessagesAsync();
    }

    /// <summary>Called from UI after folder picker.</summary>
    public async Task MoveToFolderAsync(string destFolder)
    {
        if (SelectedMessage is null) return;
        var m = SelectedMessage.Message;
        Messages.Remove(SelectedMessage);
        SelectedMessage = null;
        ReadingMessage = null;
        await _mail.Imap.MoveAsync(m.AccountId, m.Folder, new[] { m.Uid }, destFolder);
    }

    [RelayCommand]
    public void NewMail()
    {
        var account = SelectedAccount?.Account ?? Accounts.FirstOrDefault()?.Account;
        if (account is null) { NeedsSetup = true; return; }
        Compose = new ComposeViewModel(_mail, account) { Mode = ComposeMode.New };
        ComposeOpen = true;
    }

    [RelayCommand]
    public void Reply()
    {
        if (ReadingMessage is null) return;
        var account = _mail.Db.GetAccount(ReadingMessage.AccountId);
        if (account is null) return;
        Compose = ComposeViewModel.FromReply(_mail, account, ReadingMessage, all: false);
        ComposeOpen = true;
    }

    [RelayCommand]
    public void ReplyAll()
    {
        if (ReadingMessage is null) return;
        var account = _mail.Db.GetAccount(ReadingMessage.AccountId);
        if (account is null) return;
        Compose = ComposeViewModel.FromReply(_mail, account, ReadingMessage, all: true);
        ComposeOpen = true;
    }

    [RelayCommand]
    public void Forward()
    {
        if (ReadingMessage is null) return;
        var account = _mail.Db.GetAccount(ReadingMessage.AccountId);
        if (account is null) return;
        Compose = ComposeViewModel.FromForward(_mail, account, ReadingMessage);
        ComposeOpen = true;
    }

    [RelayCommand]
    public async Task SearchAsync()
    {
        if (string.IsNullOrWhiteSpace(SearchText))
        {
            SearchOpen = false;
            await RefreshMessagesAsync();
            return;
        }
        SearchOpen = true;
        Messages.Clear();
        var results = _mail.Db.Search(new SearchQuery
        {
            Q = SearchText,
            AccountId = SelectedAccount?.Account.Id,
            Folder = SelectedFolder?.IsUnified == true ? null : SelectedFolder?.FullName
        });
        foreach (var m in results)
            Messages.Add(new MailListItem { Message = m, ThreadCount = 1 });
    }

    [RelayCommand]
    public void ToggleSidebar() => SidebarVisible = !SidebarVisible;

    [RelayCommand]
    public void OpenSettings() => SettingsOpen = true;

    [RelayCommand]
    public void CloseSettings() => SettingsOpen = false;

    [RelayCommand]
    public void OpenPalette() => PaletteOpen = true;

    [RelayCommand]
    public void ClosePalette() => PaletteOpen = false;

    [RelayCommand]
    public void CycleTheme()
    {
        Theme = Theme switch { "system" => "light", "light" => "dark", _ => "system" };
        _mail.Db.SetSetting("theme", Theme);
    }

    [RelayCommand]
    public void ToggleConversations()
    {
        ConversationsEnabled = !ConversationsEnabled;
        _mail.Db.SetBoolSetting("conversations", ConversationsEnabled);
        _ = RefreshMessagesAsync();
    }

    [RelayCommand]
    public void TogglePreviewPane()
    {
        PreviewPane = PreviewPane == "right" ? "bottom" : "right";
        _mail.Db.SetSetting("previewPane", PreviewPane);
    }

    public void UpdateUnread()
    {
        TotalUnread = _mail.Db.CountUnread(null);
        WindowTitle = TotalUnread > 0 ? $"({TotalUnread}) Pulse Mail" : "Pulse Mail";
        foreach (var a in Accounts)
            a.Unread = _mail.Db.CountUnread(a.Account.Id);
    }

    private void OnNewMail(object? sender, NewMailEventArgs e)
    {
        _dispatcher.TryEnqueue(async () =>
        {
            await RefreshMessagesAsync();
            NotificationService.ShowNewMail(e);
            NotificationService.PlaySound(_mail);
            NotificationService.SetTaskbarBadge(TotalUnread);
        });
    }

    private void OnMessagesUpdated(object? sender, MessagesUpdatedEventArgs e)
    {
        _dispatcher.TryEnqueue(async () => await RefreshMessagesAsync());
    }

    private void BuildCommands()
    {
        Commands.Clear();
        Commands.Add(new CommandItem("Neue E-Mail", "N", NewMailCommand));
        Commands.Add(new CommandItem("Antworten", "R", ReplyCommand));
        Commands.Add(new CommandItem("Allen antworten", "A", ReplyAllCommand));
        Commands.Add(new CommandItem("Weiterleiten", "F", ForwardCommand));
        Commands.Add(new CommandItem("Archivieren", "E", ArchiveSelectedCommand));
        Commands.Add(new CommandItem("Löschen", "#", DeleteSelectedCommand));
        Commands.Add(new CommandItem("Markieren", "L", ToggleFlagCommand));
        Commands.Add(new CommandItem("Gelesen umschalten", "U", ToggleSeenCommand));
        Commands.Add(new CommandItem("Einstellungen", ",", OpenSettingsCommand));
        Commands.Add(new CommandItem("Theme", "T", CycleThemeCommand));
        Commands.Add(new CommandItem("Seitenleiste", "[", ToggleSidebarCommand));
        Commands.Add(new CommandItem("Konversationen", "\\", ToggleConversationsCommand));
        Commands.Add(new CommandItem("Vorschau", "P", TogglePreviewPaneCommand));
        Commands.Add(new CommandItem("Aktualisieren", ".", RefreshMessagesCommand));
    }
}

public partial class AccountNavItem : ObservableObject
{
    public Account Account { get; set; } = null!;
    public ObservableCollection<FolderNavItem> Folders { get; set; } = new();
    [ObservableProperty] private int unread;
    [ObservableProperty] private bool isExpanded = true;
}

public partial class FolderNavItem : ObservableObject
{
    public string Name { get; set; } = "";
    public string FullName { get; set; } = "";
    public string? SpecialUse { get; set; }
    public int AccountId { get; set; }
    public bool IsUnified { get; set; }
    [ObservableProperty] private int unread;
}

public partial class MailListItem : ObservableObject
{
    public CachedMessage Message { get; set; } = null!;
    public int ThreadCount { get; set; } = 1;
    public string? ThreadId { get; set; }
    [ObservableProperty] private bool isExpanded;
    public bool ShowRecipient =>
        Message.Folder.Contains("Sent", StringComparison.OrdinalIgnoreCase) ||
        Message.Folder.Contains("Gesendet", StringComparison.OrdinalIgnoreCase);

    public string PrimaryLabel
    {
        get
        {
            if (!ShowRecipient) return Message.DisplayName;
            try
            {
                var list = JsonSerializer.Deserialize<List<MailAddress>>(Message.ToAddress ?? "[]");
                var first = list?.FirstOrDefault();
                return first is null ? "" : (string.IsNullOrEmpty(first.Name) ? first.Address : first.Name);
            }
            catch { return Message.ToAddress ?? ""; }
        }
    }

    public string AvatarInitial
    {
        get
        {
            var label = PrimaryLabel?.Trim();
            return string.IsNullOrEmpty(label) ? "?" : label[..1].ToUpperInvariant();
        }
    }

    public string DisplayDate =>
        Message.Date is { } d
            ? (d.Date == DateTime.UtcNow.Date ? d.ToLocalTime().ToString("HH:mm") : d.ToLocalTime().ToString("dd.MM.yy"))
            : "";
}

public sealed class CommandItem
{
    public string Title { get; }
    public string Shortcut { get; }
    public IRelayCommand Command { get; }
    public CommandItem(string title, string shortcut, IRelayCommand command)
    {
        Title = title; Shortcut = shortcut; Command = command;
    }
}

public enum ComposeMode { New, Reply, ReplyAll, Forward }
