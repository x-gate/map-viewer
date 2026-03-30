/**
 * Shared store for user-provided CrossGate assets.
 *
 * Users load their own GraphicInfo, Graphic, palette, and map files
 * via the file picker. This store holds the parsed data in memory.
 */

import type { GraphicInfoEntry } from "./graphic-info";
import { parseGraphicInfo } from "./graphic-info";
import type { MapData } from "./map";
import { parseMap } from "./map";
import type { Color } from "./palette";
import { CGP_SIZE, createDefaultPalette, parseCgpPalette } from "./palette";

export interface CrossGateStore {
  graphicInfos: GraphicInfoEntry[];
  graphicData: ArrayBuffer;
  palette: Color[];
  mapIdIndex: Map<number, GraphicInfoEntry>;
  maps: Map<string, MapData>;
}

let store: CrossGateStore | null = null;

export function getStore(): CrossGateStore | null {
  return store;
}

export function isStoreReady(): boolean {
  return store !== null;
}

/**
 * Initialize the store from user-provided files.
 *
 * @param graphicInfoFile - GraphicInfo_66.bin (or similar)
 * @param graphicFile - Graphic_66.bin (or similar)
 * @param paletteFile - Optional palet_00.cgp; uses default palette if omitted
 * @param mapFiles - Array of {name, file} for map .dat files
 */
export async function initStore(
  graphicInfoFile: File,
  graphicFile: File,
  paletteFile: File | null,
  mapFiles: File[],
): Promise<CrossGateStore> {
  const [graphicInfoBuf, graphicBuf, paletteBuf] = await Promise.all([
    graphicInfoFile.arrayBuffer(),
    graphicFile.arrayBuffer(),
    paletteFile ? paletteFile.arrayBuffer() : Promise.resolve(null),
  ]);

  const graphicInfos = parseGraphicInfo(graphicInfoBuf);

  let palette: Color[];
  if (paletteBuf) {
    const data = new Uint8Array(
      paletteBuf,
      0,
      Math.min(paletteBuf.byteLength, CGP_SIZE),
    );
    palette = parseCgpPalette(data);
  } else {
    palette = createDefaultPalette();
  }

  const mapIdIndex = new Map<number, GraphicInfoEntry>();
  for (const info of graphicInfos) {
    if (info.mapId !== 0 && !mapIdIndex.has(info.mapId)) {
      mapIdIndex.set(info.mapId, info);
    }
  }

  // Parse map files in parallel
  const mapEntries = await Promise.all(
    mapFiles.map(async (f) => {
      try {
        const buf = await f.arrayBuffer();
        const bytes = new Uint8Array(buf, 0, 3);
        // Validate MAP magic
        if (bytes[0] !== 0x4d || bytes[1] !== 0x41 || bytes[2] !== 0x50) {
          return null;
        }
        const mapData = parseMap(buf);
        // Use filename without extension as key
        const name = f.name.replace(/\.dat$/i, "");
        return [name, mapData] as const;
      } catch {
        return null;
      }
    }),
  );

  const maps = new Map<string, MapData>();
  for (const entry of mapEntries) {
    if (entry) maps.set(entry[0], entry[1]);
  }

  store = {
    graphicInfos,
    graphicData: graphicBuf,
    palette,
    mapIdIndex,
    maps,
  };

  return store;
}

export function clearStore() {
  store = null;
}
