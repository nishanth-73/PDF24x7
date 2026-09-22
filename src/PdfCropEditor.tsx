// Crop & Resize, step 2: a crop frame over the real page with a handle at each corner, starting on the whole page —
// the same gesture as the scanner's crop screen. The rect is stored as fractions of the page as shown, in opts.boxes
// by page index (so it survives a resumed draft), and becomes that page's crop box when the tool runs. Pages you
// never touch keep their full size.
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Image, PanResponder, Pressable, Text, View } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { pageSizes, renderPage, renderThumbnails, type Thumb } from '../modules/pdf-thumbnails';
import type { CropBoxes } from './pdf';
import { CROP_OPTS } from './tools';
import { IconBtn, Icon, Options, PromptModal, plural } from './ui';
import { fonts, makeStyles, radius, typo, useTheme } from './theme';
import type { EditorProps } from './ToolRunner';

type Box = CropBoxes[string];
const MAX_H = 460; // tallest the page may show; the area keeps this height so changing pages never shifts the screen
const FULL: Box = [0, 0, 1, 1];
const MIN = 0.06; // smallest crop, as a fraction of the page, so the corners can't be dragged through each other
const DOT = 30; // touch target for a corner; the drawn dot is smaller
const STRIP_W = 52;
const STRIP_GAP = 8;
// Which edges each corner moves: [left|right, top|bottom], clockwise from the top left.
const CORNERS: [0 | 1, 0 | 1][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

export function PdfCropEditor({ file, value, onChange, onError }: EditorProps) {
  const s = useStyles();
  const { c } = useTheme();
  const [count, setCount] = useState(0);
  const [index, setIndex] = useState(0);
  const [img, setImg] = useState<(Thumb & { index: number }) | null>(null);
  const [thumbs, setThumbs] = useState<Thumb[] | null>(null);
  const [goTo, setGoTo] = useState(false);
  const [areaW, setAreaW] = useState(0);
  const [live, setLive] = useState<Box | null>(null); // the rect mid-drag, kept out of opts until the finger lifts
  const strip = useRef<FlatList<number>>(null);
  const loading = img?.index !== index;
  const boxes: CropBoxes = value.boxes ?? {};
  const stored = boxes[index];
  const cropped = Object.keys(boxes).length;
  const resizing = value.mode === 'resize';

  // A different PDF starts clean; the first one keeps its crops, which may come from a resumed draft.
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
    // Same size as Organize's and Redact's, so each tool reuses the other's cached renders.
    renderThumbnails(file.uri, 200).then((t) => alive && setThumbs(t)).catch(() => {});
    return () => { alive = false; };
  }, [file?.uri]);

  useEffect(() => {
    if (!file || resizing) return;
    let alive = true;
    renderPage(file.uri, index, 1000).then((t) => alive && setImg({ ...t, index })).catch(() => {});
    if (count) strip.current?.scrollToIndex({ index, viewPosition: 0.5, animated: true });
    return () => { alive = false; };
  }, [file?.uri, index, resizing]);
  const go = (i: number) => { setIndex(Math.max(0, Math.min(count - 1, i))); setLive(null); };

  const k = img && areaW ? Math.min(areaW / img.width, MAX_H / img.height) : 0;
  const [dw, dh] = img ? [img.width * k, img.height * k] : [0, 0];
  const rect = live ?? stored ?? FULL; // untouched pages show the frame around the whole page

  const setBox = (page: number, box: Box | null) => onChange((v) => {
    const all: CropBoxes = { ...(v.boxes ?? {}) };
    if (box) all[page] = box;
    else delete all[page];
    return { ...v, boxes: all };
  });
  const applyToAll = () => onChange((v) => {
    const box = (v.boxes ?? {})[index];
    if (!box) return v;
    return { ...v, boxes: Object.fromEntries(Array.from({ length: count }, (_, i) => [i, box])) };
  });

  // The responders are made once and read the current page, size and rect through this ref.
  const m = useRef({ dw, dh, index, stored, setBox, start: FULL });
  Object.assign(m.current, { dw, dh, index, stored, setBox }); // the responders are built once, so they read through this
  const liveRef = useRef<Box | null>(null);
  const handles = useRef(new Map<number, ReturnType<typeof PanResponder.create>>());
  const cornerPan = (k2: number) => {
    const made = handles.current.get(k2);
    if (made) return made;
    const [ax, ay] = CORNERS[k2];
    const next = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false, // the screen doesn't scroll while a corner is being dragged
      onPanResponderGrant: () => { m.current.start = liveRef.current ?? m.current.stored ?? FULL; },
      onPanResponderMove: (_, g) => {
        const [sx, sy, sw, sh] = m.current.start;
        let [x0, y0, x1, y1] = [sx, sy, sx + sw, sy + sh];
        const ddx = g.dx / (m.current.dw || 1);
        const ddy = g.dy / (m.current.dh || 1);
        // Only the dragged edges move; each is stopped short of the opposite one so the rect can never invert.
        if (ax === 0) x0 = clamp(sx + ddx, 0, x1 - MIN); else x1 = clamp(sx + sw + ddx, x0 + MIN, 1);
        if (ay === 0) y0 = clamp(sy + ddy, 0, y1 - MIN); else y1 = clamp(sy + sh + ddy, y0 + MIN, 1);
        const box: Box = [x0, y0, x1 - x0, y1 - y0];
        liveRef.current = box;
        setLive(box);
      },
      onPanResponderRelease: () => {
        const box = liveRef.current;
        liveRef.current = null;
        setLive(null);
        if (box) m.current.setBox(m.current.index, box);
      },
      onPanResponderTerminate: () => { liveRef.current = null; setLive(null); },
    });
    handles.current.set(k2, next);
    return next;
  };

  if (!file) return <Text style={s.hint}>Choose a PDF, then pull the corners in to keep just part of the page.</Text>;

  const [rx, ry, rw, rh] = rect;

  return (
    <>
      <Options defs={CROP_OPTS} value={value} onChange={onChange} />

      {resizing ? (
        <Text style={s.hint}>Every page is scaled to fit the size above, keeping its shape. Nothing is cut off.</Text>
      ) : (
        <>
          <View style={s.area} onLayout={(e) => setAreaW(e.nativeEvent.layout.width - 24)}>
            {img && k ? (
              <View style={[s.page, { width: dw, height: dh }]}>
                <View pointerEvents="none" style={{ width: dw, height: dh }}>
                  <Image source={{ uri: img.uri }} style={{ width: dw, height: dh }} fadeDuration={0} />
                  <Svg width={dw} height={dh} style={{ position: 'absolute', left: 0, top: 0 }}>
                    {/* everything outside the frame dimmed, so what survives the crop is what stays bright */}
                    <Path
                      fillRule="evenodd" fill="#000000" fillOpacity={0.5}
                      d={`M0 0H${dw}V${dh}H0Z M${rx * dw} ${ry * dh}h${rw * dw}v${rh * dh}h${-rw * dw}Z`}
                    />
                    <Rect
                      x={rx * dw} y={ry * dh} width={rw * dw} height={rh * dh}
                      fill="none" stroke="#FFFFFF" strokeWidth={2}
                    />
                  </Svg>
                  {loading && (
                    <View style={s.loading}>
                      <ActivityIndicator color={c.ink} />
                    </View>
                  )}
                </View>
                {!loading && CORNERS.map(([ax, ay], i) => (
                  <View
                    key={i} {...cornerPan(i).panHandlers} accessibilityLabel={`Corner ${i + 1}`}
                    style={[s.handle, {
                      left: (ax ? rx + rw : rx) * dw - DOT / 2,
                      top: (ay ? ry + rh : ry) * dh - DOT / 2,
                    }]}
                  >
                    <View style={s.dot} />
                  </View>
                ))}
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
            {!!stored && (
              <>
                {count > 1 && <Text style={s.link} onPress={applyToAll}>Apply to all</Text>}
                <Text style={[s.link, { marginLeft: 16 }]} onPress={() => setBox(index, null)}>Reset page</Text>
              </>
            )}
          </View>

          {/* Every page, to scroll through and spot the one you need; a dot marks pages that are cropped. */}
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
                      {!!boxes[i] && <View style={s.marked} />}
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
            {cropped
              ? `${plural(cropped, 'page')} cropped. Every page has its own frame — leave one alone to keep it whole.`
              : 'Pull the corners in to keep just part of the page. Every page has its own frame.'}
          </Text>
        </>
      )}
    </>
  );
}

const useStyles = makeStyles((c) => ({
  area: { height: MAX_H + 24, padding: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.sunken, borderRadius: radius.group },
  page: { backgroundColor: c.page }, // not clipped: the corner handles hang over the edges
  handle: { position: 'absolute', width: DOT, height: DOT, alignItems: 'center', justifyContent: 'center' },
  dot: {
    width: 15, height: 15, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 2.5, borderColor: c.accent,
    elevation: 3, shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
  },
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
