import { beforeAll, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { initSync } from "../../.generated/xglib/xglib.js";
import * as bindings from "../../.generated/xglib/xglib.js";
import type * as Contract from "../../.generated/xglib/contract";
import { CandidateLibrary } from "../../src/resources/candidates";
import { candidateKey } from "../../src/resources/protocol";
import { discover } from "../../src/resources/catalog";
import { candidateResources, syntheticResources } from "../fixtures";
const parser = bindings as unknown as typeof Contract;
beforeAll(async () =>
  initSync({
    module: await readFile(
      new URL("../../.generated/xglib/xglib_bg.wasm", import.meta.url),
    ),
  }),
);
function catalog(resources = candidateResources()) {
  return discover(
    [...resources].map(([path, bytes]) => ({
      path,
      file: new File([bytes], path.split("/").pop()!),
    })),
    "合成遊戲",
  );
}
async function library() {
  const c = catalog();
  const lib = new CandidateLibrary(parser);
  await lib.initialize(c.sets, c.palettes[0].file);
  return lib;
}
test("searches all sources and preserves duplicate rows with exact map IDs", async () => {
  const lib = await library(),
    first = await lib.search(2),
    next = await lib.search(2, 12);
  expect(first.total).toBe(17);
  expect(first.candidates).toHaveLength(12);
  expect(next.candidates).toHaveLength(5);
  const all = [...first.candidates, ...next.candidates];
  expect(new Set(all.map(candidateKey)).size).toBe(17);
  expect(all.every((c) => c.mapId === 2)).toBe(true);
  expect(first.candidates[1]).toMatchObject({
    row: 0,
    id: 100,
    mapId: 2,
    source: "Assets/bin/GraphicInfo_2.bin",
    dataSource: "Assets/bin/Graphic_2.bin",
  });
  expect((await lib.search(100)).total).toBe(0); // Never confuse graphic.id with map_id.
  expect(first.warnings).toHaveLength(1);
  expect(first.warnings[0]).toContain("GraphicInfo_bad.bin");
});
test("decodes a specific source and row instead of collapsing shared map IDs", async () => {
  const lib = await library(),
    source = "Assets/bin/GraphicInfo_2.bin";
  const a = await lib.decode({ source, row: 0 }),
    b = await lib.decode({ source, row: 1 }),
    other = await lib.decode({
      source: "Assets/bin/GraphicInfo_3.bin",
      row: 0,
    });
  expect(a.candidate.id).toBe(100);
  expect(b.candidate.id).toBe(101);
  expect(a.tile.width).toBe(32);
  expect(b.tile.width).toBe(34);
  expect(other.tile.width).toBe(64);
  expect([
    ...a.tile.rgba.slice((23 * 32 + 16) * 4, (23 * 32 + 16) * 4 + 4),
  ]).toEqual([167, 181, 145, 255]);
  expect([
    ...b.tile.rgba.slice((23 * 34 + 17) * 4, (23 * 34 + 17) * 4 + 4),
  ]).toEqual([115, 145, 91, 255]);
});
test("retains invalid candidates as diagnostics and refuses to place malformed images", async () => {
  const lib = await library(),
    source = "Assets/bin/GraphicInfo_2.bin";
  const last = await lib.search(2, 12);
  expect(last.candidates.find((c) => c.row === 13)?.issue).toContain("無效");
  await expect(lib.decode({ source, row: 13 })).rejects.toThrow("有效圖塊索引");
  await expect(lib.decode({ source, row: 14 })).rejects.toContain(
    "InvalidMagic",
  );
  await expect(lib.decode({ source, row: -1 })).rejects.toThrow("索引列");
  await expect(lib.decode({ source: "missing", row: 0 })).rejects.toThrow(
    "候選來源",
  );
});
test("handles zero, no match, and invalid query parameters", async () => {
  const lib = await library();
  expect((await lib.search(0)).total).toBe(0);
  expect((await lib.search(999)).total).toBe(0);
  await expect(lib.search(-1)).rejects.toThrow("ID");
  await expect(lib.search(65536)).rejects.toThrow("ID");
  await expect(lib.search(2, -1)).rejects.toThrow("頁碼");
});
test("reinitialization discards previous sources and palette", async () => {
  const lib = await library();
  await lib.search(2);
  const c = catalog(syntheticResources());
  await lib.initialize(c.sets, c.palettes[0].file);
  const page = await lib.search(2);
  expect(page.total).toBe(1);
  expect(page.warnings).toEqual([]);
  await expect(
    lib.decode({ source: "Assets/bin/GraphicInfo_2.bin", row: 0 }),
  ).rejects.toThrow("來源");
});
test("candidate searches never read graphic data payloads", async () => {
  const c = catalog();
  class MetadataOnlyFile extends File {
    override slice(): Blob {
      throw new Error("搜尋不應讀取圖像內容");
    }
    override arrayBuffer(): Promise<ArrayBuffer> {
      throw new Error("搜尋不應讀取圖像內容");
    }
  }
  const sets = c.sets.map((set) => ({
    ...set,
    data: {
      ...set.data,
      file: new MetadataOnlyFile(
        [new Uint8Array(set.data.file.size)],
        set.data.file.name,
      ),
    },
  }));
  const lib = new CandidateLibrary(parser);
  await lib.initialize(sets, c.palettes[0].file);
  expect((await lib.search(2)).total).toBe(17);
});
