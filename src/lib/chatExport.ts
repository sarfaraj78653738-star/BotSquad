import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';

// Chat export: the thread transcript as a ZIP file with one chat.txt
// inside, written to the app cache and opened in the system share
// sheet so the user can save it to Files/Drive or send it anywhere.
// The ZIP writer is dependency-free (stored entries, no compression)
// so the file is a real .zip any unzip tool can open. No chat content
// leaves the device except through the share sheet the user picks.

// ---- UTF-8 + CRC32 + base64 (small, no dependencies) ----
function utf8Bytes(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    let code = s.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < s.length) {
      const next = s.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) { code = 0x10000 + ((code - 0xd800) * 0x400) + (next - 0xdc00); i++; }
    }
    if (code < 0x80) out.push(code);
    else if (code < 0x800) out.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    else if (code < 0x10000) out.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    else out.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
  }
  return out;
}

const CRC_TABLE: number[] = (() => {
  const table: number[] = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table.push(c >>> 0);
  }
  return table;
})();

function crc32(bytes: number[]): number {
  let crc = 0xffffffff;
  for (const b of bytes) crc = CRC_TABLE[(crc ^ b) & 0xff]! ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function base64(bytes: number[]): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i]!, b = i + 1 < bytes.length ? bytes[i + 1]! : 0, c = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    out += B64[a >> 2] + B64[((a & 3) << 4) | (b >> 4)] + (i + 1 < bytes.length ? B64[((b & 15) << 2) | (c >> 6)] : '=') + (i + 2 < bytes.length ? B64[c & 63] : '=');
  }
  return out;
}

function storedZip(files: { name: string; text: string }[]): number[] {
  const out: number[] = [];
  const centrals: { name: number[]; crc: number; size: number; offset: number }[] = [];
  const put16 = (v: number) => { out.push(v & 0xff, (v >> 8) & 0xff); };
  const put32 = (v: number) => { out.push(v & 0xff, (v >> 8) & 0xff, (v >> 16) & 0xff, (v >> 24) & 0xff); };
  for (const f of files) {
    const name = utf8Bytes(f.name);
    const data = utf8Bytes(f.text);
    const crc = crc32(data);
    const offset = out.length;
    put32(0x04034b50); put16(20); put16(0x0800); put16(0); put16(0); put16(0); put32(crc); put32(data.length); put32(data.length); put16(name.length); put16(0);
    out.push(...name, ...data);
    centrals.push({ name, crc, size: data.length, offset });
  }
  const centralStart = out.length;
  for (const c of centrals) {
    put32(0x02014b50); put16(20); put16(20); put16(0x0800); put16(0); put16(0); put16(0); put32(c.crc); put32(c.size); put32(c.size); put16(c.name.length); put16(0); put16(0); put16(0); put16(0); put32(0); put32(c.offset);
    out.push(...c.name);
  }
  const centralSize = out.length - centralStart;
  put32(0x06054b50); put16(0); put16(0); put16(centrals.length); put16(centrals.length); put32(centralSize); put32(centralStart); put16(0);
  return out;
}

export function buildTranscript(title: string, messages: { role: string; text: string }[]): string {
  const lines = [`Chat: ${title}`, `Exported: ${new Date().toISOString()}`, ''];
  for (const m of messages) {
    const who = m.role === 'user' ? 'You' : m.role === 'assistant' ? 'Assistant' : 'Note';
    lines.push(`${who}: ${m.text}`, '');
  }
  return lines.join('\n');
}

// Shared ZIP helpers: the Workspace screen reuses them to export a
// whole workspace, so the ZIP writer lives here, not only in chat
// export. Files are text (code, pages, notes) — the writer stores
// UTF-8 text, it is not a binary archiver.
export function zipFilesBase64(files: { name: string; text: string }[]): string {
  return base64(storedZip(files));
}

export async function shareZipFile(filename: string, b64: string): Promise<void> {
  const dir = FileSystem.cacheDirectory;
  if (!dir) throw new Error('No cache directory');
  const uri = `${dir}${filename}`;
  await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { mimeType: 'application/zip', dialogTitle: 'Save ZIP' });
  } else {
    throw new Error('Sharing is not available');
  }
}

function safeFileName(title: string): string {
  const cleaned = title.replace(/[^A-Za-z0-9-_ ]+/g, '').trim().replace(/\s+/g, '-').slice(0, 60) || 'chat';
  return `${cleaned}.zip`;
}

export async function exportChatZip(title: string, messages: { role: string; text: string }[]): Promise<void> {
  await shareZipFile(safeFileName(title), zipFilesBase64([{ name: 'chat.txt', text: buildTranscript(title, messages) }]));
}
