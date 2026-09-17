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
        try
        {
            InitializeComponent();
            Title = "Pulse Mail";
            ExtendsContentIntoTitleBar = false;

            ViewModel = new MainViewModel(App.Mail, DispatcherQueue);
            RootPage = new MainPage(ViewModel, this);
            Content = RootPage;

            // Ensure a usable size on first run
            try
            {
                AppWindow.Resize(new Windows.Graphics.SizeInt32(1440, 900));
            }
            catch { }

            var loaded = false;
            Activated += async (_, _) =>
            {
                if (loaded) return;
                loaded = true;
                try
                {
                    NotificationService.EnsureRegistered();
                    await RootPage.InitializeAsync();
                }
                catch (Exception ex)
                {
                    CrashLog.Write("MainWindow Activated init failed", ex);
                }
            };
        }
        catch (Exception ex)
        {
            CrashLog.Write("MainWindow ctor failed", ex);
            throw;
        }
    }
}
