import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  createFolder, listAllFiles, listFiles, listFolders, moveFile, moveFileToRoot, openFile, removeFile, removeFolder, renameFolder, share,
  type Folder, type Saved,
} from '../../src/storage';
import { DocGlyph, FolderGlyph, ToolArt, kindOf } from '../../src/art';
import {
  Button, Chip, ConfirmModal, DialogModal, Group, GroupLabel, Icon, IconBtn, LargeTitle, PromptModal, Row, Screen,
  fmtDate, fmtSize, plural,
} from '../../src/ui';
import { fonts, makeStyles, radius, typo, useTheme } from '../../src/theme';
import { listDocs } from '../../src/scan/model';

type Filter = 'all' | 'pdf' | 'zip' | 'recent';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pdf', label: 'PDF' },
  { key: 'zip', label: 'ZIP' },
  { key: 'recent', label: 'Recent' },
];
const SEVEN_DAYS = 7 * 24 * 60 * 60 * 1000;

type FolderWithCount = Folder & { fileCount: number };

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
  const [folders, setFolders] = useState<FolderWithCount[]>([]);
  const [allFolders, setAllFolders] = useState<FolderWithCount[]>([]);
  const [files, setFiles] = useState<Saved[]>([]);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [currentFolder, setCurrentFolder] = useState<Folder | null>(null);

  // Modal states
  const [promptConfig, setPromptConfig] = useState<{
    visible: boolean;
    title: string;
    subtitle?: string;
    placeholder?: string;
    initialValue?: string;
    submitLabel: string;
    onSubmit: (val: string) => void;
  } | null>(null);

  const [confirmConfig, setConfirmConfig] = useState<{
    visible: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    danger?: boolean;
    onConfirm: () => void;
  } | null>(null);

  const [movingFile, setMovingFile] = useState<Saved | null>(null);

  const [allFiles, setAllFiles] = useState<Saved[]>([]);
  const [scans, setScans] = useState<Map<string, string>>(new Map()); // PDF name -> scan id, for "Edit scan"

  const refresh = useCallback(() => {
    const loadedFolders = listFolders().map((f) => ({
      ...f,
      fileCount: listFiles(f.uri).length,
    }));
    setAllFolders(loadedFolders);
    setFolders(currentFolder ? [] : loadedFolders);
    setFiles(listFiles(currentFolder?.uri));
    setAllFiles(listAllFiles());
    setScans(new Map(listDocs().flatMap((d) => (d.pdf ? [[d.pdf.name, d.id] as [string, string]] : []))));
  }, [currentFolder]);
  useFocusEffect(refresh);

  const goBack = useCallback(() => {
    setCurrentFolder(null);
    setQuery('');
    setFilter('all');
  }, []);

  const enterFolder = (f: Folder) => {
    setCurrentFolder(f);
    setQuery('');
    setFilter('all');
  };

  // Intercept Android hardware back button when inside a folder so it returns to root Files screen
  useEffect(() => {
    if (!currentFolder) return;
    const backAction = () => {
      goBack();
      return true; // handled!
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [currentFolder, goBack]);

  const needle = query.trim();
  const filtered = applySearch(applyFilter(files, filter), needle);

  // Accurate size and subtitle computation (no more "0 B" for empty folders)
  const totalAllBytes = allFiles.reduce((sum, f) => sum + f.size, 0);
  const filteredBytes = filtered.reduce((sum, f) => sum + f.size, 0);

  let subtitle: string | undefined;
  if (currentFolder) {
    if (needle || filter !== 'all') {
      subtitle = filtered.length > 0
        ? `${plural(filtered.length, 'file')} · ${fmtSize(filteredBytes)}`
        : 'No matching files';
    } else {
      subtitle = files.length > 0
        ? `${plural(files.length, 'file')} · ${fmtSize(filteredBytes)}`
        : 'Empty folder';
    }
  } else {
    // Root level
    if (needle || filter !== 'all') {
      subtitle = filtered.length > 0
        ? `${plural(filtered.length, 'file')} · ${fmtSize(filteredBytes)}`
        : 'No matching files';
    } else {
      if (allFiles.length > 0) {
        subtitle = folders.length > 0
          ? `${plural(allFiles.length, 'file')} across ${plural(folders.length, 'folder')} · ${fmtSize(totalAllBytes)} on this phone`
          : `${plural(allFiles.length, 'file')} · ${fmtSize(totalAllBytes)} on this phone`;
      } else if (folders.length > 0) {
        subtitle = `${plural(folders.length, 'folder')}`;
      } else {
        subtitle = undefined;
      }
    }
  }

  const hasContent = folders.length > 0 || filtered.length > 0;

  // ── Folder modal actions ────────────────────────────────────────────

  const openNewFolderModal = () => {
    setPromptConfig({
      visible: true,
      title: 'New Folder',
      subtitle: 'Enter a name for this folder',
      placeholder: 'Folder name',
      initialValue: '',
      submitLabel: 'Create',
      onSubmit: (name) => {
        createFolder(name);
        refresh();
      },
    });
  };

  const openRenameFolderModal = (f: FolderWithCount) => {
    setPromptConfig({
      visible: true,
      title: 'Rename Folder',
      subtitle: `Rename "${f.name}"`,
      placeholder: 'Folder name',
      initialValue: f.name,
      submitLabel: 'Save',
      onSubmit: (newName) => {
        renameFolder(f.uri, newName);
        refresh();
      },
    });
  };

  const openDeleteFolderModal = (f: FolderWithCount) => {
    const count = f.fileCount;
    setConfirmConfig({
      visible: true,
      title: 'Delete folder?',
      message: `"${f.name}" and ${count === 0 ? 'any files inside' : `${plural(count, 'file')} inside`} will be permanently deleted.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => {
        removeFolder(f.uri);
        refresh();
      },
    });
  };

  const openDeleteFileModal = (f: Saved) => {
    setConfirmConfig({
      visible: true,
      title: 'Delete this file?',
      message: `"${f.name}" will be removed from this phone. Copies you already shared are not affected.`,
      confirmLabel: 'Delete',
      danger: true,
      onConfirm: () => {
        removeFile(f.uri);
        refresh();
      },
    });
  };

  return (
    <Screen>
      {/* Header */}
      {currentFolder ? (
        <View style={s.breadcrumb}>
          <Pressable onPress={goBack} style={s.backBtn} hitSlop={8}>
            <Icon name="arrow-left" size={20} color={c.ink} />
            <Text style={s.backText}>All Files</Text>
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
              <GroupLabel label="Folders" action="+ New Folder" onAction={openNewFolderModal} />
              <Group>
                {folders.map((f, i) => (
                  <Row
                    key={f.uri} first={i === 0} lead={<FolderGlyph />} title={f.name}
                    subtitle={`${plural(f.fileCount, 'file')}`} onPress={() => enterFolder(f)}
                    chevron
                  >
                    <IconBtn name="pencil-outline" size={16} color={c.sub} onPress={() => openRenameFolderModal(f)} />
                    <IconBtn name="delete-outline" size={16} color={c.sub} onPress={() => openDeleteFolderModal(f)} />
                  </Row>
                ))}
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
                    {scans.has(f.name) && (
                      <IconBtn name="file-document-edit-outline" color={c.accent} onPress={() => router.push({ pathname: '/scanner', params: { id: scans.get(f.name)! } })} />
                    )}
                    <IconBtn name="folder-move-outline" size={18} color={c.sub} onPress={() => setMovingFile(f)} />
                    <IconBtn name="share-variant-outline" onPress={() => share(f)} />
                    <IconBtn name="delete-outline" onPress={() => openDeleteFileModal(f)} />
                  </Row>
                ))}
              </Group>
            </>
          )}

          {/* "New folder" prompt when no folders exist yet */}
          {!currentFolder && folders.length === 0 && (
            <>
              <GroupLabel label="Organize" />
              <Group>
                <Row
                  first
                  lead={<Icon name="folder-plus-outline" size={26} color={c.accent} />}
                  title="New Folder"
                  subtitle="Create a folder to organize your files"
                  onPress={openNewFolderModal}
                />
              </Group>
            </>
          )}
        </>
      ) : files.length === 0 && !needle ? (
        <View style={s.empty}>
          <ToolArt id="files" size={112} />
          <Text style={s.emptyTitle}>{currentFolder ? 'This folder is empty' : 'No files yet'}</Text>
          <Text style={s.emptyBody}>
            {currentFolder
              ? 'Move files into this folder or generate new PDFs.'
              : 'PDFs you merge, split, compress or scan are saved here, so you can share them again later.'}
          </Text>
          <View style={s.actions}>
            {currentFolder ? (
              <Button label="Back to All Files" variant="secondary" onPress={goBack} />
            ) : (
              <>
                <Button icon="folder-plus-outline" label="Create a folder" onPress={openNewFolderModal} />
                <Button icon="camera-outline" label="Scan a document" variant="secondary" onPress={() => router.navigate('/scan')} />
                <Button label="Browse tools" variant="secondary" onPress={() => router.navigate('/')} />
              </>
            )}
          </View>
        </View>
      ) : (
        <Text style={s.none}>No files match "{needle || filter}".</Text>
      )}

      {/* ── Prompt Modal (New Folder / Rename Folder) ── */}
      {promptConfig && (
        <PromptModal
          visible={promptConfig.visible}
          title={promptConfig.title}
          subtitle={promptConfig.subtitle}
          placeholder={promptConfig.placeholder}
          initialValue={promptConfig.initialValue}
          submitLabel={promptConfig.submitLabel}
          onSubmit={promptConfig.onSubmit}
          onClose={() => setPromptConfig(null)}
        />
      )}

      {/* ── Confirm Modal (Delete Folder / Delete File) ── */}
      {confirmConfig && (
        <ConfirmModal
          visible={confirmConfig.visible}
          title={confirmConfig.title}
          message={confirmConfig.message}
          confirmLabel={confirmConfig.confirmLabel}
          danger={confirmConfig.danger}
          onConfirm={confirmConfig.onConfirm}
          onClose={() => setConfirmConfig(null)}
        />
      )}

      {/* ── Move File Modal ── */}
      {movingFile && (
        <DialogModal
          visible={!!movingFile}
          onClose={() => setMovingFile(null)}
          title="Move File"
          subtitle={movingFile.name}
        >
          <View style={{ marginTop: 12, marginBottom: 16 }}>
            {currentFolder && (
              <Pressable
                onPress={() => {
                  moveFileToRoot(movingFile.uri);
                  setMovingFile(null);
                  refresh();
                }}
                style={({ pressed }) => [s.moveOption, pressed && { backgroundColor: c.sunken }]}
              >
                <Icon name="home-outline" size={24} color={c.accent} />
                <View style={{ flex: 1 }}>
                  <Text style={s.moveOptionTitle}>All Files (Root)</Text>
                  <Text style={s.moveOptionSub}>Move out of this folder</Text>
                </View>
                <Icon name="chevron-right" size={20} color={c.faint} />
              </Pressable>
            )}

            {allFolders
              .filter((f) => f.uri !== currentFolder?.uri)
              .map((f) => (
                <Pressable
                  key={f.uri}
                  onPress={() => {
                    moveFile(movingFile.uri, f.uri);
                    setMovingFile(null);
                    refresh();
                  }}
                  style={({ pressed }) => [s.moveOption, pressed && { backgroundColor: c.sunken }]}
                >
                  <FolderGlyph size={28} />
                  <View style={{ flex: 1 }}>
                    <Text style={s.moveOptionTitle}>{f.name}</Text>
                    <Text style={s.moveOptionSub}>{plural(f.fileCount, 'file')}</Text>
                  </View>
                  <Icon name="chevron-right" size={20} color={c.faint} />
                </Pressable>
              ))}

            {allFolders.filter((f) => f.uri !== currentFolder?.uri).length === 0 && !currentFolder && (
              <Text style={s.moveEmpty}>No folders exist yet. Create a folder first to organize files.</Text>
            )}
          </View>

          <Button label="Cancel" variant="secondary" onPress={() => setMovingFile(null)} />
        </DialogModal>
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
  breadcrumb: { marginBottom: 12 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 },
  backText: { fontFamily: fonts.med, fontSize: 14, color: c.sub },
  empty: { alignItems: 'center', paddingTop: 36, paddingHorizontal: 12 },
  emptyTitle: { ...typo.title, fontSize: 23, color: c.ink, marginTop: 14 },
  emptyBody: { ...typo.body, color: c.sub, textAlign: 'center', marginTop: 6 },
  actions: { alignSelf: 'stretch', gap: 10, marginTop: 24 },
  none: { ...typo.body, color: c.sub, textAlign: 'center', marginTop: 40, paddingHorizontal: 24 },
  moveOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: radius.tile,
  },
  moveOptionTitle: {
    ...typo.item,
    color: c.ink,
  },
  moveOptionSub: {
    ...typo.small,
    color: c.sub,
    marginTop: 1,
  },
  moveEmpty: {
    ...typo.small,
    color: c.sub,
    textAlign: 'center',
    paddingVertical: 16,
  },
}));
