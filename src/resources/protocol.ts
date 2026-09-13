import type { Map as GameMap } from "../../.generated/xglib/contract";
import type { ResourceSet } from "./catalog";
export type { GameMap };
export interface TileInfo {
  id: number;
  row: number;
  addr: number;
  len: number;
  offX: number;
  offY: number;
  width: number;
  height: number;
  mapId: number;
}
export interface OpenResult {
  map: GameMap;
  tiles: TileInfo[];
  duplicates: number;
  missing: number;
  invalid: number;
}
export interface DecodedTile {
  mapId: number;
  width: number;
  height: number;
  rgba: Uint8Array;
}
export type Request =
  | { kind: "init"; set: ResourceSet; palette: File }
  | { kind: "map"; file: File }
  | { kind: "tiles"; ids: number[] };
export type Result =
  | { kind: "init"; count: number; duplicates: number }
  | { kind: "map"; value: OpenResult }
  | {
      kind: "tiles";
      tiles: DecodedTile[];
      errors: { mapId: number; message: string }[];
    };
