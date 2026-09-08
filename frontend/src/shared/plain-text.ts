// Turn a plain-text mail body into safe HTML for display: unwrap RFC 3676
// format=flowed soft line breaks, escape HTML, linkify URLs and emails, and
// style `>` quote levels as nested <blockquote>s.

export interface RenderPlainTextOptions {
  // Whether to interpret RFC 3676 format=flowed. Detected automatically when
  // the string contains trailing-space lines followed by more text.
  flowed?: boolean;
  // If set, remove the exact number of trailing spaces per line (delsp=yes).
  delsp?: boolean;
}

export function renderPlainText(input: string, options: RenderPlainTextOptions = {}): string {
  if (!input) return '';
  const flowed = options.flowed ?? looksFlowed(input);
  const unwrapped = flowed ? unflow(input, options.delsp) : input;
  return buildQuotedHtml(unwrapped);
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// RFC 3676: a line ending with a single space is "flowed" and joins with the
// following line. `-- ` (signature separator) is preserved as-is. If there
// are no space-terminated lines, we assume fixed formatting and skip unwrap.
function looksFlowed(text: string): boolean {
  const lines = text.split(/\r?\n/);
  let softCount = 0;
  for (const line of lines) {
    if (line.endsWith(' ') && line !== '-- ') softCount++;
  }
  return softCount >= 2;
}

function unflow(text: string, delsp = false): string {
  const lines = text.split(/\r?\n/);
  const out: string[] = [];
  let buffer = '';
  let bufferQuote = -1;

  const flushBuffer = () => {
    if (buffer.length || bufferQuote >= 0) {
      const prefix = bufferQuote > 0 ? '>'.repeat(bufferQuote) + ' ' : '';
      out.push(prefix + buffer);
      buffer = '';
      bufferQuote = -1;
    }
  };

  for (const raw of lines) {
    // Signature line ends a flowed run.
    if (raw === '-- ' || raw === '--') {
      flushBuffer();
      out.push(raw);
      continue;
    }

    const quoteMatch = raw.match(/^(>+)\s?(.*)$/);
    const quote = quoteMatch ? quoteMatch[1].length : 0;
    const body = quoteMatch ? quoteMatch[2] : raw;

    const isSoft = body.endsWith(' ');
    const content = isSoft && delsp ? body.slice(0, -1) : body;

    // Quote level change forces flush.
    if (bufferQuote !== -1 && bufferQuote !== quote) flushBuffer();

    if (isSoft) {
      buffer += content;
      bufferQuote = quote;
    } else {
      buffer += content;
      bufferQuote = quote;
      flushBuffer();
    }
  }
  flushBuffer();
  return out.join('\n');
}

// Emit HTML with <blockquote>-nested quotes, linkified URLs and mail
// addresses, and preserved line breaks inside paragraphs via <br>.
function buildQuotedHtml(text: string): string {
  const lines = text.split(/\r?\n/);
  const html: string[] = [];
  let currentQuote = 0;

  const openTo = (level: number) => {
    while (currentQuote < level) { html.push('<blockquote>'); currentQuote++; }
    while (currentQuote > level) { html.push('</blockquote>'); currentQuote--; }
  };

  let paragraphOpen = false;
  const openParagraph = () => {
    if (!paragraphOpen) { html.push('<p>'); paragraphOpen = true; }
  };
  const closeParagraph = () => {
    if (paragraphOpen) { html.push('</p>'); paragraphOpen = false; }
  };

  for (const raw of lines) {
    const m = raw.match(/^(>+)\s?(.*)$/);
    const quote = m ? m[1].length : 0;
    const body = m ? m[2] : raw;

    if (quote !== currentQuote) {
      closeParagraph();
      openTo(quote);
    }

    if (body === '') {
      closeParagraph();
      continue;
    }

    if (paragraphOpen) html.push('<br>');
    openParagraph();
    html.push(linkify(escapeHtml(body)));
  }
  closeParagraph();
  openTo(0);
  return html.join('');
}

const URL_RE = /\b(https?:\/\/[^\s<>()"']+[^\s<>()"'.,;:!?])/gi;
const MAIL_RE = /\b([a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,})\b/gi;

function linkify(escaped: string): string {
  return escaped
    .replace(URL_RE, (url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`)
    .replace(MAIL_RE, (mail) => `<a href="mailto:${mail}">${mail}</a>`);
}
