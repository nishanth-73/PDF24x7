// Outputs live in the app's documents folder so they survive restarts (cache can be purged by the OS).
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { router } from 'expo-router';

export type Saved = { name: string; uri: string; size: number; modified: number };
export type Folder = { name: string; uri: string; created: number };

function rootFolder() {
  const d = new Directory(Paths.document, 'PDF Tools');
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

// ── Folder management (one level deep) ──────────────────────────────────

export function createFolder(name: string): Folder {
  const clean = name.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'New Folder';
  const root = rootFolder();
  let d = new Directory(root, clean);
  for (let i = 2; d.exists; i++) d = new Directory(root, `${clean} (${i})`);
  d.create({ intermediates: true, idempotent: true });
  return { name: d.name, uri: d.uri, created: Date.now() };
}

export function listFolders(): Folder[] {
  try {
    return rootFolder().list()
      .filter((x): x is Directory => x instanceof Directory)
      .map((d) => ({ name: d.name, uri: d.uri, created: 0 }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    return [];
  }
}

export function renameFolder(uri: string, newName: string): void {
  const clean = newName.replace(/[\\/:*?"<>|]+/g, '_').trim();
  if (!clean) return;
  try {
    const d = new Directory(uri);
    if (d.exists) {
      try {
        d.rename(clean);
      } catch {
        d.moveSync(new Directory(rootFolder(), clean));
      }
    }
  } catch (e) {
    console.warn('renameFolder failed:', e);
  }
}

export function removeFolder(uri: string): void {
  try {
    const d = new Directory(uri);
    if (d.exists) d.delete();
  } catch (e) {
    console.warn('removeFolder failed:', e);
  }
}

export function moveFile(fileUri: string, folderUri: string): void {
  try {
    const f = new File(fileUri);
    if (f.exists) {
      const targetDir = new Directory(folderUri);
      if (!targetDir.exists) targetDir.create({ intermediates: true, idempotent: true });
      const targetFile = new File(targetDir, f.name);
      try {
        f.moveSync(targetFile);
      } catch {
        f.moveSync(targetDir);
      }
    }
  } catch (e) {
    console.warn('moveFile failed:', e);
  }
}

export function moveFileToRoot(fileUri: string): void {
  try {
    const f = new File(fileUri);
    if (f.exists) {
      const root = rootFolder();
      const targetFile = new File(root, f.name);
      try {
        f.moveSync(targetFile);
      } catch {
        f.moveSync(root);
      }
    }
  } catch (e) {
    console.warn('moveFileToRoot failed:', e);
  }
}

// ── File operations ─────────────────────────────────────────────────────

// Never overwrites: "Report-merged.pdf" becomes "Report-merged (2).pdf" if taken.
export function save(base: string, ext: string, bytes: Uint8Array, folderUri?: string): Saved & { bytes: Uint8Array } {
  const d = folderUri ? new Directory(folderUri) : rootFolder();
  if (!d.exists) d.create();
  const clean = base.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'document';
  let f = new File(d, `${clean}.${ext}`);
  for (let i = 2; f.exists; i++) f = new File(d, `${clean} (${i}).${ext}`);
  f.create();
  f.write(bytes);
  return { name: f.name, uri: f.uri, size: bytes.length, modified: Date.now(), bytes };
}

export function listFiles(folderUri?: string): Saved[] {
  try {
    const d = folderUri ? new Directory(folderUri) : rootFolder();
    return d.list()
      .filter((x): x is File => x instanceof File)
      .map((f) => ({ name: f.name, uri: f.uri, size: f.size, modified: f.lastModified ?? 0 }))
      .sort((a, b) => b.modified - a.modified);
  } catch {
    return []; // no file system (web preview) or unreadable folder
  }
}

/** List every file across root + all folders (for global search). */
export function listAllFiles(): Saved[] {
  try {
    const all = listFiles();
    for (const folder of listFolders()) all.push(...listFiles(folder.uri));
    return all.sort((a, b) => b.modified - a.modified);
  } catch {
    return [];
  }
}

// Files from the document/image pickers can sit outside expo-file-system's permitted folders
// ("Missing 'READ' permission"), so read them through fetch, which handles file:// and content://.
// ponytail: RN reads the blob via a base64 data URL, so a very large PDF briefly costs ~2× its size in memory.
export async function readPicked(uri: string): Promise<Uint8Array> {
  const res = await fetch(uri);
  return new Uint8Array(await res.arrayBuffer());
}

export const removeFile = (uri: string) => new File(uri).delete();
export const clearFiles = () => rootFolder().delete();

// Tap-to-open: PDFs go to the in-app viewer; ZIPs can't be viewed, so they go to the share sheet.
export const openFile = (f: { name: string; uri: string }) =>
  f.name.toLowerCase().endsWith('.zip') ? share(f) : router.push({ pathname: '/view', params: { uri: f.uri, name: f.name } });

export const share = (f: { name: string; uri: string }) =>
  Sharing.shareAsync(f.uri, f.name.endsWith('.zip')
    ? { mimeType: 'application/zip', UTI: 'public.zip-archive' }
    : { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
