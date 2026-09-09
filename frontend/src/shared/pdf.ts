export function isPdfAttachment(att: { filename?: string; contentType?: string; mime?: string }): boolean {
  const name = (att.filename || '').toLowerCase();
  const type = (att.contentType || att.mime || '').toLowerCase();
  return type.includes('pdf') || name.endsWith('.pdf');
}
