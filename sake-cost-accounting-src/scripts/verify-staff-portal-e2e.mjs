import { verifyHandwriting, inspect, storedZip } from "../../demo-voucher/tests/handwriting.e2e.mjs";
import { verifyVoucherDefaults } from "../../demo-voucher/tests/defaults.e2e.mjs";
import { verifyImageProfile } from "../../demo-voucher/tests/image-profile.e2e.mjs";
import { verifyRandomPreview } from "../../demo-voucher/tests/random-preview.e2e.mjs";
import { verifyVoucherAnalytics } from "../../demo-voucher/tests/analytics.e2e.mjs";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { chromium } from "@playwright/test";

const portalUrl = process.env.STAFF_PORTAL_URL || "http://127.0.0.1:4173/";
const htmlUrl = new URL("../../index.html", import.meta.url);
const html = await readFile(htmlUrl, "utf8");
const inlineScripts = html
  .split("<script")
  .slice(1)
  .map((fragment) => fragment.slice(fragment.indexOf(">") + 1, fragment.indexOf("</script>")))
  .filter((script) => script.trim());

inlineScripts.forEach((script, index) => {
  new vm.Script(script, { filename: `staff-portal-inline-${index + 1}.js` });
});

const verifier = html.match(/const PASSWORD_VERIFIER='([^']+)'/)?.[1];
assert.ok(verifier, "Password verifier must be present");
assert.match(html, /<meta name="robots" content="noindex,nofollow,noarchive" \/>/);

const browser = await chromium.launch({ headless: true, ...(process.env.STAFF_PORTAL_BROWSER_CHANNEL ? { channel: process.env.STAFF_PORTAL_BROWSER_CHANNEL } : {}) });
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const runtimeErrors = [];

page.on("pageerror", (error) => runtimeErrors.push(error.message));
page.on("console", (message) => {
  if (message.type() === "error") runtimeErrors.push(message.text());
});
await page.route("https://www.googletagmanager.com/**", (route) =>
  route.fulfill({ status: 200, contentType: "application/javascript", body: "" }),
);

try {
  await page.goto(portalUrl, { waitUntil: "domcontentloaded" });
  await page.getByRole("heading", { name: "スタッフ専用ポータル" }).waitFor();
  assert.equal(await page.locator("#auth-screen").isVisible(), true);
  assert.equal(await page.locator("#portal-content").isVisible(), false);
  assert.equal(await page.locator("script[src*='googletagmanager.com']").count(), 0);
  assert.equal(await page.locator("a:visible").count(), 0);

  await page.getByLabel("パスワード", { exact: true }).fill("incorrect-password");
  await page.getByRole("button", { name: "ポータルを開く" }).click();
  await page.getByText("パスワードが正しくありません。もう一度お試しください。").waitFor({ timeout: 15_000 });
  assert.equal(await page.locator("#portal-content").isVisible(), false);

  await page.evaluate(
    ({ key, value }) => sessionStorage.setItem(key, value),
    { key: "staff-portal:auth:v1", value: verifier },
  );
  await page.reload({ waitUntil: "domcontentloaded" });
  assert.equal(await page.locator("#portal-content").isVisible(), true);
  assert.equal(await page.locator(".tool-item:visible").count(), 15);
  assert.equal(await page.locator("#visible-count").innerText(), "15");
  assert.equal(await page.locator("script[src*='googletagmanager.com']").count(), 1);

  const journalCard = page.locator('.tool-item[href="https://script.google.com/macros/s/AKfycbydJOF19Yr7rajctRI5pL0gIYzDoyk6HNbweEssnN4arlJdG4M64nD0iQ0EI9BZXyCZ/exec"]');
  assert.equal(await journalCard.count(), 1);
  assert.equal(await journalCard.getAttribute("data-category"), "advice");
  assert.match(await journalCard.innerText(), /仕訳自動化率集計ツール/);

  const archiveCard = page.locator('.tool-item[href="https://takatrp.github.io/mirai-archive/"]');
  assert.equal(await archiveCard.count(), 1);
  assert.equal(await archiveCard.getAttribute("data-category"), "other");
  assert.match(await archiveCard.innerText(), /月次決算体制の構築支援 実践勉強会アーカイブ/);
  await page.locator("#category-filter").selectOption("other");
  assert.equal(await page.locator(".tool-item:visible").count(), 4);
  assert.equal(await page.locator("#visible-count").innerText(), "4");
  await page.getByRole("button", { name: "リセット" }).click();

  const voucherCard = page.locator('.tool-item[href="./demo-voucher/"]');
  assert.equal(await voucherCard.count(), 1);
  assert.equal(await voucherCard.getAttribute("data-category"), "other");
  assert.equal(await voucherCard.getAttribute("data-role"), "staff");
  await page.getByPlaceholder("ツール名・業務内容で検索").fill("証憑デモ工房");
  assert.equal(await page.locator(".tool-item:visible").count(), 1);
  assert.equal(await voucherCard.isVisible(), true);
  await page.getByRole("button", { name: "リセット" }).click();

  await page.getByPlaceholder("ツール名・業務内容で検索").fill("消費税");
  assert.equal(await page.locator(".tool-item:visible").count(), 4);
  await page.getByPlaceholder("ツール名・業務内容で検索").fill("経過措置");
  assert.equal(await page.locator(".tool-item:visible").count(), 1);
  const invoiceCard = page.locator('.tool-item[href="https://takatrp.github.io/invoice-transition-impact/"]');
  assert.equal(await invoiceCard.isVisible(), true);
  assert.equal(await invoiceCard.getAttribute("data-category"), "advice");
  assert.equal(await page.locator("#visible-count").innerText(), "1");
  await page.getByRole("button", { name: "リセット" }).click();
  assert.equal(await page.locator(".tool-item:visible").count(), 15);

  await Promise.all([
    page.waitForNavigation({ waitUntil: "domcontentloaded" }),
    page.getByRole("button", { name: "ロック" }).click(),
  ]);
  assert.equal(await page.locator("#auth-screen").isVisible(), true);
  assert.equal(await page.locator("#portal-content").isVisible(), false);
  assert.equal(await page.locator("script[src*='googletagmanager.com']").count(), 0);

  await page.setViewportSize({ width: 360, height: 740 });
  const dimensions = await page.evaluate(() => ({
    innerWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  assert.ok(dimensions.scrollWidth <= dimensions.innerWidth, "Mobile layout must not overflow horizontally");

  const voucherContext = await browser.newContext({ acceptDownloads: true });
  const voucherPage = await voucherContext.newPage();
  voucherPage.on("pageerror", (error) => { runtimeErrors.push(error.message); console.error("VOUCHER_PAGE_ERROR", error.message); });
  await voucherPage.goto(new URL("./demo-voucher/", portalUrl).href, { waitUntil: "domcontentloaded" });
  await voucherPage.waitForFunction(() => !document.getElementById("downloadZip").disabled, undefined, { timeout: 90_000 }).catch(async error => {
    console.error("VOUCHER_INITIAL_STATE", await voucherPage.locator("body").innerText(), runtimeErrors);
    throw error;
  });
  assert.match(await voucherPage.locator("#resultSummary").innerText(), /20件/);
  assert.equal(await voucherPage.locator(".doc-row").count(), 20);
  assert.equal(await voucherPage.locator('a[href="../"]').innerText(), "スタッフポータルへ");
  const pdfWait = voucherPage.waitForEvent("download");
  await voucherPage.locator("#downloadPdf").click();
  const pdfDownload = await pdfWait;
  const pdfBytes = await readFile(await pdfDownload.path());
  assert.equal(pdfBytes.subarray(0, 5).toString(), "%PDF-");
  await inspect(pdfBytes, true);
  const zipWait = voucherPage.waitForEvent("download");
  await voucherPage.locator("#downloadZip").click();
  const zipDownload = await zipWait;
  const zipBytes = await readFile(await zipDownload.path());
  assert.equal(zipBytes.readUInt32LE(0), 0x04034b50);
  assert.ok(zipBytes.includes(Buffer.from("01_投入用/")));
  assert.ok(zipBytes.includes(Buffer.from("02_照合用_投入禁止/")));
  const proofs = [...storedZip(zipBytes)].filter(([name]) => name.startsWith("01_投入用/"));
  assert.equal(proofs.length, 20);
  for (const [, bytes] of proofs) await inspect(bytes, true);
  console.log("VOUCHER_RANDOM_PREVIEW_OK", JSON.stringify(await verifyRandomPreview(voucherPage)));
  console.log("VOUCHER_HANDWRITING_OK", JSON.stringify(await verifyHandwriting(voucherPage)));
  console.log("VOUCHER_IMAGE_PROFILE_OK", JSON.stringify(await verifyImageProfile(voucherPage)));
  await voucherContext.close();

  console.log("VOUCHER_DEFAULTS_OK", JSON.stringify(await verifyVoucherDefaults(browser, new URL("./demo-voucher/", portalUrl).href)));
  console.log("VOUCHER_ANALYTICS_OK", JSON.stringify(await verifyVoucherAnalytics(browser)));

  assert.deepEqual(runtimeErrors, []);
  console.log("STAFF_PORTAL_E2E_OK");
} finally {
  await browser.close();
}
