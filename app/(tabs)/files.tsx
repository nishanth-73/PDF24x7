import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  createFolder, listFiles, listFolders, moveFile, moveFileToRoot, openFile, removeFile, removeFolder, renameFolder, share,
  type Folder, type Saved,
} from '../../src/storage';
import { DocGlyph, FolderGlyph, ToolArt, kindOf } from '../../src/art';
import { Button, Chip, Group, GroupLabel, Icon, IconBtn, LargeTitle, Row, Screen, fmtDate, fmtSize, plural } from '../../src/ui';
import { fonts, makeStyles, radius, typo, useTheme } from '../../src/theme';

type Filter = 'all' | 'pdf' | 'zip' | 'recent';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pdf', label: 'PDF' },
  { key: 'zip', label: 'ZIP' },
  { key: 'recent', label: 'Recent' },
];
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

function applyFilter(files: Saved[], filter: Filter): Saved[] {
  if (filter === 'pdf') return files.filter((f) => f.name.toLowerCase().endsWith('.pdf'));
  if (filter === 'zip') return files.filter((f) => f.name.toLowerCase().endsWith('.zip'));
  if (filter === 'recent') return files.filter((f) => Date.now() - f.modified < SEVEN_DAYS);
  return files;
}

function applySearch(files: Saved[], query: string): Saved[] {
  if (!query) return files;
  const q = query.toLowerCase();
  return files.filter((f) => f.name.toLowerCase().includes(q));
}

export default function FilesTab() {
  const s = useStyles();
  const { c } = useTheme();
  const [folders, setFolders] = useState<Folder[]>([]);
  const [files, setFiles] = useState<Saved[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [currentFolder, setCurrentFolder] = useState<Folder | null>(null);

  const refresh = useCallback(() => {
    setFolders(currentFolder ? [] : listFolders());
    setFiles(listFiles(currentFolder?.uri));
  }, [currentFolder]);
  useFocusEffect(refresh);

  const needle = query.trim();
  const filtered = applySearch(applyFilter(files, filter), needle);
  const total = filtered.reduce((sum, f) => sum + f.size, 0);

  const enterFolder = (f: Folder) => { setCurrentFolder(f); setQuery(''); setFilter('all'); };
  const goBack = () => { setCurrentFolder(null); setQuery(''); setFilter('all'); };

  // ── Folder actions ──────────────────────────────────────────────────

  const promptNewFolder = () =>
    Alert.prompt('New Folder', 'Enter a name for this folder.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Create', onPress: (name) => { if (name?.trim()) { createFolder(name.trim()); refresh(); } } },
    ], 'plain-text');

  const promptRename = (f: Folder) =>
    Alert.prompt('Rename Folder', undefined, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Rename', onPress: (name) => { if (name?.trim()) { renameFolder(f.uri, name.trim()); refresh(); } } },
    ], 'plain-text', f.name);

  const confirmDeleteFolder = (f: Folder) =>
    Alert.alert('Delete folder?', `"${f.name}" and all files inside it will be deleted.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { removeFolder(f.uri); refresh(); } },
    ]);

  const confirmDelete = (f: Saved) =>
    Alert.alert('Delete this file?', `${f.name} will be removed from this phone. Copies you already shared are not affected.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { removeFile(f.uri); refresh(); } },
    ]);

  // ── Move-to-folder picker ──────────────────────────────────────────

  const promptMoveToFolder = (file: Saved) => {
    const allFolders = listFolders();
    if (!allFolders.length && !currentFolder) {
      Alert.alert('No folders', 'Create a folder first, then move files into it.');
      return;
    }
    const buttons = allFolders
      .filter((f) => f.uri !== currentFolder?.uri)
      .map((f) => ({ text: f.name, onPress: () => { moveFile(file.uri, f.uri); refresh(); } }));
    if (currentFolder) buttons.unshift({ text: '← Root (no folder)', onPress: () => { moveFileToRoot(file.uri); refresh(); } });
    buttons.push({ text: 'Cancel', onPress: () => {} });
    Alert.alert('Move to folder', file.name, buttons);
  };

  // ── Render ─────────────────────────────────────────────────────────

  const hasContent = folders.length > 0 || filtered.length > 0;
  const totalCount = folders.length + filtered.length;
  const subtitle = currentFolder
    ? `${plural(filtered.length, 'file')} · ${fmtSize(total)}`
    : totalCount ? `${plural(totalCount, 'item')} · ${fmtSize(total)} on this phone` : undefined;

  return (
    <Screen>
      {/* Header */}
      {currentFolder ? (
        <View style={s.breadcrumb}>
          <Pressable onPress={goBack} style={s.backBtn} hitSlop={8}>
            <Icon name="arrow-left" size={20} color={c.ink} />
            <Text style={s.backText}>Files</Text>
          </Pressable>
          <LargeTitle title={currentFolder.name} sub={subtitle} />
        </View>
      ) : (
        <LargeTitle title="Files" sub={subtitle} />
      )}

      {/* Search bar */}
      <View style={s.search}>
        <Icon name="magnify" size={20} color={c.sub} />
        <TextInput
          value={query} onChangeText={setQuery} placeholder="Search files…" placeholderTextColor={c.faint}
          style={s.searchInput} returnKeyType="search" autoCorrect={false}
        />
        {!!query && <IconBtn name="close-circle" size={18} color={c.faint} onPress={() => setQuery('')} />}
      </View>

      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </ScrollView>

      {hasContent ? (
        <>
          {/* Folders (only at root level, not shown when inside a folder) */}
          {!currentFolder && folders.length > 0 && (
            <>
              <GroupLabel label="Folders" />
              <Group>
                {folders.map((f, i) => (
                  <Row
                    key={f.uri} first={i === 0} lead={<FolderGlyph />} title={f.name}
                    subtitle={`${plural(listFiles(f.uri).length, 'file')}`} onPress={() => enterFolder(f)}
                    chevron
                  >
                    <IconBtn name="pencil-outline" size={16} color={c.sub} onPress={() => promptRename(f)} />
                    <IconBtn name="delete-outline" size={16} color={c.sub} onPress={() => confirmDeleteFolder(f)} />
                  </Row>
                ))}
                <Row first={false} lead={<Icon name="folder-plus-outline" size={28} color={c.accent} />} title="New Folder" onPress={promptNewFolder} />
              </Group>
            </>
          )}

          {/* Files */}
          {filtered.length > 0 && (
            <>
              {!currentFolder && folders.length > 0 && <GroupLabel label="Files" />}
              <Group>
                {filtered.map((f, i) => (
                  <Row
                    key={f.uri} first={i === 0} lead={<DocGlyph kind={kindOf(f.name)} />} title={f.name}
                    subtitle={`${fmtSize(f.size)} · ${fmtDate(f.modified)}`} onPress={() => openFile(f)}
                  >
                    <IconBtn name="folder-move-outline" size={18} color={c.sub} onPress={() => promptMoveToFolder(f)} />
                    <IconBtn name="share-variant-outline" onPress={() => share(f)} />
                    <IconBtn name="delete-outline" onPress={() => confirmDelete(f)} />
                  </Row>
                ))}
              </Group>
            </>
          )}

          {/* "New folder" when no folders exist yet */}
          {!currentFolder && folders.length === 0 && (
            <>
              <GroupLabel label="Organize" />
              <Group>
                <Row first lead={<Icon name="folder-plus-outline" size={28} color={c.accent} />} title="New Folder" subtitle="Group your files into folders" onPress={promptNewFolder} />
              </Group>
            </>
          )}
        </>
      ) : files.length === 0 && !needle ? (
        <View style={s.empty}>
          <ToolArt id="files" size={112} />
          <Text style={s.emptyTitle}>No files yet</Text>
          <Text style={s.emptyBody}>
            PDFs you merge, split, compress or scan are saved here, so you can share them again later.
          </Text>
          <View style={s.actions}>
            <Button icon="camera-outline" label="Scan a document" onPress={() => router.navigate('/scan')} />
            <Button label="Browse tools" variant="secondary" onPress={() => router.navigate('/')} />
          </View>
        </View>
      ) : (
        <Text style={s.none}>No files match "{needle || filter}".</Text>
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
  chips: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 4, paddingHorizontal: 2 },
  breadcrumb: { marginBottom: -10 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 2 },
  backText: { fontFamily: fonts.med, fontSize: 15, color: c.ink },
  empty: { alignItems: 'center', paddingTop: 36, paddingHorizontal: 12 },
  emptyTitle: { ...typo.title, fontSize: 23, color: c.ink, marginTop: 14 },
  emptyBody: { ...typo.body, color: c.sub, textAlign: 'center', marginTop: 6 },
  actions: { alignSelf: 'stretch', gap: 10, marginTop: 24 },
  none: { ...typo.body, color: c.sub, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
}));
