import type { Catalog } from "../resources/catalog";
import { ResourceClient } from "../resources/client";
import { npcsForMap, type NpcRecord } from "../resources/npc";
import type { MapView } from "./map-view";
import { npcKey } from "./npc-layer";

export class NpcPanel {
  private dialog = document.createElement("dialog");
  private catalog?: Catalog;
  private palette?: File;
  private file?: File;
  private map?: { path: string; width: number; height: number };
  private client?: ResourceClient;
  private generation = 0;
  private records: NpcRecord[] = [];
  constructor(
    private view: MapView,
    private trigger: HTMLButtonElement,
  ) {
    this.dialog.id = "npc-dialog";
    this.dialog.setAttribute("aria-labelledby", "npc-title");
    this.dialog.innerHTML = `<div class="dialog-title"><h2 id="npc-title">NPC 圖層</h2><button data-id="close" class="icon-button" aria-label="關閉 NPC 設定">×</button></div>
      <p class="hint">選取本機 npc.txt，使用遊戲資源顯示造型。只讀取檔案，不會上傳或修改。</p>
      <label class="npc-file">NPC 資料檔<input data-id="file" id="npc-input" type="file" accept=".txt,text/plain"></label>
      <div class="npc-settings"><label>文字編碼<select data-id="encoding"><option value="auto">自動（UTF-8／GB18030）</option><option value="utf-8">UTF-8</option><option value="gb18030">GB18030／GBK</option><option value="big5">Big5</option></select></label><label>NPC 圖像來源<select data-id="graphic"></select></label><label>NPC 動畫來源<select data-id="anime"></select></label></div>
      <p class="hint">靜態造型比對 map_id；動畫比對 Anime ID，再使用所選 Graphic 的圖像 ID。面向／站立動作無法對應時會列出原因。非固定座標暫以第一組座標顯示，不模擬移動。</p>
      <div class="npc-actions"><button data-id="reload" class="button secondary">重新載入 NPC</button><button data-id="clear" class="text-button">移除 NPC 資料</button></div>
      <p data-id="status" role="status">請先開啟地圖，再選取 npc.txt。</p><p data-id="error" role="alert" class="npc-warning" hidden></p>
      <div data-id="list" class="npc-list" aria-label="本圖 NPC 清單"></div>`;
    document.body.append(this.dialog);
    trigger.onclick = () => this.dialog.showModal();
    this.el<HTMLButtonElement>("close").onclick = () => this.dialog.close();
    this.el<HTMLInputElement>("file").onchange = () => {
      const file = this.el<HTMLInputElement>("file").files?.[0];
      if (file) {
        this.file = file;
        void this.reload();
      }
    };
    for (const id of ["encoding", "graphic", "anime"])
      this.el<HTMLSelectElement>(id).onchange = () => void this.reload();
    this.el<HTMLButtonElement>("reload").onclick = () => void this.reload();
    this.el<HTMLButtonElement>("clear").onclick = () => this.reset();
  }
  private el<T extends HTMLElement = HTMLElement>(id: string) {
    return this.dialog.querySelector<T>(`[data-id="${id}"]`)!;
  }
  configure(catalog: Catalog, graphic: number, palette: File) {
    this.pause();
    this.catalog = catalog;
    this.palette = palette;
    this.el<HTMLSelectElement>("graphic").replaceChildren(
      ...catalog.sets.map((s, i) => new Option(s.name, String(i))),
    );
    this.el<HTMLSelectElement>("graphic").value = String(graphic);
    this.el<HTMLSelectElement>("anime").replaceChildren(
      new Option("不載入動畫", "-1"),
      ...catalog.animes.map((s, i) => new Option(s.name, String(i))),
    );
    this.el<HTMLSelectElement>("anime").value = catalog.animes.length
      ? "0"
      : "-1";
  }
  openMap(path: string, width: number, height: number) {
    this.map = { path, width, height };
    void this.reload();
  }
  pause() {
    this.generation++;
    this.client?.dispose();
    this.client = undefined;
    this.map = undefined;
    this.records = [];
    this.el("list").replaceChildren();
    this.view.setNpcs([]);
    this.trigger.textContent = "NPC 設定";
  }
  reset() {
    this.file = undefined;
    this.el<HTMLInputElement>("file").value = "";
    void this.reload();
  }
  selected(x: number, y: number) {
    return this.records
      .filter((n) => n.x === x && n.y === y)
      .map((n) => `${n.name || n.type}（ID ${n.id}／造型 ${n.image}）`)
      .join("、");
  }
  private async reload() {
    const token = ++this.generation;
    this.client?.dispose();
    this.client = undefined;
    this.records = [];
    this.view.setNpcs([]);
    this.el("list").replaceChildren();
    this.el("error").hidden = true;
    this.trigger.textContent = "NPC 設定";
    const { file, catalog, map, palette } = this;
    if (!map || !catalog || !palette) {
      this.el("status").textContent = "請先開啟地圖。";
      return;
    }
    if (!file) {
      this.el("status").textContent = "尚未載入 NPC，請選取 npc.txt。";
      return;
    }
    const client = new ResourceClient();
    this.client = client;
    this.el("status").textContent = "正在讀取 NPC 與造型資源…";
    try {
      const parsed = await client.request({
        kind: "npc-file",
        file,
        encoding: this.el<HTMLSelectElement>("encoding").value,
      });
      if (token !== this.generation || parsed.kind !== "npc-file") return;
      const match = npcsForMap(
        parsed.value.records,
        map.path,
        map.width,
        map.height,
      );
      this.records = match.records.slice(0, 2000);
      this.view.setNpcs(this.records);
      const summary = `${file.name} · ${parsed.value.encoding} · 共 ${parsed.value.records.length} 筆 · 本圖 ${this.records.length} 筆`;
      this.el("status").textContent = summary;
      this.trigger.textContent = `NPC 設定（${this.records.length}）`;
      const warnings = [...parsed.value.warnings];
      if (match.outside)
        warnings.push(`${match.outside} 筆座標超出本圖範圍，未顯示。`);
      if (match.records.length > 2000)
        warnings.push("本圖超過 2,000 筆，只顯示前 2,000 筆。");
      if (warnings.length) {
        this.el("error").hidden = false;
        this.el("error").textContent =
          `${warnings.length} 項診斷：\n${warnings.slice(0, 20).join("\n")}`;
      }
      const statuses = new Map<string, HTMLElement[]>();
      for (const npc of this.records) {
        const row = document.createElement("article");
        row.className = "npc-row";
        const title = document.createElement("strong");
        title.textContent = npc.name || `${npc.type}（未命名）`;
        const details = document.createElement("p");
        details.textContent = `${npc.type} · ID ${npc.id} · (${npc.x}, ${npc.y}) · 面向 ${npc.direction < 0 ? "未指定" : npc.direction} · 造型 ${npc.image < 0 ? "未指定" : npc.image} · 第 ${npc.line} 行`;
        const varying = npc.positions.some(
          (v, i) => v !== npc.positions[i % 2],
        );
        if (varying)
          details.textContent += `\n多組座標：${npc.positions.join(", ")}（顯示首組）`;
        const status = document.createElement("p");
        status.className = "npc-source";
        status.textContent = "正在準備造型…";
        const key = npcKey(npc);
        statuses.set(key, [...(statuses.get(key) ?? []), status]);
        const locate = document.createElement("button");
        locate.className = "button secondary";
        locate.textContent = "定位";
        locate.onclick = () => {
          this.dialog.close();
          this.view.focusCell(npc.x, npc.y);
        };
        row.append(title, details, status, locate);
        this.el("list").append(row);
      }
      if (!this.records.length) return;
      await client.request({
        kind: "npc-init",
        graphic:
          catalog.sets[Number(this.el<HTMLSelectElement>("graphic").value)],
        anime:
          catalog.animes[Number(this.el<HTMLSelectElement>("anime").value)],
        palette,
      });
      if (token !== this.generation) return;
      let loaded = 0,
        failed = 0;
      const unique = [
        ...new Map(this.records.map((n) => [npcKey(n), n])).values(),
      ];
      for (const [i, npc] of unique.entries()) {
        if (token !== this.generation) return;
        try {
          if (i >= 256)
            throw new Error("本圖超過 256 種造型／面向組合，保留位置標記。");
          const result = await client.request({
            kind: "npc-appearance",
            image: npc.image,
            direction: npc.direction,
          });
          if (token !== this.generation || result.kind !== "npc-appearance")
            return;
          this.view.npcAppearance(npcKey(npc), result.value);
          loaded++;
          for (const status of statuses.get(npcKey(npc))!)
            status.textContent = `${result.value.frames.length > 1 ? "動畫" : "靜態"}造型 · ${result.value.source}${result.value.warnings.length ? `\n${result.value.warnings.join("；")}` : ""}`;
        } catch (error) {
          if (token !== this.generation) return;
          failed++;
          for (const status of statuses.get(npcKey(npc))!) {
            status.textContent = `保留位置標記：${String(error)}`;
            status.classList.add("npc-warning");
          }
        }
        this.el("status").textContent =
          `${summary} · ${loaded} 種造型就緒${failed ? `／${failed} 種無法顯示` : ""}${i === unique.length - 1 ? " · 載入完成" : " · 載入中"}`;
      }
    } catch (error) {
      if (token === this.generation) {
        this.el("error").hidden = false;
        this.el("error").textContent = `NPC 載入失敗：${String(error)}`;
        this.el("status").textContent = "可更換來源或編碼後重新載入。";
      }
    }
  }
}
