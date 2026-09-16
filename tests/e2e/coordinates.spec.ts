import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

test("renders offset images in their selected cell after fitting, zooming and panning", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .locator("#folder-input")
    .setInputFiles(resolve(".generated/fixture-coordinates"));
  await page.getByRole("button", { name: "開啟地圖檢視器" }).click();
  await expect(page.locator("#status")).toContainText("載入完成");
  const canvas = page.locator("#viewport > canvas");
  const box = (await canvas.boundingBox())!;
  const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  const scale = Math.min((box.width - 80) / 1920, (box.height - 100) / 1440, 1);
  const panel = page.getByRole("region", { name: "圖塊候選與試放" });
  for (const transformed of [false, true]) {
    const zoom = scale * (transformed ? 1.25 : 1);
    const pan = transformed ? { x: -80, y: 40 } : { x: 0, y: 0 };
    if (transformed) {
      await page.getByRole("button", { name: "關閉圖塊候選" }).click();
      await page.getByRole("button", { name: "放大", exact: true }).click();
      await page.mouse.move(center.x, center.y);
      await page.mouse.down();
      await page.mouse.move(center.x + pan.x, center.y + pan.y);
      await page.mouse.up();
    }
    // Independent expected geometry: 30 x 30 map, cell (19,16), 64 x 48 grid.
    const target = {
      x: center.x + 192 * zoom + pan.x,
      y: center.y - 72 * zoom + pan.y,
    };
    await page.mouse.click(target.x, target.y);
    await expect(panel.locator('[data-id="cell"]')).toContainText(
      "座標 (19, 16) · 地表 1 · 物件 2",
    );
    await expect(panel.locator('[data-id="status"]')).toContainText(
      "本頁 1 筆可試放",
    );
    const clip = {
      x: Math.floor(target.x - 2),
      y: Math.floor(target.y - 2),
      width: 4,
      height: 4,
    };
    const withObject = await page.screenshot({ clip });
    await page.locator("#objects").uncheck();
    // The actual object pixels must occupy this cell, not (19,15).
    await expect
      .poll(async () => !(await page.screenshot({ clip })).equals(withObject))
      .toBe(true);
    await page.locator("#objects").check();
    await expect
      .poll(async () => (await page.screenshot({ clip })).equals(withObject))
      .toBe(true);
    await page.mouse.click(target.x - 32 * zoom, target.y - 24 * zoom);
    await expect(panel.locator('[data-id="cell"]')).toContainText(
      "座標 (19, 15) · 地表 1 · 物件 0",
    );
  }
});
