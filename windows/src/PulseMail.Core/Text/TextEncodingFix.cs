using System.Text;
using System.Text.RegularExpressions;

namespace PulseMail.Core.Text;

/// <summary>
/// Repairs classic UTF-8-as-Latin-1 mojibake ("BÃ¼rgermeister" → "Bürgermeister").
/// </summary>
public static class TextEncodingFix
{
    private static readonly Regex MojibakePattern = new(
        @"Ã[\u0080-\u00BF]|Â[\u00A0-\u00BF]|â€[\u0080-\u00FF]",
        RegexOptions.Compiled);

    public static string? Repair(string? text)
    {
        if (string.IsNullOrEmpty(text) || !MojibakePattern.IsMatch(text))
            return text;

        try
        {
            var bytes = Encoding.GetEncoding("ISO-8859-1").GetBytes(text);
            var repaired = Encoding.UTF8.GetString(bytes);
            if (!string.IsNullOrEmpty(repaired) &&
                repaired != text &&
                !MojibakePattern.IsMatch(repaired) &&
                !repaired.Contains('\uFFFD'))
                return repaired;
        }
        catch { }

        return text;
    }
}
