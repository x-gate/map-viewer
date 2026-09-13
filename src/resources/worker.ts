import { initialize, parser } from "./wasm";
import { CandidateLibrary } from "./candidates";
import { ResourceSession } from "./session";
import type { Request, Result } from "./protocol";
const ready = initialize();
const session = new ResourceSession(parser);
const candidates = new CandidateLibrary(parser);
// Serialize file reads and WASM calls; the client terminates this worker on resource changes.
let queue = Promise.resolve();
self.onmessage = ({ data }: MessageEvent<{ id: number; request: Request }>) => {
  queue = queue.then(async () => {
    const { id, request } = data;
    try {
      await ready;
      let result: Result;
      const transfer: Transferable[] = [];
      if (request.kind === "init")
        result = {
          kind: "init",
          ...(await session.initialize(request.set, request.palette)),
        };
      else if (request.kind === "map")
        result = { kind: "map", value: await session.open(request.file) };
      else if (request.kind === "candidate-init") {
        await candidates.initialize(request.sets, request.palette);
        result = { kind: "candidate-init" };
      } else if (request.kind === "candidates") {
        result = {
          kind: "candidates",
          value: await candidates.search(request.mapId, request.offset),
        };
      } else if (request.kind === "candidate-decode") {
        const decoded = await candidates.decode(request.ref);
        result = { kind: "candidate-decode", ...decoded };
        transfer.push(decoded.tile.rgba.buffer);
      } else {
        result = { kind: "tiles", tiles: [], errors: [] };
        for (const mapId of request.ids.slice(0, 32)) {
          try {
            const tile = await session.decode(mapId);
            result.tiles.push(tile);
            transfer.push(tile.rgba.buffer);
          } catch (error) {
            result.errors.push({ mapId, message: String(error) });
          }
        }
      }
      self.postMessage({ id, result }, { transfer });
    } catch (error) {
      self.postMessage({ id, error: String(error) });
    }
  });
};
