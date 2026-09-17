import { test, expect } from "@playwright/test";
import { resolve } from "node:path";

test("loads NPC sprites and animations, toggles the independent layer and follows maps", async ({
  page,
}) => {
  const errors: string[] = [],
    external: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("request", (r) => {
    if (
      new URL(r.url()).hostname !== "127.0.0.1" &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  await page.goto("/");
  await page
    .locator("#folder-input")
    .setInputFiles(resolve(".generated/fixture-npcs"));
  await page.getByRole("button", { name: "開啟地圖檢視器" }).click();
  await expect(page.locator("#status")).toContainText("載入完成");
  await page.getByRole("button", { name: "NPC 設定", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "NPC 圖層" });
  await page
    .locator("#npc-input")
    .setInputFiles(resolve(".generated/fixture-npcs/npc.txt"));
  await expect(dialog.locator('[data-id="status"]')).toContainText(
    "2 種造型就緒／2 種無法顯示 · 載入完成",
  );
  await expect(dialog.locator('[data-id="status"]')).toContainText("本圖 4 筆");
  await expect(dialog.locator('[data-id="error"]')).toContainText(
    "1 筆座標超出",
  );
  await expect(
    dialog.locator(".npc-row").filter({ hasText: "動畫嚮導" }),
  ).toContainText("動畫造型");
  await expect(
    dialog.locator(".npc-row").filter({ hasText: "缺少造型" }),
  ).toContainText("找不到造型");
  await dialog.locator('[data-id="anime"]').selectOption("-1");
  await expect(dialog.locator('[data-id="status"]')).toContainText(
    "1 種造型就緒／3 種無法顯示 · 載入完成",
  );
  await dialog.locator('[data-id="anime"]').selectOption("0");
  await expect(dialog.locator('[data-id="status"]')).toContainText(
    "2 種造型就緒／2 種無法顯示 · 載入完成",
  );
  await page.screenshot({ path: test.info().outputPath("npc-settings.png") });
  await dialog.getByRole("button", { name: "關閉 NPC 設定" }).click();
  const box = (await page.locator("#viewport > canvas").boundingBox())!;
  // Cell (2,2), 12 x 10 map fitted at 100%; sprite is 20 x 36 above the cell center.
  const point = {
    x: box.x + box.width / 2 - 192,
    y: box.y + box.height / 2 + 24,
  };
  const clip = {
    x: Math.floor(point.x - 2),
    y: Math.floor(point.y - 20),
    width: 4,
    height: 4,
  };
  const visible = await page.screenshot({ clip });
  await page.locator("#objects").uncheck();
  await expect
    .poll(async () => (await page.screenshot({ clip })).equals(visible))
    .toBe(true);
  await page.locator("#objects").check();
  await page.locator("#npcs").uncheck();
  await expect
    .poll(async () => !(await page.screenshot({ clip })).equals(visible))
    .toBe(true);
  await page.locator("#npcs").check();
  await expect
    .poll(async () => (await page.screenshot({ clip })).equals(visible))
    .toBe(true);
  // Animated NPC (4,2) must actually change pixels over time.
  const animatedClip = { ...clip, x: clip.x + 64, y: clip.y - 48 };
  const frame = await page.screenshot({ clip: animatedClip });
  await expect
    .poll(
      async () =>
        !(await page.screenshot({ clip: animatedClip })).equals(frame),
    )
    .toBe(true);
  await page.mouse.click(point.x, point.y);
  await expect(page.locator('#candidate-panel [data-id="npc"]')).toContainText(
    "原創測試嚮導",
  );
  await page.getByRole("button", { name: "關閉圖塊候選" }).click();
  await page.screenshot({ path: test.info().outputPath("npc-layer.png") });
  await page.getByRole("searchbox").fill("200");
  await page.locator(".map-entry").click();
  await expect(page.locator("#npc-settings")).toHaveText("NPC 設定（1）");
  await page.locator("#npc-settings").click();
  await expect(dialog.locator('[data-id="status"]')).toContainText("載入完成");
  await expect(dialog.locator(".npc-row")).toHaveCount(1);
  await expect(dialog.locator(".npc-row")).toContainText("另一圖");
  await dialog.getByRole("button", { name: "定位", exact: true }).click();
  await expect(page.locator('#candidate-panel [data-id="cell"]')).toContainText(
    "座標 (1, 1)",
  );
  await page.getByRole("button", { name: "關閉圖塊候選" }).click();
  await page.locator("#npc-settings").click();
  await dialog.getByRole("button", { name: "移除 NPC 資料" }).click();
  await expect(dialog.locator('[data-id="status"]')).toContainText(
    "尚未載入 NPC",
  );
  await expect(dialog.locator(".npc-row")).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
