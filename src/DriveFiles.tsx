// Files → Google Drive: what's in the synced "PDF Tools" folder of the connected account. Files only in Drive stay
// there until chosen: tap the download icon, or hold a file to select several (a whole day at once) and download them.
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  cachedDriveFiles, describeDriveError, downloadDriveFile, downloadToPhone, isOnPhone, isSyncing, listDriveFiles, onBackupChange,
  readBackup, syncNow, type DriveFile,
} from './backup';
import { openFile, share } from './storage';
import { DocGlyph, FolderGlyph } from './art';
import { Button, Group, GroupLabel, Icon, IconBtn, Row, byDay, fmtSize, fmtTime, plural, stem, useFloating } from './ui';
import { fonts, makeStyles, radius, typo, useTheme } from './theme';

// `folder` null shows the top level (folders, then files); a name shows that folder's files.
export function DriveFiles({ query, folder, onOpenFolder }: { query: string; folder: string | null; onOpenFolder: (name: string) => void }) {
  const s = useStyles();
  const { c } = useTheme();
  const [backup, setBackup] = useState(readBackup);
  const [syncing, setSyncing] = useState(isSyncing);
  const [data, setData] = useState(cachedDriveFiles); // the last listing, shown at once instead of a spinner every visit
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const [picked, setPicked] = useState<Set<string> | null>(null); // selected file ids; null when not selecting
  const [downloading, setDownloading] = useState(''); // progress label while downloading to the phone

  // Only the first visit fetches: after that every sync, which lists Drive anyway, leaves a fresh listing behind.
  const load = useCallback(async () => {
    if (!readBackup().enabled) return;
    const cached = cachedDriveFiles();
    if (cached) { setData(cached); return; }
    setError('');
    try {
      setData(await listDriveFiles());
    } catch (e) {
      setError(describeDriveError(e));
    }
  }, []);
  useEffect(() => onBackupChange((st, running) => {
    setBackup(st);
    setSyncing(running);
    const cached = cachedDriveFiles();
    if (cached) setData(cached);
  }), []);
  useFocusEffect(useCallback(() => { load(); }, [load, backup.email]));

  // Back leaves selection before it leaves a folder (this handler is added last, so it runs first).
  useEffect(() => {
    if (!picked) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => { setPicked(null); return true; });
    return () => sub.remove();
  }, [!!picked]);

  const all = data?.files ?? [];
  const chosen = all.filter((f) => picked?.has(f.id));
  const toFetch = chosen.filter((f) => !isOnPhone(backup, f));
  const download = async (list: DriveFile[]) => {
    const todo = list.filter((f) => !isOnPhone(readBackup(), f));
    if (!todo.length) { setPicked(null); return; }
    setError('');
    const label = (done: number) => (todo.length > 1 ? `Downloading ${Math.min(done + 1, todo.length)} of ${todo.length}…` : 'Downloading…');
    setDownloading(label(0));
    try {
      await downloadToPhone(todo, (done) => setDownloading(label(done)));
      setPicked(null);
    } catch (e) {
      setError(describeDriveError(e));
    }
    setDownloading('');
  };

  // The selection bar floats over the bottom of the screen, so it stays in reach however far the list is scrolled.
  useFloating(picked ? (
    <View style={s.bar}>
      <IconBtn name="close" onPress={() => setPicked(null)} />
      <View style={s.barText}>
        <Text style={s.barTitle}>{plural(chosen.length, 'file')} selected</Text>
        <Text style={s.barSub} numberOfLines={1}>
          {downloading || (toFetch.length
            ? `${fmtSize(toFetch.reduce((n, f) => n + f.size, 0))} to download${toFetch.length < chosen.length ? ` · ${chosen.length - toFetch.length} already here` : ''}`
            : 'Already on this phone')}
        </Text>
      </View>
      <Button
        icon="download-outline" label="Download" busy={!!downloading} disabled={!toFetch.length}
        onPress={() => download(chosen)} style={s.barBtn}
      />
    </View>
  ) : null, [picked, data, downloading, backup]);

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
      setError(describeDriveError(e));
    }
    setBusyId('');
  };
  const toggle =(ids: string[], on: boolean) => setPicked((cur) => {
    const next = new Set(cur ?? []);
    ids.forEach((id) => (on ? next.add(id) : next.delete(id)));
    return next.size ? next : null; // unticking the last one leaves selection
  });

  const needle = query.trim().toLowerCase();
  // Searching looks everywhere (inside this folder when one is open); otherwise show just this level.
  const shown = needle
    ? all.filter((f) => (folder === null || f.folder === folder) && `${f.folder}/${f.name}`.toLowerCase().includes(needle))
    : all.filter((f) => f.folder === (folder ?? ''));
  const folders = folder === null && !needle ? data?.folders ?? [] : [];
  const problem = error || (!syncing && backup.error); // the last run's problem is hidden while a new run tries again

  return (
    <>
      <View style={{ height: 12 }} />
      <GroupLabel first label={backup.email ?? 'Google Drive'} action={syncing ? 'Syncing…' : 'Sync now'} onAction={syncing ? undefined : () => syncNow()} />
      {!!problem && <Text style={s.error}>{problem}</Text>}
      {!!downloading && !picked && <Text style={s.progress}>{downloading}</Text>}

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
        {byDay(shown).map((g, gi) => {
          const ids = g.items.map((f) => f.id);
          const allOn = !!picked && ids.every((id) => picked.has(id));
          return (
            <View key={g.label}>
              <GroupLabel
                label={g.label} first={gi === 0 && !folders.length}
                action={picked ? (allOn ? 'Deselect' : 'Select all') : undefined} onAction={() => toggle(ids, !allOn)}
              />
              <Group>
                {g.items.map((f, i) => {
                  const here = isOnPhone(backup, f);
                  const on = !!picked?.has(f.id);
                  return (
                    <Row
                      key={f.id} first={i === 0} title={stem(f.name)} marquee
                      lead={picked
                        ? <Icon name={on ? 'checkbox-marked' : 'checkbox-blank-outline'} size={24} color={on ? c.accent : c.faint} />
                        : <DocGlyph kind="pdf" />}
                      subtitle={`${needle && f.folder ? `${f.folder} · ` : ''}${fmtSize(f.size)} · ${fmtTime(f.modified)}${here ? ' · On this phone' : ''}`}
                      onPress={picked ? () => toggle([f.id], !on) : busyId ? undefined : act(f, async () => openFile(await downloadDriveFile(f)))}
                      // Always set: a long press that starts selecting re-renders this row, and without it the same touch
                      // would count as a tap when the finger lifts and untick the file straight away.
                      onLongPress={() => !downloading && toggle([f.id], !on)}
                    >
                      {!picked && (busyId === f.id ? <ActivityIndicator color={c.accent} style={{ marginHorizontal: 10 }} /> : (
                        <>
                          {!here && <IconBtn name="download-outline" onPress={downloading ? () => {} : () => download([f])} />}
                          <IconBtn name="share-variant-outline" onPress={act(f, async () => share(await downloadDriveFile(f)))} />
                        </>
                      ))}
                    </Row>
                  );
                })}
              </Group>
            </View>
          );
        })}
        </>
      ) : data && (
        <Text style={s.none}>
          {needle ? `No Drive files match "${query.trim()}".` : folder ? 'This folder has no PDFs in Drive yet.' : 'No PDFs in your Drive folder yet.'}
        </Text>
      )}
      <Text style={s.note}>
        {picked
          ? 'Tap files to add or remove them, or Select all for a whole day.'
          : 'Everything you save on this phone is backed up here. Files only in Drive stay there until you download them: tap the arrow, or hold a file to pick several.'}
      </Text>
    </>
  );
}

const useStyles = makeStyles((c) => ({
  empty: { alignItems: 'center', paddingTop: 36, paddingHorizontal: 12 },
  emptyTitle: { ...typo.title, fontSize: 21, color: c.ink, marginTop: 12, textAlign: 'center' },
  emptyBody: { ...typo.body, color: c.sub, textAlign: 'center', marginTop: 6 },
  error: { ...typo.small, color: c.accent, marginTop: 8, marginBottom: 4 },
  progress: { ...typo.small, color: c.sub, marginTop: 8, marginBottom: 4 },
  none: { ...typo.body, color: c.sub, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
  note: { ...typo.small, color: c.sub, marginTop: 12 },
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 4, padding: 8, paddingLeft: 4,
    borderRadius: radius.card, backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong,
    elevation: 12, shadowColor: '#000', shadowOpacity: 0.25, shadowRadius: 16, shadowOffset: { width: 0, height: 6 },
  },
  barText: { flex: 1, marginLeft: 2 },
  barTitle: { fontFamily: fonts.bold, fontSize: 15, color: c.ink },
  barSub: { ...typo.small, color: c.sub, marginTop: 1 },
  barBtn: { height: 46, paddingHorizontal: 18 },
}));
