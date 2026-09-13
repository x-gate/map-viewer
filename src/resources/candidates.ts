import type * as Contract from "../../.generated/xglib/contract";
import type { ResourceSet } from "./catalog";
import type { Candidate, CandidatePage, CandidateRef } from "./protocol";
import { decodeTile, readTileInfo, validTileInfo } from "./graphic";

export const CANDIDATE_PAGE_SIZE = 12;
export class CandidateLibrary {
  private sets = new Map<string, ResourceSet>();
  private rows = new Map<number, Candidate[]>();
  private warnings: string[] = [];
  private palette = new Uint8Array();
  private indexed = false;
  constructor(private parser: typeof Contract) {}
  async initialize(sets: ResourceSet[], palette: File) {
    if (![672, 708].includes(palette.size))
      throw new Error("調色盤必須為 672 或 708 bytes 的 CGP 檔案。");
    this.palette = new Uint8Array(await palette.arrayBuffer());
    this.parser.game_palette_build_from_cgp(this.palette);
    this.sets = new Map(sets.map((set) => [set.info.path, set]));
    this.rows.clear();
    this.warnings = [];
    this.indexed = false;
  }
  private async index() {
    if (this.indexed) return;
    for (const [source, set] of this.sets) {
      try {
        if (set.info.file.size > 80_000_000 || set.info.file.size % 40)
          throw new Error("索引長度必須為 40 bytes 的倍數，且不得超過 80 MB。");
        // Scan each source once in small chunks. Keep metadata, never whole graphics files.
        const sourceRows: Candidate[] = [];
        const chunkSize = 40 * 8192;
        for (let start = 0; start < set.info.file.size; start += chunkSize) {
          const end = Math.min(start + chunkSize, set.info.file.size);
          const bytes = new Uint8Array(
            await set.info.file.slice(start, end).arrayBuffer(),
          );
          if (bytes.length !== end - start)
            throw new Error("讀取索引失敗，請重新選擇資料夾。");
          for (let off = 0; off < bytes.length; off += 40) {
            const info = readTileInfo(
              bytes.subarray(off, off + 40),
              (start + off) / 40,
            );
            // MAP layers contain u16; zero denotes an empty layer, not a searchable tile.
            if (info.mapId <= 0 || info.mapId > 65535) continue;
            sourceRows.push({
              ...info,
              source,
              sourceName: set.name,
              dataSource: set.data.path,
              ...(!validTileInfo(info, set.data.file.size)
                ? { issue: "索引尺寸、偏移或檔案範圍無效，無法試放。" }
                : {}),
            });
          }
        }
        for (const candidate of sourceRows) {
          const rows = this.rows.get(candidate.mapId) ?? [];
          rows.push(candidate);
          this.rows.set(candidate.mapId, rows);
        }
      } catch (error) {
        this.warnings.push(`${source}：${String(error)}`);
      }
    }
    this.indexed = true;
  }
  async search(mapId: number, offset = 0): Promise<CandidatePage> {
    if (
      !Number.isInteger(mapId) ||
      mapId < 0 ||
      mapId > 65535 ||
      !Number.isInteger(offset) ||
      offset < 0
    )
      throw new Error("無效的圖塊 ID 或候選頁碼。");
    if (mapId === 0)
      return { candidates: [], total: 0, offset: 0, warnings: [] };
    await this.index();
    const rows = this.rows.get(mapId) ?? [];
    return {
      candidates: rows.slice(offset, offset + CANDIDATE_PAGE_SIZE),
      total: rows.length,
      offset,
      warnings: this.warnings,
    };
  }
  async decode(ref: CandidateRef) {
    const set = this.sets.get(ref.source);
    if (
      !set ||
      !Number.isInteger(ref.row) ||
      ref.row < 0 ||
      (ref.row + 1) * 40 > set.info.file.size
    )
      throw new Error("找不到候選來源或索引列，請重新搜尋。");
    const index = new Uint8Array(
      await set.info.file.slice(ref.row * 40, (ref.row + 1) * 40).arrayBuffer(),
    );
    const info = readTileInfo(index, ref.row);
    if (info.mapId <= 0 || info.mapId > 65535)
      throw new Error("此索引列不是可比對的地圖圖塊。");
    const candidate: Candidate = {
      ...info,
      source: ref.source,
      sourceName: set.name,
      dataSource: set.data.path,
    };
    const tile = await decodeTile(
      this.parser,
      index,
      info,
      set.data.file,
      this.palette,
    );
    return { candidate, tile };
  }
}
