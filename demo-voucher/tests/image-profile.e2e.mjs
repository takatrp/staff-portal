import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import { inflateSync } from 'node:zlib';
const require = createRequire(import.meta.url), PDF = require('../vendor/pdf-lib.min.js');

// Inspect the saved PDF, including the image's actual placement, rather than PNG dpi metadata.
export async function inspectImagePdf(bytes, { pixelHash } = {}) {
  const data = Buffer.from(bytes), pdf = await PDF.PDFDocument.load(bytes);
  assert.equal(data.subarray(0, 8).toString(), '%PDF-1.4');
  assert.equal(pdf.getPageCount(), 1);
  assert.equal(pdf.isEncrypted, false);
  assert.equal(pdf.catalog.get(PDF.PDFName.of('Version')), undefined, 'No higher catalog-version override');
  const page = pdf.getPages()[0], resources = page.node.Resources();
  assert.equal(page.getRotation().angle, 0);
  assert.equal(page.node.get(PDF.PDFName.of('UserUnit'))?.asNumber() || 1, 1);
  assert.equal(resources.lookupMaybe(PDF.PDFName.of('Font'), PDF.PDFDict)?.keys().length || 0, 0);
  assert.equal(resources.lookupMaybe(PDF.PDFName.of('ExtGState'), PDF.PDFDict)?.keys().length || 0, 0);
  const objects = resources.lookup(PDF.PDFName.of('XObject'), PDF.PDFDict);
  assert.equal(objects.keys().length, 1);
  const [name, ref] = objects.entries()[0], image = pdf.context.lookup(ref, PDF.PDFRawStream);
  const attr = key => image.dict.get(PDF.PDFName.of(key));
  assert.equal(attr('Subtype').toString(), '/Image');
  assert.equal(attr('ColorSpace').toString(), '/DeviceRGB');
  assert.equal(attr('BitsPerComponent').asNumber(), 8);
  assert.equal(attr('Filter').toString(), '/FlateDecode');
  for (const key of ['SMask', 'Mask', 'Decode', 'DecodeParms', 'ImageMask']) assert.equal(attr(key), undefined, key);
  const contents = page.node.Contents(), refs = contents instanceof PDF.PDFArray ? contents.asArray() : [contents];
  const commands = refs.map(ref => {
    const stream = pdf.context.lookup(ref, PDF.PDFRawStream);
    assert.equal(stream.dict.get(PDF.PDFName.of('Filter'))?.toString(), '/FlateDecode');
    return inflateSync(stream.getContents()).toString('latin1');
  }).join('\n');
  assert.doesNotMatch(commands, /\b(?:BT|ET|Tf|Tj|TJ)\b/);
  let matrix = [1, 0, 0, 1, 0, 0]; const stack = [], draws = [];
  for (const line of commands.trim().split(/\r?\n/)) {
    const parts = line.trim().split(/\s+/), op = parts.pop();
    if (op === 'q') stack.push([...matrix]);
    else if (op === 'Q') { assert.ok(stack.length); matrix = stack.pop(); }
    else if (op === 'cm') { assert.equal(parts.length, 6); matrix = multiply(matrix, parts.map(Number)); }
    else if (op === 'Do') { assert.equal(parts[0], name.toString()); draws.push([...matrix]); }
    else assert.fail('Unexpected image-page operator: ' + op);
  }
  assert.equal(stack.length, 0); assert.equal(draws.length, 1);
  const [a, b, c, d, x, y] = draws[0];
  assert.deepEqual([b, c, x, y], [0, 0, 0, 0]);
  assert.equal(a, page.getWidth()); assert.equal(d, page.getHeight());
  const width = attr('Width').asNumber(), height = attr('Height').asNumber();
  const dpiX = width * 72 / Math.hypot(a, b), dpiY = height * 72 / Math.hypot(c, d);
  assert.ok(dpiX >= 300 && dpiY >= 300, `Actual image placement must be >=300dpi: ${dpiX}, ${dpiY}`);
  const rgb = inflateSync(image.getContents());
  assert.equal(rgb.length, width * height * 3, '8 bits for each of three RGB components');
  const hash = createHash('sha256').update(rgb).digest('hex');
  if (pixelHash) assert.equal(hash, pixelHash, 'Lossless PDF image must exactly match source RGB pixels');
  assert.ok(data.includes(Buffer.from('\nxref\n')), 'Classic cross-reference table');
  for (const [, object] of pdf.context.enumerateIndirectObjects()) {
    if (object instanceof PDF.PDFRawStream) {
      assert.notEqual(object.dict.get(PDF.PDFName.of('Type'))?.toString(), '/ObjStm');
      assert.notEqual(object.dict.get(PDF.PDFName.of('Type'))?.toString(), '/XRef');
    }
  }
  return { widthPt: page.getWidth(), heightPt: page.getHeight(), width, height, dpiX, dpiY,
    colorSpace: 'DeviceRGB', bitsPerComponent: 8, compression: 'FlateDecode', transparent: false,
    pdfVersion: '1.4', fonts: 0, pixelHash: hash, bytes: data.length };
}
function multiply([a,b,c,d,e,f], [g,h,i,j,k,l]) {
  return [a*g+c*h,b*g+d*h,a*i+c*j,b*i+d*j,a*k+c*l+e,b*k+d*l+f];
}

export async function verifyImageProfile(page, { outputDir } = {}) {
  const ids = await page.evaluate(() => {
    const config = { startDate: '2026-10-01', endDate: '2026-10-01', seed: 'image-profile-audit', pdfMode: 'image', taxMix: 'mixed' };
    const docs = VoucherCore.generate(config).documents;
    const cases = docs.filter(d => d.type === 'invoice').map(d => ({ id: `invoice-${d.template}`, doc: d }));
    for (const doc of docs.filter(d => d.type === 'receipt')) for (const count of [3, 8]) {
      const copy = structuredClone(doc);
      copy.items = Array.from({ length: count }, (_, index) => ({ ...doc.items[index % doc.items.length] }));
      copy.totals = VoucherCore.totals(copy.items, copy.pricing, copy.rounding);
      copy.tender = copy.payment.startsWith('現金') ? Math.ceil(copy.totals.gross/1000)*1000 : copy.totals.gross;
      copy.change = copy.tender-copy.totals.gross;
      cases.push({ id: `receipt-${copy.template}-${count}`, doc: copy });
    }
    for (const handwriting of ['neat', 'natural', 'uneven', 'scrawl']) {
      for (const doc of VoucherCore.generate({ ...config, invoiceCount: 0, receiptCount: 3, receiptStyle: 'handwritten', handwriting }).documents) {
        cases.push({ id: `handwritten-${doc.template}-${handwriting}`, doc });
      }
    }
    cases.push({ id: 'four-point-sample', doc: docs[0], fourPoint: true });
    window.__imageProfileCases = cases;
    return cases.map(item => item.id);
  });
  assert.equal(ids.length, 43); assert.equal(new Set(ids).size, 43);
  if (outputDir) await mkdir(outputDir, { recursive: true });
  const records = [];
  for (const [index, id] of ids.entries()) {
    const result = await page.evaluate(async index => {
      const { doc, fourPoint } = window.__imageProfileCases[index], raster = VoucherArtwork.raster;
      if (fourPoint) VoucherArtwork.raster = async page => {
        page._demoPaint.push({ op: 'text', text: '4pt 0123456789 ABCDEFGH 領収書 請求書 金額 消費税',
          family: 'DemoNotoJP', size: 4, x: 8, baseline: page.getHeight()-3, color: [0,0,0], rotation: 0 });
        return raster(page);
      };
      let bytes;
      try { bytes = await VoucherPDF.voucher(doc); } finally { VoucherArtwork.raster = raster; }
      const png = await VoucherPDF.previewFor(bytes), image = new Image(); image.src = png; await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
      const ctx = canvas.getContext('2d', { alpha: false, colorSpace: 'srgb' }); ctx.drawImage(image, 0, 0);
      const rgba = ctx.getImageData(0, 0, canvas.width, canvas.height).data, rgb = new Uint8Array(image.width*image.height*3);
      for (let from = 0, to = 0; from < rgba.length; from += 4) {
        if (rgba[from+3] !== 255) throw Error('Transparent source pixel');
        rgb[to++] = rgba[from]; rgb[to++] = rgba[from+1]; rgb[to++] = rgba[from+2];
      }
      const digest = await crypto.subtle.digest('SHA-256', rgb);
      return { bytes: Array.from(bytes), png, pixelHash: Array.from(new Uint8Array(digest), n => n.toString(16).padStart(2,'0')).join('') };
    }, index);
    const bytes = Buffer.from(result.bytes), info = await inspectImagePdf(bytes, { pixelHash: result.pixelHash });
    records.push({ id, ...info });
    if (outputDir) {
      await writeFile(`${outputDir}/${id}.pdf`, bytes);
      await writeFile(`${outputDir}/${id}.png`, Buffer.from(result.png.split(',')[1], 'base64'));
    }
  }
  if (outputDir) await writeFile(`${outputDir}/measurements.json`, JSON.stringify(records, null, 2));
  return { cases: records.length, minDpi: Math.min(...records.flatMap(r => [r.dpiX,r.dpiY])),
    maxDpi: Math.max(...records.flatMap(r => [r.dpiX,r.dpiY])), rgb24: true, transparent: false,
    losslessPixelHashesMatched: records.length, pdfVersion: '1.4', textLayer: false };
}
