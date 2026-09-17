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
assert.equal(await count(await P.cropResize(src, { mode: 'crop', margin: 10 })), 6);
const resized = await PDFDocument.load(await P.cropResize(src, { mode: 'resize', size: 'Letter' }));
assert.deepEqual(resized.getPage(0).getSize(), { width: 612, height: 792 });
assert.equal(await count(await P.watermark(src, { text: 'DRAFT', opacity: 0.2 })), 6);
assert.equal(await count(await P.pageNumbers(src, { position: 'right', format: 'of' })), 6);
const org = await PDFDocument.load(await P.organize(src, [{ i: 5, rot: 90 }, { i: 0, rot: 0 }]));
assert.equal(org.getPageCount(), 2);
assert.equal(org.getPage(0).getRotation().angle, 90);
const scan = (kind: P.PageKind, n = 1, size: P.PageSize = 'fit') => ({ kind, size, images: Array(n).fill(photo) });
assert.equal(await count(await P.imagesToPdf([scan('doc'), scan('whiteboard', 1, 'A4-landscape')])), 2);
// book splits into two pages, an ID card's front and back share one
assert.equal(await count(await P.imagesToPdf([scan('book'), scan('id', 2), scan('card')])), 4);
const letter = await PDFDocument.load(await P.imagesToPdf([scan('doc', 1, 'Letter-portrait')]));
assert.deepEqual(letter.getPage(0).getSize(), { width: 612, height: 792 });
await assert.rejects(P.imagesToPdf([]));
const extracted = await P.extractAllText(src);
assert.equal(extracted.length, 6);
assert.ok(extracted[0].text.includes('Chapter 1'));
assert.ok(extracted[3].text.includes('Chapter 4'));
assert.deepEqual((await P.pageInfo(src))[0], { width: 400, height: 600, rot: 0 });
const z = P.zip([f(src), f(src)]);
assert.equal(String.fromCharCode(z[0], z[1]), 'PK');
console.log('pdf ops: all checks passed');
