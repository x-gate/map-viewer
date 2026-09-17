// Entirely original synthetic resource bytes; no game files or extracted assets.
export function mapBytes(width = 12, height = 10, tile = 1) {
  const bytes = new Uint8Array(20 + width * height * 6);
  bytes.set([77, 65, 80]);
  const view = new DataView(bytes.buffer);
  view.setUint32(12, width, true);
  view.setUint32(16, height, true);
  for (let i = 0; i < width * height; i++) {
    view.setUint16(20 + i * 2, tile, true);
    view.setUint16(20 + width * height * 2 + i * 2, i % 17 === 0 ? 2 : 0, true);
    view.setUint16(20 + width * height * 4 + i * 2, i % 5, true);
  }
  return bytes;
}
export function graphicBytes(width = 64, height = 47, index = 16) {
  const bytes = new Uint8Array(16 + width * height);
  bytes.set([82, 68, 0, 0]);
  const view = new DataView(bytes.buffer);
  view.setInt32(4, width, true);
  view.setInt32(8, height, true);
  view.setInt32(12, bytes.length, true);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      if (
        Math.abs((x + 0.5 - width / 2) / (width / 2)) +
          Math.abs((y + 0.5 - height / 2) / (height / 2)) <=
        1
      )
        bytes[16 + y * width + x] = index;
    }
  return bytes;
}
export function infoBytes(
  id = 1,
  addr = 0,
  length = 16 + 64 * 47,
  width = 64,
  height = 47,
) {
  const bytes = new Uint8Array(40),
    view = new DataView(bytes.buffer);
  view.setInt32(0, id, true);
  view.setUint32(4, addr, true);
  view.setInt32(8, length, true);
  // GraphicInfo offsets already position the image relative to its cell center.
  view.setInt32(12, -32, true);
  view.setInt32(16, -24, true);
  view.setInt32(20, width, true);
  view.setInt32(24, height, true);
  bytes[28] = 1;
  bytes[29] = 1;
  view.setInt32(36, id, true);
  return bytes;
}
export function paletteBytes() {
  const bytes = new Uint8Array(708);
  bytes.set([91, 145, 115, 145, 181, 167]);
  return bytes;
}
export function syntheticResources() {
  const a = graphicBytes(),
    b = graphicBytes(64, 47, 17);
  const info = new Uint8Array(80);
  info.set(infoBytes());
  info.set(infoBytes(2, a.length, b.length), 40);
  const data = new Uint8Array(a.length + b.length);
  data.set(a);
  data.set(b, a.length);
  return new Map<string, Uint8Array>([
    ["Assets/bin/GraphicInfo_1.bin", info],
    ["Assets/bin/Graphic_1.bin", data],
    ["Assets/bin/pal/palet_00.cgp", paletteBytes()],
    ["Assets/map/0/100.dat", mapBytes()],
    ["Assets/map/1/100.dat", mapBytes(8, 6)],
    ["Assets/map/0/200.dat", mapBytes(8, 8, 999)],
    ["Assets/map/0/broken.dat", new Uint8Array(20)],
  ]);
}

export function candidateResources() {
  const files = syntheticResources();
  const records: Uint8Array[] = [];
  const index = new Uint8Array(15 * 40);
  let address = 0;
  for (let row = 0; row < 15; row++) {
    const data = graphicBytes(32 + row * 2, 47, row % 2 ? 16 : 17);
    if (row === 14) data[0] = 0; // Valid index, malformed image payload.
    const info = infoBytes(
      2,
      row === 13 ? 999999 : address,
      data.length,
      32 + row * 2,
      47,
    );
    new DataView(info.buffer).setInt32(0, 100 + row, true); // graphic id is not the map id.
    index.set(info, row * 40);
    records.push(data);
    address += data.length;
  }
  const data = new Uint8Array(address);
  let offset = 0;
  for (const record of records) {
    data.set(record, offset);
    offset += record.length;
  }
  files.set("Assets/bin/GraphicInfo_2.bin", index);
  files.set("Assets/bin/Graphic_2.bin", data);
  files.set("Assets/bin/GraphicInfo_3.bin", infoBytes(2));
  files.set("Assets/bin/Graphic_3.bin", graphicBytes());
  files.set("Assets/bin/GraphicInfo_bad.bin", new Uint8Array(41));
  files.set("Assets/bin/Graphic_bad.bin", new Uint8Array(20));
  return files;
}

export function coordinateResources() {
  const files = syntheticResources();
  for (const path of files.keys())
    if (path.startsWith("Assets/map/")) files.delete(path);
  const map = mapBytes(30, 30);
  const data = new DataView(map.buffer);
  const objectStart = 20 + 30 * 30 * 2;
  map.fill(0, objectStart, objectStart + 30 * 30 * 2);
  // Original synthetic marker at the reported coordinate; no game assets copied.
  data.setUint16(objectStart + (16 * 30 + 19) * 2, 2, true);
  files.set("Assets/map/0/1011.dat", map);
  return files;
}

export function npcLine(
  overrides: {
    name?: string;
    id?: number;
    mapType?: number;
    floor?: number;
    x?: number;
    y?: number;
    image?: number;
    direction?: number;
  } = {},
) {
  const n = {
    name: "原創測試嚮導",
    id: 7,
    mapType: 0,
    floor: 100,
    x: 2,
    y: 2,
    image: 900,
    direction: 6,
    ...overrides,
  };
  return [
    "Guide",
    n.name,
    0,
    n.id,
    0,
    1,
    1,
    n.mapType,
    n.floor,
    n.x,
    n.y,
    n.x,
    n.y,
    n.x,
    n.y,
    n.x,
    n.y,
    1,
    1000,
    n.direction,
    n.image,
    0,
    1,
    0,
    "",
  ].join("\t");
}
export function npcResources() {
  const files = syntheticResources();
  const info = new Uint8Array(160),
    old = files.get("Assets/bin/Graphic_1.bin")!;
  info.set(files.get("Assets/bin/GraphicInfo_1.bin")!);
  const first = graphicBytes(20, 36, 17),
    second = graphicBytes(20, 36, 16);
  for (let row = 2; row < 4; row++) {
    const entry = infoBytes(
      900 + row - 2,
      old.length + (row - 2) * first.length,
      first.length,
      20,
      36,
    );
    const view = new DataView(entry.buffer);
    view.setInt32(0, 500 + row - 2, true);
    view.setInt32(12, -10, true);
    view.setInt32(16, -36, true);
    info.set(entry, row * 40);
  }
  const data = new Uint8Array(old.length + first.length + second.length);
  data.set(old);
  data.set(first, old.length);
  data.set(second, old.length + first.length);
  files.set("Assets/bin/GraphicInfo_1.bin", info);
  files.set("Assets/bin/Graphic_1.bin", data);
  const animeInfo = new Uint8Array(12),
    index = new DataView(animeInfo.buffer);
  index.setInt32(0, 100900, true);
  index.setInt16(8, 1, true);
  const anime = new Uint8Array(32),
    header = new DataView(anime.buffer);
  header.setInt16(0, 6, true);
  header.setInt16(2, 0, true);
  header.setInt32(4, 400, true);
  header.setInt32(8, 2, true);
  header.setInt32(12, 500, true);
  header.setInt32(22, 501, true);
  files.set("Assets/bin/AnimeInfo_1.bin", animeInfo);
  files.set("Assets/bin/Anime_1.bin", anime);
  files.set(
    "npc.txt",
    new TextEncoder().encode(
      [
        npcLine(),
        npcLine({ name: "動畫嚮導", id: 8, x: 4, image: 100900 }),
        npcLine({ name: "缺少造型", id: 9, x: 6, image: 777777 }),
        npcLine({ name: "", id: 10, x: 8, image: 0 }),
        npcLine({ name: "另一圖", id: 11, floor: 200, x: 1, y: 1 }),
        npcLine({ name: "超界", id: 12, x: 100 }),
        npcLine({ name: "另一類型", id: 13, mapType: 1 }),
      ].join("\n"),
    ),
  );
  return files;
}
