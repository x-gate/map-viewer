/**
 * Custom pixi.js LoaderParsers for CrossGate binary assets.
 *
 * Registers two loaders:
 * - `crossgateGraphicInfoLoader`: Loads GraphicInfo*.bin → GraphicInfoEntry[]
 * - `crossgateGraphicLoader`: Loads Graphic*.bin → ArrayBuffer (raw, for on-demand decoding)
 */

import { ExtensionType, LoaderParserPriority, checkExtension } from "pixi.js";
import type { LoaderParser } from "pixi.js";
import type { GraphicInfoEntry } from "./graphic-info";
import { parseGraphicInfo } from "./graphic-info";
import type { MapData } from "./map";
import { parseMap } from "./map";
import type { Color } from "./palette";
import { CGP_SIZE, parseCgpPalette } from "./palette";

/** Loader for GraphicInfo binary files. Returns parsed GraphicInfoEntry[]. */
export const crossgateGraphicInfoLoader = {
  extension: {
    type: ExtensionType.LoadParser,
    priority: LoaderParserPriority.High,
    name: "crossgate-graphic-info",
  },

  id: "crossgate-graphic-info",
  name: "crossgate-graphic-info",

  test(url: string): boolean {
    return checkExtension(url, [".bin"]) && /GraphicInfo/i.test(url);
  },

  async load(url: string): Promise<GraphicInfoEntry[]> {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    return parseGraphicInfo(buffer);
  },
} satisfies LoaderParser<GraphicInfoEntry[]>;

/** Loader for Graphic binary files. Returns raw ArrayBuffer for on-demand decoding. */
export const crossgateGraphicLoader = {
  extension: {
    type: ExtensionType.LoadParser,
    priority: LoaderParserPriority.High,
    name: "crossgate-graphic",
  },

  id: "crossgate-graphic",
  name: "crossgate-graphic",

  test(url: string): boolean {
    return checkExtension(url, [".bin"]) && /Graphic(?!Info)/i.test(url);
  },

  async load(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url);
    return response.arrayBuffer();
  },
} satisfies LoaderParser<ArrayBuffer>;

/** Loader for CGP palette files. Returns parsed 256-color palette. */
export const crossgateCgpLoader = {
  extension: {
    type: ExtensionType.LoadParser,
    priority: LoaderParserPriority.High,
    name: "crossgate-cgp",
  },

  id: "crossgate-cgp",
  name: "crossgate-cgp",

  test(url: string): boolean {
    return checkExtension(url, [".cgp"]);
  },

  async load(url: string): Promise<Color[]> {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    // Only read the first CGP_SIZE (672) bytes; ignore trailing data
    const data = new Uint8Array(
      buffer,
      0,
      Math.min(buffer.byteLength, CGP_SIZE),
    );
    return parseCgpPalette(data);
  },
} satisfies LoaderParser<Color[]>;

/** Loader for CrossGate map .dat files. Returns parsed MapData, or null for non-map .dat files. */
export const crossgateMapLoader = {
  extension: {
    type: ExtensionType.LoadParser,
    priority: LoaderParserPriority.High,
    name: "crossgate-map",
  },

  id: "crossgate-map",
  name: "crossgate-map",

  test(url: string): boolean {
    return checkExtension(url, [".dat"]);
  },

  async load(url: string): Promise<MapData | null> {
    const response = await fetch(url);
    const buffer = await response.arrayBuffer();
    // Validate MAP magic before parsing; ignore non-map .dat files
    const magic = new Uint8Array(buffer, 0, 3);
    if (magic[0] !== 0x4d || magic[1] !== 0x41 || magic[2] !== 0x50) {
      return null;
    }
    return parseMap(buffer);
  },
} satisfies LoaderParser<MapData | null>;
