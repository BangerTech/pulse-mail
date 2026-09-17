using Windows.System;

namespace PulseMail.App.Helpers;

/// <summary>
/// WinRT VirtualKey omits some OEM names in the projection; use VK_* values.
/// </summary>
internal static class KeyMap
{
    public const VirtualKey Comma = (VirtualKey)0xBC;       // VK_OEM_COMMA
    public const VirtualKey Period = (VirtualKey)0xBE;      // VK_OEM_PERIOD
    public const VirtualKey Oem2 = (VirtualKey)0xBF;        // VK_OEM_2  / ?
    public const VirtualKey OpenBracket = (VirtualKey)0xDB; // VK_OEM_4  [
    public const VirtualKey Backslash = (VirtualKey)0xDC;   // VK_OEM_5  \
}
