# map-viewer

x-gate 地圖檢視器，以 PixiJS / TypeScript 呈現、`../xglib` 的 WASM bindings 解析本機資源。此階段提供 WASM 建置、根目錄辨識、Worker 資源讀取及合成資料測試。

## 開發

需要 Bun、支援 edition 2024 的 Rust、wasm32-unknown-unknown target，以及 wasm-bindgen-cli 0.2.118。xglib 整合基準為 `b111040f69ee27bbd24667be6acebf0d443e3b79`。

```sh
bun install --frozen-lockfile
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.118 --locked
bun run build:wasm
bun run dev
bun run test
bun run build
```

`XGLIB_DIR` 可指定 xglib repository，`WASM_BINDGEN` 可指定 CLI。產物與快取位於忽略的 `.generated/`；不修改相依 repository。無後端服務。

選取的遊戲根目錄應含 `Assets/bin/GraphicInfo*.bin`、配對的 `Graphic*.bin`、`Assets/bin/pal/*.cgp` 與 `Assets/map/**/*.dat`。資源讀取使用 `File` 與 `File.slice`，地圖、圖像與調色盤解析透過 xglib WASM 完成；輸出契約沿用 xglib 的 TypeScript 宣告。

圖像 strict 失敗會回傳診斷，不啟用截尾／補零。重複 map_id 保留索引列，暫採第一列；不宣稱為原作覆蓋規則。

此非官方工具不包含遊戲素材，沒有 Square Enix 授權或背書。遊戲名稱及商標屬各權利人；正式專案授權尚未決定。
