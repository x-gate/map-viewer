import { Assets, Container, Sprite, Texture } from "pixi.js";

import type { GraphicInfoEntry } from "../../../crossgate";
import { decodeGraphic, loadDefaultPalette } from "../../../crossgate";
import { Label } from "../../ui/Label";

/** Sample graphic indices to display on screen */
const SAMPLE_INDICES = [0, 100, 200, 300, 400, 500, 600, 700, 800, 900];

/** The screen that holds the app — renders CrossGate graphics for verification */
export class MainScreen extends Container {
  public static assetBundles = ["main"];

  private gridContainer = new Container();
  private statusLabel!: Label;

  constructor() {
    super();
    this.addChild(this.gridContainer);
  }

  public prepare() {}

  public async show(): Promise<void> {
    this.statusLabel = new Label({
      text: "Loading CrossGate assets...",
      style: { fill: 0xffffff, fontSize: 18 },
    });
    this.statusLabel.y = 10;
    this.statusLabel.x = 10;
    this.addChild(this.statusLabel);

    try {
      // Load the default CGP palette
      await loadDefaultPalette();

      // Load GraphicInfo and Graphic data
      const graphicInfos =
        await Assets.load<GraphicInfoEntry[]>("GraphicInfo_66.bin");
      const graphicData = await Assets.load<ArrayBuffer>("Graphic_66.bin");

      this.statusLabel.text = `Loaded ${graphicInfos.length} graphic entries (${(graphicData.byteLength / 1024 / 1024).toFixed(1)} MB)`;

      // Render sample graphics in a grid
      let col = 0;
      let row = 0;
      const spacing = 120;
      let rendered = 0;

      for (const idx of SAMPLE_INDICES) {
        if (idx >= graphicInfos.length) continue;
        const info = graphicInfos[idx];
        if (info.width <= 0 || info.height <= 0) continue;

        try {
          const decoded = decodeGraphic(graphicData, info);
          if (decoded.width === 0 || decoded.height === 0) continue;

          const texture = Texture.from({
            resource: decoded.pixels,
            width: decoded.width,
            height: decoded.height,
          });

          const sprite = new Sprite(texture);
          // Scale down large sprites to fit the grid
          const maxDim = Math.max(sprite.width, sprite.height);
          if (maxDim > 100) {
            const scale = 100 / maxDim;
            sprite.scale.set(scale);
          }
          sprite.x = col * spacing;
          sprite.y = row * spacing;
          this.gridContainer.addChild(sprite);

          // Add index label below the sprite
          const label = new Label({
            text: `#${idx}`,
            style: { fill: 0xaaaaaa, fontSize: 12 },
          });
          label.x = col * spacing;
          label.y = row * spacing + 105;
          this.gridContainer.addChild(label);

          rendered++;
          col++;
          if (col >= 5) {
            col = 0;
            row++;
          }
        } catch (e) {
          console.warn(`Failed to decode graphic #${idx}:`, e);
        }
      }

      this.statusLabel.text += ` | Rendered ${rendered}/${SAMPLE_INDICES.length} samples`;
    } catch (e) {
      console.error("Failed to load CrossGate assets:", e);
      this.statusLabel.text = `Error: ${e}`;
    }
  }

  public async hide() {}

  public resize(width: number, height: number) {
    // Center the grid
    this.gridContainer.x = (width - this.gridContainer.width) * 0.5;
    this.gridContainer.y = (height - this.gridContainer.height) * 0.5 + 20;
  }
}
