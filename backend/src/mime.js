import iconv from 'iconv-lite';

export function mimeType(node) {
  if (!node) return '';
  const raw = String(node.type || '').toLowerCase();
  if (raw.includes('/')) return raw;
  const sub = String(node.subtype || '').toLowerCase();
  return sub ? `${raw}/${sub}` : raw;
}

export function mimeEncoding(node) {
  return String(node?.encoding || node?.transferEncoding || '').toLowerCase();
}

export function mimeCharset(node) {
  return node?.parameters?.charset || node?.charset || 'utf-8';
}

export function decodeQuotedPrintable(buffer) {
  const text = Buffer.isBuffer(buffer) ? buffer.toString('latin1') : String(buffer);
  const unfolded = text.replace(/=\r?\n/g, '');
  const bytes = [];
  for (let i = 0; i < unfolded.length; i++) {
    const ch = unfolded[i];
    if (ch === '=' && i + 2 < unfolded.length) {
      const hex = unfolded.slice(i + 1, i + 3);
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        bytes.push(parseInt(hex, 16));
        i += 2;
        continue;
      }
    }
    bytes.push(unfolded.charCodeAt(i) & 0xff);
  }
  return Buffer.from(bytes);
}

export function decodeCharset(buffer, charset) {
  if (!buffer) return '';
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const cs = String(charset || 'utf-8').toLowerCase().replace(/['"]/g, '').trim();
  if (cs && cs !== 'utf-8' && cs !== 'utf8' && cs !== 'us-ascii' && iconv.encodingExists(cs)) {
    try { return iconv.decode(buf, cs); } catch {}
  }
  return buf.toString('utf8');
}

export function decodeTransfer(buffer, encoding) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const enc = String(encoding || '').toLowerCase();
  if (enc === 'base64') {
    const ascii = buf.toString('ascii').replace(/\s+/g, '');
    return Buffer.from(ascii, 'base64');
  }
  if (enc === 'quoted-printable' || enc === 'qp') return decodeQuotedPrintable(buf);
  return buf;
}

export function looksLikeBase64(text) {
  if (!text) return false;
  const raw = String(text);
  const compact = raw.replace(/\s+/g, '');
  if (compact.length < 24) return false;
  if (!/^[A-Za-z0-9+/]+=*$/.test(compact)) return false;
  // Punctuation is a hard signal that this is natural text, not base64.
  if (/[.,;:!?()\[\]{}"'<>@#$%&*_\\]/.test(raw)) return false;
  // MIME base64 wraps at ~76 chars; natural text has spaces every ~5-8 chars.
  // If the original had whitespace, use average token length as a robust
  // discriminator: real base64 tokens are long, words are short.
  const tokens = raw.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    const avg = tokens.reduce((a, t) => a + t.length, 0) / tokens.length;
    if (avg < 24) return false;
  }
  // Additionally require some case/digit variety — pure lowercase runs are
  // almost always natural text.
  const hasUpper = /[A-Z]/.test(compact);
  const hasLower = /[a-z]/.test(compact);
  const hasDigit = /\d/.test(compact);
  const variety = Number(hasUpper) + Number(hasLower) + Number(hasDigit);
  if (variety < 2) return false;
  return true;
}

export function looksLikeQuotedPrintable(text) {
  if (!text) return false;
  const str = String(text);
  const hits = str.match(/=[0-9A-Fa-f]{2}/g);
  if (!hits || hits.length < 2) return false;
  if (/=[0-9A-Fa-f]{2}(\s|$)/.test(str) || /=[0-9A-Fa-f]{2}=[0-9A-Fa-f]{2}/.test(str)) return true;
  return hits.length >= 4;
}

export function looksEncoded(value) {
  if (!value) return false;
  return looksLikeBase64(value) || looksLikeQuotedPrintable(value);
}

// Share of characters that have no business in a mail body: C0/C1 control
// codes (tab, CR and LF excluded) and the Unicode replacement character.
// Binary noise from a wrong decode scores high, real text scores ~0.
function junkRatio(text) {
  if (!text) return 1;
  const junk = text.match(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\uFFFD]/g);
  return junk ? junk.length / text.length : 0;
}

const MAX_JUNK = 0.02;

// Try several charsets and keep the most plausible result. Real-world mails
// from older systems arrive as ISO-8859-1 or windows-1252 even when the header
// claims UTF-8. Note that single-byte charsets never produce replacement
// characters, so scoring purely on those would always pick them; junkRatio
// counts control characters as well and avoids that trap.
function bestDecode(buffer, preferred) {
  const candidates = [];
  if (preferred) candidates.push(preferred);
  for (const cs of ['utf-8', 'windows-1252', 'iso-8859-1']) {
    if (!candidates.includes(cs)) candidates.push(cs);
  }
  let best = null;
  for (const cs of candidates) {
    try {
      const decoded = decodeCharset(buffer, cs);
      const score = junkRatio(decoded);
      if (score === 0) return decoded;
      if (!best || score < best.score) best = { text: decoded, score };
    } catch {}
  }
  return best ? best.text : buffer.toString('utf8');
}

function unwrapOnce(text, charset) {
  if (!text) return '';
  if (looksLikeBase64(text)) {
    try {
      const buf = Buffer.from(String(text).replace(/\s+/g, ''), 'base64');
      const decoded = bestDecode(buf, charset);
      // Only accept the "repair" when the result is actually cleaner than
      // what we started with. Without this, a false positive from
      // looksLikeBase64 turns a perfectly good body into binary noise.
      if (decoded && decoded !== text && junkRatio(decoded) <= MAX_JUNK && junkRatio(decoded) <= junkRatio(text)) {
        return decoded;
      }
    } catch {}
  }
  if (looksLikeQuotedPrintable(text)) {
    const decoded = bestDecode(decodeQuotedPrintable(Buffer.from(text, 'latin1')), charset);
    if (decoded && decoded !== text && junkRatio(decoded) <= junkRatio(text)) return decoded;
  }
  return text;
}

export function repairEncodedText(text, charset) {
  if (!text) return '';
  let out = String(text);
  for (let i = 0; i < 3; i++) {
    const next = unwrapOnce(out, charset);
    if (next === out) break;
    out = next;
  }
  return out;
}

export function decodeMimeWords(value) {
  if (!value || !String(value).includes('=?')) return value || '';
  return String(value).replace(/=\?([^?]+)\?([BQbq])\?([^?]*)\?=/g, (all, charset, enc, data) => {
    try {
      const buf = enc.toUpperCase() === 'B'
        ? Buffer.from(data.replace(/\s+/g, ''), 'base64')
        : decodeQuotedPrintable(Buffer.from(data.replace(/_/g, ' '), 'latin1'));
      return decodeCharset(buf, charset);
    } catch {
      return all;
    }
  });
}

export function decodeBody(buffer, charset, encoding) {
  if (!buffer) return '';
  try {
    const transferred = decodeTransfer(buffer, encoding);
    const text = decodeCharset(transferred, charset);

    // Safety net against double transfer-decoding: if applying the encoding
    // produced junk while the untouched buffer reads as clean text, the
    // payload had already been decoded upstream. Keep the clean version.
    if (encoding && junkRatio(text) > MAX_JUNK) {
      const asIs = decodeCharset(buffer, charset);
      if (junkRatio(asIs) < junkRatio(text)) {
        return repairEncodedText(decodeMimeWords(asIs), charset);
      }
    }

    return repairEncodedText(decodeMimeWords(text), charset);
  } catch {
    return repairEncodedText(Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer), charset);
  }
}

export async function collectStream(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export async function downloadPart(client, uid, part) {
  const result = await client.download(uid, part === undefined ? false : part, { uid: true });
  return collectStream(result.content);
}
