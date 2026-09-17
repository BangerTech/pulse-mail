using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using PulseMail.App.Controls;
using PulseMail.Core.Models;
using Windows.Storage;

namespace PulseMail.App;

public sealed class ReaderWindow : Window
{
    public ReaderWindow(CachedMessage message, string html)
    {
        Title = message.Subject ?? "Nachricht";
        var web = new MailWebView();
        var header = new StackPanel { Padding = new Thickness(16), Spacing = 4 };
        header.Children.Add(new TextBlock { Text = message.Subject ?? "", FontSize = 20, FontWeight = Microsoft.UI.Text.FontWeights.SemiBold, TextWrapping = TextWrapping.Wrap });
        header.Children.Add(new TextBlock { Text = $"{message.DisplayName} <{message.FromAddress}>", Opacity = 0.7 });

        var root = new Grid();
        root.RowDefinitions.Add(new RowDefinition { Height = GridLength.Auto });
        root.RowDefinitions.Add(new RowDefinition { Height = new GridLength(1, GridUnitType.Star) });
        Grid.SetRow(header, 0);
        Grid.SetRow(web, 1);
        root.Children.Add(header);
        root.Children.Add(web);
        Content = root;

        // Restore size/position
        try
        {
            var w = App.Mail.Db.GetSetting("reader.width");
            var h = App.Mail.Db.GetSetting("reader.height");
            if (int.TryParse(w, out var ww) && int.TryParse(h, out var hh))
            {
                AppWindow.Resize(new Windows.Graphics.SizeInt32(ww, hh));
            }
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

        Activated += async (_, _) => await web.NavigateHtmlAsync(html);
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
