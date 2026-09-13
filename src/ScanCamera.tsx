// Full-screen scanner: modes, flash, gallery import, QR reader and a running page count. Pages stream out via onAdd.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Linking, Modal, Pressable, ScrollView, Share, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, type FlashMode } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { CARD_FRAME, type ScanMode } from './pdf';
import { Button, Icon } from './ui';
import { fonts, radius, useTheme } from './theme';
import type { IconName } from './tools';

export type ScanShot = { name: string; uri: string; size?: number | null; mode?: ScanMode; back?: string };

const MODES: [ScanMode, string][] = [['doc', 'Document'], ['book', 'Book'], ['id', 'ID card'], ['card', 'Business card']];
const FLASH: Record<string, [next: FlashMode, icon: IconName]> = {
  off: ['auto', 'flash-off'], auto: ['on', 'flash-auto'], on: ['off', 'flash'],
};
const HINT: Record<ScanMode, string> = {
  doc: 'Fill the frame with the page',
  book: 'Fit both pages — each photo becomes 2 pages',
  id: 'Line up the FRONT of the card',
  card: 'Line up the card inside the frame',
};

export function ScanCamera({ visible, count, lastUri, onAdd, onClose }: {
  visible: boolean; count: number; lastUri?: string; onAdd: (shots: ScanShot[]) => void; onClose: () => void;
}) {
  const { c } = useTheme();
  const win = useWindowDimensions();
  const [perm, requestPerm] = useCameraPermissions();
  const cam = useRef<CameraView>(null);
  const [mode, setMode] = useState<ScanMode>('doc');
  const [flash, setFlash] = useState<FlashMode>('off');
  const [qr, setQr] = useState(false);
  const [qrData, setQrData] = useState('');
  const [busy, setBusy] = useState(false);
  const [front, setFront] = useState(''); // ID card front, waiting for the back

  // Same 3:4 as the photo, so what you frame is what you get; shrinks on short screens to leave room for the controls.
  const previewH = Math.min((win.width * 4) / 3, win.height - 300);
  const width = (previewH * 3) / 4;

  useEffect(() => {
    if (visible && perm?.status === 'undetermined') requestPerm(); // first open only; after a denial the button takes over
  }, [visible, perm?.status]);
  const card = mode === 'id' || mode === 'card';

  const pickMode = (m: ScanMode) => { setMode(m); setFront(''); };

  const shoot = async () => {
    if (!cam.current || busy) return;
    setBusy(true);
    try {
      const { uri } = await cam.current.takePictureAsync({ quality: 0.8 });
      if (mode === 'id' && !front) setFront(uri);
      else {
        onAdd([mode === 'id' ? { name: 'Page', uri: front, back: uri, mode } : { name: 'Page', uri, mode }]);
        setFront('');
      }
    } catch {} // camera closed mid-capture
    setBusy(false);
  };

  const importPhotos = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: true });
    if (!r.canceled) onAdd(r.assets.map((a) => ({ name: 'Page', uri: a.uri, size: a.fileSize })));
  };

  const [flashNext, flashIcon] = FLASH[flash];
  const isUrl = /^https?:\/\//i.test(qrData);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <View style={s.bar}>
          <Tap icon="close" label="Close camera" onPress={onClose} />
          <Tap icon={flashIcon} label={`Flash ${flash}`} onPress={() => setFlash(flashNext)} />
          <Tap
            icon="qrcode-scan" label={qr ? 'Stop QR scanning' : 'Scan a QR code'} color={qr ? c.accent : '#FFF'}
            onPress={() => { setQr(!qr); setQrData(''); }}
          />
        </View>

        {!perm ? <View style={[s.preview, { width, height: previewH }]} /> : !perm.granted ? (
          <View style={[s.preview, s.center, { width, height: previewH }]}>
            <Text style={s.permText}>PDF Tools needs camera access to scan documents.</Text>
            {perm.canAskAgain
              ? <Button label="Allow camera" onPress={requestPerm} style={{ marginTop: 16 }} />
              : <Button label="Open Settings" onPress={() => Linking.openSettings()} style={{ marginTop: 16 }} />}
          </View>
        ) : (
          <View style={[s.preview, { width, height: previewH }]}>
            <CameraView
              ref={cam} style={StyleSheet.absoluteFill} facing="back" ratio="4:3" flash={flash}
              barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
              onBarcodeScanned={qr && !qrData ? ({ data }) => setQrData(data) : undefined}
            />
            {card && !qr && (
              <View
                pointerEvents="none"
                style={[s.frame, {
                  left: CARD_FRAME.x * width, top: CARD_FRAME.y * previewH, width: CARD_FRAME.w * width, height: CARD_FRAME.h * previewH,
                }]}
              />
            )}
            <View style={s.hint} pointerEvents="none">
              <Text style={s.hintText}>
                {qr ? 'Point at a QR code' : mode === 'id' && front ? 'Now flip the card and line up the BACK' : HINT[mode]}
              </Text>
            </View>
            {!!qrData && (
              <View style={s.qrCard}>
                <Text style={s.qrText} numberOfLines={3} selectable>{qrData}</Text>
                <View style={s.qrBtns}>
                  {isUrl && <Button label="Open" onPress={() => Linking.openURL(qrData)} style={{ flex: 1 }} />}
                  <Button label="Share" variant="secondary" onPress={() => Share.share({ message: qrData })} style={{ flex: 1 }} />
                  <Button label="Scan again" variant="secondary" onPress={() => setQrData('')} style={{ flex: 1 }} />
                </View>
              </View>
            )}
          </View>
        )}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.modes} style={{ flexGrow: 0 }}>
          {MODES.map(([m, label]) => (
            <Pressable key={m} onPress={() => pickMode(m)} hitSlop={8} accessibilityState={{ selected: m === mode }}>
              <Text style={[s.mode, m === mode && { color: c.accent }]}>{label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <View style={s.controls}>
          <Tap icon="image-multiple-outline" label="Import photos" onPress={importPhotos} size={28} />
          <Pressable
            onPress={shoot} disabled={busy || qr || !perm?.granted} accessibilityLabel="Take photo"
            style={({ pressed }) => [s.shutter, (pressed || busy) && { opacity: 0.7 }, qr && { opacity: 0.3 }]}
          >
            {busy ? <ActivityIndicator color="#000" /> : <View style={s.shutterInner} />}
          </Pressable>
          <Pressable onPress={onClose} disabled={!count} accessibilityLabel={`Done, ${count} pages`} style={s.last}>
            {lastUri
              ? <View style={s.lastImgWrap}><Image source={{ uri: lastUri }} style={StyleSheet.absoluteFill} /></View>
              : <View style={s.lastEmpty} />}
            {count > 0 && <Text style={[s.badge, { backgroundColor: c.accent }]}>{count}</Text>}
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

function Tap({ icon, label, onPress, color = '#FFF', size = 26 }: { icon: IconName; label: string; onPress: () => void; color?: string; size?: number }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityLabel={label} style={({ pressed }) => [s.tap, pressed && { opacity: 0.6 }]}>
      <Icon name={icon} size={size} color={color} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  bar: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12 },
  tap: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center' },
  preview: { alignSelf: 'center', backgroundColor: '#111', overflow: 'hidden' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 32 },
  permText: { fontFamily: fonts.med, fontSize: 15, color: '#FFF', textAlign: 'center' },
  frame: { position: 'absolute', borderWidth: 2, borderColor: '#FFF', borderRadius: 12 },
  hint: { position: 'absolute', left: 0, right: 0, bottom: 16, alignItems: 'center' },
  hintText: {
    fontFamily: fonts.med, fontSize: 13, color: '#FFF', backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, overflow: 'hidden',
  },
  qrCard: { position: 'absolute', left: 12, right: 12, bottom: 60, padding: 14, borderRadius: radius.group, backgroundColor: '#FFF' },
  qrText: { fontFamily: fonts.med, fontSize: 14, color: '#111' },
  qrBtns: { flexDirection: 'row', gap: 8, marginTop: 12 },
  modes: { paddingHorizontal: 20, gap: 28, alignItems: 'center', height: 56 },
  mode: { fontFamily: fonts.bold, fontSize: 16, color: '#FFF' },
  controls: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', paddingBottom: 8 },
  shutter: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: '#FFF', alignItems: 'center', justifyContent: 'center' },
  shutterInner: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#FFF' },
  last: { width: 52, height: 64 },
  lastImgWrap: { flex: 1, borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: '#FFF' },
  lastEmpty: { flex: 1, borderRadius: 6, backgroundColor: '#222' },
  badge: {
    position: 'absolute', right: -8, top: -8, minWidth: 22, height: 22, borderRadius: 11, textAlign: 'center', lineHeight: 22,
    fontFamily: fonts.bold, fontSize: 12, color: '#FFF', overflow: 'hidden', paddingHorizontal: 5,
  },
});
