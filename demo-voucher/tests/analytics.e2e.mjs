import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

// Real Google tag, with every collection request intercepted: no test data enters GA4.
export async function verifyVoucherAnalytics(browser) {
  const context = await browser.newContext({ acceptDownloads: true });
  const page = await context.newPage();
  const hits = [], errors = [];
  const canonical = 'https://takatrp.github.io/staff-portal/demo-voucher/';
  page.on('pageerror', error => errors.push(error.message));
  await context.route('https://takatrp.github.io/staff-portal/**', async route => {
    const url = new URL(route.request().url());
    let relative = url.pathname.slice('/staff-portal/'.length);
    if (relative.endsWith('/')) relative += 'index.html';
    assert.ok(!relative.includes('..'));
    const contentType = relative.endsWith('.html') ? 'text/html' : relative.endsWith('.js')
      ? 'application/javascript' : relative.endsWith('.css') ? 'text/css' : 'application/octet-stream';
    await route.fulfill({ contentType, body: await readFile(new URL('../../' + relative, import.meta.url)) });
  });
  await context.route(/https:\/\/[^/]*google-analytics\.com\//, async route => {
    hits.push({ url: route.request().url(), body: route.request().postData() || '' });
    await route.fulfill({ status: 204 });
  });
  try {
    await page.goto(canonical + '?seed=PRIVATE_QUERY#PRIVATE_HASH', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => !document.getElementById('downloadZip').disabled);
    const frame = page.frames().find(item => item.url() === canonical + 'analytics-frame.html');
    assert.ok(frame, 'Analytics uses a separate empty document');
    await frame.waitForFunction(() => !!window.google_tag_manager, { timeout: 30_000 });
    await page.locator('#seed').fill('PRIVATE_INPUT_87654');
    await page.locator('#settingsForm button[type=submit]').click();
    await page.waitForFunction(() => !document.getElementById('downloadZip').disabled);
    await page.locator('#downloadCsv').click();
    await page.locator('#downloadPdf').click();
    await page.waitForTimeout(8_000);
    const events = hits.flatMap(hit => {
      const query = new URL(hit.url).search.slice(1);
      return (hit.body ? hit.body.split('\n') : ['']).map(body => new URLSearchParams(query + '&' + body));
    });
    assert.equal(events.filter(event => event.get('en') === 'page_view').length, 1, 'One page_view');
    for (const event of events) {
      assert.equal(event.get('tid'), 'G-R4S7KNRPCP');
      assert.equal(event.get('dl'), canonical);
      assert.ok(!['form_start', 'form_submit', 'file_download', 'click'].includes(event.get('en')));
    }
    assert.doesNotMatch(decodeURIComponent(JSON.stringify(hits)), /PRIVATE|blob:|照合用|架空証憑/);
    assert.deepEqual(errors, []);
    assert.equal(await page.locator('script[src*="googletagmanager"]').count(), 0);
    assert.equal(await frame.locator('form, input, a, img').count(), 0);
    return { pageViews: 1, events: events.map(event => event.get('en')), privateInputSent: false };
  } finally {
    await context.close();
  }
}
