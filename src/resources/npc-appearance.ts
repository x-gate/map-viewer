import type * as Contract from "../../.generated/xglib/contract";
import type { ResourceSet } from "./catalog";
import type { DecodedTile, TileInfo } from "./protocol";
import { decodeTile, readTileInfo } from "./graphic";

export interface NpcAppearance {
  images: (DecodedTile & { offX: number; offY: number })[];
  frames: { image: number; flipX: boolean; flipY: boolean }[];
  interval: number;
  source: string;
  warnings: string[];
}
export class NpcResources {
  private graphic!: ResourceSet;
  private anime?: ResourceSet;
  private index = new Uint8Array();
  private animeIndex = new Uint8Array();
  private palette = new Uint8Array();
  private graphics = new Map<number, TileInfo>();
  private serials = new Map<number, TileInfo>();
  private animations = new Map<
    number,
    { row: number; addr: number; count: number; end: number }
  >();
  constructor(private parser: typeof Contract) {}
  async initialize(
    graphic: ResourceSet,
    anime: ResourceSet | undefined,
    palette: File,
  ) {
    if (
      graphic.info.file.size > 80_000_000 ||
      graphic.info.file.size % 40 ||
      (anime &&
        (anime.info.file.size > 12_000_000 || anime.info.file.size % 12))
    )
      throw new Error("NPC 圖像／動畫索引長度無效或超過上限。");
    if (![672, 708].includes(palette.size)) throw new Error("CGP 長度無效。");
    this.graphic = graphic;
    this.anime = anime;
    this.palette = new Uint8Array(await palette.arrayBuffer());
    this.parser.game_palette_build_from_cgp(this.palette);
    this.index = new Uint8Array(await graphic.info.file.arrayBuffer());
    this.animeIndex = anime
      ? new Uint8Array(await anime.info.file.arrayBuffer())
      : new Uint8Array();
    this.graphics.clear();
    this.serials.clear();
    this.animations.clear();
    for (let off = 0; off < this.index.length; off += 40) {
      const info = readTileInfo(this.index.subarray(off, off + 40), off / 40);
      this.graphics.set(info.id, info);
      if (info.mapId) this.serials.set(info.mapId, info);
    }
    const v = new DataView(this.animeIndex.buffer);
    const addresses = new Set<number>([anime?.data.file.size ?? 0]);
    for (let off = 0; off < v.byteLength; off += 12) {
      const addr = v.getInt32(off + 4, true);
      if (addr >= 0 && addr < (anime?.data.file.size ?? 0)) addresses.add(addr);
    }
    const sorted = [...addresses].sort((a, b) => a - b),
      ends = new Map(
        sorted.slice(0, -1).map((addr, i) => [addr, sorted[i + 1]]),
      );
    for (let off = 0; off < v.byteLength; off += 12) {
      const addr = v.getInt32(off + 4, true);
      this.animations.set(v.getInt32(off, true), {
        row: off / 12,
        addr,
        count: v.getInt16(off + 8, true),
        end: ends.get(addr) ?? addr,
      });
    }
  }
  private async image(info: TileInfo, rawPalette?: Uint8Array) {
    const tile = await decodeTile(
      this.parser,
      this.index.subarray(info.row * 40, info.row * 40 + 40),
      info,
      this.graphic.data.file,
      this.palette,
      { rawPalette, transparentZero: true },
    );
    return { ...tile, offX: info.offX, offY: info.offY };
  }
  async appearance(id: number, direction: number): Promise<NpcAppearance> {
    if (id < 0) throw new Error("未指定造型編號。");
    if (!id) throw new Error("造型編號為 0（無可見造型）。");
    const entry = this.animations.get(id),
      warnings: string[] = [];
    if (!entry) {
      const info = this.serials.get(id);
      if (!info) throw new Error(`所選資源找不到造型 ${id}。`);
      const image = await this.image(info);
      return {
        images: [image],
        frames: [{ image: 0, flipX: false, flipY: false }],
        interval: 1000,
        source: `${this.graphic.name} · map_id ${id} · 列 ${info.row}`,
        warnings: image.warnings ?? [],
      };
    }
    if (
      entry.count < 1 ||
      entry.count > 4096 ||
      entry.addr < 0 ||
      entry.end <= entry.addr
    )
      throw new Error("動畫索引範圍無效。");
    // Read bounded action headers first to determine the exact WASM record slice.
    let cursor = entry.addr,
      total = 0;
    for (let i = 0; i < entry.count; i++) {
      const bytes = await this.anime!.data.file.slice(
        cursor,
        Math.min(cursor + 20, entry.end),
      ).arrayBuffer();
      if (bytes.byteLength < 12) throw new Error("動畫 header 截斷。");
      const v = new DataView(bytes),
        size = bytes.byteLength >= 20 && v.getInt32(16, true) === -1 ? 20 : 12,
        count = v.getInt32(8, true);
      total += count;
      cursor += size + count * 10;
      if (
        count < 0 ||
        total > 100000 ||
        cursor > entry.end ||
        cursor - entry.addr > 16_777_216
      )
        throw new Error("動畫影格長度無效或超過上限。");
    }
    const parsed = this.parser.anime_build_from_bytes(
      this.animeIndex.subarray(entry.row * 12, entry.row * 12 + 12),
      new Uint8Array(
        await this.anime!.data.file.slice(entry.addr, cursor).arrayBuffer(),
      ),
    );
    const header = (a: Contract.AnimeAction) =>
      "Standard" in a.header ? a.header.Standard : a.header.Extended;
    const standing = parsed.actions.filter(
      (a) => header(a).action === 0 && a.frames.length,
    );
    const action =
      standing.find((a) => header(a).direct === direction) ?? standing[0];
    if (!action) throw new Error("沒有可用的站立動作（action 0）。");
    if (header(action).direct !== direction)
      warnings.push(
        `沒有面向 ${direction}，暫用面向 ${header(action).direct}。`,
      );
    const ids = [...new Set(action.frames.map((f) => f.graphic_id))];
    if (ids.length > 128 || action.frames.length > 512)
      throw new Error("站立動作超過預覽影格上限。");
    let rawPalette: Uint8Array | undefined;
    const hidden =
      "Extended" in action.header ? this.serials.get(id) : undefined;
    if (hidden) {
      if (
        hidden.len < 16 ||
        hidden.len > 16_777_216 ||
        hidden.addr + hidden.len > this.graphic.data.file.size ||
        hidden.width < 0 ||
        hidden.height < 0 ||
        hidden.width * hidden.height > 4_194_304
      )
        throw new Error("動畫隱藏調色盤範圍無效。");
      const bytes = new Uint8Array(
        await this.graphic.data.file
          .slice(hidden.addr, hidden.addr + hidden.len)
          .arrayBuffer(),
      );
      const palette = this.parser.graphic_strict_build_from_bytes(
        this.index.subarray(hidden.row * 40, hidden.row * 40 + 40),
        bytes,
        new Uint8Array(),
      ).palette;
      if (palette.colors.length > 256)
        throw new Error("動畫隱藏調色盤超過 256 色。");
      if (bytes[2] >= 2 && palette.colors.length)
        rawPalette = new Uint8Array(
          palette.colors.flatMap((c) => [c.blue, c.green, c.red]),
        );
    }
    const images: NpcAppearance["images"] = [];
    let bytes = 0;
    for (const id of ids) {
      const info = this.graphics.get(id);
      if (!info) throw new Error(`動畫引用的 Graphic ID ${id} 不在所選來源。`);
      bytes += info.width * info.height * 4;
      if (bytes > 32 * 1024 * 1024)
        throw new Error("單一 NPC 動畫超過 32 MiB。");
      const image = await this.image(info, rawPalette);
      images.push(image);
      warnings.push(...(image.warnings ?? []));
    }
    const flags =
      "Extended" in action.header ? action.header.Extended.reversed : 0;
    return {
      images,
      frames: action.frames.map((f) => ({
        image: ids.indexOf(f.graphic_id),
        flipX: !!(flags & 1),
        flipY: !!(flags & 2),
      })),
      interval: Math.max(
        16,
        header(action).duration > 0
          ? header(action).duration / action.frames.length
          : 100,
      ),
      source: `${this.anime!.name} · ID ${id} · 列 ${entry.row} → ${this.graphic.name}`,
      warnings,
    };
  }
}
