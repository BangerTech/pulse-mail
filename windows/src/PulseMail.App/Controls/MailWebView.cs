using Microsoft.UI.Xaml.Controls;
using Microsoft.Web.WebView2.Core;

namespace PulseMail.App.Controls;

public sealed class MailWebView : UserControl
{
    private readonly WebView2 _web = new();
    private bool _ready;

    public MailWebView()
    {
        Content = _web;
        _ = EnsureAsync();
    }

    private async Task EnsureAsync()
    {
        await _web.EnsureCoreWebView2Async();
        _web.CoreWebView2.Settings.AreDefaultContextMenusEnabled = true;
        _web.CoreWebView2.Settings.IsZoomControlEnabled = true;
        _web.CoreWebView2.Settings.AreDevToolsEnabled = false;
        _ready = true;
    }

    public async Task NavigateHtmlAsync(string html)
    {
        if (!_ready) await EnsureAsync();
        _web.NavigateToString(html);
    }

    public async Task<string> GetEditorHtmlAsync()
    {
        if (!_ready) await EnsureAsync();
        try
        {
            var result = await _web.ExecuteScriptAsync("window.getHtml ? window.getHtml() : document.body.innerHTML");
            // ExecuteScriptAsync returns JSON-encoded string
            return System.Text.Json.JsonSerializer.Deserialize<string>(result) ?? "";
        }
        catch { return ""; }
    }

    public async Task SetEditorHtmlAsync(string html)
    {
        if (!_ready) await EnsureAsync();
        var payload = System.Text.Json.JsonSerializer.Serialize(html ?? "");
        await _web.ExecuteScriptAsync($"window.setHtml && window.setHtml({payload})");
    }

    public async Task LoadEditorShellAsync(bool dark)
    {
        await NavigateHtmlAsync(Core.Html.MailHtmlBuilder.EditorShell(dark));
    }

    public async Task ExecCommandAsync(string command)
    {
        if (!_ready) await EnsureAsync();
        var safe = command.Replace("'", "\\'");
        await _web.ExecuteScriptAsync($"document.execCommand('{safe}')");
    }
}
