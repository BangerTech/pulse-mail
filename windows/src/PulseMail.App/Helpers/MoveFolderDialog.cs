using Microsoft.UI.Xaml;
using Microsoft.UI.Xaml.Controls;
using PulseMail.App.ViewModels;
using PulseMail.Core.Models;

namespace PulseMail.App.Helpers;

public static class MoveFolderDialog
{
    public static async Task<string?> PickAsync(XamlRoot root, MainViewModel vm)
    {
        if (vm.SelectedMessage is null) return null;
        var accountId = vm.SelectedMessage.Message.AccountId;
        var folders = App.Mail.Db.GetFolders(accountId);
        if (folders.Count == 0)
        {
            try { folders = await App.Mail.Imap.ListFoldersAsync(accountId); }
            catch { return null; }
        }

        var list = new ListView
        {
            ItemsSource = folders.Select(f => f.FullName).ToList(),
            Height = 280,
            SelectionMode = ListViewSelectionMode.Single
        };
        var dlg = new ContentDialog
        {
            Title = "Verschieben nach…",
            PrimaryButtonText = "Verschieben",
            CloseButtonText = "Abbrechen",
            Content = list,
            XamlRoot = root
        };
        if (await dlg.ShowAsync() != ContentDialogResult.Primary) return null;
        return list.SelectedItem as string;
    }
}
