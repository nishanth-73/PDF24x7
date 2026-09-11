// Tool catalog: what each screen asks for and which engine op it runs.
// run(inputs, opts) -> [{ name: fileSuffix, bytes, ext? }]
import * as P from './pdf';

export const SECTIONS = ['Scan & Workflow', 'Page Management', 'Edit & Stamp'];

const seg = (key, label, choices, def, when) => ({ key, label, type: 'seg', choices, def, when });
const text = (key, label, def, placeholder, keyboard, when) => ({ key, label, type: 'text', def, placeholder, keyboard, when });
export const defaults = (defs = []) => Object.fromEntries(defs.map((d) => [d.key, d.def]));

const O = {
  quality: seg('quality', 'Compression level', [['80', 'Light'], ['60', 'Balanced'], ['35', 'Strong']], '60'),
  wmText: text('text', 'Watermark text', 'CONFIDENTIAL', 'CONFIDENTIAL'),
  opacity: seg('opacity', 'Opacity', [['0.1', '10%'], ['0.2', '20%'], ['0.35', '35%']], '0.2'),
  numPos: seg('position', 'Position', [['left', 'Left'], ['center', 'Center'], ['right', 'Right']], 'center'),
  numFmt: seg('format', 'Format', [['n', '1, 2, 3'], ['of', 'Page 1 of N']], 'n'),
  angle: seg('angle', 'Rotate clockwise by', [['90', '90°'], ['180', '180°'], ['270', '270°']], '90'),
  axis: seg('axis', 'Mirror', [['h', 'Horizontal'], ['v', 'Vertical'], ['both', 'Both']], 'h'),
  perSheet: seg('perSheet', 'Pages per sheet', [['2', '2'], ['4', '4'], ['6', '6'], ['9', '9'], ['16', '16']], '4'),
};

const one = (suffix, fn) => async ([f], o) => [{ name: suffix, bytes: await fn(f.bytes, o) }];
const many = (fn) => async ([f], o) => fn(f.bytes, o);

// Chainable steps for the Workflow Builder.
export const STEPS = {
  compress: { label: 'Compress', opts: [O.quality], run: P.compress },
  watermark: { label: 'Watermark', opts: [O.wmText, O.opacity], run: P.watermark },
  pageNumbers: { label: 'Page numbers', opts: [O.numPos, O.numFmt], run: P.pageNumbers },
  rotate: { label: 'Rotate', opts: [O.angle], run: P.rotate },
  flip: { label: 'Flip', opts: [O.axis], run: P.flip },
  nUp: { label: 'Pages per sheet', opts: [O.perSheet], run: P.nUp },
};

export const TOOLS = [
  {
    id: 'scan', section: 0, icon: 'camera-outline', input: 'images', cta: 'Create PDF',
    title: 'Scan Document',
    desc: 'Use your camera to scan any document and export it as a PDF. 100% on-device.',
    run: async (images) => [{ name: '', bytes: await P.imagesToPdf(images) }],
  },
  {
    id: 'workflow', section: 0, icon: 'transit-connection-variant', input: 'pdf', cta: 'Run workflow',
    title: 'PDF Workflow Builder',
    desc: 'Upload once, chain multiple operations in sequence — compress, watermark, page numbers and more in one click.',
    run: async ([f], { steps = [] }) => {
      if (!steps.length) throw new Error('Add at least one step.');
      let bytes = f.bytes;
      for (const s of steps) bytes = await STEPS[s.op].run(bytes, s.opts);
      return [{ name: 'processed', bytes }];
    },
  },
  {
    id: 'merge', section: 1, icon: 'call-merge', input: 'pdfs', cta: 'Merge PDFs',
    title: 'Merge PDFs',
    desc: 'Combine multiple PDFs into one document. Reorder files before merging.',
    run: async (files) => [{ name: 'merged', bytes: await P.merge(files) }],
  },
  {
    id: 'alternate', section: 1, icon: 'shuffle-variant', input: 'pdfs', cta: 'Mix pages',
    title: 'Alternate & Mix PDF',
    desc: 'Interleave the pages of two or more PDFs, one page from each in turn.',
    opts: [{ key: 'reverse', label: 'Reverse later files (back sides of a duplex scan)', type: 'toggle', def: false }],
    run: async (files, o) => [{ name: 'mixed', bytes: await P.alternate(files, o) }],
  },
  {
    id: 'compress', section: 1, icon: 'arrow-collapse-all', input: 'pdf', cta: 'Compress PDF',
    title: 'Compress PDF',
    desc: 'Reduce PDF file size by up to 70% while maintaining quality.',
    opts: [O.quality],
    run: one('compressed', P.compress),
  },
  {
    id: 'split', section: 1, icon: 'content-cut', input: 'pdf', cta: 'Split PDF',
    title: 'Split PDF',
    desc: 'Separate PDF into individual pages or extract specific ranges.',
    opts: [
      seg('mode', 'Split into', [['every', 'Every page'], ['ranges', 'Custom ranges']], 'every'),
      text('ranges', 'Page ranges — one file per range', '', '1-3, 4-6, 7-', 'default', (o) => o.mode === 'ranges'),
    ],
    run: many(P.split),
  },
  {
    id: 'splitText', section: 1, icon: 'format-text', input: 'pdf', cta: 'Split by text',
    title: 'Split PDF by Text',
    desc: 'Start a new file at every page containing a phrase you choose.',
    opts: [text('phrase', 'Start a new file at pages containing', '', 'e.g. Invoice No.')],
    run: many(P.splitByText),
  },
  {
    id: 'splitBookmarks', section: 1, icon: 'bookmark-outline', input: 'pdf', cta: 'Split by bookmarks',
    title: 'Split PDF by Bookmarks',
    desc: 'Turn each chapter or bookmarked section into its own PDF file.',
    run: many(P.splitByBookmarks),
  },
  {
    id: 'splitHalf', section: 1, icon: 'book-open-variant', input: 'pdf', cta: 'Split in half',
    title: 'Split PDF in Half',
    desc: 'Cut a PDF into two files, or slice every page down the middle for book scans.',
    opts: [seg('mode', 'How to split', [['file', 'Two files'], ['vertical', 'Left | Right'], ['horizontal', 'Top / Bottom']], 'file')],
    run: many(P.splitHalf),
  },
  {
    id: 'splitSize', section: 1, icon: 'weight', input: 'pdf', cta: 'Split by size',
    title: 'Split PDF by Size',
    desc: 'Break a large PDF into parts that each stay under a file size limit.',
    opts: [text('maxMB', 'Max size per part (MB)', '5', '5', 'decimal-pad')],
    run: many(P.splitBySize),
  },
  {
    id: 'organize', section: 1, icon: 'view-dashboard-outline', input: 'pdf', cta: 'Save pages',
    title: 'Organize Pages',
    desc: 'Rotate, delete, reorder, or rearrange PDF pages easily.',
    run: async ([f], { order = [] }) => [{ name: 'organized', bytes: await P.organize(f.bytes, order) }],
  },
  {
    id: 'rotate', section: 1, icon: 'rotate-right', input: 'pdf', cta: 'Rotate PDF',
    title: 'Rotate PDF',
    desc: 'Rotate individual pages or the entire PDF — 90°, 180°, 270° — 100% local.',
    opts: [O.angle, text('pages', 'Pages (leave blank for all)', '', 'e.g. 1, 3-5')],
    run: one('rotated', P.rotate),
  },
  {
    id: 'flip', section: 1, icon: 'flip-horizontal', input: 'pdf', cta: 'Flip PDF',
    title: 'Flip PDF',
    desc: 'Mirror every page of a PDF horizontally, vertically or both.',
    opts: [O.axis],
    run: one('flipped', P.flip),
  },
  {
    id: 'nup', section: 1, icon: 'view-grid-outline', input: 'pdf', cta: 'Arrange on sheets',
    title: 'Multiple Pages Per Sheet',
    desc: 'Place 2, 4, 6, 9 or 16 PDF pages on a single sheet to save paper.',
    opts: [O.perSheet],
    run: one('n-up', P.nUp),
  },
  {
    id: 'crop', section: 1, icon: 'crop', input: 'pdf', cta: 'Apply',
    title: 'Crop & Resize',
    desc: 'Crop margins, resize pages to standard sizes (A4, Letter).',
    opts: [
      seg('mode', 'Mode', [['crop', 'Crop margins'], ['resize', 'Resize pages']], 'crop'),
      text('margin', 'Trim from every edge (mm)', '10', '10', 'decimal-pad', (o) => o.mode === 'crop'),
      seg('size', 'Page size', Object.keys(P.SIZES).map((k) => [k, k]), 'A4', (o) => o.mode === 'resize'),
    ],
    run: one('resized', P.cropResize),
  },
  {
    id: 'zip', section: 1, icon: 'folder-zip-outline', input: 'pdfs', min: 1, cta: 'Create ZIP',
    title: 'PDF to ZIP',
    desc: 'Bundle multiple PDFs into a single compressed ZIP archive — fully local, zero upload.',
    run: async (files) => [{ name: 'bundle', bytes: P.zip(files), ext: 'zip' }],
  },
  {
    id: 'watermark', section: 2, icon: 'water-outline', input: 'pdf', cta: 'Add watermark',
    title: 'Add Watermark',
    desc: 'Stamp diagonal text like CONFIDENTIAL or DRAFT across every page.',
    opts: [O.wmText, O.opacity],
    run: one('watermarked', P.watermark),
  },
  {
    id: 'pageNumbers', section: 2, icon: 'format-list-numbered', input: 'pdf', cta: 'Add page numbers',
    title: 'Add Page Numbers',
    desc: 'Number every page at the bottom, left, center or right.',
    opts: [O.numPos, O.numFmt],
    run: one('numbered', P.pageNumbers),
  },
];
