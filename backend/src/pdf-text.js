import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pdfParse = require('pdf-parse/lib/pdf-parse.js');

const SKIP = /agb|widerruf|gebuehr|terms|privacy|bedingungen|nutzungs/i;

export function isInvoicePdf(filename = '', mime = '') {
  const name = String(filename);
  if (SKIP.test(name)) return false;
  const looksPdf = /\.pdf$/i.test(name) || /pdf/i.test(mime);
  if (!looksPdf) return false;
  return /rechn|mahnung|beleg|invoice|proforma|faktura|\b(re|rg|fv|pr|inv)[-_]/i.test(name) || looksPdf;
}

export async function extractPdfText(buffer) {
  if (!buffer || !buffer.length) return '';
  try {
    const result = await pdfParse(buffer, { max: 8 });
    return String(result?.text || '').replace(/\s+/g, ' ').trim().slice(0, 8000);
  } catch {
    return '';
  }
}
