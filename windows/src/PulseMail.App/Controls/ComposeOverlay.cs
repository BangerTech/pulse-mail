using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using PulseMail.App.ViewModels;
using Windows.Storage.Pickers;

namespace PulseMail.App.Controls;

public sealed class ComposeOverlay : UserControl
{
    public event EventHandler? Closed;

    private ComposeViewModel? _vm;
    private readonly TextBox _to = new() { PlaceholderText = "An" };
    private readonly TextBox _cc = new() { PlaceholderText = "CC", Visibility = Visibility.Collapsed };
    private readonly TextBox _bcc = new() { PlaceholderText = "BCC", Visibility = Visibility.Collapsed };
    private readonly TextBox _subject = new() { PlaceholderText = "Betreff" };
    private readonly ComboBox _account = new() { Width = 220 };
    private readonly MailWebView _editor = new();
    private readonly TextBlock _error = new() { Foreground = new Microsoft.UI.Xaml.Media.SolidColorBrush(Microsoft.UI.Colors.OrangeRed) };
    private readonly ItemsControl _atts = new();

    public ComposeOverlay()
    {
        var header = new Grid { ColumnSpacing = 8, Margin = new Thickness(0, 0, 0, 8) };
        header.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        header.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        header.Children.Add(new TextBlock
        {
            Text = "Neue Nachricht",
            FontSize = 18,
            FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
            VerticalAlignment = VerticalAlignment.Center
        });
        var close = new Button { Content = new FontIcon { Glyph = "\uE711" } };
        close.Click += async (_, _) =>
        {
            try
            {
                if (_vm is not null)
                    await _vm.SaveDraftAsync(async () => await _editor.GetEditorHtmlAsync());
            }
            catch { }
            Closed?.Invoke(this, EventArgs.Empty);
        };
        Grid.SetColumn(close, 1);
        header.Children.Add(close);

        var fields = new StackPanel { Spacing = 6 };
        fields.Children.Add(_account);
        fields.Children.Add(_to);
        var ccToggle = new HyperlinkButton { Content = "CC/BCC" };
        ccToggle.Click += (_, _) =>
        {
            _cc.Visibility = _cc.Visibility == Visibility.Visible ? Visibility.Collapsed : Visibility.Visible;
            _bcc.Visibility = _cc.Visibility;
        };
        fields.Children.Add(ccToggle);
        fields.Children.Add(_cc);
        fields.Children.Add(_bcc);
        fields.Children.Add(_subject);

        var toolbar = new StackPanel { Orientation = Orientation.Horizontal, Spacing = 4, Margin = new Thickness(0, 8, 0, 8) };
        Button Tool(string glyph, string cmd) =>
            new() {
                Content = new FontIcon { Glyph = glyph, FontSize = 14 },
                Tag = cmd
            };
        foreach (var (g, c) in new[] { ("\uE8DD", "bold"), ("\uE8DB", "italic"), ("\uE8DC", "underline") })
        {
            var b = Tool(g, c);
            b.Click += async (s, _) =>
            {
                if (s is Button { Tag: string cmd })
                    await _editor.ExecCommandAsync(cmd);
            };
            toolbar.Children.Add(b);
        }
        var attach = new Button { Content = new FontIcon { Glyph = "\uE723", FontSize = 14 }, ToolTipService.ToolTip = "Anhang" };
        attach.Click += Attach_Click;
        toolbar.Children.Add(attach);

        var send = new Button
        {
            Content = "Senden",
            Style = (Style)Application.Current.Resources["AccentButtonStyle"],
            HorizontalAlignment = HorizontalAlignment.Right,
            Margin = new Thickness(0, 8, 0, 0)
        };
        send.Click += Send_Click;

        var body = new Grid { Height = 320 };
        body.Children.Add(_editor);

        var panel = new StackPanel
        {
            Width = 720,
            Padding = new Thickness(24),
            Spacing = 4,
            Background = (Microsoft.UI.Xaml.Media.Brush)Application.Current.Resources["CardBackgroundFillColorDefaultBrush"]
        };
        panel.Children.Add(header);
        panel.Children.Add(fields);
        panel.Children.Add(toolbar);
        panel.Children.Add(body);
        panel.Children.Add(_atts);
        panel.Children.Add(_error);
        panel.Children.Add(send);

        var border = new Border
        {
            CornerRadius = new CornerRadius(12),
            Child = panel,
            VerticalAlignment = VerticalAlignment.Center,
            HorizontalAlignment = HorizontalAlignment.Center
        };
        var root = new Grid { Background = new Microsoft.UI.Xaml.Media.SolidColorBrush(Windows.UI.Color.FromArgb(160, 0, 0, 0)) };
        root.Children.Add(border);
        Content = root;
        Visibility = Visibility.Collapsed;
    }

    public async void Bind(ComposeViewModel vm)
    {
        _vm = vm;
        _to.Text = vm.To;
        _cc.Text = vm.Cc;
        _bcc.Text = vm.Bcc;
        _subject.Text = vm.Subject;
        _account.Items.Clear();
        foreach (var a in vm.Accounts)
            _account.Items.Add(a.Email);
        _account.SelectedItem = vm.SelectedAccount.Email;
        _error.Text = "";
        await _editor.LoadEditorShellAsync(false);
        await _editor.SetEditorHtmlAsync(vm.HtmlBody);
        RefreshAtts();
    }

    private void RefreshAtts()
    {
        _atts.Items.Clear();
        if (_vm is null) return;
        foreach (var a in _vm.Attachments)
            _atts.Items.Add(new TextBlock { Text = $"{a.Filename} ({a.Size / 1024.0:0.#} KB)" });
    }

    private async void Attach_Click(object sender, RoutedEventArgs e)
    {
        if (_vm is null) return;
        var picker = new FileOpenPicker();
        var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(App.MainWindowInstance);
        WinRT.Interop.InitializeWithWindow.Initialize(picker, hwnd);
        picker.FileTypeFilter.Add("*");
        var file = await picker.PickSingleFileAsync();
        if (file is null) return;
        _vm.AddAttachment(file.Path);
        RefreshAtts();
    }

    private async void Send_Click(object sender, RoutedEventArgs e)
    {
        if (_vm is null) return;
        try
        {
            _vm.To = _to.Text ?? "";
            _vm.Cc = _cc.Text ?? "";
            _vm.Bcc = _bcc.Text ?? "";
            _vm.Subject = _subject.Text ?? "";
            if (_account.SelectedItem is string email)
            {
                var acc = _vm.Accounts.FirstOrDefault(a => a.Email == email);
                if (acc is not null) _vm.SelectedAccount = acc;
            }
            await _vm.SendAsync(async () => await _editor.GetEditorHtmlAsync());
            Closed?.Invoke(this, EventArgs.Empty);
        }
        catch (Exception ex)
        {
            _error.Text = ex.Message;
        }
    }
}
