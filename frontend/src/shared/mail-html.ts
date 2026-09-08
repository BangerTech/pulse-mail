// Shared mail-HTML renderer for both the production reader and the prototype
// reader. Builds a full HTML document out of the mail body, resolves cid:
// inline images to backend attachment URLs, and only injects our own
// background/color CSS when the mail didn't bring its own – so newsletters
// with an intentional design stay intact in dark mode.

export interface MailAttachmentLike {
  filename?: string;
  cid?: string;
  inline?: boolean;
}

export interface BuildMailDocumentOptions {
  html: string;
  isDark: boolean;
  fontFamily?: string;
  fontSize?: number;
  padding?: number;
  attachments?: MailAttachmentLike[];
  attachmentUrl?: (att: MailAttachmentLike) => string;
  // When true, external image URLs are neutralized (src/srcset moved into
  // data-blocked-src, url() in inline styles replaced) so the mail cannot
  // phone home before the user opts in.
  blockRemote?: boolean;
}

export interface BuildMailDocumentResult {
  srcDoc: string;
  hasOwnBackground: boolean;
  blockedCount: number;
  blockedHosts: string[];
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// A mail "brings its own background" if it sets one on <body>, on any wrapper
// with a class/id, uses <table bgcolor=…>, or ships a <style> block that sets
// a background on body/html. Anything with these signals should not have our
// dark-mode overrides applied on top.
export function hasOwnBackground(html: string): boolean {
  if (!html) return false;
  const patterns = [
    /<body[^>]*\bbgcolor\s*=/i,
    /<body[^>]*style\s*=\s*['"][^'"]*background/i,
    /<table[^>]*\bbgcolor\s*=/i,
    /<td[^>]*\bbgcolor\s*=/i,
    /background-color\s*:/i,
    /background\s*:\s*(?!none|transparent|inherit|initial|unset)/i,
  ];
  return patterns.some((re) => re.test(html));
}

function resolveCids(
  html: string,
  attachments: MailAttachmentLike[] = [],
  attachmentUrl?: (att: MailAttachmentLike) => string
): string {
  if (!html || !attachmentUrl || !attachments.length) return html;
  let out = html;
  const norm = (c?: string) => (c || '').replace(/^<|>$/g, '').trim().toLowerCase();
  for (const att of attachments) {
    if (!att.cid) continue;
    const cid = norm(att.cid);
    if (!cid) continue;
    const url = attachmentUrl(att);
    // 1. Plain `cid:foo` (with optional trailing `>`).
    out = out.replace(new RegExp(`cid:${escapeRegex(cid)}>?`, 'gi'), url);
    // 2. `url(cid:foo)` inside CSS.
    out = out.replace(
      new RegExp(`url\\(\\s*['"]?cid:${escapeRegex(cid)}['"]?\\s*\\)`, 'gi'),
      `url("${url}")`
    );
  }
  return out;
}

const HTML_DOC = /<html[\s>]/i;

// URLs that are safe to load: cid: (already resolved above), data: (inline
// bytes, no network), and blob: (in-page). Everything http/https or protocol-
// relative can leak the fact that a mail was opened.
function isRemoteUrl(url: string): boolean {
  const trimmed = url.trim();
  if (!trimmed) return false;
  if (/^(cid:|data:|blob:|#)/i.test(trimmed)) return false;
  if (/^https?:\/\//i.test(trimmed)) return true;
  if (trimmed.startsWith('//')) return true;
  return false;
}

function hostOf(url: string): string | null {
  try {
    const abs = url.startsWith('//') ? `https:${url}` : url;
    return new URL(abs).host;
  } catch {
    return null;
  }
}

interface BlockResult { html: string; count: number; hosts: string[] }

function blockRemoteImages(html: string): BlockResult {
  const hosts = new Set<string>();
  let count = 0;

  // 1. <img src="…"> and <img srcset="…">, plus <source src=…> and <source srcset=…>.
  let out = html.replace(
    /<(img|source|video|audio|iframe)\b([^>]*?)>/gi,
    (full, tag, attrs) => {
      let changed = false;
      let next = attrs.replace(
        /\s(src|srcset|poster|background)\s*=\s*(['"])(.*?)\2/gi,
        (m: string, name: string, quote: string, value: string) => {
          if (!isRemoteUrl(value)) return m;
          const host = hostOf(value);
          if (host) hosts.add(host);
          count++;
          changed = true;
          return ` data-blocked-${name.toLowerCase()}=${quote}${value}${quote}`;
        }
      );
      // Also strip attribute-less `srcset=…` (rare) — not needed since regex covers it.
      if (changed) {
        // Neutralize the img/source so the browser doesn't complain about missing src.
        if (tag.toLowerCase() === 'img' && !/\ssrc\s*=/i.test(next)) {
          // 1x1 transparent GIF as harmless placeholder.
          next += ' src="data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw=="';
          next += ' alt=""';
        }
      }
      return `<${tag}${next}>`;
    }
  );

  // 2. Inline style="background: url(https://…)" or …-image: url(…).
  out = out.replace(
    /\sstyle\s*=\s*(['"])([^'"]*)\1/gi,
    (m, quote, css) => {
      let changed = false;
      const nextCss = css.replace(
        /url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi,
        (mm: string, _q: string, url: string) => {
          if (!isRemoteUrl(url)) return mm;
          const host = hostOf(url);
          if (host) hosts.add(host);
          count++;
          changed = true;
          return 'url("data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==")';
        }
      );
      return changed ? ` style=${quote}${nextCss}${quote}` : m;
    }
  );

  // 3. <style>…url(https://…)…</style> blocks.
  out = out.replace(
    /<style\b([^>]*)>([\s\S]*?)<\/style>/gi,
    (_full, attrs, css) => {
      let nextCss = css.replace(
        /url\(\s*(['"]?)([^)'"]+)\1\s*\)/gi,
        (m: string, _q: string, url: string) => {
          if (!isRemoteUrl(url)) return m;
          const host = hostOf(url);
          if (host) hosts.add(host);
          count++;
          return 'url("data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==")';
        }
      );
      return `<style${attrs}>${nextCss}</style>`;
    }
  );

  return { html: out, count, hosts: [...hosts] };
}

function baseCss(opts: {
  isDark: boolean;
  fontFamily?: string;
  fontSize?: number;
  padding: number;
  applyColors: boolean;
}): string {
  const font = opts.fontFamily || '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
  const size = opts.fontSize || 14;
  const colors = opts.applyColors
    ? `
      color: ${opts.isDark ? '#f5f5f7' : '#1d1d1f'};
      background: ${opts.isDark ? '#1a1b1f' : '#ffffff'};`
    : '';
  const blockquoteColor = opts.applyColors
    ? (opts.isDark ? '#98989d' : '#6e6e73')
    : 'inherit';
  const blockquoteBorder = opts.isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)';
  return `
    :root { color-scheme: ${opts.isDark ? 'dark' : 'light'}; }
    /* height:auto is load-bearing: the parent sizes the frame from
       body.scrollHeight, so body must never stretch to the frame. Mails that
       set html/body height:100% would otherwise feed the measurement back
       into itself, so this one wins over the mail's own stylesheet. */
    html, body { margin: 0; height: auto !important; min-height: 0 !important; }
    body {
      padding: ${opts.padding}px;
      font-family: ${font};
      font-size: ${size}px;
      line-height: 1.65;${colors}
      word-wrap: break-word;
      overflow-x: auto;
    }
    img { max-width: 100%; height: auto; }
    a { color: #0A84FF; }
    blockquote {
      margin: 8px 0;
      padding-left: 14px;
      border-left: 3px solid ${blockquoteBorder};
      color: ${blockquoteColor};
    }
    pre { white-space: pre-wrap; word-wrap: break-word; }
    table { max-width: 100%; }
  `.trim();
}

export function buildMailDocument(opts: BuildMailDocumentOptions): BuildMailDocumentResult {
  const html = opts.html || '';
  const resolved = resolveCids(html, opts.attachments, opts.attachmentUrl);

  // Block first so hasOwnBackground still sees any color the mail sets on
  // <body> (only remote *images* are neutralized).
  let workHtml = resolved;
  let blockedCount = 0;
  let blockedHosts: string[] = [];
  if (opts.blockRemote) {
    const b = blockRemoteImages(resolved);
    workHtml = b.html;
    blockedCount = b.count;
    blockedHosts = b.hosts;
  }

  const own = hasOwnBackground(workHtml);
  const pad = opts.padding ?? 18;
  const css = baseCss({
    isDark: opts.isDark,
    fontFamily: opts.fontFamily,
    fontSize: opts.fontSize,
    padding: pad,
    applyColors: !own,
  });

  // If the mail already ships a full document, do not prepend our <style> in
  // front of the DOCTYPE (that yields an invalid document that browsers parse
  // in quirks mode). Instead wrap it in a fresh shell that hosts our CSS in
  // <head>, and put the mail body inside <body>.
  //
  // For fragment HTML we build a complete document too so we always control
  // the doctype and can add <meta viewport>.
  const isFull = HTML_DOC.test(workHtml);
  const inner = isFull
    ? extractBodyContent(workHtml) || workHtml
    : workHtml;
  const inheritedHead = isFull ? extractHeadStyles(workHtml) : '';

  const srcDoc = `<!doctype html><html><head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <style>${css}</style>
    ${inheritedHead}
  </head><body>${inner}</body></html>`;

  return { srcDoc, hasOwnBackground: own, blockedCount, blockedHosts };
}

function extractBodyContent(html: string): string | null {
  const m = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  return m ? m[1] : null;
}

// Preserve <style>/<link> from the mail's <head> so its rules still apply
// even after we've reparented the body content.
function extractHeadStyles(html: string): string {
  const head = html.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i);
  if (!head) return '';
  const parts: string[] = [];
  const styleRe = /<style\b[^>]*>[\s\S]*?<\/style>/gi;
  const linkRe = /<link\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = styleRe.exec(head[1])) !== null) parts.push(m[0]);
  while ((m = linkRe.exec(head[1])) !== null) parts.push(m[0]);
  return parts.join('\n');
}
