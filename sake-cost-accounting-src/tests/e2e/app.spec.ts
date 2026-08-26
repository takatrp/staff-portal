import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => window.localStorage.clear());
  await page.goto("./");
});

test("全画面を移動でき、各画面幅で横方向にはみ出さない", async ({ page }) => {
  const screens = ["ホーム", "原材料費", "製造費用按分", "製品費用按分", "製品原価", "甘酒・副産物等", "棚卸・売上原価", "マスター設定", "保存・出力"];
  for (const name of screens) {
    await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("button", { name, exact: true }).click();
    await expect(page.locator(".topbar h1")).toHaveText(name);
  }
  const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, body: document.body.scrollWidth }));
  expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport);
});

test("全角・カンマ付き数値を正規化し、Enterで同じ列の次行へ移動する", async ({ page }) => {
  await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("button", { name: "原材料費", exact: true }).click();
  const inputs = page.locator('input[data-grid-col="0"]');
  await inputs.nth(0).fill("１，２３４");
  await expect(inputs.nth(0)).toHaveValue("1,234");
  await expect.poll(() => page.evaluate(() => window.localStorage.getItem("sake-cost-accounting-public-demo-v2"))).toContain('"opening":1234');
  await inputs.nth(0).press("Enter");
  await expect(inputs.nth(1)).toBeFocused();
  await inputs.nth(1).fill("abc");
  await expect(inputs.nth(1)).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("数値として入力してください。")).toBeVisible();
  await page.getByRole("tab", { name: "本格焼酎" }).click();
  await expect(page.getByRole("tab", { name: "本格焼酎" })).toHaveAttribute("aria-selected", "true");
});

test("架空のCSVプレビューとJSON・集計CSVの出力が機能する", async ({ page }) => {
  await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("button", { name: "保存・出力", exact: true }).click();
  const csvInput = page.locator('input[type="file"][accept*=".csv"]');
  await csvInput.setInputFiles({ name: "sample.csv", mimeType: "text/csv", buffer: Buffer.from("項目,金額\n架空項目,1234\n", "utf8") });
  await expect(page.getByText("sample.csv", { exact: true })).toBeVisible();
  await expect(page.getByText("1行", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "原価データへ反映" })).toBeDisabled();

  const jsonDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSONを保存" }).click();
  const downloadedJson = await jsonDownload;
  expect(downloadedJson.suggestedFilename()).toMatch(/backup-v3\.json$/);
  const downloadedPath = await downloadedJson.path();
  expect(downloadedPath).not.toBeNull();

  await page.locator('input[type="file"][accept*=".json"]').setInputFiles(downloadedPath!);
  await page.getByRole("dialog").getByRole("button", { name: "復元する" }).click();
  await expect(page.getByText("JSONバックアップを復元", { exact: true }).first()).toBeVisible();

  const csvDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "集計CSVを保存" }).click();
  expect((await csvDownload).suggestedFilename()).toMatch(/summary\.csv$/);

  await page.getByRole("button", { name: "エラー確認用データを読み込む" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "読み込む" }).click();
  await expect(page.locator(".issue-badge")).toContainText("要修正");
  await page.getByRole("button", { name: "正常デモデータを読み込む" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "読み込む" }).click();
  await expect(page.locator(".issue-badge")).toHaveText("✓ エラー 0");
});

test("確認・担当者入力後に確定し、入力ロックと解除を往復できる", async ({ page }) => {
  await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("button", { name: "マスター設定", exact: true }).click();
  await page.getByLabel("作業担当者・確定担当者名").fill("テスト担当");
  await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("button", { name: "棚卸・売上原価", exact: true }).click();

  for (const item of await page.locator(".review-list article").all()) {
    await item.getByRole("checkbox").check();
    await item.getByPlaceholder("確認結果・根拠・対応内容（必須）").fill("架空データで確認済み");
  }

  const finalize = page.getByRole("button", { name: "年度原価を確定" });
  await expect(finalize).toBeEnabled();
  await finalize.click();
  await page.getByRole("dialog").getByRole("button", { name: "確定する" }).click();
  await expect(page.getByText("年度原価は確定済みです")).toBeVisible();
  await expect(page.getByLabel("商品 期首商品棚卸")).toBeDisabled();

  await page.getByRole("button", { name: "確定を解除" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "編集を再開" }).click();
  await expect(page.getByLabel("商品 期首商品棚卸")).toBeEnabled();
  await expect(page.getByText("すべて確認して年度原価を確定")).toBeVisible();
});
