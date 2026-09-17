// Tool catalog: what each screen asks for and which engine op it runs.
import type { ComponentProps } from 'react';
import type { KeyboardTypeOptions } from 'react-native';
import type { MaterialCommunityIcons } from '@expo/vector-icons';
import * as P from './pdf';

export type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];
// Option values come straight from the UI: strings, or booleans for toggles.
export type Opts = Record<string, any>;
type When = (o: Opts) => boolean;
export type OptDef = { key: string; label: string; when?: When } & (
  | { type: 'seg'; choices: [value: string, label: string][]; def: string }
  | { type: 'text'; def: string; placeholder?: string; keyboard?: KeyboardTypeOptions }
  | { type: 'toggle'; def: boolean }
);
export type Output = P.Named & { ext?: string; full?: boolean }; // full: name already includes the source file name
export type Tool = {
  id: string;
  section: number;
  title: string;
  desc: string;
  cta: string;
  doing: string; // shown on the button while it runs
  input: 'pdf' | 'pdfs' | 'images';
  min?: number;
  noPreview?: boolean; // output isn't a PDF, or the editor already shows the result
  opts?: OptDef[];
  run: (inputs: P.Named[], opts: Opts) => Promise<Output[]>;
};
export type WorkflowStep = { id: string; op: string; opts: Opts };

// Grouped by the job you're doing. "Capture" is shown as the Scan card on Home, and as a group only in search.
export const SECTIONS = ['Capture', 'Combine & split', 'Arrange pages', 'Optimize & stamp'];

const seg = (key: string, label: string, choices: [string, string][], def: string, when?: When): OptDef =>
  ({ key, label, type: 'seg', choices, def, when });
const text = (key: string, label: string, def: string, placeholder?: string, keyboard?: KeyboardTypeOptions, when?: When): OptDef =>
  ({ key, label, type: 'text', def, placeholder, keyboard, when });
export const defaults = (defs: OptDef[] = []): Opts => Object.fromEntries(defs.map((d) => [d.key, d.def]));

const O = {
  quality: seg('quality', 'Compression level', [['80', 'Light'], ['60', 'Balanced'], ['35', 'Strong']], '60'),
  wmText: text('text', 'Watermark text', 'CONFIDENTIAL', 'CONFIDENTIAL'),
  wmScale: seg('scale', 'Size', [['0.6', 'Small'], ['1', 'Medium'], ['1.4', 'Large']], '1'),
  opacity: seg('opacity', 'Opacity', [['0.1', '10%'], ['0.2', '20%'], ['0.35', '35%']], '0.2'),
  numPos: seg('position', 'Position', [['left', 'Left'], ['center', 'Center'], ['right', 'Right']], 'center'),
  numFmt: seg('format', 'Format', [['n', '1, 2, 3'], ['of', 'Page 1 of N']], 'n'),
  angle: seg('angle', 'Rotate clockwise by', [['90', '90°'], ['180', '180°'], ['270', '270°']], '90'),
  axis: seg('axis', 'Mirror', [['h', 'Horizontal'], ['v', 'Vertical'], ['both', 'Both']], 'h'),
  perSheet: seg('perSheet', 'Pages per sheet', [['2', '2'], ['4', '4'], ['6', '6'], ['9', '9'], ['16', '16']], '4'),
};

type BytesOp = (bytes: Uint8Array, o: Opts) => Promise<Uint8Array>;
const one = (suffix: string, fn: BytesOp) => async ([f]: P.Named[], o: Opts): Promise<Output[]> =>
  [{ name: suffix, bytes: await fn(f.bytes, o) }];
const many = (fn: (bytes: Uint8Array, o: Opts) => Promise<P.Named[]>) => async ([f]: P.Named[], o: Opts) => fn(f.bytes, o);

// Workflow steps are the tools themselves: multi-PDF tools combine every current file,
// single-PDF tools run on each file. Excluded: camera input, custom editor, non-PDF output.
const NOT_STEPS = ['scan', 'workflow', 'organize', 'zip'];
export const stepTools = () => TOOLS.filter((t) => !NOT_STEPS.includes(t.id));

async function runWorkflow(files: P.Named[], steps: WorkflowStep[]): Promise<Output[]> {
  if (!steps.length) throw new Error('Add at least one step.');
  let cur = files.map((f) => ({ name: f.name.replace(/\.pdf$/i, ''), bytes: f.bytes }));
  for (const step of steps) {
    const t = toolById(step.op)!;
    if (t.input === 'pdfs') {
      const base = cur[0].name;
      cur = (await t.run(cur, step.opts)).map((o) => ({ name: `${base}-${o.name}`, bytes: o.bytes }));
      continue;
    }
    const next: P.Named[] = [];
    for (const f of cur) { // one file at a time keeps memory flat
      const outs = await t.run([f], step.opts);
      next.push(...outs.map((o) => ({ name: outs.length > 1 ? `${f.name}-${o.name}` : f.name, bytes: o.bytes })));
    }
    cur = next;
  }
  return cur.length === 1
    ? [{ name: 'processed', bytes: cur[0].bytes }]
    : cur.map((f) => ({ name: `${f.name}-processed`, bytes: f.bytes, full: true }));
}

export const TOOLS: Tool[] = [
  {
    id: 'scan', section: 0, input: 'images', cta: 'Create PDF', doing: 'Building PDF',
    title: 'Scan Document',
    desc: 'Use your camera to scan any document and export it as a PDF, processed on your phone.',
    run: () => Promise.reject(new Error('Open the scanner from the Scan tab.')), // the scanner builds its own PDF
  },
  {
    id: 'workflow', section: 3, input: 'pdfs', min: 1, cta: 'Run workflow', doing: 'Running your steps',
    title: 'PDF Workflow Builder',
    desc: 'Pick one or more PDFs, then chain any tools in order — merge, watermark, compress, split and more in one go.',
    run: (files, { steps = [] }) => runWorkflow(files, steps),
  },
  {
    id: 'merge', section: 1, input: 'pdfs', cta: 'Merge PDFs', doing: 'Merging',
    title: 'Merge PDFs',
    desc: 'Combine multiple PDFs into one document. Reorder files before merging.',
    run: async (files) => [{ name: 'merged', bytes: await P.merge(files) }],
  },
  {
    id: 'alternate', section: 1, input: 'pdfs', cta: 'Mix pages', doing: 'Interleaving pages',
    title: 'Alternate & Mix PDF',
    desc: 'Interleave the pages of two or more PDFs, one page from each in turn.',
    opts: [{ key: 'reverse', label: 'Reverse later files (back sides of a duplex scan)', type: 'toggle', def: false }],
    run: async (files, o) => [{ name: 'mixed', bytes: await P.alternate(files, o) }],
  },
  {
    id: 'compress', section: 3, input: 'pdf', cta: 'Compress PDF', doing: 'Recompressing images',
    title: 'Compress PDF',
    desc: 'Reduce PDF file size by up to 70% while maintaining quality.',
    opts: [O.quality],
    run: one('compressed', P.compress),
  },
  {
    id: 'split', section: 1, input: 'pdf', cta: 'Split PDF', doing: 'Splitting',
    title: 'Split PDF',
    desc: 'Separate PDF into individual pages or extract specific ranges.',
    opts: [
      seg('mode', 'Split into', [['every', 'Every page'], ['ranges', 'Custom ranges']], 'every'),
      text('ranges', 'Page ranges — one file per range', '', '1-3, 4-6, 7-', 'default', (o) => o.mode === 'ranges'),
    ],
    run: many(P.split),
  },
  {
    id: 'splitText', section: 1, input: 'pdf', cta: 'Split by text', doing: 'Reading every page',
    title: 'Split PDF by Text',
    desc: 'Start a new file at every page containing a phrase you choose.',
    opts: [text('phrase', 'Start a new file at pages containing', '', 'e.g. Invoice No.')],
    run: many(P.splitByText),
  },
  {
    id: 'splitBookmarks', section: 1, input: 'pdf', cta: 'Split by bookmarks', doing: 'Reading bookmarks',
    title: 'Split PDF by Bookmarks',
    desc: 'Turn each chapter or bookmarked section into its own PDF file.',
    run: many((b) => P.splitByBookmarks(b)),
  },
  {
    id: 'splitHalf', section: 1, input: 'pdf', cta: 'Split in half', doing: 'Cutting pages',
    title: 'Split PDF in Half',
    desc: 'Cut a PDF into two files, or slice every page down the middle for book scans.',
    opts: [seg('mode', 'How to split', [['file', 'Two files'], ['vertical', 'Left | Right'], ['horizontal', 'Top / Bottom']], 'file')],
    run: many(P.splitHalf),
  },
  {
    id: 'splitSize', section: 1, input: 'pdf', cta: 'Split by size', doing: 'Measuring parts',
    title: 'Split PDF by Size',
    desc: 'Break a large PDF into parts that each stay under a file size limit.',
    opts: [text('maxMB', 'Max size per part (MB)', '5', '5', 'decimal-pad')],
    run: many(P.splitBySize),
  },
  {
    id: 'organize', section: 2, noPreview: true, input: 'pdf', cta: 'Save pages', doing: 'Saving your page order',
    title: 'Organize Pages',
    desc: 'Rotate, delete, reorder, or rearrange PDF pages easily.',
    run: async ([f], { order = [] }) => [{ name: 'organized', bytes: await P.organize(f.bytes, order) }],
  },
  {
    id: 'rotate', section: 2, input: 'pdf', cta: 'Rotate PDF', doing: 'Rotating',
    title: 'Rotate PDF',
    desc: 'Rotate individual pages or the entire PDF — 90°, 180°, 270°.',
    opts: [O.angle, text('pages', 'Pages (leave blank for all)', '', 'e.g. 1, 3-5')],
    run: one('rotated', P.rotate),
  },
  {
    id: 'flip', section: 2, input: 'pdf', cta: 'Flip PDF', doing: 'Mirroring pages',
    title: 'Flip PDF',
    desc: 'Mirror every page of a PDF horizontally, vertically or both.',
    opts: [O.axis],
    run: one('flipped', P.flip),
  },
  {
    id: 'nup', section: 2, input: 'pdf', cta: 'Arrange on sheets', doing: 'Laying out sheets',
    title: 'Multiple Pages Per Sheet',
    desc: 'Place 2, 4, 6, 9 or 16 PDF pages on a single sheet to save paper.',
    opts: [O.perSheet, { key: 'lines', label: 'Thin lines between pages', type: 'toggle', def: false }],
    run: one('n-up', P.nUp),
  },
  {
    id: 'crop', section: 2, input: 'pdf', cta: 'Apply', doing: 'Resizing pages',
    title: 'Crop & Resize',
    desc: 'Crop margins, resize pages to standard sizes (A4, Letter).',
    opts: [
      seg('mode', 'Mode', [['crop', 'Crop margins'], ['resize', 'Resize pages']], 'crop'),
      text('margin', 'Trim from every edge (mm)', '10', '10', 'decimal-pad', (o) => o.mode === 'crop'),
      seg('size', 'Page size', Object.keys(P.SIZES).map((k): [string, string] => [k, k]), 'A4', (o) => o.mode === 'resize'),
    ],
    run: one('resized', P.cropResize),
  },
  {
    id: 'zip', section: 1, noPreview: true, input: 'pdfs', min: 1, cta: 'Create ZIP', doing: 'Zipping',
    title: 'PDF to ZIP',
    desc: 'Bundle multiple PDFs into a single compressed ZIP archive.',
    run: async (files) => [{ name: 'bundle', bytes: P.zip(files), ext: 'zip' }],
  },
  {
    id: 'watermark', section: 3, input: 'pdf', cta: 'Add watermark', doing: 'Stamping every page',
    title: 'Add Watermark',
    desc: 'Stamp diagonal text like CONFIDENTIAL or DRAFT across every page.',
    opts: [O.wmText, O.wmScale, O.opacity],
    run: one('watermarked', P.watermark),
  },
  {
    id: 'pageNumbers', section: 3, input: 'pdf', cta: 'Add page numbers', doing: 'Numbering pages',
    title: 'Add Page Numbers',
    desc: 'Number every page at the bottom, left, center or right.',
    opts: [O.numPos, O.numFmt],
    run: one('numbered', P.pageNumbers),
  },
];

export const toolById = (id?: string) => TOOLS.find((t) => t.id === id);
