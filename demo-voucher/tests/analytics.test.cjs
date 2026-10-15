const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const loader = readFileSync(require.resolve('../analytics.js'), 'utf8');
const source = readFileSync(require.resolve('../analytics-frame.js'), 'utf8');
const canonical = 'https://takatrp.github.io/staff-portal/demo-voucher/';
function context(url, framed = false) {
  const scripts = [], frames = [], window = {};
  window.parent = framed ? { location: new URL(canonical) } : window;
  return { window, location: new URL(url), scripts, frames, document: {
    createElement: () => ({ setAttribute() {} }),
    head: { appendChild: s => scripts.push(s) },
    body: { appendChild: s => frames.push(s) }
  } };
}
test('本番の2つの入口で計測用iframeを一度だけ読み込む', () => {
  for (const suffix of ['', 'index.html']) {
    const c = context(canonical + suffix + '?seed=PRIVATE#PRIVATE');
    runInNewContext(loader, c); runInNewContext(loader, c);
    assert.equal(c.frames.length, 1);
    assert.equal(c.frames[0].src, 'analytics-frame.html');
    assert.equal(c.frames[0].referrerPolicy, 'no-referrer');
    assert.equal(c.scripts.length, 0);
  }
});
test('開発・他ツール・オプトアウトではiframeを読み込まない', () => {
  for (const url of ['http://localhost:4173/demo-voucher/', 'https://takatrp.github.io/staff-portal/', canonical + 'other.html']) {
    const c = context(url); runInNewContext(loader, c); assert.equal(c.frames.length, 0);
  }
  const c = context(canonical); c.window['ga-disable-G-R4S7KNRPCP'] = true;
  runInNewContext(loader, c); assert.equal(c.frames.length, 0);
});
test('固定URL・タイトルのみをconfigで一度送信し入力や参照元を読まない', () => {
  const c = context(canonical + 'analytics-frame.html', true);
  runInNewContext(source, c); runInNewContext(source, c);
  assert.equal(c.scripts.length, 1);
  assert.equal(c.scripts[0].src, 'https://www.googletagmanager.com/gtag/js?id=G-R4S7KNRPCP');
  const commands = c.window.dataLayer;
  assert.equal(commands.length, 2);
  assert.equal(commands[1][0], 'config');
  assert.equal(commands[1][1], 'G-R4S7KNRPCP');
  assert.equal(commands[1][2].page_location, canonical);
  assert.equal(commands[1][2].page_referrer, '');
  assert.equal(commands[1][2].allow_google_signals, false);
  assert.equal(commands[1][2].allow_ad_personalization_signals, false);
  assert.equal(commands.some(x => x[0] === 'event'), false);
  assert.doesNotMatch(source, /parent\.document|postMessage|querySelector|\.value|localStorage/);
});
test('同意設定は変更せず引き継ぎ、他の親データは渡さない', () => {
  const c = context(canonical + 'analytics-frame.html', true);
  const denied = ['consent', 'default', { analytics_storage: 'denied' }];
  c.window.parent.dataLayer = [denied, ['event', 'private', { seed: 'PRIVATE' }]];
  runInNewContext(source, c);
  assert.equal(c.window.dataLayer[0], denied);
  assert.doesNotMatch(JSON.stringify(c.window.dataLayer), /PRIVATE|granted/);
});
test('iframeの直接表示・別の親・オプトアウトは計測しない', () => {
  for (const mode of ['direct', 'other', 'optout']) {
    const c = context(canonical + 'analytics-frame.html', mode !== 'direct');
    if (mode === 'other') c.window.parent.location = new URL('https://takatrp.github.io/other/');
    if (mode === 'optout') c.window.parent['ga-disable-G-R4S7KNRPCP'] = true;
    runInNewContext(source, c); assert.equal(c.scripts.length, 0);
  }
});
test('証憑画面の外部通信・外部スクリプト禁止を維持する', () => {
  const html = readFileSync(require.resolve('../index.html'), 'utf8');
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /script-src 'self';/);
  assert.doesNotMatch(html, /googletagmanager|google-analytics/);
  assert.match(html, /アクセス数のみ計測/);
  const frame = readFileSync(require.resolve('../analytics-frame.html'), 'utf8');
  assert.doesNotMatch(frame, /<form|<input|<a[ >]|<img/);
});
