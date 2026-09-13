import { describe, expect, test, beforeAll } from "bun:test";
import { readFile } from "node:fs/promises";
import { initSync } from "../../.generated/xglib/xglib.js";
import * as bindings from "../../.generated/xglib/xglib.js";
import type * as Contract from "../../.generated/xglib/contract";
import { discover } from "../../src/resources/catalog";
import { ResourceSession } from "../../src/resources/session";
import { tilePosition, screenTile, clampZoom } from "../../src/viewer/geometry";
import {
  syntheticResources,
  mapBytes,
  infoBytes,
  graphicBytes,
  paletteBytes,
} from "../fixtures";
const parser = bindings as unknown as typeof Contract;
beforeAll(async () =>
  initSync({
    module: await readFile(
      new URL("../../.generated/xglib/xglib_bg.wasm", import.meta.url),
    ),
  }),
);
const catalog = () =>
  discover(
    [...syntheticResources()].map(([path, bytes]) => ({
      path,
      file: new File([bytes], path.split("/").pop()!),
    })),
    "測試遊戲",
  );
async function session() {
  const s = new ResourceSession(parser);
  const c = catalog();
  await s.initialize(c.sets[0], c.palettes[0].file);
  return s;
}
describe("root discovery", () => {
  test("preserves duplicate map filenames with full paths", () => {
    expect(
      catalog().maps.filter((m) => m.file.name === "100.dat"),
    ).toHaveLength(2);
  });
  test("ignores unrelated data and matches mixed-case pairs", () => {
    const entries = [...syntheticResources()].map(([path, bytes]) => ({
      path: path.replace("Assets/bin", "ASSETS/BIN"),
      file: new File([bytes], path.split("/").pop()!),
    }));
    entries.push({
      path: "Assets/data/save.dat",
      file: new File(["private"], "save.dat"),
    });
    expect(discover(entries, "遊戲").maps).toHaveLength(4);
  });
  test("rejects missing pairs and wrong root", () => {
    expect(() => discover([], "wrong")).toThrow("必要資源");
  });
  test("rejects case collisions instead of overwriting", () => {
    const c = catalog();
    expect(() => discover([c.sets[0].info, c.sets[0].info], "root")).toThrow(
      "大小寫衝突",
    );
  });
});
describe("real WASM bindings", () => {
  test("decodes typed map layers and RGBA palette channels", async () => {
    const s = await session();
    const opened = await s.open(new File([mapBytes(2, 3)], "map.dat"));
    expect(opened.map.header).toMatchObject({ width: 2, height: 3 });
    expect(opened.map.ground).toEqual([1, 1, 1, 1, 1, 1]);
    expect(opened.map.meta).toEqual([0, 1, 2, 3, 4, 0]);
    const tile = await s.decode(1);
    expect(tile.rgba).toHaveLength(64 * 47 * 4);
    expect([
      ...tile.rgba.slice((23 * 64 + 32) * 4, (23 * 64 + 32) * 4 + 4),
    ]).toEqual([115, 145, 91, 255]);
    expect(tile.rgba[3]).toBe(0);
  });
  test("strict parsing rejects extra bytes and malformed maps", async () => {
    const s = await session();
    await expect(
      s.open(new File([mapBytes(1, 1), new Uint8Array(1)], "bad.dat")),
    ).rejects.toContain("TrailingBytes");
    await expect(
      s.open(new File([new Uint8Array(20)], "bad.dat")),
    ).rejects.toThrow("尺寸");
  });
  test("reports missing IDs without discarding the map", async () => {
    const s = await session();
    expect(
      await s.open(new File([mapBytes(2, 2, 999)], "missing.dat")),
    ).toMatchObject({ missing: 1 });
  });
  test("retains duplicate rows with an explicit first-row policy", async () => {
    const c = catalog(),
      info = infoBytes();
    const repeated = new Uint8Array(80);
    repeated.set(info);
    repeated.set(info, 40);
    const s = new ResourceSession(parser);
    expect(
      await s.initialize(
        {
          ...c.sets[0],
          info: { path: "index.bin", file: new File([repeated], "index.bin") },
        },
        c.palettes[0].file,
      ),
    ).toEqual({ count: 1, duplicates: 1 });
    expect((await s.open(c.maps[0].file)).tiles[0].row).toBe(0);
  });
  test("rejects inconsistent RD dimensions before decoding", async () => {
    const c = catalog(),
      bytes = graphicBytes();
    new DataView(bytes.buffer).setInt32(4, 1, true);
    const s = new ResourceSession(parser);
    await s.initialize(
      {
        ...c.sets[0],
        data: { path: "graphic.bin", file: new File([bytes], "graphic.bin") },
      },
      c.palettes[0].file,
    );
    await expect(s.decode(1)).rejects.toThrow("尺寸與 RD header 不符");
  });
  test("excludes out-of-range index addresses", async () => {
    const c = catalog(),
      info = infoBytes(1, 999999);
    const s = new ResourceSession(parser);
    await s.initialize(
      {
        ...c.sets[0],
        info: { path: "index.bin", file: new File([info], "index.bin") },
      },
      c.palettes[0].file,
    );
    expect((await s.open(c.maps[0].file)).invalid).toBe(1);
  });
  test("flips asymmetric source rows for display", async () => {
    const c = catalog();
    const data = graphicBytes(1, 2);
    data.set([16, 17], 16);
    const s = new ResourceSession(parser);
    await s.initialize(
      {
        name: "synthetic",
        info: {
          path: "index.bin",
          file: new File([infoBytes(1, 0, 18, 1, 2)], "index.bin"),
        },
        data: { path: "graphic.bin", file: new File([data], "graphic.bin") },
      },
      c.palettes[0].file,
    );
    expect([...(await s.decode(1)).rgba]).toEqual([
      167, 181, 145, 255, 115, 145, 91, 255,
    ]);
  });
  test("CGP errors are recoverable", async () => {
    const c = catalog(),
      s = new ResourceSession(parser);
    await expect(
      s.initialize(
        c.sets[0],
        new File([paletteBytes().slice(0, 10)], "bad.cgp"),
      ),
    ).rejects.toThrow("CGP");
    await s.initialize(c.sets[0], c.palettes[0].file);
    expect(await s.decode(1)).toBeDefined();
  });
});
describe("projection", () => {
  test("roundtrips rectangular map cell centers in original coordinates", () => {
    for (let y = 0; y < 3; y++)
      for (let x = 0; x < 7; x++) {
        const p = tilePosition(x, y, 7);
        expect(screenTile(p.x, p.y, 7)).toEqual({ x, y });
      }
  });
  test("bounds zoom", () => {
    expect(clampZoom(0)).toBe(0.08);
    expect(clampZoom(10)).toBe(4);
  });
});
