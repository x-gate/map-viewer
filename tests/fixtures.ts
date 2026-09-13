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
