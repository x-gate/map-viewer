import type * as Contract from "../../.generated/xglib/contract";
import type { ResourceSet } from "./catalog";
import type { TileInfo, OpenResult, DecodedTile } from "./protocol";
import { readTileInfo, validTileInfo, decodeTile } from "./graphic";
const MAX_CELLS = 1_000_000;

export class ResourceSession {
  private index = new Uint8Array();
  private data!: File;
  private palette = new Uint8Array();
  private tiles = new Map<number, TileInfo[]>();
  duplicates = 0;
  constructor(private parser: typeof Contract) {}
  async initialize(set: ResourceSet, palette: File) {
    if (set.info.file.size > 80_000_000 || set.info.file.size % 40)
      throw new Error("圖像索引長度必須為 40 bytes 的倍數，且不得超過 80 MB。");
    if (![672, 708].includes(palette.size))
      throw new Error("調色盤必須為 672 或 708 bytes 的 CGP 檔案。");
    this.palette = new Uint8Array(await palette.arrayBuffer());
    this.parser.game_palette_build_from_cgp(this.palette);
    this.index = new Uint8Array(await set.info.file.arrayBuffer());
    this.data = set.data.file;
    this.tiles.clear();
    this.duplicates = 0;
    // Container addressing only; actual decoding belongs to xglib.
    for (let offset = 0; offset < this.index.length; offset += 40) {
      const info = readTileInfo(
        this.index.subarray(offset, offset + 40),
        offset / 40,
      );
      const mapId = info.mapId;
      if (mapId <= 0) continue;
      const rows = this.tiles.get(mapId) ?? [];
      if (rows.length) this.duplicates++;
      rows.push(info);
      this.tiles.set(mapId, rows);
    }
    return { count: this.tiles.size, duplicates: this.duplicates };
  }
  async open(file: File): Promise<OpenResult> {
    if (file.size < 20 || file.size > 20 + MAX_CELLS * 6)
      throw new Error("地圖大小不符：目前最多支援 1,000,000 格。");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const header = new DataView(bytes.buffer);
    const area = header.getUint32(12, true) * header.getUint32(16, true);
    if (!area || area > MAX_CELLS)
      throw new Error("地圖尺寸為空或超過 1,000,000 格上限。");
    const map = this.parser.map_build_from_bytes(bytes);
    const ids = new Set([...map.ground, ...map.object]);
    ids.delete(0);
    let missing = 0,
      invalid = 0;
    const tiles: TileInfo[] = [];
    for (const id of ids) {
      const info = this.tiles.get(id)?.slice(-1)[0];
      if (!info) missing++;
      else if (!validTileInfo(info, this.data.size)) invalid++;
      else tiles.push(info);
    }
    return { map, tiles, missing, invalid, duplicates: this.duplicates };
  }
  async decode(mapId: number): Promise<DecodedTile> {
    const info = this.tiles.get(mapId)?.slice(-1)[0];
    if (!info) throw new Error("找不到有效圖塊索引或已超過圖像資源上限。");
    return decodeTile(
      this.parser,
      this.index.subarray(info.row * 40, (info.row + 1) * 40),
      info,
      this.data,
      this.palette,
    );
  }
}
