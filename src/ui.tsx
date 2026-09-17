import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View,
  type AccessibilityActionEvent, type KeyboardTypeOptions, type StyleProp, type TextStyle, type ViewStyle,
} from 'react-native';
import Animated, {
  Easing, cancelAnimation, useAnimatedRef, useAnimatedStyle, useReducedMotion, useSharedValue, withDelay, withRepeat, withSequence,
  withTiming, type AnimatedRef,
} from 'react-native-reanimated';
import Sortable from 'react-native-sortables';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { fonts, makeStyles, radius, typo, useTheme } from './theme';
import type { IconName, OptDef, Opts } from './tools';

export { Icon };

export const pad = (n: number) => String(n).padStart(2, '0');
export const fmtTime = (ms: number) => new Date(ms).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
export const fmtSize = (b?: number | null) =>
  b == null ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`;
// dd/mm/yyyy everywhere a date is shown.
export const fmtDay = (ms: number) => {
  const d = new Date(ms);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};
export const fmtDate = (ms: number) =>
  new Date(ms).toDateString() === new Date().toDateString() ? fmtTime(ms) : fmtDay(ms);
export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;
// File names in lists drop the extension: the glyph beside them already says PDF, DOC, JPG or ZIP.
export const stem = (name: string) => name.replace(/\.(pdf|docx|jpg|zip)$/i, '');

// "Today · 17/09/2026", "Yesterday · …", a weekday within the past week ("Sunday · 13/09/2026"), then just the date.
export function dayLabel(ms: number) {
  const d = new Date(ms);
  const now = new Date();
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    - new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()) / 86400000); // round: DST days are 23 or 25 hours
  const word = days === 0 ? 'Today' : days === 1 ? 'Yesterday' : days > 1 && days < 7 ? d.toLocaleDateString(undefined, { weekday: 'long' }) : '';
  return word ? `${word} · ${fmtDay(ms)}` : fmtDay(ms);
}

// Splits a newest-first list into runs of the same day.
export function byDay<T extends { modified: number }>(items: T[]) {
  const groups: { label: string; items: T[] }[] = [];
  for (const it of items) {
    const label = dayLabel(it.modified);
    if (groups[groups.length - 1]?.label !== label) groups.push({ label, items: [] });
    groups[groups.length - 1].items.push(it);
  }
  return groups;
}

// The screen's scroll view, shared so drag-to-reorder lists can auto-scroll it near the edges.
const ScrollRef = createContext<AnimatedRef<Animated.ScrollView> | undefined>(undefined);

export function Screen({ children, edges = ['top'] }: { children: ReactNode; edges?: Edge[] }) {
  const s = useStyles();
  const ref = useAnimatedRef<Animated.ScrollView>();
  return (
    <SafeAreaView edges={edges} style={s.root}>
      <ScrollRef.Provider value={ref}>
        <Animated.ScrollView ref={ref} contentContainerStyle={s.page} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          {children}
        </Animated.ScrollView>
      </ScrollRef.Provider>
    </SafeAreaView>
  );
}

export const swap = <T,>(arr: T[], a: number, b: number): T[] => {
  if (b < 0 || b >= arr.length) return arr;
  const o = [...arr];
  [o[a], o[b]] = [o[b], o[a]];
  return o;
};

// Screen-reader equivalent of dragging: "Move earlier" / "Move later" actions on an item.
export const moveActions = (index: number, move: (from: number, to: number) => void) => ({
  accessibilityActions: [{ name: 'earlier', label: 'Move earlier' }, { name: 'later', label: 'Move later' }],
  onAccessibilityAction: (e: AccessibilityActionEvent) => move(index, index + (e.nativeEvent.actionName === 'earlier' ? -1 : 1)),
});

// Drag-to-reorder list or grid. With `handle`, only <DragHandle> starts a drag (for rows holding inputs and
// buttons); otherwise a long press anywhere on the item does.
export function Reorderable<T>({ data, keyOf, onReorder, renderItem, columns = 1, gap = 0, handle = false }: {
  data: T[]; keyOf: (item: T) => string; onReorder: (next: T[]) => void; renderItem: (item: T, index: number) => ReactNode;
  columns?: number; gap?: number; handle?: boolean;
}) {
  const scrollableRef = useContext(ScrollRef);
  return (
    <Sortable.Grid
      data={data} columns={columns} rowGap={gap} columnGap={gap} keyExtractor={keyOf} customHandle={handle}
      renderItem={({ item, index }) => <>{renderItem(item, index)}</>}
      onDragEnd={({ data: next }) => onReorder(next)}
      scrollableRef={scrollableRef} autoScrollEnabled={!!scrollableRef}
      activeItemScale={1.03} dragActivationDelay={handle ? 0 : 150}
    />
  );
}

export function DragHandle({ index, move }: { index: number; move: (from: number, to: number) => void }) {
  const { c } = useTheme();
  return (
    <Sortable.Handle>
      <View style={{ padding: 7 }} accessible accessibilityLabel="Reorder" {...moveActions(index, move)}>
        <Icon name="drag" size={22} color={c.faint} />
      </View>
    </Sortable.Handle>
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

// `first`: the label directly under a control row (search, filters), so it doesn't add a section-sized gap.
export function GroupLabel({ label, action, onAction, first }: { label: string; action?: string; onAction?: () => void; first?: boolean }) {
  const s = useStyles();
  return (
    <View style={[s.groupLabel, first && { marginTop: 0 }]}>
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
export function Row({ lead, title, subtitle, value, onPress, onLongPress, first, danger, chevron, marquee, children }: {
  lead?: ReactNode; title: string; subtitle?: string; value?: string; onPress?: () => void; onLongPress?: () => void;
  first?: boolean; danger?: boolean; chevron?: boolean; marquee?: boolean; children?: ReactNode;
}) {
  const s = useStyles();
  const { c } = useTheme();
  return (
    <Pressable
      onPress={onPress} onLongPress={onLongPress} disabled={!onPress && !onLongPress}
      style={({ pressed }) => [s.row, pressed && { backgroundColor: c.sunken }]}
    >
      {lead}
      <View style={[s.rowBody, !first && s.rowRule]}>
        <View style={{ flex: 1 }}>
          {marquee
            ? <Marquee text={title} style={[s.rowTitle, danger && { color: c.accent }]} />
            : ( // middle: similar names ("Scan … 14.41", "Report (2)") differ at the end, so keep both ends visible
              <Text style={[s.rowTitle, danger && { color: c.accent }]} numberOfLines={1} ellipsizeMode="middle">{title}</Text>
            )}
          {!!subtitle && <Text style={s.rowSub} numberOfLines={2}>{subtitle}</Text>}
        </View>
        {!!value && <Text style={s.rowValue}>{value}</Text>}
        {children}
        {chevron && <Icon name="chevron-right" size={20} color={c.faint} />}
      </View>
    </Pressable>
  );
}

// Single-line text that slowly scrolls back and forth when it doesn't fit, instead of ending in "…".
export function Marquee({ text, style }: { text: string; style?: StyleProp<TextStyle> }) {
  const [boxW, setBoxW] = useState(0);
  const [textW, setTextW] = useState(0);
  const reduced = useReducedMotion();
  const x = useSharedValue(0);
  const over = boxW && textW > boxW ? textW - boxW : 0;
  useEffect(() => {
    x.value = 0;
    if (!over || reduced) return;
    const go = (to: number) => withDelay(1200, withTiming(to, { duration: over * 25, easing: Easing.linear })); // ~40 px/s
    x.value = withRepeat(withSequence(go(-over), go(0)), -1);
    return () => cancelAnimation(x);
  }, [over, reduced]);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));
  if (reduced) return <Text style={style} numberOfLines={1}>{text}</Text>;
  return (
    <View style={{ overflow: 'hidden' }} onLayout={(e) => setBoxW(e.nativeEvent.layout.width)} accessible accessibilityLabel={text}>
      {/* wide track so the text lays out at its natural width instead of being clipped to the row */}
      <Animated.View style={[{ width: 4000, flexDirection: 'row' }, slide]}>
        <Text style={style} numberOfLines={1} onLayout={(e) => setTextW(e.nativeEvent.layout.width)}>{text}</Text>
      </Animated.View>
    </View>
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
  label: string; icon?: IconName; variant?: 'primary' | 'secondary' | 'danger'; onPress: () => void;
  busy?: boolean; disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
  const s = useStyles();
  const { c } = useTheme();
  const primary = variant === 'primary';
  const danger = variant === 'danger';
  const fg = primary || danger ? c.onInk : c.ink;
  return (
    <Pressable
      onPress={onPress} disabled={disabled || busy}
      style={({ pressed }) => [
        s.btn,
        primary && s.btnPrimary,
        variant === 'secondary' && s.btnSecondary,
        danger && { backgroundColor: c.accent },
        disabled && { opacity: 0.35 },
        pressed && { opacity: 0.92 },
        style,
      ]}
    >
      {busy ? <ActivityIndicator color={fg} /> : !!icon && <Icon name={icon} size={19} color={fg} />}
      <Text style={[s.btnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

export function Chip({ label, active, onPress }: { label: string; active?: boolean; onPress: () => void }) {
  const s = useStyles();
  const { c } = useTheme();
  return (
    <Pressable onPress={onPress} style={[s.chip, active && s.chipActive]}>
      <Text style={[s.chipText, active && { color: c.onInk }]}>{label}</Text>
    </Pressable>
  );
}

export function DialogModal({
  visible,
  onClose,
  title,
  subtitle,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  const s = useStyles();
  const { c } = useTheme();
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalBackdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={s.modalCard}>
          <View style={s.modalHead}>
            <View style={{ flex: 1 }}>
              <Text style={s.modalTitle}>{title}</Text>
              {!!subtitle && <Text style={s.modalSub}>{subtitle}</Text>}
            </View>
            <IconBtn name="close" size={20} color={c.faint} onPress={onClose} />
          </View>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

export function ConfirmModal({
  visible,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger = false,
  requireTyping,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  requireTyping?: string;
}) {
  const s = useStyles();
  const { c, scheme } = useTheme();
  const [typed, setTyped] = useState('');

  useEffect(() => {
    if (visible) setTyped('');
  }, [visible]);

  const isMatch = !requireTyping || typed.trim().toLowerCase() === requireTyping.toLowerCase();

  return (
    <DialogModal visible={visible} onClose={onClose} title={title}>
      <Text style={s.modalMessage}>{message}</Text>
      {!!requireTyping && (
        <View style={{ marginBottom: 18 }}>
          <Text style={s.modalTypingHint}>
            To confirm, type <Text style={{ fontFamily: fonts.bold, color: c.accent }}>{requireTyping}</Text> below:
          </Text>
          <TextInput
            value={typed}
            onChangeText={setTyped}
            placeholder={`Type "${requireTyping}"`}
            placeholderTextColor={c.faint}
            style={[s.input, { marginTop: 8 }]}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardAppearance={scheme}
            returnKeyType="done"
            onSubmitEditing={() => {
              if (isMatch) {
                onClose();
                onConfirm();
              }
            }}
          />
        </View>
      )}
      <View style={s.modalActions}>
        <Button label={cancelLabel} variant="secondary" onPress={onClose} style={{ flex: 1 }} />
        <Button
          label={confirmLabel}
          variant={danger ? 'danger' : 'primary'}
          disabled={!isMatch}
          onPress={() => {
            if (!isMatch) return;
            onClose();
            onConfirm();
          }}
          style={{ flex: 1 }}
        />
      </View>
    </DialogModal>
  );
}

export function PromptModal({
  visible,
  onClose,
  onSubmit,
  title,
  subtitle,
  placeholder = '',
  initialValue = '',
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  keyboardType,
}: {
  visible: boolean;
  onClose: () => void;
  onSubmit: (val: string) => void;
  title: string;
  subtitle?: string;
  placeholder?: string;
  initialValue?: string;
  submitLabel?: string;
  cancelLabel?: string;
  keyboardType?: KeyboardTypeOptions;
}) {
  const s = useStyles();
  const { c, scheme } = useTheme();
  const [val, setVal] = useState(initialValue);

  useEffect(() => {
    if (visible) setVal(initialValue);
  }, [visible, initialValue]);

  const handleSubmit = () => {
    const trimmed = val.trim();
    if (!trimmed) return;
    onClose();
    onSubmit(trimmed);
  };

  return (
    <DialogModal visible={visible} onClose={onClose} title={title} subtitle={subtitle}>
      <TextInput
        autoFocus
        selectTextOnFocus // the suggested name is selected, so typing replaces it and tapping keeps it for editing
        keyboardType={keyboardType}
        value={val}
        onChangeText={setVal}
        placeholder={placeholder}
        placeholderTextColor={c.faint}
        style={[s.input, { marginTop: 14, marginBottom: 18 }]}
        autoCorrect={false}
        keyboardAppearance={scheme}
        onSubmitEditing={handleSubmit}
        returnKeyType="done"
      />
      <View style={s.modalActions}>
        <Button label={cancelLabel} variant="secondary" onPress={onClose} style={{ flex: 1 }} />
        <Button label={submitLabel} variant="primary" disabled={!val.trim()} onPress={handleSubmit} style={{ flex: 1 }} />
      </View>
    </DialogModal>
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
  page: { paddingHorizontal: 18, paddingTop: 2, paddingBottom: 48 },
  titleBlock: { marginTop: 2, marginBottom: 14 },
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
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: c.lineStrong },
  chipActive: { backgroundColor: c.ink, borderColor: c.ink },
  chipText: { fontFamily: fonts.med, fontSize: 13, color: c.ink },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: c.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: c.lineStrong,
    padding: 20,
  },
  modalHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  modalTitle: {
    fontFamily: fonts.display,
    fontSize: 20,
    lineHeight: 26,
    color: c.ink,
  },
  modalSub: {
    ...typo.small,
    color: c.sub,
    marginTop: 4,
  },
  modalMessage: {
    ...typo.body,
    color: c.sub,
    marginTop: 12,
    marginBottom: 16,
  },
  modalTypingHint: {
    ...typo.small,
    color: c.ink,
    marginBottom: 4,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
  },
}));
