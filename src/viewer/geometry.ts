// Reference-viewer convention, not a verified official projection specification.
export const TILE_WIDTH = 64;
export const TILE_HEIGHT = 47;
export function tilePosition(x: number, y: number, width: number) {
  const col = y,
    row = width - 1 - x;
  return {
    x: ((col - row) * TILE_WIDTH) / 2,
    y: ((col + row + 1) * TILE_HEIGHT) / 2,
  };
}
export function screenTile(px: number, py: number, width: number) {
  const col = Math.floor(px / TILE_WIDTH + py / TILE_HEIGHT);
  const row = Math.floor(py / TILE_HEIGHT - px / TILE_WIDTH);
  return { x: width - 1 - row, y: col };
}
export function clampZoom(value: number) {
  return Math.min(4, Math.max(0.08, value));
}
