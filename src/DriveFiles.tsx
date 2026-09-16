// Files → Google Drive: what's in the synced "PDF Tools" folder of the connected account.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  downloadDriveFile, isDriveOnly, isSyncing, listDriveFiles, onBackupChange, readBackup, restoreToPhone, syncNow, type DriveFile,
} from './backup';
import { openFile, share } from './storage';
import { DocGlyph, FolderGlyph } from './art';
import { Button, Group, GroupLabel, Icon, IconBtn, Row, fmtDate, fmtSize, plural } from './ui';
import { makeStyles, typo, useTheme } from './theme';

// `folder` null shows the top level (folders, then files); a name shows that folder's files.
export function DriveFiles({ query, folder, onOpenFolder }: { query: string; folder: string | null; onOpenFolder: (name: string) => void }) {
  const s = useStyles();
  const { c } = useTheme();
  const [backup, setBackup] = useState(readBackup);
  const [syncing, setSyncing] = useState(isSyncing);
  const [data, setData] = useState<{ folders: string[]; files: DriveFile[] } | null>(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  const load = useCallback(async () => {
    if (!readBackup().enabled) return;
    setError('');
    try {
      setData(await listDriveFiles());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);
  useEffect(() => onBackupChange((st, running) => {
    setBackup(st);
    setSyncing((was) => {
      if (was && !running) load(); // a sync just finished: show the result
      return running;
    });
  }), [load]);
  useFocusEffect(useCallback(() => { load(); }, [load, backup.email]));

  if (!backup.enabled) {
    return (
      <View style={s.empty}>
        <Icon name="google-drive" size={56} color={c.faint} />
        <Text style={s.emptyTitle}>Google Drive sync is off</Text>
        <Text style={s.emptyBody}>Turn it on to keep your PDFs and folders the same on this phone and in your own Google Drive.</Text>
        <Button icon="cog-outline" label="Turn on in Settings" onPress={() => router.navigate('/settings')} style={{ alignSelf: 'stretch', marginTop: 20 }} />
      </View>
    );
  }

  const act = (f: DriveFile, fn: () => Promise<unknown>) => async () => {
    setBusyId(f.id);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusyId('');
  };
  const needle = query.trim().toLowerCase();
  const all = data?.files ?? [];
  // Searching looks everywhere (inside this folder when one is open); otherwise show just this level.
  const shown = needle
    ? all.filter((f) => (folder === null || f.folder === folder) && `${f.folder}/${f.name}`.toLowerCase().includes(needle))
    : all.filter((f) => f.folder === (folder ?? ''));
  const folders = folder === null && !needle ? data?.folders ?? [] : [];
  const problem = error || backup.error;

  return (
    <>
      <View style={{ height: 12 }} />
      <GroupLabel first label={backup.email ?? 'Google Drive'} action={syncing ? 'Syncing…' : 'Sync now'} onAction={syncing ? undefined : () => syncNow()} />
      {!!problem && <Text style={s.error}>{problem}</Text>}

      {data === null && !problem ? (
        <ActivityIndicator color={c.accent} style={{ marginTop: 40 }} />
      ) : folders.length > 0 || shown.length > 0 ? (
        <>
        {folders.length > 0 && (
          <>
            <GroupLabel label="Folders" />
            <Group>
              {folders.map((name, i) => (
                <Row
                  key={name} first={i === 0} lead={<FolderGlyph />} title={name} chevron onPress={() => onOpenFolder(name)}
                  subtitle={plural(all.filter((f) => f.folder === name).length, 'file')}
                />
              ))}
            </Group>
          </>
        )}
        {shown.length > 0 && folders.length > 0 && <GroupLabel label="Files" />}
        {shown.length > 0 && <Group>
          {shown.map((f, i) => (
            <Row
              key={f.id} first={i === 0} lead={<DocGlyph kind="pdf" />} title={f.name}
              subtitle={`${needle && f.folder ? `${f.folder} · ` : ''}${fmtSize(f.size)} · ${fmtDate(f.modified)}${isDriveOnly(backup, f) ? ' · Only in Drive' : ''}`}
              onPress={busyId ? undefined : act(f, async () => openFile(await downloadDriveFile(f)))}
            >
              {busyId === f.id ? <ActivityIndicator color={c.accent} style={{ marginHorizontal: 10 }} /> : (
                <>
                  {isDriveOnly(backup, f) && <IconBtn name="download-outline" onPress={() => restoreToPhone(f)} />}
                  <IconBtn name="share-variant-outline" onPress={act(f, async () => share(await downloadDriveFile(f)))} />
                </>
              )}
            </Row>
          ))}
        </Group>}
        </>
      ) : data && (
        <Text style={s.none}>
          {needle ? `No Drive files match "${query.trim()}".` : folder ? 'This folder has no PDFs in Drive yet.' : 'No PDFs in your Drive folder yet.'}
        </Text>
      )}
      <Text style={s.note}>Changes you make on this phone sync here automatically, and files added to "PDF Tools" in Drive come to this phone.</Text>
    </>
  );
}

const useStyles = makeStyles((c) => ({
  empty: { alignItems: 'center', paddingTop: 36, paddingHorizontal: 12 },
  emptyTitle: { ...typo.title, fontSize: 21, color: c.ink, marginTop: 12, textAlign: 'center' },
  emptyBody: { ...typo.body, color: c.sub, textAlign: 'center', marginTop: 6 },
  error: { ...typo.small, color: c.accent, marginTop: 8, marginBottom: 4 },
  none: { ...typo.body, color: c.sub, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
  note: { ...typo.small, color: c.sub, marginTop: 12 },
}));
