import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, Switch, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { clearFiles, listAllFiles, type Saved } from '../../src/storage';
import { Button, ConfirmModal, DialogModal, Group, GroupLabel, Icon, LargeTitle, Row, Screen, fmtDate, fmtSize, plural } from '../../src/ui';
import { connectAccount, disableBackup, hasDriveCopies, isSyncing, keepInDriveOnly, onBackupChange, readBackup, syncNow } from '../../src/backup';
import { Consent } from '../../src/Consent';
import { fonts, makeStyles, palettes, radius, typo, useTheme, type Palette, type ThemePref } from '../../src/theme';
import type { IconName } from '../../src/tools';

const version = Constants.expoConfig?.version ?? '1.0.0';
const THEMES: [ThemePref, string][] = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']];

export default function SettingsTab() {
  const s = useStyles();
  const { c } = useTheme();
  const [files, setFiles] = useState<Saved[]>(listAllFiles); // loaded before the first render: no "0 files" flash
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [showClearChoice, setShowClearChoice] = useState(false); // files are also in Google Drive
  const [showTerms, setShowTerms] = useState(false);
  const clearAll = (keepDrive: boolean) => {
    if (keepDrive) keepInDriveOnly(files.map((f) => f.uri));
    clearFiles();
    setFiles([]);
    setShowClearChoice(false);
  };
  useFocusEffect(useCallback(() => { setFiles(listAllFiles()); }, []));
  const total = files.reduce((sum, f) => sum + f.size, 0);

  const lead = (name: IconName, danger?: boolean) => (
    <View style={s.lead}><Icon name={name} size={20} color={danger ? c.accent : c.sub} /></View>
  );

  return (
    <Screen>
      <LargeTitle title="Settings" />

      <GroupLabel label="Appearance" />
      <ThemePicker />

      <GroupLabel label="Storage" />
      <Group>
        <Row first lead={lead('folder-outline')} title="Saved files" value={String(files.length)} />
        <Row lead={lead('harddisk')} title="Space used" value={fmtSize(total)} />
        <Row lead={lead('trash-can-outline', true)} title="Delete all saved files" danger onPress={files.length ? () => (hasDriveCopies(files.map((f) => f.uri)) ? setShowClearChoice(true) : setShowClearConfirm(true)) : undefined} />
      </Group>

      <GroupLabel label="Google Drive" />
      <DriveBackup files={files} lead={lead} />

      <GroupLabel label="Privacy" />
      <Group>
        {readBackup().enabled ? (
          <Row first lead={lead('cellphone-lock')} title="Processed on this phone" subtitle="Every tool runs on the device. Your PDFs sync only with your own Google Drive, and nobody else sees them." />
        ) : (
          <Row first lead={lead('cellphone-lock')} title="Files stay on this phone" subtitle="Every tool runs on the device. PDFs leave it only if you turn on Google Drive sync." />
        )}
        <Row lead={lead('account-off-outline')} title="No account needed, no tracking" subtitle="No sign-up, no analytics, no ads." />
        <Row lead={lead('airplane')} title="Works offline" subtitle="Every tool works in airplane mode. Syncing waits until you're online." />
      </Group>

      <GroupLabel label="About" />
      <Group>
        <Row first lead={lead('information-outline')} title="Version" value={version} />
        <Row lead={lead('code-tags')} title="PDF engine" value="pdf-lib" />
        <Row
          lead={lead('shield-check-outline')} title="Privacy Policy & Terms" chevron
          onPress={() => setShowTerms(true)}
        />
      </Group>

      <Modal visible={showTerms} animationType="slide" onRequestClose={() => setShowTerms(false)}>
        <Consent onClose={() => setShowTerms(false)} />
      </Modal>

      <ConfirmModal
        visible={showClearConfirm}
        title="Delete all saved files?"
        message={`${plural(files.length, 'file')} made in PDF Tools will be removed. The PDFs you picked as input are not touched.`}
        confirmLabel="Delete all"
        danger
        requireTyping="confirm"
        onConfirm={() => {
          clearFiles();
          setFiles([]);
        }}
        onClose={() => setShowClearConfirm(false)}
      />
      <DialogModal
        visible={showClearChoice} onClose={() => setShowClearChoice(false)} title="Delete all saved files?"
        subtitle={`${plural(files.length, 'file')} made in PDF Tools. They're also in your Google Drive.`}
      >
        <View style={{ gap: 10, marginTop: 18 }}>
          <Button icon="cellphone-remove" label="Delete from this phone only" variant="secondary" onPress={() => clearAll(true)} />
          <Button icon="delete-outline" label="Delete from phone and Drive" variant="danger" onPress={() => clearAll(false)} />
          <Text style={s.backupNote}>
            Phone only keeps everything in Drive; download files again from Files → Google Drive. Phone and Drive moves the
            Drive copies to Drive's Trash for 30 days.
          </Text>
        </View>
      </DialogModal>
    </Screen>
  );
}

function DriveBackup({ files, lead }: { files: Saved[]; lead: (name: IconName, danger?: boolean) => React.ReactNode }) {
  const s = useStyles();
  const { c } = useTheme();
  const [state, setState] = useState(readBackup);
  const [syncing, setSyncing] = useState(isSyncing);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmOff, setConfirmOff] = useState(false);
  useEffect(() => onBackupChange((s, running) => { setState(s); setSyncing(running); }), []);

  const connect = async () => { // turning sync on and changing accounts both go through the account picker
    setBusy(true);
    setError('');
    try {
      await connectAccount();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };
  const status = !state.enabled ? 'Off'
    : syncing ? 'Syncing…'
    : state.error ? 'Needs attention'
    : state.lastSync ? `Synced · ${fmtDate(state.lastSync)}` : 'Not synced yet';

  return (
    <>
      <Group>
        <Row
          first lead={lead('google-drive')} title="Sync PDFs with Google Drive"
          subtitle={state.enabled ? state.email ?? 'Signed in' : 'Keeps your PDFs and folders the same on this phone and in your Drive'}
        >
          {busy ? <ActivityIndicator color={c.accent} /> : (
            <Switch
              value={state.enabled} onValueChange={(on) => (on ? connect() : setConfirmOff(true))}
              trackColor={{ true: c.accent, false: c.lineStrong }} thumbColor="#FFFFFF"
            />
          )}
        </Row>
        {state.enabled && (
          <>
            <Row lead={lead('cloud-sync-outline')} title="Status" value={status} />
            <Row lead={lead('sync')} title="Sync now" onPress={syncing ? undefined : () => syncNow()} />
            <Row
              lead={lead('account-switch-outline')} title="Change account" subtitle="Sync with a different Google account"
              onPress={busy ? undefined : connect}
            />
          </>
        )}
      </Group>
      {/* The last run's problem is hidden while a new run is trying again. */}
      {!!(error || (state.enabled && !syncing && state.error)) && <Text style={s.backupError}>{error || state.error}</Text>}
      {state.enabled && (
        <Text style={s.backupNote}>
          Syncs both ways whenever you save, rename, move or delete a file, and when you open Files. Deleted files go to
          Drive's Trash for 30 days. Only files made by PDF Tools are visible to the app in your Drive.
        </Text>
      )}
      <ConfirmModal
        visible={confirmOff} onClose={() => setConfirmOff(false)} title="Turn off Drive sync?" confirmLabel="Turn off"
        message="PDF Tools signs out of Google Drive. Your files stay on this phone and in your Drive, but stop syncing."
        onConfirm={async () => { setBusy(true); await disableBackup(); setBusy(false); }}
      />
    </>
  );
}

function ThemePicker() {
  const s = useStyles();
  const { pref, setPref } = useTheme();
  return (
    <View style={s.themes}>
      {THEMES.map(([p, label]) => {
        const on = pref === p;
        return (
          <Pressable key={p} onPress={() => setPref(p)} style={s.theme} accessibilityRole="radio" accessibilityState={{ selected: on }}>
            <View style={[s.swatch, on && s.swatchOn]}>
              {p === 'system' ? (
                <>
                  <Mini p={palettes.light} />
                  <Mini p={palettes.dark} />
                </>
              ) : (
                <Mini p={palettes[p]} />
              )}
            </View>
            <Text style={[s.themeLabel, on && s.themeLabelOn]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// A tiny drawing of the app in that palette: title, a list card, the accent.
function Mini({ p }: { p: Palette }) {
  return (
    <View style={{ flex: 1, backgroundColor: p.bg, padding: 8, gap: 5 }}>
      <View style={{ height: 6, width: '65%', borderRadius: 3, backgroundColor: p.ink }} />
      <View style={{ flex: 1, borderRadius: 4, backgroundColor: p.surface, borderWidth: 1, borderColor: p.line }} />
      <View style={{ height: 5, width: '40%', borderRadius: 3, backgroundColor: p.accent }} />
    </View>
  );
}

const useStyles = makeStyles((c) => ({
  lead: { width: 28, alignItems: 'center' },
  backupError: { ...typo.small, color: c.accent, marginTop: 8 },
  backupNote: { ...typo.small, color: c.sub, marginTop: 8 },
  themes: { flexDirection: 'row', gap: 10 },
  theme: { flex: 1, alignItems: 'center' },
  swatch: {
    alignSelf: 'stretch', height: 84, flexDirection: 'row', overflow: 'hidden',
    borderRadius: radius.control, borderWidth: 1, borderColor: c.lineStrong,
  },
  swatchOn: { borderWidth: 2.5, borderColor: c.accent },
  themeLabel: { ...typo.small, fontFamily: fonts.med, color: c.sub, marginTop: 8 },
  themeLabelOn: { fontFamily: fonts.bold, color: c.ink },
}));
