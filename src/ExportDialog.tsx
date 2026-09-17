// Files → Save as Word doc / Save as JPEG: converts, then offers where else the result should go.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { router } from 'expo-router';
import { exportAs, mimeOf, openFile, saveToDevice, share, type Saved } from './storage';
import { describeDriveError, readBackup, saveCopyToDrive } from './backup';
import { Button, DialogModal, Icon, fmtSize } from './ui';
import { makeStyles, radius, typo, useTheme } from './theme';
import type { IconName } from './tools';

export type ExportJob = { pdf: Saved; to: 'docx' | 'jpeg' };
type Dest = 'open' | 'device' | 'drive' | 'share';

// Closing while it converts only hides the dialog: the file still lands in Files and `onSaved` refreshes the list.
export function ExportDialog({ job, onClose, onSaved }: { job: ExportJob | null; onClose: () => void; onSaved: () => void }) {
  const s = useStyles();
  const { c } = useTheme();
  const [file, setFile] = useState<Saved | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState<Dest | ''>('');
  const [notes, setNotes] = useState<Partial<Record<Dest, string>>>({});

  useEffect(() => {
    if (!job) return;
    let live = true;
    setFile(null);
    setFailed(false);
    setNotes({});
    exportAs(job.pdf, job.to)
      .then((f) => { onSaved(); if (live) setFile(f); })
      .catch(() => live && setFailed(true));
    return () => { live = false; };
  }, [job]);

  if (!job) return null;
  const word = job.to === 'docx';
  const many = file?.name.toLowerCase().endsWith('.zip');

  if (failed) {
    return (
      <DialogModal visible onClose={onClose} title="Couldn’t convert this PDF" subtitle="It may be password-protected or damaged.">
        <Button label="OK" variant="secondary" onPress={onClose} style={{ marginTop: 18 }} />
      </DialogModal>
    );
  }
  if (!file) {
    return (
      <DialogModal visible onClose={onClose} title={word ? 'Saving as Word doc…' : 'Saving as JPEG…'} subtitle="Every page is converted on this phone.">
        <ActivityIndicator color={c.ink} style={{ marginVertical: 20 }} />
      </DialogModal>
    );
  }

  const run = (d: Dest, fn: () => Promise<string | void>) => async () => {
    setBusy(d);
    try {
      const note = await fn();
      if (note) setNotes((n) => ({ ...n, [d]: note }));
    } catch (e) {
      setNotes((n) => ({ ...n, [d]: e instanceof Error ? e.message : String(e) }));
    }
    setBusy('');
  };
  const drive = readBackup();
  const options: [Dest, IconName, string, string, () => Promise<string | void>][] = [
    ['open', 'open-in-new', 'Open', word ? 'In your Word or docs app' : many ? 'A ZIP with one JPEG per page' : 'In your gallery or photo app', async () => { await openFile(file); }],
    ['device', 'cellphone-arrow-down', 'Save to device', 'Pick a folder, like Downloads', async () => {
      const where = await saveToDevice(file);
      return where && `Saved to ${where}`;
    }],
    ['drive', 'google-drive', 'Save to Google Drive', drive.enabled ? `PDF Tools folder · ${drive.email}` : 'Turn on Drive sync in Settings first', async () => {
      if (!drive.enabled) { onClose(); router.navigate('/settings'); return; }
      try {
        await saveCopyToDrive(file, mimeOf(file.name));
      } catch (e) {
        throw new Error(describeDriveError(e));
      }
      return 'Uploaded to PDF Tools in your Drive';
    }],
    ['share', 'share-variant-outline', 'Share', 'Send to an app or contact', async () => { await share(file); }],
  ];

  return (
    <DialogModal
      visible onClose={onClose} title={word ? 'Word doc saved' : many ? 'JPEGs saved' : 'JPEG saved'}
      subtitle={`${file.name} · ${fmtSize(file.size)} · in Files`}
    >
      <View style={{ marginTop: 10 }}>
        {options.map(([d, icon, title, sub, fn]) => (
          <Pressable key={d} onPress={busy ? undefined : run(d, fn)} style={({ pressed }) => [s.option, pressed && { backgroundColor: c.sunken }]}>
            <Icon name={icon} size={22} color={c.ink} />
            <View style={{ flex: 1 }}>
              <Text style={s.title}>{title}</Text>
              <Text style={[s.sub, !!notes[d] && { color: c.accent }]} numberOfLines={2}>{notes[d] ?? sub}</Text>
            </View>
            {busy === d && <ActivityIndicator color={c.ink} />}
          </Pressable>
        ))}
      </View>
    </DialogModal>
  );
}

const useStyles = makeStyles((c) => ({
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 10, borderRadius: radius.tile },
  title: { ...typo.item, color: c.ink },
  sub: { ...typo.small, color: c.sub, marginTop: 1 },
}));
