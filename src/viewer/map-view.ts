import {
  Application,
  BufferImageSource,
  Container,
  Graphics,
  Sprite,
  Texture,
} from "pixi.js";
import type { ResourceClient } from "../resources/client";
import { candidateKey } from "../resources/protocol";
import type {
  Candidate,
  DecodedTile,
  SelectedCell,
  TileLayer,
  GameMap,
  OpenResult,
  TileInfo,
} from "../resources/protocol";
import { clampZoom, screenTile, tilePosition } from "./geometry";
interface Cached {
  texture: Texture;
  bytes: number;
  used: number;
}
export interface ViewStats {
  zoom: number;
  visible: number;
  failures: number;
  limited: boolean;
  loading: boolean;
}
export class MapView {
  private app = new Application();
  private ready = false;
  private world = new Container();
  private ground = new Container();
  private flatObjects = new Container();
  private objects = new Container();
  private warnings = new Set<string>();
  private overlay = new Graphics();
  private highlight = new Graphics();
  private map?: GameMap;
  private infos = new Map<number, TileInfo>();
  private cache = new Map<number, Cached>();
  private trials = new Map<string, Candidate>();
  private trialTextures = new Map<
    string,
    { texture: Texture; bytes: number }
  >();
  private sprites = new Map<string, Sprite>();
  private failed = new Map<number, string>();
  private missingTexture!: Texture;
  private client?: ResourceClient;
  private epoch = 0;
  private queued = false;
  private busy = false;
  private tick = 0;
  private overhang = 64;
  private observer!: ResizeObserver;
  private dragging?: { id: number; x: number; y: number; moved: boolean };
  private groundVisible = true;
  private objectsVisible = true;
  private gridVisible = false;
  private selection?: { x: number; y: number };
  onStats: (value: ViewStats) => void = () => {};
  onTile: (tile: SelectedCell | null) => void = () => {};
  constructor(private host: HTMLElement) {}
  async initialize() {
    await this.app.init({
      backgroundAlpha: 0,
      antialias: false,
      autoDensity: true,
      resolution: Math.min(devicePixelRatio, 2),
      preference: "webgl",
      autoStart: false,
    });
    this.ready = true;
    this.host.prepend(this.app.canvas);
    this.app.canvas.setAttribute(
      "aria-label",
      "地圖畫布；拖曳平移，滾輪縮放，點選格位查看資料",
    );
    this.app.canvas.tabIndex = 0;
    this.app.stage.addChild(this.world);
    this.objects.sortableChildren = true;
    this.world.addChild(
      this.ground,
      this.flatObjects,
      this.objects,
      this.overlay,
      this.highlight,
    );
    const marker = document.createElement("canvas");
    marker.width = 64;
    marker.height = 48;
    const ctx = marker.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(32, 0);
    ctx.lineTo(64, 24);
    ctx.lineTo(32, 48);
    ctx.lineTo(0, 24);
    ctx.closePath();
    ctx.fillStyle = "#66374b";
    ctx.fill();
    ctx.strokeStyle = "#e891a7";
    ctx.stroke();
    ctx.fillStyle = "#f4bdcb";
    ctx.font = "16px sans-serif";
    ctx.fillText("?", 28, 29);
    this.missingTexture = Texture.from(marker);
    this.observer = new ResizeObserver(() => {
      this.app.renderer.resize(this.host.clientWidth, this.host.clientHeight);
      this.schedule();
    });
    this.observer.observe(this.host);
    const canvas = this.app.canvas;
    canvas.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      this.dragging = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        moved: false,
      };
      canvas.setPointerCapture(e.pointerId);
      canvas.focus();
    });
    canvas.addEventListener("pointermove", (e) => {
      const drag = this.dragging;
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x,
        dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
      this.world.x += dx;
      this.world.y += dy;
      drag.x = e.clientX;
      drag.y = e.clientY;
      this.schedule();
    });
    canvas.addEventListener("pointerup", (e) => {
      const drag = this.dragging;
      if (!drag || drag.id !== e.pointerId) return;
      this.dragging = undefined;
      if (!drag.moved && this.map) {
        const rect = canvas.getBoundingClientRect();
        const tile = screenTile(
          (e.clientX - rect.left - this.world.x) / this.zoom,
          (e.clientY - rect.top - this.world.y) / this.zoom,
          this.map.header.width,
        );
        this.select(tile.x, tile.y);
      }
    });
    canvas.addEventListener("lostpointercapture", () => {
      this.dragging = undefined;
    });
    canvas.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        this.setZoom(
          this.zoom * Math.exp(-e.deltaY * 0.0015),
          e.clientX - rect.left,
          e.clientY - rect.top,
        );
      },
      { passive: false },
    );
    canvas.addEventListener("keydown", (e) => {
      const shifts: Record<string, [number, number]> = {
        ArrowLeft: [60, 0],
        ArrowRight: [-60, 0],
        ArrowUp: [0, 60],
        ArrowDown: [0, -60],
      };
      if (shifts[e.key]) {
        e.preventDefault();
        this.world.x += shifts[e.key][0];
        this.world.y += shifts[e.key][1];
        this.schedule();
      }
      if (e.key === "+" || e.key === "=") this.setZoom(this.zoom * 1.25);
      if (e.key === "-") this.setZoom(this.zoom / 1.25);
      if (e.key === "0") this.fit();
    });
  }
  get zoom() {
    return this.world.scale.x;
  }
  setZoom(
    value: number,
    x = this.host.clientWidth / 2,
    y = this.host.clientHeight / 2,
  ) {
    const next = clampZoom(value),
      ratio = next / this.zoom;
    this.world.position.set(
      x - (x - this.world.x) * ratio,
      y - (y - this.world.y) * ratio,
    );
    this.world.scale.set(next);
    this.schedule();
  }
  fit() {
    if (!this.map) return;
    const { width, height } = this.map.header;
    const zoom = clampZoom(
      Math.min(
        (this.host.clientWidth - 80) / ((width + height) * 32),
        (this.host.clientHeight - 100) / ((width + height) * 24),
        1,
      ),
    );
    this.world.scale.set(zoom);
    this.world.position.set(
      this.host.clientWidth / 2 - (height - width) * 16 * zoom,
      this.host.clientHeight / 2 - (width + height) * 12 * zoom,
    );
    this.schedule();
  }
  clear() {
    this.epoch++;
    this.map = undefined;
    this.client = undefined;
    this.busy = false;
    for (const sprite of this.sprites.values()) sprite.destroy();
    this.sprites.clear();
    for (const item of this.cache.values()) item.texture.destroy(true);
    this.cache.clear();
    this.trials.clear();
    for (const entry of this.trialTextures.values())
      entry.texture.destroy(true);
    this.trialTextures.clear();
    this.failed.clear();
    this.warnings.clear();
    this.infos.clear();
    this.overlay.clear();
    this.highlight.clear();
    this.selection = undefined;
    this.onTile(null);
    this.schedule();
  }
  open(value: OpenResult, client: ResourceClient) {
    this.clear();
    this.client = client;
    this.map = value.map;
    this.infos = new Map(value.tiles.map((info) => [info.mapId, info]));
    this.overhang = Math.max(
      64,
      ...value.tiles.map((t) =>
        Math.max(Math.abs(t.offX) + t.width, Math.abs(t.offY) + t.height),
      ),
    );
    this.fit();
  }
  layers(ground: boolean, objects: boolean, grid: boolean) {
    this.groundVisible = ground;
    this.objectsVisible = objects;
    this.gridVisible = grid;
    this.schedule();
  }
  select(x: number, y: number) {
    if (!this.map) return;
    const { width, height } = this.map.header;
    if (x < 0 || y < 0 || x >= width || y >= height) {
      this.selection = undefined;
      this.onTile(null);
    } else {
      this.selection = { x, y };
      const i = y * width + x;
      this.onTile({
        x,
        y,
        ground: this.map.ground[i],
        object: this.map.object[i],
        meta: this.map.meta[i],
      });
    }
    this.schedule();
  }
  get trialCount() {
    return this.trials.size;
  }
  private cellKey(x: number, y: number, layer: TileLayer) {
    if (
      !this.map ||
      !Number.isInteger(x) ||
      !Number.isInteger(y) ||
      x < 0 ||
      y < 0 ||
      x >= this.map.header.width ||
      y >= this.map.header.height
    )
      throw new Error("請先選擇有效地圖格位。");
    return `${layer}:${y * this.map.header.width + x}`;
  }
  placement(x: number, y: number, layer: TileLayer) {
    return this.trials.get(this.cellKey(x, y, layer));
  }
  place(
    x: number,
    y: number,
    layer: TileLayer,
    candidate: Candidate,
    tile: DecodedTile,
  ) {
    const cell = this.cellKey(x, y, layer);
    const original = this.map![layer][y * this.map!.header.width + x];
    if (!original || candidate.mapId !== original || tile.mapId !== original)
      throw new Error("候選 ID 與格位原始圖塊 ID 不符。");
    if (this.trials.size >= 256 && !this.trials.has(cell))
      throw new Error(
        "每張地圖最多試放 256 處（各圖層分別計算），請先還原部分格位。",
      );
    const key = candidateKey(candidate);
    if (!this.trialTextures.has(key)) {
      const bytes = [...this.trialTextures.values()].reduce(
        (n, t) => n + t.bytes,
        0,
      );
      if (bytes + tile.rgba.byteLength > 128 * 1024 * 1024)
        throw new Error("試放圖像已達 128 MiB 上限，請先清除部分試放。");
      const source = new BufferImageSource({
        resource: tile.rgba,
        width: tile.width,
        height: tile.height,
        format: "rgba8unorm",
        alphaMode: "no-premultiply-alpha",
        scaleMode: "nearest",
      });
      this.trialTextures.set(key, {
        texture: new Texture({ source }),
        bytes: tile.rgba.byteLength,
      });
    }
    this.removeSprite(cell);
    this.trials.set(cell, candidate);
    this.collectTrials();
    this.schedule();
  }
  restore(x: number, y: number, layer: TileLayer) {
    const cell = this.cellKey(x, y, layer);
    this.removeSprite(cell);
    this.trials.delete(cell);
    this.collectTrials();
    this.schedule();
  }
  restoreAll() {
    for (const key of this.trials.keys()) this.removeSprite(key);
    this.trials.clear();
    this.collectTrials();
    this.schedule();
  }
  private removeSprite(key: string) {
    this.sprites.get(key)?.destroy();
    this.sprites.delete(key);
  }
  private collectTrials() {
    const used = new Set([...this.trials.values()].map(candidateKey));
    for (const [key, entry] of this.trialTextures)
      if (!used.has(key)) {
        entry.texture.destroy(true);
        this.trialTextures.delete(key);
      }
    this.overhang = 64;
    for (const info of [...this.infos.values(), ...this.trials.values()])
      this.overhang = Math.max(
        this.overhang,
        Math.abs(info.offX) + info.width,
        Math.abs(info.offY) + info.height,
      );
  }
  diagnostics() {
    return [
      ...this.warnings,
      ...[...this.failed].map(([id, error]) => `圖塊 ${id}：${error}`),
    ].join("\n");
  }
  private schedule() {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => {
      this.queued = false;
      this.render();
    });
  }
  private diamond(graphic: Graphics, x: number, y: number) {
    graphic
      .moveTo(x, y - 24)
      .lineTo(x + 32, y)
      .lineTo(x, y + 24)
      .lineTo(x - 32, y)
      .closePath();
  }
  private render() {
    if (!this.ready) return;
    if (!this.map) {
      this.app.render();
      return;
    }
    const { width, height } = this.map.header;
    const pad = this.overhang;
    const left = -this.world.x / this.zoom - pad,
      top = -this.world.y / this.zoom - pad;
    const right = (this.host.clientWidth - this.world.x) / this.zoom + pad,
      bottom = (this.host.clientHeight - this.world.y) / this.zoom + pad;
    const corners = [
      [left, top],
      [right, top],
      [left, bottom],
      [right, bottom],
    ].map(([x, y]) => screenTile(x, y, width));
    const minX = Math.max(0, Math.min(...corners.map((t) => t.x)) - 1),
      maxX = Math.min(width - 1, Math.max(...corners.map((t) => t.x)) + 1);
    const minY = Math.max(0, Math.min(...corners.map((t) => t.y)) - 1),
      maxY = Math.min(height - 1, Math.max(...corners.map((t) => t.y)) + 1);
    const visible = new Set<string>(),
      needed = new Set<number>(),
      activeTextures = new Set<number>();
    this.overlay.clear();
    this.highlight.clear();
    this.tick++;
    let count = 0,
      limited = false;
    outer: for (let y = minY; y <= maxY; y++)
      for (let x = minX; x <= maxX; x++) {
        const i = y * width + x,
          point = tilePosition(x, y, width);
        if (
          this.gridVisible &&
          count < 12000 &&
          point.x >= left + pad - 64 &&
          point.x <= right - pad + 64 &&
          point.y >= top + pad - 48 &&
          point.y <= bottom - pad + 48
        )
          this.diamond(this.overlay, point.x, point.y);
        for (const layer of ["ground", "object"] as const) {
          if (!(layer === "ground" ? this.groundVisible : this.objectsVisible))
            continue;
          const id = this.map[layer][i];
          if (!id) continue;
          const key = `${layer}:${i}`;
          const trial = this.trials.get(key);
          const info = trial ?? this.infos.get(id);
          // GraphicInfo offsets already include the image's cell-center anchor.
          // Subtracting another half tile shifts the artwork into (x, y - 1).
          const px = point.x + (info?.offX ?? -32),
            py = point.y + (info?.offY ?? -24);
          if (
            px + (info?.width ?? 64) < left + pad ||
            px > right - pad ||
            py + (info?.height ?? 48) < top + pad ||
            py > bottom - pad
          )
            continue;
          if (++count > 200000) {
            limited = true;
            break outer;
          }
          visible.add(key);
          const cached = this.cache.get(id);
          if (!trial) {
            activeTextures.add(id);
            if (cached) cached.used = this.tick;
            if (info && !cached && !this.failed.has(id)) needed.add(id);
          }
          const resolvedTexture = trial
            ? this.trialTextures.get(candidateKey(trial))?.texture
            : cached?.texture;
          const texture = resolvedTexture ?? this.missingTexture;
          let sprite = this.sprites.get(key);
          if (!sprite) {
            sprite = new Sprite(texture);
            (layer === "ground"
              ? this.ground
              : info?.asGround
                ? this.flatObjects
                : this.objects
            ).addChild(sprite);
            this.sprites.set(key, sprite);
          }
          sprite.texture = texture;
          sprite.position.set(
            resolvedTexture ? px : point.x - 32,
            resolvedTexture ? py : point.y - 24,
          );
          sprite.alpha =
            !resolvedTexture && !this.failed.has(id) && info ? 0.25 : 1;
          sprite.zIndex = point.y;
        }
      }
    this.overlay.stroke({ color: 0xa6c8c3, alpha: 0.35, width: 1 / this.zoom });
    if (this.selection) {
      const p = tilePosition(this.selection.x, this.selection.y, width);
      this.diamond(this.highlight, p.x, p.y);
      this.highlight
        .fill({ color: 0x72e3c3, alpha: 0.2 })
        .stroke({ color: 0x9effde, width: 2 / this.zoom });
    }
    for (const [key, sprite] of this.sprites)
      if (!visible.has(key)) {
        sprite.destroy();
        this.sprites.delete(key);
      }
    this.evict(activeTextures);
    this.onStats({
      zoom: this.zoom,
      visible: this.sprites.size,
      failures: this.failed.size,
      limited,
      loading: !!needed.size || this.busy,
    });
    this.app.render();
    if (needed.size && !this.busy && this.client) {
      this.busy = true;
      const epoch = this.epoch;
      const ids = [...needed].slice(0, 32);
      void this.client
        .request({ kind: "tiles", ids })
        .then((result) => {
          if (epoch !== this.epoch || result.kind !== "tiles") return;
          for (const tile of result.tiles) {
            for (const warning of tile.warnings ?? [])
              this.warnings.add(`圖塊 ${tile.mapId}：${warning}`);
            const source = new BufferImageSource({
              resource: tile.rgba,
              width: tile.width,
              height: tile.height,
              format: "rgba8unorm",
              alphaMode: "no-premultiply-alpha",
              scaleMode: "nearest",
            });
            this.cache.set(tile.mapId, {
              texture: new Texture({ source }),
              bytes: tile.rgba.byteLength,
              used: this.tick,
            });
          }
          for (const error of result.errors)
            this.failed.set(error.mapId, error.message);
        })
        .catch((error) => {
          if (epoch === this.epoch)
            for (const id of ids) this.failed.set(id, String(error));
        })
        .finally(() => {
          if (epoch === this.epoch) {
            this.busy = false;
            this.schedule();
          }
        });
    }
  }
  private evict(active: Set<number>) {
    let bytes = [...this.cache.values()].reduce((n, t) => n + t.bytes, 0);
    for (const [id, item] of [...this.cache].sort(
      (a, b) => a[1].used - b[1].used,
    )) {
      if (bytes <= 128 * 1024 * 1024) break;
      if (active.has(id)) continue;
      item.texture.destroy(true);
      this.cache.delete(id);
      bytes -= item.bytes;
    }
  }
  destroy() {
    this.clear();
    this.observer.disconnect();
    this.missingTexture.destroy(true);
    this.app.destroy(true, { children: true });
  }
}
