// Auto-sizing for the mail iframe. Because the iframe is same-origin (srcDoc
// plus allow-same-origin), the parent can read its contentDocument and measure
// the rendered mail. If the mail is wider than the viewport (typical
// fixed-layout newsletters at 600-800px), we scale it down proportionally so
// it fits without a horizontal scrollbar.
//
// Everything is measured off <body>, never off documentElement: the html
// element's scrollHeight is clamped to at least the iframe viewport, so using
// it would make the measured height grow with the height we just applied and
// the iframe would expand forever.

import { useCallback, useEffect, useRef } from 'react';

interface Options {
  // Minimum height, used before the first measurement and while loading.
  minHeight?: number;
  // Extra pixels added to the measured height so descenders and box shadows
  // are not clipped at the bottom.
  slack?: number;
}

// Height changes below this are treated as settled. Sub-pixel layout and
// scrollbar toggling can otherwise make the measurement oscillate forever.
const EPSILON = 2;
// Hard stop against pathological content that never reaches a stable size.
const MAX_PASSES = 30;

export function useMailFrame(srcDoc: string, options: Options = {}) {
  const { minHeight = 320, slack = 8 } = options;
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const observerRef = useRef<ResizeObserver | null>(null);
  const rafRef = useRef<number | null>(null);
  // Set while we write the height ourselves, so the ResizeObserver does not
  // treat our own change as new content and re-trigger a measurement.
  const applyingRef = useRef(false);
  const passesRef = useRef(0);

  const measure = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    const body = doc?.body;
    if (!doc || !body) return;

    if (passesRef.current++ > MAX_PASSES) return;

    // Reset any previous scale so the natural width is measurable.
    body.style.transformOrigin = '0 0';
    body.style.transform = '';
    body.style.width = '';

    const available = iframe.clientWidth || iframe.parentElement?.clientWidth || 0;
    const naturalWidth = body.scrollWidth;

    let scale = 1;
    if (available > 0 && naturalWidth > available + 1) {
      scale = Math.max(0.4, available / naturalWidth);
      body.style.width = `${naturalWidth}px`;
      body.style.transform = `scale(${scale})`;
    }

    // Measured after the width/scale is applied so the reflowed layout is
    // what we size the frame to.
    const contentHeight = body.scrollHeight;
    const next = Math.max(minHeight, Math.ceil(contentHeight * scale) + slack);
    const current = parseFloat(iframe.style.height) || 0;

    if (Math.abs(next - current) <= EPSILON) return;

    applyingRef.current = true;
    iframe.style.height = `${next}px`;
    requestAnimationFrame(() => { applyingRef.current = false; });
  }, [minHeight, slack]);

  const scheduleMeasure = useCallback(() => {
    if (rafRef.current != null) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null;
      measure();
    });
  }, [measure]);

  const handleLoad = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    const doc = iframe.contentDocument;
    if (!doc) return;

    passesRef.current = 0;
    scheduleMeasure();

    // Late-loading images change the height; re-measure when they land.
    for (const img of Array.from(doc.images)) {
      if (!img.complete) {
        img.addEventListener('load', () => { passesRef.current = 0; scheduleMeasure(); }, { once: true });
        img.addEventListener('error', scheduleMeasure, { once: true });
      }
    }

    // Observe only <body>; its size follows the content, not the frame.
    observerRef.current?.disconnect();
    if (typeof ResizeObserver !== 'undefined' && doc.body) {
      observerRef.current = new ResizeObserver(() => {
        if (applyingRef.current) return;
        scheduleMeasure();
      });
      observerRef.current.observe(doc.body);
    }
  }, [scheduleMeasure]);

  // Reset height when the document changes so a short mail after a long one
  // does not inherit the old height.
  useEffect(() => {
    passesRef.current = 0;
    if (iframeRef.current) iframeRef.current.style.height = `${minHeight}px`;
  }, [srcDoc, minHeight]);

  // Re-measure on parent resize so the scale adapts when the pane changes.
  useEffect(() => {
    const onResize = () => { passesRef.current = 0; scheduleMeasure(); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [scheduleMeasure]);

  useEffect(() => () => {
    observerRef.current?.disconnect();
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
  }, []);

  return { iframeRef, onLoad: handleLoad };
}
