using Microsoft.UI.Xaml;
using Microsoft.Windows.AppNotifications;
using Microsoft.Windows.AppNotifications.Builder;
using PulseMail.Core.Models;
using PulseMail.Core.Services;
using System.Runtime.InteropServices;
using Windows.Media.Core;
using Windows.Media.Playback;
using Windows.Storage;

namespace PulseMail.App.Services;

public static class NotificationService
{
    private static MediaPlayer? _player;
    private static bool _registered;

    public static void EnsureRegistered()
    {
        if (_registered) return;
        try
        {
            AppNotificationManager.Default.NotificationInvoked += (_, _) => { };
            AppNotificationManager.Default.Register();
            _registered = true;
        }
        catch { /* unpackaged may need identity */ }
    }

    public static void ShowNewMail(NewMailEventArgs e)
    {
        if (!App.Mail.Db.GetBoolSetting("notifyDesktop", true)) return;
        EnsureRegistered();
        try
        {
            var from = string.IsNullOrEmpty(e.FromName) ? (e.FromAddress ?? "Neue Mail") : e.FromName!;
            var builder = new AppNotificationBuilder()
                .AddText(from)
                .AddText(e.Subject ?? "Neue Nachricht");
            AppNotificationManager.Default.Show(builder.BuildNotification());
        }
        catch
        {
            // Fallback: flash taskbar
            FlashWindow();
        }
    }

    public static void PlaySound(MailAppService mail)
    {
        if (!mail.Db.GetBoolSetting("notifySound", true)) return;
        try
        {
            _player ??= new MediaPlayer { AudioCategory = MediaPlayerAudioCategory.SoundEffects };
            var vol = 0.7;
            if (double.TryParse(mail.Db.GetSetting("notifyVolume"), out var v)) vol = v;
            _player.Volume = vol;

            var path = Path.Combine(AppContext.BaseDirectory, "Assets", "notify.wav");
            if (!File.Exists(path))
            {
                SystemSounds.Asterisk();
                return;
            }
            _player.Source = MediaSource.CreateFromUri(new Uri(path));
            _player.Play();
        }
        catch { SystemSounds.Asterisk(); }
    }

    public static void SetTaskbarBadge(int count)
    {
        try
        {
            var window = App.MainWindowInstance;
            if (window is null) return;
            // Overlay icon via Win32 — simplified: update title only (MainViewModel does that)
            FlashWindow();
        }
        catch { }
    }

    private static void FlashWindow()
    {
        try
        {
            var hwnd = WinRT.Interop.WindowNative.GetWindowHandle(App.MainWindowInstance);
            var fi = new FLASHWINFO
            {
                cbSize = (uint)Marshal.SizeOf<FLASHWINFO>(),
                hwnd = hwnd,
                dwFlags = 3, // FLASHW_ALL
                uCount = 3,
                dwTimeout = 0
            };
            FlashWindowEx(ref fi);
        }
        catch { }
    }

    [DllImport("user32.dll")]
    private static extern bool FlashWindowEx(ref FLASHWINFO pwfi);

    [StructLayout(LayoutKind.Sequential)]
    private struct FLASHWINFO
    {
        public uint cbSize;
        public IntPtr hwnd;
        public uint dwFlags;
        public uint uCount;
        public uint dwTimeout;
    }
}

internal static class SystemSounds
{
    [DllImport("user32.dll")]
    private static extern bool MessageBeep(uint type);
    public static void Asterisk() => MessageBeep(0x00000040);
}
