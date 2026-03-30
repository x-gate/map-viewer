import { Container, Sprite, Texture } from "pixi.js";

import type { CrossGateStore, MapData } from "../../../crossgate";
import {
  TILE_HEIGHT,
  TILE_WIDTH,
  decodeGraphic,
  getStore,
  rotateLayer,
} from "../../../crossgate";
import { Label } from "../../ui/Label";

/** Extra tile padding around the viewport to avoid pop-in */
const CULL_PADDING = 6;

function tileBBoxTopLeft(col: number, row: number): { x: number; y: number } {
  return {
    x: (col - row - 1) * (TILE_WIDTH / 2),
    y: (col + row) * (TILE_HEIGHT / 2),
  };
}

/** Convert a local-space pixel position to fractional isometric tile coords */
function screenToTile(px: number, py: number): { col: number; row: number } {
  return {
    col: px / TILE_WIDTH + 0.5 + py / TILE_HEIGHT,
    row: py / TILE_HEIGHT - px / TILE_WIDTH - 0.5,
  };
}

/** Pre-computed object entry with rotated coordinates */
interface ObjectEntry {
  rotCol: number;
  rotRow: number;
  mapId: number;
}

/** All data needed for a loaded map */
interface LoadedMap {
  name: string;
  mapData: MapData;
  rotGround: { data: Uint16Array; width: number; height: number };
  objects: ObjectEntry[];
}

export class MainScreen extends Container {
  private mapContainer = new Container();
  private groundContainer = new Container();
  private objectContainer = new Container();
  private statusLabel!: Label;

  private store!: CrossGateStore;
  private textureCache = new Map<number, Texture>();

  // Viewport culling state
  private currentMap: LoadedMap | null = null;
  private groundSprites = new Map<number, Sprite>();
  private objectSprites = new Map<number, Sprite>();
  private screenWidth = 0;
  private screenHeight = 0;

  // Drag state
  private isDragging = false;
  private lastPointer = { x: 0, y: 0 };

  // HTML overlay
  private selectorEl!: HTMLDivElement;
  private styleEl!: HTMLStyleElement;

  constructor() {
    super();
    this.objectContainer.sortableChildren = true;
    this.mapContainer.addChild(this.groundContainer);
    this.mapContainer.addChild(this.objectContainer);
    this.addChild(this.mapContainer);
  }

  public prepare() {}

  public async show(): Promise<void> {
    this.store = getStore()!;

    this.statusLabel = new Label({
      text: "Select a map to load",
      style: { fill: 0xffffff, fontSize: 16 },
    });
    this.statusLabel.anchor.set(0, 0);
    this.statusLabel.x = 10;
    this.statusLabel.y = 10;
    this.addChild(this.statusLabel);

    this.createSelector();
    this.setupDrag();
  }

  // ── Map loading ──────────────────────────────────────────────

  private loadMap(name: string) {
    const mapData = this.store.maps.get(name);
    if (!mapData) {
      this.statusLabel.text = `Map ${name} not found`;
      return;
    }

    // Clear previous
    this.groundSprites.clear();
    this.objectSprites.clear();
    this.groundContainer.removeChildren();
    this.objectContainer.removeChildren();
    this.mapContainer.x = 0;
    this.mapContainer.y = 0;

    // Rotate ground layer
    const rotGround = rotateLayer(
      mapData.ground,
      mapData.width,
      mapData.height,
    );

    // Pre-compute object entries with rotated coords
    const objects: ObjectEntry[] = [];
    for (let i = 0; i < mapData.width * mapData.height; i++) {
      const mapId = mapData.object[i];
      if (mapId === 0) continue;
      if (!this.store.mapIdIndex.has(mapId)) continue;
      const origRow = Math.floor(i / mapData.width);
      const origCol = i % mapData.width;
      objects.push({
        rotCol: origRow,
        rotRow: mapData.width - 1 - origCol,
        mapId,
      });
    }

    this.currentMap = { name, mapData, rotGround, objects };

    // Center the map at the middle of the isometric diamond
    const midCol = rotGround.width / 2;
    const midRow = rotGround.height / 2;
    const center = tileBBoxTopLeft(midCol, midRow);
    this.mapContainer.x = this.screenWidth / 2 - center.x;
    this.mapContainer.y = this.screenHeight / 2 - center.y;

    this.updateVisibleTiles();

    this.statusLabel.text =
      `${name}: ${mapData.width}×${mapData.height} | ` +
      `${rotGround.width * rotGround.height} tiles | ` +
      `${objects.length} objects`;
  }

  // ── Viewport culling ─────────────────────────────────────────

  private getVisibleTileRange(): {
    minCol: number;
    maxCol: number;
    minRow: number;
    maxRow: number;
  } {
    // Viewport bounds in mapContainer local space
    const left = -this.mapContainer.x;
    const top = -this.mapContainer.y;
    const right = left + this.screenWidth;
    const bottom = top + this.screenHeight;

    // Convert all 4 corners to tile coords and take the bounding range
    const tl = screenToTile(left, top);
    const tr = screenToTile(right, top);
    const bl = screenToTile(left, bottom);
    const br = screenToTile(right, bottom);

    return {
      minCol:
        Math.floor(Math.min(tl.col, tr.col, bl.col, br.col)) - CULL_PADDING,
      maxCol:
        Math.ceil(Math.max(tl.col, tr.col, bl.col, br.col)) + CULL_PADDING,
      minRow:
        Math.floor(Math.min(tl.row, tr.row, bl.row, br.row)) - CULL_PADDING,
      maxRow:
        Math.ceil(Math.max(tl.row, tr.row, bl.row, br.row)) + CULL_PADDING,
    };
  }

  private updateVisibleTiles() {
    if (!this.currentMap) return;

    const { rotGround, objects } = this.currentMap;
    const range = this.getVisibleTileRange();

    // Clamp to map bounds
    const minCol = Math.max(0, range.minCol);
    const maxCol = Math.min(rotGround.width - 1, range.maxCol);
    const minRow = Math.max(0, range.minRow);
    const maxRow = Math.min(rotGround.height - 1, range.maxRow);

    // ── Ground layer ──

    // Build set of tiles that should be visible
    const visibleGround = new Set<number>();
    for (let row = minRow; row <= maxRow; row++) {
      for (let col = minCol; col <= maxCol; col++) {
        visibleGround.add(row * rotGround.width + col);
      }
    }

    // Remove sprites no longer visible
    for (const [key, sprite] of this.groundSprites) {
      if (!visibleGround.has(key)) {
        this.groundContainer.removeChild(sprite);
        this.groundSprites.delete(key);
      }
    }

    // Add newly visible sprites
    for (const key of visibleGround) {
      if (this.groundSprites.has(key)) continue;
      const mapId = rotGround.data[key];
      const tex = this.getTexture(mapId);
      if (!tex) continue;

      const info = this.store.mapIdIndex.get(mapId)!;
      const col = key % rotGround.width;
      const row = Math.floor(key / rotGround.width);
      const { x, y } = tileBBoxTopLeft(col, row);
      const sprite = new Sprite(tex);
      sprite.x = x + info.offX;
      sprite.y = y + info.offY;
      this.groundContainer.addChild(sprite);
      this.groundSprites.set(key, sprite);
    }

    // ── Object layer ──

    const visibleObjects = new Set<number>();
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];
      if (
        obj.rotCol >= minCol &&
        obj.rotCol <= maxCol &&
        obj.rotRow >= minRow &&
        obj.rotRow <= maxRow
      ) {
        visibleObjects.add(i);
      }
    }

    for (const [key, sprite] of this.objectSprites) {
      if (!visibleObjects.has(key)) {
        this.objectContainer.removeChild(sprite);
        this.objectSprites.delete(key);
      }
    }

    for (const key of visibleObjects) {
      if (this.objectSprites.has(key)) continue;
      const obj = objects[key];
      const tex = this.getTexture(obj.mapId);
      if (!tex) continue;

      const info = this.store.mapIdIndex.get(obj.mapId)!;
      const { x, y } = tileBBoxTopLeft(obj.rotCol, obj.rotRow);
      const sprite = new Sprite(tex);
      sprite.x = x + info.offX;
      sprite.y = y + info.offY;
      sprite.zIndex = (obj.rotCol + obj.rotRow + 1) * (TILE_HEIGHT / 2);
      this.objectContainer.addChild(sprite);
      this.objectSprites.set(key, sprite);
    }
  }

  // ── Texture helpers ──────────────────────────────────────────

  private getTexture(mapId: number): Texture | null {
    if (mapId === 0) return null;
    if (this.textureCache.has(mapId)) return this.textureCache.get(mapId)!;

    const info = this.store.mapIdIndex.get(mapId);
    if (!info || info.width <= 0 || info.height <= 0) return null;

    try {
      const decoded = decodeGraphic(
        this.store.graphicData,
        info,
        this.store.palette,
      );
      if (decoded.width === 0) return null;
      const tex = Texture.from({
        resource: decoded.pixels,
        width: decoded.width,
        height: decoded.height,
      });
      this.textureCache.set(mapId, tex);
      return tex;
    } catch {
      return null;
    }
  }

  // ── Drag / pan ───────────────────────────────────────────────

  private setupDrag() {
    this.eventMode = "static";
    this.hitArea = { contains: () => true };

    this.on("pointerdown", (e) => {
      this.isDragging = true;
      this.lastPointer.x = e.globalX;
      this.lastPointer.y = e.globalY;
    });

    this.on("pointermove", (e) => {
      if (!this.isDragging) return;
      this.mapContainer.x += e.globalX - this.lastPointer.x;
      this.mapContainer.y += e.globalY - this.lastPointer.y;
      this.lastPointer.x = e.globalX;
      this.lastPointer.y = e.globalY;
      this.updateVisibleTiles();
    });

    this.on("pointerup", () => (this.isDragging = false));
    this.on("pointerupoutside", () => (this.isDragging = false));
  }

  // ── Map selector UI ──────────────────────────────────────────

  private createSelector() {
    const mapNames = Array.from(this.store.maps.keys()).sort(
      (a, b) => parseInt(a) - parseInt(b),
    );

    this.styleEl = document.createElement("style");
    this.styleEl.textContent = `
      #map-selector {
        position: fixed;
        top: 12px;
        right: 12px;
        z-index: 1000;
        display: flex;
        flex-direction: column;
        gap: 6px;
        background: rgba(0, 0, 0, 0.85);
        border: 1px solid #444;
        border-radius: 8px;
        padding: 10px;
        width: 180px;
        font-family: monospace;
      }
      #map-search {
        background: #222;
        color: #fff;
        border: 1px solid #555;
        border-radius: 4px;
        padding: 6px 8px;
        font-size: 13px;
        outline: none;
      }
      #map-search:focus { border-color: #888; }
      #map-list {
        background: #111;
        color: #ccc;
        border: 1px solid #555;
        border-radius: 4px;
        font-size: 13px;
        outline: none;
      }
      #map-list option { padding: 3px 8px; }
      #map-list option:checked { background: #335; }
      #map-load-btn {
        background: #335;
        color: #fff;
        border: 1px solid #557;
        border-radius: 4px;
        padding: 6px;
        font-size: 13px;
        cursor: pointer;
      }
      #map-load-btn:hover { background: #447; }
    `;
    document.head.appendChild(this.styleEl);

    this.selectorEl = document.createElement("div");
    this.selectorEl.id = "map-selector";
    this.selectorEl.innerHTML = `
      <input type="text" id="map-search" placeholder="Search map ID..." />
      <select id="map-list" size="12"></select>
      <button id="map-load-btn">Load</button>
    `;
    document.body.appendChild(this.selectorEl);

    const selectEl = document.getElementById("map-list") as HTMLSelectElement;
    const searchEl = document.getElementById("map-search") as HTMLInputElement;
    const loadBtn = document.getElementById(
      "map-load-btn",
    ) as HTMLButtonElement;

    const populateList = (filter: string) => {
      selectEl.innerHTML = "";
      const filtered = filter
        ? mapNames.filter((m) => m.startsWith(filter))
        : mapNames;
      for (const m of filtered) {
        const opt = document.createElement("option");
        opt.value = m;
        opt.textContent = m;
        selectEl.appendChild(opt);
      }
      if (filtered.length > 0) selectEl.value = filtered[0];
    };

    populateList("");

    searchEl.addEventListener("input", () => populateList(searchEl.value));

    const doLoad = () => {
      if (selectEl.value) this.loadMap(selectEl.value);
    };
    loadBtn.addEventListener("click", doLoad);
    selectEl.addEventListener("dblclick", doLoad);
  }

  // ── Lifecycle ────────────────────────────────────────────────

  public async hide() {
    this.selectorEl?.remove();
    this.styleEl?.remove();
  }

  public resize(width: number, height: number) {
    this.screenWidth = width;
    this.screenHeight = height;
    this.updateVisibleTiles();
  }
}
