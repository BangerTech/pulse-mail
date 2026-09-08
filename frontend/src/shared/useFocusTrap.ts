// Focus trap for modal-like overlays. When active, Tab and Shift-Tab cycle
// within the container, the initial focus is set to the first tabbable
// element (or a specific selector), and closing restores focus to whatever
// element was focused before the trap engaged.
//
// Not a full-blown "inert" polyfill: mainly a Tab/Shift-Tab loop plus focus
// restore, which is what we need for our modals and reader overlays.

import { useEffect, useRef } from 'react';

interface Options {
  active: boolean;
  // Selector picked for the initial focus. Falls back to the first tabbable.
  initialFocusSelector?: string;
  // Called when the user presses Escape inside the trap. Not called on Tab.
  onEscape?: () => void;
}

const TABBABLE_SELECTOR = [
  'a[href]',
  'area[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  'iframe',
  'audio[controls]',
  'video[controls]',
  '[contenteditable]:not([contenteditable="false"])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

function tabbable(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(TABBABLE_SELECTOR))
    .filter((el) => !el.hasAttribute('disabled') && el.tabIndex !== -1 && el.offsetParent !== null);
}

export function useFocusTrap<T extends HTMLElement>(options: Options) {
  const containerRef = useRef<T | null>(null);
  const restoreRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!options.active) return;
    const container = containerRef.current;
    if (!container) return;

    restoreRef.current = (document.activeElement as HTMLElement | null) || null;

    // Defer to allow the container to render its children before we look for
    // something to focus.
    const focusTimer = window.setTimeout(() => {
      const initial = options.initialFocusSelector
        ? container.querySelector<HTMLElement>(options.initialFocusSelector)
        : null;
      const target = initial || tabbable(container)[0] || container;
      target.focus();
    }, 0);

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && options.onEscape) {
        e.stopPropagation();
        options.onEscape();
        return;
      }
      if (e.key !== 'Tab') return;
      const list = tabbable(container);
      if (list.length === 0) {
        e.preventDefault();
        return;
      }
      const first = list[0];
      const last = list[list.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey) {
        if (active === first || !container.contains(active)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    container.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      container.removeEventListener('keydown', onKeyDown);
      const restore = restoreRef.current;
      if (restore && document.contains(restore)) {
        try { restore.focus(); } catch {}
      }
    };
  }, [options.active, options.initialFocusSelector, options.onEscape]);

  return containerRef;
}
