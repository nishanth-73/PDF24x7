// Fill & Sign, step 2: put typed lines and pictures (a signature photo, a stamp) straight onto the page, drag them
// where they belong, then the tool burns them in. Items are fractions of the page as shown, kept in opts.items so a
// resumed draft keeps them. Works on any PDF — a real form, or a scan of one.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { pageSizes, renderPage, renderThumbnails, type Thumb } from '../modules/pdf-thumbnails';
import { INK, winAnsi, type SignItem } from './pdf';
import { Button, IconBtn, Icon, PromptModal, plural } from './ui';
import { fonts, makeStyles, radius, typo, useTheme } from './theme';
import type { EditorProps } from './ToolRunner';

const MAX_H = 460; // tallest the page may show; the area keeps this height so changing pages never shifts the screen
const STRIP_W = 52;
const STRIP_GAP = 8;
const TEXT_SIZE = 0.028; // a new line's height, as a fraction of the page
const IMG_W = 0.34; // a new picture's width, as a fraction of the page
const clamp = (v: number) => Math.max(0, Math.min(1, v));
// Pen colours, the usual ones for filling forms in; ink first.
const COLORS: [hex: string, name: string][] = [[INK, 'Black'], ['#1D4ED8', 'Blue'], ['#DC2626', 'Red'], ['#15803D', 'Green'], ['#6B7280', 'Grey']];
const OPACITY = [1, 0.75, 0.5, 0.25];

export function FillSignEditor({ file, value, onChange, onError }: EditorProps) {
  const s = useStyles();
  const { c } = useTheme();
  const [count, setCount] = useState(0);
  const [index, setIndex] = useState(0);
  const [img, setImg] = useState<(Thumb & { index: number }) | null>(null);
  const [thumbs, setThumbs] = useState<Thumb[] | null>(null);
  const [goTo, setGoTo] = useState(false);
  const [typing, setTyping] = useState<number | null>(null); // index of the item being typed, -1 for a new one
  const [areaW, setAreaW] = useState(0);
  const [sel, setSel] = useState(-1);
  const strip = useRef<FlatList<number>>(null);
  const loading = img?.index !== index;
  const items: SignItem[] = value.items ?? [];
  const onPage = items.map((it, i) => [it, i] as const).filter(([it]) => it.page === index);

  // A different PDF starts clean; the first one keeps its items, which may come from a resumed draft.
  const shownUri = useRef(file?.uri);
  useEffect(() => {
    if (!file) return;
    if (file.uri !== shownUri.current) onChange((v) => ({ ...v, items: [] }));
    shownUri.current = file.uri;
    setIndex(0);
    setSel(-1);
    setImg(null);
    setThumbs(null);
    let alive = true;
    pageSizes(file.uri).then((p) => alive && setCount(p.length)).catch(() => onError('Could not read this PDF.'));
    renderThumbnails(file.uri, 200).then((t) => alive && setThumbs(t)).catch(() => {});
    return () => { alive = false; };
  }, [file?.uri]);

  useEffect(() => {
    if (!file) return;
    let alive = true;
    renderPage(file.uri, index, 1000).then((t) => alive && setImg({ ...t, index })).catch(() => {});
    if (count) strip.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    return () => { alive = false; };
  }, [file?.uri, index]);
  const go = (i: number) => { setIndex(Math.max(0, Math.min(count - 1, i))); setSel(-1); };

  const k = img && areaW ? Math.min(areaW / img.width, MAX_H / img.height) : 0;
  const [dw, dh] = img ? [img.width * k, img.height * k] : [0, 0];

  const edit = (i: number, patch: Partial<SignItem>) =>
    onChange((v) => ({ ...v, items: (v.items ?? []).map((x: SignItem, j: number) => (j === i ? { ...x, ...patch } : x)) }));
  const add = (it: SignItem) => onChange((v) => {
    const next = [...(v.items ?? []), it];
    setSel(next.length - 1);
    return { ...v, items: next };
  });
  const drop = (i: number) => {
    setSel(-1);
    onChange((v) => ({ ...v, items: (v.items ?? []).filter((_: SignItem, j: number) => j !== i) }));
  };
  const scale = (i: number, by: number) => {
    const it = items[i];
    if (!it) return;
    if (it.kind === 'text') edit(i, { size: Math.max(0.008, Math.min(0.3, it.size * by)) } as Partial<SignItem>);
    else edit(i, { w: Math.max(0.04, Math.min(1, it.w * by)), h: Math.max(0.02, Math.min(1, it.h * by)) } as Partial<SignItem>);
  };

  // Turns the selected item clockwise, kept within -180..180 so the label reads naturally.
  const turn = (by: number) => {
    const it = items[sel];
    if (!it) return;
    const a = ((((it.angle ?? 0) + by) % 360) + 540) % 360 - 180;
    edit(sel, { angle: a === -180 ? 180 : a });
  };

  const pickImage = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 1 });
    if (r.canceled || !r.assets[0]) return;
    const a = r.assets[0];
    if (a.mimeType && !/^image\/(png|jpe?g)$/i.test(a.mimeType)) {
      onError('Pick a JPEG or PNG picture. HEIC, WebP and other formats can’t go into a PDF here.');
      return;
    }
    // Keep the picture's shape: its width is a share of the page, its height follows from the aspect on screen.
    const aspect = (a.height || 1) / (a.width || 1);
    const h = dw && dh ? (IMG_W * dw * aspect) / dh : IMG_W * aspect;
    add({ page: index, kind: 'image', x: 0.1, y: 0.1, w: IMG_W, h, uri: a.uri });
  };

  // The item being dragged, kept out of opts until the finger lifts. Writing every frame put the whole tool draft
  // through JSON.stringify and a blocking disk write ~60 times a second, which froze the screen mid-drag.
  const [drag, setDrag] = useState<{ i: number; x: number; y: number } | null>(null);
  const live = useRef<{ i: number; x: number; y: number } | null>(null);
  const m = useRef({ dw, dh, items, edit, start: { x: 0, y: 0 } });
  Object.assign(m.current, { dw, dh, items, edit });

  // One responder per item index, made once and reused: rebuilding them each render allocated a fresh set of
  // responders on every frame of a drag.
  const responders = useRef(new Map<number, ReturnType<typeof PanResponder.create>>());
  const dragFor = (i: number) => {
    const made = responders.current.get(i);
    if (made) return made;
    const next = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 2 || Math.abs(g.dy) > 2,
      onPanResponderTerminationRequest: () => false, // the screen doesn't scroll while an item is being dragged
      onPanResponderGrant: () => {
        setSel(i);
        const it = m.current.items[i];
        if (it) m.current.start = { x: it.x, y: it.y };
      },
      onPanResponderMove: (_, g) => {
        // Kept on the page: a picture wholly, a line of text (whose width isn't known here) by its start and height.
        const it = m.current.items[i];
        const [w, h] = it?.kind === 'image' ? [it.w, it.h] : [0.05, it?.size ?? 0];
        const at = {
          i,
          x: Math.min(clamp(m.current.start.x + g.dx / (m.current.dw || 1)), Math.max(0, 1 - w)),
          y: Math.min(clamp(m.current.start.y + g.dy / (m.current.dh || 1)), Math.max(0, 1 - h)),
        };
        live.current = at;
        setDrag(at);
      },
      onPanResponderRelease: () => {
        const at = live.current;
        live.current = null;
        setDrag(null);
        if (at) m.current.edit(at.i, { x: at.x, y: at.y } as Partial<SignItem>);
      },
      onPanResponderTerminate: () => { live.current = null; setDrag(null); },
    });
    responders.current.set(i, next);
    return next;
  };

  if (!file) return <Text style={s.hint}>Choose a PDF, then type on it and drop your signature where it belongs.</Text>;

  const selected = sel >= 0 ? items[sel] : undefined;

  return (
    <>
      <View style={s.area} onLayout={(e) => setAreaW(e.nativeEvent.layout.width - 24)}>
        {img && k ? (
          <Pressable style={[s.page, { width: dw, height: dh }]} onPress={() => setSel(-1)}>
            <Image source={{ uri: img.uri }} style={{ width: dw, height: dh }} fadeDuration={0} />
            {onPage.map(([it, i]) => (
              <View
                key={i} {...dragFor(i).panHandlers}
                style={[
                  s.item,
                  // mid-drag the position comes from local state, so the page follows the finger without touching opts
                  { left: (drag?.i === i ? drag.x : it.x) * dw, top: (drag?.i === i ? drag.y : it.y) * dh },
                  { transform: [{ rotate: `${it.angle ?? 0}deg` }] }, // about its centre, like the PDF
                  sel === i && { borderColor: c.accent, backgroundColor: c.accentSoft },
                ]}
              >
                {/* Opacity on the content only, so a faded item's selection frame stays easy to see. */}
                <View style={{ opacity: it.opacity ?? 1 }}>
                  {it.kind === 'text' ? (
                    // Android's sans-serif (Roboto) is the closest system font to the Helvetica the PDF gets.
                    <Text style={{ fontFamily: 'sans-serif', fontSize: it.size * dh, lineHeight: it.size * dh * 1.16, color: it.color ?? INK }}>
                      {it.text}
                    </Text>
                  ) : (
                    <Image source={{ uri: it.uri }} style={{ width: it.w * dw, height: it.h * dh }} resizeMode="contain" />
                  )}
                </View>
              </View>
            ))}
            {loading && (
              <View style={s.loading}>
                <ActivityIndicator color={c.ink} />
              </View>
            )}
          </Pressable>
        ) : (
          <ActivityIndicator color={c.ink} />
        )}
      </View>

      <View style={s.bar}>
        <IconBtn name="chevron-left" color={index > 0 ? c.ink : c.faint} onPress={() => go(index - 1)} />
        <Pressable onPress={() => count > 1 && setGoTo(true)} hitSlop={6} style={({ pressed }) => [s.pageBtn, pressed && { backgroundColor: c.sunken }]}>
          <Text style={s.pageNum}>Page {index + 1}{count ? ` of ${count}` : ''}</Text>
          {count > 1 && <Icon name="menu-down" size={18} color={c.sub} />}
        </Pressable>
        <IconBtn name="chevron-right" color={index < count - 1 ? c.ink : c.faint} onPress={() => go(index + 1)} />
        <View style={{ flex: 1 }} />
        {!!selected && (
          <>
            {selected.kind === 'text' && <IconBtn name="pencil-outline" onPress={() => setTyping(sel)} />}
            <IconBtn name="format-font-size-decrease" onPress={() => scale(sel, 1 / 1.18)} />
            <IconBtn name="format-font-size-increase" onPress={() => scale(sel, 1.18)} />
            <IconBtn name="delete-outline" color={c.accent} onPress={() => drop(sel)} />
          </>
        )}
      </View>

      {!!selected && (
        <View style={s.panel}>
          {selected.kind === 'text' && (
            <View style={s.panelRow}>
              <Text style={s.panelLabel}>Colour</Text>
              <View style={s.swatches}>
                {COLORS.map(([hex, name]) => {
                  const on = (selected.color ?? INK) === hex;
                  return (
                    <Pressable
                      key={hex} onPress={() => edit(sel, { color: hex } as Partial<SignItem>)} hitSlop={4}
                      accessibilityRole="radio" accessibilityLabel={name} accessibilityState={{ selected: on }}
                      style={[s.swatchRing, on && { borderColor: c.accent }]}
                    >
                      <View style={[s.swatch, { backgroundColor: hex }]} />
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}
          <View style={s.panelRow}>
            <Text style={s.panelLabel}>Opacity</Text>
            <View style={s.segTrack}>
              {OPACITY.map((v) => {
                const on = Math.abs((selected.opacity ?? 1) - v) < 0.01;
                return (
                  <Pressable key={v} onPress={() => edit(sel, { opacity: v })} style={[s.segItem, on && s.segOn]} accessibilityState={{ selected: on }}>
                    <Text style={[s.segText, on && { color: c.ink }]}>{Math.round(v * 100)}%</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
          <View style={s.panelRow}>
            <Text style={s.panelLabel}>Rotate</Text>
            <View style={s.rotateRow}>
              <IconBtn name="rotate-left" onPress={() => turn(-15)} />
              <Pressable onPress={() => edit(sel, { angle: 0 })} hitSlop={6} accessibilityLabel="Straighten">
                <Text style={s.angle}>{selected.angle ?? 0}°</Text>
              </Pressable>
              <IconBtn name="rotate-right" onPress={() => turn(15)} />
              <Pressable onPress={() => turn(90)} style={({ pressed }) => [s.quarter, pressed && { backgroundColor: c.sunken }]}>
                <Text style={s.quarterText}>+90°</Text>
              </Pressable>
            </View>
          </View>
        </View>
      )}

      <View style={s.addRow}>
        <Button icon="format-text" label="Add text" variant="secondary" onPress={() => setTyping(-1)} style={{ flex: 1 }} />
        <Button icon="draw-pen" label="Add picture" variant="secondary" onPress={pickImage} style={{ flex: 1 }} />
      </View>

      {count > 1 && (
        <FlatList
          ref={strip} data={Array.from({ length: count }, (_, i) => i)} keyExtractor={String} horizontal
          showsHorizontalScrollIndicator={false} contentContainerStyle={s.strip} initialNumToRender={10} windowSize={7}
          getItemLayout={(_, i) => ({ length: STRIP_W + STRIP_GAP, offset: (STRIP_W + STRIP_GAP) * i, index: i })}
          onScrollToIndexFailed={() => {}}
          renderItem={({ item: i }) => {
            const t = thumbs?.[i];
            const on = i === index;
            return (
              <Pressable onPress={() => go(i)} style={s.thumbCell} accessibilityLabel={`Page ${i + 1}`}>
                <View style={[s.thumb, on && { borderColor: c.accent, borderWidth: 2 }]}>
                  {t ? <Image source={{ uri: t.uri }} style={s.thumbImg} resizeMode="contain" fadeDuration={0} /> : null}
                  {items.some((x) => x.page === i) && <View style={s.marked} />}
                </View>
                <Text style={[s.thumbNum, on && { color: c.accent }]}>{i + 1}</Text>
              </Pressable>
            );
          }}
        />
      )}

      <PromptModal
        visible={typing !== null} title={typing === -1 ? 'Add text' : 'Edit text'} placeholder="Type what goes on the page"
        initialValue={typing !== null && typing >= 0 && items[typing]?.kind === 'text' ? (items[typing] as { text: string }).text : ''}
        submitLabel={typing === -1 ? 'Add' : 'Save'} onClose={() => setTyping(null)}
        onSubmit={(typed) => {
          setTyping(null);
          // The page gets Helvetica, which only writes Latin text: store what it can write, and say what it can't.
          const t = winAnsi(typed).trim();
          if (!t) return onError('Text on the page can only use Latin letters, numbers and common symbols.');
          if (/[^\x20-\x7E\xA0-\xFF‘’“”–—₹]/.test(typed)) onError('Some characters can’t be written on a PDF page and were left out.');
          if (typing === -1) add({ page: index, kind: 'text', x: 0.1, y: 0.1, size: TEXT_SIZE, text: t });
          else if (typing !== null) edit(typing, { text: t } as Partial<SignItem>);
        }}
      />

      <PromptModal
        visible={goTo} title="Go to page" subtitle={`1 to ${count}`} placeholder="Page number" initialValue={String(index + 1)}
        keyboardType="number-pad" submitLabel="Go" onClose={() => setGoTo(false)}
        onSubmit={(v) => { const n = parseInt(v, 10); if (n) go(n - 1); }}
      />

      <Text style={s.hint}>
        {items.length
          ? `${plural(items.length, 'item')} added. Drag anything to move it; tap it to resize, recolour, fade or turn it.`
          : 'Add a line of text or a picture of your signature, then drag it where it belongs.'}
      </Text>
    </>
  );
}

const useStyles = makeStyles((c) => ({
  area: { height: MAX_H + 24, padding: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.sunken, borderRadius: radius.group },
  page: { overflow: 'hidden', backgroundColor: c.page },
  item: { position: 'absolute', borderWidth: 1, borderColor: 'transparent', borderRadius: 2 },
  loading: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: c.page, opacity: 0.6 },
  bar: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  pageBtn: { flexDirection: 'row', alignItems: 'center', paddingLeft: 6, paddingRight: 2, paddingVertical: 4, borderRadius: 8 },
  pageNum: { fontFamily: fonts.med, fontSize: 14, color: c.ink },
  addRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  panel: {
    marginTop: 8, paddingHorizontal: 12, paddingVertical: 4, borderRadius: radius.group, backgroundColor: c.surface,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong,
  },
  panelRow: { flexDirection: 'row', alignItems: 'center', minHeight: 48 },
  panelLabel: { width: 72, fontFamily: fonts.med, fontSize: 13.5, color: c.sub },
  swatches: { flex: 1, flexDirection: 'row', gap: 10 },
  swatchRing: { width: 34, height: 34, borderRadius: 17, borderWidth: 2, borderColor: 'transparent', alignItems: 'center', justifyContent: 'center' },
  swatch: { width: 24, height: 24, borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong },
  segTrack: { flex: 1, flexDirection: 'row', padding: 3, borderRadius: radius.control, backgroundColor: c.sunken },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: radius.control - 3 },
  segOn: { backgroundColor: c.bg, borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong },
  segText: { fontFamily: fonts.med, fontSize: 13, color: c.sub },
  rotateRow: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  angle: { minWidth: 48, textAlign: 'center', ...typo.num, fontSize: 14, color: c.ink },
  quarter: { marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: c.lineStrong },
  quarterText: { fontFamily: fonts.med, fontSize: 13, color: c.ink },
  strip: { gap: STRIP_GAP, paddingVertical: 8, paddingHorizontal: 2 },
  thumbCell: { width: STRIP_W, alignItems: 'center' },
  thumb: {
    width: STRIP_W, height: 70, borderRadius: 6, overflow: 'hidden', backgroundColor: c.page,
    borderWidth: 1, borderColor: c.lineStrong, alignItems: 'center', justifyContent: 'center',
  },
  thumbImg: { width: '100%', height: '100%' },
  marked: { position: 'absolute', right: 4, top: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent },
  thumbNum: { ...typo.num, fontSize: 11, color: c.sub, marginTop: 3 },
  hint: { ...typo.small, color: c.sub, marginTop: 10 },
}));
