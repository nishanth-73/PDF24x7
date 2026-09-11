// One screen body for every tool: pick input -> set options -> run -> share results.
import { useEffect, useState, type ComponentType } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { pageInfo, zip, type PageInfo, type PageOrder } from './pdf';
import { STEPS, defaults, type Opts, type Tool, type WorkflowStep } from './tools';
import { openFile, readPicked, save, share, type Saved } from './storage';
import { ArtTile, DocGlyph, ToolArt, kindOf } from './art';
import { renderThumbnails, type Thumb } from '../modules/pdf-thumbnails';
import {
  Button, DragHandle, Group, GroupLabel, Icon, IconBtn, LargeTitle, Options, Reorderable, Row, StepHead,
  fmtSize, moveActions, pad, plural, swap,
} from './ui';
import { fonts, makeStyles, radius, typo, useTheme } from './theme';

type Picked = { name: string; uri: string; size?: number | null };
type Result = Saved & { bytes: Uint8Array };
type EditorProps = { file?: Picked; value: Opts; onChange: (o: Opts) => void; onError: (msg: string) => void };

const stamp = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}.${pad(d.getMinutes())}`;
};
const stripPdf = (name: string) => name.replace(/\.pdf$/i, '');
const GAP = 10; // organize grid gap
const AREA_H = 180; // organize page preview height

const EDITORS: Record<string, ComponentType<EditorProps>> = { organize: OrganizeEditor, workflow: WorkflowEditor };

export default function ToolRunner({ tool, onBack }: { tool: Tool; onBack?: () => void }) {
  const s = useStyles();
  const { c } = useTheme();
  const [files, setFiles] = useState<Picked[]>([]);
  const [opts, setOpts] = useState<Opts>(() => defaults(tool.opts));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const Editor = EDITORS[tool.id];
  const multi = tool.input === 'pdfs';
  const images = tool.input === 'images';
  const ready = files.length >= (multi ? tool.min ?? 2 : 1);

  const changeFiles = (next: Picked[]) => { setFiles(next); setResults([]); setError(''); };
  const move = (from: number, to: number) => changeFiles(swap(files, from, to));
  const remove = (f: Picked) => changeFiles(files.filter((x) => x !== f));

  const pickPdf = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', multiple: multi, copyToCacheDirectory: true });
    if (r.canceled) return;
    const picked = r.assets.map((a) => ({ name: a.name, uri: a.uri, size: a.size }));
    changeFiles(multi ? [...files, ...picked] : picked.slice(0, 1));
  };

  const addPhotos = async (camera: boolean) => {
    if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
      setError('PDF Tools needs camera access to scan. You can allow it in your phone’s Settings.');
      return;
    }
    const o: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: !camera };
    const r = camera ? await ImagePicker.launchCameraAsync(o) : await ImagePicker.launchImageLibraryAsync(o);
    if (r.canceled) return;
    changeFiles([...files, ...r.assets.map((a, i) => ({ name: `Page ${files.length + i + 1}`, uri: a.uri, size: a.fileSize }))]);
  };

  const run = async () => {
    setBusy(true);
    setError('');
    setResults([]);
    await new Promise((r) => setTimeout(r, 60)); // let the spinner paint before heavy JS work
    try {
      const inputs = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: await readPicked(f.uri) })));
      const outs = await tool.run(inputs, opts);
      const base = images ? `Scan ${stamp()}` : stripPdf(files[0].name);
      setResults(outs.map((o) => save(o.name ? `${base}-${o.name}` : base, o.ext ?? 'pdf', o.bytes)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setBusy(false);
  };

  const shareAll = () => share(save(`${stripPdf(files[0].name)}-all`, 'zip', zip(results)));
  const busyLabel = images ? `Building a ${files.length}-page PDF…` : `${tool.doing}…`;

  const fileRow = (f: Picked, i: number, draggable: boolean) => (
    <Row first={i === 0} lead={<DocGlyph kind="pdf" />} title={f.name} subtitle={fmtSize(f.size)}>
      <IconBtn name="close" onPress={() => remove(f)} />
      {draggable && <DragHandle index={i} move={move} />}
    </Row>
  );

  return (
    <>
      {images ? (
        <>
          <LargeTitle title="Scan" sub={files.length ? `${plural(files.length, 'page')} captured` : 'Photos become pages, in the order you take them.'} />
          {!files.length && (
            <View style={s.tip}>
              <ToolArt id="scan" size={52} />
              <Text style={s.tipText}>Lay the page flat, fill the frame and use daylight if you can. Photos from your gallery work too.</Text>
            </View>
          )}
          <View style={s.twoBtns}>
            <Button
              icon="camera-outline" label={files.length ? 'Add page' : 'Camera'} variant={files.length ? 'secondary' : 'primary'}
              onPress={() => addPhotos(true)} style={{ flex: 1 }}
            />
            <Button icon="image-multiple-outline" label="Import photos" variant="secondary" onPress={() => addPhotos(false)} style={{ flex: 1 }} />
          </View>
          {files.length > 1 && <Text style={[s.hint, { marginTop: 14 }]}>Hold a page and drag it to change the order.</Text>}
          <View style={s.thumbs}>
            <Reorderable
              data={files} columns={3} gap={8} keyOf={(f) => f.uri} onReorder={changeFiles}
              renderItem={(f, i) => (
                <View style={s.thumb}>
                  <Image source={{ uri: f.uri }} style={StyleSheet.absoluteFill} />
                  <Text style={s.thumbNum} accessibilityLabel={`Page ${i + 1}`} {...moveActions(i, move)}>{i + 1}</Text>
                  <Pressable style={s.thumbX} hitSlop={8} onPress={() => remove(f)} accessibilityLabel={`Remove page ${i + 1}`}>
                    <Icon name="close" size={14} color={c.ink} />
                  </Pressable>
                </View>
              )}
            />
          </View>
        </>
      ) : (
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
                  data={files} keyOf={(f) => f.uri} onReorder={changeFiles} handle
                  renderItem={(f, i) => <View style={s.rowBg}>{fileRow(f, i, true)}</View>}
                />
              ) : (
                files.map((f, i) => <View key={f.uri}>{fileRow(f, i, false)}</View>)
              )}
            </Group>
          )}
          {(multi || !files.length) && (
            <Pressable onPress={pickPdf} style={({ pressed }) => [s.drop, files.length > 0 && { marginTop: 10 }, pressed && { backgroundColor: c.sunken }]}>
              <Icon name={files.length ? 'plus' : 'file-plus-outline'} size={26} color={c.ink} />
              <Text style={s.dropTitle}>{files.length ? 'Add another PDF' : multi ? 'Choose PDF files' : 'Choose a PDF file'}</Text>
              <Text style={s.dropSub}>
                {multi ? `At least ${tool.min ?? 2}. Drag the handles to set the order.` : 'From Files, Drive or Downloads'}
              </Text>
            </Pressable>
          )}

          {(Editor || !!tool.opts?.length) && (
            <>
              <StepHead n={2} title={tool.id === 'organize' ? 'Arrange pages' : tool.id === 'workflow' ? 'Add steps' : 'Options'} />
              {Editor
                ? <Editor file={files[0]} value={opts} onChange={setOpts} onError={setError} />
                : <Options defs={tool.opts ?? []} value={opts} onChange={setOpts} />}
            </>
          )}
        </>
      )}

      {(!images || files.length > 0) && (
        <Button label={busy ? busyLabel : tool.cta} busy={busy} disabled={!ready} onPress={run} style={s.cta} />
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
          <Text style={s.again} onPress={() => changeFiles([])}>{images ? 'Start a new scan' : 'Use another file'}</Text>
        </>
      )}
    </>
  );
}

function OrganizeEditor({ file, value, onChange, onError }: EditorProps) {
  const s = useStyles();
  const { c } = useTheme();
  const [pages, setPages] = useState<PageInfo[] | null>(null);
  const [thumbs, setThumbs] = useState<Thumb[] | null>(null);
  const [cell, setCell] = useState(0);
  const order: PageOrder[] = value.order ?? [];
  const set = (o: PageOrder[]) => onChange({ order: o });
  const move = (from: number, to: number) => set(swap(order, from, to));
  const reset = (info: PageInfo[]) => set(info.map((_, i) => ({ i, rot: 0 })));

  useEffect(() => {
    if (!file) return;
    let live = true;
    setPages(null);
    setThumbs(null);
    readPicked(file.uri).then(pageInfo)
      .then((info) => { if (live) { setPages(info); reset(info); } })
      .catch((e: Error) => live && onError(e.message));
    // Page pictures arrive after the page list; until then, or if rendering fails (e.g. encrypted PDF), tiles show numbers.
    renderThumbnails(file.uri).then((t) => live && setThumbs(t)).catch(() => {});
    return () => { live = false; };
  }, [file?.uri]);

  if (!file) return <Text style={s.hint}>Your pages appear here once you choose a PDF.</Text>;
  if (!pages) return <ActivityIndicator color={c.ink} style={{ marginVertical: 24 }} />;

  return (
    <>
      <View style={s.orgBar}>
        <Text style={s.hint}>Keeping {order.length} of {plural(pages.length, 'page')}. Hold a page to drag it.</Text>
        <Text style={s.link} onPress={() => reset(pages)}>Reset</Text>
      </View>
      <View onLayout={(e) => setCell(Math.floor((e.nativeEvent.layout.width - GAP) / 2))}>
        <Reorderable
          data={order} columns={2} gap={GAP} keyOf={(o) => String(o.i)} onReorder={set}
          renderItem={(o, k) => {
            const p = pages[o.i];
            const t = thumbs?.[o.i];
            // Base orientation: the rendered picture (already includes the page's own rotation), else the page size.
            const [bw, bh] = t ? [t.width, t.height] : p.rot % 180 ? [p.height, p.width] : [p.width, p.height];
            const turned = o.rot % 180 !== 0;
            const [w, h] = turned ? [bh, bw] : [bw, bh];
            const fit = Math.min((cell - 16) / w, AREA_H / h);
            const box = { width: w * fit, height: h * fit };
            const img = turned ? { width: box.height, height: box.width } : box;
            return (
              <View style={s.pageCell}>
                <View style={s.pageArea}>
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
                  <IconBtn name="rotate-right" onPress={() => set(order.map((x, j) => (j === k ? { ...x, rot: (x.rot + 90) % 360 } : x)))} />
                  <IconBtn name="delete-outline" onPress={() => set(order.filter((_, j) => j !== k))} />
                </View>
              </View>
            );
          }}
        />
      </View>
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
              <Text style={s.stepCardTitle}>{STEPS[step.op].label}</Text>
              <IconBtn name="close" onPress={() => set(steps.filter((_, j) => j !== k))} />
              <DragHandle index={k} move={move} />
            </View>
            <Options
              defs={STEPS[step.op].opts} value={step.opts}
              onChange={(o) => set(steps.map((x, j) => (j === k ? { ...x, opts: o } : x)))}
            />
          </View>
        )}
      />
      <Text style={[s.hint, { marginTop: steps.length ? 12 : 0, marginBottom: 10 }]}>
        {steps.length ? 'Steps run top to bottom on the same file. Drag the handles to reorder. Add another:' : 'Pick the steps to run, in order:'}
      </Text>
      <View style={s.addRow}>
        {Object.entries(STEPS).map(([op, d]) => (
          <Pressable
            key={op} style={({ pressed }) => [s.addChip, pressed && { backgroundColor: c.sunken }]}
            onPress={() => set([...steps, { id: `${op}-${Math.random()}`, op, opts: defaults(d.opts) }])}
          >
            <Icon name="plus" size={14} color={c.ink} />
            <Text style={s.addChipText}>{d.label}</Text>
          </Pressable>
        ))}
      </View>
    </>
  );
}

const useStyles = makeStyles((c) => ({
  back: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', marginLeft: -6, marginTop: 4, marginBottom: 18 },
  backText: { fontFamily: fonts.med, fontSize: 16, color: c.ink },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  title: { ...typo.title, fontSize: 23, lineHeight: 30, color: c.accent, flex: 1 },
  desc: { ...typo.body, color: c.sub, marginTop: 14 },
  tip: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 14, marginBottom: 16,
    borderRadius: radius.group, backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong,
  },
  tipText: { ...typo.small, color: c.sub, flex: 1 },
  rowBg: { backgroundColor: c.surface },
  drop: {
    alignItems: 'center', paddingVertical: 22, paddingHorizontal: 16, borderRadius: radius.group,
    borderWidth: 1.5, borderStyle: 'dashed', borderColor: c.lineStrong, backgroundColor: c.surface,
  },
  dropTitle: { fontFamily: fonts.bold, fontSize: 15, color: c.ink, marginTop: 6 },
  dropSub: { ...typo.small, color: c.sub, marginTop: 2 },
  twoBtns: { flexDirection: 'row', gap: 10 },
  thumbs: { marginTop: 14 },
  thumb: { width: '100%', aspectRatio: 0.75, borderRadius: 8, overflow: 'hidden', backgroundColor: c.sunken },
  thumbNum: {
    position: 'absolute', left: 6, bottom: 6, minWidth: 20, textAlign: 'center', fontFamily: fonts.bold, fontSize: 11,
    color: c.onInk, backgroundColor: c.ink, paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, overflow: 'hidden',
  },
  thumbX: { position: 'absolute', right: 5, top: 5, backgroundColor: c.surface, borderRadius: 12, padding: 3 },
  cta: { marginTop: 28 },
  error: { flexDirection: 'row', gap: 8, marginTop: 14, padding: 12, borderRadius: radius.control, backgroundColor: c.accentSoft },
  errorText: { flex: 1, ...typo.small, fontSize: 14, color: c.accentInk },
  pill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: radius.pill, borderWidth: 1, borderColor: c.lineStrong },
  pillText: { fontFamily: fonts.bold, fontSize: 13, color: c.ink },
  again: { fontFamily: fonts.med, fontSize: 14, color: c.accent, textAlign: 'center', marginTop: 18, paddingVertical: 4 },
  hint: { ...typo.small, color: c.sub },
  link: { fontFamily: fonts.med, fontSize: 13.5, color: c.accent },
  orgBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  pageCell: { padding: 8, borderRadius: radius.control, backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong },
  pageArea: { height: AREA_H, alignItems: 'center', justifyContent: 'center', backgroundColor: c.sunken, borderRadius: 8, overflow: 'hidden' },
  pageBox: {
    alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: c.page,
    borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong,
  },
  pageNum: { fontFamily: fonts.bold, fontSize: 20, color: c.faint },
  pageBadge: {
    position: 'absolute', left: 6, bottom: 6, minWidth: 22, textAlign: 'center', paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 4, overflow: 'hidden', fontFamily: fonts.bold, fontSize: 11, color: c.onInk, backgroundColor: c.ink,
  },
  pageRot: {
    position: 'absolute', right: 6, top: 6, paddingHorizontal: 6, paddingVertical: 1, borderRadius: 4, overflow: 'hidden',
    fontFamily: fonts.bold, fontSize: 11, color: c.onInk, backgroundColor: c.accent,
  },
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
