# x-gate

A browser-based x-gate map viewer built with pixi.js v8 and TypeScript.

Load your own game data files and explore isometric maps directly in the browser — no server upload, everything runs locally.

## Features

- **CrossGate binary format support** — Parses `GraphicInfo`, `Graphic`, palette (`.cgp`), and map (`.dat`) files
- **Isometric map rendering** — Ground and object layers with correct depth sorting
- **In-browser file picker** — Users provide their own game data; files are never uploaded
- **Map selector** — Search and switch between maps with instant loading
- **Drag to pan** — Navigate large maps by dragging the canvas
- **Texture caching** — Decoded tile textures are shared across map loads

## Getting Started

### Prerequisites

- [Bun](https://bun.sh/) (or Node.js 18+)

### Install & Run

```bash
bun install
bun dev
```

Open http://localhost:8080 in your browser.

### Usage

1. On the asset picker screen, select your CrossGate game data files:
   - **GraphicInfo** (required) — e.g. `GraphicInfo_66.bin`
   - **Graphic** (required) — e.g. `Graphic_66.bin`
   - **Palette** (optional) — e.g. `palet_00.cgp`; a default palette is used if omitted
   - **Map files** (required) — one or more `.dat` map files, supports multi-select
2. Click **Load Assets** to parse the files
3. Use the map selector (top-right) to browse and load maps
4. Drag to pan the map view

## Project Structure

```
src/
├── main.ts                          # Entry point
├── crossgate/                       # CrossGate format parsers & loaders
│   ├── codec.ts                     # RLE decoder
│   ├── palette.ts                   # Palette handling (default/CGP/embedded)
│   ├── graphic-info.ts              # GraphicInfo binary parser
│   ├── graphic.ts                   # Graphic decoder (header + RLE + palette → RGBA)
│   ├── map.ts                       # Map .dat parser & isometric utilities
│   ├── store.ts                     # Shared store for user-provided assets
│   ├── loader.ts                    # pixi.js LoaderParser extensions
│   └── index.ts                     # Module entry, auto-registers loaders
├── app/
│   ├── screens/
│   │   ├── AssetPickerScreen.ts     # File picker UI
│   │   └── main/MainScreen.ts       # Map viewer with selector
│   ├── popups/                      # Popup screens
│   └── ui/                          # UI components
├── engine/                          # Lightweight pixi.js engine wrapper
│   ├── engine.ts                    # CreationEngine (extends Application)
│   ├── audio/                       # Audio plugin
│   ├── navigation/                  # Screen navigation plugin
│   └── resize/                      # Resize plugin
scripts/                             # Build tooling (AssetPack vite plugin)
```

## Supported Formats

| File | Format | Description |
|------|--------|-------------|
| `GraphicInfo_*.bin` | 40-byte LE records | Graphic metadata index (ID, address, dimensions, offsets, MapID) |
| `Graphic_*.bin` | `"RD"` header + payload | Raw or RLE-encoded indexed-color pixel data |
| `palet_*.cgp` | 672 bytes BGR triplets | External 256-color palette (16 prefix + 224 CGP + 16 suffix) |
| `*.dat` | `"MAP"` header + 3 layers | Map file with ground, object, and meta layers (uint16 tile IDs) |

## Tech Stack

- **Runtime**: [Bun](https://bun.sh/)
- **Renderer**: [pixi.js](https://pixijs.com/) v8
- **Build**: [Vite](https://vite.dev/)
- **Language**: TypeScript (strict mode)
- **Lint/Format**: ESLint 9 + Prettier

## Scripts

```bash
bun dev          # Start dev server (localhost:8080)
bun run build    # Lint + type-check + production build
bun run lint     # Run ESLint
```

## Legal Notice

This project does **not** include any CrossGate game assets. Users must provide their own legally obtained game data files. All file processing happens entirely in the browser.

## Acknowledgements

- Binary format specifications referenced from [x-gate/xgtool](https://github.com/x-gate/xgtool)
- Built with the [pixi.js](https://pixijs.com/) open-source template
