# CLAUDE.md

## Project Overview

x-gate — 基於 pixi.js v8 的遊戲/互動應用專案，使用 TypeScript + Vite 建構。

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
├── main.ts                  # 應用進入點
├── engine/                  # 底層引擎 (navigation, audio, resize, utils)
│   ├── engine.ts            # CreationEngine 主類別
│   ├── audio/               # 音訊系統
│   ├── navigation/          # 畫面導覽系統
│   ├── resize/              # 畫面縮放系統
│   └── utils/               # 工具函式 (storage, maths, random, waitFor)
├── app/                     # 應用層
│   ├── screens/             # 畫面 (LoadScreen, MainScreen)
│   ├── popups/              # 彈窗 (PausePopup, SettingsPopup)
│   ├── ui/                  # UI 元件 (Button, Label, RoundedBox, VolumeSlider)
│   └── utils/               # 應用工具 (userSettings)
scripts/                     # 建構腳本 (assetpack vite plugin)
raw-assets/                  # 原始素材 (由 AssetPack 處理)
public/assets/               # AssetPack 產出的素材 (gitignored)
```

## Commands

```bash
bun dev          # 啟動開發伺服器 (localhost:8080, 自動開啟瀏覽器)
bun run build    # lint + tsc + vite build
bun run lint     # ESLint 檢查
```

## Key Conventions

- 素材放在 `raw-assets/`，AssetPack 會自動處理並輸出到 `public/assets/`
- `public/assets/`、`.assetpack/`、`src/manifest.json` 皆為自動產生，已 gitignore
- Engine 採用 plugin 架構（AudioPlugin, NavigationPlugin, ResizePlugin）
- 畫面透過 `engine.navigation.showScreen()` 進行切換
