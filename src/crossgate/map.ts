/**
 * Parser for CrossGate map .dat files.
 *
 * File structure: 20-byte header + 3 layers of uint16[width * height]
 * - Ground layer: floor/terrain tile MapIDs
 * - Object layer: object tile MapIDs (trees, buildings, etc.)
 * - Meta layer: collision/passability flags (not used for rendering)
 */

const HEADER_SIZE = 20;
const MAGIC_M = 0x4d; // 'M'
const MAGIC_A = 0x41; // 'A'
const MAGIC_P = 0x50; // 'P'

export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 47;

export interface MapData {
  width: number;
  height: number;
  /** Ground tile MapIDs (width * height), original orientation */
  ground: Uint16Array;
  /** Object tile MapIDs (width * height), original orientation */
  object: Uint16Array;
  /** Meta/collision data (width * height) */
  meta: Uint16Array;
}

/** Parse a CrossGate map .dat file. */
export function parseMap(buffer: ArrayBuffer): MapData {
  const bytes = new Uint8Array(buffer);
  if (bytes[0] !== MAGIC_M || bytes[1] !== MAGIC_A || bytes[2] !== MAGIC_P) {
    throw new Error("Invalid map magic: expected 'MAP'");
  }

  const view = new DataView(buffer);
  const width = view.getInt32(12, true);
  const height = view.getInt32(16, true);
  const tileCount = width * height;
  const layerBytes = tileCount * 2;

  const expectedSize = HEADER_SIZE + layerBytes * 3;
  if (buffer.byteLength < expectedSize) {
    throw new Error(
      `Map file too small: expected ${expectedSize}, got ${buffer.byteLength}`,
    );
  }

  const ground = new Uint16Array(buffer, HEADER_SIZE, tileCount);
  const object = new Uint16Array(buffer, HEADER_SIZE + layerBytes, tileCount);
  const meta = new Uint16Array(buffer, HEADER_SIZE + layerBytes * 2, tileCount);

  return { width, height, ground, object, meta };
}

/**
 * Rotate a tile layer -90 degrees (clockwise).
 * Input: col columns × row rows → Output: row columns × col rows
 */
export function rotateLayer(
  data: Uint16Array,
  col: number,
  row: number,
): { data: Uint16Array; width: number; height: number } {
  const result = new Uint16Array(data.length);
  for (let i = 0; i < data.length; i++) {
    result[i] = data[col * ((i % row) + 1) - 1 - Math.floor(i / row)];
  }
  return { data: result, width: row, height: col };
}

/**
 * Convert isometric tile coordinates to screen pixel position.
 * Used for ground layer tiles after rotation.
 */
export function tileToScreen(
  col: number,
  row: number,
): { x: number; y: number } {
  return {
    x: (col - row) * (TILE_WIDTH / 2),
    y: (col + row) * (TILE_HEIGHT / 2),
  };
}
