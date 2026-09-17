// The tool you left unfinished (back, or the app closing): its picked files and options, so it can be reopened as you left it.
import { File, Paths } from 'expo-file-system';
import type { Opts } from './tools';
import type { PickedFile } from './AppFilesPickerModal';

export type ToolDraft = { tool: string; files: PickedFile[]; opts: Opts };

const file = () => new File(Paths.document, 'tool-draft.json');
const listeners = new Set<() => void>();
let current: ToolDraft | null = read();

function read(): ToolDraft | null {
  try {
    const f = file();
    if (!f.exists) return null;
    const d = JSON.parse(f.textSync()) as ToolDraft;
    // Device picks live in the cache folder, which the OS may have cleared since.
    const files = d.files.filter((x) => new File(x.uri).exists);
    return files.length ? { ...d, files } : null;
  } catch {
    return null;
  }
}

export const getToolDraft = () => current;
export const subscribeToolDraft = (fn: () => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };

export function setToolDraft(d: ToolDraft | null) {
  current = d;
  try {
    const f = file();
    if (!d) { if (f.exists) f.delete(); } else { if (!f.exists) f.create(); f.write(JSON.stringify(d)); }
  } catch {
    // disk trouble: the draft just won't survive a restart
  }
  listeners.forEach((fn) => fn());
}
