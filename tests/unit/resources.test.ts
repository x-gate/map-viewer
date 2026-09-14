import { describe, expect, test, beforeAll } from "bun:test";
import { readFile } from "node:fs/promises";
import { initSync } from "../../.generated/xglib/xglib.js";
import * as bindings from "../../.generated/xglib/xglib.js";
import type * as Contract from "../../.generated/xglib/contract";
import { discover } from "../../src/resources/catalog";
import { readTileInfo } from "../../src/resources/graphic";
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
  test("retains duplicate rows with an explicit last-row policy", async () => {
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
    expect((await s.open(c.maps[0].file)).tiles[0].row).toBe(1);
  });
  test("uses GraphicInfo dimensions and diagnoses inconsistent RD dimensions", async () => {
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
    const tile = await s.decode(1);
    expect(tile.width).toBe(64);
    expect(tile.warnings?.[0]).toContain("GraphicInfo");
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

test("CGTool map grid spacing is 64 x 48, independent of a 47-pixel image", () => {
  const origin = tilePosition(0, 0, 7),
    east = tilePosition(1, 0, 7),
    south = tilePosition(0, 1, 7);
  expect([east.x - origin.x, east.y - origin.y]).toEqual([32, -24]);
  expect([south.x - origin.x, south.y - origin.y]).toEqual([32, 24]);
});
test("GraphicInfo byte 31 marks flat objects without changing their source row", () => {
  const bytes = infoBytes();
  bytes[31] = 1;
  expect(readTileInfo(bytes, 9)).toMatchObject({ row: 9, asGround: true });
  bytes[31] = 2;
  expect(readTileInfo(bytes, 9).asGround).toBe(false);
});
test("map tiles inherit CGP when a high-version record has an empty embedded palette", async () => {
  const c = catalog(),
    s = new ResourceSession(parser);
  const bytes = new Uint8Array(21),
    header = new DataView(bytes.buffer);
  bytes.set([82, 68, 2]);
  header.setInt32(4, 1, true);
  header.setInt32(8, 1, true);
  header.setInt32(12, 21, true);
  bytes[20] = 16;
  await s.initialize(
    {
      name: "empty-palette",
      info: {
        path: "info",
        file: new File([infoBytes(1, 0, 21, 1, 1)], "info"),
      },
      data: { path: "data", file: new File([bytes], "data") },
    },
    c.palettes[0].file,
  );
  expect([...(await s.decode(1)).rgba]).toEqual([115, 145, 91, 255]);
});

test("WASM decodes CGTool long-literal aliases and the corrected fixed colors", async () => {
  const bytes = new Uint8Array(22),
    header = new DataView(bytes.buffer);
  bytes.set([82, 68, 1]);
  header.setInt32(4, 2, true);
  header.setInt32(8, 1, true);
  header.setInt32(12, 21, true);
  bytes.set([0x40, 0, 2, 4, 5, 0x80], 16); // Last byte is outside RD DataLen.
  const c = catalog(),
    s = new ResourceSession(parser);
  await s.initialize(
    {
      name: "rle",
      info: {
        path: "info",
        file: new File([infoBytes(1, 0, 22, 2, 1)], "info"),
      },
      data: { path: "data", file: new File([bytes], "data") },
    },
    c.palettes[0].file,
  );
  expect([...(await s.decode(1)).rgba]).toEqual([
    128, 0, 128, 255, 0, 0, 128, 255,
  ]);
});
