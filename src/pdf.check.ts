// npm run check — smoke-tests every PDF op in Node (native TS type stripping) against a generated 6-page file.
import assert from 'node:assert/strict';
import { PDFDocument, PDFName, PDFString, StandardFonts } from 'pdf-lib';
import jpeg from 'jpeg-js';
import * as P from './pdf.ts';

const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
const noise = { width: 300, height: 300, data: Uint8Array.from({ length: 300 * 300 * 4 }, () => Math.random() * 255) };
const photo = new Uint8Array(jpeg.encode(noise, 100).data);
const img = await doc.embedJpg(photo);
for (let i = 1; i <= 6; i++) {
  const p = doc.addPage([400, 600]);
  p.drawText(i === 1 || i === 4 ? `Chapter ${i}` : `Body page ${i}`, { x: 50, y: 500, size: 20, font });
  if (i === 2) p.drawImage(img, { x: 50, y: 50, width: 300, height: 300 });
}
const ctx = doc.context;
const pages = doc.getPages();
const [outlines, a, b] = [ctx.nextRef(), ctx.nextRef(), ctx.nextRef()];
ctx.assign(a, ctx.obj({ Title: PDFString.of('Intro'), Parent: outlines, Next: b, Dest: [pages[0].ref, 'Fit'] }));
ctx.assign(b, ctx.obj({ Title: PDFString.of('Part Two'), Parent: outlines, Prev: a, Dest: [pages[3].ref, 'Fit'] }));
ctx.assign(outlines, ctx.obj({ Type: 'Outlines', First: a, Last: b, Count: 2 }));
doc.catalog.set(PDFName.of('Outlines'), outlines);
const src = await doc.save();

const f = (bytes: Uint8Array) => ({ name: 'in.pdf', bytes });
const count = async (x: Uint8Array) => (await PDFDocument.load(x)).getPageCount();
const counts = (outs: { bytes: Uint8Array }[]) => Promise.all(outs.map((o) => count(o.bytes)));

assert.deepEqual(P.parseRanges('1-2, 4, 5-', 6), [[0, 1], [3], [4, 5]]);
assert.throws(() => P.parseRanges('9', 6));
assert.equal(await count(await P.merge([f(src), f(src)])), 12);
assert.equal(await count(await P.alternate([f(src), f(src)], { reverse: true })), 12);
const recode: P.RecodeJpeg = async (b, q) => new Uint8Array(jpeg.encode(jpeg.decode(b, { useTArray: true, formatAsRGBA: true }), q).data);
const small = await P.compress(src, { quality: 30 }, recode);
assert.ok(small.length < src.length * 0.7, `compress ${src.length} -> ${small.length}`);
assert.equal(await count(small), 6);
assert.equal((await P.split(src, { mode: 'every' })).length, 6);
assert.deepEqual(await counts(await P.split(src, { mode: 'ranges', ranges: '1-2,3-' })), [2, 4]);
assert.deepEqual(await counts(await P.splitByText(src, { phrase: 'CHAPTER' })), [3, 3]);
await assert.rejects(P.splitByText(src, { phrase: 'zebra' }));
const marks = await P.splitByBookmarks(src);
assert.deepEqual(marks.map((m) => m.name), ['Intro', 'Part Two']);
assert.deepEqual(await counts(marks), [3, 3]);
assert.deepEqual(await counts(await P.splitHalf(src, { mode: 'file' })), [3, 3]);
assert.equal(await count((await P.splitHalf(src, { mode: 'vertical' }))[0].bytes), 12);
assert.deepEqual(await counts(await P.splitBySize(src, { maxMB: 0.05 })), [1, 1, 4]);
const rot = await PDFDocument.load(await P.rotate(src, { angle: 90, pages: '2' }));
assert.deepEqual(rot.getPages().map((p) => p.getRotation().angle), [0, 90, 0, 0, 0, 0]);
assert.equal(await count(await P.flip(src, { axis: 'both' })), 6);
assert.equal(await count(await P.nUp(src, { perSheet: '4' })), 2);
assert.equal(await count(await P.nUp(src, { perSheet: '16' })), 1);
assert.equal(await count(await P.nUp(src, { perSheet: '4', lines: true })), 2);
// Crop boxes are drawn on the page as displayed (y from the top); pages without one are left whole.
const keep: [number, number, number, number] = [0.1, 0.2, 0.5, 0.6]; // of a 400x600 page
const cropBox = (d: PDFDocument, i: number) => Object.values(d.getPage(i).getCropBox()).map(Math.round);
const cropped = await PDFDocument.load(await P.cropResize(src, { mode: 'crop', boxes: { 0: keep } }));
assert.equal(cropped.getPageCount(), 6);
assert.deepEqual(cropBox(cropped, 0), [40, 120, 200, 360]);
assert.deepEqual(cropBox(cropped, 1), [0, 0, 400, 600]);
// The same rect on a page the viewer turns 90° has to be turned back before it becomes a crop box.
const turned = await P.rotate(src, { angle: 90, pages: '1' });
const cropTurned = await PDFDocument.load(await P.cropResize(turned, { mode: 'crop', boxes: { 0: keep } }));
assert.deepEqual(cropBox(cropTurned, 0), [80, 60, 240, 300]);
await assert.rejects(P.cropResize(src, { mode: 'crop' }));
// Fill & Sign places items on the page as displayed; the origin is the item's own bottom-left corner, which lands on
// a different corner of the page as /Rotate turns it, and the item's width and height swap at 90 and 270.
const item: [number, number, number, number] = [0.1, 0.2, 0.5, 0.1];
const placed = (rot: number) => Object.values(P.placeOnPage(item, rot, 400, 600)).map(Math.round);
assert.deepEqual(placed(0), [40, 420, 200, 60]);
assert.deepEqual(placed(90), [120, 60, 300, 40]);
assert.deepEqual(placed(180), [360, 180, 200, 60]);
assert.deepEqual(placed(270), [280, 540, 300, 40]);
const signed = await PDFDocument.load(await P.fillSign(
  src,
  [{ page: 0, kind: 'text', x: 0.1, y: 0.1, size: 0.03, text: 'Signed "here" — ok' }, { page: 1, kind: 'image', x: 0.2, y: 0.2, w: 0.3, h: 0.2, uri: 'sig' }],
  { sig: photo },
));
assert.equal(signed.getPageCount(), 6);
const resized = await PDFDocument.load(await P.cropResize(src, { mode: 'resize', size: 'Letter' }));
assert.deepEqual(resized.getPage(0).getSize(), { width: 612, height: 792 });
assert.equal(await count(await P.watermark(src, { text: 'DRAFT', opacity: 0.2 })), 6);
assert.equal(await count(await P.pageNumbers(src, { position: 'right', format: 'of' })), 6);
const org = await PDFDocument.load(await P.organize(src, [{ i: 5, rot: 90 }, { i: 0, rot: 0 }]));
assert.equal(org.getPageCount(), 2);
assert.equal(org.getPage(0).getRotation().angle, 90);
// The scan PDF is assembled natively (PdfBox); what still runs here is the layout it is handed.
const sheets = (kind: P.PageKind, n = 1, size: P.PageSize = 'fit') =>
  P.layoutScanPage(kind, size, Array(n).fill({ width: 300, height: 300 }));
assert.equal(sheets('doc').length + sheets('whiteboard', 1, 'A4-landscape').length, 2);
// book splits into two pages, an ID card's front and back share one
assert.equal(sheets('book').length + sheets('id', 2).length + sheets('card').length, 4);
assert.equal(sheets('id', 2)[0].items.length, 2);
assert.deepEqual(sheets('book')[1].items[0].crop, { x: 0.5, y: 0, w: 0.5, h: 1 });
const letter = sheets('doc', 1, 'Letter-portrait')[0];
assert.deepEqual([letter.W, letter.H], [612, 792]);
const extracted = await P.extractAllText(src);
assert.equal(extracted.length, 6);
assert.ok(extracted[0].text.includes('Chapter 1'));
assert.ok(extracted[3].text.includes('Chapter 4'));
assert.deepEqual((await P.pageInfo(src))[0], { width: 400, height: 600, rot: 0 });
const z = P.zip([f(src), f(src)]);
assert.equal(String.fromCharCode(z[0], z[1]), 'PK');
console.log('pdf ops: all checks passed');
