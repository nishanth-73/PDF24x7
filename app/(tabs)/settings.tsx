import { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Constants from 'expo-constants';
import { clearFiles, listFiles, type Saved } from '../../src/storage';
import { ConfirmModal, Group, GroupLabel, Icon, LargeTitle, Row, Screen, fmtSize, plural } from '../../src/ui';
import { fonts, makeStyles, palettes, radius, typo, useTheme, type Palette, type ThemePref } from '../../src/theme';
import type { IconName } from '../../src/tools';

const version = Constants.expoConfig?.version ?? '1.0.0';
const THEMES: [ThemePref, string][] = [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']];

export default function SettingsTab() {
  const s = useStyles();
  const { c } = useTheme();
  const [files, setFiles] = useState<Saved[]>([]);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  useFocusEffect(useCallback(() => { setFiles(listFiles()); }, []));
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
        <Row lead={lead('trash-can-outline', true)} title="Delete all saved files" danger onPress={files.length ? () => setShowClearConfirm(true) : undefined} />
      </Group>

      <GroupLabel label="Privacy" />
      <Group>
        <Row first lead={lead('cellphone-lock')} title="Files stay on this phone" subtitle="Every tool runs on the device. There is no server to upload to." />
        <Row lead={lead('account-off-outline')} title="No account, no tracking" subtitle="No sign-up, no analytics, no ads." />
        <Row lead={lead('airplane')} title="Works offline" subtitle="Every tool works in airplane mode." />
      </Group>

      <GroupLabel label="About" />
      <Group>
        <Row first lead={lead('information-outline')} title="Version" value={version} />
        <Row lead={lead('code-tags')} title="PDF engine" value="pdf-lib" />
      </Group>

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
    </Screen>
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
