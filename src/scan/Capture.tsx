// Adobe Scan's capture screen: capture modes, live edge dots, auto-capture when steady, flash, gallery import,
// QR links, ID card front/back with retake, and a thumbnail stack that opens the review.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Image, Linking, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Polygon } from 'react-native-svg';
import * as ImagePicker from 'expo-image-picker';
import { DocCameraView, detectPage, type Corners, type DocCameraRef, type Photo } from '../../modules/doc-scanner';
import type { PageKind } from '../pdf';
import { Icon } from '../ui';
import { fonts, radius, scanUi as u } from '../theme';
import type { IconName } from '../tools';
import { KIND_LABEL, makeShot, uid, type Page, type ScanDoc, type Shot } from './model';

const MODES: PageKind[] = ['whiteboard', 'book', 'doc', 'id', 'card'];
const STEADY_MS = 1100; // corners must hold still this long before auto-capture fires
const NOT_FOUND_MS = 6000;
const FLASH: Record<string, [next: 'off' | 'on' | 'auto', icon: IconName]> = {
  off: ['auto', 'flash-off'], auto: ['on', 'flash-auto'], on: ['off', 'flash'],
};
const moved = (a: Corners, b: Corners) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));

export function Capture({ doc, retake, paused, onAdd, onReview, onClose }: {
  doc: ScanDoc; retake: Page | null; paused?: boolean; onAdd: (page: Page) => void; onReview: () => void; onClose: () => void;
}) {
  const win = useWindowDimensions();
  const [perm, requestPerm] = ImagePicker.useCameraPermissions();
  const cam = useRef<DocCameraRef>(null);
  const [kind, setKind] = useState<PageKind>(retake?.kind ?? 'doc');
  const [flash, setFlash] = useState<'off' | 'on' | 'auto'>('off');
  const [auto, setAuto] = useState(true);
  const [corners, setCorners] = useState<Corners | null>(null);
  const [steady, setSteady] = useState(false);
  const [lost, setLost] = useState(false);
  const [busy, setBusy] = useState(false);
  const [front, setFront] = useState<Shot | null>(null); // ID card: front captured, waiting for the back
  const [qr, setQr] = useState('');
  const flashFx = useRef(new Animated.Value(0)).current;
  const track = useRef({
    last: null as Corners | null, shown: null as Corners | null, misses: 0, since: 0, armed: true, busy: false, seen: Date.now(),
    captured: null as Corners | null,
  });

  const boxW = Math.min(win.width, ((win.height - 300) * 3) / 4);
  const boxH = (boxW * 4) / 3;
  const detecting = kind !== 'whiteboard';

  useEffect(() => {
    if (perm?.status === 'undetermined') requestPerm(); // after a denial the in-preview button takes over
  }, [perm?.status]);

  useEffect(() => { // reset the auto-capture tracker when the mode changes
    setFront(null);
    setCorners(null);
    track.current = { ...track.current, last: null, shown: null, misses: 0, since: 0, armed: true, seen: Date.now(), captured: null };
  }, [kind]);

  const shoot = async () => {
    if (!cam.current || track.current.busy) return;
    track.current.busy = true; // a ref, so detection frames arriving mid-capture can't fire a second shot
    track.current.armed = false;
    setBusy(true);
    flashFx.setValue(1);
    Animated.timing(flashFx, { toValue: 0, duration: 260, useNativeDriver: true }).start();
    try {
      const photo = await cam.current.capture();
      track.current.captured = photo.corners;
      await addPhoto(photo);
    } catch {}
    track.current.busy = false;
    setBusy(false);
  };

  const addPhoto = async (photo: Photo, as: PageKind = kind) => {
    const shot = await makeShot(doc.id, photo, as);
    if (as === 'id' && !front) {
      setFront(shot);
      return;
    }
    onAdd({ id: retake?.id ?? uid(), kind: as, size: retake?.size ?? 'fit', shots: as === 'id' && front ? [front, shot] : [shot] });
    setFront(null);
    if (retake) onReview();
  };

  const importPhotos = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1, allowsMultipleSelection: !retake });
    if (r.canceled) return;
    setBusy(true);
    const as = kind === 'id' ? 'card' : kind; // one gallery photo can't be both sides
    let added = 0;
    for (const a of r.assets) {
      try {
        const found = await detectPage(a.uri); // auto-crop imported photos, like Adobe's import
        await addPhoto(found, as);
        added++;
      } catch {}
    }
    setBusy(false);
    if (added && !retake) onReview(); // a retake already returned to review in addPhoto
  };

  const onDetect = (c: Corners) => {
    const t = track.current;
    const now = Date.now();
    let found = c.length === 8 ? c : null;
    // Steady outline: ease small movements, and ride out a couple of missed frames before letting go.
    if (found && t.shown && moved(found, t.shown) < 0.05) found = found.map((v, i) => t.shown![i] * 0.55 + v * 0.45);
    if (!found && t.shown && ++t.misses <= 3) return;
    t.misses = 0;
    t.shown = found;
    setCorners(found);
    if (!found) {
      t.last = null;
      t.since = 0;
      t.armed = true; // page left the frame: ready for the next one
      setSteady(false);
      setLost(now - t.seen > NOT_FOUND_MS);
      return;
    }
    t.seen = now;
    setLost(false);
    if (t.captured && moved(found, t.captured) > 0.12) t.armed = true; // a different page is in view
    if (!t.last || moved(found, t.last) > 0.02) t.since = now;
    t.last = found;
    const isSteady = now - t.since > 250;
    setSteady(isSteady && auto && t.armed);
    if (auto && !paused && t.armed && now - t.since > STEADY_MS) shoot(); // never behind a dialog
  };

  const last = doc.pages.slice(-3);
  const status = !detecting
    ? kind === 'whiteboard' ? 'Fit the whole whiteboard in the frame' : ''
    : busy ? 'Capturing…'
    : kind === 'id' ? front ? 'Turn the card over and capture the back' : 'Capture the front of the card'
    : !auto ? 'Line up the page and tap the shutter'
    : steady ? 'Capturing… hold steady'
    : lost ? 'No document found. Capture manually.'
    : corners ? 'Hold steady' : 'Looking for document';
  const pts = corners && Array.from({ length: 4 }, (_, i) => [corners[i * 2] * boxW, corners[i * 2 + 1] * boxH]);
  const [flashNext, flashIcon] = FLASH[flash];

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.bar}>
        <Tap icon="close" label="Close" onPress={doc.pages.length ? onReview : onClose} />
        {!!retake && <Text style={s.barTitle}>Retake page</Text>}
        <View style={{ flexDirection: 'row' }}>
          <Tap icon={flashIcon} label={`Flash ${flash}`} onPress={() => setFlash(flashNext)} />
          {detecting && (
            <Pressable onPress={() => setAuto(!auto)} style={s.autoBtn} accessibilityLabel={auto ? 'Auto capture on' : 'Auto capture off'}>
              <Icon name={auto ? 'camera-iris' : 'gesture-tap'} size={20} color={auto ? u.blue : u.text} />
              <Text style={[s.autoText, auto && { color: u.blue }]}>{auto ? 'Auto' : 'Manual'}</Text>
            </Pressable>
          )}
        </View>
      </View>

      <View style={[s.preview, { width: boxW, height: boxH }]}>
        {perm?.granted ? (
          <>
            <DocCameraView
              ref={cam} style={StyleSheet.absoluteFill} flash={flash} detect={detecting} qr={kind === 'doc'}
              onDetect={(e) => onDetect(e.nativeEvent.corners)} onQr={(e) => setQr(e.nativeEvent.data)}
            />
            {pts && (
              <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
                <Polygon points={pts.map((p) => p.join(',')).join(' ')} fill={u.blueSoft} stroke={u.blue} strokeWidth={2.5} />
                {pts.map(([x, y], i) => <Circle key={i} cx={x} cy={y} r={9} fill="#FFFFFF" stroke={u.blue} strokeWidth={4} />)}
              </Svg>
            )}
          </>
        ) : (
          <View style={s.center}>
            <Icon name="camera-off-outline" size={36} color={u.dim} />
            <Text style={s.permText}>Allow camera access to scan documents.</Text>
            <Pressable onPress={() => (perm?.canAskAgain ? requestPerm() : Linking.openSettings())} style={s.pill}>
              <Text style={s.pillText}>{perm?.canAskAgain === false ? 'Open Settings' : 'Allow camera'}</Text>
            </Pressable>
          </View>
        )}
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { backgroundColor: '#FFF', opacity: flashFx }]} />

        {!!status && (
          <View style={s.statusWrap} pointerEvents="none">
            <Text style={[s.status, steady && { backgroundColor: u.blue }]}>{status}</Text>
          </View>
        )}

        {!!front && (
          <View style={s.frontCard}>
            <Image source={{ uri: front.src }} style={s.frontImg} />
            <View style={{ flex: 1 }}>
              <Text style={s.frontTitle}>Front captured</Text>
              <Text style={s.frontSub}>Now capture the back</Text>
            </View>
            <Pressable onPress={() => setFront(null)} style={s.pillDark}>
              <Icon name="camera-retake-outline" size={16} color={u.text} />
              <Text style={s.pillDarkText}>Retake</Text>
            </Pressable>
          </View>
        )}

        {!!qr && (
          <View style={s.qr}>
            <Icon name="qrcode" size={22} color={u.blue} />
            <Text style={s.qrText} numberOfLines={2}>{qr}</Text>
            <Pressable onPress={() => (/^https?:\/\//i.test(qr) ? Linking.openURL(qr) : Share.share({ message: qr }))} hitSlop={8}>
              <Text style={s.qrAction}>{/^https?:\/\//i.test(qr) ? 'Open' : 'Share'}</Text>
            </Pressable>
            <Pressable onPress={() => setQr('')} hitSlop={8}><Icon name="close" size={18} color="#555" /></Pressable>
          </View>
        )}
      </View>

      {!retake && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.modes}>
          {MODES.map((m) => (
            <Pressable key={m} onPress={() => setKind(m)} hitSlop={6} accessibilityState={{ selected: m === kind }}>
              <Text style={[s.mode, m === kind && s.modeOn]}>{KIND_LABEL[m]}</Text>
            </Pressable>
          ))}
        </ScrollView>
      )}

      <View style={s.controls}>
        <Tap icon="image-multiple-outline" label="Import from gallery" onPress={importPhotos} size={28} />
        <Pressable onPress={shoot} disabled={busy || !perm?.granted} accessibilityLabel="Capture" style={({ pressed }) => [s.shutter, pressed && { transform: [{ scale: 0.94 }] }]}>
          {busy ? <ActivityIndicator color={u.blue} /> : <View style={[s.shutterInner, steady && { backgroundColor: u.blue }]} />}
        </Pressable>
        <Pressable onPress={onReview} disabled={!doc.pages.length} style={s.stack} accessibilityLabel={`Review ${doc.pages.length} pages`}>
          {last.map((p, i) => (
            <Image
              key={p.id} source={{ uri: p.shots[0].out ?? p.shots[0].src }}
              style={[s.stackImg, { transform: [{ rotate: `${(i - last.length + 1) * 7}deg` }] }]}
            />
          ))}
          {doc.pages.length > 0 && <Text style={s.count}>{doc.pages.length}</Text>}
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

function Tap({ icon, label, onPress, size = 24 }: { icon: IconName; label: string; onPress: () => void; size?: number }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityLabel={label} style={({ pressed }) => [s.tap, pressed && { opacity: 0.6 }]}>
      <Icon name={icon} size={size} color={u.text} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: u.bg },
  bar: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 8 },
  barTitle: { fontFamily: fonts.bold, fontSize: 16, color: u.text },
  tap: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  autoBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, height: 48 },
  autoText: { fontFamily: fonts.med, fontSize: 13, color: u.text },
  preview: { alignSelf: 'center', backgroundColor: u.panel, overflow: 'hidden' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 12 },
  permText: { fontFamily: fonts.med, fontSize: 15, color: u.text, textAlign: 'center' },
  pill: { backgroundColor: u.blue, paddingHorizontal: 22, paddingVertical: 10, borderRadius: radius.pill },
  pillText: { fontFamily: fonts.bold, fontSize: 14, color: '#FFF' },
  statusWrap: { position: 'absolute', left: 0, right: 0, bottom: 18, alignItems: 'center' },
  status: {
    fontFamily: fonts.med, fontSize: 13.5, color: '#FFF', backgroundColor: u.scrim, overflow: 'hidden',
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill,
  },
  frontCard: {
    position: 'absolute', left: 12, right: 12, top: 12, flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 10, borderRadius: radius.control, backgroundColor: u.scrim,
  },
  frontImg: { width: 56, height: 40, borderRadius: 4, backgroundColor: u.raised },
  frontTitle: { fontFamily: fonts.bold, fontSize: 14, color: u.text },
  frontSub: { fontFamily: fonts.sans, fontSize: 12, color: u.dim },
  pillDark: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: u.raised },
  pillDarkText: { fontFamily: fonts.med, fontSize: 13, color: u.text },
  qr: {
    position: 'absolute', left: 12, right: 12, top: 12, flexDirection: 'row', alignItems: 'center', gap: 10,
    padding: 12, borderRadius: radius.control, backgroundColor: '#FFF',
  },
  qrText: { flex: 1, fontFamily: fonts.med, fontSize: 13, color: '#111' },
  qrAction: { fontFamily: fonts.bold, fontSize: 14, color: u.blue },
  modes: { paddingHorizontal: 24, gap: 26, alignItems: 'center', height: 58 },
  mode: { fontFamily: fonts.med, fontSize: 15.5, color: u.text },
  modeOn: { fontFamily: fonts.bold, color: u.blue },
  controls: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingBottom: 6 },
  shutter: { width: 78, height: 78, borderRadius: 39, borderWidth: 4, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: '#FFF' },
  stack: { width: 56, height: 70, alignItems: 'center', justifyContent: 'center' },
  stackImg: { position: 'absolute', width: 46, height: 60, borderRadius: 4, borderWidth: 1.5, borderColor: '#FFF', backgroundColor: u.raised },
  count: {
    position: 'absolute', right: -6, top: -4, minWidth: 22, height: 22, borderRadius: 11, textAlign: 'center', lineHeight: 22,
    fontFamily: fonts.bold, fontSize: 12, color: '#FFF', backgroundColor: u.blue, overflow: 'hidden', paddingHorizontal: 5,
  },
});
