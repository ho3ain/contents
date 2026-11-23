/** Minimal valid image HEADERS for tests (enough for magic + dimensions). */
export function pngHeader(width: number, height: number): Buffer {
  const buf = Buffer.alloc(64);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buf, 0);
  buf.writeUInt32BE(13, 8);
  buf.write('IHDR', 12, 'latin1');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

export function jpegHeader(width: number, height: number): Buffer {
  const app0 = Buffer.from([
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00,
    0x00, 0x01, 0x00, 0x01, 0x00, 0x00,
  ]);
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    app0,
    sof,
    Buffer.alloc(16),
  ]);
}

export function webpLossyHeader(width: number, height: number): Buffer {
  const buf = Buffer.alloc(40);
  buf.write('RIFF', 0, 'latin1');
  buf.writeUInt32LE(32, 4);
  buf.write('WEBP', 8, 'latin1');
  buf.write('VP8 ', 12, 'latin1');
  buf.writeUInt32LE(20, 16);
  Buffer.from([0x9d, 0x01, 0x2a]).copy(buf, 23);
  buf.writeUInt16LE(width & 0x3fff, 26);
  buf.writeUInt16LE(height & 0x3fff, 28);
  return buf;
}

export function webpExtendedHeader(
  width: number,
  height: number,
  animated = false,
): Buffer {
  const buf = Buffer.alloc(40);
  buf.write('RIFF', 0, 'latin1');
  buf.writeUInt32LE(32, 4);
  buf.write('WEBP', 8, 'latin1');
  buf.write('VP8X', 12, 'latin1');
  buf.writeUInt32LE(10, 16);
  buf[20] = animated ? 0x02 : 0;
  buf.writeUIntLE(width - 1, 24, 3);
  buf.writeUIntLE(height - 1, 27, 3);
  return buf;
}

export function webpLosslessHeader(width: number, height: number): Buffer {
  const buf = Buffer.alloc(40);
  buf.write('RIFF', 0, 'latin1');
  buf.writeUInt32LE(32, 4);
  buf.write('WEBP', 8, 'latin1');
  buf.write('VP8L', 12, 'latin1');
  buf.writeUInt32LE(10, 16);
  buf[20] = 0x2f;
  const bits = ((width - 1) & 0x3fff) | (((height - 1) & 0x3fff) << 14);
  buf.writeUInt32LE(bits >>> 0, 21);
  return buf;
}
