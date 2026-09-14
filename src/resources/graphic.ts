import type * as Contract from "../../.generated/xglib/contract";
import type { DecodedTile, TileInfo } from "./protocol";

export function readTileInfo(bytes: Uint8Array, row: number): TileInfo {
  if (bytes.byteLength !== 40)
    throw new Error("圖像索引列必須恰好為 40 bytes。");
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return {
    mapId: view.getInt32(36, true),
    asGround: view.getUint8(31) === 1,
    row,
    id: view.getInt32(0, true),
    addr: view.getUint32(4, true),
    len: view.getInt32(8, true),
    offX: view.getInt32(12, true),
    offY: view.getInt32(16, true),
    width: view.getInt32(20, true),
    height: view.getInt32(24, true),
  };
}
export function validTileInfo(info: TileInfo, size: number) {
  return (
    info.width > 0 &&
    info.height > 0 &&
    info.width <= 4096 &&
    info.height <= 4096 &&
    info.width * info.height <= 4_194_304 &&
    info.len >= 16 &&
    info.len <= 16_777_216 &&
    info.addr + info.len <= size &&
    Math.abs(info.offX) <= 8192 &&
    Math.abs(info.offY) <= 8192
  );
}
export async function decodeTile(
  parser: typeof Contract,
  index: Uint8Array,
  info: TileInfo,
  data: File,
  palette: Uint8Array,
): Promise<DecodedTile> {
  if (!validTileInfo(info, data.size))
    throw new Error("找不到有效圖塊索引或已超過圖像資源上限。");
  const bytes = new Uint8Array(
    await data.slice(info.addr, info.addr + info.len).arrayBuffer(),
  );
  if (bytes.byteLength !== info.len)
    throw new Error("圖像檔案已變更或資料長度不足，請重新選擇資料夾。");
  const header = new DataView(bytes.buffer);
  const { width, height } = info;
  const warnings =
    header.getInt32(4, true) !== width || header.getInt32(8, true) !== height
      ? [`索引列 ${info.row} 的 RD 尺寸不同，依 CGTool 使用 GraphicInfo 尺寸。`]
      : [];
  const graphic = parser.graphic_strict_build_from_cgp(index, bytes, palette);
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < graphic.payload.length; i++) {
    const color = graphic.palette.colors[graphic.payload[i]];
    if (!color) throw new Error("圖像色彩索引超出調色盤。");
    // xglib preserves bottom-up source rows; display uses top-down RGBA.
    const destination =
      ((height - 1 - Math.floor(i / width)) * width + (i % width)) * 4;
    rgba.set([color.red, color.green, color.blue, color.alpha], destination);
  }
  return { mapId: info.mapId, width, height, rgba, warnings };
}
