using System;
using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using PulseMail.App.Controls;
using PulseMail.App.Helpers;
using PulseMail.Core.Models;
using Windows.Storage;

namespace PulseMail.App;

public sealed class ReaderWindow : Window
{
    private bool _navigated;

    public ReaderWindow(CachedMessage message, string html, bool dark)
    {
        Title = message.Subject ?? "Nachricht";

        // Theme-aware colors matching the reading pane.
        var fg = dark ? Windows.UI.Color.FromArgb(255, 0xF5, 0xF5, 0xF7) : Windows.UI.Color.FromArgb(255, 0x1D, 0x1D, 0x1F);
        var fgSecondary = dark ? Windows.UI.Color.FromArgb(255, 0x98, 0x98, 0x9D) : Windows.UI.Color.FromArgb(255, 0x86, 0x86, 0x8B);
        var fgTertiary = dark ? Windows.UI.Color.FromArgb(255, 0x6E, 0x6E, 0x73) : Windows.UI.Color.FromArgb(255, 0xAE, 0xAE, 0xB2);
        var border = dark ? Windows.UI.Color.FromArgb(0x1F, 0xFF, 0xFF, 0xFF) : Windows.UI.Color.FromArgb(0x1A, 0x00, 0x00, 0x00);
        var canvas = dark ? Windows.UI.Color.FromArgb(255, 0x1A, 0x1B, 0x1F) : Windows.UI.Color.FromArgb(255, 0xFF, 0xFF, 0xFF);
        var avatarColor = ColorFromHex(SenderAvatar.ColorHex(message.FromAddress ?? message.DisplayName ?? "?"));

        var web = new MailWebView();
        web.SetBackground(dark);

        // Header
        var header = new Grid { Padding = new Thickness(20, 16, 20, 14), ColumnSpacing = 12 };
        header.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        header.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        header.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        header.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });

        var subject = new TextBlock
        {
            Text = string.IsNullOrWhiteSpace(message.Subject) ? "(kein Betreff)" : message.Subject!,
            FontSize = 20,
            FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
            TextWrapping = TextWrapping.Wrap,
            Foreground = new SolidColorBrush(fg),
            Margin = new Thickness(0, 0, 0, 12)
        };
        Grid.SetColumnSpan(subject, 2);
        Grid.SetRow(subject, 0);
        header.Children.Add(subject);

        var initial = (message.DisplayName ?? message.FromAddress ?? "?").Trim();
        var avatar = new Border
        {
            Width = 40,
            Height = 40,
            CornerRadius = new CornerRadius(20),
            Background = new SolidColorBrush(avatarColor),
            VerticalAlignment = VerticalAlignment.Center,
            Child = new TextBlock
            {
                Text = string.IsNullOrEmpty(initial) ? "?" : initial[..1].ToUpperInvariant(),
                FontSize = 15,
                FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
                Foreground = new SolidColorBrush(Windows.UI.Color.FromArgb(255, 255, 255, 255)),
                HorizontalAlignment = HorizontalAlignment.Center,
                VerticalAlignment = VerticalAlignment.Center
            }
        };
        Grid.SetRow(avatar, 1);
        Grid.SetColumn(avatar, 0);
        header.Children.Add(avatar);

        var meta = new StackPanel { Spacing = 2, VerticalAlignment = VerticalAlignment.Center };
        var nameRow = new Grid();
        nameRow.ColumnDefinitions.Add(new ColumnDefinition { Width = new GridLength(1, GridUnitType.Star) });
        nameRow.ColumnDefinitions.Add(new ColumnDefinition { Width = GridLength.Auto });
        var fromName = new TextBlock
        {
            Text = string.IsNullOrWhiteSpace(message.DisplayName) ? (message.FromAddress ?? "") : message.DisplayName!,
            FontSize = 14,
            FontWeight = Microsoft.UI.Text.FontWeights.SemiBold,
            Foreground = new SolidColorBrush(fg),
            TextTrimming = TextTrimming.CharacterEllipsis
        };
        var dateText = new TextBlock
        {
            Text = message.Date?.ToLocalTime().ToString("dd.MM.yyyy HH:mm") ?? "",
            FontSize = 12,
            Foreground = new SolidColorBrush(fgTertiary),
            VerticalAlignment = VerticalAlignment.Center
        };
        Grid.SetColumn(dateText, 1);
        nameRow.Children.Add(fromName);
        nameRow.Children.Add(dateText);
        meta.Children.Add(nameRow);
        meta.Children.Add(new TextBlock
        {
            Text = message.FromAddress ?? "",
            FontSize = 12,
            Foreground = new SolidColorBrush(fgSecondary),
            TextTrimming = TextTrimming.CharacterEllipsis
        });
        Grid.SetRow(meta, 1);
        Grid.SetColumn(meta, 1);
        header.Children.Add(meta);

        var divider = new Border { Height = 1, Background = new SolidColorBrush(border) };

        var root = new Grid { Background = new SolidColorBrush(canvas) };
        root.RequestedTheme = dark ? ElementTheme.Dark : ElementTheme.Light;
        root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        Grid.SetRow(header, 0);
        Grid.SetRow(divider, 1);
        Grid.SetRow(web, 2);
        root.Children.Add(header);
        root.Children.Add(divider);
        root.Children.Add(web);
        Content = root;

        // Restore size/position
        try
        {
            var w = App.Mail.Db.GetSetting("reader.width");
            var h = App.Mail.Db.GetSetting("reader.height");
            if (int.TryParse(w, out var ww) && int.TryParse(h, out var hh))
                AppWindow.Resize(new Windows.Graphics.SizeInt32(ww, hh));
            else AppWindow.Resize(new Windows.Graphics.SizeInt32(900, 700));
        }
        catch { AppWindow.Resize(new Windows.Graphics.SizeInt32(900, 700)); }

        Closed += (_, _) =>
        {
            try
            {
                var size = AppWindow.Size;
                App.Mail.Db.SetSetting("reader.width", size.Width.ToString());
                App.Mail.Db.SetSetting("reader.height", size.Height.ToString());
            }
            catch { }
        };

        // Navigate exactly once — Activated fires on every focus change, so a
        // guard keeps the mail from reloading (and flickering) each time.
        Activated += async (_, _) =>
        {
            if (_navigated) return;
            _navigated = true;
            await web.NavigateHtmlAsync(html);
        };
    }

    private static Windows.UI.Color ColorFromHex(string hex)
    {
        try
        {
            hex = hex.TrimStart('#');
            if (hex.Length == 6)
                return Windows.UI.Color.FromArgb(255,
                    Convert.ToByte(hex.Substring(0, 2), 16),
                    Convert.ToByte(hex.Substring(2, 2), 16),
                    Convert.ToByte(hex.Substring(4, 2), 16));
        }
        catch { }
        return Windows.UI.Color.FromArgb(255, 0x0A, 0x84, 0xFF);
    }
}

public sealed class PdfPreviewWindow : Window
{
    public PdfPreviewWindow(string path, string title)
    {
        Title = title;
        var web = new WebView2();
        Content = web;
        AppWindow.Resize(new Windows.Graphics.SizeInt32(900, 700));
        Activated += async (_, _) =>
        {
            await web.EnsureCoreWebView2Async();
            web.CoreWebView2.Navigate(new Uri(path).AbsoluteUri);
        };
    }
}
