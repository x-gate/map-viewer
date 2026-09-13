# WASM 與地圖檢視器整合紀錄

日期：2026-09-13。變更 repository：`map-viewer`；`xglib` 原始碼與工作樹均未修改。

## 背景與決策

本機 `map-viewer` 基準為 PixiJS 初始化 commit `23461e4`。既有初始化腳本含 npm 指令，改為 Bun。使用同工作區 `xglib` 的 bytes API，沒有移植參考版的 TypeScript RLE / 地圖 / 調色盤解碼器。

xglib 基準為 `b111040f69ee27bbd24667be6acebf0d443e3b79`（0.1.0），Cargo.lock 的 wasm-bindgen 為 0.2.118。建置順序為 xglib WASM → web bindings → TypeScript / Vite。產物及 Rust target cache 全部寫入 map-viewer 的 `.generated/`，並排除版本控制。

`xglib.d.ts` 是目前手寫契約；build script 將它放在生成目錄，薄轉接層使用這些型別約束 generated glue 的 `JsValue` 回傳。真實 WASM runtime 測試已確認 MAP header / 三層陣列，以及 palette 的 `red / green / blue / alpha` 和 `payload` 行為。整合未變更 Rust 公開 API。

圖像只讀取必要的 `File.slice(addr, addr + len)`，不一次將數百 MB 圖像檔載入記憶體。WASM 在 Worker 中依序解碼，最多每批 32 種圖塊。取消資源載入會終止 Worker；切換地圖以 generation 排除過期結果，並釋放上一張地圖的 sprites / textures。渲染由操作與解碼完成觸發，沒有閒置的持續渲染迴圈。

## 可追溯的呈現假設

參考 [x-gate/map-viewer](https://github.com/x-gate/map-viewer) 於本次讀取的 `main` commit `d094eab8a886de50a6d7d1724d41dac043ddfc70`：

- [原有流程](https://github.com/x-gate/map-viewer/blob/d094eab8a886de50a6d7d1724d41dac043ddfc70/README.md)：個別檔案選取、地圖搜尋、拖曳。新介面改為根目錄自動辨識，加入繁體中文設定與診斷。
- [地圖投影慣例](https://github.com/x-gate/map-viewer/blob/d094eab8a886de50a6d7d1724d41dac043ddfc70/src/crossgate/map.ts)：64 × 47 格距與旋轉。新實作直接在原始座標與畫布間轉換，不複製地圖平面；以非正方形合成地圖測試雙向轉換。
- [圖像呈現慣例](https://github.com/x-gate/map-viewer/blob/d094eab8a886de50a6d7d1724d41dac043ddfc70/src/crossgate/graphic.ts)：bottom-up 圖像列。xglib 不負責顯示翻轉，因此由 RGBA 轉換層處理，以不對稱 1 × 2 像素測試驗證。
- [圖塊偏移與物件深度](https://github.com/x-gate/map-viewer/blob/d094eab8a886de50a6d7d1724d41dac043ddfc70/src/app/screens/main/MainScreen.ts)：保留 signed offsets，物件依投影後的格位底部順序呈現。

以上是參考實作的慣例，不等於官方格式或與原作逐像素相同。重複 `map_id` 的第一列策略、資源集分開檢視、缺少圖塊的粉色菱形與首頁線條圖示均為本次自行設計；不推測 meta、access 或其他未知旗標的遊戲語意。

## 自動驗證

- Rust → wasm32-unknown-unknown release → wasm-bindgen web glue：成功。
- `bun run test`：14 個合成資料測試，涵蓋路徑大小寫、同名地圖、缺少配對、WASM 真實呼叫、像素色序、透明度、垂直翻轉、strict 錯誤、超出索引範圍、重複 ID 與座標轉換。
- Chrome 端對端：3 項一般案例通過（另有 1 項需外部資料的選用案例）；涵蓋資源設定返回、重新啟動不重複建立畫布，以及合成資料匯入、Worker 解碼、地圖切換、滑鼠拖曳、縮放、格位查詢、圖層、搜尋空結果、毀損地圖恢復、缺少圖塊診斷與 390px 窄螢幕布局。
- 選用的真實資料 Chrome 測試：基本資源集與 `0/1000.dat`；檢查載入完成、300 × 300 尺寸、無解碼失敗、無 page error、無對外請求。
- 首頁於 1280 × 720 的瀏覽器畫面人工檢查；原生目錄選擇器受當時桌面鎖定影響，未完成手動授權驗證。相容模式目錄匯入已由 Chrome 測試。

檢查命令、結果以本次交付為準。端對端測試不等於原作畫面比對；未驗證 Safari / Firefox 的完整行為、跨工作階段的原生 handle 再授權，以及故意製作的解壓炸彈。原生 Rust 測試不在此變更範圍內重跑。

## 本機唯讀樣本結果

命令：

```sh
bun scripts/audit-local.ts ../CGoriginmood Graphic_66 Assets/map/0/1000.dat > .generated/local-audit.json
GAME_ROOT=/本機絕對路徑/CGoriginmood bun run test:e2e
```

根目錄辨識到 605 個 `.dat`、7 組配對圖像與 35 個 CGP。這是**檔案清單辨識數量**，不是本檢視器已全量驗證 605 張地圖。

選定地圖為 300 × 300 格。基本索引包含 21,209 種非零 map_id，另有 70 筆重複 map_id 索引列。地圖中 1,169 種可對應圖塊全部經 strict CGP WASM 入口解碼成功，無無效索引；另有 1 種未對應圖塊 ID。audit 因此回傳 exit 1，沒有把缺少資源誤報為完整成功。`inputsUnchanged: true`；瀏覽器測試完成後也重新比對四個來源檔雜湊一致，沒有寫入或匯出原版素材。

四個輸入的 SHA-256：

| 輸入                            | SHA-256                                                            |
| ------------------------------- | ------------------------------------------------------------------ |
| `Assets/bin/GraphicInfo_66.bin` | `fbb97bc1dbda348333603a690bd4af0a0ddb912bc55fed361ba9121bbbcdfd0b` |
| `Assets/bin/Graphic_66.bin`     | `318237a7a7208c13761f95e51f9b97010a6fe3124761e3c3e880e4d7209cc0a1` |
| `Assets/bin/pal/palet_00.cgp`   | `28822eb7767a714d4d8045c3ed1916ab05d1c4c0eba25c460f1429b7fb921255` |
| `Assets/map/0/1000.dat`         | `109161ee5826d58a18956188d42d7412ff378154ab1ec3aa6be381b852fd2672` |

## 驗證後的本機 commits

- `f30957c`：本機資源辨識、xglib WASM 建置與 Worker 解析、14 項合成測試。
- `f1fb895`：繁體中文檢視器、PixiJS 呈現與 Chrome 操作測試。
- 本文件與唯讀 audit 工具另以文件／驗證 commit 提交。

## 後續相容性工作

目前不混合 base / Ex / V3 / Joy。跨集合成需要先研究來源覆蓋順序與 ID 關聯，不以數字版本自動取代舊圖塊。動畫、玩法 meta、碰撞判定及全量地圖逐像素驗證另行處理。升級 xglib 的欄位或解析語意時，先重建 bindings 並跑 WASM runtime 與端對端測試，再部署新的靜態產物。
