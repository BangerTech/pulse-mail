using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using PulseMail.App.ViewModels;
using PulseMail.Core.Services;

namespace PulseMail.App.Controls;

public sealed class SettingsOverlay : UserControl
{
    public event EventHandler? Closed;
    public event EventHandler? AccountsChanged;

    private SettingsViewModel? _vm;
    private readonly Frame _frame = new();
    private readonly NavigationView _nav = new()
    {
        PaneDisplayMode = NavigationViewPaneDisplayMode.Left,
        IsBackButtonVisible = NavigationViewBackButtonVisible.Collapsed,
        IsSettingsVisible = false,
        Width = 860,
        Height = 620
    };

    public SettingsOverlay()
    {
        _nav.MenuItems.Add(new NavigationViewItem { Content = "Konten", Tag = "accounts", Icon = new FontIcon { Glyph = "\uE716" } });
        _nav.MenuItems.Add(new NavigationViewItem { Content = "Darstellung", Tag = "appearance", Icon = new FontIcon { Glyph = "\uE790" } });
        _nav.MenuItems.Add(new NavigationViewItem { Content = "Hinweise", Tag = "notify", Icon = new FontIcon { Glyph = "\uEA8F" } });
        _nav.MenuItems.Add(new NavigationViewItem { Content = "Signaturen", Tag = "signatures", Icon = new FontIcon { Glyph = "\uE8A5" } });
        _nav.MenuItems.Add(new NavigationViewItem { Content = "OAuth", Tag = "oauth", Icon = new FontIcon { Glyph = "\uE72E" } });
        _nav.MenuItems.Add(new NavigationViewItem { Content = "Info", Tag = "info", Icon = new FontIcon { Glyph = "\uE946" } });
        _nav.Content = _frame;
        _nav.SelectionChanged += Nav_SelectionChanged;

        var close = new Button
        {
            Content = new FontIcon { Glyph = "\uE711" },
            HorizontalAlignment = HorizontalAlignment.Right,
            VerticalAlignment = VerticalAlignment.Top,
            Margin = new Thickness(0, 8, 8, 0)
        };
        close.Click += (_, _) => Closed?.Invoke(this, EventArgs.Empty);

        var card = new Grid
        {
            Width = 900,
            Height = 660,
            Background = (Microsoft.UI.Xaml.Media.Brush)Application.Current.Resources["CardBackgroundFillColorDefaultBrush"]
        };
        card.Children.Add(_nav);
        card.Children.Add(close);

        var border = new Border
        {
            CornerRadius = new CornerRadius(12),
            Child = card,
            VerticalAlignment = VerticalAlignment.Center,
            HorizontalAlignment = HorizontalAlignment.Center
        };
        var root = new Grid { Background = new Microsoft.UI.Xaml.Media.SolidColorBrush(Windows.UI.Color.FromArgb(160, 0, 0, 0)) };
        root.Children.Add(border);
        root.PointerPressed += (s, e) =>
        {
            if (e.OriginalSource == root) Closed?.Invoke(this, EventArgs.Empty);
        };
        Content = root;
        Visibility = Visibility.Collapsed;
    }

    public void Bind(MailAppService mail)
    {
        _vm = new SettingsViewModel(mail);
        _nav.SelectedItem = _nav.MenuItems[0];
    }

    private void Nav_SelectionChanged(NavigationView sender, NavigationViewSelectionChangedEventArgs args)
    {
        if (_vm is null || args.SelectedItem is not NavigationViewItem item) return;
        var tag = item.Tag as string ?? "accounts";
        _frame.Content = tag switch
        {
            "accounts" => BuildAccounts(),
            "appearance" => BuildAppearance(),
            "notify" => BuildNotify(),
            "signatures" => BuildSignatures(),
            "oauth" => BuildOAuth(),
            _ => BuildInfo()
        };
    }

    private UIElement BuildAccounts()
    {
        var panel = new StackPanel { Padding = new Thickness(24), Spacing = 12 };
        panel.Children.Add(new TextBlock { Text = "Konten", FontSize = 20, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold });
        var add = new Button { Content = "Postfach hinzufügen", Style = (Style)Application.Current.Resources["AccentButtonStyle"] };
        add.Click += (_, _) =>
        {
            // Reuse setup flow via NeedsSetup-like wizard in settings
            var dlg = new ContentDialog
            {
                Title = "Postfach",
                PrimaryButtonText = "Schließen",
                XamlRoot = XamlRoot,
                Content = new TextBlock { Text = "Schließe die Einstellungen und nutze den Einrichtungsdialog, oder trage IMAP unten manuell über den Assistenten ein.", TextWrapping = TextWrapping.Wrap }
            };
            _ = ShowWizardAsync();
        };
        panel.Children.Add(add);

        if (_vm is not null)
        {
            foreach (var a in _vm.Accounts)
            {
                var row = new Grid { ColumnSpacing = 12 };
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
                row.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
                var info = new StackPanel();
                info.Children.Add(new TextBlock { Text = a.Name, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold });
                info.Children.Add(new TextBlock { Text = $"{a.Email} · {a.ImapHost}", Opacity = 0.6, FontSize = 12 });
                Grid.SetColumn(info, 0);
                var del = new Button { Content = "Löschen", Tag = a };
                del.Click += async (s, _) =>
                {
                    if (s is Button { Tag: Core.Models.Account acc } && _vm is not null)
                    {
                        await _vm.DeleteAccountAsync(acc);
                        AccountsChanged?.Invoke(this, EventArgs.Empty);
                        _nav.SelectedItem = _nav.MenuItems[0];
                    }
                };
                Grid.SetColumn(del, 1);
                row.Children.Add(info);
                row.Children.Add(del);
                panel.Children.Add(row);
            }
        }
        return new ScrollViewer { Content = panel };
    }

    private async Task ShowWizardAsync()
    {
        if (_vm is null) return;
        _vm.OpenWizard();
        var name = new TextBox { PlaceholderText = "Name", Text = _vm.WizardName };
        var email = new TextBox { PlaceholderText = "E-Mail", Text = _vm.WizardEmail };
        var pass = new PasswordBox { PlaceholderText = "Passwort" };
        var imap = new TextBox { Text = _vm.WizardImapHost };
        var smtp = new TextBox { Text = _vm.WizardSmtpHost };
        var stack = new StackPanel { Spacing = 8 };
        stack.Children.Add(name); stack.Children.Add(email); stack.Children.Add(pass);
        stack.Children.Add(new TextBlock { Text = "IMAP" }); stack.Children.Add(imap);
        stack.Children.Add(new TextBlock { Text = "SMTP" }); stack.Children.Add(smtp);
        var dlg = new ContentDialog
        {
            Title = "Postfach hinzufügen",
            PrimaryButtonText = "Verbinden",
            CloseButtonText = "Abbrechen",
            Content = stack,
            XamlRoot = XamlRoot
        };
        if (await dlg.ShowAsync() == ContentDialogResult.Primary)
        {
            _vm.WizardName = name.Text ?? "";
            _vm.WizardEmail = email.Text ?? "";
            _vm.WizardPassword = pass.Password ?? "";
            _vm.WizardUsername = email.Text ?? "";
            _vm.WizardImapHost = imap.Text ?? "";
            _vm.WizardSmtpHost = smtp.Text ?? "";
            await _vm.SaveAccountAsync();
            if (_vm.WizardError is not null)
            {
                var err = new ContentDialog { Title = "Fehler", Content = _vm.WizardError, CloseButtonText = "OK", XamlRoot = XamlRoot };
                await err.ShowAsync();
            }
            else
            {
                AccountsChanged?.Invoke(this, EventArgs.Empty);
                _nav.SelectedItem = _nav.MenuItems[0];
            }
        }
    }

    private UIElement BuildAppearance()
    {
        var panel = new StackPanel { Padding = new Thickness(24), Spacing = 12 };
        panel.Children.Add(new TextBlock { Text = "Darstellung", FontSize = 20, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold });
        if (_vm is null) return panel;

        panel.Children.Add(LabeledCombo("Theme", new[] { "system", "light", "dark" }, _vm.Theme, v => { _vm.Theme = v; _vm.SaveAppearance(); }));
        panel.Children.Add(LabeledCombo("Dichte", new[] { "comfortable", "compact" }, _vm.Density, v => { _vm.Density = v; _vm.SaveAppearance(); }));
        panel.Children.Add(LabeledCombo("Vorschau", new[] { "right", "bottom" }, _vm.PreviewPane, v => { _vm.PreviewPane = v; _vm.SaveAppearance(); }));
        panel.Children.Add(LabeledToggle("Externe Bilder laden", _vm.LoadRemoteImages, v => { _vm.LoadRemoteImages = v; _vm.SaveAppearance(); }));
        panel.Children.Add(LabeledToggle("Konversationen", _vm.Conversations, v => { _vm.Conversations = v; _vm.SaveAppearance(); }));
        panel.Children.Add(LabeledToggle("Löschen bestätigen", _vm.ConfirmDelete, v => { _vm.ConfirmDelete = v; _vm.SaveAppearance(); }));
        panel.Children.Add(LabeledToggle("Ungelesen im Titel", _vm.ShowTabUnread, v => { _vm.ShowTabUnread = v; _vm.SaveAppearance(); }));
        return new ScrollViewer { Content = panel };
    }

    private UIElement BuildNotify()
    {
        var panel = new StackPanel { Padding = new Thickness(24), Spacing = 12 };
        panel.Children.Add(new TextBlock { Text = "Hinweise", FontSize = 20, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold });
        if (_vm is null) return panel;
        panel.Children.Add(LabeledToggle("Desktop-Hinweis", _vm.NotifyDesktop, v => { _vm.NotifyDesktop = v; _vm.SaveNotifications(); }));
        panel.Children.Add(LabeledToggle("Ton", _vm.NotifySound, v => { _vm.NotifySound = v; _vm.SaveNotifications(); }));
        panel.Children.Add(LabeledToggle("Auch im Vordergrund", _vm.NotifyWhenFocused, v => { _vm.NotifyWhenFocused = v; _vm.SaveNotifications(); }));
        var slider = new Slider { Minimum = 0, Maximum = 1, StepFrequency = 0.05, Value = _vm.NotifyVolume, Width = 240 };
        slider.ValueChanged += (_, e) => { _vm.NotifyVolume = e.NewValue; _vm.SaveNotifications(); };
        panel.Children.Add(new TextBlock { Text = "Lautstärke" });
        panel.Children.Add(slider);
        var test = new Button { Content = "Ton testen" };
        test.Click += (_, _) => Services.NotificationService.PlaySound(App.Mail);
        panel.Children.Add(test);
        return panel;
    }

    private UIElement BuildSignatures()
    {
        var panel = new StackPanel { Padding = new Thickness(24), Spacing = 12 };
        panel.Children.Add(new TextBlock { Text = "Signaturen", FontSize = 20, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold });
        var add = new Button { Content = "Neu" };
        add.Click += async (_, _) =>
        {
            if (_vm is null) return;
            _vm.NewSignature();
            await EditSigDialogAsync();
        };
        panel.Children.Add(add);
        if (_vm is not null)
        {
            foreach (var s in _vm.Signatures)
            {
                var row = new StackPanel { Spacing = 4, Margin = new Thickness(0, 0, 0, 8) };
                row.Children.Add(new TextBlock { Text = s.Name + (s.IsDefault ? " (Standard)" : ""), FontWeight = Microsoft.UI.Text.FontWeights.SemiBold });
                var edit = new Button { Content = "Bearbeiten", Tag = s, Margin = new Thickness(0, 0, 8, 0) };
                edit.Click += async (sender, _) =>
                {
                    if (sender is Button { Tag: Core.Models.Signature sig })
                    {
                        _vm.EditSignature(sig);
                        await EditSigDialogAsync();
                    }
                };
                var del = new Button { Content = "Löschen", Tag = s };
                del.Click += (sender, _) =>
                {
                    if (sender is Button { Tag: Core.Models.Signature sig })
                    {
                        _vm.DeleteSignature(sig);
                        _nav.SelectedItem = _nav.MenuItems[3];
                    }
                };
                var btns = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 8 };
                btns.Children.Add(edit); btns.Children.Add(del);
                row.Children.Add(btns);
                panel.Children.Add(row);
            }
        }
        return new ScrollViewer { Content = panel };
    }

    private async Task EditSigDialogAsync()
    {
        if (_vm is null) return;
        var name = new TextBox { Text = _vm.SigName };
        var content = new TextBox { Text = _vm.SigContent, AcceptsReturn = true, Height = 160, TextWrapping = TextWrapping.Wrap };
        var def = new CheckBox { Content = "Standard", IsChecked = _vm.SigDefault };
        var stack = new StackPanel { Spacing = 8 };
        stack.Children.Add(name); stack.Children.Add(content); stack.Children.Add(def);
        var dlg = new ContentDialog
        {
            Title = "Signatur",
            PrimaryButtonText = "Speichern",
            CloseButtonText = "Abbrechen",
            Content = stack,
            XamlRoot = XamlRoot
        };
        if (await dlg.ShowAsync() == ContentDialogResult.Primary)
        {
            _vm.SigName = name.Text ?? "";
            _vm.SigContent = content.Text ?? "";
            _vm.SigDefault = def.IsChecked == true;
            _vm.SaveSignature();
            _nav.SelectedItem = _nav.MenuItems[3];
        }
    }

    private UIElement BuildOAuth()
    {
        var panel = new StackPanel { Padding = new Thickness(24), Spacing = 12 };
        panel.Children.Add(new TextBlock { Text = "OAuth", FontSize = 20, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold });
        panel.Children.Add(new TextBlock
        {
            Text = "Google-Cloud- bzw. Azure-App-Registrierung. Redirect: http://127.0.0.1:8733/",
            TextWrapping = TextWrapping.Wrap, Opacity = 0.7
        });
        if (_vm is null) return panel;
        var g = new TextBox { Header = "Google Client-ID", Text = _vm.GoogleClientId };
        var m = new TextBox { Header = "Microsoft Client-ID", Text = _vm.MicrosoftClientId };
        panel.Children.Add(g); panel.Children.Add(m);
        var save = new Button { Content = "Speichern", Style = (Style)Application.Current.Resources["AccentButtonStyle"] };
        save.Click += (_, _) =>
        {
            _vm.GoogleClientId = g.Text ?? "";
            _vm.MicrosoftClientId = m.Text ?? "";
            _vm.SaveOAuth();
        };
        panel.Children.Add(save);

        var googleBtn = new Button { Content = "Mit Google verbinden (PKCE)", Margin = new Thickness(0, 12, 0, 0) };
        googleBtn.Click += async (_, _) => await RunOAuthAsync("google");
        var msBtn = new Button { Content = "Mit Microsoft verbinden (PKCE)" };
        msBtn.Click += async (_, _) => await RunOAuthAsync("microsoft");
        panel.Children.Add(googleBtn);
        panel.Children.Add(msBtn);
        return panel;
    }

    private async Task RunOAuthAsync(string provider)
    {
        if (_vm is null) return;
        var clientId = provider == "google" ? _vm.GoogleClientId : _vm.MicrosoftClientId;
        if (string.IsNullOrWhiteSpace(clientId))
        {
            var err = new ContentDialog { Title = "OAuth", Content = "Client-ID fehlt.", CloseButtonText = "OK", XamlRoot = XamlRoot };
            await err.ShowAsync();
            return;
        }
        try
        {
            await Services.OAuthBrowserFlow.ConnectAsync(App.Mail, provider, clientId);
            AccountsChanged?.Invoke(this, EventArgs.Empty);
            var ok = new ContentDialog { Title = "Verbunden", Content = "Konto wurde hinzugefügt.", CloseButtonText = "OK", XamlRoot = XamlRoot };
            await ok.ShowAsync();
        }
        catch (Exception ex)
        {
            var err = new ContentDialog { Title = "OAuth fehlgeschlagen", Content = ex.Message, CloseButtonText = "OK", XamlRoot = XamlRoot };
            await err.ShowAsync();
        }
    }

    private UIElement BuildInfo()
    {
        var panel = new StackPanel { Padding = new Thickness(24), Spacing = 8 };
        panel.Children.Add(new TextBlock { Text = "Info", FontSize = 20, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold });
        panel.Children.Add(new TextBlock { Text = $"Pulse Mail Native {Core.AppPaths.Version}" });
        panel.Children.Add(new TextBlock { Text = $"App-ID: {Core.AppPaths.AppId}", Opacity = 0.7 });
        panel.Children.Add(new TextBlock { Text = $"Daten: {Core.AppPaths.DataRoot}", Opacity = 0.7, TextWrapping = TextWrapping.Wrap });
        panel.Children.Add(new TextBlock
        {
            Text = "Eigenständige WinUI-App — Docker und die Tauri-Server-Hülle bleiben separate Produkte.",
            TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 12, 0, 0)
        });
        return panel;
    }

    private static UIElement LabeledCombo(string label, string[] options, string current, Action<string> onChange)
    {
        var combo = new ComboBox { Width = 200 };
        foreach (var o in options) combo.Items.Add(o);
        combo.SelectedItem = current;
        combo.SelectionChanged += (_, _) =>
        {
            if (combo.SelectedItem is string s) onChange(s);
        };
        var stack = new StackPanel { Spacing = 4 };
        stack.Children.Add(new TextBlock { Text = label });
        stack.Children.Add(combo);
        return stack;
    }

    private static UIElement LabeledToggle(string label, bool value, Action<bool> onChange)
    {
        var t = new ToggleSwitch { Header = label, IsOn = value };
        t.Toggled += (_, _) => onChange(t.IsOn);
        return t;
    }
}
