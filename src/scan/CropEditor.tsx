// Adobe Scan's crop screen: drag the four corner handles (with a magnifier under your finger), Auto-detect, or No crop.
// Shows the photo turned the way the page is rotated; corners are stored relative to the unrotated original.
import { useRef, useState } from 'react';
import { Image, Modal, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Polygon } from 'react-native-svg';
import type { Corners } from '../../modules/doc-scanner';
import { Icon } from '../ui';
import { fonts, radius, scanUi as u } from '../theme';
import type { Page } from './model';

const FULL: Corners = [0, 0, 1, 0, 1, 1, 0, 1];
const LOUPE = 116;
const ZOOM = 2.5;
const PAD = 24;

// Original-image fractions <-> fractions of the photo as displayed after rotating clockwise.
const toView = (x: number, y: number, rot: number): [number, number] =>
  rot === 90 ? [1 - y, x] : rot === 180 ? [1 - x, 1 - y] : rot === 270 ? [y, 1 - x] : [x, y];
const fromView = (vx: number, vy: number, rot: number): [number, number] =>
  rot === 90 ? [vy, 1 - vx] : rot === 180 ? [1 - vx, 1 - vy] : rot === 270 ? [1 - vy, vx] : [vx, vy];
const same = (a: Corners | null, b: Corners | null) => (a ?? FULL).every((v, i) => Math.abs(v - (b ?? FULL)[i]) < 1e-4);

export function CropEditor({ page, onDone, onCancel }: {
  page: Page; onDone: (corners: (Corners | null)[]) => void; onCancel: () => void;
}) {
  const [side, setSide] = useState(0);
  const [all, setAll] = useState<Corners[]>(() => page.shots.map((sh) => sh.corners ?? FULL));
  const [area, setArea] = useState({ w: 0, h: 0 });
  const [drag, setDrag] = useState<{ i: number; x: number; y: number } | null>(null);
  const shot = page.shots[side];
  const rot = ((shot.rotation % 360) + 360) % 360;
  const turned = rot === 90 || rot === 270;
  const [pw, ph] = turned ? [shot.height, shot.width] : [shot.width, shot.height];
  const k = area.w ? Math.min((area.w - PAD * 2) / pw, (area.h - PAD * 2) / ph) : 0;
  const [dw, dh] = [pw * k, ph * k];
  const [ox, oy] = [(area.w - dw) / 2, (area.h - dh) / 2];
  const corners = all[side];
  const pts = Array.from({ length: 4 }, (_, i) => {
    const [vx, vy] = toView(corners[i * 2], corners[i * 2 + 1], rot);
    return [ox + vx * dw, oy + vy * dh];
  });

  const m = useRef({ pts, ox, oy, dw, dh, rot, side, start: [0, 0], idx: -1 });
  Object.assign(m.current, { pts, ox, oy, dw, dh, rot, side });

  const setCorner = (i: number, px: number, py: number) => {
    const r = m.current;
    const vx = Math.max(0, Math.min(1, (px - r.ox) / r.dw));
    const vy = Math.max(0, Math.min(1, (py - r.oy) / r.dh));
    const [x, y] = fromView(vx, vy, r.rot);
    setAll((a) => a.map((c, s) => (s !== r.side ? c : c.map((v, j) => (j === i * 2 ? x : j === i * 2 + 1 ? y : v)))));
    setDrag({ i, x: r.ox + vx * r.dw, y: r.oy + vy * r.dh });
  };

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const { locationX: x, locationY: y } = e.nativeEvent;
      const r = m.current;
      const d = r.pts.map(([px, py]) => Math.hypot(px - x, py - y));
      const idx = d.indexOf(Math.min(...d));
      r.idx = d[idx] < 56 ? idx : -1;
      if (r.idx >= 0) r.start = r.pts[idx];
    },
    onPanResponderMove: (_, g) => {
      const r = m.current;
      if (r.idx >= 0) setCorner(r.idx, r.start[0] + g.dx, r.start[1] + g.dy);
    },
    onPanResponderRelease: () => { m.current.idx = -1; setDrag(null); },
    onPanResponderTerminate: () => { m.current.idx = -1; setDrag(null); },
  })).current;

  const photo = (scale: number) => { // the rotated photo drawn into a (dw, dh) box at `scale`
    const [iw, ih] = [shot.width * k * scale, shot.height * k * scale];
    return (
      <Image
        source={{ uri: shot.src }}
        style={{ position: 'absolute', width: iw, height: ih, left: (dw * scale - iw) / 2, top: (dh * scale - ih) / 2, transform: [{ rotate: `${rot}deg` }] }}
      />
    );
  };
  const setSide0 = (c: Corners | null) => setAll((a) => a.map((x, s) => (s === side ? c ?? FULL : x)));

  return (
    <Modal visible animationType="fade" onRequestClose={onCancel} statusBarTranslucent>
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <View style={s.bar}>
          <Pressable onPress={onCancel} style={s.textBtn}><Text style={s.cancel}>Cancel</Text></Pressable>
          <Text style={s.title}>Crop</Text>
          <Pressable
            onPress={() => onDone(all.map((c, i) => (same(c, FULL) ? null : same(c, page.shots[i].corners) ? page.shots[i].corners : c)))}
            style={s.textBtn}
          >
            <Text style={s.done}>Done</Text>
          </Pressable>
        </View>

        {page.shots.length > 1 && (
          <View style={s.tabs}>
            {['Front', 'Back'].map((label, i) => (
              <Pressable key={label} onPress={() => setSide(i)} style={[s.tab, side === i && s.tabOn]}>
                <Text style={[s.tabText, side === i && { color: '#FFF' }]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={{ flex: 1 }} onLayout={(e) => setArea({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })} {...pan.panHandlers}>
          {k > 0 && (
            <>
              <View pointerEvents="none" style={{ position: 'absolute', left: ox, top: oy, width: dw, height: dh }}>{photo(1)}</View>
              <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
                <Polygon points={pts.map((p) => p.join(',')).join(' ')} fill={u.blueSoft} stroke={u.blue} strokeWidth={2} />
                {pts.map(([x, y], i) => (
                  <Circle key={i} cx={x} cy={y} r={drag?.i === i ? 14 : 11} fill="rgba(255,255,255,0.9)" stroke={u.blue} strokeWidth={3} />
                ))}
              </Svg>
              {drag && ( // magnifier, on the side away from the finger
                <View style={[s.loupe, drag.x < area.w / 2 ? { right: 16 } : { left: 16 }]} pointerEvents="none">
                  <View style={{ position: 'absolute', width: dw * ZOOM, height: dh * ZOOM, left: LOUPE / 2 - (drag.x - ox) * ZOOM, top: LOUPE / 2 - (drag.y - oy) * ZOOM }}>
                    {photo(ZOOM)}
                  </View>
                  <Svg style={StyleSheet.absoluteFill}>
                    <Line x1={LOUPE / 2 - 12} y1={LOUPE / 2} x2={LOUPE / 2 + 12} y2={LOUPE / 2} stroke={u.blue} strokeWidth={2} />
                    <Line x1={LOUPE / 2} y1={LOUPE / 2 - 12} x2={LOUPE / 2} y2={LOUPE / 2 + 12} stroke={u.blue} strokeWidth={2} />
                  </Svg>
                </View>
              )}
            </>
          )}
        </View>

        <View style={s.actions}>
          <Action icon="auto-fix" label="Auto-detect" disabled={!shot.detected} onPress={() => setSide0(shot.detected)} />
          <Action icon="fullscreen" label="No crop" onPress={() => setSide0(null)} />
          <Action icon="restore" label="Reset" onPress={() => setSide0(shot.corners)} />
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Action({ icon, label, onPress, disabled }: { icon: 'auto-fix' | 'fullscreen' | 'restore'; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable onPress={onPress} disabled={disabled} style={[s.action, disabled && { opacity: 0.35 }]}>
      <Icon name={icon} size={22} color={u.text} />
      <Text style={s.actionText}>{label}</Text>
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
  tabs: { flexDirection: 'row', alignSelf: 'center', backgroundColor: u.raised, borderRadius: radius.pill, padding: 3 },
  tab: { paddingHorizontal: 20, paddingVertical: 6, borderRadius: radius.pill },
  tabOn: { backgroundColor: u.blue },
  tabText: { fontFamily: fonts.med, fontSize: 13, color: u.dim },
  loupe: {
    position: 'absolute', top: 12, width: LOUPE, height: LOUPE, borderRadius: LOUPE / 2, overflow: 'hidden',
    borderWidth: 3, borderColor: '#FFF', backgroundColor: u.panel,
  },
  actions: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 10, backgroundColor: u.panel },
  action: { alignItems: 'center', gap: 4, minWidth: 80, paddingVertical: 4 },
  actionText: { fontFamily: fonts.med, fontSize: 12, color: u.text },
});
