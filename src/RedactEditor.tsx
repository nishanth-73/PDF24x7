// Redact PDF, step 2: drag boxes over what must go, one page at a time. Boxes are fractions of the page as shown, kept in
// opts.boxes by page index (so they survive in a resumed draft) and burned in natively when the tool runs.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, PanResponder, Pressable, Text, View } from 'react-native';
import Svg, { Rect } from 'react-native-svg';
import { pageSizes, renderPage, renderThumbnails, type RedactBoxes, type Thumb } from '../modules/pdf-thumbnails';
import { IconBtn, Icon, PromptModal, plural } from './ui';
import { fonts, makeStyles, radius, typo, useTheme } from './theme';
import type { EditorProps } from './ToolRunner';

type Box = RedactBoxes[string][number];
const MAX_H = 460; // tallest the page may show; the area keeps this height so changing pages never shifts the screen
const TAP = 0.012; // a drag smaller than this (fraction of the page) is a tap: it removes the box under the finger
const STRIP_W = 52; // page strip thumbnail width
const STRIP_GAP = 8;

export function RedactEditor({ file, value, onChange, onError }: EditorProps) {
  const s = useStyles();
  const { c } = useTheme();
  const [count, setCount] = useState(0);
  const [index, setIndex] = useState(0);
  const [img, setImg] = useState<(Thumb & { index: number }) | null>(null);
  const [thumbs, setThumbs] = useState<Thumb[] | null>(null);
  const [goTo, setGoTo] = useState(false);
  const [areaW, setAreaW] = useState(0);
  const [live, setLive] = useState<Box | null>(null);
  const strip = useRef<FlatList<number>>(null);
  const loading = img?.index !== index; // the previous page stays up (not drawable) until this one is ready
  const boxes: RedactBoxes = value.boxes ?? {};
  const onPage = boxes[index] ?? [];
  const total = Object.values(boxes).reduce((n, b) => n + b.length, 0);

  // A different PDF starts clean; the first one keeps its boxes, which may come from a resumed draft.
  const shownUri = useRef(file?.uri);
  useEffect(() => {
    if (!file) return;
    if (file.uri !== shownUri.current) onChange((v) => ({ ...v, boxes: {} }));
    shownUri.current = file.uri;
    setIndex(0);
    setImg(null);
    setThumbs(null);
    let alive = true;
    pageSizes(file.uri).then((p) => alive && setCount(p.length)).catch(() => onError('Could not read this PDF.'));
    // Same size as Organize's, so each tool reuses the other's cached renders.
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
  const go = (i: number) => setIndex(Math.max(0, Math.min(count - 1, i)));

  const k = img && areaW ? Math.min(areaW / img.width, MAX_H / img.height) : 0;
  const [dw, dh] = img ? [img.width * k, img.height * k] : [0, 0];

  const edit = (page: number, fn: (b: Box[]) => Box[]) => onChange((v) => {
    const all: RedactBoxes = { ...(v.boxes ?? {}) };
    const next = fn(all[page] ?? []);
    if (next.length) all[page] = next;
    else delete all[page];
    return { ...v, boxes: all };
  });

  // The responder is created once, so it reads the current page and size through this ref.
  const m = useRef({ dw, dh, index, edit, loading, start: [0, 0] });
  Object.assign(m.current, { dw, dh, index, edit, loading });
  const at = (e: { nativeEvent: { locationX: number; locationY: number } }) => [
    Math.max(0, Math.min(1, e.nativeEvent.locationX / m.current.dw)),
    Math.max(0, Math.min(1, e.nativeEvent.locationY / m.current.dh)),
  ];
  const boxFrom = ([x1, y1]: number[], [x2, y2]: number[]): Box => [Math.min(x1, x2), Math.min(y1, y2), Math.abs(x2 - x1), Math.abs(y2 - y1)];
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => !m.current.loading, // no drawing on the previous page while the next one loads
    onPanResponderTerminationRequest: () => false, // the screen doesn't scroll while a box is being drawn
    onPanResponderGrant: (e) => { m.current.start = at(e); setLive(null); },
    onPanResponderMove: (e) => setLive(boxFrom(m.current.start, at(e))),
    onPanResponderRelease: (e) => {
      const r = m.current;
      const b = boxFrom(r.start, at(e));
      setLive(null);
      if (b[2] > TAP || b[3] > TAP) {
        r.edit(r.index, (list) => [...list, b]);
        return;
      }
      const [x, y] = r.start; // a tap: remove the topmost box under it
      r.edit(r.index, (list) => {
        const hit = list.map((q, i) => (x >= q[0] && x <= q[0] + q[2] && y >= q[1] && y <= q[1] + q[3] ? i : -1)).filter((i) => i >= 0).pop();
        return hit === undefined ? list : list.filter((_, i) => i !== hit);
      });
    },
    onPanResponderTerminate: () => setLive(null),
  })).current;

  if (!file) return <Text style={s.hint}>Choose a PDF, then drag across anything you want blacked out.</Text>;

  const rect = ([x, y, w, h]: Box, i: number, isLive = false) => (
    <Rect
      key={isLive ? 'live' : i} x={x * dw} y={y * dh} width={w * dw} height={h * dh}
      fill="#000000" fillOpacity={isLive ? 0.45 : 1} stroke={isLive ? c.accent : 'none'} strokeWidth={1.5}
    />
  );

  return (
    <>
      <View style={s.area} onLayout={(e) => setAreaW(e.nativeEvent.layout.width - 24)}>
        {img && k ? (
          <View style={[s.page, { width: dw, height: dh }]} {...pan.panHandlers}>
            <View pointerEvents="none" style={{ width: dw, height: dh }}>
              <Image source={{ uri: img.uri }} style={{ width: dw, height: dh }} fadeDuration={0} />
              <Svg width={dw} height={dh} style={{ position: 'absolute', left: 0, top: 0 }}>
                {(boxes[img.index] ?? []).map((b, i) => rect(b, i))}
                {live && rect(live, 0, true)}
              </Svg>
              {loading && (
                <View style={s.loading}>
                  <ActivityIndicator color={c.ink} />
                </View>
              )}
            </View>
          </View>
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
        {onPage.length > 0 && (
          <>
            <Text style={s.link} onPress={() => edit(index, (list) => list.slice(0, -1))}>Undo</Text>
            <Text style={[s.link, { marginLeft: 16 }]} onPress={() => edit(index, () => [])}>Clear page</Text>
          </>
        )}
      </View>

      {/* Every page, to scroll through and spot the one you need; a dot marks pages that already have boxes. */}
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
                  {!!boxes[i]?.length && <View style={s.marked} />}
                </View>
                <Text style={[s.thumbNum, on && { color: c.accent }]}>{i + 1}</Text>
              </Pressable>
            );
          }}
        />
      )}

      <PromptModal
        visible={goTo} title="Go to page" subtitle={`1 to ${count}`} placeholder="Page number" initialValue={String(index + 1)}
        keyboardType="number-pad" submitLabel="Go" onClose={() => setGoTo(false)}
        onSubmit={(v) => { const n = parseInt(v, 10); if (n) go(n - 1); }}
      />

      <Text style={s.hint}>
        {total
          ? `${plural(total, 'area')} on ${plural(Object.keys(boxes).length, 'page')} will be blacked out. Tap a box to remove it. `
          : 'Drag across anything you want blacked out. '}
        Pages you mark become images, so nothing under a box can be copied, searched or uncovered.
      </Text>
    </>
  );
}

const useStyles = makeStyles((c) => ({
  area: { height: MAX_H + 24, padding: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.sunken, borderRadius: radius.group },
  page: { overflow: 'hidden', backgroundColor: c.page },
  loading: { position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', backgroundColor: c.page, opacity: 0.6 },
  bar: { flexDirection: 'row', alignItems: 'center', marginTop: 8 },
  pageBtn: { flexDirection: 'row', alignItems: 'center', paddingLeft: 6, paddingRight: 2, paddingVertical: 4, borderRadius: 8 },
  pageNum: { fontFamily: fonts.med, fontSize: 14, color: c.ink },
  strip: { gap: STRIP_GAP, paddingVertical: 8, paddingHorizontal: 2 },
  thumbCell: { width: STRIP_W, alignItems: 'center' },
  thumb: {
    width: STRIP_W, height: 70, borderRadius: 6, overflow: 'hidden', backgroundColor: c.page,
    borderWidth: 1, borderColor: c.lineStrong, alignItems: 'center', justifyContent: 'center',
  },
  thumbImg: { width: '100%', height: '100%' },
  marked: { position: 'absolute', right: 4, top: 4, width: 8, height: 8, borderRadius: 4, backgroundColor: c.accent },
  thumbNum: { ...typo.num, fontSize: 11, color: c.sub, marginTop: 3 },
  link: { fontFamily: fonts.med, fontSize: 13.5, color: c.accent },
  hint: { ...typo.small, color: c.sub },
}));
