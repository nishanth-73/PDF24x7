// Adobe Scan's Cleanup (paint over stains, fingers and marks with the paper color) and Markup (pen and shapes).
// Strokes are stored as fractions of the finished page and burned in when the page renders.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Ellipse, Polyline, Rect } from 'react-native-svg';
import { processImage, type Stroke } from '../../modules/doc-scanner';
import { Icon } from '../ui';
import { fonts, radius, scanUi as u } from '../theme';
import type { IconName } from '../tools';
import { deleteFile, type Page } from './model';

type Mode = 'cleanup' | 'markup';
type Tool = { shape: Stroke['shape']; icon: IconName; label: string };

const TOOLS: Record<Mode, Tool[]> = {
  cleanup: [{ shape: 'path', icon: 'brush', label: 'Brush' }, { shape: 'fill', icon: 'rectangle', label: 'Area' }],
  markup: [
    { shape: 'path', icon: 'draw', label: 'Pen' }, { shape: 'rect', icon: 'rectangle-outline', label: 'Rectangle' },
    { shape: 'ellipse', icon: 'ellipse-outline', label: 'Ellipse' },
  ],
};
const SIZES: Record<Mode, number[]> = { cleanup: [0.02, 0.04, 0.08], markup: [0.004, 0.008, 0.016] };
const MARKUP_COLORS = ['#111111', '#1473E6', '#D7373F', '#12805C', '#E68619', '#FFFFFF'];

export function DrawEditor({ page, mode, onDone, onCancel }: {
  page: Page; mode: Mode; onDone: (strokes: Stroke[][]) => void; onCancel: () => void;
}) {
  const [side, setSide] = useState(0);
  const [all, setAll] = useState<Stroke[][]>(() => page.shots.map((sh) => sh.strokes));
  const [base, setBase] = useState<{ uri: string; w: number; h: number; bg: string } | null>(null);
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [tool, setTool] = useState(0);
  const [size, setSize] = useState(1);
  const [color, setColor] = useState(mode === 'cleanup' ? 'auto' : MARKUP_COLORS[2]);
  const [live, setLive] = useState<Stroke | null>(null);
  const shot = page.shots[side];

  useEffect(() => { // the page as rendered, minus strokes, to draw on
    let alive = true;
    let made = '';
    setBase(null);
    processImage(shot.src, {
      corners: shot.corners, rotation: shot.rotation, filter: shot.filter, brightness: shot.brightness, contrast: shot.contrast, maxSize: 1600,
    }).then((r) => {
      made = r.uri;
      if (alive) setBase({ uri: r.uri, w: r.width, h: r.height, bg: r.bg });
    }).catch(() => {});
    return () => { alive = false; deleteFile(made); };
  }, [side]);

  const k = base && area.w ? Math.min((area.w - 24) / base.w, (area.h - 24) / base.h) : 0;
  const [dw, dh] = base ? [base.w * k, base.h * k] : [0, 0];
  const [ox, oy] = [(area.w - dw) / 2, (area.h - dh) / 2];
  const fill = color === 'auto' ? base?.bg ?? '#FFFFFF' : color;

  const sideRef = useRef(side);
  sideRef.current = side;
  const m = useRef({ ox, oy, dw, dh, next: null as Stroke | null, make: (): Stroke => ({ shape: 'path', points: [], width: 0, color: '' }) });
  Object.assign(m.current, {
    ox, oy, dw, dh,
    make: (): Stroke => ({ shape: TOOLS[mode][tool].shape, points: [], width: SIZES[mode][size], color: fill }),
  });

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const r = m.current;
      const p = [(e.nativeEvent.locationX - r.ox) / r.dw, (e.nativeEvent.locationY - r.oy) / r.dh];
      r.next = { ...r.make(), points: p };
      setLive(r.next);
    },
    onPanResponderMove: (e) => {
      const r = m.current;
      if (!r.next) return;
      const x = Math.max(0, Math.min(1, (e.nativeEvent.locationX - r.ox) / r.dw));
      const y = Math.max(0, Math.min(1, (e.nativeEvent.locationY - r.oy) / r.dh));
      const pts = r.next.points;
      r.next = {
        ...r.next,
        // shapes only need their two corners; freehand skips points closer than ~0.3% to stay light
        points: r.next.shape === 'path'
          ? Math.hypot(x - pts[pts.length - 2], y - pts[pts.length - 1]) > 0.003 ? [...pts, x, y] : pts
          : [pts[0], pts[1], x, y],
      };
      setLive(r.next);
    },
    onPanResponderRelease: () => {
      const r = m.current;
      if (r.next && r.next.points.length >= 4) {
        const done = r.next;
        setAll((a) => a.map((list, i) => (i === sideRef.current ? [...list, done] : list)));
      }
      r.next = null;
      setLive(null);
    },
  })).current;

  const strokes = [...all[side], ...(live ? [live] : [])];
  const draw = (st: Stroke, i: number) => {
    const P = st.points.map((v, j) => (j % 2 ? oy + v * dh : ox + v * dw));
    const sw = Math.max(1, st.width * dw);
    if (st.shape === 'path') {
      return <Polyline key={i} points={P.join(' ')} fill="none" stroke={st.color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" />;
    }
    const [x1, y1, x2, y2] = [P[0], P[1], P[P.length - 2], P[P.length - 1]];
    const box = { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1) };
    if (st.shape === 'ellipse') {
      return <Ellipse key={i} cx={box.x + box.width / 2} cy={box.y + box.height / 2} rx={box.width / 2} ry={box.height / 2} fill="none" stroke={st.color} strokeWidth={sw} />;
    }
    return <Rect key={i} {...box} fill={st.shape === 'fill' ? st.color : 'none'} stroke={st.color} strokeWidth={st.shape === 'fill' ? 0 : sw} />;
  };

  const swatches = mode === 'cleanup' ? ['auto', '#FFFFFF', '#000000'] : MARKUP_COLORS;

  return (
    <Modal visible animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <View style={s.bar}>
          <Pressable onPress={onCancel} style={s.textBtn}><Text style={s.cancel}>Cancel</Text></Pressable>
          <Text style={s.title}>{mode === 'cleanup' ? 'Cleanup' : 'Markup'}</Text>
          <Pressable onPress={() => onDone(all)} style={s.textBtn}><Text style={s.done}>Done</Text></Pressable>
        </View>

        <View style={s.subBar}>
          {page.shots.length > 1 ? (
            <View style={s.tabs}>
              {['Front', 'Back'].map((label, i) => (
                <Pressable key={label} onPress={() => setSide(i)} style={[s.tab, side === i && s.tabOn]}>
                  <Text style={[s.tabText, side === i && { color: '#FFF' }]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          ) : <View />}
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Small icon="undo" label="Undo" disabled={!all[side].length} onPress={() => setAll((a) => a.map((l, i) => (i === side ? l.slice(0, -1) : l)))} />
            <Small icon="delete-sweep-outline" label="Clear" disabled={!all[side].length} onPress={() => setAll((a) => a.map((l, i) => (i === side ? [] : l)))} />
          </View>
        </View>

        <View style={{ flex: 1 }} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} {...pan.panHandlers}>
          {!base ? <ActivityIndicator color={u.blue} style={{ flex: 1 }} /> : k > 0 && (
            <>
              <View pointerEvents="none" style={{ position: 'absolute', left: ox, top: oy, width: dw, height: dh }}>
                <Image source={{ uri: base.uri }} style={StyleSheet.absoluteFill} />
              </View>
              <Svg style={StyleSheet.absoluteFill} pointerEvents="none">{strokes.map(draw)}</Svg>
            </>
          )}
        </View>

        <View style={s.panel}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
            {TOOLS[mode].map((t, i) => (
              <Pressable key={t.label} onPress={() => setTool(i)} style={[s.toolBtn, tool === i && s.toolOn]}>
                <Icon name={t.icon} size={20} color={tool === i ? '#FFF' : u.text} />
                <Text style={[s.toolText, tool === i && { color: '#FFF' }]}>{t.label}</Text>
              </Pressable>
            ))}
            <View style={s.divider} />
            {SIZES[mode].map((_, i) => (
              <Pressable key={i} onPress={() => setSize(i)} style={[s.sizeBtn, size === i && { borderColor: u.blue }]} accessibilityLabel={`Size ${i + 1}`}>
                <View style={{ width: 6 + i * 6, height: 6 + i * 6, borderRadius: 12, backgroundColor: u.text }} />
              </Pressable>
            ))}
          </ScrollView>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.row}>
            {swatches.map((sw) => (
              <Pressable key={sw} onPress={() => setColor(sw)} style={[s.swatchRing, color === sw && { borderColor: u.blue }]} accessibilityLabel={sw === 'auto' ? 'Paper color' : sw}>
                <View style={[s.swatch, { backgroundColor: sw === 'auto' ? base?.bg ?? '#FFF' : sw }]}>
                  {sw === 'auto' && <Text style={s.autoText}>Auto</Text>}
                </View>
              </Pressable>
            ))}
            {mode === 'cleanup' && <Text style={s.hint}>Paint over stains, fingers or marks. Auto uses the paper color.</Text>}
          </ScrollView>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Small({ icon, label, onPress, disabled }: { icon: IconName; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[s.small, disabled && { opacity: 0.35 }]} accessibilityLabel={label}>
      <Icon name={icon} size={20} color={u.text} />
      <Text style={s.smallText}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: u.bg },
  bar: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6 },
  title: { fontFamily: fonts.bold, fontSize: 16, color: u.text },
  textBtn: { paddingHorizontal: 14, height: 44, justifyContent: 'center' },
  cancel: { fontFamily: fonts.med, fontSize: 15, color: u.text },
  done: { fontFamily: fonts.bold, fontSize: 15, color: u.blue },
  subBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingBottom: 6 },
  tabs: { flexDirection: 'row', backgroundColor: u.raised, borderRadius: radius.pill, padding: 3 },
  tab: { paddingHorizontal: 18, paddingVertical: 6, borderRadius: radius.pill },
  tabOn: { backgroundColor: u.blue },
  tabText: { fontFamily: fonts.med, fontSize: 13, color: u.dim },
  small: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, backgroundColor: u.raised },
  smallText: { fontFamily: fonts.med, fontSize: 12.5, color: u.text },
  panel: { backgroundColor: u.panel, paddingVertical: 6, borderTopWidth: StyleSheet.hairlineWidth, borderColor: u.line },
  row: { paddingHorizontal: 12, paddingVertical: 6, gap: 8, alignItems: 'center' },
  toolBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: u.raised },
  toolOn: { backgroundColor: u.blue },
  toolText: { fontFamily: fonts.med, fontSize: 13, color: u.text },
  divider: { width: StyleSheet.hairlineWidth, height: 26, backgroundColor: u.line, marginHorizontal: 4 },
  sizeBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center', backgroundColor: u.raised },
  swatchRing: { padding: 3, borderRadius: 20, borderWidth: 2, borderColor: 'transparent' },
  swatch: { width: 30, height: 30, borderRadius: 15, borderWidth: 1, borderColor: u.line, alignItems: 'center', justifyContent: 'center' },
  autoText: { fontFamily: fonts.bold, fontSize: 8.5, color: '#333' },
  hint: { fontFamily: fonts.sans, fontSize: 12, color: u.dim, marginLeft: 6 },
});
