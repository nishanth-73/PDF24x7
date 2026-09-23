// Every operation runs on-device with pure-JS libs: bytes in, bytes out.
import {
  PDFArray, PDFDict, PDFDocument, PDFHexString, PDFName, PDFNumber, PDFRawStream, PDFStream, PDFString,
  ParseSpeeds, StandardFontEmbedder, StandardFonts, decodePDFRawStream, degrees, rgb,
} from 'pdf-lib';
import type { PDFEmbeddedPage, PDFImage, PDFObject, PDFPage } from 'pdf-lib';
import { zipSync } from 'fflate';

export type Named = { name: string; bytes: Uint8Array };
export type PageInfo = { width: number; height: number; rot: number };
export type PageOrder = { i: number; rot: number; del?: boolean }; // del: greyed out in the editor, left out of the output
type Num = number | string;
type Box = [x: number, y: number, w: number, h: number];

const N = (n: string) => PDFName.of(n);
const A4: [number, number] = [595.28, 841.89];
export const SIZES = { A4, A5: [419.53, 595.28], Letter: [612, 792], Legal: [612, 1008] } satisfies Record<string, [number, number]>;
export type PaperSize = keyof typeof SIZES;
const range = (n: number, from = 0) => Array.from({ length: Math.max(0, n) }, (_, i) => from + i);
const rotOf = (p: PDFPage) => ((p.getRotation().angle % 360) + 360) % 360; // /Rotate as 0, 90, 180 or 270

// Pages redrawn onto new sheets (flip, n-up, resize) are embedded at their crop box, which is what viewers show, and
// given an empty content stream when they have none: pdf-lib refuses to embed a page without one, and blank pages are
// common in scans.
function embedShown(out: PDFDocument, pages: PDFPage[]) {
  for (const p of pages) if (!p.node.Contents()) p.node.addContentStream(p.doc.context.register(p.doc.context.contentStream([])));
  return out.embedPages(pages, pages.map((p) => {
    const b = p.getCropBox();
    return { left: b.x, bottom: b.y, right: b.x + b.width, top: b.y + b.height };
  }));
}
// The size of an embedded page as a viewer shows it, turned by the source page's /Rotate.
const shownSize = (e: PDFEmbeddedPage, rot: number) => (rot % 180 ? [e.height, e.width] : [e.width, e.height]);
// Draws an embedded page upright as a viewer would show it (turned clockwise by `rot`), scaled by `s`, its lower-left
// corner at (x, y).
function drawShown(page: PDFPage, e: PDFEmbeddedPage, rot: number, x: number, y: number, s: number) {
  const [w, h] = [e.width * s, e.height * s];
  const [ox, oy] = rot === 90 ? [x, y + w] : rot === 180 ? [x + w, y + h] : rot === 270 ? [x + h, y] : [x, y];
  page.drawPage(e, { x: ox, y: oy, xScale: s, yScale: s, rotate: degrees(-rot) });
}

// pdf-lib pauses on a setTimeout every 100 objects read and 50 written by default; big PDFs spent seconds just waiting.
// ponytail: ~1500 objects between pauses keeps the JS thread breathing; raise it if runs still feel slow.
const load = (bytes: Uint8Array): Promise<PDFDocument> =>
  PDFDocument.load(bytes, { parseSpeed: ParseSpeeds.Fast }).catch((e: unknown) => {
    throw new Error(/encrypt/i.test(String(e))
      ? 'This PDF is password-protected. Unlock it first.'
      : 'Could not read this PDF. The file may be damaged.');
  });
const save = (doc: PDFDocument, opts: { useObjectStreams?: boolean } = {}) => doc.save({ objectsPerTick: 1500, ...opts });

async function pick(src: PDFDocument, indices: number[]): Promise<Uint8Array> {
  const out = await PDFDocument.create();
  (await out.copyPages(src, indices)).forEach((p) => out.addPage(p));
  return save(out);
}

// "1-3, 5, 8-" -> [[0,1,2],[4],[7..n-1]]
export function parseRanges(str: string, n: number): number[][] {
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

export const pageInfo = async (bytes: Uint8Array): Promise<PageInfo[]> =>
  (await load(bytes)).getPages().map((p) => ({ ...p.getSize(), rot: p.getRotation().angle }));

export async function merge(files: Named[]) {
  const out = await PDFDocument.create();
  for (const f of files) {
    const src = await load(f.bytes);
    (await out.copyPages(src, src.getPageIndices())).forEach((p) => out.addPage(p));
  }
  return save(out);
}

export async function alternate(files: Named[], { reverse = false }: { reverse?: boolean } = {}) {
  const out = await PDFDocument.create();
  const stacks: PDFPage[][] = [];
  for (const [i, f] of files.entries()) {
    const src = await load(f.bytes);
    const idx = src.getPageIndices();
    stacks.push(await out.copyPages(src, reverse && i > 0 ? idx.reverse() : idx));
  }
  const longest = Math.max(...stacks.map((s) => s.length));
  for (let i = 0; i < longest; i++) stacks.forEach((s) => s[i] && out.addPage(s[i]));
  return save(out);
}

// JPEG in, smaller RGB JPEG out, its long side at most `maxSide` px (0 keeps the size); null keeps the original.
// The app passes the native encoder; the Node check, jpeg-js.
export type RecodeJpeg = (jpeg: Uint8Array, quality: number, maxSide: number) => Promise<Uint8Array | null>;

// A JPEG's [width, height], read from its frame header.
export function jpegSize(b: Uint8Array): [number, number] | null {
  for (let i = 2; i + 8 < b.length;) {
    if (b[i] !== 0xff) return null;
    const m = b[i + 1];
    if (m === 0xff) { i++; continue; } // fill byte
    if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return [(b[i + 7] << 8) | b[i + 8], (b[i + 5] << 8) | b[i + 6]];
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return null;
}

// Longest side each level shrinks a photo to: about 200 dpi on an A4 page for Balanced, 130 for Strong.
const MAX_SIDE: Record<string, number> = { 80: 0, 60: 2400, 35: 1600 };

// Re-encodes embedded JPEG photos/scans (where the bulk of a PDF's size lives), shrinking oversized ones,
// drops XMP metadata and packs objects into compressed object streams. Never returns a bigger file than it was given.
export async function compress(bytes: Uint8Array, { quality = 60 }: { quality?: Num } = {}, recode: RecodeJpeg) {
  const doc = await load(bytes);
  const dct = N('DCTDecode');
  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFRawStream)) continue;
    const d = obj.dict;
    const filter = d.get(N('Filter'));
    const isJpeg = filter === dct || (filter instanceof PDFArray && filter.size() === 1 && filter.get(0) === dct);
    if (d.get(N('Subtype')) !== N('Image') || !isJpeg) continue;
    try {
      const out = await recode(obj.contents, Number(quality), MAX_SIDE[String(quality)] ?? 0);
      const size = out && jpegSize(out);
      if (!out || !size || out.length >= obj.contents.length) continue;
      d.set(N('Filter'), dct);
      d.set(N('ColorSpace'), N('DeviceRGB'));
      d.set(N('BitsPerComponent'), PDFNumber.of(8));
      d.set(N('Width'), PDFNumber.of(size[0]));
      d.set(N('Height'), PDFNumber.of(size[1]));
      d.delete(N('Decode'));
      d.delete(N('DecodeParms')); // a ColorTransform meant for the old JPEG would skew the new one's colours
      d.set(N('Length'), PDFNumber.of(out.length));
      doc.context.assign(ref, PDFRawStream.of(d, out));
    } catch {
      // unusual JPEG flavour: keep the original image
    }
  }
  doc.catalog.delete(N('Metadata'));
  const out = await save(doc, { useObjectStreams: true });
  return out.length < bytes.length ? out : bytes;
}

export async function split(bytes: Uint8Array, { mode = 'every', ranges = '' }: { mode?: string; ranges?: string } = {}) {
  const src = await load(bytes);
  const groups = mode === 'ranges'
    ? parseRanges(ranges, src.getPageCount())
    : src.getPageIndices().map((i) => [i]);
  return Promise.all(groups.map(async (g): Promise<Named> => ({
    name: g.length > 1 ? `pages-${g[0] + 1}-${g[g.length - 1] + 1}` : `page-${g[0] + 1}`,
    bytes: await pick(src, g),
  })));
}

const latin1 = (b: Uint8Array) => {
  let s = '';
  for (let i = 0; i < b.length; i += 8192) s += String.fromCharCode(...b.subarray(i, i + 8192));
  return s;
};
const ESC: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
const unescape = (t: string) =>
  t.replace(/\\([0-7]{1,3}|[\s\S])/g, (_, e: string) => (/^[0-7]/.test(e) ? String.fromCharCode(parseInt(e, 8)) : ESC[e] ?? e));
const hexBytes = (h: string) => {
  const s = h.replace(/\s/g, '');
  return Uint8Array.from({ length: Math.ceil(s.length / 2) }, (_, i) => parseInt(s.substr(i * 2, 2).padEnd(2, '0'), 16));
};
const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');

// Naive text scan of content-stream strings: works for simple/WinAnsi fonts, while CID (Identity-H) fonts and scans
// yield nothing. The app reads text with PdfBox instead; this is the fallback the Node check runs on.
function pageText(page: PDFPage): string {
  const c = page.node.Contents();
  const ctx = page.doc.context;
  const streams = (c instanceof PDFArray ? c.asArray().map((r) => ctx.lookup(r)) : [c])
    .filter((x): x is PDFStream => x instanceof PDFStream);
  return streams.map((st) => {
    const raw = latin1(st instanceof PDFRawStream ? decodePDFRawStream(st).decode() : st.getContents());
    return (raw.match(/\((?:\\[\s\S]|[^\\)])*\)|<[0-9A-Fa-f\s]+>/g) ?? [])
      .map((t) => (t[0] === '(' ? unescape(t.slice(1, -1)) : latin1(hexBytes(t.slice(1, -1)))))
      .join('');
  }).join(' ');
}

// Each page's text, in page order.
export type ReadTexts = (bytes: Uint8Array) => Promise<string[]>;
export const naivePageTexts: ReadTexts = async (bytes) =>
  (await load(bytes)).getPages().map((p) => { try { return pageText(p); } catch { return ''; } });

export async function splitByText(bytes: Uint8Array, { phrase = '' }: { phrase?: string } = {}, read: ReadTexts = naivePageTexts) {
  const needle = norm(phrase);
  if (!needle) throw new Error('Enter the phrase to split at.');
  const src = await load(bytes);
  const texts = await read(bytes);
  const groups: number[][] = [];
  let hits = 0;
  src.getPageIndices().forEach((i) => {
    const hit = norm(texts[i] ?? '').includes(needle);
    if (hit) hits++;
    if (!groups.length || (hit && groups[groups.length - 1].length)) groups.push([]);
    groups[groups.length - 1].push(i);
  });
  if (!hits) throw new Error(`"${phrase}" wasn't found on any page. If this is a scan, run OCR Scanned PDF on it first.`);
  return Promise.all(groups.map(async (g, k): Promise<Named> => ({ name: `part-${k + 1}`, bytes: await pick(src, g) })));
}

const isText = (o: PDFObject | undefined): o is PDFString | PDFHexString => o instanceof PDFString || o instanceof PDFHexString;

export async function splitByBookmarks(bytes: Uint8Array) {
  const src = await load(bytes);
  const { catalog, context } = src;
  const n = src.getPageCount();
  const pageOf = new Map(src.getPages().map((p, i) => [p.ref.toString(), i]));

  const named = new Map<string, PDFObject | undefined>();
  const walk = (node: PDFObject | undefined): void => {
    if (!(node instanceof PDFDict)) return;
    const names = node.lookupMaybe(N('Names'), PDFArray);
    for (let i = 0; names && i < names.size(); i += 2) {
      const key = names.lookup(i);
      if (isText(key)) named.set(key.decodeText(), names.lookup(i + 1));
    }
    node.lookupMaybe(N('Kids'), PDFArray)?.asArray().forEach((k) => walk(context.lookup(k)));
  };
  walk(catalog.lookupMaybe(N('Names'), PDFDict)?.lookupMaybe(N('Dests'), PDFDict));
  const oldDests = catalog.lookupMaybe(N('Dests'), PDFDict);

  const resolve = (dest: PDFObject | undefined): number | undefined => {
    let d = dest;
    if (isText(d)) d = named.get(d.decodeText());
    else if (d instanceof PDFName) d = oldDests?.lookup(d);
    if (d instanceof PDFDict) d = d.lookup(N('D'));
    return d instanceof PDFArray ? pageOf.get(String(d.get(0))) : undefined;
  };

  const marks: { title: string; page: number }[] = [];
  let item = catalog.lookupMaybe(N('Outlines'), PDFDict)?.lookupMaybe(N('First'), PDFDict);
  for (let guard = 0; item && guard < 10000; guard++) {
    const page = resolve(item.lookup(N('Dest')) ?? item.lookupMaybe(N('A'), PDFDict)?.lookup(N('D')));
    const title = item.lookup(N('Title'));
    if (page !== undefined) marks.push({ title: isText(title) ? title.decodeText() : `Section ${marks.length + 1}`, page });
    item = item.lookupMaybe(N('Next'), PDFDict);
  }
  if (!marks.length) throw new Error('This PDF has no bookmarks to split by.');

  marks.sort((a, b) => a.page - b.page);
  if (marks[0].page > 0) marks.unshift({ title: 'Front matter', page: 0 });
  const uniq = marks.filter((m, i) => i === 0 || m.page !== marks[i - 1].page);
  return Promise.all(uniq.map(async (m, i): Promise<Named> => ({
    name: m.title,
    bytes: await pick(src, range((uniq[i + 1]?.page ?? n) - m.page, m.page)),
  })));
}

export async function splitHalf(bytes: Uint8Array, { mode = 'file' }: { mode?: string } = {}): Promise<Named[]> {
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
  // Halves of the page as displayed (left then right, or top then bottom), turned back into the page as stored, so a
  // spread saved sideways with /Rotate still splits into its two pages.
  const shown: Box[] = mode === 'vertical' ? [[0, 0, 0.5, 1], [0.5, 0, 0.5, 1]] : [[0, 0, 1, 0.5], [0, 0.5, 1, 0.5]];
  for (const i of src.getPageIndices()) {
    const halves = await out.copyPages(src, [i, i]);
    const cb = halves[0].getCropBox();
    const rot = rotOf(halves[0]);
    halves.forEach((p, k) => {
      const [x, y, w, h] = unrotate(shown[k], rot);
      const box: Box = [cb.x + x * cb.width, cb.y + y * cb.height, w * cb.width, h * cb.height];
      p.setMediaBox(...box);
      p.setCropBox(...box);
      out.addPage(p);
    });
  }
  return [{ name: 'sliced', bytes: await save(out) }];
}

export async function splitBySize(bytes: Uint8Array, { maxMB = 5 }: { maxMB?: Num } = {}): Promise<Named[]> {
  const limit = parseFloat(String(maxMB)) * 1024 * 1024;
  if (!(limit > 0)) throw new Error('Enter a size limit in MB.');
  const src = await load(bytes);
  const parts: Uint8Array[] = [];
  let cur: number[] = [];
  let last: Uint8Array | null = null;
  // ponytail: re-saves the growing part after each page (O(n²) bytes); binary-search per part if huge files crawl.
  for (const i of src.getPageIndices()) {
    const b = await pick(src, [...cur, i]);
    if (b.length > limit && cur.length && last) {
      parts.push(last);
      cur = [i];
      last = await pick(src, cur);
    } else {
      cur.push(i);
      last = b;
    }
  }
  if (last) parts.push(last);
  return parts.map((b, k) => ({ name: `part-${k + 1}`, bytes: b }));
}

export async function rotate(bytes: Uint8Array, { angle = 90, pages = '' }: { angle?: Num; pages?: string } = {}) {
  const doc = await load(bytes);
  const sel = pages.trim() ? [...new Set(parseRanges(pages, doc.getPageCount()).flat())] :doc.getPageIndices(); // a page listed twice turns once
  sel.forEach((i) => {
    const p = doc.getPage(i);
    p.setRotation(degrees((p.getRotation().angle + Number(angle)) % 360));
  });
  return save(doc);
}

export async function flip(bytes: Uint8Array, { axis = 'h' }: { axis?: string } = {}) {
  const src = await load(bytes);
  const pages = src.getPages();
  const out = await PDFDocument.create();
  (await embedShown(out, pages)).forEach((e, i) => {
    // The page keeps its /Rotate, so mirroring it as displayed means the other axis of a page turned a quarter.
    const rot = rotOf(pages[i]);
    const fx = rot % 180 ? axis !== 'h' : axis !== 'v';
    const fy = rot % 180 ? axis !== 'v' : axis !== 'h';
    const p = out.addPage([e.width, e.height]);
    p.drawPage(e, { x: fx ? e.width : 0, y: fy ? e.height : 0, xScale: fx ? -1 : 1, yScale: fy ? -1 : 1 });
    p.setRotation(degrees(rot));
  });
  return save(out);
}

const GRID: Record<string, [cols: number, rows: number]> = { 2: [2, 1], 4: [2, 2], 6: [2, 3], 9: [3, 3], 16: [4, 4] };
export async function nUp(bytes: Uint8Array, { perSheet = 4, lines = false }: { perSheet?: Num; lines?: boolean } = {}) {
  const grid = GRID[String(perSheet)];
  if (!grid) throw new Error('Choose 2, 4, 6, 9 or 16 pages per sheet.');
  const src = await load(bytes);
  const pages = src.getPages();
  const out = await PDFDocument.create();
  const embedded = await embedShown(out, pages);
  const m = 18;
  // The grid as given on its natural sheet, or turned with the sheet turned too (2 slides stack on a portrait sheet);
  // whichever shows the first page bigger.
  const [c0, r0] = grid;
  const landscape: [number, number] = [A4[1], A4[0]];
  const [w0, h0] = shownSize(embedded[0], rotOf(pages[0]));
  const layouts = [[c0, r0, ...(c0 > r0 ? landscape : A4)], [r0, c0, ...(c0 > r0 ? A4 : landscape)]];
  const fit = ([c, r, W, H]: number[]) => Math.min((W - m * 2) / c / w0, (H - m * 2) / r / h0);
  const [cols, rows, W, H] = fit(layouts[1]) > fit(layouts[0]) ? layouts[1] : layouts[0];
  const cw = (W - m * 2) / cols;
  const ch = (H - m * 2) / rows;
  embedded.forEach((e, i) => {
    const k = i % (cols * rows);
    const sheet = k === 0 ? out.addPage([W, H]) : out.getPage(out.getPageCount() - 1);
    if (k === 0 && lines) { // hairline dividers in the gaps between cells
      const line = { thickness: 0.5, color: rgb(0.6, 0.6, 0.6) };
      for (let c = 1; c < cols; c++) sheet.drawLine({ start: { x: m + c * cw, y: m }, end: { x: m + c * cw, y: H - m }, ...line });
      for (let r = 1; r < rows; r++) sheet.drawLine({ start: { x: m, y: H - m - r * ch }, end: { x: W - m, y: H - m - r * ch }, ...line });
    }
    const rot = rotOf(pages[i]);
    const [w, h] = shownSize(e, rot);
    const s = Math.min((cw - 8) / w, (ch - 8) / h);
    const col = k % cols;
    const row = Math.floor(k / cols);
    drawShown(sheet, e, rot, m + col * cw + (cw - w * s) / 2, H - m - (row + 1) * ch + (ch - h * s) / 2, s);
  });
  return save(out);
}

// What to keep on a page, as fractions of the page as it is displayed, y from the top — the same frame the crop
// editor draws on. Keyed by page index, so every page can be cropped differently.
export type CropBoxes = Record<string, Box>;

// The page as displayed is the page as stored turned by /Rotate, so a rect drawn on screen has to be turned back
// before it can be a crop box (and PDF y runs from the bottom).
const unrotate = ([x, y, w, h]: Box, rot: number): Box =>
  rot === 90 ? [y, x, h, w]
    : rot === 180 ? [1 - x - w, y, w, h]
      : rot === 270 ? [1 - y - h, 1 - x - w, h, w]
        : [x, 1 - y - h, w, h];

// Something the user dropped onto a page in Fill & Sign. Positions are fractions of the page as displayed, y from
// the top, so they mean the same thing as what the editor drew. Text keeps no width: it is as wide as it needs.
export type SignItem =
  | { page: number; kind: 'text'; x: number; y: number; size: number; text: string }
  | { page: number; kind: 'image'; x: number; y: number; w: number; h: number; uri: string };

/**
 * Where to draw an item placed on the page as displayed: the origin to draw from, the item's natural size, and
 * (as `rot`) the angle to draw it at so it still reads upright after the viewer turns the page by /Rotate.
 * The origin is the item's own bottom-left corner, which lands on a different corner of the page as it turns.
 */
export function placeOnPage(rect: Box, rot: number, W: number, H: number) {
  const [fx, fy, fw, fh] = unrotate(rect, rot);
  const [X, Y, RW, RH] = [fx * W, fy * H, fw * W, fh * H];
  if (rot === 90) return { x: X + RW, y: Y, w: RH, h: RW };
  if (rot === 180) return { x: X + RW, y: Y + RH, w: RW, h: RH };
  if (rot === 270) return { x: X, y: Y + RH, w: RH, h: RW };
  return { x: X, y: Y, w: RW, h: RH };
}

// The standard fonts are WinAnsi, so a character they cannot write is folded to its plain form or dropped, rather
// than failing the whole document. Editors show text through this too, so what you see is what the PDF gets.
export const winAnsi = (s: string) => s
  .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/₹\s?/g, 'Rs. ')
  .replace(/[^\x20-\x7E\xA0-\xFF]/g, '');

const DESCENT = 0.79; // Helvetica sits about a fifth of its size below the baseline

export async function fillSign(bytes: Uint8Array, items: SignItem[], images: Record<string, Uint8Array>) {
  const doc = await load(bytes);
  const pages = doc.getPages();
  const embedded: Record<string, PDFImage> = {};
  let font: Awaited<ReturnType<PDFDocument['embedFont']>> | null = null;
  for (const it of items) {
    const p = pages[it.page];
    if (!p) continue;
    const rot = rotOf(p);
    const { width: W, height: H } = p.getSize();
    if (it.kind === 'image') {
      if (!embedded[it.uri]) {
        const b = images[it.uri];
        if (!b) continue;
        if (b[0] === 0x89) embedded[it.uri] = await doc.embedPng(b);
        else if (b[0] === 0xff && b[1] === 0xd8) embedded[it.uri] = await doc.embedJpg(b);
        else throw new Error(`The picture on page ${it.page + 1} isn't a JPEG or PNG. Pick a different one.`);
      }
      const at = placeOnPage([it.x, it.y, it.w, it.h], rot, W, H);
      p.drawImage(embedded[it.uri], { x: at.x, y: at.y, width: at.w, height: at.h, rotate: degrees(rot) });
      continue;
    }
    const text = winAnsi(it.text);
    if (!text) continue;
    font ??= await doc.embedFont(StandardFonts.Helvetica);
    // The box's height is the font size; the baseline sits a descender up from its bottom edge. Both are measured
    // in the page's own frame, so they stay right however the page is turned.
    const size = placeOnPage([it.x, it.y, 0, it.size], rot, W, H).h;
    const at = placeOnPage([it.x, it.y, 0, it.size * DESCENT], rot, W, H);
    p.drawText(text, { x: at.x, y: at.y, size, font, color: rgb(0.06, 0.09, 0.16), rotate: degrees(rot) });
  }
  return save(doc);
}

export async function cropResize(
  bytes: Uint8Array,
  { mode = 'crop', size = 'A4', boxes = {} }: { mode?: string; size?: string; boxes?: CropBoxes } = {},
) {
  const src = await load(bytes);
  if (mode === 'crop') {
    if (!Object.keys(boxes).length) throw new Error('Pull a page’s corners in, or tap Auto crop, to choose what to keep.');
    src.getPages().forEach((p, i) => {
      const box = boxes[i];
      if (!box) return; // pages you didn't crop are left at their full size
      const cb = p.getCropBox();
      const [x, y, w, h] = unrotate(box, rotOf(p));
      if (w * cb.width < 1 || h * cb.height < 1) throw new Error(`The crop on page ${i + 1} is too small.`);
      p.setCropBox(cb.x + x * cb.width, cb.y + y * cb.height, w * cb.width, h * cb.height);
    });
    return save(src);
  }
  const [a, b] = SIZES[size as PaperSize] ?? A4;
  const out = await PDFDocument.create();
  const pages = src.getPages();
  (await embedShown(out, pages)).forEach((e, i) => {
    const rot = rotOf(pages[i]);
    const [w, h] = shownSize(e, rot);
    const [W, H] = w > h ? [b, a] : [a, b];
    const s = Math.min(W / w, H / h);
    drawShown(out.addPage([W, H]), e, rot, (W - w * s) / 2, (H - h * s) / 2, s);
  });
  return save(out);
}

// Diagonal watermark geometry in page points; the tool preview uses it too so both match. `text` must already be
// through winAnsi(): Helvetica can't measure (or write) anything else.
export function watermarkLayout(text: string, width: number, height: number, scale: Num = 1) {
  const w1 = StandardFontEmbedder.for(StandardFonts.HelveticaBold as unknown as Parameters<typeof StandardFontEmbedder.for>[0]).widthOfTextAtSize(text, 1);
  const k = Number(scale) || 1;
  const size = Math.min(110 * k, (Math.hypot(width, height) * 0.65 * k) / w1);
  return { angle: Math.atan2(height, width), size, textWidth: w1 * size };
}

export async function watermark(bytes: Uint8Array, { text: typed = 'CONFIDENTIAL', opacity = 0.15, scale = 1 }: { text?: string; opacity?: Num; scale?: Num } = {}) {
  if (!typed.trim()) throw new Error('Enter watermark text.');
  const text = winAnsi(typed).trim();
  if (!text) throw new Error('Watermarks can only use Latin letters, numbers and common symbols.');
  const doc = await load(bytes);
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  doc.getPages().forEach((p) => {
    const { width, height } = p.getSize();
    const { angle: a, size, textWidth: tw } = watermarkLayout(text, width, height, scale);
    const c = Math.cos(a);
    const s = Math.sin(a);
    const up = size * 0.35;
    p.drawText(text, {
      x: width / 2 - (c * tw) / 2 + s * up, y: height / 2 - (s * tw) / 2 - c * up,
      size, font, color: rgb(0.82, 0.27, 0.17), opacity: Number(opacity), rotate: degrees((a * 180) / Math.PI),
    });
  });
  return save(doc);
}

export async function pageNumbers(bytes: Uint8Array, { position = 'center', format = 'n' }: { position?: string; format?: string } = {}) {
  const doc = await load(bytes);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const n = doc.getPageCount();
  doc.getPages().forEach((p, i) => {
    const label = format === 'of' ? `Page ${i + 1} of ${n}` : `${i + 1}`;
    const tw = font.widthOfTextAtSize(label, 10);
    // Placed on the page as displayed, so a page saved sideways with /Rotate still gets its number upright at the
    // bottom: the baseline 20pt up, 28pt in from the side (the same frame Fill & Sign draws in).
    const cb = p.getCropBox();
    const rot = rotOf(p);
    const [dw, dh] = rot % 180 ? [cb.height, cb.width] : [cb.width, cb.height];
    const lx = position === 'left' ? 28 : position === 'right' ? dw - 28 - tw : (dw - tw) / 2;
    const at = placeOnPage([lx / dw, (dh - 20 - 10 * DESCENT) / dh, 0, (10 * DESCENT) / dh], rot, cb.width, cb.height);
    p.drawText(label, { x: cb.x + at.x, y: cb.y + at.y, size: 10, font, color: rgb(0.2, 0.2, 0.2), rotate: degrees(rot) });
  });
  return save(doc);
}

export async function organize(bytes: Uint8Array, all: PageOrder[]) {
  const order = all.filter((o) => !o.del);
  if (!order.length) throw new Error('Keep at least one page.');
  const src = await load(bytes);
  const out = await PDFDocument.create();
  (await out.copyPages(src, order.map((o) => o.i))).forEach((p, k) => {
    p.setRotation(degrees((p.getRotation().angle + order[k].rot) % 360));
    out.addPage(p);
  });
  return save(out);
}

// ── Scanned pages ──────────────────────────────────────────────────────────
// Page kinds follow Adobe Scan's capture modes; sizes follow its Resize menu. The review screen draws
// pages from the same layout, so what you see is what the PDF gets.
export type PageKind = 'doc' | 'book' | 'id' | 'card' | 'whiteboard';
export type PageSize = 'fit' | `${PaperSize}-${'portrait' | 'landscape'}`;
export type Crop = { x: number; y: number; w: number; h: number }; // fractions of the image, y from the top
export type Placed = { img: number; crop: Crop; x: number; y: number; w: number; h: number }; // points, y from the bottom
export type Sheet = { W: number; H: number; items: Placed[] };
type Dim = { width: number; height: number };

const FULL: Crop = { x: 0, y: 0, w: 1, h: 1 };
const CARD_W = 85.6 * 2.8346; // ISO ID-1 card width in points, so ID copies print at real size
const MARGIN = 24;

export function layoutScanPage(kind: PageKind, size: PageSize, imgs: Dim[]): Sheet[] {
  const [first] = imgs;
  let paper: [number, number] | null = null;
  if (size !== 'fit') {
    const [name, orient] = size.split('-');
    const [a, b] = SIZES[name as PaperSize] ?? A4;
    paper = orient === 'landscape' ? [b, a] : [a, b];
  }
  // One image region per sheet: full-bleed at A4 width when 'fit', else centered inside the margins.
  const single = (crop: Crop, aw: number, ah: number, fitW = A4[0]): Sheet => {
    if (!paper) return { W: fitW, H: (fitW * ah) / aw, items: [{ img: 0, crop, x: 0, y: 0, w: fitW, h: (fitW * ah) / aw }] };
    const [W, H] = paper;
    const k = Math.min((W - 2 * MARGIN) / aw, (H - 2 * MARGIN) / ah);
    return { W, H, items: [{ img: 0, crop, x: (W - aw * k) / 2, y: (H - ah * k) / 2, w: aw * k, h: ah * k }] };
  };
  if (kind === 'book') return [0, 0.5].map((x) => single({ x, y: 0, w: 0.5, h: 1 }, first.width / 2, first.height));
  if (kind === 'card') return [single(FULL, first.width, first.height, 252)];
  if (kind === 'id') { // front above back
    const [W, H] = paper ?? A4;
    const cw = Math.min(CARD_W, W - 2 * MARGIN);
    const items = imgs.map((im, i): Placed => {
      const h = (cw * im.height) / im.width;
      return { img: i, crop: FULL, x: (W - cw) / 2, y: i === 0 ? H / 2 + 12 : H / 2 - 12 - h, w: cw, h };
    });
    return [{ W, H, items }];
  }
  return [single(FULL, first.width, first.height)];
}

export function zip(files: Named[]): Uint8Array {
  const seen = new Set<string>();
  return zipSync(Object.fromEntries(files.map((f, i) => {
    const name = seen.has(f.name) ? `${i + 1}-${f.name}` : f.name;
    seen.add(name);
    return [name, f.bytes];
  })));
}
