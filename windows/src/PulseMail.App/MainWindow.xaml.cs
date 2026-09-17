using Microsoft.UI.Xaml;
using PulseMail.App.Services;
using PulseMail.App.ViewModels;

namespace PulseMail.App;

public sealed partial class MainWindow : Window
{
    public MainViewModel ViewModel { get; }
    public MainPage RootPage { get; }

    public MainWindow()
    {
        InitializeComponent();
        Title = "Pulse Mail";
        ExtendsContentIntoTitleBar = false;

        ViewModel = new MainViewModel(App.Mail, DispatcherQueue);
        RootPage = new MainPage(ViewModel, this);
        Content = RootPage;

        var loaded = false;
        Activated += async (_, _) =>
        {
            if (loaded) return;
            loaded = true;
            NotificationService.EnsureRegistered();
            await RootPage.InitializeAsync();
        };
    }
}
