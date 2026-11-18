import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { createNormalDemoModel } from "../../src/data/defaults";

const storageKey = "sake-cost-accounting-public-demo-v2";

const screens = ["ホーム", "原材料費", "製造費用按分", "製品費用按分", "製品原価", "甘酒・副産物等", "棚卸・売上原価", "マスター設定", "保存・出力"];

async function navigate(page: Page, name: string) {
  await page.getByRole("navigation", { name: "メインメニュー" }).getByRole("button", { name, exact: true }).click();
  await expect(page.locator(".topbar h1")).toHaveText(name);
}

function desktopOnly(testInfo: TestInfo) {
  test.skip(testInfo.project.name !== "desktop", "機能検証はdesktopで実行し、レスポンシブ検証は全projectで実行する");
}

test.beforeEach(async ({ page }) => {
  await page.goto("./");
  await page.evaluate(() => window.localStorage.clear());
  await page.reload();
});

async function setStoredDataAndReload(page: Page, rawData: string) {
  await page.evaluate(([key, value]) => {
    window.localStorage.clear();
    window.localStorage.setItem(key, value);
  }, [storageKey, rawData]);
  await page.reload();
}

test("全画面を移動でき、各画面・各画面幅で横方向にはみ出さない", async ({ page }) => {
  for (const name of screens) {
    await navigate(page, name);
    const dimensions = await page.evaluate(() => ({ viewport: window.innerWidth, body: document.body.scrollWidth }));
    expect(dimensions.body, `${name}に不要なページ全体の横スクロールがある`).toBeLessThanOrEqual(dimensions.viewport);
    if (name === "ホーム") await expect(page.locator(".workflow-grid button")).toHaveCount(6);
  }
});

test("小数を1文字ずつ入力し、金額・負数制御とEnter確定を維持する", async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await navigate(page, "製造費用按分");
  const decimalCases = [
    ["清酒 配賦基準数量", "10.25", "10.25", 10.25],
    ["本格焼酎 配賦基準数量", "1234.5", "1,234.5", 1234.5],
    ["リキュール 配賦基準数量", ".5", "0.5", 0.5],
    ["スピリッツ 配賦基準数量", "１０．２５", "10.25", 10.25],
  ] as const;
  for (const [label, typed, display, expectedValue] of decimalCases) {
    const input = page.getByRole("textbox", { name: label });
    await input.click();
    await input.press("Control+A");
    await input.press("Backspace");
    await input.pressSequentially(typed);
    await expect(input).toHaveValue(display);
    await page.getByRole("heading", { name: "製造費用按分", level: 1 }).click();
    await expect.poll(() => page.evaluate(([screenLabel]) => {
      const model = JSON.parse(window.localStorage.getItem("sake-cost-accounting-public-demo-v2")!);
      const ids: Record<string, string> = { "清酒 配賦基準数量": "sake", "本格焼酎 配賦基準数量": "shochu", "リキュール 配賦基準数量": "liqueur", "スピリッツ 配賦基準数量": "spirits" };
      return model.allocationDrivers.manufacturing[ids[screenLabel]];
    }, [label])).toBe(expectedValue);
  }

  const nonNegative = page.getByRole("textbox", { name: "ウイスキー 配賦基準数量" });
  await nonNegative.click();
  await nonNegative.press("Control+A");
  await nonNegative.pressSequentially("-1");
  await expect(nonNegative).toHaveAttribute("aria-invalid", "true");

  await navigate(page, "原材料費");
  const money = page.locator('input[data-grid-row="0"][data-grid-col="0"]');
  await money.click();
  await money.press("Control+A");
  await money.press("Backspace");
  await money.pressSequentially("10.5");
  await money.press("Tab");
  await expect(money).toHaveAttribute("aria-invalid", "true");
  expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem("sake-cost-accounting-public-demo-v2")!).materials.manufacturing[0].entries.sake.opening)).toBe(0);

  await navigate(page, "製品原価");
  const raw = page.locator(".product-step").first();
  const transferQty = raw.getByRole("textbox", { name: "振替 数量" });
  await transferQty.click();
  await transferQty.press("Control+A");
  await transferQty.press("Backspace");
  await transferQty.pressSequentially("-1.25");
  await transferQty.press("Tab");
  expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem("sake-cost-accounting-public-demo-v2")!).productRollforwards.sake.raw.transferQty)).toBe(-1.25);

  const openingQty = raw.getByRole("textbox", { name: "期首棚卸 数量" });
  const purchaseQty = raw.getByRole("textbox", { name: "購入・移入 数量" });
  await openingQty.click();
  await openingQty.press("Control+A");
  await openingQty.press("Backspace");
  await openingQty.pressSequentially("10.25");
  await openingQty.press("Enter");
  await expect(purchaseQty).toBeFocused();
  await expect(openingQty).toHaveValue("10.25");
  expect(await page.evaluate(() => JSON.parse(window.localStorage.getItem("sake-cost-accounting-public-demo-v2")!).productRollforwards.sake.raw.openingQty)).toBe(10.25);
});

test("複数セル貼付けでフォーカス中の古い下書きが貼付け値を上書きしない", async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await navigate(page, "原材料費");
  const first = page.locator('input[data-grid-row="0"][data-grid-col="0"]');
  await first.click();
  await first.press("Control+A");
  await first.pressSequentially("999");
  await first.evaluate((input) => {
    const data = new DataTransfer();
    data.setData("text/plain", "11\t22\n33\t44");
    input.dispatchEvent(new ClipboardEvent("paste", { bubbles: true, clipboardData: data }));
  });
  await expect(page.locator('input[data-grid-row="0"][data-grid-col="0"]')).toHaveValue("11");
  await expect(page.locator('input[data-grid-row="0"][data-grid-col="1"]')).toHaveValue("22");
  await expect(page.locator('input[data-grid-row="1"][data-grid-col="0"]')).toHaveValue("33");
  await expect(page.locator('input[data-grid-row="1"][data-grid-col="1"]')).toHaveValue("44");
});

test("架空のCSVプレビューとJSON・集計CSVの出力が機能する", async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await navigate(page, "保存・出力");
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
  await page.getByRole("button", { name: "正常デモデータを読み込む" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "読み込む" }).click();
  await expect(page.locator(".issue-badge")).toHaveText("✓ エラー 0");
});

test("エラー確認用デモの副産物エラーから対象行へ移動し、集計対象へ戻すと解除する", async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await navigate(page, "保存・出力");
  await page.getByRole("button", { name: "エラー確認用データを読み込む" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "読み込む" }).click();
  await navigate(page, "棚卸・売上原価");
  await page.locator(".validation-link").filter({ hasText: "米麹は財務集計対象外ですが、金額が残っています" }).click();
  await expect(page.locator(".topbar h1")).toHaveText("甘酒・副産物等");
  const riceKojiRow = page.locator("#row-rice-koji");
  await expect(riceKojiRow).toBeVisible();
  await expect(riceKojiRow).toContainText("要修正");
  await page.getByLabel("米麹 財務集計対象").check();
  await expect(riceKojiRow).not.toContainText("財務集計対象外の金額が残っているため年度確定できません");
});

test("負数JSONを拒否し、復元失敗後も現在データを維持する", async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await navigate(page, "マスター設定");
  await page.getByLabel("会社名").fill("保持確認会社");
  await navigate(page, "保存・出力");
  const invalid = createNormalDemoModel("2026-08-27T00:00:00.000Z");
  invalid.allocationDrivers.manufacturing.sake = -1;
  await page.locator('input[type="file"][accept*=".json"]').setInputFiles({ name: "invalid-negative.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(invalid), "utf8") });
  await expect(page.getByText(/配賦基準数量は0以上で入力してください/)).toBeVisible();
  await navigate(page, "マスター設定");
  await expect(page.getByLabel("会社名")).toHaveValue("保持確認会社");
});

test("確認・担当者入力後に確定し、入力ロックと解除を往復できる", async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  await navigate(page, "マスター設定");
  await page.getByLabel("作業担当者・確定担当者名").fill("テスト担当");
  await navigate(page, "棚卸・売上原価");
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

test("壊れた起動JSONを無言で上書きしない", async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  const rawData = "{\n  broken json";
  await setStoredDataAndReload(page, rawData);
  await expect(page.getByRole("heading", { name: "保存データを自動復元できませんでした" })).toBeVisible();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), storageKey)).toBe(rawData);
  await page.waitForTimeout(500);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), storageKey)).toBe(rawData);
});

test("範囲不正の起動JSONを無言で上書きしない", async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  const invalid = createNormalDemoModel("2026-08-27T00:00:00.000Z");
  invalid.allocationDrivers.manufacturing.sake = -1;
  const rawData = JSON.stringify(invalid, null, 2);
  await setStoredDataAndReload(page, rawData);
  await expect(page.getByRole("heading", { name: "保存データを自動復元できませんでした" })).toBeVisible();
  await expect(page.getByText(/配賦基準数量は0以上で入力してください/)).toBeVisible();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), storageKey)).toBe(rawData);
});

test("復旧用ファイルへ元文字列を完全一致で保存する", async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  const rawData = "{\n  \"broken\": true,\n  trailing text\n";
  await setStoredDataAndReload(page, rawData);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "復旧用データを保存" }).click();
  const download = await downloadEvent;
  expect(download.suggestedFilename()).toMatch(/^sake-cost-recovery-\d{8}-\d{6}\.txt$/);
  const path = await download.path();
  expect(path).not.toBeNull();
  expect(await readFile(path!, "utf8")).toBe(rawData);
  expect(await page.evaluate((key) => window.localStorage.getItem(key), storageKey)).toBe(rawData);
});

test("確認後の明示初期化だけが正常デモへ置き換える", async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  const rawData = "{broken";
  await setStoredDataAndReload(page, rawData);

  await page.getByRole("button", { name: "正常デモで初期化" }).click();
  await expect(page.getByRole("dialog")).toContainText("現在の保存データを正常デモへ置き換えます");
  await page.getByRole("dialog").getByRole("button", { name: "キャンセル" }).click();
  expect(await page.evaluate((key) => window.localStorage.getItem(key), storageKey)).toBe(rawData);

  await page.getByRole("button", { name: "正常デモで初期化" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "初期化する" }).click();
  await expect(page.getByText("酒造原価計算を、入力から確定まで一つに。")).toBeVisible();
  await expect(page.locator(".issue-badge")).toHaveText("✓ エラー 0");
  const state = await page.evaluate((key) => {
    const recoveryKey = Object.keys(window.localStorage).find((candidate) => candidate.startsWith("sake-cost-accounting-recovery-"));
    return {
      model: JSON.parse(window.localStorage.getItem(key)!),
      recoveryKey,
      recoveryData: recoveryKey ? window.localStorage.getItem(recoveryKey) : null,
    };
  }, storageKey);
  expect(state.model.schemaVersion).toBe(3);
  expect(state.model.auditLog[0].action).toBe("復旧画面から正常デモで初期化");
  expect(state.recoveryKey).toMatch(/^sake-cost-accounting-recovery-/);
  expect(state.recoveryData).toBe(rawData);
});

test("正常なv3保存データは復旧画面を経由せず値を保持する", async ({ page }, testInfo) => {
  desktopOnly(testInfo);
  const model = createNormalDemoModel("2026-08-27T00:00:00.000Z");
  model.meta.companyName = "保存済み酒造株式会社";
  await setStoredDataAndReload(page, JSON.stringify(model));
  await expect(page.getByRole("heading", { name: "保存データを自動復元できませんでした" })).toHaveCount(0);
  await expect(page.locator(".topbar").getByText("保存済み酒造株式会社")).toBeVisible();
  await expect(page.locator(".issue-badge")).toHaveText("✓ エラー 0");
});
