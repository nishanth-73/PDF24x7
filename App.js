import { useEffect, useState } from 'react';
import {
  ActivityIndicator, BackHandler, Image, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import { Fraunces_600SemiBold, Fraunces_400Regular_Italic } from '@expo-google-fonts/fraunces';
import { IBMPlexSans_400Regular, IBMPlexSans_500Medium, IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans';
import { IBMPlexMono_500Medium } from '@expo-google-fonts/ibm-plex-mono';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import { Directory, File, Paths } from 'expo-file-system';
import { SECTIONS, STEPS, TOOLS, defaults } from './src/tools';
import { pageInfo, zip } from './src/pdf';

// Paper, ink and one red pencil.
const C = {
  paper: '#F3EFE6', card: '#FBF9F4', ink: '#171614', sub: '#6E685E',
  line: '#DED7C9', red: '#CF4A2C', redSoft: '#F4DDD3', inkSub: '#B8B1A4',
};
const F = {
  serif: 'Fraunces_600SemiBold', italic: 'Fraunces_400Regular_Italic', sans: 'IBMPlexSans_400Regular',
  med: 'IBMPlexSans_500Medium', bold: 'IBMPlexSans_600SemiBold', mono: 'IBMPlexMono_500Medium',
};

const pad = (n) => String(n).padStart(2, '0');
const fmt = (b) => (b == null ? '' : b < 1024 ? `${b} B` : b < 1048576 ? `${Math.round(b / 1024)} KB` : `${(b / 1048576).toFixed(1)} MB`);
const swap = (arr, a, b) => {
  if (b < 0 || b >= arr.length) return arr;
  const o = [...arr];
  [o[a], o[b]] = [o[b], o[a]];
  return o;
};

function save(name, bytes) {
  const outDir = new Directory(Paths.cache, 'output');
  if (!outDir.exists) outDir.create();
  const f = new File(outDir, name.replace(/[\\/:*?"<>|]+/g, '_'));
  f.create({ overwrite: true });
  f.write(bytes);
  return { name: f.name, uri: f.uri, size: bytes.length, bytes };
}
const share = (r) =>
  Sharing.shareAsync(r.uri, r.name.endsWith('.zip')
    ? { mimeType: 'application/zip', UTI: 'public.zip-archive' }
    : { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });

export default function App() {
  const [loaded] = useFonts({
    Fraunces_600SemiBold, Fraunces_400Regular_Italic, IBMPlexSans_400Regular,
    IBMPlexSans_500Medium, IBMPlexSans_600SemiBold, IBMPlexMono_500Medium,
  });
  const [tool, setTool] = useState(null);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (!tool) return false;
      setTool(null);
      return true;
    });
    return () => sub.remove();
  }, [tool]);

  if (!loaded) return null;
  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.root} edges={['top']}>
        <StatusBar style="dark" />
        {/* Home stays mounted so search text and scroll position survive a round trip. */}
        <View style={[s.root, tool && { display: 'none' }]}>
          <Home onOpen={setTool} />
        </View>
        {tool && <ToolScreen key={tool.id} tool={tool} onBack={() => setTool(null)} />}
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

function Home({ onOpen }) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const list = TOOLS.filter((t) => `${t.title} ${t.desc}`.toLowerCase().includes(needle));

  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <View style={s.mast}>
        <Text style={s.kicker}>PROFESSIONAL PDF TOOLS</Text>
        <Text style={s.kicker}>No. {TOOLS.length}</Text>
      </View>
      <Text style={s.h1}>
        Every PDF job,{'\n'}
        <Text style={s.h1It}>done on your phone.</Text>
      </Text>
      <Text style={s.lede}>All-in-one free PDF toolkit. No watermark, no sign-up, works offline.</Text>
      <View style={s.chips}>
        {['No watermark', 'No sign-up', 'Works offline'].map((c) => (
          <View key={c} style={s.chip}>
            <Icon name="check" size={13} color={C.red} />
            <Text style={s.chipText}>{c}</Text>
          </View>
        ))}
      </View>

      <View style={s.search}>
        <Icon name="magnify" size={20} color={C.sub} />
        <TextInput
          value={q} onChangeText={setQ} placeholder="Search tools" placeholderTextColor={C.sub}
          style={s.searchInput} returnKeyType="search" autoCorrect={false}
        />
        {!!q && <Icon name="close" size={18} color={C.sub} onPress={() => setQ('')} />}
      </View>

      {SECTIONS.map((name, si) => {
        const items = list.filter((t) => t.section === si);
        if (!items.length) return null;
        return (
          <View key={name} style={s.section}>
            <View style={s.sectionHead}>
              <Text style={s.sectionNum}>{pad(si + 1)}</Text>
              <Text style={s.h2}>{name}</Text>
              <Text style={s.sectionCount}>{items.length} tools</Text>
            </View>
            {si === 0
              ? items.map((t, i) => <Feature key={t.id} tool={t} dark={i === 0} onPress={() => onOpen(t)} />)
              : (
                <View style={s.sheet}>
                  {items.map((t, i) => <Row key={t.id} tool={t} first={i === 0} onPress={() => onOpen(t)} />)}
                </View>
              )}
          </View>
        );
      })}
      {!list.length && <Text style={s.empty}>No tool matches “{q}”.</Text>}
      <Text style={s.footer}>FILES ARE PROCESSED ON THIS DEVICE · NEVER UPLOADED</Text>
    </ScrollView>
  );
}

function Feature({ tool, dark, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.feature, dark && s.featureDark, pressed && { opacity: 0.85 }]}>
      <View style={s.featureTop}>
        <View style={[s.featureIcon, !dark && { backgroundColor: C.ink }]}>
          <Icon name={tool.icon} size={22} color={C.card} />
        </View>
        <Icon name="arrow-right" size={22} color={dark ? C.card : C.ink} />
      </View>
      <Text style={[s.featureTitle, dark && { color: C.card }]}>{tool.title}</Text>
      <Text style={[s.featureDesc, dark && { color: C.inkSub }]}>{tool.desc}</Text>
    </Pressable>
  );
}

function Row({ tool, first, onPress }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [s.row, first && { borderTopWidth: 0 }, pressed && { backgroundColor: C.paper }]}>
      <View style={s.tile}><Icon name={tool.icon} size={21} color={C.ink} /></View>
      <View style={{ flex: 1 }}>
        <Text style={s.rowTitle}>{tool.title}</Text>
        <Text style={s.rowDesc} numberOfLines={2}>{tool.desc}</Text>
      </View>
      <Icon name="chevron-right" size={20} color={C.sub} />
    </Pressable>
  );
}

const EDITORS = { organize: OrganizeEditor, workflow: WorkflowEditor };

function ToolScreen({ tool, onBack }) {
  const [files, setFiles] = useState([]);
  const [opts, setOpts] = useState(() => defaults(tool.opts));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [results, setResults] = useState([]);
  const Editor = EDITORS[tool.id];
  const multi = tool.input === 'pdfs';
  const images = tool.input === 'images';
  const ready = files.length >= (multi ? tool.min ?? 2 : 1) && !busy;

  const changeFiles = (next) => { setFiles(next); setResults([]); setError(''); };

  const pickPdf = async () => {
    const r = await DocumentPicker.getDocumentAsync({ type: 'application/pdf', multiple: multi, copyToCacheDirectory: true });
    if (r.canceled) return;
    const picked = r.assets.map((a) => ({ name: a.name, uri: a.uri, size: a.size }));
    changeFiles(multi ? [...files, ...picked] : picked.slice(0, 1));
  };

  const addPhotos = async (camera) => {
    if (camera && !(await ImagePicker.requestCameraPermissionsAsync()).granted) {
      setError('Camera access is needed to scan. Enable it in Settings.');
      return;
    }
    const o = { mediaTypes: ['images'], quality: 0.8, allowsMultipleSelection: !camera };
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
      const inputs = await Promise.all(files.map(async (f) => ({ name: f.name, bytes: await new File(f.uri).bytes() })));
      const outs = await tool.run(images ? inputs.map((i) => i.bytes) : inputs, opts);
      const base = images ? `Scan ${new Date().toISOString().slice(0, 16).replace('T', ' ').replace(':', '.')}` : files[0].name.replace(/\.pdf$/i, '');
      setResults(outs.map((o) => save(`${base}${o.name ? `-${o.name}` : ''}.${o.ext || 'pdf'}`, o.bytes)));
    } catch (e) {
      setError(e?.message || String(e));
    }
    setBusy(false);
  };

  const shareAll = () => share(save(`${files[0].name.replace(/\.pdf$/i, '')}-all.zip`, zip(results)));
  const hasOptions = Editor || tool.opts?.length;

  return (
    <ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
      <Pressable onPress={onBack} style={s.back} hitSlop={12}>
        <Icon name="arrow-left" size={20} color={C.ink} />
        <Text style={s.backText}>All tools</Text>
      </Pressable>
      <View style={s.bigTile}><Icon name={tool.icon} size={28} color={C.red} /></View>
      <Text style={s.toolTitle}>{tool.title}</Text>
      <Text style={s.lede}>{tool.desc}</Text>

      <StepHead n={1} title={images ? 'Capture pages' : multi ? 'Choose PDFs' : 'Choose a PDF'} />
      {images ? (
        <>
          <View style={s.twoBtns}>
            <Btn icon="camera-outline" label="Camera" dark onPress={() => addPhotos(true)} />
            <Btn icon="image-multiple-outline" label="Gallery" onPress={() => addPhotos(false)} />
          </View>
          <View style={s.thumbs}>
            {files.map((f, i) => (
              <View key={f.uri} style={s.thumb}>
                <Image source={{ uri: f.uri }} style={StyleSheet.absoluteFill} />
                <Text style={s.thumbNum}>{pad(i + 1)}</Text>
                <Pressable style={s.thumbX} hitSlop={8} onPress={() => changeFiles(files.filter((x) => x !== f))}>
                  <Icon name="close" size={14} color={C.ink} />
                </Pressable>
              </View>
            ))}
          </View>
        </>
      ) : (
        <>
          {files.map((f, i) => (
            <View key={f.uri} style={s.fileRow}>
              <Icon name="file-pdf-box" size={26} color={C.red} />
              <View style={{ flex: 1 }}>
                <Text style={s.fileName} numberOfLines={1}>{f.name}</Text>
                <Text style={s.fileMeta}>{fmt(f.size)}</Text>
              </View>
              {multi && files.length > 1 && (
                <>
                  <IconBtn name="arrow-up" onPress={() => changeFiles(swap(files, i, i - 1))} />
                  <IconBtn name="arrow-down" onPress={() => changeFiles(swap(files, i, i + 1))} />
                </>
              )}
              <IconBtn name="close" onPress={() => changeFiles(files.filter((x) => x !== f))} />
            </View>
          ))}
          {(multi || !files.length) && (
            <Pressable onPress={pickPdf} style={({ pressed }) => [s.drop, pressed && { backgroundColor: C.paper }]}>
              <Icon name="file-upload-outline" size={28} color={C.ink} />
              <Text style={s.dropTitle}>{files.length ? 'Add more PDFs' : multi ? 'Select PDF files' : 'Select a PDF file'}</Text>
              <Text style={s.dropSub}>{multi ? `Pick ${tool.min ?? 2} or more · reorder with the arrows` : 'From Files, Drive, Downloads…'}</Text>
            </Pressable>
          )}
        </>
      )}

      {hasOptions && (
        <>
          <StepHead n={2} title={tool.id === 'organize' ? 'Arrange pages' : tool.id === 'workflow' ? 'Build your chain' : 'Options'} />
          {Editor
            ? <Editor file={files[0]} value={opts} onChange={setOpts} onError={setError} />
            : <Options defs={tool.opts} value={opts} onChange={setOpts} />}
        </>
      )}

      <Pressable disabled={!ready} onPress={run} style={({ pressed }) => [s.cta, !ready && s.ctaOff, pressed && { opacity: 0.85 }]}>
        {busy ? <ActivityIndicator color={C.card} /> : (
          <>
            <Text style={s.ctaText}>{tool.cta}</Text>
            <Icon name="arrow-right" size={20} color={C.card} />
          </>
        )}
      </Pressable>

      {!!error && (
        <View style={s.error}>
          <Icon name="alert-circle-outline" size={18} color={C.red} />
          <Text style={s.errorText}>{error}</Text>
        </View>
      )}

      {results.length > 0 && (
        <>
          <StepHead n="✓" title={results.length > 1 ? `${results.length} files ready` : 'Ready'} />
          {results.map((r) => (
            <View key={r.uri} style={s.fileRow}>
              <Icon name="check-circle-outline" size={24} color={C.red} />
              <View style={{ flex: 1 }}>
                <Text style={s.fileName} numberOfLines={1}>{r.name}</Text>
                <Text style={s.fileMeta}>
                  {results.length === 1 && files.length === 1 && files[0].size ? `${fmt(files[0].size)} → ` : ''}{fmt(r.size)}
                </Text>
              </View>
              <Pressable onPress={() => share(r)} style={s.shareBtn}>
                <Icon name="share-variant-outline" size={15} color={C.card} />
                <Text style={s.shareText}>Share</Text>
              </Pressable>
            </View>
          ))}
          {results.length > 1 && <Btn icon="folder-zip-outline" label="Share all as ZIP" onPress={shareAll} />}
        </>
      )}
    </ScrollView>
  );
}

function OrganizeEditor({ file, value, onChange, onError }) {
  const [pages, setPages] = useState(null);
  const order = value.order || [];
  const set = (o) => onChange({ order: o });

  useEffect(() => {
    if (!file) return;
    setPages(null);
    new File(file.uri).bytes().then(pageInfo)
      .then((info) => { setPages(info); set(info.map((_, i) => ({ i, rot: 0 }))); })
      .catch((e) => onError(e.message));
  }, [file?.uri]);

  if (!file) return <Text style={s.hint}>Choose a PDF to see its pages here.</Text>;
  if (!pages) return <ActivityIndicator color={C.ink} style={{ marginVertical: 24 }} />;

  return (
    <>
      <View style={s.orgBar}>
        <Text style={s.hint}>{order.length} of {pages.length} pages kept</Text>
        <Pressable onPress={() => set(pages.map((_, i) => ({ i, rot: 0 })))} hitSlop={8}>
          <Text style={s.link}>Reset</Text>
        </Pressable>
      </View>
      <View style={s.grid}>
        {order.map((o, k) => {
          const p = pages[o.i];
          const turned = ((p.rot + o.rot) / 90) % 2 === 1;
          const aspect = turned ? p.height / p.width : p.width / p.height;
          return (
            <View key={`${o.i}-${k}`} style={s.pageCell}>
              <View style={s.pageArea}>
                <View style={[s.pageBox, aspect > 0.8 ? { width: '88%' } : { height: '100%' }, { aspectRatio: aspect }]}>
                  <Text style={s.pageNum}>{o.i + 1}</Text>
                  {o.rot > 0 && <Text style={s.pageRot}>{o.rot}°</Text>}
                </View>
              </View>
              <View style={s.pageTools}>
                <IconBtn name="arrow-left" size={17} onPress={() => set(swap(order, k, k - 1))} />
                <IconBtn name="rotate-right" size={17} onPress={() => set(order.map((x, j) => (j === k ? { ...x, rot: (x.rot + 90) % 360 } : x)))} />
                <IconBtn name="delete-outline" size={17} onPress={() => set(order.filter((_, j) => j !== k))} />
                <IconBtn name="arrow-right" size={17} onPress={() => set(swap(order, k, k + 1))} />
              </View>
            </View>
          );
        })}
      </View>
    </>
  );
}

function WorkflowEditor({ value, onChange }) {
  const steps = value.steps || [];
  const set = (next) => onChange({ ...value, steps: next });
  return (
    <>
      {steps.map((st, k) => (
        <View key={st.id} style={s.stepCard}>
          <View style={s.stepCardHead}>
            <Text style={s.stepNum}>{pad(k + 1)}</Text>
            <Text style={s.stepCardTitle}>{STEPS[st.op].label}</Text>
            <IconBtn name="arrow-up" onPress={() => set(swap(steps, k, k - 1))} />
            <IconBtn name="arrow-down" onPress={() => set(swap(steps, k, k + 1))} />
            <IconBtn name="close" onPress={() => set(steps.filter((_, j) => j !== k))} />
          </View>
          <Options defs={STEPS[st.op].opts} value={st.opts} onChange={(o) => set(steps.map((x, j) => (j === k ? { ...x, opts: o } : x)))} />
        </View>
      ))}
      <Text style={[s.hint, { marginBottom: 10 }]}>
        {steps.length ? 'Steps run top to bottom on the same file. Add another:' : 'Add steps. They run in order on the same file:'}
      </Text>
      <View style={s.addRow}>
        {Object.entries(STEPS).map(([op, d]) => (
          <Pressable key={op} style={({ pressed }) => [s.addChip, pressed && { backgroundColor: C.card }]}
            onPress={() => set([...steps, { id: `${op}-${Math.random()}`, op, opts: defaults(d.opts) }])}>
            <Icon name="plus" size={14} color={C.ink} />
            <Text style={s.addChipText}>{d.label}</Text>
          </Pressable>
        ))}
      </View>
    </>
  );
}

function Options({ defs, value, onChange }) {
  const set = (k, v) => onChange({ ...value, [k]: v });
  return defs.filter((d) => !d.when || d.when(value)).map((d) => {
    if (d.type === 'toggle') {
      return (
        <View key={d.key} style={[s.field, s.toggleRow]}>
          <Text style={[s.label, { flex: 1, marginBottom: 0 }]}>{d.label}</Text>
          <Switch value={!!value[d.key]} onValueChange={(v) => set(d.key, v)} trackColor={{ true: C.ink, false: C.line }} thumbColor={C.card} />
        </View>
      );
    }
    return (
      <View key={d.key} style={s.field}>
        <Text style={s.label}>{d.label}</Text>
        {d.type === 'seg' ? (
          <View style={s.seg}>
            {d.choices.map(([v, label]) => {
              const on = value[d.key] === v;
              return (
                <Pressable key={v} onPress={() => set(d.key, v)} style={[s.segItem, on && s.segOn]}>
                  <Text style={[s.segText, on && { color: C.card }]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        ) : (
          <TextInput
            style={s.input} value={value[d.key]} onChangeText={(v) => set(d.key, v)} placeholder={d.placeholder}
            placeholderTextColor={C.inkSub} keyboardType={d.keyboard || 'default'} autoCorrect={false}
          />
        )}
      </View>
    );
  });
}

const StepHead = ({ n, title }) => (
  <View style={s.stepHead}>
    <Text style={s.stepNum}>{typeof n === 'number' ? pad(n) : n}</Text>
    <Text style={s.stepTitle}>{title}</Text>
    <View style={s.rule} />
  </View>
);

const IconBtn = ({ name, onPress, size = 19 }) => (
  <Pressable onPress={onPress} hitSlop={6} style={({ pressed }) => [s.iconBtn, pressed && { backgroundColor: C.line }]}>
    <Icon name={name} size={size} color={C.ink} />
  </Pressable>
);

const Btn = ({ icon, label, dark, onPress }) => (
  <Pressable onPress={onPress} style={({ pressed }) => [s.btn, dark && s.btnDark, pressed && { opacity: 0.8 }]}>
    <Icon name={icon} size={19} color={dark ? C.card : C.ink} />
    <Text style={[s.btnText, dark && { color: C.card }]}>{label}</Text>
  </Pressable>
);

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.paper },
  page: { padding: 20, paddingBottom: 56 },

  mast: { flexDirection: 'row', justifyContent: 'space-between', borderBottomWidth: 1.5, borderColor: C.ink, paddingBottom: 8, marginBottom: 22 },
  kicker: { fontFamily: F.mono, fontSize: 11, letterSpacing: 1.4, color: C.ink },
  h1: { fontFamily: F.serif, fontSize: 38, lineHeight: 43, letterSpacing: -0.8, color: C.ink },
  h1It: { fontFamily: F.italic, color: C.red },
  lede: { fontFamily: F.sans, fontSize: 15, lineHeight: 22, color: C.sub, marginTop: 10 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 16 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, borderRadius: 99, paddingHorizontal: 11, paddingVertical: 5 },
  chipText: { fontFamily: F.med, fontSize: 12.5, color: C.ink },
  search: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 24, height: 50, paddingHorizontal: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, borderRadius: 14 },
  searchInput: { flex: 1, fontFamily: F.sans, fontSize: 15, color: C.ink, paddingVertical: 0 },

  section: { marginTop: 34 },
  sectionHead: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 12 },
  sectionNum: { fontFamily: F.mono, fontSize: 12, color: C.red },
  h2: { fontFamily: F.serif, fontSize: 23, color: C.ink, flex: 1, letterSpacing: -0.3 },
  sectionCount: { fontFamily: F.mono, fontSize: 11, color: C.sub },

  feature: { padding: 18, borderRadius: 20, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, marginBottom: 12 },
  featureDark: { backgroundColor: C.ink, borderColor: C.ink },
  featureTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 26 },
  featureIcon: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.red, alignItems: 'center', justifyContent: 'center' },
  featureTitle: { fontFamily: F.serif, fontSize: 25, letterSpacing: -0.4, color: C.ink },
  featureDesc: { fontFamily: F.sans, fontSize: 14, lineHeight: 20, color: C.sub, marginTop: 6 },

  sheet: { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.line, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 16, paddingVertical: 14, borderTopWidth: 1, borderColor: C.line },
  tile: { width: 42, height: 42, borderRadius: 11, borderWidth: 1, borderColor: C.line, backgroundColor: C.paper, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontFamily: F.med, fontSize: 15.5, color: C.ink },
  rowDesc: { fontFamily: F.sans, fontSize: 13, lineHeight: 18, color: C.sub, marginTop: 2 },
  empty: { fontFamily: F.italic, fontSize: 18, color: C.sub, textAlign: 'center', marginTop: 40 },
  footer: { fontFamily: F.mono, fontSize: 10.5, letterSpacing: 1, color: C.sub, textAlign: 'center', marginTop: 40 },

  back: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: 22 },
  backText: { fontFamily: F.med, fontSize: 14, color: C.ink },
  bigTile: { width: 58, height: 58, borderRadius: 16, backgroundColor: C.redSoft, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  toolTitle: { fontFamily: F.serif, fontSize: 32, lineHeight: 37, letterSpacing: -0.6, color: C.ink },

  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 30, marginBottom: 14 },
  stepNum: { fontFamily: F.mono, fontSize: 12, color: C.red },
  stepTitle: { fontFamily: F.serif, fontSize: 19, color: C.ink },
  rule: { flex: 1, height: 1, backgroundColor: C.line },

  drop: { alignItems: 'center', padding: 24, borderRadius: 18, borderWidth: 1.5, borderStyle: 'dashed', borderColor: '#BDB4A3', backgroundColor: C.card },
  dropTitle: { fontFamily: F.bold, fontSize: 15, color: C.ink, marginTop: 8 },
  dropSub: { fontFamily: F.sans, fontSize: 12.5, color: C.sub, marginTop: 3 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, marginBottom: 8, borderRadius: 14, borderWidth: 1, borderColor: C.line, backgroundColor: C.card },
  fileName: { fontFamily: F.med, fontSize: 14, color: C.ink },
  fileMeta: { fontFamily: F.mono, fontSize: 11, color: C.sub, marginTop: 2 },
  iconBtn: { padding: 6, borderRadius: 8 },

  twoBtns: { flexDirection: 'row', gap: 10 },
  btn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, height: 50, borderRadius: 14, borderWidth: 1, borderColor: C.ink, marginTop: 4 },
  btnDark: { backgroundColor: C.ink },
  btnText: { fontFamily: F.bold, fontSize: 14.5, color: C.ink },
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 14 },
  thumb: { width: '31%', aspectRatio: 0.75, borderRadius: 10, overflow: 'hidden', backgroundColor: C.line },
  thumbNum: { position: 'absolute', left: 6, top: 6, fontFamily: F.mono, fontSize: 10, color: C.card, backgroundColor: C.ink, paddingHorizontal: 5, borderRadius: 4, overflow: 'hidden' },
  thumbX: { position: 'absolute', right: 5, top: 5, backgroundColor: C.card, borderRadius: 12, padding: 3 },

  field: { marginBottom: 18 },
  label: { fontFamily: F.med, fontSize: 13.5, color: C.ink, marginBottom: 8 },
  toggleRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  seg: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  segItem: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: C.line, backgroundColor: C.card },
  segOn: { backgroundColor: C.ink, borderColor: C.ink },
  segText: { fontFamily: F.med, fontSize: 13.5, color: C.ink },
  input: { height: 48, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.card, fontFamily: F.sans, fontSize: 15, color: C.ink },
  hint: { fontFamily: F.sans, fontSize: 13.5, lineHeight: 19, color: C.sub },
  link: { fontFamily: F.med, fontSize: 13.5, color: C.red },

  cta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, height: 58, marginTop: 30, borderRadius: 18, backgroundColor: C.ink },
  ctaOff: { opacity: 0.3 },
  ctaText: { fontFamily: F.bold, fontSize: 16, color: C.card },
  error: { flexDirection: 'row', gap: 8, marginTop: 14, padding: 12, borderRadius: 12, backgroundColor: C.redSoft },
  errorText: { flex: 1, fontFamily: F.sans, fontSize: 14, lineHeight: 19, color: '#7F2714' },
  shareBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 13, paddingVertical: 8, borderRadius: 99, backgroundColor: C.ink },
  shareText: { fontFamily: F.med, fontSize: 13, color: C.card },

  orgBar: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 12 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  pageCell: { width: '31%', padding: 6, borderRadius: 12, borderWidth: 1, borderColor: C.line, backgroundColor: C.card },
  pageArea: { height: 110, alignItems: 'center', justifyContent: 'center' },
  pageBox: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: C.line, borderRadius: 3 },
  pageNum: { fontFamily: F.serif, fontSize: 22, color: C.ink },
  pageRot: { position: 'absolute', bottom: 3, fontFamily: F.mono, fontSize: 9.5, color: C.red },
  pageTools: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },

  stepCard: { padding: 14, paddingBottom: 0, marginBottom: 10, borderRadius: 16, borderWidth: 1, borderColor: C.line, backgroundColor: C.card },
  stepCardHead: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 },
  stepCardTitle: { flex: 1, fontFamily: F.bold, fontSize: 15, color: C.ink, marginLeft: 6 },
  addRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  addChip: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 99, borderWidth: 1, borderStyle: 'dashed', borderColor: C.ink },
  addChipText: { fontFamily: F.med, fontSize: 13, color: C.ink },
});
