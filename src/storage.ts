// Outputs live in the app's documents folder so they survive restarts (cache can be purged by the OS).
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { router } from 'expo-router';
import { syncSoon } from './backup';

export type Saved = { name: string; uri: string; size: number; modified: number };
export type Folder = { name: string; uri: string; created: number };

function rootFolder() {
  const d = new Directory(Paths.document, 'PDF Tools');
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
}

// ── Folder management (one level deep) ──────────────────────────────────

export function createFolder(name: string): Folder {
  syncSoon(); // mirrored to Google Drive when sync is on
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
  syncSoon(); // mirrored to Google Drive when sync is on
  const clean = newName.replace(/[\\/:*?"<>|]+/g, '_').trim();
  if (!clean) return;
  try {
    const d = new Directory(uri);
    if (!d.exists || d.name === clean) return;
    const target = new Directory(rootFolder(), clean);
    if (target.exists) return; // avoid collision with an existing folder
    try {
      d.rename(clean);
    } catch {
      d.moveSync(target);
    }
  } catch (e) {
    console.warn('renameFolder failed:', e);
  }
}

export function removeFolder(uri: string): void {
  syncSoon(); // mirrored to Google Drive when sync is on
  try {
    const rootUri = rootFolder().uri;
    // Safety guard: ONLY delete folders inside the app's 'PDF Tools' directory.
    if (!uri.startsWith(rootUri)) {
      console.warn('Blocked attempt to delete folder outside PDF Tools directory:', uri);
      return;
    }
    const d = new Directory(uri);
    if (d.exists) d.delete();
  } catch (e) {
    console.warn('removeFolder failed:', e);
  }
}

export function moveFile(fileUri: string, folderUri: string): void {
  syncSoon(); // mirrored to Google Drive when sync is on
  try {
    const f = new File(fileUri);
    if (f.exists) {
      const targetDir = new Directory(folderUri);
      if (!targetDir.exists) targetDir.create({ intermediates: true, idempotent: true });
      let targetFile = new File(targetDir, f.name);
      if (targetFile.exists) {
        const dot = f.name.lastIndexOf('.');
        const base = dot > 0 ? f.name.slice(0, dot) : f.name;
        const ext = dot > 0 ? f.name.slice(dot + 1) : 'pdf';
        for (let i = 2; targetFile.exists; i++) targetFile = new File(targetDir, `${base} (${i}).${ext}`);
      }
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
  syncSoon(); // mirrored to Google Drive when sync is on
  try {
    const f = new File(fileUri);
    if (f.exists) {
      const root = rootFolder();
      let targetFile = new File(root, f.name);
      if (targetFile.exists) {
        const dot = f.name.lastIndexOf('.');
        const base = dot > 0 ? f.name.slice(0, dot) : f.name;
        const ext = dot > 0 ? f.name.slice(dot + 1) : 'pdf';
        for (let i = 2; targetFile.exists; i++) targetFile = new File(root, `${base} (${i}).${ext}`);
      }
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
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  const clean = base.replace(/[\\/:*?"<>|]+/g, '_').trim() || 'document';
  let f = new File(d, `${clean}.${ext}`);
  for (let i = 2; f.exists; i++) f = new File(d, `${clean} (${i}).${ext}`);
  f.create({ overwrite: true });
  f.write(bytes);
  syncSoon(); // no-op unless Google Drive sync is on
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
  try {
    const f = new File(uri);
    if (f.exists) {
      const buf = await f.arrayBuffer();
      return new Uint8Array(buf);
    }
  } catch {}
  const res = await fetch(uri);
  return new Uint8Array(await res.arrayBuffer());
}

export function removeFile(uri: string): void {
  syncSoon(); // mirrored to Google Drive when sync is on
  try {
    const rootUri = rootFolder().uri;
    // Safety guard: ONLY delete files located inside the app's 'PDF Tools' directory.
    // NEVER delete user's original files stored in user space (Downloads, Drive, device storage)!
    if (!uri.startsWith(rootUri)) {
      console.warn('Blocked attempt to delete file outside PDF Tools directory:', uri);
      return;
    }
    const f = new File(uri);
    if (f.exists) f.delete();
  } catch (e) {
    console.warn('removeFile failed:', e);
  }
}

export function clearFiles(): void {
  syncSoon(); // mirrored to Google Drive when sync is on
  try {
    const root = rootFolder();
    if (root.exists) root.delete();
    rootFolder(); // recreate clean directory
  } catch (e) {
    console.warn('clearFiles failed:', e);
  }
}

// Preview outputs live in cache and are replaced each time, so nothing lands in Files until the user runs the tool.
export function saveTemp(name: string, bytes: Uint8Array) {
  const d = new Directory(Paths.cache, 'preview');
  if (d.exists) d.delete();
  d.create({ intermediates: true, idempotent: true });
  const f = new File(d, `${Date.now()}.pdf`); // fresh path each time so the thumbnail cache never serves a stale render
  f.create();
  f.write(bytes);
  return { name, uri: f.uri };
}

// Tap-to-open: PDFs go to the in-app viewer; ZIPs can't be viewed, so they go to the share sheet.
export const openFile = (f: { name: string; uri: string }) =>
  f.name.toLowerCase().endsWith('.zip') ? share(f) : router.push({ pathname: '/view', params: { uri: f.uri, name: f.name } });

export const share = (f: { name: string; uri: string }) =>
  Sharing.shareAsync(f.uri, f.name.toLowerCase().endsWith('.zip')
    ? { mimeType: 'application/zip', UTI: 'public.zip-archive' }
    : { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
