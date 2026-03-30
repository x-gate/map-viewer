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

function tileBBoxTopLeft(col: number, row: number): { x: number; y: number } {
  return {
    x: (col - row - 1) * (TILE_WIDTH / 2),
    y: (col + row) * (TILE_HEIGHT / 2),
  };
}

/** The screen that renders a CrossGate map with a map selector overlay */
export class MainScreen extends Container {
  private mapContainer = new Container();
  private statusLabel!: Label;
  private isDragging = false;
  private lastPointer = { x: 0, y: 0 };

  private store!: CrossGateStore;
  private textureCache = new Map<number, Texture>();

  private selectorEl!: HTMLDivElement;
  private styleEl!: HTMLStyleElement;

  constructor() {
    super();
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

  /** Create the HTML map selector overlay */
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

  /** Load and render a map by name */
  private loadMap(name: string) {
    this.statusLabel.text = `Loading ${name}...`;

    const mapData = this.store.maps.get(name);
    if (!mapData) {
      this.statusLabel.text = `Map ${name} not found`;
      return;
    }

    // Clear previous map
    this.mapContainer.removeChildren();
    this.mapContainer.x = 0;
    this.mapContainer.y = 0;

    const result = this.renderMap(mapData);

    this.statusLabel.text = `${name}: ${mapData.width}×${mapData.height} | Ground: ${result.ground} | Objects: ${result.objects} | Tiles: ${result.unique}`;

    // Center the map
    const bounds = this.mapContainer.getBounds();
    const app = document.getElementById("pixi-container")!;
    this.mapContainer.x = app.clientWidth / 2 - bounds.width / 2 - bounds.x;
    this.mapContainer.y = 50 - bounds.y;
  }

  /** Render a parsed map into mapContainer */
  private renderMap(mapData: MapData): {
    ground: number;
    objects: number;
    unique: number;
  } {
    let newTextures = 0;

    const getTexture = (mapId: number): Texture | null => {
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
        newTextures++;
        return tex;
      } catch {
        return null;
      }
    };

    const rotated = rotateLayer(mapData.ground, mapData.width, mapData.height);

    const groundContainer = new Container();
    const objectContainer = new Container();
    objectContainer.sortableChildren = true;
    this.mapContainer.addChild(groundContainer);
    this.mapContainer.addChild(objectContainer);

    // Ground layer
    let groundRendered = 0;
    for (let row = 0; row < rotated.height; row++) {
      for (let col = 0; col < rotated.width; col++) {
        const mapId = rotated.data[row * rotated.width + col];
        const tex = getTexture(mapId);
        if (!tex) continue;

        const info = this.store.mapIdIndex.get(mapId)!;
        const { x, y } = tileBBoxTopLeft(col, row);
        const sprite = new Sprite(tex);
        sprite.x = x + info.offX;
        sprite.y = y + info.offY;
        groundContainer.addChild(sprite);
        groundRendered++;
      }
    }

    // Object layer
    let objectRendered = 0;
    for (let i = 0; i < mapData.width * mapData.height; i++) {
      const mapId = mapData.object[i];
      if (mapId === 0) continue;

      const info = this.store.mapIdIndex.get(mapId);
      if (!info) continue;

      const tex = getTexture(mapId);
      if (!tex) continue;

      const origRow = Math.floor(i / mapData.width);
      const origCol = i % mapData.width;
      const rotCol = origRow;
      const rotRow = mapData.width - 1 - origCol;

      const { x, y } = tileBBoxTopLeft(rotCol, rotRow);
      const sprite = new Sprite(tex);
      sprite.x = x + info.offX;
      sprite.y = y + info.offY;
      sprite.zIndex = (rotCol + rotRow + 1) * (TILE_HEIGHT / 2);
      objectContainer.addChild(sprite);
      objectRendered++;
    }

    return {
      ground: groundRendered,
      objects: objectRendered,
      unique: newTextures,
    };
  }

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
      const dx = e.globalX - this.lastPointer.x;
      const dy = e.globalY - this.lastPointer.y;
      this.mapContainer.x += dx;
      this.mapContainer.y += dy;
      this.lastPointer.x = e.globalX;
      this.lastPointer.y = e.globalY;
    });

    this.on("pointerup", () => (this.isDragging = false));
    this.on("pointerupoutside", () => (this.isDragging = false));
  }

  public async hide() {
    this.selectorEl?.remove();
    this.styleEl?.remove();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public resize(width: number, _height: number) {
    if (this.mapContainer.x === 0 && this.mapContainer.y === 0) {
      this.mapContainer.x = width / 2;
      this.mapContainer.y = 100;
    }
  }
}
