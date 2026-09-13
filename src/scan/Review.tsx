// Adobe Scan's review screen: swipe through pages, a thumbnail strip with long-press multi-select, and the edit
// toolbar (Add, Retake, Crop, Rotate, Filters, Adjust, Cleanup, Markup, Resize, Reorder, Delete) before Save PDF.
import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import {
  ActivityIndicator, FlatList, Image, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { processImage, type Filter } from '../../modules/doc-scanner';
import { layoutScanPage } from '../pdf';
import { ConfirmModal, Icon, PromptModal, Reorderable } from '../ui';
import { fonts, radius, scanUi as u } from '../theme';
import type { IconName } from '../tools';
import { FILTERS, SIZES, defaultEdits, deleteFile, isRendered, type Page, type ScanDoc, type Shot } from './model';
import { CropEditor } from './CropEditor';
import { DrawEditor } from './DrawEditor';

type Sheet = '' | 'filters' | 'adjust' | 'resize';
type Props = {
  doc: ScanDoc; setDoc: Dispatch<SetStateAction<ScanDoc>>;
  onAddMore: () => void; onRetake: (p: Page) => void; onClose: () => void; onSave: () => Promise<void>;
};

export function Review({ doc, setDoc, onAddMore, onRetake, onClose, onSave }: Props) {
  const win = useWindowDimensions();
  const pager = useRef<FlatList<Page>>(null);
  const [index, setIndex] = useState(0);
  const [pagerH, setPagerH] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [sheet, setSheet] = useState<Sheet>('');
  const [modal, setModal] = useState<'' | 'crop' | 'cleanup' | 'markup' | 'reorder' | 'delete' | 'rename' | 'reset'>('');
  const [saving, setSaving] = useState(false);
  const [filterAll, setFilterAll] = useState(false); // Filters: every pick goes to all pages

  const pages = doc.pages;
  const current = pages[Math.min(index, pages.length - 1)];
  const selecting = selected.length > 0;
  const targets = selecting ? selected : current ? [current.id] : [];
  const rendered = isRendered(doc);

  useEffect(() => { // keep the index valid after deletes
    if (index >= pages.length && pages.length) setIndex(pages.length - 1);
  }, [pages.length]);

  const editShots = (ids: string[], fn: (s: Shot, p: Page) => Partial<Shot>) =>
    setDoc((d) => ({
      ...d,
      pages: d.pages.map((p) => (!ids.includes(p.id) ? p : {
        ...p,
        shots: p.shots.map((s) => {
          const patch = fn(s, p);
          return Object.keys(patch).length ? { ...s, ...patch, rev: s.rev + 1 } : s; // unchanged shots keep their render
        }),
      })),
    }));
  const editPages = (ids: string[], patch: Partial<Page>) =>
    setDoc((d) => ({ ...d, pages: d.pages.map((p) => (ids.includes(p.id) ? { ...p, ...patch } : p)) }));

  const goTo = (i: number) => {
    setIndex(i);
    pager.current?.scrollToIndex({ index: i, animated: true });
  };
  const toggleSelect = (id: string) => setSelected((sel) => (sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]));

  const removePages = () => {
    const gone = pages.filter((p) => targets.includes(p.id)); // photos stay on disk until saved or discarded, so Discard can bring them back
    setDoc((d) => ({ ...d, pages: d.pages.filter((p) => !targets.includes(p.id)) }));
    setSelected([]);
    if (gone.length === pages.length) onAddMore(); // nothing left: back to the camera, like Adobe
  };

  const save = async () => {
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
  };

  const tools: [IconName, string, () => void, boolean?][] = [
    ['plus-box-multiple-outline', 'Add', onAddMore, selecting],
    ['camera-retake-outline', 'Retake', () => current && onRetake(current), selecting],
    ['crop', 'Crop', () => setModal('crop'), selecting],
    // ponytail: rotating clears that page's cleanup/markup strokes; transform the strokes instead if people mind.
    ['rotate-right', 'Rotate', () => editShots(targets, (s) => ({ rotation: (s.rotation + 90) % 360, strokes: [] }))],
    ['image-filter-black-white', 'Filters', () => setSheet(sheet === 'filters' ? '' : 'filters')],
    ['tune-variant', 'Adjust', () => setSheet(sheet === 'adjust' ? '' : 'adjust')],
    ['eraser', 'Cleanup', () => setModal('cleanup'), selecting],
    ['draw', 'Markup', () => setModal('markup'), selecting],
    ['resize', 'Resize', () => setSheet(sheet === 'resize' ? '' : 'resize')],
    ['swap-horizontal', 'Reorder', () => setModal('reorder'), pages.length < 2],
    ['restore', 'Reset', () => setModal('reset')],
    ['delete-outline', 'Delete', () => setModal('delete')],
  ];

  if (!current) return <View style={s.root} />;

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      <View style={s.bar}>
        {selecting ? (
          <>
            <IconTap icon="close" label="Cancel selection" onPress={() => setSelected([])} />
            <Text style={s.title}>{selected.length} selected</Text>
            <Pressable onPress={() => setSelected(pages.map((p) => p.id))} hitSlop={8} style={s.textBtn}>
              <Text style={s.textBtnLabel}>Select all</Text>
            </Pressable>
          </>
        ) : (
          <>
            <IconTap icon="arrow-left" label="Back" onPress={onClose} />
            <Pressable onPress={() => setModal('rename')} style={s.titleBtn} accessibilityLabel="Rename">
              <Text style={s.title} numberOfLines={1}>{doc.name}</Text>
              <Icon name="pencil-outline" size={15} color={u.dim} />
            </Pressable>
            <Pressable onPress={save} disabled={!rendered || saving} style={[s.saveBtn, (!rendered || saving) && { opacity: 0.5 }]}>
              {saving || !rendered ? <ActivityIndicator size="small" color="#FFF" /> : <Icon name="file-pdf-box" size={18} color="#FFF" />}
              <Text style={s.saveText}>{doc.pdf ? 'Update PDF' : 'Save PDF'}</Text>
            </Pressable>
          </>
        )}
      </View>

      <View style={{ flex: 1 }} onLayout={(e) => setPagerH(e.nativeEvent.layout.height)}>
        {pagerH > 0 && (
          <FlatList
            ref={pager} data={pages} horizontal pagingEnabled showsHorizontalScrollIndicator={false} keyExtractor={(p) => p.id}
            getItemLayout={(_, i) => ({ length: win.width, offset: win.width * i, index: i })}
            onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / win.width))}
            renderItem={({ item }) => (
              <View style={{ width: win.width, height: pagerH, alignItems: 'center', justifyContent: 'center' }}>
                <PagePreview page={item} maxW={win.width - 40} maxH={pagerH - 40} />
              </View>
            )}
          />
        )}
        <Text style={s.pageNo}>{index + 1} / {pages.length}</Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={s.strip}>
        {pages.map((p, i) => {
          const on = selected.includes(p.id);
          return (
            <Pressable
              key={p.id} onPress={() => (selecting ? toggleSelect(p.id) : goTo(i))} onLongPress={() => toggleSelect(p.id)}
              style={[s.thumb, (selecting ? on : i === index) && s.thumbOn]}
            >
              <PagePreview page={p} maxW={48} maxH={62} flat />
              {selecting && (
                <View style={[s.check, on && { backgroundColor: u.blue, borderColor: u.blue }]}>
                  {on && <Icon name="check" size={13} color="#FFF" />}
                </View>
              )}
            </Pressable>
          );
        })}
        {!selecting && (
          <Pressable onPress={onAddMore} style={[s.thumb, s.addThumb]} accessibilityLabel="Add pages">
            <Icon name="plus" size={24} color={u.blue} />
          </Pressable>
        )}
      </ScrollView>

      {sheet === 'filters' && (
        <FiltersSheet
          shot={current.shots[0]} value={current.shots[0].filter} all={filterAll}
          onPick={(f) => editShots(filterAll ? pages.map((p) => p.id) : targets, () => ({ filter: f }))}
          onToggleAll={() => {
            if (!filterAll) editShots(pages.map((p) => p.id), () => ({ filter: current.shots[0].filter }));
            setFilterAll(!filterAll);
          }}
        />
      )}
      {sheet === 'adjust' && (
        <AdjustSheet
          key={current.id} shot={current.shots[0]}
          onCommit={(patch) => editShots(targets, () => patch)}
          onApplyAll={() => editShots(pages.map((p) => p.id), () => ({ brightness: current.shots[0].brightness, contrast: current.shots[0].contrast }))}
        />
      )}
      {sheet === 'resize' && (
        <View style={s.sheet}>
          <View style={s.sheetHead}>
            <Text style={s.sheetTitle}>Page size</Text>
            <ApplyAll key={current.size} onPress={() => editPages(pages.map((p) => p.id), { size: current.size })} />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.sheetRow}>
            {SIZES.map(([size, label]) => (
              <Pressable key={size} onPress={() => editPages(targets, { size })} style={[s.chip, current.size === size && s.chipOn]}>
                <Text style={[s.chipText, current.size === size && { color: '#FFF' }]}>{label}</Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.toolbar} contentContainerStyle={s.toolbarRow}>
        {tools.map(([icon, label, press, disabled]) => {
          const active = label.toLowerCase() === sheet;
          return (
            <Pressable key={label} onPress={press} disabled={disabled} style={[s.tool, disabled && { opacity: 0.3 }]}>
              <Icon name={icon} size={24} color={active ? u.blue : u.text} />
              <Text style={[s.toolText, active && { color: u.blue }]}>{label}</Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {modal === 'crop' && (
        <CropEditor
          page={current} onCancel={() => setModal('')}
          onDone={(corners) => {
            editShots([current.id], (sh, p) => {
              const next = corners[p.shots.indexOf(sh)];
              return next === sh.corners ? {} : { corners: next, strokes: [] };
            });
            setModal('');
          }}
        />
      )}
      {(modal === 'cleanup' || modal === 'markup') && (
        <DrawEditor
          page={current} mode={modal} onCancel={() => setModal('')}
          onDone={(strokes) => {
            editShots([current.id], (sh, p) => ({ strokes: strokes[p.shots.indexOf(sh)] }));
            setModal('');
          }}
        />
      )}
      <Modal visible={modal === 'reorder'} animationType="slide" onRequestClose={() => setModal('')}>
        <SafeAreaView style={s.root} edges={['top', 'bottom']}>
          <View style={s.bar}>
            <View style={{ width: 48 }} />
            <Text style={s.title}>Reorder pages</Text>
            <Pressable onPress={() => setModal('')} style={s.textBtn}><Text style={s.textBtnLabel}>Done</Text></Pressable>
          </View>
          <Text style={s.hint}>Hold a page and drag it to a new spot.</Text>
          <ScrollView contentContainerStyle={{ padding: 16 }}>
            <Reorderable
              data={pages} columns={3} gap={14} keyOf={(p) => p.id} onReorder={(next) => setDoc((d) => ({ ...d, pages: next }))}
              renderItem={(p, i) => (
                <View style={s.reorderCell}>
                  <PagePreview page={p} maxW={(win.width - 32 - 28) / 3 - 12} maxH={150} flat />
                  <Text style={s.reorderNo}>{i + 1}</Text>
                </View>
              )}
            />
          </ScrollView>
        </SafeAreaView>
      </Modal>
      <ConfirmModal
        visible={modal === 'delete'} onClose={() => setModal('')} onConfirm={removePages} danger confirmLabel="Delete"
        title={targets.length > 1 ? `Delete ${targets.length} pages?` : 'Delete this page?'}
        message="This removes the page from the scan. It can't be undone."
      />
      <ConfirmModal
        visible={modal === 'reset'} onClose={() => setModal('')} confirmLabel="Reset"
        title={targets.length > 1 ? `Reset ${targets.length} pages?` : 'Reset this page?'}
        message="Crop goes back to the detected edges, and rotation, filter, brightness, contrast, cleanup and markup are cleared."
        onConfirm={() => { editShots(targets, (sh, p) => defaultEdits(p.kind, sh.detected)); setSelected([]); }}
      />
      <PromptModal
        visible={modal === 'rename'} onClose={() => setModal('')} title="Rename scan" initialValue={doc.name}
        onSubmit={(name) => setDoc((d) => ({ ...d, name }))}
      />
    </SafeAreaView>
  );
}

// Draws a page from the PDF layout, so size choices, book halves and ID card front/back look exactly as saved.
export function PagePreview({ page, maxW, maxH, flat }: { page: Page; maxW: number; maxH: number; flat?: boolean }) {
  const dims = page.shots.map((sh) => ({ width: sh.outW ?? sh.width, height: sh.outH ?? sh.height }));
  const sheets = layoutScanPage(page.kind, page.size, dims);
  const gap = sheets.length > 1 ? 6 : 0;
  const totalW = sheets.reduce((a, sh) => a + sh.W, 0);
  const tallest = Math.max(...sheets.map((sh) => sh.H));
  const k = Math.min((maxW - gap) / totalW, maxH / tallest);
  const pending = page.shots.some((sh) => !sh.out || sh.outRev !== sh.rev);
  return (
    <View style={{ flexDirection: 'row', gap, alignItems: 'center' }}>
      {sheets.map((sheet, i) => (
        <View key={i} style={[{ width: sheet.W * k, height: sheet.H * k, backgroundColor: '#FFF', overflow: 'hidden' }, !flat && s.shadow]}>
          {sheet.items.map((it, j) => {
            const sh = page.shots[it.img];
            const [bw, bh] = [it.w * k, it.h * k];
            const [iw, ih] = [bw / it.crop.w, bh / it.crop.h];
            return (
              <View key={j} style={{ position: 'absolute', left: it.x * k, top: (sheet.H - it.y - it.h) * k, width: bw, height: bh, overflow: 'hidden' }}>
                {(sh.out || sh.src) && (
                  <Image
                    source={{ uri: sh.out ?? sh.src }} fadeDuration={0}
                    style={{ position: 'absolute', width: iw, height: ih, left: -it.crop.x * iw, top: -it.crop.y * ih }}
                  />
                )}
              </View>
            );
          })}
          {pending && !flat && (
            <View style={[StyleSheet.absoluteFill, s.pending]}><ActivityIndicator color={u.blue} /></View>
          )}
        </View>
      ))}
    </View>
  );
}

function FiltersSheet({ shot, value, all, onPick, onToggleAll }: {
  shot: Shot; value: Filter; all: boolean; onPick: (f: Filter) => void; onToggleAll: () => void;
}) {
  const [previews, setPreviews] = useState<Record<string, string>>({});
  useEffect(() => { // small renders of the current page in every filter
    let live = true;
    const made: string[] = [];
    (async () => {
      for (const [f] of FILTERS) {
        try {
          const r = await processImage(shot.src, { corners: shot.corners, rotation: shot.rotation, filter: f, maxSize: 300 });
          made.push(r.uri);
          if (live) setPreviews((p) => ({ ...p, [f]: r.uri }));
        } catch {}
      }
    })();
    return () => { live = false; made.forEach(deleteFile); };
  }, [shot.src, shot.corners, shot.rotation]);
  return (
    <View style={s.sheet}>
      <View style={s.sheetHead}>
        <Text style={s.sheetTitle}>Filters</Text>
        <Pressable onPress={onToggleAll} hitSlop={8} style={s.checkRow} accessibilityRole="checkbox" accessibilityState={{ checked: all }}>
          <View style={[s.checkBox, all && { backgroundColor: u.blue, borderColor: u.blue }]}>
            {all && <Icon name="check" size={14} color="#FFF" />}
          </View>
          <Text style={[s.checkText, all && { color: u.blue }]}>Apply to all pages</Text>
        </Pressable>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={[s.sheetRow, { paddingTop: 4 }]}>
      {FILTERS.map(([f, label]) => (
        <Pressable key={f} onPress={() => onPick(f)} style={s.filter}>
          <View style={[s.filterImg, value === f && { borderColor: u.blue }]}>
            {previews[f] ? <Image source={{ uri: previews[f] }} style={StyleSheet.absoluteFill} resizeMode="cover" /> : <ActivityIndicator color={u.dim} />}
          </View>
          <Text style={[s.filterText, value === f && { color: u.blue }]}>{label}</Text>
        </Pressable>
      ))}
      </ScrollView>
    </View>
  );
}

function AdjustSheet({ shot, onCommit, onApplyAll }: { shot: Shot; onCommit: (patch: Partial<Shot>) => void; onApplyAll: () => void }) {
  return (
    <View style={[s.sheet, { paddingHorizontal: 20, paddingVertical: 10, gap: 6 }]}>
      <Slider label="Brightness" value={shot.brightness} onCommit={(brightness) => onCommit({ brightness })} />
      <Slider label="Contrast" value={shot.contrast} onCommit={(contrast) => onCommit({ contrast })} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <ApplyAll key={`${shot.brightness},${shot.contrast}`} onPress={onApplyAll} />
        <Pressable onPress={() => onCommit({ brightness: 0, contrast: 0 })} hitSlop={8}>
          <Text style={s.textBtnLabel}>Reset</Text>
        </Pressable>
      </View>
    </View>
  );
}

// Copies this page's setting to every page in the scan.
function ApplyAll({ onPress }: { onPress: () => void }) {
  const [done, setDone] = useState(false);
  return (
    <Pressable onPress={() => { onPress(); setDone(true); }} style={[s.chip, done && s.chipOn]} accessibilityLabel="Apply to all pages">
      <Text style={[s.chipText, { color: done ? '#FFF' : u.blue }]}>{done ? 'Applied to all pages' : 'Apply to all pages'}</Text>
    </Pressable>
  );
}

// -1..1 slider; shows the value live and re-renders the page only when the finger lifts.
function Slider({ label, value, onCommit }: { label: string; value: number; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value);
  const [w, setW] = useState(0);
  const m = useRef({ w: 0, start: 0, v: value, onCommit });
  Object.assign(m.current, { w, onCommit });
  useEffect(() => { setV(value); m.current.v = value; }, [value]);
  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: (e) => {
      const next = Math.max(-1, Math.min(1, (e.nativeEvent.locationX / m.current.w) * 2 - 1));
      m.current.start = next;
      m.current.v = next;
      setV(next);
    },
    onPanResponderMove: (_, g) => {
      const next = Math.max(-1, Math.min(1, m.current.start + (g.dx / m.current.w) * 2));
      m.current.v = next;
      setV(next);
    },
    onPanResponderRelease: () => m.current.onCommit(Math.round(m.current.v * 100) / 100),
  })).current;
  const x = ((v + 1) / 2) * w;
  return (
    <View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Text style={s.sliderLabel}>{label}</Text>
        <Text style={s.sliderValue}>{Math.round(v * 100)}</Text>
      </View>
      <View style={s.sliderHit} onLayout={(e) => setW(e.nativeEvent.layout.width)} {...pan.panHandlers}>
        <View style={s.sliderTrack} />
        <View style={[s.sliderFill, { left: Math.min(x, w / 2), width: Math.abs(x - w / 2) }]} />
        <View style={[s.sliderKnob, { left: x - 11 }]} />
      </View>
    </View>
  );
}

function IconTap({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={8} accessibilityLabel={label} style={{ width: 48, height: 48, alignItems: 'center', justifyContent: 'center' }}>
      <Icon name={icon} size={24} color={u.text} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: u.bg },
  bar: { height: 56, flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 6 },
  titleBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 4 },
  title: { flexShrink: 1, flex: 1, fontFamily: fonts.bold, fontSize: 16, color: u.text },
  saveBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: u.blue, borderRadius: radius.pill,
    paddingHorizontal: 14, height: 38, marginRight: 4,
  },
  saveText: { fontFamily: fonts.bold, fontSize: 14, color: '#FFF' },
  textBtn: { paddingHorizontal: 12, height: 44, justifyContent: 'center' },
  textBtnLabel: { fontFamily: fonts.bold, fontSize: 14, color: u.blue },
  pageNo: {
    position: 'absolute', alignSelf: 'center', bottom: 10, fontFamily: fonts.med, fontSize: 12, color: u.text,
    backgroundColor: u.scrim, paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, overflow: 'hidden',
  },
  shadow: { elevation: 6, shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  pending: { alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(255,255,255,0.35)' },
  strip: { paddingHorizontal: 12, paddingVertical: 10, gap: 10, alignItems: 'center' },
  thumb: {
    width: 62, height: 76, alignItems: 'center', justifyContent: 'center', borderRadius: 8,
    borderWidth: 2, borderColor: 'transparent', backgroundColor: u.panel,
  },
  thumbOn: { borderColor: u.blue },
  addThumb: { borderColor: u.line, borderStyle: 'dashed' },
  check: {
    position: 'absolute', right: 3, top: 3, width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#FFF',
    alignItems: 'center', justifyContent: 'center', backgroundColor: u.scrim,
  },
  sheet: { flexGrow: 0, backgroundColor: u.panel, borderTopWidth: StyleSheet.hairlineWidth, borderColor: u.line },
  sheetRow: { paddingHorizontal: 14, paddingVertical: 12, gap: 10, alignItems: 'center' },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 10 },
  sheetTitle: { fontFamily: fonts.bold, fontSize: 14, color: u.text },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkBox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: u.dim, alignItems: 'center', justifyContent: 'center' },
  checkText: { fontFamily: fonts.med, fontSize: 13, color: u.text },
  chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: radius.pill, backgroundColor: u.raised },
  chipOn: { backgroundColor: u.blue },
  chipText: { fontFamily: fonts.med, fontSize: 13, color: u.text },
  filter: { alignItems: 'center', gap: 6, width: 76 },
  filterImg: {
    width: 70, height: 88, borderRadius: 8, borderWidth: 2, borderColor: 'transparent', overflow: 'hidden',
    backgroundColor: u.raised, alignItems: 'center', justifyContent: 'center',
  },
  filterText: { fontFamily: fonts.med, fontSize: 11.5, color: u.text, textAlign: 'center' },
  sliderLabel: { fontFamily: fonts.med, fontSize: 13, color: u.text },
  sliderValue: { fontFamily: fonts.med, fontSize: 13, color: u.dim },
  sliderHit: { height: 36, justifyContent: 'center' },
  sliderTrack: { height: 4, borderRadius: 2, backgroundColor: u.raised },
  sliderFill: { position: 'absolute', height: 4, borderRadius: 2, backgroundColor: u.blue },
  sliderKnob: { position: 'absolute', width: 22, height: 22, borderRadius: 11, backgroundColor: '#FFF', elevation: 3 },
  toolbar: { flexGrow: 0, backgroundColor: u.panel, borderTopWidth: StyleSheet.hairlineWidth, borderColor: u.line },
  toolbarRow: { paddingHorizontal: 6, paddingVertical: 8 },
  tool: { width: 70, alignItems: 'center', gap: 4, paddingVertical: 4 },
  toolText: { fontFamily: fonts.med, fontSize: 11.5, color: u.text },
  hint: { fontFamily: fonts.sans, fontSize: 13, color: u.dim, textAlign: 'center' },
  reorderCell: { alignItems: 'center', padding: 6, borderRadius: 8, backgroundColor: u.panel },
  reorderNo: { fontFamily: fonts.bold, fontSize: 12, color: u.text, marginTop: 6 },
});
