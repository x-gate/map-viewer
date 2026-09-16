# CGTool 地圖對照

日期：2026-09-14。基準為 [HonorLee-cn/CGTool b4d0811](https://github.com/HonorLee-cn/CGTool/tree/b4d08112524aa16b9fdb416ef865f8c196ffac20)，由使用者指定為正確實作。

- 格距改為 **64 × 48**，依 [5.Map.unity 的 Map_Grid.m_CellSize](https://github.com/HonorLee-cn/CGTool/blob/b4d08112524aa16b9fdb416ef865f8c196ffac20/example/Scene/5.Map.unity)。圖像本身仍可為 64 × 47；不可用圖像高度作投影步距。同步修正格線、反向選格、fit、可見範圍與缺圖標記。
- [Map.cs](https://github.com/HonorLee-cn/CGTool/blob/b4d08112524aa16b9fdb416ef865f8c196ffac20/CrossgateToolkit/Map.cs) 將檔案列上下翻轉後送進 Unity isometric grid；目前投影保留原始檔案座標，x 增加朝右上、y 增加朝右下，與該轉換相符（全圖平移規範化不影響相對位置）。不再額外翻轉原始平面，meta 與試放鍵維持原座標。
- 依 [GraphicData](https://github.com/HonorLee-cn/CGTool/blob/b4d08112524aa16b9fdb416ef865f8c196ffac20/CrossgateToolkit/GraphicData.cs) 以 GraphicInfo 尺寸配置圖像。RD header 尺寸不符改成診斷，不拒絕像素數正確的圖像；一般地圖與候選預覽共用此路徑。
- 依 [GraphicInfo.Init](https://github.com/HonorLee-cn/CGTool/blob/b4d08112524aa16b9fdb416ef865f8c196ffac20/CrossgateToolkit/GraphicInfo.cs)，所選來源中重複 map_id 使用末列。候選面板仍保留所有來源與列，不自動合併來源。
- byte 31 等於 1 的 AsGround 物件放在地表之上、一般物件之下；物件圖層開關仍一起控制，試放與還原也帶入候選的 AsGround。一般物件沿用畫面 y 深度排序。
- xglib 的固定色 4/5、空內嵌色表回退、RLE 長指令及壓縮 stream 邊界修正由重建 WASM 一併整合。

保留範圍：只處理 client MAP、靜態 Graphic 與手動候選試放。CGTool 的 LS2MAP、MapExtra 名稱／預設色表、碰撞網格、角色排序修正與跨多格物件遮擋修正未納入。CGTool 的範例 Tilemap 沒有套用 ObjectZIndex；本工具也不宣稱完整複製引擎遮擋或碰撞。meta、signed 欄位與 strict 診斷維持；不把色表越界或解壓不足默默視為透明成功。

整合順序：更新 xglib → `bun run build:wasm` → `bun run test` → `bun run build` → `E2E_PREVIEW=1 bun run test:e2e`。正式產物測試使用 8083，不重用既有 8080 開發伺服器。瀏覽器合成測試涵蓋選格、來源／調色盤切換、跨來源試放與還原；原版外部目錄測試未提供路徑時照原規則 skip，沒有讀寫原版遊戲資源。

## 本次執行結果

xglib 整合 commit：`d1480b4`。`bun run build:wasm`、`bun run build`（lint / TypeScript / Vite）及 24 項 Bun 單元測試通過。正式產物 Chrome E2E 4 項通過，1 項原版外部目錄測試按既有條件略過；使用 8083。新增 WASM 測試同時驗證長 literal alias、RD stream 邊界與固定色修正。沒有使用原版素材進行畫面校對。

## 2026-09-16：圖像與選格偏移修正

唯讀檢查 `1011.dat`：原始 `(19,16)` 的物件 ID 為 `17159`，`(19,15)` 為 `2`。`GraphicInfo_66.bin` 的 `17159` 偏移為 `(-66,-82)`；周圍地表 `1166–1169` 均為 `(-32,-24)`，圖像尺寸為 64 × 47。

GraphicInfo 偏移已相對於格位中心。舊繪製公式卻使用「格位中心 − (32,24) ＋ 偏移」，額外的 `(-32,-24)` 恰好等於往原始 y 軸退一格，造成 `(19,16)` 的圖像出現在 `(19,15)`。改為「格位中心 ＋ 偏移」，地表、一般物件、AsGround 與候選試放共用此修正。缺圖標記沒有 GraphicInfo，仍由自身尺寸置中。投影、格線、點選換算與原始資料座標維持不變。

原創測試索引改用實際的中心偏移慣例，另建立 30 × 30 合成地圖，在 `(19,16)` 放置唯一物件。Chrome 回歸測試比對該格在物件圖層開關前後的像素，並檢查 `(19,15)` 為空；同時涵蓋適合視窗、縮放及平移。已先確認測試在舊公式下失敗，再驗證修正結果；沒有複製或輸出原版素材。
