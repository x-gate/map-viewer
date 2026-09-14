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
  asGround?: boolean;
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
  warnings?: string[];
}
export type TileLayer = "ground" | "object";
export interface SelectedCell {
  x: number;
  y: number;
  ground: number;
  object: number;
  meta: number;
}
export interface CandidateRef {
  source: string;
  row: number;
}
export interface Candidate extends TileInfo, CandidateRef {
  sourceName: string;
  dataSource: string;
  issue?: string;
}
export interface CandidatePage {
  candidates: Candidate[];
  total: number;
  offset: number;
  warnings: string[];
}
export function candidateKey(ref: CandidateRef) {
  return JSON.stringify([ref.source, ref.row]);
}
export type Request =
  | { kind: "candidate-init"; sets: ResourceSet[]; palette: File }
  | { kind: "candidates"; mapId: number; offset: number }
  | { kind: "candidate-decode"; ref: CandidateRef }
  | { kind: "init"; set: ResourceSet; palette: File }
  | { kind: "map"; file: File }
  | { kind: "tiles"; ids: number[] };
export type Result =
  | { kind: "candidate-init" }
  | { kind: "candidates"; value: CandidatePage }
  | { kind: "candidate-decode"; candidate: Candidate; tile: DecodedTile }
  | { kind: "init"; count: number; duplicates: number }
  | { kind: "map"; value: OpenResult }
  | {
      kind: "tiles";
      tiles: DecodedTile[];
      errors: { mapId: number; message: string }[];
    };
