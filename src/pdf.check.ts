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
assert.deepEqual(P.jpegSize(photo), [300, 300]);
// A PDF with no photos is handed back as it was, never bigger.
const plain = await (async () => { const d = await PDFDocument.create(); d.addPage(); return d.save({ useObjectStreams: false }); })();
assert.ok((await P.compress(plain, { quality: 60 }, recode)).length <= plain.length);
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
// Unturned, placeTurned lands where placeOnPage does on every page rotation; turned 180° about its centre, an item's
// drawing origin moves to its opposite corner (a 400x600 page: box 40..140 across, 430..480 up).
for (const rot of [0, 90, 180, 270]) {
  const [dw, dh] = rot % 180 ? [600, 400] : [400, 600];
  const turned0 = P.placeTurned(0.1, 0.2, 0.5 * dw, 0.1 * dh, 0, 0, rot, 400, 600);
  const flat = P.placeOnPage(item, rot, 400, 600);
  assert.deepEqual([turned0.x, turned0.y, turned0.rotate].map(Math.round), [flat.x, flat.y, rot].map(Math.round), `rot ${rot}`);
}
const half = P.placeTurned(0.1, 0.2, 100, 50, 0, 180, 0, 400, 600);
assert.deepEqual([half.x, half.y, half.rotate].map(Math.round), [140, 480, -180]);
const signed = await PDFDocument.load(await P.fillSign(
  src,
  [
    { page: 0, kind: 'text', x: 0.1, y: 0.1, size: 0.03, text: 'Signed "here" — ok', color: '#1D4ED8', opacity: 0.5, angle: -15 },
    { page: 1, kind: 'image', x: 0.2, y: 0.2, w: 0.3, h: 0.2, uri: 'sig', opacity: 0.6, angle: 90 },
  ],
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
// The text reader is pluggable: the app hands PdfBox's in, here a stand-in proves the split follows what it reads.
assert.deepEqual(await counts(await P.splitByText(src, { phrase: 'invoice' }, async () => ['', 'Invoice 1', '', '', 'Invoice 2', ''])), [1, 3, 2]);

// ── Pages saved sideways (/Rotate 90) ─────────────────────────────────────
// Page 1 of `sideways` is stored 400x600 and shown 600x400, a book spread; page 2 is blank (no content stream).
const sideDoc = await PDFDocument.load(await P.rotate(src, { angle: 90, pages: '1' }));
sideDoc.removePage(2);
sideDoc.insertPage(1, [400, 600]);
const sideways = await sideDoc.save();
const halves = await PDFDocument.load((await P.splitHalf(sideways, { mode: 'vertical' }))[0].bytes);
// Left | Right of the spread as shown: turned clockwise, the stored bottom half is on the left. Each stays turned 90.
assert.deepEqual(cropBox(halves, 0), [0, 0, 400, 300]);
assert.deepEqual(cropBox(halves, 1), [0, 300, 400, 300]);
assert.equal(halves.getPage(0).getRotation().angle, 90);
// Redrawing tools keep sideways pages upright and cope with blank ones.
const up = await PDFDocument.load(await P.cropResize(sideways, { mode: 'resize', size: 'A4' }));
assert.deepEqual(Object.values(up.getPage(0).getSize()).map(Math.round), [842, 595]); // landscape, as shown
assert.equal((await PDFDocument.load(await P.flip(sideways, { axis: 'h' }))).getPage(0).getRotation().angle, 90);
assert.equal(await count(await P.nUp(sideways, { perSheet: '2' })), 3);
assert.equal(await count(await P.pageNumbers(sideways, { position: 'left', format: 'of' })), 6);
// 2 landscape pages per sheet stack on a portrait sheet rather than shrinking side by side.
const land = await (async () => { const d = await PDFDocument.create(); d.addPage([800, 450]); d.addPage([800, 450]); return d.save(); })();
assert.ok((await PDFDocument.load(await P.nUp(land, { perSheet: '2' }))).getPage(0).getHeight() > 800);
// A page listed twice turns once.
const twice = await PDFDocument.load(await P.rotate(src, { angle: 90, pages: '2, 1-2' }));
assert.deepEqual(twice.getPages().slice(0, 2).map((p) => p.getRotation().angle), [90, 90]);
// Text Helvetica can't write is folded or refused with a message, never a crash.
assert.equal(P.winAnsi('Total ₹500 — “ok” ✓'), 'Total Rs. 500 - "ok" ');
assert.equal(await count(await P.watermark(src, { text: 'PAID ₹ 👍' })), 6);
await assert.rejects(P.watermark(src, { text: 'गोपनीय' }), /Latin/);
assert.deepEqual((await P.pageInfo(src))[0], { width: 400, height: 600, rot: 0 });
const z = P.zip([f(src), f(src)]);
assert.equal(String.fromCharCode(z[0], z[1]), 'PK');
console.log('pdf ops: all checks passed');
