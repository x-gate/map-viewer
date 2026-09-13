import {
  Application,
  BufferImageSource,
  Container,
  Graphics,
  Sprite,
  Texture,
} from "pixi.js";
import type { ResourceClient } from "../resources/client";
import type { GameMap, OpenResult, TileInfo } from "../resources/protocol";
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
  private objects = new Container();
  private overlay = new Graphics();
  private highlight = new Graphics();
  private map?: GameMap;
  private infos = new Map<number, TileInfo>();
  private cache = new Map<number, Cached>();
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
  onTile: (
    tile: {
      x: number;
      y: number;
      ground: number;
      object: number;
      meta: number;
    } | null,
  ) => void = () => {};
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
      this.objects,
      this.overlay,
      this.highlight,
    );
    const marker = document.createElement("canvas");
    marker.width = 64;
    marker.height = 47;
    const ctx = marker.getContext("2d")!;
    ctx.beginPath();
    ctx.moveTo(32, 0);
    ctx.lineTo(64, 23.5);
    ctx.lineTo(32, 47);
    ctx.lineTo(0, 23.5);
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
        (this.host.clientHeight - 100) / ((width + height) * 23.5),
        1,
      ),
    );
    this.world.scale.set(zoom);
    this.world.position.set(
      this.host.clientWidth / 2 - (height - width) * 16 * zoom,
      this.host.clientHeight / 2 - (width + height) * 11.75 * zoom,
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
    this.failed.clear();
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
  diagnostics() {
    return [...this.failed]
      .map(([id, error]) => `圖塊 ${id}：${error}`)
      .join("\n");
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
      .moveTo(x, y - 23.5)
      .lineTo(x + 32, y)
      .lineTo(x, y + 23.5)
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
          point.y >= top + pad - 47 &&
          point.y <= bottom - pad + 47
        )
          this.diamond(this.overlay, point.x, point.y);
        for (const layer of ["ground", "object"] as const) {
          if (!(layer === "ground" ? this.groundVisible : this.objectsVisible))
            continue;
          const id = this.map[layer][i];
          if (!id) continue;
          const info = this.infos.get(id);
          const px = point.x - 32 + (info?.offX ?? 0),
            py = point.y - 23.5 + (info?.offY ?? 0);
          if (
            px + (info?.width ?? 64) < left + pad ||
            px > right - pad ||
            py + (info?.height ?? 47) < top + pad ||
            py > bottom - pad
          )
            continue;
          if (++count > 200000) {
            limited = true;
            break outer;
          }
          const key = `${layer}:${i}`;
          visible.add(key);
          activeTextures.add(id);
          const cached = this.cache.get(id);
          if (cached) cached.used = this.tick;
          if (info && !cached && !this.failed.has(id)) needed.add(id);
          const texture = cached?.texture ?? this.missingTexture;
          let sprite = this.sprites.get(key);
          if (!sprite) {
            sprite = new Sprite(texture);
            (layer === "ground" ? this.ground : this.objects).addChild(sprite);
            this.sprites.set(key, sprite);
          }
          sprite.texture = texture;
          sprite.position.set(
            cached ? px : point.x - 32,
            cached ? py : point.y - 23.5,
          );
          sprite.alpha = !cached && !this.failed.has(id) && info ? 0.25 : 1;
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
