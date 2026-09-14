import { test, expect } from "@playwright/test";
import { resolve } from "node:path";
const fixture = resolve(".generated/fixture-game");
test("imports a game root, renders WASM tiles and navigates maps", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      new URL(r.url()).hostname !== "127.0.0.1" &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("lang", "zh-Hant");
  await expect(
    page.getByRole("heading", { name: "每一張地圖，都是旅程的起點。" }),
  ).toBeVisible();
  await page.locator("#folder-input").setInputFiles(fixture);
  await expect(page.locator("#setup-count")).toHaveText("4 張地圖");
  await page.getByRole("button", { name: "開啟地圖檢視器" }).click();
  await expect(page.locator("#map-title")).toHaveText("地圖 100");
  await expect(page.locator("#status")).toContainText("載入完成");
  await expect(page.locator("#status")).not.toContainText("解碼失敗");
  await page.locator("#grid").check();
  await page.locator("#objects").uncheck();
  await page.getByRole("button", { name: "放大", exact: true }).click();
  await expect(page.locator("#zoom-value")).toHaveText("125%");
  await page.getByRole("button", { name: "適合視窗" }).click();
  const canvas = page.locator("canvas");
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.locator("#cell-info")).toContainText("座標");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width / 2 + 80,
    box.y + box.height / 2 + 50,
  );
  await page.mouse.up();
  await page.getByRole("searchbox").fill("1/100");
  await expect(page.locator(".map-entry")).toHaveCount(1);
  await page.locator(".map-entry").click();
  await expect(page.locator("#dimensions")).toHaveText("8 × 6 格");
  await page.getByRole("searchbox").fill("nothing");
  await expect(
    page.getByText("沒有符合的地圖，試試其他編號或路徑。"),
  ).toBeVisible();
  await page.getByRole("searchbox").fill("broken");
  await page.locator(".map-entry").click();
  await expect(page.getByRole("alert")).toContainText("無法開啟 broken.dat");
  await page.getByRole("searchbox").fill("200");
  await page.locator(".map-entry").click();
  await expect(page.locator("#map-title")).toHaveText("地圖 200");
  await expect(page.getByRole("alert")).toContainText("1 種圖塊未對應");
  await page.getByRole("button", { name: "檢視診斷" }).click();
  await expect(page.locator("#diagnostics-text")).toContainText(
    "未對應的圖塊 ID：1",
  );
  await page.keyboard.press("Escape");
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});
test("handles an invalid root and keeps the welcome usable at narrow sizes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page
    .locator("#folder-input")
    .setInputFiles(resolve(".generated/fixture-game/Assets/map"));
  await expect(page.getByRole("alert")).toContainText("找不到必要資源");
  await page.getByRole("button", { name: "關閉訊息" }).click();
  await expect(
    page.getByRole("button", { name: "選擇遊戲資料夾", exact: false }).last(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});

// Opt-in: reads original resources in the browser; never exports pixels or game files.
test("loads an external game root without uploading or changing resources", async ({
  page,
}) => {
  test.skip(
    !process.env.GAME_ROOT,
    "Set GAME_ROOT for optional local integration testing.",
  );
  test.setTimeout(120000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const external: string[] = [];
  page.on("request", (r) => {
    if (
      new URL(r.url()).hostname !== "127.0.0.1" &&
      !r.url().startsWith("data:")
    )
      external.push(r.url());
  });
  await page.goto("/");
  await page.locator("#folder-input").setInputFiles(process.env.GAME_ROOT!);
  await expect(page.locator("#setup-count")).toContainText("張地圖");
  await page.locator("#resource-set").selectOption({ label: "Graphic_66" });
  await page.locator("#palette").selectOption({ label: "palet_00.cgp" });
  await page.getByRole("button", { name: "開啟地圖檢視器" }).click();
  await expect(page.locator("#map-title")).not.toHaveText("尚未開啟地圖", {
    timeout: 30000,
  });
  await page.getByRole("searchbox").fill("0/1000.dat");
  await page.locator(".map-entry").click();
  await expect(page.locator("#map-title")).toHaveText("地圖 1000");
  await expect(page.locator("#status")).toContainText("載入完成", {
    timeout: 90000,
  });
  await expect(page.locator("#status")).not.toContainText("解碼失敗");
  await expect(page.locator("#dimensions")).toHaveText("300 × 300 格");
  await page.getByRole("button", { name: "檢視診斷" }).click();
  console.log(await page.locator("#diagnostics-text").textContent());
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
});

test("can leave resource settings and restart without stale map state", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.locator("#folder-input").setInputFiles(fixture);
  await page.getByRole("button", { name: "開啟地圖檢視器" }).click();
  await expect(page.locator("#status")).toContainText("載入完成");
  await page.getByRole("searchbox").fill("1/100");
  await page.locator(".map-entry").click();
  await expect(page.locator("#dimensions")).toHaveText("8 × 6 格");
  await page.getByRole("button", { name: "資源設定", exact: true }).click();
  await expect(page.locator("#welcome")).toBeVisible();
  await expect(page.getByRole("button", { name: "適合視窗" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "檢視診斷" })).toBeHidden();
  await page.getByRole("button", { name: "開啟地圖檢視器" }).click();
  await expect(page.locator("#status")).toContainText("載入完成");
  await expect(page.locator("canvas")).toHaveCount(1);
  expect(errors).toEqual([]);
});
