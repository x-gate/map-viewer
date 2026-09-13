// Optional read-only integration check. Outputs statistics and hashes, never pixels.
import { readdir, readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { createReadStream } from "node:fs";
import { createHash } from "node:crypto";
import { initSync } from "../.generated/xglib/xglib.js";
import * as bindings from "../.generated/xglib/xglib.js";
import type * as Contract from "../.generated/xglib/contract";
import { discover, type ResourceFile } from "../src/resources/catalog";
import { ResourceSession } from "../src/resources/session";
const root = process.argv[2];
if (!root)
  throw new Error(
    "用法：bun scripts/audit-local.ts <遊戲根目錄> [圖像資源集名稱] [地圖相對路徑]",
  );
const base = resolve(root),
  files: ResourceFile[] = [];
async function walk(path: string) {
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const full = resolve(path, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (entry.isFile())
      files.push({
        path: relative(base, full),
        file: Bun.file(full) as unknown as File,
      });
  }
}
await walk(resolve(base, "Assets/bin"));
await walk(resolve(base, "Assets/map"));
const catalog = discover(files, base);
const set = catalog.sets.find(
  (s) => s.name === (process.argv[3] ?? "Graphic_66"),
);
if (!set) throw new Error("找不到指定圖像資源集。");
const palette =
  catalog.palettes.find((p) => /palet_00.cgp$/i.test(p.path)) ??
  catalog.palettes[0];
const map = catalog.maps.find(
  (m) => m.path === (process.argv[4] ?? "Assets/map/0/1000.dat"),
);
if (!map) throw new Error("找不到指定地圖。");
const inputs = [set.info.path, set.data.path, palette.path, map.path];
async function hashes() {
  return Promise.all(
    inputs.map(async (path) => {
      const hash = createHash("sha256");
      for await (const chunk of createReadStream(resolve(base, path)))
        hash.update(chunk);
      return { path, sha256: hash.digest("hex") };
    }),
  );
}
const before = await hashes();
initSync({
  module: await readFile(
    new URL("../.generated/xglib/xglib_bg.wasm", import.meta.url),
  ),
});
const session = new ResourceSession(bindings as unknown as typeof Contract);
const stats = await session.initialize(set, palette.file);
const opened = await session.open(map.file);
let decoded = 0;
const failures: { mapId: number; error: string }[] = [];
for (const info of opened.tiles) {
  try {
    await session.decode(info.mapId);
    decoded++;
  } catch (error) {
    failures.push({ mapId: info.mapId, error: String(error) });
  }
}
const after = await hashes();
const unchanged = JSON.stringify(before) === JSON.stringify(after);
console.log(
  JSON.stringify(
    {
      catalog: {
        maps: catalog.maps.length,
        sets: catalog.sets.map((s) => s.name),
        palettes: catalog.palettes.length,
      },
      selected: set.name,
      map: map.path,
      width: opened.map.header.width,
      height: opened.map.header.height,
      ...stats,
      missing: opened.missing,
      invalid: opened.invalid,
      decoded,
      failures,
      inputs: before,
      inputsUnchanged: unchanged,
    },
    null,
    2,
  ),
);
if (!unchanged || failures.length || opened.invalid || opened.missing)
  process.exitCode = 1;
