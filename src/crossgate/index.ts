/**
 * CrossGate asset module.
 *
 * Provides parsers and pixi.js loaders for CrossGate binary graphic data.
 *
 * Usage:
 *   // 1. Import this module to register the loaders (side-effect)
 *   import "../crossgate";
 *
 *   // 2. Load assets via pixi.js Assets API
 *   const graphicInfo = await Assets.load<GraphicInfoEntry[]>("GraphicInfo_66.bin");
 *   const graphicData = await Assets.load<ArrayBuffer>("Graphic_66.bin");
 *
 *   // 3. Decode individual graphics
 *   const decoded = decodeGraphic(graphicData, graphicInfo[index]);
 *   const texture = Texture.fromBuffer(decoded.pixels, decoded.width, decoded.height);
 */

export { rleDecode } from "./codec";
export {
  type GraphicInfoEntry,
  GRAPHIC_INFO_ENTRY_SIZE,
  parseGraphicInfo,
} from "./graphic-info";
export {
  type DecodedGraphic,
  decodeGraphic,
  loadDefaultPalette,
} from "./graphic";
export {
  type Color,
  CGP_SIZE,
  createDefaultPalette,
  parseCgpPalette,
  parseEmbeddedPalette,
} from "./palette";
export {
  type MapData,
  TILE_WIDTH,
  TILE_HEIGHT,
  parseMap,
  rotateLayer,
  tileToScreen,
} from "./map";
export {
  crossgateCgpLoader,
  crossgateGraphicInfoLoader,
  crossgateGraphicLoader,
  crossgateMapLoader,
} from "./loader";

import { extensions } from "pixi.js";
import {
  crossgateCgpLoader,
  crossgateGraphicInfoLoader,
  crossgateGraphicLoader,
  crossgateMapLoader,
} from "./loader";

// Auto-register loaders when this module is imported
extensions.add(crossgateGraphicInfoLoader);
extensions.add(crossgateGraphicLoader);
extensions.add(crossgateCgpLoader);
extensions.add(crossgateMapLoader);
