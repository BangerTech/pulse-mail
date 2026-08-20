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

function unwrapOnce(text) {
  if (!text) return '';
  if (looksLikeBase64(text)) {
    try {
      const decoded = Buffer.from(String(text).replace(/\s+/g, ''), 'base64').toString('utf8');
      if (decoded && decoded !== text && (decoded.includes('<') || /[\s\wäöüÄÖÜß]/.test(decoded))) {
        return decoded;
      }
    } catch {}
  }
  if (looksLikeQuotedPrintable(text)) {
    const decoded = decodeCharset(decodeQuotedPrintable(Buffer.from(text, 'latin1')), 'utf-8');
    if (decoded && decoded !== text) return decoded;
  }
  return text;
}

export function repairEncodedText(text) {
  if (!text) return '';
  let out = String(text);
  for (let i = 0; i < 3; i++) {
    const next = unwrapOnce(out);
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
    return repairEncodedText(decodeMimeWords(text));
  } catch {
    return repairEncodedText(Buffer.isBuffer(buffer) ? buffer.toString('utf8') : String(buffer));
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
