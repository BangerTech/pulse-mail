using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using PulseMail.App.ViewModels;

namespace PulseMail.App.Controls;

public sealed class CommandPaletteOverlay : UserControl
{
    public event EventHandler<CommandItem>? CommandChosen;

    private MainViewModel? _vm;
    private readonly ListView _list = new() { MaxHeight = 360 };
    private readonly TextBox _filter = new() { PlaceholderText = "Befehl…" };

    public CommandPaletteOverlay()
    {
        _filter.TextChanged += (_, _) => ApplyFilter();
        _list.ItemClick += (_, e) =>
        {
            if (e.ClickedItem is CommandItem c)
                CommandChosen?.Invoke(this, c);
        };
        _list.IsItemClickEnabled = true;
        _list.ItemTemplate = CreateTemplate();

        var panel = new StackPanel
        {
            Width = 480,
            Padding = new Thickness(16),
            Spacing = 8,
            Background = PulseMail.App.Helpers.ThemeBrushes.Elevated()
        };
        panel.Children.Add(new TextBlock { Text = "Befehle", FontWeight = Microsoft.UI.Text.FontWeights.SemiBold });
        panel.Children.Add(_filter);
        panel.Children.Add(_list);

        var border = new Border
        {
            CornerRadius = new CornerRadius(12),
            Child = panel,
            VerticalAlignment = VerticalAlignment.Top,
            HorizontalAlignment = HorizontalAlignment.Center,
            Margin = new Thickness(0, 80, 0, 0)
        };
        var root = new Grid { Background = PulseMail.App.Helpers.ThemeBrushes.Overlay() };
        root.Children.Add(border);
        root.PointerPressed += (s, e) =>
        {
            if (ReferenceEquals(e.OriginalSource, root) && _vm is not null)
                _vm.ClosePalette();
        };
        Content = root;
        Visibility = Visibility.Collapsed;
    }

    public void Bind(MainViewModel vm)
    {
        _vm = vm;
        ApplyFilter();
        _filter.Text = "";
        _filter.Focus(FocusState.Programmatic);
    }

    private void ApplyFilter()
    {
        if (_vm is null) return;
        var q = (_filter.Text ?? "").Trim();
        _list.ItemsSource = string.IsNullOrEmpty(q)
            ? _vm.Commands.ToList()
            : _vm.Commands.Where(c => c.Title.Contains(q, StringComparison.OrdinalIgnoreCase)).ToList();
    }

    private static DataTemplate CreateTemplate()
    {
        // Simple: use code-built items via DisplayMemberPath alternatives — use ToString via wrapper
        // For ListView of CommandItem, set DisplayMemberPath
        return (DataTemplate)Microsoft.UI.Xaml.Markup.XamlReader.Load("""
            <DataTemplate xmlns="http://schemas.microsoft.com/winfx/2006/xaml/presentation">
              <Grid Padding="8,6" ColumnSpacing="12">
                <Grid.ColumnDefinitions>
                  <ColumnDefinition Width="*"/>
                  <ColumnDefinition Width="Auto"/>
                </Grid.ColumnDefinitions>
                <TextBlock Text="{Binding Title}"/>
                <TextBlock Grid.Column="1" Text="{Binding Shortcut}" Opacity="0.5"/>
              </Grid>
            </DataTemplate>
            """);
    }
}
