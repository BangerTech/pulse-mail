using Microsoft.UI.Xaml;
using Microsoft.Windows.AppLifecycle;
using PulseMail.App.Services;
using PulseMail.Core.Services;

namespace PulseMail.App;

public partial class App : Application
{
    public static MailAppService Mail { get; private set; } = null!;
    public static Window? MainWindowInstance { get; private set; }

    public App()
    {
        InitializeComponent();
        UnhandledException += (_, e) =>
        {
            System.Diagnostics.Debug.WriteLine(e.Exception);
            e.Handled = true;
        };
    }

    protected override async void OnLaunched(LaunchActivatedEventArgs args)
    {
        Mail = new MailAppService(new WindowsCredentialStore());
        await Mail.InitializeAsync();

        var window = new MainWindow();
        MainWindowInstance = window;
        window.Activate();
    }
}

public static class Program
{
    [STAThread]
    public static void Main(string[] args)
    {
        WinRT.ComWrappersSupport.InitializeComWrappers();
        Microsoft.UI.Xaml.Application.Start(_ => new App());
    }
}
