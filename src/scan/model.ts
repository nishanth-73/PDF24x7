// A scan is a draft document: original photos plus every edit as settings, so crops, filters and
// strokes can be redone any time, even after the PDF was saved. Stored under Documents/scans/<id>/.
import { Directory, File, Paths } from 'expo-file-system';
import { processImage, type Corners, type Filter, type Photo, type Stroke } from '../../modules/doc-scanner';
import { imagesToPdf, type PageKind, type PageSize } from '../pdf';
import { listAllFiles, readPicked, removeFile, save } from '../storage';
import { pad } from '../ui';

export type Shot = {
  src: string; // original photo, never modified
  width: number;
  height: number;
  detected: Corners | null; // what auto-detect found, for the crop screen's "Auto-detect"
  corners: Corners | null; // null = no crop
  rotation: number;
  filter: Filter;
  brightness: number;
  contrast: number;
  strokes: Stroke[];
  rev: number; // bumped on every edit; a render only lands if it's still current
  out?: string; // rendered page image
  outRev?: number; // the rev `out` was rendered from
  outW?: number;
  outH?: number;
  bg?: string; // paper color of the render, cleanup's "Auto" fill
};
export type Page = { id: string; kind: PageKind; size: PageSize; shots: Shot[] };
export type ScanDoc = {
  id: string; name: string; created: number; modified: number; pages: Page[];
  pdf?: { uri: string; name: string };
  saved?: { name: string; pages: Page[]; sig: string }; // state at the last Save PDF, for "Discard changes"
};

export const KIND_LABEL: Record<PageKind, string> = {
  whiteboard: 'Whiteboard', book: 'Book', doc: 'Document', id: 'ID card', card: 'Business card',
};
export const FILTERS: [Filter, string][] = [
  ['original', 'Original color'], ['auto', 'Auto-color'], ['light', 'Light text'], ['gray', 'Grayscale'], ['whiteboard', 'Whiteboard'],
];
export const SIZES: [PageSize, string][] = [
  ['fit', 'Original size'], ['A4-portrait', 'A4 Portrait'], ['A4-landscape', 'A4 Landscape'], ['A5-portrait', 'A5 Portrait'],
  ['A5-landscape', 'A5 Landscape'], ['Letter-portrait', 'Letter Portrait'], ['Letter-landscape', 'Letter Landscape'],
  ['Legal-portrait', 'Legal Portrait'], ['Legal-landscape', 'Legal Landscape'],
];

export const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const root = () => {
  const d = new Directory(Paths.document, 'scans');
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
};
const dirOf = (id: string) => {
  const d = new Directory(root(), id);
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
};

export function newDoc(): ScanDoc {
  const d = new Date();
  const name = `Scan ${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
  return { id: uid(), name, created: Date.now(), modified: Date.now(), pages: [] };
}

// A mode's starting edits, like Adobe Scan: auto crop (full frame for whiteboards), Auto-color for paper,
// original color for cards. Also what Reset goes back to.
export const defaultEdits = (kind: PageKind, detected: Corners | null) => ({
  corners: kind === 'whiteboard' ? null : detected,
  rotation: 0,
  filter: (kind === 'whiteboard' ? 'whiteboard' : kind === 'id' || kind === 'card' ? 'original' : 'auto') as Filter,
  brightness: 0,
  contrast: 0,
  strokes: [] as Stroke[],
});

// Moves a camera/gallery photo into the scan's folder and applies the mode's defaults.
export async function makeShot(docId: string, photo: Photo, kind: PageKind): Promise<Shot> {
  const dest = new File(dirOf(docId), `src-${uid()}.jpg`);
  try {
    await new File(photo.uri).move(dest);
  } catch {
    await new File(photo.uri).copy(dest); // gallery files we may not own
  }
  return { src: dest.uri, width: photo.width, height: photo.height, detected: photo.corners, ...defaultEdits(kind, photo.corners), rev: 1 };
}

// Renders the shot's settings to a fresh file (new name each time so <Image> never shows a stale copy).
export async function renderShot(docId: string, shot: Shot): Promise<Shot> {
  const r = await processImage(shot.src, {
    corners: shot.corners, rotation: shot.rotation, filter: shot.filter, brightness: shot.brightness,
    contrast: shot.contrast, strokes: shot.strokes, maxSize: 2400, dest: new File(dirOf(docId), `out-${uid()}.jpg`).uri,
  });
  return { ...shot, out: r.uri, outW: r.width, outH: r.height, bg: r.bg, outRev: shot.rev };
}

export function deleteFile(uri?: string) {
  try {
    if (uri) new File(uri).delete();
  } catch {}
}

export function saveDoc(doc: ScanDoc) {
  const f = new File(dirOf(doc.id), 'doc.json');
  if (!f.exists) f.create();
  f.write(JSON.stringify({ ...doc, modified: Date.now() }));
}

export function loadDoc(id: string): ScanDoc | null {
  try {
    return JSON.parse(new File(root(), id, 'doc.json').textSync()) as ScanDoc;
  } catch {
    return null;
  }
}

export function listDocs(): ScanDoc[] {
  try {
    return root().list()
      .filter((x): x is Directory => x instanceof Directory)
      .map((d) => loadDoc(d.name))
      .filter((d): d is ScanDoc => !!d && d.pages.length > 0)
      .sort((a, b) => b.modified - a.modified);
  } catch {
    return [];
  }
}

export function deleteDoc(id: string) {
  try {
    new Directory(root(), id).delete();
  } catch {}
}

// Builds the PDF into Files. Re-saving an edited scan replaces its earlier PDF under the same name.
export async function exportPdf(doc: ScanDoc): Promise<ScanDoc> {
  const pages = await Promise.all(doc.pages.map(async (p) => ({
    kind: p.kind, size: p.size, images: await Promise.all(p.shots.map((s) => readPicked(s.out ?? s.src))),
  })));
  const bytes = await imagesToPdf(pages);
  // Replace the earlier PDF wherever it is now (the user may have moved it into a folder in Files).
  const all = doc.pdf ? listAllFiles() : [];
  const old = doc.pdf && (all.find((f) => f.uri === doc.pdf!.uri) ?? all.find((f) => f.name === doc.pdf!.name));
  const folder = old ? new File(old.uri).parentDirectory.uri : undefined;
  if (old) removeFile(old.uri);
  const file = save(doc.name, 'pdf', bytes, folder);
  const next = { ...doc, pdf: { uri: file.uri, name: file.name }, saved: { name: doc.name, pages: doc.pages, sig: signature(doc) } };
  saveDoc(next);
  cleanFiles(next);
  return next;
}

// Everything a user can change, minus render output, so re-renders don't count as edits.
const signature = (doc: ScanDoc) => JSON.stringify([doc.name, doc.pages.map((p) => [
  p.id, p.kind, p.size, p.shots.map((sh) => [sh.src, sh.corners, sh.rotation, sh.filter, sh.brightness, sh.contrast, sh.strokes]),
])]);

/** True for a draft that was never saved, or a saved scan edited since. */
export const isDirty = (doc: ScanDoc) => !doc.saved || doc.saved.sig !== signature(doc);

/** After its PDF is renamed in Files: the scan takes the new name, so "Edit scan" still finds it and a re-save keeps it. */
export function relinkPdf(oldUri: string, pdf: { uri: string; name: string }) {
  const doc = listDocs().find((d) => d.pdf?.uri === oldUri);
  if (!doc) return;
  const next = { ...doc, name: pdf.name.replace(/\.pdf$/i, ''), pdf };
  const clean = doc.saved && !isDirty(doc); // a saved scan stays "Saved" rather than turning into "Unsaved changes"
  saveDoc(clean ? { ...next, saved: { ...doc.saved!, name: next.name, sig: signature(next) } } : next);
}

/** The most recent scan with unsaved work, to offer "Continue" when the scanner opens. */
export const latestDraft = () => listDocs().find(isDirty) ?? null;

/** Throws away unsaved work: a never-saved scan is deleted (returns null), a saved one returns to its last save. */
export function discardChanges(doc: ScanDoc): ScanDoc | null {
  if (!doc.saved) {
    deleteDoc(doc.id);
    return null;
  }
  const next = { ...doc, name: doc.saved.name, pages: doc.saved.pages };
  saveDoc(next);
  cleanFiles(next);
  return next;
}

// Photos and renders stay on disk while anything (current pages or the last save) points at them; this sweeps the rest.
export function cleanFiles(doc: ScanDoc) {
  const keep = new Set<string>();
  for (const p of [...doc.pages, ...(doc.saved?.pages ?? [])]) {
    for (const sh of p.shots) {
      keep.add(new File(sh.src).name);
      if (sh.out) keep.add(new File(sh.out).name);
    }
  }
  try {
    for (const f of dirOf(doc.id).list()) {
      if (f instanceof File && f.name !== 'doc.json' && !keep.has(f.name)) f.delete();
    }
  } catch {}
}

export const isRendered = (doc: ScanDoc) => doc.pages.every((p) => p.shots.every((s) => s.out && s.outRev === s.rev));

export const docForPdf = (uri: string) => listDocs().find((d) => d.pdf?.uri === uri);
