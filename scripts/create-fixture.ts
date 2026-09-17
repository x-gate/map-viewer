import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  syntheticResources,
  candidateResources,
  coordinateResources,
  npcResources,
} from "../tests/fixtures";
for (const [name, resources] of [
  ["fixture-game", syntheticResources()],
  ["fixture-candidates", candidateResources()],
  ["fixture-coordinates", coordinateResources()],
  ["fixture-npcs", npcResources()],
] as const) {
  for (const [path, bytes] of resources) {
    const target = resolve(import.meta.dir, `../.generated/${name}`, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
}
