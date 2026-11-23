/**
 * Gap closure — image validation by CONTENT, never by the client's claims.
 *
 * The declared Content-Type and file name are ignored: the type is taken
 * from the file's magic bytes and the pixel dimensions are parsed from the
 * real header. Only PNG, JPEG and WebP are accepted (no SVG — it can carry
 * script; no GIF/animated formats; no video). Pure and dependency-free.
 */

export type ImageMime = 'image/png' | 'image/jpeg' | 'image/webp';

export interface ImageInfo {
  mime: ImageMime;
  ext: 'png' | 'jpg' | 'webp';
  width: number;
  height: number;
}

const PNG_SIG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

function ascii(buf: Buffer, offset: number, length: number): string {
  if (buf.length < offset + length) return '';
  return buf.toString('latin1', offset, offset + length);
}

function png(buf: Buffer): ImageInfo | null {
  if (!startsWith(buf, PNG_SIG)) return null;
  // The first chunk MUST be IHDR (length 13): width/height big-endian.
  if (buf.length < 33 || ascii(buf, 12, 4) !== 'IHDR') return null;
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  return { mime: 'image/png', ext: 'png', width, height };
}

/** SOF markers carrying the frame size (baseline, progressive, …). */
const SOF = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function jpeg(buf: Buffer): ImageInfo | null {
  if (!startsWith(buf, [0xff, 0xd8, 0xff])) return null;
  let offset = 2;
  while (offset + 4 <= buf.length) {
    if (buf[offset] !== 0xff) return null;
    let marker = buf[offset + 1];
    // Fill bytes (0xFF padding) between markers.
    while (marker === 0xff && offset + 2 < buf.length) {
      offset += 1;
      marker = buf[offset + 1];
    }
    // Standalone markers without a length field.
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7)) {
      offset += 2;
      continue;
    }
    if (marker === 0xd9 || marker === 0xda) return null; // EOI / SOS first
    const length = buf.readUInt16BE(offset + 2);
    if (length < 2) return null;
    if (SOF.has(marker)) {
      if (offset + 9 > buf.length) return null;
      const height = buf.readUInt16BE(offset + 5);
      const width = buf.readUInt16BE(offset + 7);
      return { mime: 'image/jpeg', ext: 'jpg', width, height };
    }
    offset += 2 + length;
  }
  return null;
}

function webp(buf: Buffer): ImageInfo | null {
  if (ascii(buf, 0, 4) !== 'RIFF' || ascii(buf, 8, 4) !== 'WEBP') return null;
  const chunk = ascii(buf, 12, 4);
  if (chunk === 'VP8 ') {
    // Lossy: frame tag (3) + start code 9D 01 2A, then 14-bit sizes.
    if (buf.length < 30 || !startsWith(buf, [0x9d, 0x01, 0x2a], 23)) {
      return null;
    }
    const width = buf.readUInt16LE(26) & 0x3fff;
    const height = buf.readUInt16LE(28) & 0x3fff;
    return { mime: 'image/webp', ext: 'webp', width, height };
  }
  if (chunk === 'VP8L') {
    // Lossless: signature 0x2F, then 14-bit (width-1) / (height-1).
    if (buf.length < 25 || buf[20] !== 0x2f) return null;
    const bits = buf.readUInt32LE(21);
    const width = (bits & 0x3fff) + 1;
    const height = ((bits >> 14) & 0x3fff) + 1;
    return { mime: 'image/webp', ext: 'webp', width, height };
  }
  if (chunk === 'VP8X') {
    // Extended: 24-bit (canvas-1) sizes. Animation flag (bit 1) refused.
    if (buf.length < 30) return null;
    const flags = buf[20];
    if (flags & 0x02) return null;
    const width = buf.readUIntLE(24, 3) + 1;
    const height = buf.readUIntLE(27, 3) + 1;
    return { mime: 'image/webp', ext: 'webp', width, height };
  }
  return null;
}

/** The real image type + dimensions, or null for anything else. */
export function sniffImage(buf: Buffer): ImageInfo | null {
  const info = png(buf) ?? jpeg(buf) ?? webp(buf);
  if (!info || info.width <= 0 || info.height <= 0) return null;
  return info;
}
