import {
  BufferImageSource,
  Container,
  Graphics,
  Sprite,
  Text,
  Texture,
} from "pixi.js";
import type { NpcRecord } from "../resources/npc";
import type { NpcAppearance } from "../resources/npc-appearance";
import { tilePosition } from "./geometry";
export const npcKey = (n: Pick<NpcRecord, "image" | "direction">) =>
  `${n.image}:${n.direction}`;
export class NpcLayer {
  private nodes: {
    npc: NpcRecord;
    root: Container;
    sprite: Sprite;
    label: Text;
    marker: Graphics;
  }[] = [];
  private appearances = new Map<
    string,
    {
      value: NpcAppearance;
      textures: Texture[];
      bounds: { left: number; top: number; right: number; bottom: number };
    }
  >();
  private bytes = 0;
  visible = true;
  constructor(private parent: Container) {}
  clear() {
    for (const node of this.nodes) node.root.destroy({ children: true });
    this.nodes = [];
    for (const entry of this.appearances.values())
      for (const texture of entry.textures) texture.destroy(true);
    this.appearances.clear();
    this.bytes = 0;
  }
  set(records: NpcRecord[], width: number) {
    this.clear();
    this.nodes = records.map((npc) => {
      const root = new Container(),
        point = tilePosition(npc.x, npc.y, width);
      root.position.set(point.x, point.y);
      root.zIndex = point.y + 0.1;
      const marker = new Graphics()
        .circle(0, -7, 6)
        .fill(0xf1bd79)
        .moveTo(-6, 2)
        .lineTo(6, 2)
        .stroke({ color: 0xf1bd79, width: 2 });
      const sprite = new Sprite();
      sprite.visible = false;
      const label = new Text({
        text: npc.name || `${npc.type} #${npc.id}`,
        style: {
          fontFamily: "sans-serif",
          fontSize: 11,
          fill: 0xffdc9e,
          stroke: { color: 0x17261e, width: 3 },
        },
      });
      label.anchor.set(0.5, 0);
      label.y = 5;
      root.addChild(sprite, marker, label);
      this.parent.addChild(root);
      return { npc, root, sprite, label, marker };
    });
  }
  appearance(key: string, value: NpcAppearance) {
    if (this.appearances.has(key)) return;
    const bytes = value.images.reduce((n, i) => n + i.rgba.byteLength, 0);
    if (this.bytes + bytes > 128 * 1024 * 1024)
      throw new Error("本圖 NPC 圖像已達 128 MiB 上限。");
    const textures = value.images.map(
      (image) =>
        new Texture({
          source: new BufferImageSource({
            resource: image.rgba,
            width: image.width,
            height: image.height,
            format: "rgba8unorm",
            alphaMode: "no-premultiply-alpha",
            scaleMode: "nearest",
          }),
        }),
    );
    // Keep the union of frame bounds so one offscreen frame cannot pause an animation.
    const bounds = { left: 0, top: 0, right: 0, bottom: 0 };
    for (const frame of value.frames) {
      const image = value.images[frame.image];
      const x = frame.flipX ? -image.offX - image.width : image.offX,
        y = frame.flipY ? -image.offY - image.height : image.offY;
      bounds.left = Math.min(bounds.left, x);
      bounds.top = Math.min(bounds.top, y);
      bounds.right = Math.max(bounds.right, x + image.width);
      bounds.bottom = Math.max(bounds.bottom, y + image.height);
    }
    this.appearances.set(key, { value, textures, bounds });
    this.bytes += bytes;
  }
  render(
    now: number,
    bounds: { left: number; top: number; right: number; bottom: number },
    zoom: number,
  ) {
    let animated = false;
    for (const node of this.nodes) {
      const entry = this.appearances.get(npcKey(node.npc));
      const frame =
        entry?.value.frames[
          Math.floor(now / (entry?.value.interval ?? 100)) %
            (entry?.value.frames.length ?? 1)
        ];
      const image =
        entry && frame ? entry.value.images[frame.image] : undefined;
      const extent = entry?.bounds ?? {
        left: -10,
        top: -16,
        right: 10,
        bottom: 16,
      };
      node.root.visible =
        this.visible &&
        node.root.x + extent.right >= bounds.left - 120 / zoom &&
        node.root.x + extent.left <= bounds.right + 120 / zoom &&
        node.root.y + extent.bottom >= bounds.top - 20 / zoom &&
        node.root.y + extent.top <= bounds.bottom;
      if (!node.root.visible) continue;
      node.label.scale.set(1 / Math.max(zoom, 0.5));
      if (entry && frame && image) {
        node.marker.visible = false;
        node.sprite.visible = true;
        node.sprite.texture = entry.textures[frame.image];
        node.sprite.scale.set(frame.flipX ? -1 : 1, frame.flipY ? -1 : 1);
        node.sprite.position.set(
          frame.flipX ? -image.offX : image.offX,
          frame.flipY ? -image.offY : image.offY,
        );
        animated ||= entry.value.frames.length > 1;
      }
    }
    return animated;
  }
}
