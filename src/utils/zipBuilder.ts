export interface ZipInputFile {
  path: string;
  content: string;
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16LE(view: DataView, offset: number, value: number): void {
  view.setUint16(offset, value & 0xffff, true);
}

function writeUint32LE(view: DataView, offset: number, value: number): void {
  view.setUint32(offset, value >>> 0, true);
}

/**
 * Generates a standard uncompressed (STORE, method 0) PKZIP archive in pure TypeScript
 * with zero runtime dependencies.
 */
export function buildZipArchive(files: ZipInputFile[]): Uint8Array {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = encoder.encode(file.path);
    const dataBytes = encoder.encode(file.content);
    const checksum = crc32(dataBytes);

    // Local file header (30 bytes + filename)
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32LE(localView, 0, 0x04034b50); // Local file header signature
    writeUint16LE(localView, 4, 20); // Version needed to extract
    writeUint16LE(localView, 6, 0x0800); // UTF-8 filename flag
    writeUint16LE(localView, 8, 0); // Compression method 0 (STORE)
    writeUint16LE(localView, 10, 0); // Mod time
    writeUint16LE(localView, 12, 0x5421); // Mod date
    writeUint32LE(localView, 14, checksum);
    writeUint32LE(localView, 18, dataBytes.length);
    writeUint32LE(localView, 22, dataBytes.length);
    writeUint16LE(localView, 26, nameBytes.length);
    writeUint16LE(localView, 28, 0); // Extra field length
    localHeader.set(nameBytes, 30);

    localChunks.push(localHeader, dataBytes);

    // Central directory header (46 bytes + filename)
    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32LE(centralView, 0, 0x02014b50); // Central directory signature
    writeUint16LE(centralView, 4, 20); // Version made by
    writeUint16LE(centralView, 6, 20); // Version needed
    writeUint16LE(centralView, 8, 0x0800); // UTF-8 flag
    writeUint16LE(centralView, 10, 0); // Compression method 0 (STORE)
    writeUint16LE(centralView, 12, 0); // Mod time
    writeUint16LE(centralView, 14, 0x5421); // Mod date
    writeUint32LE(centralView, 16, checksum);
    writeUint32LE(centralView, 20, dataBytes.length);
    writeUint32LE(centralView, 24, dataBytes.length);
    writeUint16LE(centralView, 28, nameBytes.length);
    writeUint16LE(centralView, 30, 0); // Extra field length
    writeUint16LE(centralView, 32, 0); // File comment length
    writeUint16LE(centralView, 34, 0); // Disk number start
    writeUint16LE(centralView, 36, 0); // Internal attrs
    writeUint32LE(centralView, 38, 0); // External attrs
    writeUint32LE(centralView, 42, offset); // Relative offset of local header
    centralHeader.set(nameBytes, 46);

    centralChunks.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const centralSize = centralChunks.reduce((acc, chunk) => acc + chunk.length, 0);
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  writeUint32LE(eocdView, 0, 0x06054b50); // End of central directory signature
  writeUint16LE(eocdView, 4, 0); // Disk number
  writeUint16LE(eocdView, 6, 0); // Central dir start disk
  writeUint16LE(eocdView, 8, files.length);
  writeUint16LE(eocdView, 10, files.length);
  writeUint32LE(eocdView, 12, centralSize);
  writeUint32LE(eocdView, 16, offset);
  writeUint16LE(eocdView, 20, 0); // Comment length

  const totalSize = offset + centralSize + eocd.length;
  const output = new Uint8Array(totalSize);
  let cursor = 0;
  for (const chunk of localChunks) {
    output.set(chunk, cursor);
    cursor += chunk.length;
  }
  for (const chunk of centralChunks) {
    output.set(chunk, cursor);
    cursor += chunk.length;
  }
  output.set(eocd, cursor);
  return output;
}
