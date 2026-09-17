import { beforeAll, expect, test } from "bun:test";
import { initSync } from "../../.generated/xglib/xglib.js";
import * as bindings from "../../.generated/xglib/xglib.js";
import type * as Contract from "../../.generated/xglib/contract";
import { readNpcs, npcsForMap } from "../../src/resources/npc";
import { NpcResources } from "../../src/resources/npc-appearance";
import { discover } from "../../src/resources/catalog";
import { npcLine, npcResources, infoBytes } from "../fixtures";
const parser = bindings as unknown as typeof Contract;
beforeAll(async () =>
  initSync({
    module: await Bun.file(
      new URL("../../.generated/xglib/xglib_bg.wasm", import.meta.url),
    ).arrayBuffer(),
  }),
);
test("NPC parser preserves empty columns, comments, duplicate IDs and source lines", async () => {
  const result = await readNpcs(
    new File(
      [`\uFEFF# 註解\r\n${npcLine({ name: "" })}\r\n${npcLine()}\ninvalid`],
      "npc.txt",
    ),
  );
  expect(result.encoding).toBe("utf-8");
  expect(result.records).toHaveLength(2);
  expect(result.records[0]).toMatchObject({
    name: "",
    id: 7,
    line: 2,
    x: 2,
    y: 2,
    image: 900,
    direction: 6,
  });
  expect(result.warnings[0]).toContain("第 4 行");
  const f = npcLine().split("\t");
  f[19] = "";
  f[20] = "";
  const empty = await readNpcs(new File([f.join("\t")], "npc.txt"));
  expect(empty.records[0]).toMatchObject({ image: -1, direction: -1 });
  expect(empty.warnings).toHaveLength(2);
});
test("NPC parser decodes GBK and supports explicit Big5 without replacing names", async () => {
  const fields = npcLine({ name: "PLACEHOLDER" }).split("PLACEHOLDER");
  const gbk = await readNpcs(
    new File(
      [fields[0], new Uint8Array([0xb2, 0xe2, 0xca, 0xd4]), fields[1]],
      "npc.txt",
    ),
  );
  expect(gbk.encoding).toBe("gb18030");
  expect(gbk.records[0].name).toBe("测试");
  const big5 = await readNpcs(
    new File(
      [fields[0], new Uint8Array([0xb4, 0xfa, 0xb8, 0xd5]), fields[1]],
      "npc.txt",
    ),
    "big5",
  );
  expect(big5.records[0].name).toBe("測試");
  await expect(readNpcs(new File(["bad"], "npc.txt"))).rejects.toThrow(
    "沒有可讀取",
  );
});
test("NPC matching respects map type, floor, bounds and duplicate filenames", async () => {
  const records = (
    await readNpcs(new File([npcResources().get("npc.txt")!], "npc.txt"))
  ).records;
  const match = npcsForMap(records, "Assets/map/0/100.dat", 12, 10);
  expect(match.records).toHaveLength(4);
  expect(match.outside).toBe(1);
  expect(
    npcsForMap(records, "Assets/map/1/100.dat", 12, 10).records[0].name,
  ).toBe("另一類型");
  expect(
    npcsForMap(records, "Assets/map/0/200.dat", 8, 8).records,
  ).toHaveLength(1);
});
function catalog(files = npcResources()) {
  return discover(
    [...files].map(([path, bytes]) => ({
      path,
      file: new File([bytes], path.split("/").pop()!),
    })),
    "原創測試",
  );
}
test("discovers nested Anime pairs in the same folder", () => {
  const files = npcResources();
  files.set(
    "Assets/bin/Puk2/AnimeInfo_1.bin",
    files.get("Assets/bin/AnimeInfo_1.bin")!,
  );
  files.set(
    "Assets/bin/Puk2/Anime_1.bin",
    files.get("Assets/bin/Anime_1.bin")!,
  );
  expect(catalog(files).animes.map((s) => s.name)).toEqual([
    "Anime_1",
    "Puk2/Anime_1",
  ]);
});
test("NPC appearance resolves static serials and animated graphic IDs with real WASM", async () => {
  const c = catalog(),
    lib = new NpcResources(parser);
  await lib.initialize(c.sets[0], c.animes[0], c.palettes[0].file);
  const still = await lib.appearance(900, 6);
  expect(still.frames).toHaveLength(1);
  expect(still.images[0]).toMatchObject({
    width: 20,
    height: 36,
    offX: -10,
    offY: -36,
  });
  const anime = await lib.appearance(100900, 6);
  expect(anime.frames.map((f) => f.image)).toEqual([0, 1]);
  expect(anime.interval).toBe(200);
  expect(anime.images[0].rgba).not.toEqual(anime.images[1].rgba);
  expect(anime.images[0].rgba[3]).toBe(0);
  expect((await lib.appearance(100900, 2)).warnings[0]).toContain("沒有面向 2");
  await expect(lib.appearance(0, 0)).rejects.toThrow("無可見造型");
  await expect(lib.appearance(777777, 0)).rejects.toThrow("找不到造型");
  await lib.initialize(c.sets[0], undefined, c.palettes[0].file);
  await expect(lib.appearance(100900, 6)).rejects.toThrow("找不到造型");
});
test("NPC animation rejects truncated frames and does not confuse map_id with graphic ID", async () => {
  const files = npcResources(),
    bad = files.get("Assets/bin/Anime_1.bin")!;
  new DataView(bad.buffer).setInt32(12, 900, true);
  const c = catalog(files),
    lib = new NpcResources(parser);
  await lib.initialize(c.sets[0], c.animes[0], c.palettes[0].file);
  await expect(lib.appearance(100900, 6)).rejects.toThrow("Graphic ID 900");
  files.set("Assets/bin/Anime_1.bin", bad.slice(0, 20));
  const truncated = catalog(files);
  await lib.initialize(
    truncated.sets[0],
    truncated.animes[0],
    truncated.palettes[0].file,
  );
  await expect(lib.appearance(100900, 6)).rejects.toThrow("影格長度");
});

test("extended NPC animations use the last ID row, mirror flags and a hidden palette", async () => {
  const files = npcResources(),
    original = files.get("Assets/bin/Anime_1.bin")!;
  const extended = new Uint8Array(45);
  extended.set(original.subarray(0, 12));
  extended.set(original.subarray(12), 20);
  const header = new DataView(extended.buffer);
  header.setInt16(14, 3, true);
  header.setInt32(16, -1, true);
  files.set("Assets/bin/Anime_1.bin", extended); // Ignore five bytes of container tail.
  const index = new Uint8Array(24);
  index.set(files.get("Assets/bin/AnimeInfo_1.bin")!);
  index.set(index.subarray(0, 12), 12);
  new DataView(index.buffer).setInt16(8, 0, true);
  files.set("Assets/bin/AnimeInfo_1.bin", index);
  const palette = new Uint8Array(54);
  palette.set([29, 71, 203], 17 * 3);
  const hidden = new Uint8Array(20 + palette.length),
    v = new DataView(hidden.buffer);
  hidden.set([82, 68, 2]);
  v.setInt32(12, hidden.length, true);
  v.setInt32(16, palette.length, true);
  hidden.set(palette, 20);
  const old = files.get("Assets/bin/Graphic_1.bin")!,
    data = new Uint8Array(old.length + hidden.length);
  data.set(old);
  data.set(hidden, old.length);
  const oldInfo = files.get("Assets/bin/GraphicInfo_1.bin")!,
    info = new Uint8Array(oldInfo.length + 40);
  info.set(oldInfo);
  info.set(infoBytes(100900, old.length, hidden.length, 0, 0), oldInfo.length);
  files.set("Assets/bin/Graphic_1.bin", data);
  files.set("Assets/bin/GraphicInfo_1.bin", info);
  const c = catalog(files),
    lib = new NpcResources(parser);
  await lib.initialize(c.sets[0], c.animes[0], c.palettes[0].file);
  const result = await lib.appearance(100900, 6);
  expect(result.source).toContain("列 1");
  expect(result.frames[0]).toMatchObject({ flipX: true, flipY: true });
  const offset = (18 * 20 + 10) * 4;
  expect([...result.images[0].rgba.slice(offset, offset + 4)]).toEqual([
    203, 71, 29, 255,
  ]);
  expect(result.images[0].rgba[3]).toBe(0);
});
