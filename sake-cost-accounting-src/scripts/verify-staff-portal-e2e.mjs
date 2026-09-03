import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { chromium } from "@playwright/test";

const portalUrl = "http://127.0.0.1:4173/";
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

const browser = await chromium.launch({ headless: true });
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
  assert.equal(await page.locator(".tool-item:visible").count(), 12);
  assert.equal(await page.locator("#visible-count").innerText(), "12");
  assert.equal(await page.locator("script[src*='googletagmanager.com']").count(), 1);

  const archiveCard = page.locator('.tool-item[href="https://takatrp.github.io/mirai-archive/"]');
  assert.equal(await archiveCard.count(), 1);
  assert.equal(await archiveCard.getAttribute("data-category"), "other");
  assert.match(await archiveCard.innerText(), /月次決算体制の構築支援 実践勉強会アーカイブ/);
  await page.locator("#category-filter").selectOption("other");
  assert.equal(await page.locator(".tool-item:visible").count(), 3);
  assert.equal(await page.locator("#visible-count").innerText(), "3");
  await page.getByRole("button", { name: "リセット" }).click();

  await page.getByPlaceholder("ツール名・業務内容で検索").fill("消費税");
  assert.equal(await page.locator(".tool-item:visible").count(), 2);
  assert.equal(await page.locator("#visible-count").innerText(), "2");
  await page.getByRole("button", { name: "リセット" }).click();
  assert.equal(await page.locator(".tool-item:visible").count(), 12);

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
  assert.deepEqual(runtimeErrors, []);
  console.log("STAFF_PORTAL_E2E_OK");
} finally {
  await browser.close();
}
