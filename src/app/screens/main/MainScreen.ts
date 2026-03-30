import { Assets, Container, Sprite, Texture } from "pixi.js";

import type { GraphicInfoEntry, MapData } from "../../../crossgate";
import {
  TILE_HEIGHT,
  TILE_WIDTH,
  decodeGraphic,
  loadDefaultPalette,
  rotateLayer,
} from "../../../crossgate";
import { Label } from "../../ui/Label";

/**
 * Compute the top-left pixel position of a tile's bounding box in the isometric grid.
 *
 * For tile at (col, row):
 *   Diamond top vertex: x = (col - row) * tileW/2, y = (col + row) * tileH/2
 *   Bounding box top-left: (topX - tileW/2, topY)
 *
 * The graphic image is then placed at (bbLeft + offX, bbTop + offY).
 */
function tileBBoxTopLeft(col: number, row: number): { x: number; y: number } {
  return {
    x: (col - row - 1) * (TILE_WIDTH / 2),
    y: (col + row) * (TILE_HEIGHT / 2),
  };
}

/** The screen that renders a CrossGate map for verification */
export class MainScreen extends Container {
  public static assetBundles = ["main"];

  private mapContainer = new Container();
  private statusLabel!: Label;
  private isDragging = false;
  private lastPointer = { x: 0, y: 0 };

  constructor() {
    super();
    this.addChild(this.mapContainer);
  }

  public prepare() {}

  public async show(): Promise<void> {
    this.statusLabel = new Label({
      text: "Loading map 1011...",
      style: { fill: 0xffffff, fontSize: 16 },
    });
    this.statusLabel.anchor.set(0, 0);
    this.statusLabel.x = 10;
    this.statusLabel.y = 10;
    this.addChild(this.statusLabel);

    try {
      await loadDefaultPalette();

      const [graphicInfos, graphicData, mapData] = await Promise.all([
        Assets.load<GraphicInfoEntry[]>("GraphicInfo_66.bin"),
        Assets.load<ArrayBuffer>("Graphic_66.bin"),
        Assets.load<MapData>("1011.dat"),
      ]);

      // Build MapID → GraphicInfoEntry index
      const mapIdIndex = new Map<number, GraphicInfoEntry>();
      for (const info of graphicInfos) {
        if (info.mapId !== 0 && !mapIdIndex.has(info.mapId)) {
          mapIdIndex.set(info.mapId, info);
        }
      }

      // Texture cache keyed by MapID
      const textureCache = new Map<number, Texture>();

      const getTexture = (mapId: number): Texture | null => {
        if (mapId === 0) return null;
        if (textureCache.has(mapId)) return textureCache.get(mapId)!;

        const info = mapIdIndex.get(mapId);
        if (!info || info.width <= 0 || info.height <= 0) return null;

        try {
          const decoded = decodeGraphic(graphicData, info);
          if (decoded.width === 0) return null;
          const tex = Texture.from({
            resource: decoded.pixels,
            width: decoded.width,
            height: decoded.height,
          });
          textureCache.set(mapId, tex);
          return tex;
        } catch {
          return null;
        }
      };

      this.statusLabel.text = `Map 1011: ${mapData.width}×${mapData.height} | Building...`;

      // Rotate ground layer -90°
      const rotated = rotateLayer(
        mapData.ground,
        mapData.width,
        mapData.height,
      );

      const groundContainer = new Container();
      const objectContainer = new Container();
      objectContainer.sortableChildren = true;
      this.mapContainer.addChild(groundContainer);
      this.mapContainer.addChild(objectContainer);

      // Render ground layer (isometric)
      // Each tile is placed at its diamond bounding box top-left + graphic offset
      let groundRendered = 0;
      for (let row = 0; row < rotated.height; row++) {
        for (let col = 0; col < rotated.width; col++) {
          const mapId = rotated.data[row * rotated.width + col];
          const tex = getTexture(mapId);
          if (!tex) continue;

          const info = mapIdIndex.get(mapId)!;
          const { x, y } = tileBBoxTopLeft(col, row);
          const sprite = new Sprite(tex);
          sprite.x = x + info.offX;
          sprite.y = y + info.offY;
          groundContainer.addChild(sprite);
          groundRendered++;
        }
      }

      // Render object layer
      // Objects use original (unrotated) grid coords, converted to rotated isometric coords
      let objectRendered = 0;
      for (let i = 0; i < mapData.width * mapData.height; i++) {
        const mapId = mapData.object[i];
        if (mapId === 0) continue;

        const info = mapIdIndex.get(mapId);
        if (!info) continue;

        const tex = getTexture(mapId);
        if (!tex) continue;

        // Original grid position
        const origRow = Math.floor(i / mapData.width);
        const origCol = i % mapData.width;

        // Convert to rotated grid: rotCol = origRow, rotRow = origWidth - 1 - origCol
        const rotCol = origRow;
        const rotRow = mapData.width - 1 - origCol;

        const { x, y } = tileBBoxTopLeft(rotCol, rotRow);
        const sprite = new Sprite(tex);
        sprite.x = x + info.offX;
        sprite.y = y + info.offY;
        // Sort by diamond bottom Y — tiles closer to camera (larger Y) draw on top
        sprite.zIndex = (rotCol + rotRow + 1) * (TILE_HEIGHT / 2);
        objectContainer.addChild(sprite);
        objectRendered++;
      }

      this.statusLabel.text = `Map 1011: ${mapData.width}×${mapData.height} | Ground: ${groundRendered} | Objects: ${objectRendered} | Tiles: ${textureCache.size} unique`;

      // Enable drag to pan
      this.setupDrag();
    } catch (e) {
      console.error("Failed to load map:", e);
      this.statusLabel.text = `Error: ${e}`;
    }
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

  public async hide() {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public resize(width: number, _height: number) {
    // Center the map initially
    if (this.mapContainer.x === 0 && this.mapContainer.y === 0) {
      this.mapContainer.x = width / 2;
      this.mapContainer.y = 100;
    }
  }
}
