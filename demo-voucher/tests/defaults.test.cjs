const { test } = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const C = require('../core.js');

test('前月同日、月末、年越し、うるう年の初期範囲', () => {
  for (const [today, start] of [
    ['2026-10-16', '2026-09-16'], ['2026-03-31', '2026-02-28'],
    ['2026-03-30', '2026-02-28'], ['2026-05-31', '2026-04-30'],
    ['2026-12-31', '2026-11-30'], ['2026-01-01', '2025-12-01'],
    ['2026-01-31', '2025-12-31'], ['2024-03-31', '2024-02-29'],
    ['2024-03-29', '2024-02-29'], ['2024-02-29', '2024-01-29']
  ]) {
    const [year, month, day] = today.split('-').map(Number);
    assert.deepEqual(C.defaultDateRange(new Date(year, month - 1, day, 0, 5)),
      { startDate: start, endDate: today }, today);
  }
});

test('UTC日付が異なる深夜・日付変更線・夏時間でも端末の現地日付を使う', () => {
  for (const [timezone, instant, start, end] of [
    ['Asia/Tokyo', '2026-10-15T15:05:00Z', '2026-09-16', '2026-10-16'],
    ['America/Los_Angeles', '2026-10-01T06:55:00Z', '2026-08-30', '2026-09-30'],
    ['Pacific/Kiritimati', '2025-12-31T10:05:00Z', '2025-12-01', '2026-01-01'],
    ['Pacific/Pago_Pago', '2026-01-01T10:55:00Z', '2025-11-30', '2025-12-31'],
    ['America/New_York', '2024-03-31T04:05:00Z', '2024-02-29', '2024-03-31'],
    ['Europe/Berlin', '2026-10-25T01:30:00Z', '2026-09-25', '2026-10-25']
  ]) {
    const script = `const C=require(${JSON.stringify(require.resolve('../core.js'))});process.stdout.write(JSON.stringify(C.defaultDateRange(new Date(${JSON.stringify(instant)}))));`;
    const result = spawnSync(process.execPath, ['-e', script], {
      env: { ...process.env, TZ: timezone }, encoding: 'utf8'
    });
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(JSON.parse(result.stdout), { startDate: start, endDate: end }, timezone);
  }
});

test('起動日を固定せず、config呼び出し時の日付と画像PDFを初期値にする', () => {
  let instant = '2026-03-31T12:00:00';
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [instant])); }
  }
  const context = { Date: ClockDate, TextEncoder };
  runInNewContext(readFileSync(require.resolve('../core.js'), 'utf8'), context);
  const config = () => JSON.parse(JSON.stringify(context.VoucherCore.config()));
  assert.equal(config().startDate, '2026-02-28');
  assert.equal(config().endDate, '2026-03-31');
  assert.equal(config().pdfMode, 'image');
  instant = '2026-04-01T12:00:00';
  assert.equal(config().startDate, '2026-03-01');
  assert.equal(config().endDate, '2026-04-01');
});

test('入力済みの日付・文字ありPDFを保持し、明示した条件の再現性を保つ', () => {
  const input = { startDate: '2024-02-29', endDate: '2024-03-03', pdfMode: 'text', seed: 'saved-conditions' };
  const config = C.config(input);
  for (const key of Object.keys(input)) assert.equal(config[key], input[key]);
  const batch = C.generate(config);
  assert.deepEqual(C.generate(JSON.parse(JSON.stringify(batch.config))), batch);
  assert.ok(batch.documents.every(doc => doc.pdfMode === 'text' && doc.date >= input.startDate && doc.date <= input.endDate));
  assert.ok(C.generate().documents.every(doc => doc.pdfMode === 'image'));
});

test('初期化は空の日付だけを補い、ブラウザで復元された値を上書きしない', () => {
  const source = readFileSync(require.resolve('../app.js'), 'utf8');
  const init = source.slice(source.indexOf('const initialDates='), source.indexOf("$('version').textContent"));
  for (const values of [{ startDate: '', endDate: '' }, { startDate: '2024-02-01', endDate: '2024-02-29' }, { startDate: '2024-02-01', endDate: '' }]) {
    const elements = Object.fromEntries(Object.entries(values).map(([key, value]) => [key, { value }]));
    runInNewContext(init, { C: { defaultDateRange: () => ({ startDate: '2026-09-16', endDate: '2026-10-16' }) }, $: key => elements[key] });
    assert.equal(elements.startDate.value, values.startDate || '2026-09-16');
    assert.equal(elements.endDate.value, values.endDate || '2026-10-16');
  }
});
