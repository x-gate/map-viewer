import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

test("previews cross-source candidates, places only the chosen cell, and restores", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      !r.url().startsWith("http://127.0.0.1:8080") &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  await page.goto("/");
  await page
    .locator("#folder-input")
    .setInputFiles(resolve(".generated/fixture-candidates"));
  await page.getByRole("button", { name: "開啟地圖檢視器" }).click();
  await expect(page.locator("#status")).toContainText("載入完成");
  const canvas = page.locator("#viewport > canvas"),
    box = (await canvas.boundingBox())!;
  // Source cell (0,0) has ground 1 / object 2; initial map is 12 x 10 at scale 1.
  const target = {
    x: box.x + box.width / 2 - 320,
    y: box.y + box.height / 2 + 23.5,
  };
  await page.mouse.click(target.x, target.y);
  const panel = page.getByRole("region", { name: "圖塊候選與試放" });
  await expect(panel).toBeVisible();
  await expect(panel.locator('[data-id="cell"]')).toContainText("座標 (0, 0)");
  await expect(panel.locator('[data-id="status"]')).toContainText(
    "找到 17 筆候選 · 本頁 12 筆可試放",
  );
  await expect(panel.locator('[data-id="warnings"]')).toContainText(
    "GraphicInfo_bad.bin",
  );
  const card = panel
    .locator(".candidate-card")
    .filter({ hasText: "圖像 ID 100 · 索引列 0" });
  await expect(card).toHaveCount(1);
  await expect(card.locator("canvas")).toBeVisible();
  await page.screenshot({
    path: test.info().outputPath("candidate-panel.png"),
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(async () => (await panel.boundingBox())!.width)
    .toBeLessThan(390);
  await expect
    .poll(
      async () =>
        (await panel.locator('[data-id="results"]').boundingBox())!.height,
    )
    .toBeGreaterThan(50);
  await card.getByRole("button").scrollIntoViewIfNeeded();
  await expect(card.getByRole("button")).toBeInViewport();
  await page.screenshot({
    path: test.info().outputPath("candidate-panel-narrow.png"),
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect
    .poll(async () => (await canvas.boundingBox())!.width)
    .toBe(box.width);
  // Snapshot a tiny synthetic map-only region: ensure placement changes actual rendered pixels.
  const clip = {
    x: Math.floor(target.x - 12),
    y: Math.floor(target.y - 12),
    width: 24,
    height: 24,
  };
  const before = await page.screenshot({ clip });
  await card.getByRole("button", { name: "試放到此格" }).click();
  await expect(panel.locator('[data-id="placement"]')).toContainText(
    "已試放：Graphic_2 · 索引列 0｜本圖 1 處試放",
  );
  await expect
    .poll(async () => !(await page.screenshot({ clip })).equals(before))
    .toBe(true);
  // Another cell with the same object ID stays original; overrides are keyed by cell and layer.
  await page.mouse.click(target.x + 192, target.y - 94);
  await expect(panel.locator('[data-id="cell"]')).toContainText("座標 (5, 1)");
  await expect(panel.locator('[data-id="placement"]')).toContainText(
    "此格此層使用原始內容｜本圖 1 處試放",
  );
  // Selecting an adjacent cell with the same ground must not propagate this override.
  await page.mouse.click(target.x + 32, target.y - 23.5);
  await expect(panel.locator('[data-id="cell"]')).toContainText("座標 (1, 0)");
  await expect(panel.locator('[data-id="placement"]')).toContainText(
    "此格此層使用原始內容｜本圖 1 處試放",
  );
  await panel.getByRole("radio", { name: "物件", exact: true }).check();
  await expect(panel.locator('[data-id="status"]')).toContainText(
    "此層為空（ID 0）",
  );
  await page.mouse.click(target.x, target.y);
  await expect(panel.locator('[data-id="status"]')).toContainText(
    "本頁 12 筆可試放",
  );
  await panel.getByRole("button", { name: "下一頁" }).click();
  await expect(panel.locator('[data-id="status"]')).toContainText(
    "本頁 3 筆可試放，2 筆無法使用",
  );
  await expect(
    panel
      .locator(".candidate-card")
      .filter({ hasText: "索引列 13" })
      .getByRole("button"),
  ).toBeDisabled();
  await expect(
    panel.locator(".candidate-card").filter({ hasText: "索引列 14" }),
  ).toContainText("無法解碼");
  await panel.getByRole("button", { name: "還原此格此層" }).click();
  await expect(panel.locator('[data-id="placement"]')).toContainText(
    "本圖 0 處試放",
  );
  await expect
    .poll(async () => (await page.screenshot({ clip })).equals(before))
    .toBe(true);
  // Both layers can be tried independently, and clearing all restores both.
  await panel.getByRole("button", { name: "上一頁" }).click();
  await card.getByRole("button", { name: "試放到此格" }).click();
  await expect(panel.locator('[data-id="placement"]')).toContainText(
    "本圖 1 處試放",
  );
  await panel.getByRole("radio", { name: "地表", exact: true }).check();
  await panel.getByRole("button", { name: "試放到此格" }).click();
  await expect(panel.locator('[data-id="placement"]')).toContainText(
    "本圖 2 處試放",
  );
  await panel.getByRole("button", { name: "清除所有試放" }).click();
  await expect(panel.locator('[data-id="placement"]')).toContainText(
    "本圖 0 處試放",
  );
  await panel.getByRole("radio", { name: "物件", exact: true }).check();
  await card.getByRole("button", { name: "試放到此格" }).click();
  await expect(panel.locator('[data-id="placement"]')).toContainText(
    "本圖 1 處試放",
  );
  // No-match UI and changing maps cancel old searches/previews and clear placements.
  await page.getByRole("searchbox").fill("200");
  await page.locator(".map-entry").click();
  await expect(panel).toBeHidden();
  await page.getByRole("button", { name: "關閉訊息" }).click();
  const current = (await canvas.boundingBox())!;
  await page.mouse.click(
    current.x + current.width / 2,
    current.y + current.height / 2,
  );
  await panel.getByRole("radio", { name: "地表", exact: true }).check();
  await expect(panel.locator('[data-id="status"]')).toContainText(
    "都找不到相同 ID",
  );
  await expect(panel.locator('[data-id="placement"]')).toContainText(
    "本圖 0 處試放",
  );
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
