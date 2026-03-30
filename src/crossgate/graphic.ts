/**
 * Parser for CrossGate Graphic binary files (e.g. Graphic_66.bin).
 *
 * Each graphic is located at the byte offset from GraphicInfo.addr.
 * Format: 16-byte header ("RD" magic) + optional embedded palette size + payload.
 * Payload may be raw or RLE-encoded depending on the version field.
 */

import { Assets } from "pixi.js";
import { rleDecode } from "./codec";
import type { GraphicInfoEntry } from "./graphic-info";
import type { Color } from "./palette";
import { createDefaultPalette, parseEmbeddedPalette } from "./palette";

/** Default CGP palette asset alias (resolved via pixi.js Assets) */
const DEFAULT_CGP_ALIAS = "palet_00.cgp";

/** Cached default palette loaded from palet_00.cgp */
let cachedDefaultCgpPalette: Color[] | null = null;

const HEADER_SIZE = 16;
const MAGIC_R = 0x52; // 'R'
const MAGIC_D = 0x44; // 'D'

export interface DecodedGraphic {
  /** RGBA pixel data (width * height * 4 bytes), suitable for ImageData / Texture */
  pixels: Uint8Array;
  /** Image width */
  width: number;
  /** Image height */
  height: number;
  /** Rendering offset X */
  offX: number;
  /** Rendering offset Y */
  offY: number;
}

/**
 * Load and cache the default CGP palette (palet_00.cgp) via pixi.js Assets.
 * Must be called after Assets.init().
 */
export async function loadDefaultPalette(): Promise<Color[]> {
  if (!cachedDefaultCgpPalette) {
    cachedDefaultCgpPalette = await Assets.load<Color[]>(DEFAULT_CGP_ALIAS);
  }
  return cachedDefaultCgpPalette;
}

/**
 * Decode a single graphic from the Graphic binary file.
 *
 * @param graphicBuffer - The entire Graphic_66.bin ArrayBuffer
 * @param info - The GraphicInfoEntry for this graphic
 * @param externalPalette - Optional external palette (256 colors). If not provided, uses the cached palet_00.cgp palette (call loadDefaultPalette() first), or falls back to the hardcoded default.
 */
export function decodeGraphic(
  graphicBuffer: ArrayBuffer,
  info: GraphicInfoEntry,
  externalPalette?: Color[],
): DecodedGraphic {
  const { addr, len, width, height, offX, offY } = info;

  if (width <= 0 || height <= 0 || len <= HEADER_SIZE) {
    return { pixels: new Uint8Array(0), width: 0, height: 0, offX, offY };
  }

  const raw = new Uint8Array(graphicBuffer, addr, len);

  // Validate magic
  if (raw[0] !== MAGIC_R || raw[1] !== MAGIC_D) {
    throw new Error(
      `Invalid graphic magic at addr ${addr}: expected "RD", got 0x${raw[0].toString(16)}${raw[1].toString(16)}`,
    );
  }

  const version = raw[2];
  const isRle = (version & 1) === 1;
  const hasEmbeddedPalette = version >= 2;

  let payloadStart = HEADER_SIZE;
  let embeddedPaletteSize = 0;

  if (hasEmbeddedPalette) {
    const view = new DataView(graphicBuffer, addr + HEADER_SIZE, 4);
    embeddedPaletteSize = view.getInt32(0, true);
    payloadStart = HEADER_SIZE + 4;
  }

  const payload = raw.slice(payloadStart);

  // Decode payload
  const decoded = isRle ? rleDecode(payload) : payload;

  // Determine palette
  let palette: Color[];
  if (hasEmbeddedPalette && embeddedPaletteSize > 0) {
    const paletteBytes = decoded.slice(decoded.length - embeddedPaletteSize);
    palette = parseEmbeddedPalette(paletteBytes);
  } else {
    palette =
      externalPalette ?? cachedDefaultCgpPalette ?? createDefaultPalette();
  }

  // Pixel indices (exclude embedded palette bytes from the end)
  const pixelIndices = hasEmbeddedPalette
    ? decoded.slice(0, decoded.length - embeddedPaletteSize)
    : decoded;

  // Convert to RGBA (bottom-to-top row order)
  const pixels = new Uint8Array(width * height * 4);
  const pixelCount = width * height;

  for (let i = 0; i < pixelCount && i < pixelIndices.length; i++) {
    const colorIndex = pixelIndices[i];
    const x = i % width;
    const y = height - 1 - Math.floor(i / width); // bottom-to-top flip
    const destOffset = (y * width + x) * 4;
    const color = palette[colorIndex] ?? [0, 0, 0, 0];
    pixels[destOffset] = color[0];
    pixels[destOffset + 1] = color[1];
    pixels[destOffset + 2] = color[2];
    pixels[destOffset + 3] = color[3];
  }

  return { pixels, width, height, offX, offY };
}
