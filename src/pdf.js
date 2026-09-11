// Every operation runs on-device with pure-JS libs: bytes in, bytes out.
// Ops returning several files give [{ name, bytes }]; the rest return bytes.
import {
  PDFDocument, PDFName, PDFDict, PDFArray, PDFRawStream, PDFNumber, PDFString, PDFHexString,
  StandardFonts, rgb, degrees, decodePDFRawStream,
} from 'pdf-lib';
import { zipSync } from 'fflate';
import jpeg from 'jpeg-js';

const N = PDFName.of;
const A4 = [595.28, 841.89];
export const SIZES = { A4, A5: [419.53, 595.28], Letter: [612, 792], Legal: [612, 1008] };
const range = (n, from = 0) => Array.from({ length: Math.max(0, n) }, (_, i) => from + i);

const load = (bytes) =>
  PDFDocument.load(bytes).catch((e) => {
    throw new Error(/encrypt/i.test(e.message)
      ? 'This PDF is password-protected. Unlock it first.'
      : 'Could not read this PDF. The file may be damaged.');
  });

async function pick(src, indices) {
  const out = await PDFDocument.create();
  (await out.copyPages(src, indices)).forEach((p) => out.addPage(p));
  return out.save();
}

// "1-3, 5, 8-" -> [[0,1,2],[4],[7..n-1]]
export function parseRanges(str, n) {
  const parts = str.split(',').map((s) => s.trim()).filter(Boolean);
  if (!parts.length) throw new Error('Enter page ranges, e.g. 1-3, 5');
  return parts.map((part) => {
    const [a, b] = part.split('-').map((x) => x.trim());
    const start = Math.max(1, parseInt(a, 10) || 1);
    const end = Math.min(n, b === undefined ? start : parseInt(b, 10) || n);
    if (!(start <= end)) throw new Error(`"${part}" is outside pages 1–${n}`);
    return range(end - start + 1, start - 1);
  });
}

export const pageInfo = async (bytes) =>
  (await load(bytes)).getPages().map((p) => ({ ...p.getSize(), rot: p.getRotation().angle }));

export async function merge(files) {
  const out = await PDFDocument.create();
  for (const f of files) {
    const src = await load(f.bytes);
    (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
  }
  return out.save();
}

export async function alternate(files, { reverse }) {
  const out = await PDFDocument.create();
  const stacks = [];
  for (const [i, f] of files.entries()) {
    const src = await load(f.bytes);
    const idx = src.getPageIndices();
    stacks.push(await out.copyPages(src, reverse && i > 0 ? idx.reverse() : idx));
  }
  const longest = Math.max(...stacks.map((s) => s.length));
  for (let i = 0; i < longest; i++) stacks.forEach((s) => s[i] && out.addPage(s[i]));
  return out.save();
}

function encodeJpeg(img, quality) {
  // ponytail: jpeg-js's encoder calls Buffer.from under CommonJS and RN has no Buffer,
  // so lend a stub for this synchronous call. Swap for a native image lib if speed matters.
  const had = globalThis.Buffer;
  if (!had) globalThis.Buffer = { from: (a) => Uint8Array.from(a) };
  try { return new Uint8Array(jpeg.encode(img, quality).data); } finally { if (!had) delete globalThis.Buffer; }
}

// Re-encodes embedded JPEG photos/scans (where the bulk of a PDF's size lives),
// drops XMP metadata and packs objects into compressed object streams.
export async function compress(bytes, { quality = 60 } = {}) {
  const doc = await load(bytes);
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const d = obj.dict;
    if (d.get(N('Subtype')) !== N('Image') || d.get(N('Filter')) !== N('DCTDecode')) continue;
    try {
      const img = jpeg.decode(obj.contents, { useTArray: true, formatAsRGBA: true });
      const out = encodeJpeg(img, +quality);
      if (out.length >= obj.contents.length) continue;
      d.set(N('ColorSpace'), N('DeviceRGB'));
      d.delete(N('Decode'));
      d.set(N('Length'), PDFNumber.of(out.length));
      doc.context.assign(ref, PDFRawStream.of(d, out));
    } catch {
      // unusual JPEG flavour: keep the original image
    }
  }
  doc.catalog.delete(N('Metadata'));
  return doc.save({ useObjectStreams: true });
}

export async function split(bytes, { mode, ranges }) {
  const src = await load(bytes);
  const groups = mode === 'ranges'
    ? parseRanges(ranges, src.getPageCount())
    : src.getPageIndices().map((i) => [i]);
  return Promise.all(groups.map(async (g) => ({
    name: g.length > 1 ? `pages-${g[0] + 1}-${g.at(-1) + 1}` : `page-${g[0] + 1}`,
    bytes: await pick(src, g),
  })));
}

const latin1 = (b) => {
  let s = '';
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode.apply(null, b.subarray(i, i + 8192));
  return s;
};
const ESC = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
const unescape = (t) =>
  t.replace(/\\([0-7]{1,3}|[\s\S])/g, (_, e) => (/^[0-7]/.test(e) ? String.fromCharCode(parseInt(e, 8)) : ESC[e] ?? e));

// ponytail: naive text scan of content-stream strings. Works for simple/WinAnsi fonts;
// CID (Identity-H) fonts and scans yield nothing. Upgrade: pdf.js text layer.
function pageText(page) {
  const c = page.node.Contents();
  const streams = c instanceof PDFArray ? c.asArray().map((r) => page.doc.context.lookup(r)) : [c];
  return streams.filter(Boolean).map((s) => {
    const raw = latin1(s instanceof PDFRawStream ? decodePDFRawStream(s).decode() : s.getContents());
    return (raw.match(/\((?:\\[\s\S]|[^\\)])*\)|<[0-9A-Fa-f\s]+>/g) || [])
      .map((t) => (t[0] === '(' ? unescape(t.slice(1, -1)) : latin1(hexBytes(t.slice(1, -1)))))
      .join('');
  }).join(' ');
}
const hexBytes = (h) => {
  const s = h.replace(/\s/g, '');
  return Uint8Array.from({ length: Math.ceil(s.length / 2) }, (_, i) => parseInt(s.substr(i * 2, 2).padEnd(2, '0'), 16));
};
const norm = (s) => s.toLowerCase().replace(/\s+/g, '');

export async function splitByText(bytes, { phrase }) {
  const needle = norm(phrase || '');
  if (!needle) throw new Error('Enter the phrase to split at.');
  const src = await load(bytes);
  const groups = [];
  let hits = 0;
  src.getPages().forEach((p, i) => {
    const hit = norm(pageText(p)).includes(needle);
    hits += hit;
    if (!groups.length || (hit && groups.at(-1).length)) groups.push([]);
    groups.at(-1).push(i);
  });
  if (!hits) throw new Error(`"${phrase}" wasn't found. Scanned PDFs have no searchable text.`);
  return Promise.all(groups.map(async (g, k) => ({ name: `part-${k + 1}`, bytes: await pick(src, g) })));
}

export async function splitByBookmarks(bytes) {
  const src = await load(bytes);
  const { catalog, context } = src;
  const n = src.getPageCount();
  const pageOf = new Map(src.getPages().map((p, i) => [p.ref.toString(), i]));

  const named = new Map();
  (function walk(node) {
    if (!(node instanceof PDFDict)) return;
    const names = node.lookupMaybe(N('Names'), PDFArray);
    for (let i = 0; names && i < names.size(); i += 2) named.set(names.lookup(i).decodeText(), names.lookup(i + 1));
    node.lookupMaybe(N('Kids'), PDFArray)?.asArray().forEach((k) => walk(context.lookup(k)));
  })(catalog.lookupMaybe(N('Names'), PDFDict)?.lookupMaybe(N('Dests'), PDFDict));
  const oldDests = catalog.lookupMaybe(N('Dests'), PDFDict);

  const resolve = (dest) => {
    if (dest instanceof PDFString || dest instanceof PDFHexString) dest = named.get(dest.decodeText());
    else if (dest instanceof PDFName) dest = oldDests?.lookup(dest);
    if (dest instanceof PDFDict) dest = dest.lookup(N('D'));
    return dest instanceof PDFArray ? pageOf.get(dest.get(0)?.toString()) : undefined;
  };

  const marks = [];
  let item = catalog.lookupMaybe(N('Outlines'), PDFDict)?.lookupMaybe(N('First'), PDFDict);
  for (let guard = 0; item && guard < 10000; guard++) {
    const page = resolve(item.lookup(N('Dest')) ?? item.lookupMaybe(N('A'), PDFDict)?.lookup(N('D')));
    if (page !== undefined) marks.push({ title: item.lookup(N('Title'))?.decodeText?.() || `Section ${marks.length + 1}`, page });
    item = item.lookupMaybe(N('Next'), PDFDict);
  }
  if (!marks.length) throw new Error('This PDF has no bookmarks to split by.');

  marks.sort((a, b) => a.page - b.page);
  if (marks[0].page > 0) marks.unshift({ title: 'Front matter', page: 0 });
  const uniq = marks.filter((m, i) => i === 0 || m.page !== marks[i - 1].page);
  return Promise.all(uniq.map(async (m, i) => ({
    name: m.title,
    bytes: await pick(src, range((uniq[i + 1]?.page ?? n) - m.page, m.page)),
  })));
}

export async function splitHalf(bytes, { mode }) {
  const src = await load(bytes);
  const n = src.getPageCount();
  if (mode === 'file') {
    if (n < 2) throw new Error('Need at least 2 pages to split in half.');
    const h = Math.ceil(n / 2);
    return [
      { name: 'first-half', bytes: await pick(src, range(h)) },
      { name: 'second-half', bytes: await pick(src, range(n - h, h)) },
    ];
  }
  const out = await PDFDocument.create();
  for (const i of src.getPageIndices()) {
    const halves = await out.copyPages(src, [i, i]);
    const { x, y, width: w, height: h } = halves[0].getCropBox();
    const boxes = mode === 'vertical'
      ? [[x, y, w / 2, h], [x + w / 2, y, w / 2, h]]
      : [[x, y + h / 2, w, h / 2], [x, y, w, h / 2]];
    halves.forEach((p, k) => { p.setMediaBox(...boxes[k]); p.setCropBox(...boxes[k]); out.addPage(p); });
  }
  return [{ name: 'sliced', bytes: await out.save() }];
}

export async function splitBySize(bytes, { maxMB }) {
  const limit = parseFloat(maxMB) * 1024 * 1024;
  if (!(limit > 0)) throw new Error('Enter a size limit in MB.');
  const src = await load(bytes);
  const parts = [];
  let cur = [];
  let last = null;
  // ponytail: re-saves the growing part after each page (O(n²) bytes); binary-search per part if huge files crawl.
  for (const i of src.getPageIndices()) {
    const b = await pick(src, [...cur, i]);
    if (b.length > limit && cur.length) { parts.push(last); cur = [i]; last = await pick(src, cur); }
    else { cur.push(i); last = b; }
  }
  parts.push(last);
  return parts.map((b, k) => ({ name: `part-${k + 1}`, bytes: b }));
}

export async function rotate(bytes, { angle = 90, pages = '' }) {
  const doc = await load(bytes);
  const sel = pages.trim() ? parseRanges(pages, doc.getPageCount()).flat() : doc.getPageIndices();
  sel.forEach((i) => {
    const p = doc.getPage(i);
    p.setRotation(degrees((p.getRotation().angle + +angle) % 360));
  });
  return doc.save();
}

// ponytail: flip / n-up / resize redraw pages via embedPage, which ignores a page's /Rotate.
export async function flip(bytes, { axis = 'h' }) {
  const src = await load(bytes);
  const out = await PDFDocument.create();
  const fx = axis !== 'v';
  const fy = axis !== 'h';
  (await out.embedPages(src.getPages())).forEach((e) => {
    out.addPage([e.width, e.height]).drawPage(e, {
      x: fx ? e.width : 0, y: fy ? e.height : 0, xScale: fx ? -1 : 1, yScale: fy ? -1 : 1,
    });
  });
  return out.save();
}

const GRID = { 2: [2, 1], 4: [2, 2], 6: [2, 3], 9: [3, 3], 16: [4, 4] };
export async function nUp(bytes, { perSheet = 4 }) {
  const [cols, rows] = GRID[perSheet];
  const [W, H] = cols > rows ? [A4[1], A4[0]] : A4;
  const src = await load(bytes);
  const out = await PDFDocument.create();
  const m = 18;
  const cw = (W - m * 2) / cols;
  const ch = (H - m * 2) / rows;
  let sheet;
  (await out.embedPages(src.getPages())).forEach((e, i) => {
    const k = i % (cols * rows);
    if (k === 0) sheet = out.addPage([W, H]);
    const s = Math.min((cw - 8) / e.width, (ch - 8) / e.height);
    const col = k % cols;
    const row = Math.floor(k / cols);
    sheet.drawPage(e, {
      x: m + col * cw + (cw - e.width * s) / 2,
      y: H - m - (row + 1) * ch + (ch - e.height * s) / 2,
      xScale: s, yScale: s,
    });
  });
  return out.save();
}

export async function cropResize(bytes, { mode = 'crop', margin = 10, size = 'A4' }) {
  const src = await load(bytes);
  if (mode === 'crop') {
    const pt = (parseFloat(margin) || 0) * 2.8346; // mm -> pt
    src.getPages().forEach((p) => {
      const { x, y, width, height } = p.getCropBox();
      if (pt * 2 >= Math.min(width, height)) throw new Error('Margin is larger than the page.');
      p.setCropBox(x + pt, y + pt, width - pt * 2, height - pt * 2);
    });
    return src.save();
  }
  const out = await PDFDocument.create();
  (await out.embedPages(src.getPages())).forEach((e) => {
    const [a, b] = SIZES[size];
    const [W, H] = e.width > e.height ? [b, a] : [a, b];
    const s = Math.min(W / e.width, H / e.height);
    out.addPage([W, H]).drawPage(e, { x: (W - e.width * s) / 2, y: (H - e.height * s) / 2, xScale: s, yScale: s });
  });
  return out.save();
}

export async function watermark(bytes, { text = 'CONFIDENTIAL', opacity = 0.15 }) {
  if (!text.trim()) throw new Error('Enter watermark text.');
  const doc = await load(bytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.getPages().forEach((p) => {
    const { width, height } = p.getSize();
    const a = Math.atan2(height, width);
    const size = Math.min(110, (Math.hypot(width, height) * 0.65) / font.widthOfTextAtSize(text, 1));
    const tw = font.widthOfTextAtSize(text, size);
    const c = Math.cos(a);
    const s = Math.sin(a);
    const up = size * 0.35;
    p.drawText(text, {
      x: width / 2 - (c * tw) / 2 + s * up, y: height / 2 - (s * tw) / 2 - c * up,
      size, font, color: rgb(0.82, 0.27, 0.17), opacity: +opacity, rotate: degrees((a * 180) / Math.PI),
    });
  });
  return doc.save();
}

export async function pageNumbers(bytes, { position = 'center', format = 'n' }) {
  const doc = await load(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const n = doc.getPageCount();
  doc.getPages().forEach((p, i) => {
    const label = format === 'of' ? `Page ${i + 1} of ${n}` : `${i + 1}`;
    const tw = font.widthOfTextAtSize(label, 10);
    const { x, y, width } = p.getCropBox();
    const lx = { left: x + 28, center: x + (width - tw) / 2, right: x + width - 28 - tw }[position];
    p.drawText(label, { x: lx, y: y + 20, size: 10, font, color: rgb(0.2, 0.2, 0.2) });
  });
  return doc.save();
}

// order: [{ i: sourcePageIndex, rot: extraDegrees }]
export async function organize(bytes, order) {
  if (!order.length) throw new Error('Keep at least one page.');
  const src = await load(bytes);
  const out = await PDFDocument.create();
  (await out.copyPages(src, order.map((o) => o.i))).forEach((p, k) => {
    p.setRotation(degrees((p.getRotation().angle + order[k].rot) % 360));
    out.addPage(p);
  });
  return out.save();
}

// Scans: each photo becomes one page, A4 wide, keeping the photo's aspect.
export async function imagesToPdf(images) {
  const doc = await PDFDocument.create();
  for (const bytes of images) {
    const img = bytes[0] === 0x89 ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    const W = A4[0];
    const H = (W * img.height) / img.width;
    doc.addPage([W, H]).drawImage(img, { x: 0, y: 0, width: W, height: H });
  }
  return doc.save();
}

export function zip(files) {
  const seen = new Set();
  return zipSync(Object.fromEntries(files.map((f, i) => {
    const name = seen.has(f.name) ? `${i + 1}-${f.name}` : f.name;
    seen.add(name);
    return [name, f.bytes];
  })));
}
