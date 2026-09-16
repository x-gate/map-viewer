import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import {
  syntheticResources,
  candidateResources,
  coordinateResources,
} from "../tests/fixtures";
for (const [name, resources] of [
  ["fixture-game", syntheticResources()],
  ["fixture-candidates", candidateResources()],
  ["fixture-coordinates", coordinateResources()],
] as const) {
  for (const [path, bytes] of resources) {
    const target = resolve(import.meta.dir, `../.generated/${name}`, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, bytes);
  }
}
