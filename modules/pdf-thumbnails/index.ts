import { requireNativeModule } from 'expo';

export type Thumb = { uri: string; width: number; height: number };
type Native = {
  render(uri: string, maxWidth: number, maxPages: number): Promise<Thumb[]>;
  pageSizes(uri: string): Promise<{ width: number; height: number }[]>;
  recompressJpeg(bytes: Uint8Array, quality: number): Promise<Uint8Array | null>;
  setPassword(bytes: Uint8Array, password: string): Promise<Uint8Array | null>;
  toJpeg(uri: string): Promise<string>;
  toDocx(uri: string): Promise<string>;
  setModified(uri: string, ms: number): boolean;
  unlock(uri: string, password: string): Promise<string | null>;
  renderPage(uri: string, index: number, maxWidth: number): Promise<Thumb>;
  redact(bytes: Uint8Array, boxesJson: string): Promise<Uint8Array>;
};

const native = requireNativeModule<Native>('PdfThumbnails');

// Renders the first `maxPages` pages (0 = all) of a PDF to JPEGs `maxWidth` pixels wide.
export const renderThumbnails = (uri: string, maxWidth = 360, maxPages = 0): Promise<Thumb[]> => native.render(uri, maxWidth, maxPages);

// Page sizes in points as shown on screen (rotation applied), read natively without parsing the PDF in JS.
export const pageSizes = (uri: string) => native.pageSizes(uri);

// Re-encodes a JPEG off the JS thread; null if Android can't decode it.
export const recompressJpeg = (bytes: Uint8Array, quality: number) => native.recompressJpeg(bytes, quality);

// AES-256 password on a PDF; null if it already has one.
export const setPdfPassword = (bytes: Uint8Array, password: string) => native.setPassword(bytes, password);

// Exports to a file in the cache and returns its uri: a .jpg (one page) or .zip of page JPEGs, or a .docx.
export const pdfToJpeg = (uri: string) => native.toJpeg(uri);
export const pdfToDocx = (uri: string) => native.toDocx(uri);

// The uri itself for a normal PDF, a decrypted cache copy if `password` opens it, or null if it needs a password.
export const unlockPdf = (uri: string, password: string) => native.unlock(uri, password);

// One page (0-based) as a cached JPEG `maxWidth` px wide.
export const renderPage = (uri: string, index: number, maxWidth: number) => native.renderPage(uri, index, maxWidth);

// [x, y, w, h] as fractions of the page as displayed, keyed by 0-based page index.
export type RedactBoxes = Record<string, [number, number, number, number][]>;
// Pages with boxes are flattened to images with the boxes burned in, so nothing under them survives.
export const redactPdf = (bytes: Uint8Array, boxes: RedactBoxes) => native.redact(bytes, JSON.stringify(boxes));

// Sets a file's last-modified time; expo-file-system can read it but not write it.
export const setFileModified = (uri: string, ms: number) => native.setModified(uri, ms);
