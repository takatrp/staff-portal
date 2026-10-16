const { test } = require('node:test');
const assert = require('node:assert/strict');
const PDF = require('../vendor/pdf-lib.min.js');
async function fixture({ pixels = 300, drawnSize = 72, colorSpace = 'DeviceRGB', bits = 8, mask = false, text = false, version = '1.4' } = {}) {
  const doc = await PDF.PDFDocument.create(), page = doc.addPage([72, 72]);
  const stream = doc.context.flateStream(new Uint8Array(pixels * pixels * 3).fill(255), {
    Type: 'XObject', Subtype: 'Image', Width: pixels, Height: pixels, ColorSpace: colorSpace, BitsPerComponent: bits,
    ...(mask ? { Mask: [0, 0, 0, 0, 0, 0] } : {})
  });
  const ref = doc.context.register(stream);
  page.node.set(PDF.PDFName.of('Resources'), doc.context.obj({ XObject: { Im: ref } }));
  page.node.addContentStream(doc.context.register(doc.context.flateStream(`q\n${drawnSize} 0 0 ${drawnSize} 0 0 cm\n/Im Do\nQ\n${text ? 'BT\nET\n' : ''}`)));
  const bytes = await doc.save({ useObjectStreams: false });
  bytes.set(new TextEncoder().encode('%PDF-' + version), 0);
  return bytes;
}
test('保存PDFの画像位置・実効解像度・RGB24bit・可逆圧縮を検査する', async () => {
  const { inspectImagePdf } = await import('./image-profile.e2e.mjs');
  const info = await inspectImagePdf(await fixture());
  assert.equal(info.dpiX, 300); assert.equal(info.dpiY, 300);
  assert.equal(info.colorSpace, 'DeviceRGB'); assert.equal(info.bitsPerComponent, 8);
  assert.equal(info.pdfVersion, '1.4');
});
test('画素数不足と、ページ寸法だけでは見逃す画像の拡大配置を拒否する', async () => {
  const { inspectImagePdf } = await import('./image-profile.e2e.mjs');
  await assert.rejects(() => fixture({ pixels: 199 }).then(inspectImagePdf));
  await assert.rejects(() => fixture({ pixels: 300, drawnSize: 144 }).then(inspectImagePdf));
});
test('グレースケール・低階調・透過マスク・文字層・想定外バージョンを拒否する', async () => {
  const { inspectImagePdf } = await import('./image-profile.e2e.mjs');
  for (const options of [{ colorSpace: 'DeviceGray' }, { bits: 1 }, { mask: true }, { text: true }, { version: '1.7' }]) {
    await assert.rejects(() => fixture(options).then(inspectImagePdf), JSON.stringify(options));
  }
});
test('RGB画素の圧縮後ハッシュが変われば拒否する', async () => {
  const { inspectImagePdf } = await import('./image-profile.e2e.mjs');
  await assert.rejects(() => fixture().then(bytes => inspectImagePdf(bytes, { pixelHash: 'wrong-pixels' })));
});
