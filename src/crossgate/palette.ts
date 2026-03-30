/**
 * CrossGate palette handling.
 *
 * Palette entries are stored as RGBA (4 bytes each).
 * External palettes (.cgp) use BGR byte order with 16 prefix + 224 CGP + 16 suffix colors.
 * Embedded palettes (version >= 2) are BGR triplets appended to the decoded data.
 */

/** RGBA color tuple */
export type Color = [r: number, g: number, b: number, a: number];

/** 16 hardcoded prefix colors (indices 0-15). Index 0 is transparent. */
const PREFIX_COLORS: Color[] = [
  [0x00, 0x00, 0x00, 0x00], // 0: transparent
  [0x00, 0x00, 0x80, 0xff], // 1
  [0x00, 0x80, 0x00, 0xff], // 2
  [0x00, 0x80, 0x80, 0xff], // 3
  [0x80, 0x00, 0x00, 0xff], // 4
  [0x80, 0x00, 0x80, 0xff], // 5
  [0x80, 0x80, 0x00, 0xff], // 6
  [0xc0, 0xc0, 0xc0, 0xff], // 7
  [0xc0, 0xdc, 0xc0, 0xff], // 8
  [0xf0, 0xca, 0xa6, 0xff], // 9
  [0x00, 0x00, 0xde, 0xff], // 10
  [0x00, 0x5f, 0xff, 0xff], // 11
  [0xa0, 0xff, 0xff, 0xff], // 12
  [0xd2, 0x5f, 0x00, 0xff], // 13
  [0xff, 0xd2, 0x50, 0xff], // 14
  [0x28, 0xe1, 0x28, 0xff], // 15
];

/** 16 hardcoded suffix colors (indices 240-255) */
const SUFFIX_COLORS: Color[] = [
  [0xff, 0xfb, 0xf0, 0xff], // 240
  [0xa0, 0xa0, 0xa4, 0xff], // 241
  [0x80, 0x80, 0x80, 0xff], // 242
  [0xff, 0x00, 0x00, 0xff], // 243
  [0x00, 0xff, 0x00, 0xff], // 244
  [0xff, 0xff, 0x00, 0xff], // 245
  [0x00, 0x00, 0xff, 0xff], // 246
  [0xff, 0x00, 0xff, 0xff], // 247
  [0x00, 0xff, 0xff, 0xff], // 248
  [0xff, 0xff, 0xff, 0xff], // 249
  [0x00, 0x00, 0x00, 0xff], // 250
  [0x00, 0x00, 0x00, 0xff], // 251
  [0x00, 0x00, 0x00, 0xff], // 252
  [0x00, 0x00, 0x00, 0xff], // 253
  [0x00, 0x00, 0x00, 0xff], // 254
  [0x00, 0x00, 0x00, 0xff], // 255
];

/** Build the default 256-color palette (no CGP, just prefix + blank + suffix) */
export function createDefaultPalette(): Color[] {
  const palette: Color[] = new Array(256);
  for (let i = 0; i < 16; i++) palette[i] = PREFIX_COLORS[i];
  for (let i = 16; i < 240; i++) palette[i] = [0, 0, 0, 0xff];
  for (let i = 0; i < 16; i++) palette[240 + i] = SUFFIX_COLORS[i];
  return palette;
}

/** Number of bytes to read from a CGP file (only first 672 bytes are palette data). */
export const CGP_SIZE = (256 - 32) * 3; // 672

/**
 * Parse an external CGP palette file.
 * Only the first 672 bytes are read (224 BGR triplets); any trailing data is ignored.
 * Special transparent values: (0,0,0), (0xFF,0,0), (0,0xFF,0), (0,0,0xFF).
 */
export function parseCgpPalette(data: Uint8Array): Color[] {
  const palette: Color[] = new Array(256);
  for (let i = 0; i < 16; i++) palette[i] = PREFIX_COLORS[i];

  for (let i = 0; i < 224; i++) {
    const offset = i * 3;
    const b = data[offset];
    const g = data[offset + 1];
    const r = data[offset + 2];

    if (isTransparentBgr(b, g, r)) {
      palette[16 + i] = [0, 0, 0, 0];
    } else {
      palette[16 + i] = [r, g, b, 0xff];
    }
  }

  for (let i = 0; i < 16; i++) palette[240 + i] = SUFFIX_COLORS[i];
  return palette;
}

/** Check if a BGR triplet should be treated as transparent. */
function isTransparentBgr(b: number, g: number, r: number): boolean {
  return (
    (b === 0 && g === 0 && r === 0) ||
    (b === 0xff && g === 0 && r === 0) ||
    (b === 0 && g === 0xff && r === 0) ||
    (b === 0 && g === 0 && r === 0xff)
  );
}

/**
 * Parse an embedded palette from decoded graphic data.
 * Each color is 3 bytes in BGR order.
 * Special transparent values: (0,0,0), (0xFF,0,0), (0,0xFF,0), (0,0,0xFF).
 */
export function parseEmbeddedPalette(data: Uint8Array): Color[] {
  const count = Math.floor(data.length / 3);
  const palette: Color[] = new Array(count);

  for (let i = 0; i < count; i++) {
    const offset = i * 3;
    const b = data[offset];
    const g = data[offset + 1];
    const r = data[offset + 2];

    if (isTransparentBgr(b, g, r)) {
      palette[i] = [0, 0, 0, 0];
    } else {
      palette[i] = [r, g, b, 0xff];
    }
  }

  return palette;
}
