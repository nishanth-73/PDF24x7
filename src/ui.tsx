import type { ReactNode } from 'react';
import {
  ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View, type StyleProp, type ViewStyle,
} from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { fonts, makeStyles, radius, typo, useTheme } from './theme';
import type { IconName, OptDef, Opts } from './tools';

export { Icon };

export const pad = (n: number) => String(n).padStart(2, '0');
export const fmtSize = (b?: number | null) =>
  b == null ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`;
export const fmtDate = (ms: number) => {
  const d = new Date(ms);
  return d.toDateString() === new Date().toDateString()
    ? d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function Screen({ children, edges = ['top'] }: { children: ReactNode; edges?: Edge[] }) {
  const s = useStyles();
  return (
    <SafeAreaView edges={edges} style={s.root}>
      <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

export function LargeTitle({ title, sub }: { title: string; sub?: string }) {
  const s = useStyles();
  return (
    <View style={s.titleBlock}>
      <Text style={s.largeTitle}>{title}</Text>
      {!!sub && <Text style={s.titleSub}>{sub}</Text>}
    </View>
  );
}

export function GroupLabel({ label, action, onAction }: { label: string; action?: string; onAction?: () => void }) {
  const s = useStyles();
  return (
    <View style={s.groupLabel}>
      <Text style={s.groupLabelText}>{label}</Text>
      {!!action && <Text style={s.groupAction} onPress={onAction} suppressHighlighting>{action}</Text>}
    </View>
  );
}

export function Group({ children }: { children: ReactNode }) {
  const s = useStyles();
  return <View style={s.group}>{children}</View>;
}

// List row with an inset separator that starts after the leading artwork, like native grouped lists.
export function Row({ lead, title, subtitle, value, onPress, first, danger, chevron, children }: {
  lead?: ReactNode; title: string; subtitle?: string; value?: string; onPress?: () => void;
  first?: boolean; danger?: boolean; chevron?: boolean; children?: ReactNode;
}) {
  const s = useStyles();
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => [s.row, pressed && { backgroundColor: c.sunken }]}>
      {lead}
      <View style={[s.rowBody, !first && s.rowRule]}>
        <View style={{ flex: 1 }}>
          <Text style={[s.rowTitle, danger && { color: c.accent }]} numberOfLines={1}>{title}</Text>
          {!!subtitle && <Text style={s.rowSub} numberOfLines={2}>{subtitle}</Text>}
        </View>
        {!!value && <Text style={s.rowValue}>{value}</Text>}
        {children}
        {chevron && <Icon name="chevron-right" size={20} color={c.faint} />}
      </View>
    </Pressable>
  );
}

export function StepHead({ n, title }: { n: number | string; title: string }) {
  const s = useStyles();
  return (
    <View style={s.step}>
      <View style={s.stepDot}><Text style={s.stepNum}>{n}</Text></View>
      <Text style={s.stepTitle}>{title}</Text>
    </View>
  );
}

export function IconBtn({ name, onPress, size = 20, color }: { name: IconName; onPress: () => void; size?: number; color?: string }) {
  const s = useStyles();
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => [s.iconBtn, pressed && { backgroundColor: c.sunken }]}>
      <Icon name={name} size={size} color={color ?? c.ink} />
    </Pressable>
  );
}

export function Button({ label, icon, variant = 'primary', onPress, busy, disabled, style }: {
  label: string; icon?: IconName; variant?: 'primary' | 'secondary'; onPress: () => void;
  busy?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const s = useStyles();
  const { c } = useTheme();
  const primary = variant === 'primary';
  const fg = primary ? c.onInk : c.ink;
  return (
    <Pressable
      onPress={onPress} disabled={disabled || busy}
      style={({ pressed }) => [s.btn, primary ? s.btnPrimary : s.btnSecondary, disabled && { opacity: 0.35 }, pressed && { opacity: 0.92 }, style]}
    >
      {busy ? <ActivityIndicator color={fg} /> : !!icon && <Icon name={icon} size={19} color={fg} />}
      <Text style={[s.btnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Options({ defs, value, onChange }: { defs: OptDef[]; value: Opts; onChange: (o: Opts) => void }) {
  const s = useStyles();
  const { c, scheme } = useTheme();
  const set = (k: string, v: unknown) => onChange({ ...value, [k]: v });
  return (
    <>
      {defs.filter((d) => !d.when || d.when(value)).map((d) => {
        if (d.type === 'toggle') {
          return (
            <View key={d.key} style={[s.field, s.toggleRow]}>
              <Text style={[s.label, { flex: 1, marginBottom: 0 }]}>{d.label}</Text>
              <Switch
                value={!!value[d.key]} onValueChange={(v) => set(d.key, v)}
                trackColor={{ true: c.accent, false: c.lineStrong }} thumbColor="#FFFFFF"
              />
            </View>
          );
        }
        return (
          <View key={d.key} style={s.field}>
            <Text style={s.label}>{d.label}</Text>
            {d.type === 'seg' ? (
              <View style={s.segTrack}>
                {d.choices.map(([v, label]) => {
                  const on = value[d.key] === v;
                  return (
                    <Pressable key={v} onPress={() => set(d.key, v)} style={[s.segItem, on && s.segOn]}>
                      <Text style={[s.segText, on && s.segTextOn]} numberOfLines={1}>{label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <TextInput
                style={s.input} value={value[d.key]} onChangeText={(v) => set(d.key, v)} placeholder={d.placeholder}
                placeholderTextColor={c.faint} keyboardType={d.keyboard ?? 'default'} autoCorrect={false}
                keyboardAppearance={scheme}
              />
            )}
          </View>
        );
      })}
    </>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.bg },
  page: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 48 },
  titleBlock: { marginTop: 12, marginBottom: 18 },
  largeTitle: { ...typo.largeTitle, color: c.ink },
  titleSub: { ...typo.small, color: c.sub, marginTop: 4 },
  groupLabel: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 26, marginBottom: 8, paddingHorizontal: 4 },
  groupLabelText: { ...typo.label, color: c.sub },
  groupAction: { fontFamily: fonts.med, fontSize: 13.5, color: c.accent },
  group: {
    backgroundColor: c.surface, borderRadius: radius.group, borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.lineStrong, overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingLeft: 12 },
  rowBody: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 54, paddingVertical: 11, paddingRight: 10 },
  rowRule: { borderTopWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong },
  rowTitle: { ...typo.item, color: c.ink },
  rowSub: { ...typo.small, color: c.sub, marginTop: 1 },
  rowValue: { ...typo.num, color: c.sub },
  step: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 28, marginBottom: 12 },
  stepDot: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: c.ink, alignItems: 'center', justifyContent: 'center' },
  stepNum: { fontFamily: fonts.bold, fontSize: 11, color: c.ink },
  stepTitle: { fontFamily: fonts.bold, fontSize: 16, color: c.ink },
  iconBtn: { padding: 7, borderRadius: 8 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, paddingHorizontal: 16, borderRadius: radius.control },
  btnPrimary: { backgroundColor: c.ink },
  btnSecondary: { borderWidth: 1, borderColor: c.lineStrong },
  btnText: { ...typo.button },
  field: { marginBottom: 18 },
  label: { fontFamily: fonts.med, fontSize: 13.5, color: c.ink, marginBottom: 8 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  segTrack: { flexDirection: 'row', backgroundColor: c.sunken, borderRadius: radius.tile, padding: 3 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4, borderRadius: 8 },
  segOn: { backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong },
  segText: { fontFamily: fonts.med, fontSize: 13.5, color: c.sub },
  segTextOn: { fontFamily: fonts.bold, color: c.ink },
  input: {
    height: 48, paddingHorizontal: 14, borderRadius: radius.control, borderWidth: 1, borderColor: c.line,
    backgroundColor: c.surface, fontFamily: fonts.sans, fontSize: 15, color: c.ink,
  },
}));
