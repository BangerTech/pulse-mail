using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Media;

namespace PulseMail.App.Helpers;

/// <summary>
/// Resolves Pulse theme colors from code (overlays built in C#).
/// Matches frontend/src/styles/global.css.
/// </summary>
public static class ThemeBrushes
{
    public static bool IsDark(FrameworkElement? element = null)
    {
        var theme = element?.ActualTheme ?? ElementTheme.Default;
        if (theme == ElementTheme.Default)
        {
            try
            {
                var settings = new Windows.UI.ViewManagement.UISettings();
                var color = settings.GetColorValue(Windows.UI.ViewManagement.UIColorType.Background);
                return color.R < 128;
            }
            catch { return false; }
        }
        return theme == ElementTheme.Dark;
    }

    public static SolidColorBrush Overlay(FrameworkElement? el = null) =>
        IsDark(el)
            ? Brush(0x8C, 0, 0, 0)
            : Brush(0x52, 0, 0, 0);

    public static SolidColorBrush Elevated(FrameworkElement? el = null) =>
        IsDark(el)
            ? Brush(0xFF, 0x23, 0x23, 0x26)
            : Brush(0xFF, 0xFF, 0xFF, 0xFF);

    public static SolidColorBrush TextPrimary(FrameworkElement? el = null) =>
        IsDark(el)
            ? Brush(0xFF, 0xF5, 0xF5, 0xF7)
            : Brush(0xFF, 0x1D, 0x1D, 0x1F);

    public static SolidColorBrush TextSecondary(FrameworkElement? el = null) =>
        IsDark(el)
            ? Brush(0xFF, 0x98, 0x98, 0x9D)
            : Brush(0xFF, 0x86, 0x86, 0x8B);

    public static SolidColorBrush Accent(FrameworkElement? el = null) =>
        IsDark(el)
            ? Brush(0xFF, 0x0A, 0x84, 0xFF)
            : Brush(0xFF, 0x00, 0x7A, 0xFF);

    public static SolidColorBrush Border(FrameworkElement? el = null) =>
        IsDark(el)
            ? Brush(0x1F, 0xFF, 0xFF, 0xFF)
            : Brush(0x1A, 0x00, 0x00, 0x00);

    public static SolidColorBrush Sidebar(FrameworkElement? el = null) =>
        IsDark(el)
            ? Brush(0xFF, 0x1C, 0x1C, 0x1E)
            : Brush(0xFF, 0xF4, 0xF6, 0xFB);

    private static SolidColorBrush Brush(byte a, byte r, byte g, byte b) =>
        new(Windows.UI.Color.FromArgb(a, r, g, b));
}
