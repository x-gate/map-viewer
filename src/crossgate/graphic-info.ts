/**
 * Parser for CrossGate GraphicInfo binary files (e.g. GraphicInfo_66.bin).
 *
 * Each entry is a 40-byte little-endian record containing metadata
 * about a graphic stored in the corresponding Graphic file.
 */

export const GRAPHIC_INFO_ENTRY_SIZE = 40;

export interface GraphicInfoEntry {
  /** Unique graphic identifier */
  id: number;
  /** Byte offset into the Graphic file */
  addr: number;
  /** Total byte length of this graphic's data (header + payload) */
  len: number;
  /** X offset for rendering/positioning */
  offX: number;
  /** Y offset for rendering/positioning */
  offY: number;
  /** Image width in pixels */
  width: number;
  /** Image height in pixels */
  height: number;
  /** Grid width (for map tile usage) */
  gridW: number;
  /** Grid height (for map tile usage) */
  gridH: number;
  /** Accessibility flag */
  access: number;
  /** Map tile ID (0 = not a map tile) */
  mapId: number;
}

/** Parse a GraphicInfo binary file into an array of entries. */
export function parseGraphicInfo(buffer: ArrayBuffer): GraphicInfoEntry[] {
  const entryCount = Math.floor(buffer.byteLength / GRAPHIC_INFO_ENTRY_SIZE);
  const view = new DataView(buffer);
  const entries: GraphicInfoEntry[] = new Array(entryCount);

  for (let i = 0; i < entryCount; i++) {
    const offset = i * GRAPHIC_INFO_ENTRY_SIZE;
    entries[i] = {
      id: view.getInt32(offset, true),
      addr: view.getInt32(offset + 4, true),
      len: view.getInt32(offset + 8, true),
      offX: view.getInt32(offset + 12, true),
      offY: view.getInt32(offset + 16, true),
      width: view.getInt32(offset + 20, true),
      height: view.getInt32(offset + 24, true),
      gridW: view.getUint8(offset + 28),
      gridH: view.getUint8(offset + 29),
      access: view.getUint8(offset + 30),
      // 5 bytes padding at offset+31
      mapId: view.getInt32(offset + 36, true),
    };
  }

  return entries;
}
