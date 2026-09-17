using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using Microsoft.UI.Xaml.Media;
using Microsoft.UI.Xaml.Shapes;
using Windows.UI;

namespace PulseMail.App.Controls;

/// <summary>
/// Stroke icons matching frontend/src/components/Icon.tsx (viewBox 0 0 20 20).
/// </summary>
public sealed class PulseIcon : UserControl
{
    public static readonly DependencyProperty IconProperty =
        DependencyProperty.Register(nameof(Icon), typeof(string), typeof(PulseIcon),
            new PropertyMetadata("reply", OnChanged));

    public static readonly DependencyProperty IconSizeProperty =
        DependencyProperty.Register(nameof(IconSize), typeof(double), typeof(PulseIcon),
            new PropertyMetadata(16.0, OnChanged));

    public static readonly DependencyProperty StrokeProperty =
        DependencyProperty.Register(nameof(StrokeBrush), typeof(Brush), typeof(PulseIcon),
            new PropertyMetadata(null, OnChanged));

    public string Icon
    {
        get => (string)GetValue(IconProperty);
        set => SetValue(IconProperty, value);
    }

    public double IconSize
    {
        get => (double)GetValue(IconSizeProperty);
        set => SetValue(IconSizeProperty, value);
    }

    public Brush? StrokeBrush
    {
        get => (Brush?)GetValue(StrokeProperty);
        set => SetValue(StrokeProperty, value);
    }

    private static readonly Dictionary<string, string> Paths = new(StringComparer.OrdinalIgnoreCase)
    {
        ["reply"] = "M7.5,4 L3,8.5 L7.5,13 M3,8.5 H11.5 C14.3,8.5 16.5,10.7 16.5,13.5 V15.5",
        ["replyAll"] = "M6,4 L1.5,8.5 L6,13 M10,4 L5.5,8.5 L10,13 M5.5,8.5 H13 C15.5,8.5 17.5,10.5 17.5,13 V15",
        ["forward"] = "M12.5,4 L17,8.5 L12.5,13 M17,8.5 H8.5 C5.7,8.5 3.5,10.7 3.5,13.5 V15.5",
        ["trash"] = "M3.5,5.5 H16.5 M7,5.5 V4 C7,3.4 7.4,3 8,3 H12 C12.6,3 13,3.4 13,4 V5.5 M5,5.5 L5.8,16 C5.8,16.6 6.3,17 6.8,17 H13.2 C13.7,17 14.2,16.6 14.2,16 L15,5.5 M8.5,9 V13.5 M11.5,9 V13.5",
        ["archive"] = "M2.5,4 H17.5 V8 H2.5 Z M4,8 V15 C4,15.8 4.7,16.5 5.5,16.5 H14.5 C15.3,16.5 16,15.8 16,15 V8 M8,11 H12",
        ["flag"] = "M5,17 V3.5 C5,3.5 6.5,2.5 10,2.5 C13.5,2.5 15,3.5 15,3.5 V11 C15,11 13.5,10 10,10 C6.5,10 5,11 5,11",
        ["envelope"] = "M2.5,4.5 H17.5 V15.5 H2.5 Z M2.5,6.5 L10,11.5 L17.5,6.5",
        ["folder"] = "M2.5,5.5 C2.5,4.7 3.2,4 4,4 H7.5 L9,6 H16 C16.8,6 17.5,6.7 17.5,7.5 V14.5 C17.5,15.3 16.8,16 16,16 H4 C3.2,16 2.5,15.3 2.5,14.5 Z",
        ["settings"] = "M10,7.5 A2.5,2.5 0 1,0 10,12.5 A2.5,2.5 0 1,0 10,7.5 M10,2.5 V4 M10,16 V17.5 M4.7,4.7 L5.8,5.8 M14.2,14.2 L15.3,15.3 M2.5,10 H4 M16,10 H17.5 M4.7,15.3 L5.8,14.2 M14.2,5.8 L15.3,4.7",
        ["refresh"] = "M16.5,10 A6.5,6.5 0 1,1 10,3.5 C12.3,3.5 14.3,4.7 15.4,6.5 M16.5,3.5 V7 H13",
        ["sun"] = "M10,6.5 A3.5,3.5 0 1,0 10,13.5 A3.5,3.5 0 1,0 10,6.5 M10,3 V4.5 M10,15.5 V17 M3,10 H4.5 M15.5,10 H17 M5.05,5.05 L6.1,6.1 M13.9,13.9 L14.95,14.95 M5.05,14.95 L6.1,13.9 M13.9,6.1 L14.95,5.05",
        ["moon"] = "M16,11.5 C15.2,14.7 12.3,17 9,17 C5.1,17 2,13.9 2,10 C2,6.7 4.3,3.8 7.5,3 C6.8,4.1 6.5,5.4 6.5,6.75 C6.5,10.5 9.5,13.5 13.25,13.5 C14.6,13.5 15.9,13.1 16,11.5 Z",
        ["compose"] = "M14.5,3.5 L16.5,5.5 L8.5,13.5 L5.5,14.5 L6.5,11.5 Z M3.5,16.5 H16.5",
        ["command"] = "M6.5,3.5 C5.4,3.5 4.5,4.4 4.5,5.5 C4.5,6.6 5.4,7.5 6.5,7.5 H13.5 C14.6,7.5 15.5,6.6 15.5,5.5 C15.5,4.4 14.6,3.5 13.5,3.5 C12.4,3.5 11.5,4.4 11.5,5.5 V14.5 C11.5,15.6 12.4,16.5 13.5,16.5 C14.6,16.5 15.5,15.6 15.5,14.5 C15.5,13.4 14.6,12.5 13.5,12.5 H6.5 C5.4,12.5 4.5,13.4 4.5,14.5 C4.5,15.6 5.4,16.5 6.5,16.5 C7.6,16.5 8.5,15.6 8.5,14.5 V5.5 C8.5,4.4 7.6,3.5 6.5,3.5 Z",
        ["sidebar"] = "M2.5,3.5 H17.5 V16.5 H2.5 Z M8,3.5 V16.5",
        ["inbox"] = "M2.5,11.5 L4.5,4.5 C4.7,3.9 5.2,3.5 5.8,3.5 H14.2 C14.8,3.5 15.3,3.9 15.5,4.5 L17.5,11.5 M2.5,11.5 V15 C2.5,15.8 3.2,16.5 4,16.5 H16 C16.8,16.5 17.5,15.8 17.5,15 V11.5 H13.5 L12.5,13.5 H7.5 L6.5,11.5 H2.5",
        ["chevronRight"] = "M8,5 L13,10 L8,15",
    };

    public PulseIcon()
    {
        IsTabStop = false;
        Rebuild();
    }

    private static void OnChanged(DependencyObject d, DependencyPropertyChangedEventArgs e) =>
        ((PulseIcon)d).Rebuild();

    private void Rebuild()
    {
        if (!Paths.TryGetValue(Icon ?? "", out var data))
            data = Paths["reply"];

        Brush stroke = StrokeBrush
            ?? (Application.Current?.Resources.TryGetValue("PulseTextSecondary", out var v) == true && v is Brush b
                ? b
                : new SolidColorBrush(Color.FromArgb(255, 152, 152, 157)));

        Geometry? geometry = null;
        try
        {
            geometry = (Geometry)Microsoft.UI.Xaml.Markup.XamlBindingHelper.ConvertValue(typeof(Geometry), data);
        }
        catch { }

        var path = new Path
        {
            Data = geometry,
            Stroke = stroke,
            StrokeThickness = 1.4,
            StrokeStartLineCap = PenLineCap.Round,
            StrokeEndLineCap = PenLineCap.Round,
            StrokeLineJoin = PenLineJoin.Round,
            Width = 20,
            Height = 20
        };

        Content = new Viewbox
        {
            Width = IconSize,
            Height = IconSize,
            Stretch = Stretch.Uniform,
            Child = path
        };
    }
}
