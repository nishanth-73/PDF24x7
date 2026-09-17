// Two-way Google Drive sync for the app's saved PDFs, run whenever a file changes.
// The phone's "PDF Tools" folder (files plus one level of folders) is kept identical to a "PDF Tools" folder in the user's
// Drive: new files, edits, renames, moves, folders and deletions go both ways. Uses the drive.file scope, so the app only
// sees what it created. Each run is a three-way compare of phone, Drive and the state after the last successful sync.
import { Directory, File, Paths } from 'expo-file-system';
import { chooseGoogleAccount, clearDriveToken, getDriveToken } from '../modules/google-auth';
import { setFileModified } from '../modules/pdf-thumbnails';

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const ROOT = 'PDF Tools';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

type Synced = { id: string; driveModified: string; localModified: number; size: number };

export type BackupState = {
  enabled: boolean;
  email?: string;
  folderId?: string;
  entries: Record<string, Synced>; // "name.pdf" or "Folder/name.pdf" -> state after the last sync
  folders: Record<string, string>; // local folder name -> Drive folder id, as of the last sync
  driveOnly: Record<string, true>; // deleted from this phone only: kept in Drive, not downloaded again
  lastSync?: number;
  error?: string; // shown in Settings and Files; cleared by the next successful sync
};

const blank = (): BackupState => ({ enabled: false, entries: {}, folders: {}, driveOnly: {} });
const stateFile = () => new File(Paths.document, 'drive-backup.json');

export function readBackup(): BackupState {
  try {
    const f = stateFile();
    // older versions stored an upload queue instead; the first sync links existing files by name and size
    return f.exists ? { ...blank(), ...JSON.parse(f.textSync()) } : blank();
  } catch {
    return blank();
  }
}

const listeners = new Set<(s: BackupState, syncing: boolean) => void>();
export const onBackupChange = (fn: (s: BackupState, syncing: boolean) => void) => {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
};
let syncing = false;
export const isSyncing = () => syncing;
const notify = () => { const s = readBackup(); listeners.forEach((fn) => fn(s, syncing)); };

function write(s: BackupState) {
  try {
    const f = stateFile();
    if (!f.exists) f.create();
    f.write(JSON.stringify(s));
  } catch {}
  notify();
}
const update = (fn: (s: BackupState) => BackupState) => write(fn(readBackup()));

// ── Drive API ───────────────────────────────────────────────────────────────

class DriveError extends Error {
  constructor(public status: number, body: string) {
    super(`Google Drive error ${status}: ${body.slice(0, 200)}`);
  }
}

async function call(token: string, url: string, init: RequestInit = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...init.headers } });
  const text = await res.text();
  if (!res.ok) throw new DriveError(res.status, text);
  return text ? JSON.parse(text) : {};
}

async function listChildren(token: string, parent: string) {
  const q = encodeURIComponent(`'${parent}' in parents and trashed=false`);
  const out: { id: string; name: string; mimeType: string; size?: string; md5Checksum?: string; modifiedTime: string }[] = [];
  let page = '';
  do {
    const res = await call(token, `${API}/files?q=${q}&pageSize=1000&fields=nextPageToken,files(id,name,mimeType,size,md5Checksum,modifiedTime)` +
      (page ? `&pageToken=${page}` : ''));
    out.push(...(res.files ?? []));
    page = res.nextPageToken ?? '';
  } while (page);
  return out;
}

async function ensureRoot(token: string, known?: string): Promise<string> {
  if (known) {
    try {
      const f = await call(token, `${API}/files/${known}?fields=id,trashed`);
      if (!f.trashed) return known;
    } catch (e) {
      if (!(e instanceof DriveError && e.status === 404)) throw e;
    }
  }
  const q = encodeURIComponent(`name='${ROOT}' and mimeType='${FOLDER_MIME}' and 'root' in parents and trashed=false`);
  const found = await call(token, `${API}/files?q=${q}&fields=files(id)`);
  if (found.files?.length) return found.files[0].id;
  return (await call(token, `${API}/files?fields=id`, { method: 'POST', body: JSON.stringify({ name: ROOT, mimeType: FOLDER_MIME }) })).id;
}

const createFolderInDrive = async (token: string, parent: string, name: string): Promise<string> =>
  (await call(token, `${API}/files?fields=id`, { method: 'POST', body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parent] }) })).id;

// Moves to Drive's Trash (recoverable for 30 days), never a permanent delete.
const trashInDrive = (token: string, id: string) =>
  call(token, `${API}/files/${id}`, { method: 'PATCH', body: JSON.stringify({ trashed: true }) }).catch((e) => {
    if (!(e instanceof DriveError && e.status === 404)) throw e;
  });

// Streams a local file into Drive: into `id` when it exists, otherwise a new file under `parent`.
async function uploadToDrive(token: string, file: File, name: string, parent: string, id?: string, mimeType = 'application/pdf') {
  if (!id) {
    id = (await call(token, `${API}/files?fields=id`, { method: 'POST', body: JSON.stringify({ name, parents: [parent], mimeType }) })).id as string;
  }
  const res = await file.upload(`${UPLOAD}/files/${id}?uploadType=media&fields=id,modifiedTime,size`, {
    httpMethod: 'PATCH', mimeType, headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeType },
  });
  if (res.status < 200 || res.status >= 300) throw new DriveError(res.status, res.body);
  const meta = JSON.parse(res.body);
  return { id: meta.id as string, driveModified: meta.modifiedTime as string };
}

// `modified` (Drive's modifiedTime) becomes the file's date, so Files sorts and groups it by when it was made, not downloaded.
async function downloadFromDrive(token: string, id: string, dest: File, modified?: string) {
  const dir = dest.parentDirectory;
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
  const tmp = new File(Paths.cache, `drive-${id}.part`);
  await File.downloadFileAsync(`${API}/files/${id}?alt=media`, tmp, { headers: { Authorization: `Bearer ${token}` }, idempotent: true });
  if (dest.exists) dest.delete(); // only replaced once the download fully succeeded
  tmp.moveSync(dest);
  if (modified) setFileModified(dest.uri, Date.parse(modified));
}

/** Sync and Drive errors in words people can act on, instead of raw Java exceptions or API bodies. */
export function describeDriveError(e: unknown): string {
  if (e instanceof DriveError) {
    if (e.status === 401) return 'Google sign-in expired. Turn sync off and on again in Settings.';
    if (e.status === 403 || e.status === 429) return 'Google Drive is limiting requests right now. Sync will try again later.';
    return `Google Drive had a problem (error ${e.status}). Sync will try again later.`;
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (/network request failed|timeout|timed out|unknownhost|unable to resolve|failed to connect|connection|socket/i.test(msg)) {
    return 'Couldn’t reach Google Drive. Check your connection; sync tries again when you open Files or save a file.';
  }
  return msg; // our own messages, like PDFs missing from Drive, are already readable
}

// ── Local side ──────────────────────────────────────────────────────────────

const localRoot = () => {
  const d = new Directory(Paths.document, ROOT);
  if (!d.exists) d.create({ intermediates: true, idempotent: true });
  return d;
};
const isPdf = (name: string) => name.toLowerCase().endsWith('.pdf');
const split = (rel: string) => { const i = rel.indexOf('/'); return i < 0 ? ['', rel] : [rel.slice(0, i), rel.slice(i + 1)]; };
const localFile = (rel: string) => { const [dir, name] = split(rel); return dir ? new File(localRoot(), dir, name) : new File(localRoot(), name); };

function scanLocal() {
  const files = new Map<string, { file: File; size: number; modified: number }>();
  const folders = new Set<string>();
  const add = (f: File, rel: string) => files.set(rel, { file: f, size: f.size ?? 0, modified: f.lastModified ?? 0 });
  for (const item of localRoot().list()) {
    if (item instanceof File) {
      if (isPdf(item.name)) add(item, item.name);
    } else {
      folders.add(item.name);
      for (const f of item.list()) if (f instanceof File && isPdf(f.name)) add(f, `${item.name}/${f.name}`);
    }
  }
  return { files, folders };
}

// ── Sync ────────────────────────────────────────────────────────────────────

let running: Promise<void> | null = null;
let again = false;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Call after any change to saved files: debounced, and coalesced with a sync already in progress. */
export function syncSoon() {
  if (!readBackup().enabled) return;
  clearTimeout(timer);
  timer = setTimeout(() => { syncNow(); }, 2000);
}

/** Runs a full two-way sync now. Concurrent calls share one run; changes made meanwhile trigger one more. */
export function syncNow(): Promise<void> {
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    do {
      again = false;
      await syncOnce();
    } while (again);
  })().finally(() => {
    running = null;
    syncing = false;
    notify();
  });
  return running;
}

async function withToken<T>(email: string, fn: (token: string) => Promise<T>): Promise<T> {
  const token = await getDriveToken(email, false);
  try {
    return await fn(token);
  } catch (e) {
    if (!(e instanceof DriveError && e.status === 401)) throw e;
    await clearDriveToken(token); // expired: drop it from Google's cache and retry once
    return fn(await getDriveToken(email, false));
  }
}

async function syncOnce() {
  const start = readBackup();
  const email = start.email;
  if (!start.enabled || !email) return;
  syncing = true;
  notify();
  // Every write is dropped if the account changed while this run was working.
  const mine = (fn: (x: BackupState) => BackupState) => update((x) => (x.email === email ? fn(x) : x));
  try {
    await withToken(email, (token) => reconcile(token, email, mine));
    mine((x) => ({ ...x, lastSync: Date.now(), error: undefined }));
  } catch (e) {
    mine((x) => ({ ...x, error: describeDriveError(e) }));
  }
}

async function reconcile(token: string, email: string, mine: (fn: (x: BackupState) => BackupState) => void) {
  const s = readBackup();
  const rootId = await ensureRoot(token, s.folderId);
  if (rootId !== s.folderId) {
    mine((x) => ({ ...x, folderId: rootId, entries: {}, folders: {}, driveOnly: {} })); // a new or recreated Drive folder: relink from scratch
  }
  const fresh = rootId !== s.folderId;
  const entries: Record<string, Synced> = fresh ? {} : { ...s.entries };
  const syncedFolders: Record<string, string> = fresh ? {} : { ...s.folders };
  const driveOnly: Record<string, true> = fresh ? {} : { ...s.driveOnly };
  const cleared = new Set<string>(); // "Drive only" marks this run removed
  // Merges with the saved state, so a "delete from this phone only" made while this run is working isn't lost.
  const save = () => mine((x) => {
    for (const rel of Object.keys(x.driveOnly)) {
      if (cleared.has(rel)) continue;
      driveOnly[rel] = true;
      delete entries[rel];
    }
    return { ...x, entries: { ...entries }, folders: { ...syncedFolders }, driveOnly: { ...driveOnly } };
  });
  const stillMine = () => readBackup().email === email;

  // Drive: files at the top level, folders, and the files inside each folder.
  const remote = new Map<string, { id: string; size: number; md5?: string; modified: string; parent: string }>();
  const remoteFolders = new Map<string, string>(); // name -> id
  for (const item of await listChildren(token, rootId)) {
    if (item.mimeType === FOLDER_MIME) {
      if (!remoteFolders.has(item.name)) remoteFolders.set(item.name, item.id);
    } else if (isPdf(item.name) && !remote.has(item.name)) {
      remote.set(item.name, { id: item.id, size: Number(item.size ?? 0), md5: item.md5Checksum, modified: item.modifiedTime, parent: rootId });
    }
  }
  for (const [folder, id] of remoteFolders) {
    for (const item of await listChildren(token, id)) {
      const rel = `${folder}/${item.name}`;
      if (item.mimeType !== FOLDER_MIME && isPdf(item.name) && !remote.has(rel)) {
        remote.set(rel, { id: item.id, size: Number(item.size ?? 0), md5: item.md5Checksum, modified: item.modifiedTime, parent: id });
      }
    }
  }
  const local = scanLocal();

  // Folders: create what's missing on either side; a folder deleted on one side goes once it's empty on the other.
  for (const folder of new Set([...local.folders, ...remoteFolders.keys(), ...Object.keys(syncedFolders)])) {
    const onPhone = local.folders.has(folder);
    const inDrive = remoteFolders.has(folder);
    const known = folder in syncedFolders;
    if (onPhone && !inDrive && !known) {
      const id = await createFolderInDrive(token, rootId, folder);
      remoteFolders.set(folder, id);
      syncedFolders[folder] = id;
    } else if (!onPhone && inDrive && !known) {
      new Directory(localRoot(), folder).create({ intermediates: true, idempotent: true });
      local.folders.add(folder);
      syncedFolders[folder] = remoteFolders.get(folder)!;
    } else if (onPhone && inDrive) {
      syncedFolders[folder] = remoteFolders.get(folder)!;
    }
  }
  save();

  const parentFor = async (rel: string) => {
    const [folder] = split(rel);
    if (!folder) return rootId;
    let id = remoteFolders.get(folder);
    if (!id) {
      id = await createFolderInDrive(token, rootId, folder);
      remoteFolders.set(folder, id);
      syncedFolders[folder] = id;
    }
    return id;
  };
  const record = (rel: string, id: string, driveModified: string, file: File) => {
    entries[rel] = { id, driveModified, localModified: file.lastModified ?? 0, size: file.size ?? 0 };
    save();
  };
  const localChanged = (rel: string) => {
    const l = local.files.get(rel)!;
    return l.modified !== entries[rel].localModified || l.size !== entries[rel].size;
  };

  // Renames and moves in Drive: a known file id now sits under a different name or folder.
  const remoteById = new Map([...remote].map(([rel, r]) => [r.id, rel]));
  for (const [rel, e] of Object.entries(entries)) {
    const now = remoteById.get(e.id);
    if (!now || now === rel || remote.has(rel) || local.files.has(now) || !local.files.has(rel) || localChanged(rel)) continue;
    const src = local.files.get(rel)!.file;
    const dest = localFile(now);
    if (!dest.parentDirectory.exists) dest.parentDirectory.create({ intermediates: true, idempotent: true });
    src.moveSync(dest);
    local.files.delete(rel);
    local.files.set(now, { file: dest, size: dest.size ?? 0, modified: dest.lastModified ?? 0 });
    delete entries[rel];
    record(now, e.id, remote.get(now)!.modified, dest);
  }

  // Renames and moves on the phone: a new file with exactly the same content (MD5) as one missing from its old spot is
  // moved in Drive instead of uploading a copy and trashing the original.
  const gone = Object.entries(entries).filter(([rel]) => !local.files.has(rel) && remote.get(rel)?.md5);
  for (const [rel, l] of local.files) {
    if (entries[rel] || remote.has(rel)) continue;
    const same = gone.filter(([old, e]) => e.size === l.size && remote.get(old)!.md5 === l.file.md5);
    const match = same.find(([old]) => split(old)[1] === split(rel)[1]) ?? same[0];
    if (!match) continue;
    const [oldRel, e] = match;
    gone.splice(gone.indexOf(match), 1);
    const parent = await parentFor(rel);
    const oldParent = remote.get(oldRel)!.parent;
    const moved = await call(token, `${API}/files/${e.id}?fields=id,modifiedTime&addParents=${parent}&removeParents=${oldParent}`, {
      method: 'PATCH', body: JSON.stringify({ name: split(rel)[1] }),
    });
    remote.delete(oldRel);
    remote.set(rel, { id: e.id, size: l.size, modified: moved.modifiedTime, parent });
    delete entries[oldRel];
    record(rel, e.id, moved.modifiedTime, l.file);
  }

  // Deletions made in Drive are applied here only if they look deliberate: many files vanishing at once (a trashed
  // folder, another app cleaning up) pauses deletes on the phone instead of wiping it.
  const missingInDrive = Object.keys(entries).filter((rel) => !remote.has(rel) && local.files.has(rel));
  const allowDriveDeletes = missingInDrive.length <= Math.max(5, Object.keys(entries).length / 2);

  for (const rel of new Set([...local.files.keys(), ...remote.keys(), ...Object.keys(entries), ...Object.keys(driveOnly)])) {
    if (!stillMine()) return;
    const l = local.files.get(rel);
    const r = remote.get(rel);
    const e = entries[rel];

    if (driveOnly[rel]) { // deleted from this phone only
      if (l || !r) { delete driveOnly[rel]; cleared.add(rel); } // back on the phone again, or gone from Drive: normal syncing resumes
      if (!l) { save(); continue; } // still only in Drive: leave it there, don't download
    }

    if (l && r && e) {
      const phoneEdit = localChanged(rel);
      const driveEdit = r.modified !== e.driveModified;
      if (phoneEdit && driveEdit) { // edited on both sides: keep both versions
        await downloadFromDrive(token, r.id, localFile(conflictName(rel, local.files)), r.modified);
        const up = await uploadToDrive(token, l.file, split(rel)[1], r.parent, r.id);
        record(rel, up.id, up.driveModified, l.file);
      } else if (phoneEdit) {
        const up = await uploadToDrive(token, l.file, split(rel)[1], r.parent, r.id);
        record(rel, up.id, up.driveModified, l.file);
      } else if (driveEdit) {
        await downloadFromDrive(token, r.id, l.file, r.modified);
        record(rel, r.id, r.modified, localFile(rel));
      } else if (Date.parse(r.modified) < l.modified - 60_000) {
        // Downloaded before dates were kept, so it's dated when it arrived. Drive's older date is when it was really made
        // (a file made on this phone is always older here than in Drive, so those are never touched).
        setFileModified(l.file.uri, Date.parse(r.modified));
        record(rel, r.id, r.modified, localFile(rel));
      }
    } else if (l && r && !e) { // on both sides but never linked (first sync, or created twice)
      if (l.size === r.size && (!r.md5 || r.md5 === l.file.md5)) { // same content: just link them
        record(rel, r.id, r.modified, l.file);
      } else {
        await downloadFromDrive(token, r.id, localFile(conflictName(rel, local.files)), r.modified);
        const up = await uploadToDrive(token, l.file, split(rel)[1], r.parent, r.id);
        record(rel, up.id, up.driveModified, l.file);
      }
    } else if (l && !r && e) { // deleted in Drive
      if (!allowDriveDeletes) continue;
      if (localChanged(rel)) { // but edited here since: re-upload instead of losing the edit
        const up = await uploadToDrive(token, l.file, split(rel)[1], await parentFor(rel));
        record(rel, up.id, up.driveModified, l.file);
      } else {
        l.file.delete();
        delete entries[rel];
        save();
      }
    } else if (l && !r && !e) { // new on the phone
      const up = await uploadToDrive(token, l.file, split(rel)[1], await parentFor(rel));
      record(rel, up.id, up.driveModified, l.file);
    } else if (!l && r && e) { // deleted on the phone
      if (readBackup().driveOnly[rel]) { // just deleted "from this phone only": keep the Drive copy
        driveOnly[rel] = true;
        delete entries[rel];
        save();
      } else if (r.modified !== e.driveModified) { // but edited in Drive since: bring the new version back
        await downloadFromDrive(token, r.id, localFile(rel), r.modified);
        record(rel, r.id, r.modified, localFile(rel));
      } else {
        await trashInDrive(token, r.id);
        delete entries[rel];
        save();
      }
    } else if (!l && r && !e) { // new in Drive
      await downloadFromDrive(token, r.id, localFile(rel), r.modified);
      record(rel, r.id, r.modified, localFile(rel));
    } else { // gone from both sides
      delete entries[rel];
      save();
    }
  }

  // Folders removed on one side, now empty on the other.
  const after = scanLocal();
  for (const [folder, id] of Object.entries(syncedFolders)) {
    const onPhone = after.folders.has(folder);
    const inDrive = remoteFolders.has(folder);
    const hasFiles = [...after.files.keys()].some((rel) => split(rel)[0] === folder);
    if (onPhone && !inDrive && !hasFiles) {
      try { new Directory(localRoot(), folder).delete(); } catch {}
      delete syncedFolders[folder];
    } else if (!onPhone && inDrive && !hasFiles) {
      const driveHasFiles = [...Object.keys(entries), ...Object.keys(driveOnly)].some((rel) => split(rel)[0] === folder);
      if (!driveHasFiles) {
        await trashInDrive(token, id);
        delete syncedFolders[folder];
      }
    } else if (!onPhone && !inDrive) {
      delete syncedFolders[folder];
    }
  }
  if (!allowDriveDeletes) {
    throw new Error(`${missingInDrive.length} PDFs are missing from Google Drive, so they were kept on this phone. ` +
      'Restore them from Drive\'s Trash, or delete them here to finish syncing.');
  }
  save();
}

// "Report.pdf" -> "Report (Drive copy).pdf", "Report (Drive copy 2).pdf", ...
function conflictName(rel: string, taken: Map<string, unknown>) {
  const base = rel.replace(/\.pdf$/i, '');
  for (let i = 1; ; i++) {
    const name = `${base} (Drive copy${i > 1 ? ` ${i}` : ''}).pdf`;
    if (!taken.has(name) && !localFile(name).exists) return name;
  }
}

// ── Account ─────────────────────────────────────────────────────────────────

/**
 * Shows the Google account picker, asks for Drive access on the chosen account, and starts syncing with it. Used both to
 * turn sync on and to switch accounts. A different account starts fresh; the previous account's Drive is left as it is.
 */
export async function connectAccount() {
  const email = await chooseGoogleAccount();
  await getDriveToken(email, true);
  const previous = readBackup();
  const same = previous.enabled && previous.email?.toLowerCase() === email.toLowerCase();
  if (previous.email && !same) await signOut(previous.email);
  write(same ? { ...previous, error: undefined } : { ...blank(), enabled: true, email });
  syncNow();
}

// Revokes this app's Drive access for one account (best effort, never throws).
async function signOut(email: string) {
  try {
    const token = await getDriveToken(email, false);
    await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, { method: 'POST' }).catch(() => {});
    await clearDriveToken(token);
  } catch {}
}

/** Turns sync off and signs out. Files stay on the phone and in Drive. */
export async function disableBackup() {
  const { email } = readBackup();
  write(blank());
  if (email) await signOut(email);
}

const relOf = (uri: string) => {
  const rootUri = localRoot().uri.replace(/\/?$/, '/');
  return uri.startsWith(rootUri) ? decodeURIComponent(uri.slice(rootUri.length)) : '';
};

/** True when these phone files have copies in Drive, so deleting can offer "this phone only". */
export function hasDriveCopies(uris: string[]) {
  const s = readBackup();
  return s.enabled && uris.some((u) => s.entries[relOf(u)]);
}

/** Call just before deleting files from the phone to keep their Drive copies (and not download them again). */
export function keepInDriveOnly(uris: string[]) {
  update((x) => {
    const entries = { ...x.entries };
    const driveOnly = { ...x.driveOnly };
    for (const rel of uris.map(relOf)) {
      if (!entries[rel]) continue;
      delete entries[rel];
      driveOnly[rel] = true;
    }
    return { ...x, entries, driveOnly };
  });
}

/** Brings a Drive-only file back onto this phone on the next sync. */
export function restoreToPhone(f: DriveFile) {
  const rel = f.folder ? `${f.folder}/${f.name}` : f.name;
  update((x) => { const driveOnly = { ...x.driveOnly }; delete driveOnly[rel]; return { ...x, driveOnly }; });
  syncNow();
}

export const isDriveOnly = (s: BackupState, f: DriveFile) => !!s.driveOnly[f.folder ? `${f.folder}/${f.name}` : f.name];

/** Sync status of a saved file, for labels in Files. */
export function syncLabel(s: BackupState, uri: string, name: string): string {
  if (!s.enabled || !isPdf(name)) return '';
  return s.entries[relOf(uri)] ? 'Synced' : 'Waiting to sync';
}

// ── Browsing Drive (Files → Google Drive) ───────────────────────────────────

export type DriveFile = { id: string; name: string; folder: string; size: number; modified: number };

/** Folders and PDFs in the synced Drive folder (one level of folders, like the phone), files newest first. */
export async function listDriveFiles(): Promise<{ folders: string[]; files: DriveFile[] }> {
  const s = readBackup();
  if (!s.enabled || !s.email) throw new Error('Google Drive sync is off.');
  return withToken(s.email, async (token) => {
    const rootId = await ensureRoot(token, s.folderId);
    const out: DriveFile[] = [];
    const folders: string[] = [];
    for (const item of await listChildren(token, rootId)) {
      if (item.mimeType === FOLDER_MIME) {
        folders.push(item.name);
        for (const f of await listChildren(token, item.id)) {
          if (f.mimeType !== FOLDER_MIME && isPdf(f.name)) {
            out.push({ id: f.id, name: f.name, folder: item.name, size: Number(f.size ?? 0), modified: Date.parse(f.modifiedTime) });
          }
        }
      } else if (isPdf(item.name)) {
        out.push({ id: item.id, name: item.name, folder: '', size: Number(item.size ?? 0), modified: Date.parse(item.modifiedTime) });
      }
    }
    return { folders: [...new Set(folders)].sort((a, b) => a.localeCompare(b)), files: out.sort((a, b) => b.modified - a.modified) };
  });
}

/** Uploads a copy of any saved file (Word doc, JPEGs…) to the Drive "PDF Tools" folder. Sync only handles PDFs, so it's left alone there. */
export async function saveCopyToDrive(f: { name: string; uri: string }, mimeType: string) {
  const s = readBackup();
  if (!s.enabled || !s.email) throw new Error('Google Drive sync is off.');
  await withToken(s.email, async (token) => uploadToDrive(token, new File(f.uri), f.name, await ensureRoot(token, s.folderId), undefined, mimeType));
}

/** A temporary local copy of a Drive file, for opening or sharing. */
export async function downloadDriveFile(f: DriveFile): Promise<{ name: string; uri: string }> {
  const s = readBackup();
  if (!s.enabled || !s.email) throw new Error('Google Drive sync is off.');
  return withToken(s.email, async (token) => {
    const dest = new File(Paths.cache, 'drive', f.name.replace(/[\\/:*?"<>|]+/g, '_'));
    await downloadFromDrive(token, f.id, dest);
    return { name: f.name, uri: dest.uri };
  });
}
