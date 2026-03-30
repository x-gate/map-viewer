import { Container } from "pixi.js";

import { initStore } from "../../crossgate";
import { engine } from "../getEngine";

import { MainScreen } from "./main/MainScreen";

/**
 * A screen that prompts the user to provide their own CrossGate asset files
 * via browser file pickers before entering the map viewer.
 */
export class AssetPickerScreen extends Container {
  private overlayEl!: HTMLDivElement;
  private styleEl!: HTMLStyleElement;

  constructor() {
    super();
  }

  public async show(): Promise<void> {
    this.createOverlay();
  }

  private createOverlay() {
    this.styleEl = document.createElement("style");
    this.styleEl.textContent = `
      #asset-picker-overlay {
        position: fixed;
        inset: 0;
        z-index: 2000;
        display: flex;
        justify-content: center;
        align-items: center;
        background: rgba(0, 0, 0, 0.9);
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        color: #e0e0e0;
      }
      #asset-picker {
        background: #1a1a2e;
        border: 1px solid #333;
        border-radius: 12px;
        padding: 32px;
        width: 480px;
        max-width: 90vw;
      }
      #asset-picker h2 {
        margin: 0 0 8px;
        font-size: 20px;
        color: #fff;
      }
      #asset-picker p.desc {
        margin: 0 0 24px;
        font-size: 13px;
        color: #888;
        line-height: 1.5;
      }
      .ap-field {
        margin-bottom: 16px;
      }
      .ap-field label {
        display: block;
        font-size: 13px;
        font-weight: 600;
        margin-bottom: 6px;
        color: #ccc;
      }
      .ap-field .ap-hint {
        font-size: 11px;
        color: #666;
        font-weight: 400;
        margin-left: 4px;
      }
      .ap-field input[type="file"] {
        display: block;
        width: 100%;
        font-size: 13px;
        color: #ccc;
        background: #111;
        border: 1px solid #444;
        border-radius: 6px;
        padding: 8px;
        box-sizing: border-box;
        cursor: pointer;
      }
      .ap-field input[type="file"]::file-selector-button {
        background: #335;
        color: #fff;
        border: 1px solid #557;
        border-radius: 4px;
        padding: 4px 12px;
        margin-right: 8px;
        cursor: pointer;
        font-size: 12px;
      }
      .ap-field input[type="file"]::file-selector-button:hover {
        background: #447;
      }
      #ap-submit {
        width: 100%;
        padding: 10px;
        font-size: 15px;
        font-weight: 600;
        background: #335;
        color: #fff;
        border: 1px solid #557;
        border-radius: 6px;
        cursor: pointer;
        margin-top: 8px;
      }
      #ap-submit:hover:not(:disabled) { background: #447; }
      #ap-submit:disabled {
        opacity: 0.4;
        cursor: not-allowed;
      }
      #ap-error {
        color: #f66;
        font-size: 13px;
        margin-top: 12px;
        display: none;
      }
      #ap-status {
        color: #8cf;
        font-size: 13px;
        margin-top: 12px;
        display: none;
      }
    `;
    document.head.appendChild(this.styleEl);

    this.overlayEl = document.createElement("div");
    this.overlayEl.id = "asset-picker-overlay";
    this.overlayEl.innerHTML = `
      <div id="asset-picker">
        <h2>CrossGate Asset Loader</h2>
        <p class="desc">
          Please provide your own CrossGate game data files to proceed.
          These files are processed locally in your browser and are never uploaded.
        </p>

        <div class="ap-field">
          <label>GraphicInfo <span class="ap-hint">(e.g. GraphicInfo_66.bin)</span></label>
          <input type="file" id="ap-graphic-info" accept=".bin,.Bin" />
        </div>

        <div class="ap-field">
          <label>Graphic <span class="ap-hint">(e.g. Graphic_66.bin)</span></label>
          <input type="file" id="ap-graphic" accept=".bin,.Bin" />
        </div>

        <div class="ap-field">
          <label>Palette <span class="ap-hint">(optional, e.g. palet_00.cgp)</span></label>
          <input type="file" id="ap-palette" accept=".cgp" />
        </div>

        <div class="ap-field">
          <label>Map files <span class="ap-hint">(.dat, select multiple)</span></label>
          <input type="file" id="ap-maps" accept=".dat" multiple />
        </div>

        <button id="ap-submit" disabled>Load Assets</button>
        <div id="ap-error"></div>
        <div id="ap-status"></div>
      </div>
    `;
    document.body.appendChild(this.overlayEl);

    const graphicInfoInput = document.getElementById(
      "ap-graphic-info",
    ) as HTMLInputElement;
    const graphicInput = document.getElementById(
      "ap-graphic",
    ) as HTMLInputElement;
    const paletteInput = document.getElementById(
      "ap-palette",
    ) as HTMLInputElement;
    const mapsInput = document.getElementById("ap-maps") as HTMLInputElement;
    const submitBtn = document.getElementById("ap-submit") as HTMLButtonElement;
    const errorEl = document.getElementById("ap-error") as HTMLDivElement;
    const statusEl = document.getElementById("ap-status") as HTMLDivElement;

    const checkReady = () => {
      const hasRequired =
        graphicInfoInput.files?.length &&
        graphicInput.files?.length &&
        mapsInput.files?.length;
      submitBtn.disabled = !hasRequired;
    };

    graphicInfoInput.addEventListener("change", checkReady);
    graphicInput.addEventListener("change", checkReady);
    mapsInput.addEventListener("change", checkReady);

    submitBtn.addEventListener("click", async () => {
      const graphicInfoFile = graphicInfoInput.files?.[0];
      const graphicFile = graphicInput.files?.[0];
      const paletteFile = paletteInput.files?.[0] ?? null;
      const mapFileList = mapsInput.files;

      if (!graphicInfoFile || !graphicFile || !mapFileList?.length) return;

      submitBtn.disabled = true;
      errorEl.style.display = "none";
      statusEl.style.display = "block";
      statusEl.textContent = "Parsing assets...";

      try {
        const mapFiles = Array.from(mapFileList);
        statusEl.textContent = `Parsing ${mapFiles.length} map files...`;

        const store = await initStore(
          graphicInfoFile,
          graphicFile,
          paletteFile,
          mapFiles,
        );

        statusEl.textContent = `Loaded ${store.graphicInfos.length} graphics, ${store.maps.size} maps. Starting...`;

        // Short delay to show success message
        await new Promise((r) => setTimeout(r, 300));

        this.removeOverlay();
        await engine().navigation.showScreen(MainScreen);
      } catch (e) {
        console.error("Failed to load assets:", e);
        errorEl.style.display = "block";
        errorEl.textContent = `Error: ${e instanceof Error ? e.message : String(e)}`;
        submitBtn.disabled = false;
        statusEl.style.display = "none";
      }
    });
  }

  private removeOverlay() {
    this.overlayEl?.remove();
    this.styleEl?.remove();
  }

  public async hide() {
    this.removeOverlay();
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  public resize(_width: number, _height: number) {}
}
