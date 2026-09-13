import type { ResourceSet } from "../resources/catalog";
import { ResourceClient } from "../resources/client";
import {
  candidateKey,
  type Candidate,
  type DecodedTile,
  type SelectedCell,
  type TileLayer,
} from "../resources/protocol";
import type { MapView } from "./map-view";

export class CandidatePanel {
  private host = document.createElement("section");
  private client?: ResourceClient;
  private configured?: Promise<unknown>;
  private cell?: SelectedCell;
  private layer: TileLayer = "object";
  private sequence = 0;
  private offset = 0;
  private total = 0;
  onVisibility: (visible: boolean) => void = () => {};
  constructor(
    parent: HTMLElement,
    private view: MapView,
  ) {
    this.host.id = "candidate-panel";
    this.host.className = "candidate-panel";
    this.host.hidden = true;
    this.host.setAttribute("aria-label", "圖塊候選與試放");
    this.host.innerHTML = `
      <div class="candidate-heading"><div><span class="eyebrow">跨資源集比對</span><h2>圖塊候選</h2></div><button data-id="close" class="icon-button" aria-label="關閉圖塊候選">×</button></div>
      <p data-id="cell" class="candidate-cell"></p>
      <fieldset class="candidate-layer"><legend>搜尋與試放圖層</legend><label><input type="radio" name="candidate-layer" value="ground">地表</label><label><input type="radio" name="candidate-layer" value="object" checked>物件</label></fieldset>
      <p data-id="rule" class="hint"></p><p class="hint candidate-note">同號候選不代表原作對應。試放僅影響此格；切換地圖或資源設定時清除。</p>
      <p data-id="status" class="candidate-status" role="status"></p><p data-id="warnings" class="candidate-warning" hidden></p>
      <div data-id="results" class="candidate-results"></div>
      <nav class="candidate-pagination" aria-label="候選分頁"><button data-id="previous" class="button secondary">上一頁</button><span data-id="page"></span><button data-id="next" class="button secondary">下一頁</button></nav>
      <div class="candidate-trial"><p data-id="placement" role="status"></p><div><button data-id="restore" class="button secondary">還原此格此層</button><button data-id="clear" class="text-button">清除所有試放</button></div><p data-id="error" class="candidate-warning" role="alert" hidden></p></div>`;
    parent.append(this.host);
    this.button("close").onclick = () => this.close();
    for (const input of this.host.querySelectorAll<HTMLInputElement>(
      "input[name=candidate-layer]",
    ))
      input.onchange = () => {
        this.layer = input.value as TileLayer;
        void this.search(0);
      };
    this.button("previous").onclick = () =>
      void this.search(Math.max(0, this.offset - 12));
    this.button("next").onclick = () => void this.search(this.offset + 12);
    this.button("restore").onclick = () => {
      if (!this.cell) return;
      this.sequence++; // Also cancel an in-flight placement before restoring.
      this.view.restore(this.cell.x, this.cell.y, this.layer);
      void this.search(this.offset);
    };
    this.button("clear").onclick = () => {
      this.sequence++;
      this.view.restoreAll();
      void this.search(this.offset);
    };
  }
  private el<T extends HTMLElement = HTMLElement>(id: string) {
    return this.host.querySelector<T>(`[data-id="${id}"]`)!;
  }
  private button(id: string) {
    return this.el<HTMLButtonElement>(id);
  }
  configure(sets: ResourceSet[], palette: File) {
    this.dispose();
    this.client = new ResourceClient();
    this.configured = this.client.request({
      kind: "candidate-init",
      sets,
      palette,
    });
    // Defer displaying initialization failures until the user opens this panel.
    void this.configured.catch(() => {});
  }
  select(cell: SelectedCell | null) {
    if (!cell || !this.client) {
      this.close();
      return;
    }
    this.cell = cell;
    this.layer = cell.object ? "object" : "ground";
    this.host.hidden = false;
    this.onVisibility(true);
    this.el("cell").textContent =
      `座標 (${cell.x}, ${cell.y}) · 地表 ${cell.ground} · 物件 ${cell.object}\n原始中繼資料 ${cell.meta}（0x${cell.meta.toString(16).padStart(4, "0")}）`;
    for (const input of this.host.querySelectorAll<HTMLInputElement>(
      "input[name=candidate-layer]",
    ))
      input.checked = input.value === this.layer;
    void this.search(0);
  }
  close() {
    this.sequence++;
    this.cell = undefined;
    this.host.hidden = true;
    this.el("results").replaceChildren();
    this.onVisibility(false);
  }
  dispose() {
    this.close();
    this.client?.dispose();
    this.client = undefined;
    this.configured = undefined;
  }
  private updatePlacement() {
    if (!this.cell) return;
    const placed = this.view.placement(this.cell.x, this.cell.y, this.layer);
    this.el("placement").textContent = placed
      ? `已試放：${placed.sourceName} · 索引列 ${placed.row}｜本圖 ${this.view.trialCount} 處試放`
      : `此格此層使用原始內容｜本圖 ${this.view.trialCount} 處試放`;
    this.button("restore").disabled = !placed;
    this.button("clear").disabled = !this.view.trialCount;
    for (const card of this.host.querySelectorAll<HTMLElement>(
      ".candidate-card",
    )) {
      const current = !!placed && card.dataset.key === candidateKey(placed);
      card.dataset.placed = String(current);
      const button = card.querySelector<HTMLButtonElement>("button")!;
      button.textContent = current ? "已試放於此格" : "試放到此格";
      button.setAttribute("aria-pressed", String(current));
    }
  }
  private async search(offset: number) {
    const cell = this.cell,
      client = this.client;
    if (!cell || !client) return;
    const token = ++this.sequence;
    const mapId = cell[this.layer];
    this.offset = offset;
    this.el("results").replaceChildren();
    this.el("warnings").hidden = true;
    this.el("error").hidden = true;
    this.el("rule").textContent =
      `規則：全部已辨識資源集中，map_id = ${mapId} 的索引列（含重複列）。`;
    this.el("status").textContent = mapId
      ? "正在搜尋所有圖像索引…"
      : "此層為空（ID 0），沒有可比對的圖塊。";
    this.button("previous").disabled = true;
    this.button("next").disabled = true;
    this.el("page").textContent = "—";
    this.updatePlacement();
    if (!mapId) return;
    try {
      await this.configured;
      if (token !== this.sequence) return;
      const result = await client.request({
        kind: "candidates",
        mapId,
        offset,
      });
      if (token !== this.sequence || result.kind !== "candidates") return;
      this.total = result.value.total;
      this.el("status").textContent = this.total
        ? `找到 ${this.total} 筆候選，正在解碼本頁預覽…`
        : "所有可讀取的資源集中，都找不到相同 ID 的候選。";
      if (result.value.warnings.length) {
        this.el("warnings").hidden = false;
        this.el("warnings").textContent =
          `部分來源無法搜尋：\n${result.value.warnings.join("\n")}`;
      }
      this.el("page").textContent = this.total
        ? `${offset + 1}–${Math.min(offset + 12, this.total)} / ${this.total}`
        : "0 / 0";
      this.button("previous").disabled = offset === 0;
      this.button("next").disabled = offset + 12 >= this.total;
      const cards = result.value.candidates.map((candidate) =>
        this.card(candidate, token),
      );
      this.el("results").append(...cards.map((entry) => entry.card));
      this.updatePlacement();
      let failures = 0;
      for (const entry of cards) {
        if (token !== this.sequence) return;
        if (entry.candidate.issue) {
          failures++;
          continue;
        }
        try {
          const decoded = await client.request({
            kind: "candidate-decode",
            ref: entry.candidate,
          });
          if (token !== this.sequence || decoded.kind !== "candidate-decode")
            return;
          this.preview(entry.canvas, decoded.tile);
          entry.status.textContent = "解碼成功";
          entry.button.disabled = false;
        } catch (error) {
          if (token !== this.sequence) return;
          failures++;
          entry.status.textContent = `無法解碼：${String(error)}`;
          entry.status.classList.add("candidate-warning");
        }
      }
      if (token === this.sequence && this.total)
        this.el("status").textContent =
          `找到 ${this.total} 筆候選 · 本頁 ${cards.length - failures} 筆可試放${failures ? `，${failures} 筆無法使用` : ""}`;
    } catch (error) {
      if (token === this.sequence)
        this.el("status").textContent =
          `搜尋失敗：${String(error)}。可切換圖層或重新點選重試。`;
    }
  }
  private card(candidate: Candidate, token: number) {
    const card = document.createElement("article");
    card.className = "candidate-card";
    card.dataset.key = candidateKey(candidate);
    const canvas = document.createElement("canvas");
    canvas.width = 144;
    canvas.height = 96;
    canvas.setAttribute(
      "aria-label",
      `${candidate.sourceName} 索引列 ${candidate.row} 圖像預覽`,
    );
    const details = document.createElement("div");
    details.className = "candidate-details";
    const title = document.createElement("strong");
    title.textContent = candidate.sourceName;
    const info = document.createElement("p");
    info.textContent = `圖像 ID ${candidate.id} · 索引列 ${candidate.row}\n${candidate.width} × ${candidate.height} px · 偏移 (${candidate.offX}, ${candidate.offY})`;
    const source = document.createElement("small");
    source.textContent = `${candidate.source}\n${candidate.dataSource}\n位址 ${candidate.addr} · ${candidate.len} bytes`;
    const status = document.createElement("p");
    status.className = "candidate-decode-status";
    status.textContent = candidate.issue ?? "等待解碼…";
    const button = document.createElement("button");
    button.className = "button secondary";
    button.textContent = "試放到此格";
    button.disabled = true;
    button.onclick = () => void this.place(candidate, token, button);
    details.append(title, info, source, status, button);
    card.append(canvas, details);
    return { card, canvas, status, button, candidate };
  }
  private preview(canvas: HTMLCanvasElement, tile: DecodedTile) {
    // Downscale previews; retain no full-size decoded buffers in the panel.
    const scratch = document.createElement("canvas");
    scratch.width = tile.width;
    scratch.height = tile.height;
    const ctx = scratch.getContext("2d")!;
    ctx.putImageData(
      new ImageData(new Uint8ClampedArray(tile.rgba), tile.width, tile.height),
      0,
      0,
    );
    const scale = Math.min(1, 136 / tile.width, 88 / tile.height);
    const width = tile.width * scale,
      height = tile.height * scale;
    const target = canvas.getContext("2d")!;
    target.imageSmoothingEnabled = false;
    target.clearRect(0, 0, 144, 96);
    target.drawImage(
      scratch,
      (144 - width) / 2,
      (96 - height) / 2,
      width,
      height,
    );
    scratch.width = 0;
    scratch.height = 0;
  }
  private async place(
    candidate: Candidate,
    token: number,
    button: HTMLButtonElement,
  ) {
    const cell = this.cell,
      client = this.client,
      layer = this.layer;
    if (!cell || !client || token !== this.sequence) return;
    // Keep the search generation stable; separate placement order prevents slow clicks winning.
    const placement = ++this.placementSequence;
    button.disabled = true;
    this.el("error").hidden = true;
    try {
      const result = await client.request({
        kind: "candidate-decode",
        ref: candidate,
      });
      if (
        token !== this.sequence ||
        placement !== this.placementSequence ||
        result.kind !== "candidate-decode"
      )
        return;
      this.view.place(cell.x, cell.y, layer, result.candidate, result.tile);
      this.updatePlacement();
    } catch (error) {
      if (token === this.sequence && placement === this.placementSequence) {
        this.el("error").hidden = false;
        this.el("error").textContent = `試放失敗：${String(error)}`;
      }
    } finally {
      if (token === this.sequence) button.disabled = false;
    }
  }
  private placementSequence = 0;
}
