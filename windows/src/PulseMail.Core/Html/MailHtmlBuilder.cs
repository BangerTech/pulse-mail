using System.Net;
using System.Text;
using System.Text.RegularExpressions;

namespace PulseMail.Core.Html;

/// <summary>
/// Builds a sandboxed HTML5 document for WebView2, matching the web app's
/// mail-html.ts behaviour: cid: resolution, remote-image blocking, dark mode.
/// </summary>
public static class MailHtmlBuilder
{
    public static string BuildDocument(
        string? htmlBody,
        string? textBody,
        IReadOnlyDictionary<string, string>? cidMap = null,
        bool blockRemote = false,
        bool darkMode = false,
        IReadOnlySet<string>? allowlist = null)
    {
        string body;
        if (!string.IsNullOrWhiteSpace(htmlBody))
        {
            body = htmlBody!;
            if (cidMap is not null)
                body = ResolveCid(body, cidMap);
            if (blockRemote)
                body = BlockRemoteImages(body, allowlist);
        }
        else
        {
            body = PlainTextToHtml(textBody ?? "");
        }

        var darkCss = darkMode ? DarkModeCss : "";
        return $$"""
            <!DOCTYPE html>
            <html>
            <head>
            <meta charset="utf-8"/>
            <meta name="viewport" content="width=device-width, initial-scale=1"/>
            <style>
              :root { color-scheme: {{(darkMode ? "dark" : "light")}}; }
              html, body { margin: 0; padding: 0; height: auto !important; min-height: 0 !important; }
              html { background: {{(darkMode ? "#1a1b1f" : "#ffffff")}}; }
              body {
                font: 15px/1.65 -apple-system, system-ui, "Segoe UI", Roboto, sans-serif;
                color: {{(darkMode ? "#f5f5f7" : "#1d1d1f")}};
                background: {{(darkMode ? "#1a1b1f" : "#ffffff")}};
                padding: 16px 20px;
                word-wrap: break-word;
                overflow-wrap: anywhere;
              }
              img { max-width: 100%; height: auto; }
              a { color: #0a84ff; }
              blockquote {
                margin: 0.5em 0; padding-left: 12px;
                border-left: 3px solid {{(darkMode ? "rgba(255,255,255,0.2)" : "rgba(0,0,0,0.15)")}};
                color: {{(darkMode ? "#a1a1a6" : "#6e6e73")}};
              }
              {{darkCss}}
            </style>
            </head>
            <body>{{body}}</body>
            </html>
            """;
    }

    private const string DarkModeCss = """
        body, body * { color: #f5f5f7 !important; }
        body a, body a * { color: #0a84ff !important; }
        table[bgcolor], td[bgcolor], th[bgcolor],
        table[style*="background"], td[style*="background"],
        div[style*="background-color:#fff"], div[style*="background-color: #fff"],
        div[style*="background-color:#ffffff"], div[style*="background:#fff"] {
          background: transparent !important; background-color: transparent !important;
        }
        """;

    private static string ResolveCid(string html, IReadOnlyDictionary<string, string> cidMap)
    {
        return Regex.Replace(html, @"src\s*=\s*[""']cid:([^""']+)[""']", m =>
        {
            var cid = m.Groups[1].Value.Trim('<', '>');
            if (cidMap.TryGetValue(cid, out var dataUri) ||
                cidMap.TryGetValue($"<{cid}>", out dataUri))
                return $"src=\"{dataUri}\"";
            return m.Value;
        }, RegexOptions.IgnoreCase);
    }

    private static string BlockRemoteImages(string html, IReadOnlySet<string>? allowlist)
    {
        return Regex.Replace(html, @"\b(src|srcset)\s*=\s*([""'])(https?:[^""']+)\2", m =>
        {
            var url = m.Groups[3].Value;
            if (allowlist is not null && IsAllowed(url, allowlist))
                return m.Value;
            return $"{m.Groups[1].Value}=\"\" data-blocked-src=\"{WebUtility.HtmlEncode(url)}\"";
        }, RegexOptions.IgnoreCase);
    }

    private static bool IsAllowed(string url, IReadOnlySet<string> allowlist)
    {
        try
        {
            var host = new Uri(url).Host;
            return allowlist.Contains(host) ||
                   allowlist.Any(d => host.EndsWith("." + d, StringComparison.OrdinalIgnoreCase));
        }
        catch { return false; }
    }

    public static string PlainTextToHtml(string text)
    {
        // Unwrap format=flowed soft breaks
        text = Regex.Replace(text, @" \n", " ");
        var lines = text.Replace("\r\n", "\n").Replace('\r', '\n').Split('\n');
        var sb = new StringBuilder();
        var quoteLevel = 0;

        void CloseQuotes(int to)
        {
            while (quoteLevel > to) { sb.Append("</blockquote>"); quoteLevel--; }
        }

        foreach (var raw in lines)
        {
            var level = 0;
            var line = raw;
            while (line.StartsWith('>'))
            {
                level++;
                line = line[1..];
                if (line.StartsWith(' ')) line = line[1..];
            }
            while (quoteLevel < level) { sb.Append("<blockquote>"); quoteLevel++; }
            CloseQuotes(level);

            var encoded = WebUtility.HtmlEncode(line);
            encoded = Regex.Replace(encoded,
                @"(https?://[^\s<]+)|([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})",
                m => m.Groups[1].Success
                    ? $"<a href=\"{m.Groups[1].Value}\">{m.Groups[1].Value}</a>"
                    : $"<a href=\"mailto:{m.Groups[2].Value}\">{m.Groups[2].Value}</a>");
            sb.Append(encoded).Append("<br/>");
        }
        CloseQuotes(0);
        return sb.ToString();
    }

    public static string EditorShell(bool darkMode = false) => $$"""
        <!DOCTYPE html>
        <html>
        <head>
        <meta charset="utf-8"/>
        <style>
          html, body { margin: 0; height: 100%; }
          body {
            font: 15px/1.45 system-ui, "Segoe UI", sans-serif;
            color: {{(darkMode ? "#f5f5f7" : "#1c1c1e")}};
            background: {{(darkMode ? "#1c1c1e" : "#ffffff")}};
            padding: 12px 16px;
          }
          #editor { outline: none; min-height: 200px; }
          #editor:empty:before {
            content: attr(data-placeholder);
            color: {{(darkMode ? "#636366" : "#8e8e93")}};
          }
        </style>
        </head>
        <body>
          <div id="editor" contenteditable="true" data-placeholder="Nachricht schreiben…"></div>
          <script>
            window.getHtml = () => document.getElementById('editor').innerHTML;
            window.setHtml = (h) => { document.getElementById('editor').innerHTML = h || ''; };
            window.focusEditor = () => document.getElementById('editor').focus();
            document.getElementById('editor').addEventListener('keydown', e => {
              if (e.ctrlKey || e.metaKey) {
                if (e.key === 'b') { document.execCommand('bold'); e.preventDefault(); }
                if (e.key === 'i') { document.execCommand('italic'); e.preventDefault(); }
                if (e.key === 'u') { document.execCommand('underline'); e.preventDefault(); }
              }
            });
          </script>
        </body>
        </html>
        """;
}
