export interface ResourceFile {
  path: string;
  file: File;
}
export interface ResourceSet {
  name: string;
  info: ResourceFile;
  data: ResourceFile;
}
export interface Catalog {
  root: string;
  sets: ResourceSet[];
  palettes: ResourceFile[];
  maps: ResourceFile[];
  warnings: string[];
}
const compare = (a: string, b: string) =>
  a.localeCompare(b, "zh-Hant", { numeric: true });
export function discover(files: ResourceFile[], root: string): Catalog {
  const relevant = files.filter(({ path }) =>
    /^assets\/(bin\/|map\/)/i.test(path),
  );
  const byPath = new Map<string, ResourceFile>();
  for (const entry of relevant) {
    const key = entry.path.toLowerCase();
    if (byPath.has(key)) throw new Error(`檔案路徑大小寫衝突：${entry.path}`);
    byPath.set(key, entry);
  }
  const sets: ResourceSet[] = [];
  const warnings: string[] = [];
  for (const entry of relevant) {
    const match = entry.path.match(/^assets\/bin\/graphicinfo(.*)\.bin$/i);
    if (!match) continue;
    const data = byPath.get(`assets/bin/graphic${match[1]}.bin`.toLowerCase());
    if (data) sets.push({ name: `Graphic${match[1]}`, info: entry, data });
    else warnings.push(`${entry.file.name} 缺少配對的圖像檔。`);
  }
  sets.sort(
    (a, b) =>
      Number(/ex/i.test(a.name)) - Number(/ex/i.test(b.name)) ||
      compare(a.name, b.name),
  );
  const palettes = relevant
    .filter(({ path }) => /^assets\/bin\/pal\/[^/]+\.cgp$/i.test(path))
    .sort((a, b) => compare(a.path, b.path));
  const maps = relevant
    .filter(({ path }) => /^assets\/map\/.+\.dat$/i.test(path))
    .sort((a, b) => compare(a.path, b.path));
  const missing = [
    !sets.length && "Assets/bin/GraphicInfo*.bin 與配對的 Graphic*.bin",
    !palettes.length && "Assets/bin/pal/*.cgp",
    !maps.length && "Assets/map/**/*.dat",
  ].filter(Boolean);
  if (missing.length)
    throw new Error(
      `找不到必要資源：${missing.join("、")}。請選擇包含 Assets 的遊戲根目錄。`,
    );
  return { root, sets, palettes, maps, warnings };
}
export function fromFileList(files: FileList | File[]): {
  root: string;
  files: ResourceFile[];
} {
  const list = Array.from(files);
  const root = list[0]?.webkitRelativePath.split("/")[0] ?? "";
  if (!root) throw new Error("無法取得資料夾路徑，請重新選擇遊戲根目錄。");
  return {
    root,
    files: list.map((file) => ({
      file,
      path: file.webkitRelativePath.split("/").slice(1).join("/"),
    })),
  };
}
