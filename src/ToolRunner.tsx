// One screen body for every tool: pick input -> set options -> run -> share results.
import { memo, useCallback, useEffect, useRef, useState, type ComponentType } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { pageInfo, watermarkLayout, zip, type PageInfo, type PageOrder } from './pdf';
import { defaults, stepTools, toolById, type Opts, type Tool, type WorkflowStep } from './tools';
import { openFile, readPicked, save, saveTemp, share, type Saved } from './storage';
import { ArtTile, DocGlyph, kindOf } from './art';
import { renderThumbnails, type Thumb } from '../modules/pdf-thumbnails';
import {
  Button, DragHandle, Group, GroupLabel, Icon, IconBtn, Options, Reorderable, Row, StepHead,
  fmtSize, moveActions, plural, swap,
} from './ui';
import { AppFilesPickerModal, type PickedFile } from './AppFilesPickerModal';
import { fonts, makeStyles, radius, typo, useTheme } from './theme';
import { getToolDraft, setToolDraft } from './toolDraft';

type Picked = PickedFile;
type Result = Saved & { bytes: Uint8Array };
type EditorProps = { file?: Picked; value: Opts; onChange: (o: Opts) => void; onError: (msg: string) => void };

const stripPdf = (name: string) => name.replace(/\.pdf$/i, '');
const GAP = 10; // organize grid gap
const AREA_H = 180; // organize page preview height
const PREVIEW_H = 320; // watermark preview max height

const EDITORS: Record<string, ComponentType<EditorProps>> = { organize: OrganizeEditor, workflow: WorkflowEditor, watermark: WatermarkEditor };

export default function ToolRunner({ tool, onBack, resume }: { tool: Tool; onBack?: () => void; resume?: boolean }) {
  const s = useStyles();
  const { c } = useTheme();
  const [draft] = useState(() => { const d = getToolDraft(); return resume && d?.tool === tool.id ? d : null; });
  const [files, setFiles] = useState<Picked[]>(() => draft?.files ?? []);
  const [opts, setOpts] = useState<Opts>(() => draft?.opts ?? defaults(tool.opts));
  const [busy, setBusy] = useState<'' | 'run' | 'preview'>('');
  const [error, setError] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [appFilesOpen, setAppFilesOpen] = useState(false);
  const Editor = EDITORS[tool.id];
  const multi = tool.input === 'pdfs';
  const ready = files.length >= (multi ? tool.min ?? 2 : 1);

  // Autosave while there's unfinished work, kept after going back or closing the app; finishing or clearing the files drops it.
  // Only touches the saved draft once this screen has work of its own, so peeking at a tool keeps an older draft.
  const owns = useRef(!!draft);
  useEffect(() => {
    if (files.length && !results.length) { owns.current = true; setToolDraft({ tool: tool.id, files, opts }); }
    else if (owns.current) setToolDraft(null);
  }, [files, opts, results]);

  const changeFiles = (next: Picked[]) => { setFiles(next); setResults([]); setError(''); };
  const move = (from: number, to: number) => changeFiles(swap(files, from, to));
  const remove = (f: Picked) => changeFiles(files.filter((x) => x !== f));

  const pickPdf = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', multiple: multi, copyToCacheDirectory: true });
    if (r.canceled) return;
    const picked = r.assets.map((a) => ({ name: a.name, uri: a.uri, size: a.size }));
    changeFiles(multi ? [...files, ...picked] : picked.slice(0, 1));
  };

  const exec = async (mode: 'run' | 'preview') => {
    setBusy(mode);
    setError('');
    setResults([]);
    await new Promise((r) => setTimeout(r, 60)); // let the spinner paint before heavy JS work
    try {
      const inputs = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: await readPicked(f.uri) })));
      const outs = await tool.run(inputs, opts);
      const base = stripPdf(files[0].name);
      const nameOf = (o: { name: string; full?: boolean }) => (o.full ? o.name : o.name ? `${base}-${o.name}` : base);
      // ponytail: multi-file outputs (splits) preview only the first part; add a picker if people ask for the rest.
      if (mode === 'preview') openFile(saveTemp(`${nameOf(outs[0])} (preview).pdf`, outs[0].bytes));
      else setResults(outs.map((o) => save(nameOf(o), o.ext ?? 'pdf', o.bytes)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy('');
  };

  const shareAll = () => {
    const baseName = files[0]?.name ? stripPdf(files[0].name) : 'export';
    share(save(`${baseName}-all`, 'zip', zip(results)));
  };
  const busyLabel = `${tool.doing}…`;

  const fileRow = (f: Picked, i: number, draggable: boolean) => (
    <Row
      first={i === 0} title={f.name} subtitle={fmtSize(f.size)} marquee
      lead={draggable ? <View style={s.fileLead}><Text style={s.fileNum}>{i + 1}</Text><DocGlyph kind="pdf" /></View> : <DocGlyph kind="pdf" />}
    >
      <IconBtn name="close" onPress={() => remove(f)} />
      {draggable && (
        <>
          <IconBtn name="chevron-up" color={i === 0 ? c.faint : c.ink} onPress={() => move(i, i - 1)} />
          <IconBtn name="chevron-down" color={i === files.length - 1 ? c.faint : c.ink} onPress={() => move(i, i + 1)} />
        </>
      )}
    </Row>
  );

  return (
    <>
      {onBack && (
        <Pressable onPress={onBack} style={s.back} hitSlop={12}>
          <Icon name="chevron-left" size={24} color={c.ink} />
          <Text style={s.backText}>Tools</Text>
        </Pressable>
      )}
      <View style={s.head}>
        <ArtTile id={tool.id} size={64} />
        <Text style={s.title}>{tool.title}</Text>
      </View>
      <Text style={s.desc}>{tool.desc}</Text>

      <StepHead n={1} title={multi ? 'Choose PDFs' : 'Choose a PDF'} />
      {files.length > 0 && (
        <Group>
          {multi && files.length > 1 ? (
            <Reorderable
              data={files} keyOf={(f) => f.uri} onReorder={changeFiles}
              renderItem={(f, i) => <View style={s.rowBg}>{fileRow(f, i, true)}</View>}
            />
          ) : (
            files.map((f, i) => <View key={f.uri}>{fileRow(f, i, false)}</View>)
          )}
        </Group>
      )}
      {!files.length && (
        <View style={s.pickerRow}>
          <Pressable
            onPress={pickPdf}
            style={({ pressed }) => [s.pickerCard, pressed && { backgroundColor: c.sunken }]}
          >
            <View style={s.pickerIconBox}>
              <Icon name="file-document-outline" size={26} color={c.ink} />
            </View>
            <Text style={s.pickerTitle}>Device Storage</Text>
            <Text style={s.pickerSub}>Drive, Downloads, Phone</Text>
          </Pressable>
          <Pressable
            onPress={() => setAppFilesOpen(true)}
            style={({ pressed }) => [s.pickerCard, pressed && { backgroundColor: c.sunken }]}
          >
            <View style={[s.pickerIconBox, { backgroundColor: c.accentSoft }]}>
              <Icon name="folder-outline" size={26} color={c.accent} />
            </View>
            <Text style={s.pickerTitle}>App Files</Text>
            <Text style={s.pickerSub}>Saved in PDF Tools</Text>
          </Pressable>
        </View>
      )}

      {multi && files.length > 1 && <Text style={[s.hint, { marginTop: 8 }]}>Use the arrows, or hold a file and drag it, to change the order.</Text>}
      {multi && files.length > 0 && (
        <View style={s.addMoreRow}>
          <Pressable
            onPress={pickPdf}
            style={({ pressed }) => [s.addMoreBtn, pressed && { backgroundColor: c.sunken }]}
          >
            <Icon name="plus" size={18} color={c.ink} />
            <Text style={s.addMoreText}>Add from Device</Text>
          </Pressable>
          <Pressable
            onPress={() => setAppFilesOpen(true)}
            style={({ pressed }) => [s.addMoreBtn, pressed && { backgroundColor: c.sunken }]}
          >
            <Icon name="folder-outline" size={18} color={c.accent} />
            <Text style={s.addMoreText}>Add from App Files</Text>
          </Pressable>
        </View>
      )}

      <AppFilesPickerModal
        visible={appFilesOpen}
        multi={multi}
        alreadySelectedUris={files.map((f) => f.uri)}
        onClose={() => setAppFilesOpen(false)}
        onSelect={(picked) => {
          changeFiles(
            multi
              ? [...files, ...picked.filter((p) => !files.some((x) => x.uri === p.uri))]
              : picked.slice(0, 1)
          );
        }}
      />

      {(Editor || !!tool.opts?.length) && (
        <>
          <StepHead n={2} title={tool.id === 'organize' ? 'Arrange pages' : tool.id === 'workflow' ? 'Add steps' : 'Options'} />
          {Editor
            ? <Editor file={files[0]} value={opts} onChange={setOpts} onError={setError} />
            : <Options defs={tool.opts ?? []} value={opts} onChange={setOpts} />}
        </>
      )}

      <Button label={busy === 'run' ? busyLabel : tool.cta} busy={busy === 'run'} disabled={!ready || busy === 'preview'} onPress={() => exec('run')} style={s.cta} />
      {!tool.noPreview && (
        <Button
          icon="eye-outline" label={busy === 'preview' ? 'Preparing preview…' : 'Preview result'} variant="secondary"
          busy={busy === 'preview'} disabled={!ready || busy === 'run'} onPress={() => exec('preview')} style={{ marginTop: 10 }}
        />
      )}

      {!!error && (
        <View style={s.error}>
          <Icon name="alert-circle-outline" size={18} color={c.accent} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      {results.length > 0 && (
        <>
          <GroupLabel label={results.length > 1 ? `${results.length} files saved` : 'Saved'} action="Open Files" onAction={() => router.navigate('/files')} />
          <Group>
            {results.map((r, i) => (
              <Row
                key={r.uri} first={i === 0} lead={<DocGlyph kind={kindOf(r.name)} />} title={r.name} onPress={() => openFile(r)}
                subtitle={results.length === 1 && files.length === 1 && files[0].size ? `${fmtSize(files[0].size)} → ${fmtSize(r.size)}` : fmtSize(r.size)}
              >
                <Pressable onPress={() => share(r)} style={({ pressed }) => [s.pill, pressed && { backgroundColor: c.sunken }]}>
                  <Text style={s.pillText}>Share</Text>
                </Pressable>
              </Row>
            ))}
          </Group>
          {results.length > 1 && <Button icon="folder-zip-outline" label="Share all as one ZIP" variant="secondary" onPress={shareAll} style={{ marginTop: 10 }} />}
          <Text style={s.again} onPress={() => changeFiles([])}>Use another file</Text>
        </>
      )}
    </>
  );
}

const OrganizeTile = memo(function OrganizeTile({
  o, k, page, thumb, cell, move, onRotate, onDelete,
}: {
  o: PageOrder; k: number; page?: PageInfo; thumb?: Thumb; cell: number;
  move: (from: number, to: number) => void;
  onRotate: (index: number) => void;
  onDelete: (index: number) => void;
}) {
  const s = useStyles();
  const p = page ?? { width: 400, height: 600, rot: 0 };
  const t = thumb;
  const [bw, bh] = t ? [t.width, t.height] : p.rot % 180 ? [p.height, p.width] : [p.width, p.height];
  const turned = o.rot % 180 !== 0;
  const [w, h] = turned ? [bh, bw] : [bw, bh];
  const fit = cell > 0 ? Math.min((cell - 16) / w, AREA_H / h) : 0.5;
  const box = { width: w * fit, height: h * fit };
  const img = turned ? { width: box.height, height: box.width } : box;

  return (
    <View style={s.pageCell}>
      <View style={[s.pageArea, o.del && s.pageDeleted]}>
        {cell > 0 && (
          <View style={[s.pageBox, box]}>
            {t ? (
              <Image
                source={{ uri: t.uri }}
                style={{
                  position: 'absolute', ...img, left: (box.width - img.width) / 2, top: (box.height - img.height) / 2,
                  transform: [{ rotate: `${o.rot}deg` }],
                }}
              />
            ) : (
              <Text style={s.pageNum}>{o.i + 1}</Text>
            )}
          </View>
        )}
        <Text style={s.pageBadge} accessibilityLabel={`Page ${o.i + 1}, position ${k + 1}`} {...moveActions(k, move)}>
          {o.i + 1}
        </Text>
        {o.rot > 0 && <Text style={s.pageRot}>{o.rot}°</Text>}
      </View>
      <View style={s.pageTools}>
        {o.del
          ? <IconBtn name="restore" onPress={() => onDelete(k)} />
          : <>
              <IconBtn name="rotate-right" onPress={() => onRotate(k)} />
              <IconBtn name="delete-outline" onPress={() => onDelete(k)} />
            </>}
      </View>
    </View>
  );
});

function OrganizeEditor({ file, value, onChange, onError }: EditorProps) {
  const s = useStyles();
  const { c } = useTheme();
  const [pages, setPages] = useState<PageInfo[] | null>(null);
  const [thumbs, setThumbs] = useState<Thumb[] | null>(null);
  const [cell, setCell] = useState(0);
  const order: PageOrder[] = value.order ?? [];
  const restored = useRef(order.length > 0); // a resumed draft's order survives the first page load
  const set = (o: PageOrder[]) => onChange({ order: o });
  const move = (from: number, to: number) => set(swap(order, from, to));
  const reset = (info: PageInfo[]) => set(info.map((_, i) => ({ i, rot: 0 })));

  const handleRotate = useCallback((k: number) => {
    set(order.map((x, j) => (j === k ? { ...x, rot: (x.rot + 90) % 360 } : x)));
  }, [order]);

  const handleDelete = useCallback((k: number) => {
    set(order.map((x, j) => (j === k ? { ...x, del: !x.del } : x))); // toggles, so a deleted page can be restored
  }, [order]);

  useEffect(() => {
    if (!file) return;
    let live = true;
    setPages(null);
    setThumbs(null);
    readPicked(file.uri).then(pageInfo)
      .then((info) => {
        if (!live) return;
        setPages(info);
        if (restored.current) restored.current = false;
        else reset(info);
      })
      .catch((e: Error) => live && onError(e.message));
    // Render lightweight 200px thumbnails for smooth, low-memory drag reordering
    renderThumbnails(file.uri, 200).then((t) => live && setThumbs(t)).catch(() => {});
    return () => { live = false; };
  }, [file?.uri]);

  if (!file) return <Text style={s.hint}>Your pages appear here once you choose a PDF.</Text>;
  if (!pages) return <ActivityIndicator color={c.ink} style={{ marginVertical: 24 }} />;

  return (
    <>
      <View style={s.orgBar}>
        <Text style={[s.hint, s.orgHint]}>Keeping {order.filter((o) => !o.del).length} of {plural(pages.length, 'page')}. Hold a page to drag it.</Text>
        <Text style={s.link} onPress={() => reset(pages)}>Reset</Text>
      </View>
      <View onLayout={(e) => setCell(Math.floor((e.nativeEvent.layout.width - GAP) / 2))}>
        <Reorderable
          data={order} columns={2} gap={GAP} keyOf={(o) => String(o.i)} onReorder={set}
          renderItem={(o, k) => (
            <OrganizeTile
              key={o.i}
              o={o}
              k={k}
              page={pages[o.i]}
              thumb={thumbs?.[o.i]}
              cell={cell}
              move={move}
              onRotate={handleRotate}
              onDelete={handleDelete}
            />
          )}
        />
      </View>
    </>
  );
}

function WatermarkEditor({ file, value, onChange, onError }: EditorProps) {
  const s = useStyles();
  const { c } = useTheme();
  const [page, setPage] = useState<{ info: PageInfo; thumb: Thumb } | null>(null);
  const [areaW, setAreaW] = useState(0);
  const text = String(value.text ?? '');

  useEffect(() => {
    setPage(null);
    if (!file) return;
    let live = true;
    // ponytail: renders every page to show page 1; add a first-page-only native call if big PDFs feel slow.
    Promise.all([readPicked(file.uri).then(pageInfo), renderThumbnails(file.uri, 480)])
      .then(([info, thumbs]) => { if (live && info[0] && thumbs[0]) setPage({ info: info[0], thumb: thumbs[0] }); })
      .catch((e: Error) => live && onError(e.message));
    return () => { live = false; };
  }, [file?.uri]);

  const preview = () => {
    if (!file) return <Text style={s.hint}>Choose a PDF to preview the watermark on its first page.</Text>;
    if (!page || !areaW) return <ActivityIndicator color={c.ink} />;
    const { info: p, thumb: t } = page;
    const fit = Math.min(areaW / t.width, PREVIEW_H / t.height);
    const [w, h] = [t.width * fit, t.height * fit];
    const k = Math.hypot(w, h) / Math.hypot(p.width, p.height); // page points -> preview px
    const L = text.trim() ? watermarkLayout(text, p.width, p.height, value.scale) : null;
    return (
      <View style={[s.pageBox, { width: w, height: h }]}>
        <Image source={{ uri: t.uri }} style={StyleSheet.absoluteFill} />
        {L && (
          <Text
            numberOfLines={1}
            style={[s.wmText, {
              width: L.textWidth * k * 1.3, fontSize: L.size * k, lineHeight: L.size * k * 1.2, opacity: Number(value.opacity),
              transform: [{ rotate: `${p.rot - (L.angle * 180) / Math.PI}deg` }], // PDF angles run counter-clockwise
            }]}
          >
            {text}
          </Text>
        )}
      </View>
    );
  };

  return (
    <>
      <View style={s.wmArea} onLayout={(e) => setAreaW(e.nativeEvent.layout.width - 24)}>{preview()}</View>
      <Text style={[s.hint, { textAlign: 'center', marginTop: 6, marginBottom: 14 }]}>Preview · page 1</Text>
      <Options defs={toolById('watermark')!.opts!} value={value} onChange={onChange} />
    </>
  );
}

function WorkflowEditor({ value, onChange }: EditorProps) {
  const s = useStyles();
  const { c } = useTheme();
  const steps: WorkflowStep[] = value.steps ?? [];
  const set = (next: WorkflowStep[]) => onChange({ ...value, steps: next });
  const move = (from: number, to: number) => set(swap(steps, from, to));
  return (
    <>
      <Reorderable
        data={steps} gap={10} keyOf={(step) => step.id} onReorder={set} handle
        renderItem={(step, k) => (
          <View style={s.stepCard}>
            <View style={s.stepCardHead}>
              <Text style={s.stepNum}>{k + 1}</Text>
              <Text style={s.stepCardTitle}>{toolById(step.op)!.title}</Text>
              <IconBtn name="close" onPress={() => set(steps.filter((_, j) => j !== k))} />
              <DragHandle index={k} move={move} />
            </View>
            <Options
              defs={toolById(step.op)!.opts ?? []} value={step.opts}
              onChange={(o) => set(steps.map((x, j) => (j === k ? { ...x, opts: o } : x)))}
            />
          </View>
        )}
      />
      <Text style={[s.hint, { marginTop: steps.length ? 12 : 0, marginBottom: 10 }]}>
        {steps.length
          ? 'Steps run top to bottom. Merge and Mix combine all files; other steps run on each file. Drag the handles to reorder. Add another:'
          : 'Pick the steps to run, in order. Choose several PDFs to merge them first.'}
      </Text>
      <View style={s.addRow}>
        {stepTools().map((t) => (
          <Pressable
            key={t.id} style={({ pressed }) => [s.addChip, pressed && { backgroundColor: c.sunken }]}
            onPress={() => set([...steps, { id: `${t.id}-${Math.random()}`, op: t.id, opts: defaults(t.opts) }])}
          >
            <Icon name="plus" size={14} color={c.ink} />
            <Text style={s.addChipText}>{t.title}</Text>
          </Pressable>
        ))}
      </View>
    </>
  );
}

const useStyles = makeStyles((c) => ({
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginLeft: -6, marginTop: 0, marginBottom: 14 },
  backText: { fontFamily: fonts.med, fontSize: 16, color: c.ink },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { ...typo.title, fontSize: 23, lineHeight: 30, color: c.accent, flex: 1 },
  desc: { ...typo.body, color: c.sub, marginTop: 14 },
  rowBg: { backgroundColor: c.surface },
  fileLead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  fileNum: { minWidth: 18, textAlign: 'center', fontFamily: fonts.bold, fontSize: 13, color: c.sub },
  pickerRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  pickerCard: {
    flex: 1,
    padding: 16,
    borderRadius: radius.group,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: c.lineStrong,
    backgroundColor: c.surface,
    alignItems: 'center',
  },
  pickerIconBox: {
    width: 44,
    height: 44,
    borderRadius: radius.control,
    backgroundColor: c.sunken,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  pickerTitle: { fontFamily: fonts.bold, fontSize: 14.5, color: c.ink },
  pickerSub: { ...typo.small, color: c.sub, marginTop: 2, textAlign: 'center' },
  addMoreRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  addMoreBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: radius.control,
    borderWidth: 1,
    borderColor: c.lineStrong,
    backgroundColor: c.surface,
  },
  addMoreText: { fontFamily: fonts.med, fontSize: 13.5, color: c.ink },
  cta: { marginTop: 28 },
  error: { flexDirection: 'row', gap: 8, marginTop: 14, padding: 12, borderRadius: radius.control, backgroundColor: c.accentSoft },
  errorText: { flex: 1, ...typo.small, fontSize: 14, color: c.accentInk },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: c.lineStrong },
  pillText: { fontFamily: fonts.bold, fontSize: 13, color: c.ink },
  again: { fontFamily: fonts.med, fontSize: 14, color: c.accent, textAlign: 'center', marginTop: 18, paddingVertical: 4 },
  hint: { ...typo.small, color: c.sub },
  link: { fontFamily: fonts.med, fontSize: 13.5, color: c.accent },
  orgBar: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  orgHint: { flex: 1 }, // wraps so Reset stays on screen
  pageCell: { padding: 8, borderRadius: radius.control, backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong },
  pageArea: { height: AREA_H, alignItems: 'center', justifyContent: 'center', backgroundColor: c.sunken, borderRadius: 8, overflow: 'hidden' },
  pageBox: {
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: c.page,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong,
  },
  pageDeleted: { opacity: 0.3 },
  pageNum: { fontFamily: fonts.bold, fontSize: 20, color: c.faint },
  pageBadge: {
    position: 'absolute', left: 6, bottom: 6, minWidth: 22, textAlign: 'center', paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 4, overflow: 'hidden', fontFamily: fonts.bold, fontSize: 11, color: c.onInk, backgroundColor: c.ink,
  },
  pageRot: {
    position: 'absolute', right: 6, top: 6, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, overflow: 'hidden',
    fontFamily: fonts.bold, fontSize: 11, color: c.onInk, backgroundColor: c.accent,
  },
  wmArea: { minHeight: 120, padding: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: c.sunken, borderRadius: radius.group },
  wmText: { position: 'absolute', textAlign: 'center', fontWeight: '700', color: '#D1452B', includeFontPadding: false }, // matches the stamped rgb
  pageTools: { flexDirection: 'row', justifyContent: 'space-around', marginTop: 6 },
  stepCard: {
    padding: 14, paddingBottom: 0, borderRadius: radius.group,
    backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong,
  },
  stepCardHead: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  stepNum: {
    width: 22, height: 22, borderRadius: 11, textAlign: 'center', lineHeight: 22, overflow: 'hidden',
    fontFamily: fonts.bold, fontSize: 11, color: c.onInk, backgroundColor: c.accent,
  },
  stepCardTitle: { flex: 1, fontFamily: fonts.bold, fontSize: 15, color: c.ink, marginLeft: 6 },
  addRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  addChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8,
    borderRadius: radius.pill, borderWidth: 1, borderColor: c.lineStrong,
  },
  addChipText: { fontFamily: fonts.med, fontSize: 13, color: c.ink },
}));
