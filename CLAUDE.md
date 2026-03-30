# CLAUDE.md

## Project Overview

x-gate — 基於 pixi.js v8 的 CrossGate（魔力寶貝）地圖瀏覽器，使用 TypeScript + Vite 建構。用戶透過瀏覽器本地載入自己的遊戲資料檔案，所有處理皆在前端完成。

## Tech Stack

- **Runtime**: Bun
- **Renderer**: pixi.js v8, @pixi/sound, @pixi/ui, spine-pixi-v8
- **Animation**: motion
- **Build**: Vite (port 8080), AssetPack (自訂 vite plugin)
- **Language**: TypeScript (strict mode, ES2020 target)
- **Lint/Format**: ESLint 9 (flat config) + Prettier

## Project Structure

```
src/
├── main.ts                          # 應用進入點
├── crossgate/                       # CrossGate 格式解析器
│   ├── codec.ts                     # RLE 解碼器
│   ├── palette.ts                   # 調色盤處理 (預設/CGP/內嵌)
│   ├── graphic-info.ts              # GraphicInfo 二進位解析 (40-byte records)
│   ├── graphic.ts                   # Graphic 解碼 (header + RLE + palette → RGBA)
│   ├── map.ts                       # 地圖 .dat 解析 & 等距座標工具
│   ├── store.ts                     # 用戶資料共享 store
│   ├── loader.ts                    # pixi.js LoaderParser 擴充
│   └── index.ts                     # 模組入口，自動註冊 loaders
├── app/
│   ├── screens/
│   │   ├── AssetPickerScreen.ts     # 檔案選擇畫面
│   │   ├── LoadScreen.ts            # 載入畫面
│   │   └── main/MainScreen.ts       # 地圖瀏覽器 + 地圖選單
│   ├── popups/                      # 彈窗 (PausePopup, SettingsPopup)
│   ├── ui/                          # UI 元件 (Button, Label, RoundedBox, VolumeSlider)
│   └── utils/                       # 應用工具 (userSettings)
├── engine/                          # 底層引擎
│   ├── engine.ts                    # CreationEngine 主類別
│   ├── audio/                       # 音訊系統
│   ├── navigation/                  # 畫面導覽系統
│   ├── resize/                      # 畫面縮放系統
│   └── utils/                       # 工具函式 (storage, maths, random, waitFor)
scripts/                             # 建構腳本 (assetpack vite plugin)
```

## Commands

```bash
bun dev          # 啟動開發伺服器 (localhost:8080, 自動開啟瀏覽器)
bun run build    # lint + tsc + vite build
bun run lint     # ESLint 檢查
```

## Application Flow

1. `AssetPickerScreen` — 用戶提供 GraphicInfo、Graphic、調色盤 (選填)、地圖 .dat 檔案
2. 檔案在瀏覽器本地解析，存入 `CrossGateStore`
3. `MainScreen` — 等距地圖瀏覽器，右上角地圖選單可搜尋與切換地圖

## Key Conventions

- CrossGate 資料檔案由用戶自行提供，不包含在 repo 中
- `crossgate/` 模組負責所有二進位格式的解析與解碼
- `CrossGateStore` 為用戶資料的共享狀態，由 `AssetPickerScreen` 初始化
- 等距地圖渲染使用 diamond bounding box 座標系，物件層啟用 zIndex 深度排序
- Engine 採用 plugin 架構（AudioPlugin, NavigationPlugin, ResizePlugin）
- 畫面透過 `engine.navigation.showScreen()` 進行切換
