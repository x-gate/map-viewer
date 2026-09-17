export interface NpcRecord {
  line: number;
  type: string;
  name: string;
  id: number;
  mapType: number;
  floor: number;
  x: number;
  y: number;
  positions: number[];
  direction: number;
  image: number;
}
export interface NpcFile {
  records: NpcRecord[];
  encoding: string;
  warnings: string[];
}
export async function readNpcs(
  file: File,
  encoding = "auto",
): Promise<NpcFile> {
  if (file.size > 8 * 1024 * 1024) throw new Error("NPC 檔案不得超過 8 MiB。");
  const bytes = await file.arrayBuffer();
  let text: string;
  if (encoding === "auto") {
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      encoding = "utf-8";
    } catch {
      text = new TextDecoder("gb18030", { fatal: true }).decode(bytes);
      encoding = "gb18030";
    }
  } else text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  const records: NpcRecord[] = [],
    warnings: string[] = [];
  for (const [i, line] of text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .entries()) {
    if (!line.trim() || /^\s*(#|\/\/)/.test(line)) continue;
    const fields = line.split("\t"); // Empty names are meaningful: never split on whitespace.
    try {
      if (fields.length !== 25) throw new Error("需要 25 個 Tab 分隔欄位");
      const number = (column: number) => {
        const raw = fields[column].trim();
        if (!/^\d+$/.test(raw) || !Number.isSafeInteger(Number(raw)))
          throw new Error(`第 ${column + 1} 欄不是非負整數`);
        return Number(raw);
      };
      const positions = Array.from({ length: 8 }, (_, j) => number(9 + j));
      const appearanceNumber = (column: number) => {
        if (fields[column].trim()) return number(column);
        warnings.push(
          `第 ${i + 1} 行：第 ${column + 1} 欄未指定，保留 NPC 與位置診斷。`,
        );
        return -1;
      };
      const record = {
        line: i + 1,
        type: fields[0].trim(),
        name: fields[1].trim(),
        id: number(3),
        mapType: number(7),
        floor: number(8),
        x: positions[0],
        y: positions[1],
        positions,
        direction: appearanceNumber(19),
        image: appearanceNumber(20),
      };
      if (!record.type) throw new Error("缺少 NPC 類型");
      records.push(record);
    } catch (error) {
      warnings.push(`第 ${i + 1} 行：${String(error)}`);
    }
  }
  if (!records.length)
    throw new Error(`沒有可讀取的 NPC。${warnings.slice(0, 3).join("；")}`);
  return { records, encoding, warnings };
}
export function npcsForMap(
  records: NpcRecord[],
  path: string,
  width: number,
  height: number,
) {
  const match = path.match(/^assets\/map\/(\d+)\/(?:.*\/)?(\d+)\.dat$/i);
  const matched = match
    ? records.filter(
        (n) => n.mapType === Number(match[1]) && n.floor === Number(match[2]),
      )
    : [];
  return {
    records: matched.filter((n) => n.x < width && n.y < height),
    outside: matched.filter((n) => n.x >= width || n.y >= height).length,
  };
}
