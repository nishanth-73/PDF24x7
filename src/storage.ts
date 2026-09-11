// Outputs live in the app's documents folder so they survive restarts (cache can be purged by the OS).
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

export type Saved = { name: string; uri: string; size: number; modified: number };

function folder() {
  const d = new Directory(Paths.document, 'PDF Tools');
  if (!d.exists) d.create();
  return d;
}

// Never overwrites: "Report-merged.pdf" becomes "Report-merged (2).pdf" if taken.
export function save(base: string, ext: string, bytes: Uint8Array): Saved & { bytes: Uint8Array } {
  const d = folder();
  const clean = base.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'document';
  let f = new File(d, `${clean}.${ext}`);
  for (let i = 2; f.exists; i++) f = new File(d, `${clean} (${i}).${ext}`);
  f.create();
  f.write(bytes);
  return { name: f.name, uri: f.uri, size: bytes.length, modified: Date.now(), bytes };
}

export function listFiles(): Saved[] {
  try {
    return folder().list()
      .filter((x): x is File => x instanceof File)
      .map((f) => ({ name: f.name, uri: f.uri, size: f.size, modified: f.lastModified ?? 0 }))
      .sort((a, b) => b.modified - a.modified);
  } catch {
    return []; // no file system (web preview) or unreadable folder
  }
}

// Files from the document/image pickers sit outside expo-file-system's sandbox (Expo Go rejects them
// with "Missing 'READ' permission"), so read them through fetch, which handles file:// and content://.
// ponytail: RN reads the blob via a base64 data URL, so a very large PDF briefly costs ~2× its size in memory.
export async function readPicked(uri: string): Promise<Uint8Array> {
  const res = await fetch(uri);
  return new Uint8Array(await res.arrayBuffer());
}

export const removeFile = (uri: string) => new File(uri).delete();
export const clearFiles = () => folder().delete();

export const share = (f: { name: string; uri: string }) =>
  Sharing.shareAsync(f.uri, f.name.endsWith('.zip')
    ? { mimeType: 'application/zip', UTI: 'public.zip-archive' }
    : { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
