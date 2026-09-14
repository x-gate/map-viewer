# x-gate 地圖檢視器

使用 PixiJS 8 與 `xglib` WASM，在瀏覽器中讀取本機《魔力寶貝》資源並瀏覽等角地圖。介面採繁體中文，沒有多語系層，也不需要後端服務或帳號。

## 開始使用

需要 Bun（本次驗證 1.4.2）、支援 edition 2024 的 Rust、`wasm32-unknown-unknown` target，以及與 `xglib/Cargo.lock` 相同版本的 `wasm-bindgen-cli`（目前 0.2.118）。建置時需要同工作區的 `../xglib`；整合基準為 `d1480b4`。

在本 repository 執行：

```sh
bun install --frozen-lockfile
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.118 --locked
bun run build:wasm
bun run dev
```

開啟 [本機檢視器](http://127.0.0.1:8080)。`build:wasm` 將 Rust 編譯快取、JS glue、WASM 和 TypeScript 契約產生於忽略的 `.generated/`，不修改 `xglib`。更新 xglib 後需重跑。可使用 `XGLIB_DIR=/其他位置/xglib`、`WASM_BINDGEN=/工具位置/wasm-bindgen` 指定路徑；相對路徑以本 repository 為基準。

## 選擇遊戲資料夾

首次進入時點選「選擇遊戲資料夾」，選擇**包含 `Assets` 的遊戲根目錄**：

```text
遊戲根目錄/
└── Assets/
    ├── bin/
    │   ├── GraphicInfo_66.bin
    │   ├── Graphic_66.bin
    │   ├── GraphicInfoEx_5.bin       # 其他資源集可選
    │   ├── GraphicEx_5.bin
    │   └── pal/
    │       └── palet_00.cgp
    └── map/
        ├── 0/1000.dat
        └── 1/5/1.dat
```

檔名配對不區分大小寫；每個 `GraphicInfo<後綴>.bin` 對應同資料夾的 `Graphic<後綴>.bin`。選擇一組圖像資源與一個 CGP 調色盤後開啟檢視器；多組資源不會自動混合或覆蓋。

Chrome / Edge 可將資料夾 handle 記在此網站的 IndexedDB，下次點選「繼續使用…」重新授權讀取。僅記 handle，不儲存遊戲檔案；「忘記資料夾」會移除記錄並釋放目前資源。瀏覽器也可能撤銷權限，不能保證永久免選取。未提供 `showDirectoryPicker` 的瀏覽器自動使用 `webkitdirectory`；也可主動點選「改用相容模式選取資料夾」。相容模式每次重新進入需再次選取，不會記住這次資料夾。

所有檔案處理在本機瀏覽器內完成。程式沒有上傳端點、遙測或外部字型請求，不寫入遊戲根目錄。部署只包含應用程式與 WASM，不包含使用者資源。

## 操作

- 左側搜尋完整路徑或地圖編號；點選地圖立即載入。同名 `.dat` 以完整相對路徑區分，不推測遊戲地圖名稱。
- 拖曳平移；滾輪以游標為中心縮放；`＋` / `−` 調整比例，比例按鈕回到 100%，「適合視窗」置中並縮放。
- 畫布取得焦點後可用方向鍵平移、`+` / `-` 縮放、`0` 適合視窗；`/` 聚焦搜尋。
- 「地表」「物件」「格線」獨立控制顯示；點選格位查看原始座標、兩層 ID 與十六進位 meta。
- 點選格位會開啟「圖塊候選」面板，可切換地表／物件，搜尋所有已辨識圖像資源集中 `map_id` 完全相同的索引列。每頁顯示 12 筆預覽、來源、圖像 ID、索引列、尺寸與偏移；重複 ID 分別列出，無法解碼的候選附原因。
- 點選候選的「試放到此格」即可預覽替換，只影響目前格位與所選圖層。可「還原此格此層」或「清除所有試放」；切換地圖、套用資源設定或重新整理時清除，不儲存或改寫地圖。ID 0 表示空層，不提供候選。
- 「資源設定」返回設定頁，可切換資源集、調色盤或資料夾；套用後重新載入地圖並釋放前一組圖像快取。
- 「檢視診斷」查看重複 ID、缺少圖塊與解碼失敗；缺少或無法解析的圖塊以粉色菱形 `?` 呈現。
- 載入期間可「取消」。毀損地圖不會清除上一張已成功開啟的地圖，可直接選擇其他地圖重試。

## 指令與驗證

```sh
bun run lint        # ESLint / Prettier
bun run typecheck   # TypeScript 嚴格檢查
bun run test        # 合成資源 + 真實 WASM runtime 單元測試
bun run test:e2e    # Chrome 端對端測試；自動產生原創測試資源
bun run build       # lint + typecheck + Vite 正式建置
E2E_PREVIEW=1 bun run test:e2e  # 正式 dist，獨立使用 8083
bun run preview     # 預覽 dist，127.0.0.1:8080
bun run format      # 格式化維護中的程式碼與文件
```

端對端測試預設使用已安裝的 Google Chrome。沒有 Chrome 的環境可先執行 `bunx playwright install chrome`。一般測試完全不需要遊戲資料，`.generated/fixture-game` 是程式產生的合成 bytes。正式建置輸出於 `dist/`，可由靜態 HTTP(S) 主機服務；`base: "./"` 支援子目錄部署。資料夾 handle API 需要 localhost 或 HTTPS。不要直接以 `file://` 開啟。

選用的本機唯讀整合驗證：

```sh
bun scripts/audit-local.ts ../CGoriginmood Graphic_66 Assets/map/0/1000.dat > .generated/local-audit.json
GAME_ROOT=/絕對路徑/遊戲根目錄 bun run test:e2e
```

audit 輸出選定四個來源檔的 SHA-256、地圖尺寸、圖塊統計、解碼錯誤與 `inputsUnchanged`，不輸出圖像。未對應 ID / strict 解碼失敗會回傳 exit 1，即使輸入完整性驗證成功。選用瀏覽器測試目前指定基本資源集與 `0/1000.dat`，其他版本需調整測試案例。測試不會產生遊戲畫面截圖。

## 架構與介面

| 模組                                                  | 責任                                         |
| ----------------------------------------------------- | -------------------------------------------- |
| `src/resources/catalog.ts`、`directory.ts`            | 唯讀資料夾取得、檔名配對、handle 記錄        |
| `src/resources/worker.ts`、`client.ts`、`protocol.ts` | 可取消的 Worker request / result 邊界        |
| `src/resources/session.ts`、`wasm.ts`                 | 索引尋址、檔案切片、xglib 解析與 RGBA 轉換   |
| `src/resources/candidates.ts`、`graphic.ts`           | 全來源候選索引與共用的嚴格圖像解碼           |
| `src/viewer/geometry.ts`、`map-view.ts`               | 投影、可見區域裁切、圖像快取、深度排序與操作 |
| `src/viewer/candidate-panel.ts`                       | 候選分頁、縮圖預覽與逐格試放操作             |
| `src/main.ts`、`style.css`                            | 繁體中文介面與使用流程                       |
| `scripts/build-wasm.ts`                               | 以鎖定 Cargo 依賴產生瀏覽器 bindings         |

唯一跨 repository 依賴為 `map-viewer → xglib`；沒有反向依賴或公開網路 API。WASM 輸入為 `Uint8Array`，使用 `map_build_from_bytes`、`game_palette_build_from_cgp`、`graphic_strict_build_from_cgp`。索引的 40-byte container addressing 由 TypeScript 讀取；地圖、圖像、RLE 與調色盤的實際解碼交由 Rust。

## 相容性與界限

目前支援一組基礎圖像資源集、靜態地表與物件，以及手動跨資源集試放。格距依 CGTool 修正為 64 × 48，原始檔案座標與圖像垂直翻轉保持；AsGround 物件位於一般物件下方。同一來源重複 map_id 使用末列，候選仍保留全部來源與索引列。尚無動畫、自動來源合成、碰撞模擬或完整跨格遮擋；詳見 [CGTool 對照](docs/cgtool-audit.md)。

試放以「地圖格位＋圖層」記錄，最多 256 處；試放紋理另有 128 MiB 上限。搜尋索引在獨立 Worker 中建立，只讀取本頁及試放所需的圖像切片，並使用目前選定的 CGP（具有內嵌調色盤的格式仍由 xglib 判讀）。詳細規則見 [候選試放紀錄](docs/candidate-placement.md)。

每張地圖最多 1,000,000 格；單張圖像邊長最多 4,096、像素最多 4,194,304，資料切片最多 16 MiB。畫布最多呈現 200,000 個可見 sprites，超過時顯示放大提示；格線只在較小的可見範圍繪製。未使用的紋理按近期使用順序回收，快取以 128 MiB 為目標；目前畫面正在使用的圖像不會強制回收，因此這不是總記憶體硬上限。切換地圖會清除圖像快取。

xglib 目前沒有完整的解壓配置上限；這些預檢和 Worker 隔離不等於任意惡意檔案的安全保證。此版本以本機既有遊戲資源為驗證範圍。strict 解析失敗會保留診斷，不啟用補零或截尾的寬鬆模式。

已執行的驗證與證據見 [整合紀錄](docs/integration.md)。介面流程參考 [x-gate/map-viewer](https://github.com/x-gate/map-viewer)，採獨立實作；圖像與座標慣例的具體來源記錄於整合文件。

## 授權與歸屬

這是非官方研究工具，未由 Square Enix 授權或背書。遊戲名稱及商標屬各權利人。使用者自行提供有權使用的本機資料，本 repository 不提供或散布原版程式碼、圖像、地圖、音訊或其他遊戲素材。首頁圖示與合成測試圖像為本次自行設計。專案尚未訂定正式授權，請勿自行假定已有開源散布授權。
