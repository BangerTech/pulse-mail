using System.Runtime.InteropServices;
using Microsoft.UI.Dispatching;
using Microsoft.UI.Xaml;
using PulseMail.App.Services;
using PulseMail.Core;
using PulseMail.Core.Services;

namespace PulseMail.App;

public partial class App : Application
{
    public static MailAppService Mail { get; private set; } = null!;
    public static Window? MainWindowInstance { get; private set; }

    public App()
    {
        UnhandledException += OnUnhandledException;
        try
        {
            InitializeComponent();
        }
        catch (Exception ex)
        {
            CrashLog.Write("InitializeComponent failed", ex);
            CrashLog.ShowFatal(ex);
            throw;
        }
    }

    private static void OnUnhandledException(object sender, Microsoft.UI.Xaml.UnhandledExceptionEventArgs e)
    {
        CrashLog.Write("UnhandledException", e.Exception);
        e.Handled = true;
        try { CrashLog.ShowFatal(e.Exception); }
        catch { }
    }

    protected override void OnLaunched(LaunchActivatedEventArgs args)
    {
        try
        {
            Mail = new MailAppService(new HybridCredentialStore());
            Mail.EnsureDefaults();

            var window = new MainWindow();
            MainWindowInstance = window;
            window.Activate();

            _ = StartMailAsync();
        }
        catch (Exception ex)
        {
            CrashLog.Write("OnLaunched failed", ex);
            CrashLog.ShowFatal(ex);
        }
    }

    private static async Task StartMailAsync()
    {
        try { await Mail.StartImapAsync(); }
        catch (Exception ex) { CrashLog.Write("IMAP start failed (UI still usable)", ex); }
    }
}

public static class Program
{
    [STAThread]
    public static void Main(string[] args)
    {
        try
        {
            CrashLog.Write("Main enter");
            WinRT.ComWrappersSupport.InitializeComWrappers();
            Application.Start(_ =>
            {
                var context = new DispatcherQueueSynchronizationContext(
                    DispatcherQueue.GetForCurrentThread());
                SynchronizationContext.SetSynchronizationContext(context);
                new App();
            });
        }
        catch (Exception ex)
        {
            CrashLog.Write("Main failed", ex);
            CrashLog.ShowFatal(ex);
        }
    }
}

internal static class CrashLog
{
    private static string LogPath => Path.Combine(AppPaths.DataRoot, "startup.log");

    public static void Write(string message, Exception? ex = null)
    {
        try
        {
            Directory.CreateDirectory(AppPaths.DataRoot);
            var line = $"{DateTime.Now:yyyy-MM-dd HH:mm:ss} {message}";
            if (ex is not null) line += $"\n{ex}";
            File.AppendAllText(LogPath, line + "\n\n");
        }
        catch { }
    }

    public static void ShowFatal(Exception ex)
    {
        var detail = ex.Message;
        for (var inner = ex.InnerException; inner is not null; inner = inner.InnerException)
            detail += "\n→ " + inner.Message;
        var msg = $"Pulse Mail konnte nicht starten.\n\n{ex.GetType().Name}: {detail}\n\nLog: {LogPath}";
        MessageBoxW(IntPtr.Zero, msg, "Pulse Mail", 0x00000010);
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBoxW(IntPtr hWnd, string text, string caption, uint type);
}
