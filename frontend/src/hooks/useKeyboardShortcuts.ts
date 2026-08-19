import { useEffect } from 'react';

export interface ShortcutHandlers {
  onCompose: () => void;
  onReply: () => void;
  onReplyAll: () => void;
  onForward: () => void;
  onArchive: () => void;
  onDelete: () => void;
  onToggleFlag: () => void;
  onToggleUnread: () => void;
  onNext: () => void;
  onPrevious: () => void;
  onEscape: () => void;
  onSearch: () => void;
  onPalette: () => void;
  onRefresh: () => void;
}

function isTyping(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers, enabled: boolean) {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const meta = e.metaKey || e.ctrlKey;

      // The palette must open from anywhere, including while typing in a field.
      if (meta && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        handlers.onPalette();
        return;
      }

      if (e.key === 'Escape') {
        handlers.onEscape();
        return;
      }

      if (!enabled || isTyping(e.target) || e.altKey) return;

      if (meta) {
        if (e.key.toLowerCase() === 'n') {
          e.preventDefault();
          handlers.onCompose();
        }
        return;
      }

      switch (e.key) {
        case 'n':
        case 'c':
          e.preventDefault();
          handlers.onCompose();
          break;
        case 'r':
          e.preventDefault();
          handlers.onReply();
          break;
        case 'a':
          e.preventDefault();
          handlers.onReplyAll();
          break;
        case 'f':
          e.preventDefault();
          handlers.onForward();
          break;
        case 'e':
          e.preventDefault();
          handlers.onArchive();
          break;
        case '#':
        case 'Backspace':
        case 'Delete':
          e.preventDefault();
          handlers.onDelete();
          break;
        case 'l':
          e.preventDefault();
          handlers.onToggleFlag();
          break;
        case 'u':
          e.preventDefault();
          handlers.onToggleUnread();
          break;
        case 'j':
        case 'ArrowDown':
          e.preventDefault();
          handlers.onNext();
          break;
        case 'k':
        case 'ArrowUp':
          e.preventDefault();
          handlers.onPrevious();
          break;
        case '/':
          e.preventDefault();
          handlers.onSearch();
          break;
        case '.':
          e.preventDefault();
          handlers.onRefresh();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlers, enabled]);
}
