using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using PulseMail.Core.Models;
using PulseMail.Core.Services;

namespace PulseMail.App.Controls;

public sealed class AccountSetupOverlay : UserControl
{
    public event EventHandler? AccountAdded;

    private MailAppService? _mail;
    private readonly TextBox _name = new() { PlaceholderText = "Anzeigename" };
    private readonly TextBox _email = new() { PlaceholderText = "E-Mail" };
    private readonly PasswordBox _password = new() { PlaceholderText = "Passwort / App-Passwort" };
    private readonly TextBox _imap = new() { Text = "imap.gmail.com" };
    private readonly NumberBox _imapPort = new() { Value = 993, SpinButtonPlacementMode = NumberBoxSpinButtonPlacementMode.Compact };
    private readonly TextBox _smtp = new() { Text = "smtp.gmail.com" };
    private readonly NumberBox _smtpPort = new() { Value = 587, SpinButtonPlacementMode = NumberBoxSpinButtonPlacementMode.Compact };
    private readonly ComboBox _preset = new();
    private readonly TextBlock _error = new() { Foreground = new Microsoft.UI.Xaml.Media.SolidColorBrush(Microsoft.UI.Colors.OrangeRed), TextWrapping = TextWrapping.Wrap };
    private readonly ProgressRing _busy = new() { Width = 24, Height = 24, Visibility = Visibility.Collapsed };

    public AccountSetupOverlay()
    {
        foreach (var p in AccountPresets.All)
            _preset.Items.Add(p.Name);
        _preset.SelectedIndex = 0;
        _preset.SelectionChanged += (_, _) =>
        {
            if (_preset.SelectedItem is not string name) return;
            var p = AccountPresets.All.First(x => x.Name == name);
            _imap.Text = p.ImapHost;
            _imapPort.Value = p.ImapPort;
            _smtp.Text = p.SmtpHost;
            _smtpPort.Value = p.SmtpPort;
        };

        var panel = new StackPanel
        {
            Width = 420,
            Spacing = 10,
            Padding = new Thickness(28),
            Background = (Microsoft.UI.Xaml.Media.Brush)Application.Current.Resources["CardBackgroundFillColorDefaultBrush"]
        };
        panel.Children.Add(new TextBlock { Text = "Pulse Mail", FontSize = 24, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold, HorizontalAlignment = HorizontalAlignment.Center });
        panel.Children.Add(new TextBlock { Text = "Postfach hinzufügen — kein Server, kein Extra-Login.", Opacity = 0.7, TextWrapping = TextWrapping.Wrap, HorizontalAlignment = HorizontalAlignment.Center });
        panel.Children.Add(new TextBlock { Text = "Vorlage", FontSize = 12, Opacity = 0.6 });
        panel.Children.Add(_preset);
        panel.Children.Add(_name);
        panel.Children.Add(_email);
        panel.Children.Add(_password);
        panel.Children.Add(new TextBlock { Text = "IMAP", FontSize = 12, Opacity = 0.6 });
        panel.Children.Add(_imap);
        panel.Children.Add(_imapPort);
        panel.Children.Add(new TextBlock { Text = "SMTP", FontSize = 12, Opacity = 0.6 });
        panel.Children.Add(_smtp);
        panel.Children.Add(_smtpPort);
        panel.Children.Add(_error);
        panel.Children.Add(_busy);

        var save = new Button { Content = "Verbinden", Style = (Style)Application.Current.Resources["AccentButtonStyle"], HorizontalAlignment = HorizontalAlignment.Stretch };
        save.Click += Save_Click;
        panel.Children.Add(save);

        var oauthHint = new TextBlock
        {
            Text = "Gmail/Microsoft: App-Passwort oder OAuth unter Einstellungen → OAuth (Client-ID).",
            FontSize = 12, Opacity = 0.55, TextWrapping = TextWrapping.Wrap, Margin = new Thickness(0, 8, 0, 0)
        };
        panel.Children.Add(oauthHint);

        var border = new Border
        {
            CornerRadius = new CornerRadius(16),
            Child = panel,
            VerticalAlignment = VerticalAlignment.Center,
            HorizontalAlignment = HorizontalAlignment.Center
        };

        var root = new Grid { Background = new Microsoft.UI.Xaml.Media.SolidColorBrush(Windows.UI.Color.FromArgb(180, 0, 0, 0)) };
        root.Children.Add(border);
        Content = root;
    }

    public void Bind(MailAppService mail) => _mail = mail;

    private async void Save_Click(object sender, RoutedEventArgs e)
    {
        if (_mail is null) return;
        try
        {
            _busy.Visibility = Visibility.Visible;
            _busy.IsActive = true;
            _error.Text = "";
            var email = _email.Text?.Trim() ?? "";
            var pass = _password.Password ?? "";
            if (string.IsNullOrEmpty(email) || string.IsNullOrEmpty(pass))
                throw new InvalidOperationException("E-Mail und Passwort sind Pflicht.");

            var account = new Account
            {
                Name = string.IsNullOrWhiteSpace(_name.Text) ? email.Split('@')[0] : _name.Text.Trim(),
                Email = email,
                Username = email,
                ImapHost = _imap.Text?.Trim() ?? "",
                ImapPort = (int)_imapPort.Value,
                SmtpHost = _smtp.Text?.Trim() ?? "",
                SmtpPort = (int)_smtpPort.Value,
                Color = "#007AFF",
                AuthType = "password"
            };
            await _mail.Imap.AddAccountAndConnectAsync(account, pass);
            AccountAdded?.Invoke(this, EventArgs.Empty);
        }
        catch (Exception ex)
        {
            _error.Text = ex.Message;
        }
        finally
        {
            _busy.IsActive = false;
            _busy.Visibility = Visibility.Collapsed;
        }
    }
}
