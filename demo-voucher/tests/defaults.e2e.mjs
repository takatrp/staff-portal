import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { inspect } from './handwriting.e2e.mjs';

export async function verifyVoucherDefaults(browser, url, { outputDir } = {}) {
  const records = [];
  const cases = [
    { timezoneId: 'Asia/Tokyo', instant: '2026-10-15T15:05:00Z', start: '2026-09-16', end: '2026-10-16' },
    { timezoneId: 'America/Los_Angeles', instant: '2026-10-01T06:55:00Z', start: '2026-08-30', end: '2026-09-30' },
    { timezoneId: 'Asia/Tokyo', instant: '2026-01-01T00:00:00Z', start: '2025-12-01', end: '2026-01-01' },
    { timezoneId: 'America/New_York', instant: '2024-03-31T04:05:00Z', start: '2024-02-29', end: '2024-03-31' }
  ];
  if (outputDir) await mkdir(outputDir, { recursive: true });
  for (const [index, scenario] of cases.entries()) {
    const context = await browser.newContext({ timezoneId: scenario.timezoneId, acceptDownloads: true });
    // Keep verification traffic out of production analytics.
    await context.route(/https:\/\/(?:www\.googletagmanager\.com|[^/]*google-analytics\.com)\//,
      route => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.clock.install({ time: new Date(scenario.instant) });
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded' });
      await ready(page);
      assert.equal(await page.locator('#startDate').inputValue(), scenario.start);
      assert.equal(await page.locator('#endDate').inputValue(), scenario.end);
      assert.equal(await page.locator('#pdfMode').inputValue(), 'image');
      assert.equal(await page.locator('.doc-row').count(), 20);
      const dates = await page.locator('.doc-info small').allTextContents();
      assert.ok(dates.every(text => text.slice(0, 10) >= scenario.start && text.slice(0, 10) <= scenario.end));
      assert.match(await page.locator('#previewMeta').innerText(), /文字層なし/);
      const bytes = await downloadPdf(page), info = await inspect(bytes, true);
      assert.match((await page.locator('#documentImage').getAttribute('src')), /^data:image\/png/);
      await page.waitForFunction(() => document.getElementById('documentImage').naturalWidth > 0);
      if (outputDir) {
        await writeFile(`${outputDir}/initial-${index}.pdf`, bytes);
        await page.screenshot({ path: `${outputDir}/initial-${index}.png`, fullPage: true });
      }
      if (index === 0) {
        // Explicit settings survive normal generation, random generation and JSON import.
        await page.locator('#startDate').fill('2024-02-29');
        await page.locator('#endDate').fill('2024-03-03');
        await page.locator('#pdfMode').selectOption('text');
        await page.locator('#settingsForm button[type=submit]').click();
        await ready(page);
        await page.locator('#regenerate').click();
        await ready(page);
        await assertSettings(page, '2024-02-29', '2024-03-03', 'text');
        assert.ok((await downloadPdf(page)).includes(Buffer.from('/FontFile2')), 'explicit text PDF still embeds its font');
        await page.locator('details summary').click();
        await page.locator('#importConfig').setInputFiles({
          name: 'saved-config.json', mimeType: 'application/json',
          buffer: Buffer.from(JSON.stringify({ version: '1.3.0', invoiceCount: 1, receiptCount: 1,
            startDate: '2025-12-31', endDate: '2026-01-01', pdfMode: 'text', seed: 'saved-config' }))
        });
        await page.waitForFunction(() => document.getElementById('seed').value === 'saved-config');
        await ready(page);
        await assertSettings(page, '2025-12-31', '2026-01-01', 'text');
        for (const preset of ['standard', 'mixed', 'receipts', 'handwritten']) {
          await page.locator(`[data-preset="${preset}"]`).click();
          await ready(page);
          await assertSettings(page, '2025-12-31', '2026-01-01', 'image');
          await inspect(await downloadPdf(page), true);
        }
      }
      assert.deepEqual(errors, []);
      records.push({ ...scenario, ...info, initialCount: 20 });
    } finally {
      await context.close();
    }
  }
  return { records, explicitSettingsPreserved: true, importedTextModePreserved: true, presetsImageOnly: true };
}

async function ready(page) {
  await page.waitForFunction(() => !document.getElementById('downloadZip').disabled
    && document.getElementById('previewLoading').hidden, undefined, { timeout: 90_000 });
  assert.equal(await page.locator('#error').isVisible(), false);
}
async function downloadPdf(page) {
  const wait = page.waitForEvent('download');
  await page.locator('#downloadPdf').click();
  return readFile(await (await wait).path());
}
async function assertSettings(page, start, end, mode) {
  assert.equal(await page.locator('#startDate').inputValue(), start);
  assert.equal(await page.locator('#endDate').inputValue(), end);
  assert.equal(await page.locator('#pdfMode').inputValue(), mode);
}
