import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { syntheticResources } from "../tests/fixtures";
for (const [path, bytes] of syntheticResources()) {
  const target = resolve(import.meta.dir, "../.generated/fixture-game", path);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, bytes);
}
