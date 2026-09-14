import "./style.css";
import { discover, fromFileList, type Catalog } from "./resources/catalog";
import {
  directoryPicker,
  savedDirectory,
  scanDirectory,
  type DirectoryHandle,
} from "./resources/directory";
import { ResourceClient } from "./resources/client";
import { MapView } from "./viewer/map-view";
import { CandidatePanel } from "./viewer/candidate-panel";

const mark = `<svg viewBox="0 0 36 40" fill="none" aria-hidden="true"><path d="M18 2 34 11 18 20 2 11Z" stroke="currentColor" stroke-width="2"/><path d="m2 19 16 9 16-9M2 27l16 9 16-9" stroke="currentColor" stroke-width="2"/></svg>`;
document.querySelector<HTMLDivElement>("#app")!.innerHTML = `
  <header class="app-header"><a class="brand" href="./" aria-label="x-gate 地圖檢視器首頁">${mark}<span>x-gate <span class="brand-divider">/</span> <span class="brand-sub">地圖檢視器</span></span></a><div class="header-actions"><span class="local-badge"><i></i> 本機讀取</span><button id="change-folder" class="button secondary">選擇遊戲資料夾</button></div></header>
  <div class="workspace">
    <aside class="sidebar" aria-label="地圖瀏覽"><div class="sidebar-heading"><span>地圖瀏覽</span><span id="map-count" class="count">0</span></div>
      <label class="search"><span aria-hidden="true">⌕</span><input id="search" type="search" placeholder="搜尋地圖編號或路徑…" aria-label="搜尋地圖編號或路徑" disabled><kbd>/</kbd></label>
      <div class="list-heading"><span>地圖檔案</span><span id="result-count">尚未載入</span></div>
      <div id="map-list" class="map-list"><div class="sidebar-empty">${mark}<p>你的下一段旅程，<br>從一張地圖開始。</p><small>選擇資料夾後，即可瀏覽地圖。</small></div></div>
      <div class="source-card"><span class="eyebrow">目前的資料夾</span><strong id="folder-name">尚未選擇</strong><span id="source-summary">遊戲資源只會在你的裝置上讀取</span><button id="forget-folder" class="text-button" hidden>忘記資料夾</button></div>
    </aside>
    <main class="main-panel">
      <div class="map-toolbar"><div class="map-title"><span class="eyebrow" id="map-path">地圖工作區</span><h1 id="map-title">尚未開啟地圖</h1></div><div class="view-controls"><button class="icon-button" id="zoom-out" aria-label="縮小" disabled>−</button><button id="zoom-value" class="zoom-value" title="原始比例" disabled>100%</button><button class="icon-button" id="zoom-in" aria-label="放大" disabled>＋</button><span class="separator"></span><button id="fit" class="button secondary" disabled>⊡ 適合視窗</button></div></div>
      <div id="viewport" class="viewport">
        <section id="welcome" class="welcome" aria-labelledby="welcome-title">
          <div class="welcome-art" aria-hidden="true"><svg viewBox="0 0 280 176" fill="none"><path d="m140 152-113-65L140 22l113 65Z" stroke="#304840"/><path d="m140 136-84-49 84-49 84 49Z" fill="#1a302a" stroke="#48685b"/><path d="m140 117-56-32 56-32 56 32Z" fill="#294d40" stroke="#73aa90"/><path d="m84 85 56 32 56-32v15l-56 32-56-32Z" fill="#203d33" stroke="#48685b"/><path d="m140 53 28 16-28 17-28-17Z" fill="#91d7ae"/><path d="m112 69 28 17v21l-28-16Z" fill="#46765e"/><path d="m140 86 28-17v22l-28 16Z" fill="#669b7c"/><path d="M140 22V6m113 81h18M27 87H9m131 65v16" stroke="#517063"/><circle cx="140" cy="6" r="3" fill="#a4d6ba"/></svg></div>
          <span class="eyebrow accent">探索熟悉的世界</span><h2 id="welcome-title">每一張地圖，都是旅程的起點。</h2><p class="welcome-description">選擇你的《魔力寶貝》遊戲資料夾，<br>在瀏覽器裡探索地形、建築與每一個角落。</p>
          <button id="choose-folder" class="button primary">選擇遊戲資料夾 <span aria-hidden="true">↗</span></button><button id="resume-folder" class="button secondary" hidden>繼續使用上次的資料夾</button>
          <button id="compatible-picker" class="text-button">改用相容模式選取資料夾</button><div id="setup" class="setup" hidden><div class="setup-heading"><span class="accent">✓ 資源已就緒</span><span id="setup-count"></span></div><div class="setup-fields"><label>圖像資源集<select id="resource-set"></select></label><label>調色盤<select id="palette"></select></label></div><p class="hint">不同資源集分開檢視，可切換比對缺少的圖塊。</p><button id="start" class="button primary">開啟地圖檢視器 →</button></div>
          <div class="welcome-notes"><span>01 選擇含 Assets 的根目錄</span><span>02 自動辨識資源</span><span>03 開啟地圖</span></div><p class="privacy-note">資源不會上傳，也不會修改原始檔案。</p>
        </section>
        <fieldset id="layers" class="layer-controls" hidden><legend>顯示圖層</legend><label><input id="ground" type="checkbox" checked>地表</label><label><input id="objects" type="checkbox" checked>物件</label><label><input id="grid" type="checkbox">格線</label></fieldset>
        <div id="map-info" class="map-info" hidden><span class="eyebrow">地圖資訊</span><div id="dimensions">—</div><p id="cell-info">點選地圖，查看格位資料</p></div>
        <div id="busy" class="busy" role="status" hidden><span class="spinner"></span><span id="busy-text">正在載入…</span><button id="cancel" class="text-button">取消</button></div>
        <div id="message" class="message" role="alert" hidden><span id="message-text"></span><button id="dismiss-message" class="icon-button" aria-label="關閉訊息">×</button></div>
      </div>
      <div class="bottom-bar"><span id="status" role="status">準備好探索了嗎？</span><span class="navigation-hint">拖曳平移 <span>·</span> 滾輪縮放 <span>·</span> 點選格位</span><button id="diagnostics-button" class="text-button" hidden>檢視診斷</button></div>
    </main>
  </div>
  <footer class="app-footer"><span>非官方地圖研究工具 · 遊戲名稱與商標屬各權利人</span><span>PixiJS <span class="footer-dot">＋</span> xglib WASM</span></footer>
  <input id="folder-input" type="file" webkitdirectory multiple hidden aria-label="選擇遊戲根目錄">
  <dialog id="diagnostics"><div class="dialog-title"><h2>資源診斷</h2><button id="close-diagnostics" class="icon-button" aria-label="關閉診斷">×</button></div><p>缺少或解碼失敗的圖塊以粉色菱形標示。重複圖塊採用所選資源集的最後一筆索引列，此為檢視器的暫定策略。</p><pre id="diagnostics-text"></pre><p class="hint">原始中繼資料（meta）的玩法語意尚未驗證，不視為碰撞判定。</p></dialog>`;

const el = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.getElementById(id) as T;
const button = (id: string) => el<HTMLButtonElement>(id);
const select = (id: string) => el<HTMLSelectElement>(id);
const view = new MapView(el("viewport"));
const candidatePanel = new CandidatePanel(el("viewport"), view);
candidatePanel.onVisibility = (visible) => {
  el("map-info").hidden = visible || !active;
};
let rendererReady: Promise<void> | undefined;
let catalog: Catalog | undefined;
let client: ResourceClient | undefined;
let saved: DirectoryHandle | undefined;
let selectedPath = "";
let operation = 0;
let diagnostics = "";
let active = false;
let working = false;

function message(text: string) {
  el("message-text").textContent = text;
  el("message").hidden = false;
}
function busy(text?: string) {
  working = !!text;
  el("busy").hidden = !text;
  el("busy-text").textContent = text ?? "";
  button("start").disabled = !!text;
}
function cancel() {
  candidatePanel.dispose();
  operation++;
  client?.dispose();
  client = undefined;
  active = false;
  selectedPath = "";
  if (rendererReady) view.clear();
  busy();
  el("diagnostics-button").hidden = true;
  el("welcome").hidden = false;
  el("layers").hidden = true;
  el("map-info").hidden = true;
  el("map-title").textContent = "尚未開啟地圖";
  el("map-path").textContent = "地圖工作區";
  for (const id of ["zoom-in", "zoom-out", "zoom-value", "fit"])
    button(id).disabled = true;
  el("status").textContent = "選擇資源後即可開始。";
  renderList();
}
function useCatalog(value: Catalog) {
  cancel();
  catalog = value;
  el("folder-name").textContent = value.root;
  el("source-summary").textContent =
    `${value.maps.length} 張地圖 · ${value.sets.length} 組圖像資源`;
  el("setup-count").textContent = `${value.maps.length} 張地圖`;
  select("resource-set").replaceChildren(
    ...value.sets.map((set, i) => new Option(set.name, String(i))),
  );
  select("palette").replaceChildren(
    ...value.palettes.map((p, i) => new Option(p.file.name, String(i))),
  );
  el("setup").hidden = false;
  el("choose-folder").hidden = true;
  el("resume-folder").hidden = true;
  el<HTMLInputElement>("search").disabled = false;
  el("map-count").textContent = String(value.maps.length);
  el("message").hidden = true;
  if (value.warnings.length) message(value.warnings.join("\n"));
  renderList();
}
async function importHandle(handle: DirectoryHandle) {
  cancel();
  const token = ++operation;
  busy("正在尋找地圖與圖像資源…");
  try {
    const files = await scanDirectory(handle);
    if (token !== operation) return;
    useCatalog(discover(files, handle.name));
    saved = handle;
    try {
      await savedDirectory(handle);
      el("forget-folder").hidden = false;
    } catch {
      message("已載入資料夾；瀏覽器無法記住存取權限，下次請重新選擇。");
    }
  } catch (error) {
    if (token === operation) message(String(error));
  } finally {
    if (token === operation) busy();
  }
}
async function chooseFolder() {
  if (!directoryPicker) {
    el<HTMLInputElement>("folder-input").click();
    return;
  }
  try {
    const handle = await directoryPicker({ mode: "read", id: "x-gate-game" });
    await importHandle(handle);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === "AbortError")) {
      message("無法開啟資料夾選擇器，請改用檔案選取方式。");
      el<HTMLInputElement>("folder-input").click();
    }
  }
}
button("choose-folder").onclick = () => void chooseFolder();
button("compatible-picker").onclick = () =>
  el<HTMLInputElement>("folder-input").click();
button("change-folder").onclick = () => void chooseFolder();
el<HTMLInputElement>("folder-input").onchange = (event) => {
  const input = event.currentTarget as HTMLInputElement;
  try {
    const source = fromFileList(input.files!);
    useCatalog(discover(source.files, source.root));
  } catch (error) {
    message(String(error));
  }
  input.value = "";
};
button("resume-folder").onclick = async () => {
  if (!saved) return;
  try {
    if ((await saved.requestPermission({ mode: "read" })) !== "granted") {
      message("尚未取得讀取權限，請重新選擇資料夾或再次授權。");
      return;
    }
    await importHandle(saved);
  } catch {
    message("無法重新開啟上次的資料夾，請重新選擇。");
  }
};
button("forget-folder").onclick = async () => {
  try {
    await savedDirectory(null);
    saved = undefined;
    cancel();
    catalog = undefined;
    el("setup").hidden = true;
    el("choose-folder").hidden = false;
    el("forget-folder").hidden = true;
    el("resume-folder").hidden = true;
    el("folder-name").textContent = "尚未選擇";
    el("source-summary").textContent = "遊戲資源只會在你的裝置上讀取";
    el("map-count").textContent = "0";
    el<HTMLInputElement>("search").disabled = true;
    renderList();
  } catch {
    message("無法清除瀏覽器儲存的資料夾記錄，請在網站設定清除資料。");
  }
};
function renderList() {
  const list = el("map-list");
  if (!catalog) {
    list.replaceChildren();
    el("result-count").textContent = "尚未載入";
    return;
  }
  const query = el<HTMLInputElement>("search").value.trim().toLowerCase();
  const matches = catalog.maps.filter((map) =>
    map.path.toLowerCase().includes(query),
  );
  el("result-count").textContent = `${matches.length} 個結果`;
  const fragment = document.createDocumentFragment();
  for (const map of matches) {
    const entry = document.createElement("button");
    entry.className = "map-entry";
    entry.setAttribute("aria-current", String(map.path === selectedPath));
    entry.title = map.path;
    entry.disabled = !active;
    const icon = document.createElement("span");
    icon.className = "map-file-icon";
    icon.textContent = "◇";
    const body = document.createElement("span");
    const name = document.createElement("strong");
    name.textContent = map.file.name.replace(/\.dat$/i, "");
    const path = document.createElement("small");
    path.textContent = map.path.replace(/^assets\/map\//i, "");
    body.append(name, path);
    entry.append(icon, body);
    entry.onclick = () => void openMap(map.path);
    fragment.append(entry);
  }
  if (!matches.length) {
    const empty = document.createElement("p");
    empty.className = "no-results";
    empty.textContent = "沒有符合的地圖，試試其他編號或路徑。";
    fragment.append(empty);
  }
  list.replaceChildren(fragment);
}
async function start() {
  if (!catalog || working) return;
  cancel();
  const token = ++operation;
  const current = new ResourceClient();
  client = current;
  busy("正在準備圖像索引與地圖畫布…");
  try {
    rendererReady ??= view.initialize().catch((error) => {
      rendererReady = undefined;
      throw error;
    });
    await Promise.all([
      rendererReady,
      current.request({
        kind: "init",
        set: catalog.sets[Number(select("resource-set").value)],
        palette: catalog.palettes[Number(select("palette").value)].file,
      }),
    ]);
    if (token !== operation) return;
    active = true;
    candidatePanel.configure(
      catalog.sets,
      catalog.palettes[Number(select("palette").value)].file,
    );
    busy();
    el("welcome").hidden = true;
    el("layers").hidden = false;
    el("map-info").hidden = false;
    for (const id of ["zoom-in", "zoom-out", "zoom-value", "fit"])
      button(id).disabled = false;
    renderList();
    await openMap(catalog.maps[0].path);
  } catch (error) {
    if (token === operation) {
      busy();
      current.dispose();
      message(`無法啟動檢視器：${String(error)}`);
    }
  }
}
async function openMap(path: string) {
  const file = catalog?.maps.find((m) => m.path === path);
  if (!file || !client || !active) return;
  const token = ++operation;
  busy(`正在開啟 ${file.file.name}…`);
  el("message").hidden = true;
  try {
    const result = await client.request({ kind: "map", file: file.file });
    if (token !== operation || result.kind !== "map") return;
    selectedPath = path;
    view.open(result.value, client);
    const { width, height } = result.value.map.header;
    el("map-title").textContent =
      `地圖 ${file.file.name.replace(/\.dat$/i, "")}`;
    el("map-path").textContent = path;
    el("dimensions").textContent = `${width} × ${height} 格`;
    el("cell-info").textContent = "點選地圖，查看格位資料";
    diagnostics = [
      `地圖：${path}`,
      `資源集：${catalog!.sets[Number(select("resource-set").value)].name}`,
      `調色盤：${catalog!.palettes[Number(select("palette").value)].file.name}`,
      `未對應的圖塊 ID：${result.value.missing}`,
      `無效圖像索引：${result.value.invalid}`,
      `資源集的重複 map_id 索引列：${result.value.duplicates}`,
    ].join("\n");
    el("diagnostics-button").hidden = false;
    if (result.value.missing || result.value.invalid)
      message(
        `這張地圖有 ${result.value.missing} 種圖塊未對應、${result.value.invalid} 種圖塊索引無效。可點選格位搜尋跨資源集候選並試放。`,
      );
    button("change-folder").textContent = "資源設定";
    button("change-folder").onclick = () => {
      cancel();
      el("choose-folder").hidden = false;
    };
    renderList();
  } catch (error) {
    if (token === operation)
      message(`無法開啟 ${file.file.name}：${String(error)}。可選擇其他地圖。`);
  } finally {
    if (token === operation) busy();
  }
}
button("start").onclick = () => void start();
button("cancel").onclick = cancel;
button("dismiss-message").onclick = () => {
  el("message").hidden = true;
};
el<HTMLInputElement>("search").oninput = renderList;
button("zoom-in").onclick = () => view.setZoom(view.zoom * 1.25);
button("zoom-out").onclick = () => view.setZoom(view.zoom / 1.25);
button("zoom-value").onclick = () => view.setZoom(1);
button("fit").onclick = () => view.fit();
for (const id of ["ground", "objects", "grid"])
  el<HTMLInputElement>(id).onchange = () =>
    view.layers(
      el<HTMLInputElement>("ground").checked,
      el<HTMLInputElement>("objects").checked,
      el<HTMLInputElement>("grid").checked,
    );
view.onStats = (stats) => {
  button("zoom-value").textContent = `${Math.round(stats.zoom * 100)}%`;
  el("status").textContent = stats.limited
    ? "已達畫面圖塊上限，請放大檢視。"
    : stats.loading
      ? `正在解碼圖塊… · ${stats.visible.toLocaleString()} 個可見圖塊`
      : `${stats.visible.toLocaleString()} 個可見圖塊${stats.failures ? ` · ${stats.failures} 種圖塊解碼失敗` : " · 載入完成"}`;
};
view.onTile = (tile) => {
  candidatePanel.select(tile);
  el("cell-info").textContent = tile
    ? `座標 ${tile.x}, ${tile.y}\n地表 ${tile.ground} · 物件 ${tile.object}\n原始中繼資料 ${tile.meta}（0x${tile.meta.toString(16).padStart(4, "0")}）`
    : "點選地圖，查看格位資料";
};
button("diagnostics-button").onclick = () => {
  el("diagnostics-text").textContent =
    `${diagnostics}\n\n${view.diagnostics() || "目前沒有圖塊解碼錯誤。"}`;
  el<HTMLDialogElement>("diagnostics").showModal();
};
button("close-diagnostics").onclick = () =>
  el<HTMLDialogElement>("diagnostics").close();
document.addEventListener("keydown", (event) => {
  if (
    event.key === "/" &&
    !(event.target instanceof HTMLInputElement) &&
    !(event.target instanceof HTMLSelectElement)
  ) {
    event.preventDefault();
    el("search").focus();
  }
});
window.addEventListener("pagehide", () => {
  client?.dispose();
  candidatePanel.dispose();
});
void savedDirectory()
  .then((handle) => {
    if (!handle || catalog) return;
    saved = handle;
    el("resume-folder").hidden = false;
    button("resume-folder").textContent = `繼續使用 ${handle.name}`;
    el("forget-folder").hidden = false;
  })
  .catch(() => {
    /* Private browsing may disable IndexedDB; choosing files still works. */
  });
