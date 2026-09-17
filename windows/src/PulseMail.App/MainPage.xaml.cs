using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Input;
using PulseMail.App.Controls;
using PulseMail.App.Services;
using PulseMail.App.ViewModels;
using PulseMail.Core.Models;
using System.Text.Json;
using Windows.System;

namespace PulseMail.App;

public sealed partial class MainPage : Page
{
    public MainViewModel ViewModel { get; }
    private readonly Window _window;
    private bool _draggingSplitter;
    private int _dragTarget;
    private double _dragStartX;
    private double _dragStartWidth;

    public MainPage(MainViewModel viewModel, Window window)
    {
        ViewModel = viewModel;
        _window = window;
        InitializeComponent();
        DataContext = ViewModel;

        SetupOverlay.AccountAdded += async (_, _) =>
        {
            ViewModel.NeedsSetup = false;
            ViewModel.RefreshAccounts();
            await ViewModel.RefreshMessagesAsync();
        };
        SettingsOverlay.Closed += (_, _) => ViewModel.CloseSettings();
        SettingsOverlay.AccountsChanged += (_, _) =>
        {
            ViewModel.RefreshAccounts();
            ViewModel.NeedsSetup = !App.Mail.HasAccounts;
        };
        ComposeOverlay.Closed += (_, _) =>
        {
            ViewModel.ComposeOpen = false;
            ViewModel.Compose = null;
        };
        PaletteOverlay.CommandChosen += (_, cmd) =>
        {
            ViewModel.ClosePalette();
            cmd.Command.Execute(null);
        };

        ViewModel.PropertyChanged += async (_, e) =>
        {
            if (e.PropertyName == nameof(ViewModel.ReadingHtml) && ViewModel.ReadingHtml is not null)
                await MailBodyView.NavigateHtmlAsync(ViewModel.ReadingHtml);
            if (e.PropertyName == nameof(ViewModel.WindowTitle))
                _window.Title = ViewModel.WindowTitle;
            if (e.PropertyName == nameof(ViewModel.ComposeOpen) && ViewModel.ComposeOpen && ViewModel.Compose is not null)
                ComposeOverlay.Bind(ViewModel.Compose);
            if (e.PropertyName == nameof(ViewModel.SidebarVisible))
                SidebarCol.Width = ViewModel.SidebarVisible ? new GridLength(220) : new GridLength(0);
            if (e.PropertyName == nameof(ViewModel.ReadingMessage))
                RefreshAttachments();
            if (e.PropertyName == nameof(ViewModel.Theme))
                ApplyTheme();
            if (e.PropertyName == nameof(ViewModel.PaletteOpen) && ViewModel.PaletteOpen)
                PaletteOverlay.Bind(ViewModel);
            if (e.PropertyName == nameof(ViewModel.SettingsOpen) && ViewModel.SettingsOpen)
                SettingsOverlay.Bind(App.Mail);
        };
    }

    public async Task InitializeAsync()
    {
        await ViewModel.LoadAsync();
        SetupOverlay.Bind(App.Mail);
        SettingsOverlay.Bind(App.Mail);
        if (ViewModel.Compose is not null)
            ComposeOverlay.Bind(ViewModel.Compose);
        PaletteOverlay.Bind(ViewModel);
    }

    private void ApplyTheme()
    {
        RequestedTheme = ViewModel.Theme switch
        {
            "light" => ElementTheme.Light,
            "dark" => ElementTheme.Dark,
            _ => ElementTheme.Default
        };
    }

    private void RefreshAttachments()
    {
        AttachmentList.Items.Clear();
        var meta = ViewModel.ReadingMessage?.AttachmentsMeta;
        LoadRemoteBtn.Visibility = (!ViewModel.LoadRemoteImages && ViewModel.ReadingMessage is not null)
            ? Visibility.Visible : Visibility.Collapsed;

        if (string.IsNullOrEmpty(meta)) return;
        try
        {
            var list = JsonSerializer.Deserialize<List<AttachmentMeta>>(meta) ?? new();
            foreach (var a in list.Where(x => !x.IsInline))
            {
                var btn = new Button
                {
                    Content = $"{a.Filename} ({FormatSize(a.Size)})",
                    Margin = new Thickness(0, 0, 8, 0),
                    Tag = a
                };
                btn.Click += Attachment_Click;
                AttachmentList.Items.Add(btn);
            }
        }
        catch { }
    }

    private async void LoadRemote_Click(object sender, RoutedEventArgs e)
    {
        if (ViewModel.ReadingMessage is null) return;
        var domain = ViewModel.ReadingMessage.FromAddress?.Split('@').LastOrDefault();
        if (!string.IsNullOrEmpty(domain))
            App.Mail.Db.AllowImageDomain(domain);
        if (ViewModel.SelectedMessage is not null)
            await ViewModel.OpenMessageAsync(ViewModel.SelectedMessage);
    }

    private static string FormatSize(long size) =>
        size < 1024 ? $"{size} B" :
        size < 1024 * 1024 ? $"{size / 1024.0:0.#} KB" :
        $"{size / (1024.0 * 1024):0.#} MB";

    private async void Attachment_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not Button { Tag: AttachmentMeta att } || ViewModel.ReadingMessage is null) return;
        var msg = ViewModel.ReadingMessage;
        var data = await App.Mail.Imap.DownloadAttachmentAsync(msg.AccountId, msg.Folder, msg.Uid, att.Filename);
        if (data is null) return;

        var path = Path.Combine(Core.AppPaths.AttachmentsCacheDir, att.Filename);
        await File.WriteAllBytesAsync(path, data);
        if (att.Filename.EndsWith(".pdf", StringComparison.OrdinalIgnoreCase) ||
            att.ContentType.Contains("pdf", StringComparison.OrdinalIgnoreCase))
        {
            var reader = new PdfPreviewWindow(path, att.Filename);
            reader.Activate();
        }
        else
        {
            await Windows.System.Launcher.LaunchUriAsync(new Uri(path));
        }
    }

    private async void UnifiedInbox_Click(object sender, RoutedEventArgs e)
    {
        await ViewModel.SelectFolderAsync(new FolderNavItem
        {
            Name = "Alle Eingänge",
            FullName = "INBOX",
            IsUnified = true
        });
    }

    private async void AccountInbox_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not FrameworkElement { Tag: AccountNavItem acc }) return;
        await ViewModel.SelectFolderAsync(new FolderNavItem
        {
            Name = "Posteingang",
            FullName = "INBOX",
            AccountId = acc.Account.Id,
            SpecialUse = "Inbox"
        });
    }

    private async void Folder_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not FrameworkElement { Tag: FolderNavItem folder }) return;
        await ViewModel.SelectFolderAsync(folder);
    }

    private async void MailList_ItemClick(object sender, ItemClickEventArgs e)
    {
        if (e.ClickedItem is MailListItem item)
            await ViewModel.OpenMessageAsync(item);
    }

    private async void MailList_SelectionChanged(object sender, SelectionChangedEventArgs e)
    {
        if (MailList.SelectedItem is MailListItem item)
            await ViewModel.OpenMessageAsync(item);
    }

    private void MailList_DoubleTapped(object sender, DoubleTappedRoutedEventArgs e)
    {
        if (ViewModel.ReadingMessage is null || ViewModel.ReadingHtml is null) return;
        var w = new ReaderWindow(ViewModel.ReadingMessage, ViewModel.ReadingHtml);
        w.Activate();
    }

    private async void ThreadMessage_Click(object sender, RoutedEventArgs e)
    {
        if (sender is not FrameworkElement { Tag: CachedMessage msg }) return;
        var item = new MailListItem { Message = msg, ThreadCount = 1, ThreadId = msg.ThreadId };
        await ViewModel.OpenMessageAsync(item);
    }

    private async void Search_QuerySubmitted(AutoSuggestBox sender, AutoSuggestBoxQuerySubmittedEventArgs args)
    {
        ViewModel.SearchText = sender.Text;
        await ViewModel.SearchAsync();
    }

    private async void RootGrid_KeyDown(object sender, KeyRoutedEventArgs e)
    {
        var ctrl = Microsoft.UI.Input.InputKeyboardSource.GetKeyStateForCurrentThread(VirtualKey.Control)
            .HasFlag(Windows.UI.Core.CoreVirtualKeyStates.Down);
        var key = e.Key;

        if (FocusManager.GetFocusedElement(XamlRoot) is TextBox or AutoSuggestBox)
        {
            if (key == VirtualKey.Escape) { ViewModel.ClosePalette(); ViewModel.ComposeOpen = false; }
            return;
        }

        if (ViewModel.PaletteOpen || ViewModel.ComposeOpen || ViewModel.SettingsOpen) return;

        switch (key)
        {
            case VirtualKey.N or VirtualKey.C when !ctrl:
                ViewModel.NewMail(); e.Handled = true; break;
            case VirtualKey.R when !ctrl:
                ViewModel.Reply(); e.Handled = true; break;
            case VirtualKey.A when !ctrl:
                ViewModel.ReplyAll(); e.Handled = true; break;
            case VirtualKey.F when !ctrl:
                ViewModel.Forward(); e.Handled = true; break;
            case VirtualKey.E when !ctrl:
                _ = ViewModel.ArchiveSelectedAsync(); e.Handled = true; break;
            case VirtualKey.Number3 when !ctrl:
            case VirtualKey.Back:
                _ = ViewModel.DeleteSelectedAsync(); e.Handled = true; break;
            case VirtualKey.L when !ctrl:
                _ = ViewModel.ToggleFlagAsync(); e.Handled = true; break;
            case VirtualKey.U when !ctrl:
                _ = ViewModel.ToggleSeenAsync(); e.Handled = true; break;
            case VirtualKey.M when !ctrl:
            case VirtualKey.V when !ctrl:
                {
                    var dest = await Helpers.MoveFolderDialog.PickAsync(XamlRoot, ViewModel);
                    if (dest is not null) await ViewModel.MoveToFolderAsync(dest);
                    e.Handled = true;
                    break;
                }
            case Helpers.KeyMap.Comma:
                ViewModel.OpenSettings(); e.Handled = true; break;
            case VirtualKey.T when !ctrl:
                ViewModel.CycleTheme(); e.Handled = true; break;
            case Helpers.KeyMap.OpenBracket:
                ViewModel.ToggleSidebar(); e.Handled = true; break;
            case VirtualKey.P when !ctrl:
                ViewModel.TogglePreviewPane(); e.Handled = true; break;
            case Helpers.KeyMap.Backslash:
                ViewModel.ToggleConversations(); e.Handled = true; break;
            case Helpers.KeyMap.Period:
            case VirtualKey.F5:
                _ = ViewModel.RefreshMessagesAsync(); e.Handled = true; break;
            case VirtualKey.Divide:
            case Helpers.KeyMap.Oem2 when !ctrl:
                SearchBox.Focus(FocusState.Programmatic); e.Handled = true; break;
            case VirtualKey.K when ctrl:
            case VirtualKey.F1:
                ViewModel.OpenPalette(); e.Handled = true; break;
            case VirtualKey.I when !ctrl:
                _ = ViewModel.SelectFolderAsync(new FolderNavItem { Name = "Alle Eingänge", FullName = "INBOX", IsUnified = true });
                e.Handled = true; break;
            case VirtualKey.O or VirtualKey.Enter:
                if (ViewModel.SelectedMessage is not null)
                    _ = ViewModel.OpenMessageAsync(ViewModel.SelectedMessage);
                e.Handled = true; break;
            case VirtualKey.J:
            case VirtualKey.Down:
                MoveSelection(1); e.Handled = true; break;
            case VirtualKey.K when !ctrl:
            case VirtualKey.Up:
                MoveSelection(-1); e.Handled = true; break;
            case VirtualKey.Escape:
                ViewModel.ClosePalette();
                ViewModel.CloseSettings();
                e.Handled = true; break;
        }

        if (ctrl && key >= VirtualKey.Number1 && key <= VirtualKey.Number9)
        {
            var idx = (int)key - (int)VirtualKey.Number1;
            if (idx < ViewModel.Accounts.Count)
            {
                var acc = ViewModel.Accounts[idx];
                _ = ViewModel.SelectFolderAsync(new FolderNavItem
                {
                    Name = "Posteingang", FullName = "INBOX", AccountId = acc.Account.Id, SpecialUse = "Inbox"
                });
                e.Handled = true;
            }
        }
    }

    private void MoveSelection(int delta)
    {
        if (ViewModel.Messages.Count == 0) return;
        var idx = ViewModel.SelectedMessage is null ? -1 : ViewModel.Messages.IndexOf(ViewModel.SelectedMessage);
        idx = Math.Clamp(idx + delta, 0, ViewModel.Messages.Count - 1);
        MailList.SelectedIndex = idx;
    }

    private void SidebarSplitter_Pressed(object sender, PointerRoutedEventArgs e)
    {
        _draggingSplitter = true; _dragTarget = 0;
        _dragStartX = e.GetCurrentPoint(MainLayout).Position.X;
        _dragStartWidth = SidebarCol.ActualWidth;
        ((UIElement)sender).CapturePointer(e.Pointer);
    }

    private void ListSplitter_Pressed(object sender, PointerRoutedEventArgs e)
    {
        _draggingSplitter = true; _dragTarget = 1;
        _dragStartX = e.GetCurrentPoint(MainLayout).Position.X;
        _dragStartWidth = ListCol.ActualWidth;
        ((UIElement)sender).CapturePointer(e.Pointer);
    }

    private void Splitter_Moved(object sender, PointerRoutedEventArgs e)
    {
        if (!_draggingSplitter) return;
        var x = e.GetCurrentPoint(MainLayout).Position.X;
        var w = Math.Max(160, Math.Min(480, _dragStartWidth + (x - _dragStartX)));
        if (_dragTarget == 0) SidebarCol.Width = new GridLength(w);
        else ListCol.Width = new GridLength(w);
    }

    private void Splitter_Released(object sender, PointerRoutedEventArgs e)
    {
        _draggingSplitter = false;
        ((UIElement)sender).ReleasePointerCapture(e.Pointer);
    }
}
