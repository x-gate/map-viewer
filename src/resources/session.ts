import type * as Contract from "../../.generated/xglib/contract";
import type { ResourceSet } from "./catalog";
import type { TileInfo, OpenResult, DecodedTile } from "./protocol";
const MAX_CELLS = 1_000_000;
const MAX_PIXELS = 4_194_304;
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
    const view = new DataView(this.index.buffer);
    // Container addressing only; map / graphic / palette decoding belongs to xglib.
    for (let offset = 0; offset < this.index.length; offset += 40) {
      const mapId = view.getInt32(offset + 36, true);
      if (mapId <= 0) continue;
      const info: TileInfo = {
        mapId,
        row: offset / 40,
        id: view.getInt32(offset, true),
        addr: view.getUint32(offset + 4, true),
        len: view.getInt32(offset + 8, true),
        offX: view.getInt32(offset + 12, true),
        offY: view.getInt32(offset + 16, true),
        width: view.getInt32(offset + 20, true),
        height: view.getInt32(offset + 24, true),
      };
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
      const info = this.tiles.get(id)?.[0];
      if (!info) missing++;
      else if (!this.valid(info)) invalid++;
      else tiles.push(info);
    }
    return { map, tiles, missing, invalid, duplicates: this.duplicates };
  }
  private valid(info: TileInfo) {
    return (
      info.width > 0 &&
      info.height > 0 &&
      info.width <= 4096 &&
      info.height <= 4096 &&
      info.width * info.height <= MAX_PIXELS &&
      info.len >= 16 &&
      info.len <= 16_777_216 &&
      info.addr + info.len <= this.data.size &&
      Math.abs(info.offX) <= 8192 &&
      Math.abs(info.offY) <= 8192
    );
  }
  async decode(mapId: number): Promise<DecodedTile> {
    const info = this.tiles.get(mapId)?.[0];
    if (!info || !this.valid(info))
      throw new Error("找不到有效圖塊索引或已超過圖像資源上限。");
    const bytes = new Uint8Array(
      await this.data.slice(info.addr, info.addr + info.len).arrayBuffer(),
    );
    const header = new DataView(bytes.buffer);
    const width = header.getInt32(4, true),
      height = header.getInt32(8, true);
    if (width !== info.width || height !== info.height)
      throw new Error(`索引列 ${info.row} 的圖像尺寸與 RD header 不符。`);
    const graphic = this.parser.graphic_strict_build_from_cgp(
      this.index.subarray(info.row * 40, (info.row + 1) * 40),
      bytes,
      this.palette,
    );
    const rgba = new Uint8Array(width * height * 4);
    for (let i = 0; i < graphic.payload.length; i++) {
      const color = graphic.palette.colors[graphic.payload[i]];
      if (!color) throw new Error("圖像色彩索引超出調色盤。");
      // Reference viewer uses bottom-up source rows; xglib preserves source order.
      const destination =
        ((height - 1 - Math.floor(i / width)) * width + (i % width)) * 4;
      rgba.set([color.red, color.green, color.blue, color.alpha], destination);
    }
    return { mapId, width, height, rgba };
  }
}
