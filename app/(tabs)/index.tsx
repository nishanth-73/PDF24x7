import { useCallback, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SECTIONS, TOOLS, type Tool } from '../../src/tools';
import { listAllFiles, openFile, share, type Saved } from '../../src/storage';
import { ArtTile, DocGlyph, ToolArt, kindOf } from '../../src/art';
import { Group, GroupLabel, Icon, IconBtn, LargeTitle, Row, Screen, fmtDate, fmtSize } from '../../src/ui';
import { fonts, makeStyles, radius, typo, useTheme } from '../../src/theme';

const open = (t: Tool) => (t.id === 'scan' ? router.navigate('/scan') : router.push(`/tool/${t.id}`));

// Tokenized search: every word in the query must appear somewhere in the target string.
// "split text" matches "Split PDF by Text", "compress pdf" matches "Compress PDF", etc.
function tokenMatch(target: string, tokens: string[]): boolean {
  const lower = target.toLowerCase();
  return tokens.every((t) => lower.includes(t));
}

export default function Home() {
  const s = useStyles();
  const { c } = useTheme();
  const [q, setQ] = useState('');
  const [recent, setRecent] = useState<Saved[]>([]);
  const [allFiles, setAllFiles] = useState<Saved[]>([]);
  useFocusEffect(useCallback(() => {
    const loaded = listAllFiles();
    setAllFiles(loaded);
    setRecent(loaded.slice(0, 3));
  }, []));

  const needle = q.trim().toLowerCase();
  const tokens = needle ? needle.split(/\s+/).filter(Boolean) : [];

  // Search tools: tokenized (word-order-independent)
  const toolResults = tokens.length
    ? TOOLS.filter((t) => tokenMatch(`${t.title} ${t.desc}`, tokens))
    : TOOLS;

  // Search files: when query is active, match files by name from cached state
  const fileResults = tokens.length
    ? allFiles.filter((f) => tokenMatch(f.name, tokens))
    : [];

  const hasResults = toolResults.length > 0 || fileResults.length > 0;

  return (
    <Screen>
      <LargeTitle title="Tools" sub={`${TOOLS.length} tools. Everything runs on this phone.`} />

      <View style={s.search}>
        <Icon name="magnify" size={20} color={c.sub} />
        <TextInput
          value={q} onChangeText={setQ} placeholder="Merge, split, compress…" placeholderTextColor={c.faint}
          style={s.searchInput} returnKeyType="search" autoCorrect={false}
        />
        {!!q && <IconBtn name="close-circle" size={18} color={c.faint} onPress={() => setQ('')} />}
      </View>

      {!needle && (
        <Pressable onPress={() => router.navigate('/scan')} style={({ pressed }) => [s.scan, pressed && { opacity: 0.95 }]}>
          <View style={{ flex: 1 }}>
            <Text style={s.scanTitle}>Scan a document</Text>
            <Text style={s.scanSub}>Photograph pages, get one PDF. Nothing is uploaded.</Text>
            <View style={s.scanCta}>
              <Text style={s.scanCtaText}>Open camera</Text>
              <Icon name="arrow-right" size={16} color={c.onInk} />
            </View>
          </View>
          <View style={s.scanArt}><ToolArt id="scan" size={60} /></View>
        </Pressable>
      )}

      {!needle && recent.length > 0 && (
        <>
          <GroupLabel label="Recent" action="All files" onAction={() => router.navigate('/files')} />
          <Group>
            {recent.map((f, i) => (
              <Row
                key={f.uri} first={i === 0} lead={<DocGlyph kind={kindOf(f.name)} />} title={f.name}
                subtitle={`${fmtSize(f.size)} · ${fmtDate(f.modified)}`} onPress={() => openFile(f)}
              >
                <IconBtn name="share-variant-outline" size={18} color={c.sub} onPress={() => share(f)} />
              </Row>
            ))}
          </Group>
        </>
      )}

      {/* File results when searching */}
      {needle && fileResults.length > 0 && (
        <>
          <GroupLabel label="Files" action="All files" onAction={() => router.navigate('/files')} />
          <Group>
            {fileResults.slice(0, 5).map((f, i) => (
              <Row
                key={f.uri} first={i === 0} lead={<DocGlyph kind={kindOf(f.name)} />} title={f.name}
                subtitle={`${fmtSize(f.size)} · ${fmtDate(f.modified)}`} onPress={() => openFile(f)}
              >
                <IconBtn name="share-variant-outline" size={18} color={c.sub} onPress={() => share(f)} />
              </Row>
            ))}
          </Group>
        </>
      )}

      {SECTIONS.map((name, si) => {
        const items = toolResults.filter((t) => t.section === si && (needle || t.id !== 'scan'));
        if (!items.length) return null;
        return (
          <View key={name}>
            <GroupLabel label={name} />
            <Group>
              {items.map((t, i) => (
                <Row key={t.id} first={i === 0} lead={<ArtTile id={t.id} />} title={t.title} subtitle={t.desc} onPress={() => open(t)} chevron />
              ))}
            </Group>
          </View>
        );
      })}

      {!hasResults && (
        <Text style={s.none}>No tools or files match "{q.trim()}". Try "merge", "split" or "compress".</Text>
      )}
    </Screen>
  );
}

const useStyles = makeStyles((c) => ({
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingLeft: 12, paddingRight: 4,
    borderRadius: radius.control, backgroundColor: c.sunken,
  },
  searchInput: { flex: 1, fontFamily: fonts.sans, fontSize: 15.5, color: c.ink, paddingVertical: 0 },
  scan: {
    flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 16, padding: 16, paddingRight: 14,
    borderRadius: radius.card, backgroundColor: c.ink,
  },
  scanTitle: { fontFamily: fonts.display, fontSize: 20, lineHeight: 27, letterSpacing: -0.2, color: c.onInk },
  scanSub: { ...typo.small, color: c.faint, marginTop: 4 },
  scanCta: {
    flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 14,
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: radius.pill, backgroundColor: c.accent,
  },
  scanCtaText: { fontFamily: fonts.bold, fontSize: 13, color: c.onInk },
  scanArt: { width: 78, height: 78, borderRadius: radius.control, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' },
  none: { ...typo.body, color: c.sub, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
}));
