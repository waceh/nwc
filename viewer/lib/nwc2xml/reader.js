import { cp949Extension } from './cp949.js';

// Binary reader with little-endian support
export class BinaryReader {
  constructor(buffer) {
    // Ensure we have a plain Uint8Array with its own ArrayBuffer
    if (buffer instanceof ArrayBuffer) {
      this.buffer = new Uint8Array(buffer);
    } else if (ArrayBuffer.isView(buffer)) {
      // Copy to new Uint8Array to avoid offset issues with Node Buffer
      this.buffer = new Uint8Array(buffer.length);
      this.buffer.set(buffer);
    } else {
      this.buffer = new Uint8Array(buffer);
    }
    this.view = new DataView(this.buffer.buffer);
    this.pos = 0;
  }

  get length() { return this.buffer.length; }
  get remaining() { return this.length - this.pos; }
  eof() { return this.pos >= this.length; }
  tell() { return this.pos; }
  seek(pos) { this.pos = pos; }
  skip(n) { this.pos += n; }

  readUint8() { return this.buffer[this.pos++]; }
  readInt8() { return this.view.getInt8(this.pos++); }
  readUint16() { const v = this.view.getUint16(this.pos, true); this.pos += 2; return v; }
  readInt16() { const v = this.view.getInt16(this.pos, true); this.pos += 2; return v; }
  readUint32() { const v = this.view.getUint32(this.pos, true); this.pos += 4; return v; }
  readBytes(n) { const b = this.buffer.slice(this.pos, this.pos + n); this.pos += n; return b; }

  readUntil(byte) {
    while (this.pos < this.length && this.buffer[this.pos] !== byte) this.pos++;
  }

  readStringNul() {
    const start = this.pos;
    while (this.pos < this.length && this.buffer[this.pos] !== 0) this.pos++;
    const bytes = this.buffer.slice(start, this.pos);
    this.pos++; // skip NUL
    return decodeString(bytes);
  }

  readStringSpace() {
    const start = this.pos;
    while (this.pos < this.length && this.buffer[this.pos] !== 0 && this.buffer[this.pos] > 32) this.pos++;
    const bytes = this.buffer.slice(start, this.pos);
    this.pos++; // skip terminator (space or NUL)
    return decodeString(bytes);
  }
}

const _td_utf8  = new TextDecoder('utf-8', { fatal: true });
const _td_euckr = new TextDecoder('euc-kr', { fatal: true });
const _td_w1252 = new TextDecoder('windows-1252');

// EUC-KR / CP949 lead-byte pattern: 0x81-0xFE followed by 0x41-0x5A,
// 0x61-0x7A, or 0x81-0xFE. Any unpaired high byte disqualifies.
function looksLikeEUCKR(bytes) {
  let high = 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b < 0x80) continue;
    high++;
    if (b >= 0x81 && b <= 0xFE && i + 1 < bytes.length) {
      const n = bytes[i + 1];
      if ((n >= 0x41 && n <= 0x5A) ||
          (n >= 0x61 && n <= 0x7A) ||
          (n >= 0x81 && n <= 0xFE)) {
        i++;
        continue;
      }
    }
    return false;
  }
  return high > 0;
}

export function decodeString(bytes) {
  // NWC files store strings in the locale codepage of the authoring Windows
  // machine. Try UTF-8 first (valid UTF-8 is a strict subset of ASCII), then
  // detect EUC-KR / CP949 (Korean), and fall back to Windows-1252 which maps
  // every byte 0x00-0xFF losslessly.
  try {
    return _td_utf8.decode(bytes);
  } catch {
    if (looksLikeEUCKR(bytes)) {
      try {
        let text = '';
        for (let i = 0; i < bytes.length; i++) {
          if (bytes[i] < 0x80) {
            text += String.fromCharCode(bytes[i]);
          } else {
            const extension = cp949Extension(bytes[i], bytes[i + 1]);
            text += extension ?? _td_euckr.decode(bytes.subarray(i, i + 2));
            i++;
          }
        }
        if (/[\uac00-\ud7a3]/.test(text)) return text;
      } catch { /* Not a valid Korean string; use the Western fallback. */ }
    }
    return _td_w1252.decode(bytes);
  }
}

// Decode NWCTXT fields separately: old Windows codepages and UTF-8 may
// coexist in metadata and lyrics. Never include the binary NWC header.
export function decodeNwcText(bytes) {
  const parts = [];
  let start = 0;
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 0x7c || bytes[i] === 0x0a) {
      parts.push(decodeString(bytes.subarray(start, i)), String.fromCharCode(bytes[i]));
      start = i + 1;
    }
  }
  parts.push(decodeString(bytes.subarray(start)));
  return parts.join('');
}
