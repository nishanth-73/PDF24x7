import { useCallback, useEffect, useState } from 'react';
import { BackHandler, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import {
  createFolder, listAllFiles, listFiles, renameFile, listFolders, moveFile, moveFileToRoot, openFile, removeFile, removeFolder, renameFolder, share,
  type Folder, type Saved,
} from '../../src/storage';
import { DocGlyph, FolderGlyph, ToolArt, kindOf } from '../../src/art';
import {
  Button, Chip, ConfirmModal, DialogModal, Group, GroupLabel, Icon, IconBtn, LargeTitle, PromptModal, Row, Screen,
  byDay, fmtSize, fmtTime, plural, stem,
} from '../../src/ui';
import { fonts, makeStyles, radius, typo, useTheme } from '../../src/theme';
import { listDocs, relinkPdf } from '../../src/scan/model';
import { ExportDialog, type ExportJob } from '../../src/ExportDialog';
import { hasDriveCopies, keepInDriveOnly, onBackupChange, readBackup, syncLabel, syncNow } from '../../src/backup';
import { DriveFiles } from '../../src/DriveFiles';

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
  // Read the file system before the first render, so the tab doesn't open empty and then jump to its content.
  const [first] = useState(() => {
    const all = listFolders().map((f) => ({ ...f, fileCount: listFiles(f.uri).length }));
    return { folders: all, files: listFiles(), allFiles: listAllFiles() };
  });
  const [folders, setFolders] = useState<FolderWithCount[]>(first.folders);
  const [allFolders, setAllFolders] = useState<FolderWithCount[]>(first.folders);
  const [files, setFiles] = useState<Saved[]>(first.files);
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
  // Deleting something that also lives in Google Drive: this phone only, or phone and Drive.
  const [deleteChoice, setDeleteChoice] = useState<{ title: string; what: string; uris: string[]; remove: () => void } | null>(null);

  const [allFiles, setAllFiles] = useState<Saved[]>(first.allFiles);
  const [scans, setScans] = useState<Map<string, string>>(new Map()); // PDF name -> scan id, for "Edit scan"
  const [place, setPlace] = useState<'phone' | 'drive'>('phone');
  const [driveFolder, setDriveFolder] = useState<string | null>(null); // open folder while viewing Google Drive
  const [backup, setBackup] = useState(readBackup);
  useFocusEffect(useCallback(() => { // opening Files also pulls in changes made in Drive
    setBackup(readBackup());
    if (readBackup().enabled) syncNow();
  }, []));
  const [menu, setMenu] = useState<{ kind: 'file'; item: Saved } | { kind: 'folder'; item: FolderWithCount } | null>(null);
  // Only files still waiting to upload get a cloud: a check on every synced row was noise, and "Synced" is the normal state.
  const syncIcon = (f: Saved) =>
    syncLabel(backup, f.uri, f.name) === 'Waiting to sync' ? <Icon name="cloud-upload-outline" size={17} color={c.accent} /> : null;

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
  useEffect(() => onBackupChange((st, running) => { // show files that sync downloaded or removed
    setBackup(st);
    if (!running) refresh();
  }), [refresh]);

  const goBack = useCallback(() => {
    setCurrentFolder(null);
    setDriveFolder(null);
    setQuery('');
    setFilter('all');
  }, []);

  const enterFolder = (f: Folder) => {
    setCurrentFolder(f);
    setQuery('');
    setFilter('all');
  };

  // Intercept Android hardware back button when inside a folder so it returns to root Files screen
  const folderName = place === 'drive' ? driveFolder : currentFolder?.name ?? null;
  // Switching views keeps you in the same folder when it exists on the other side.
  const switchPlace = (next: 'phone' | 'drive') => {
    if (next === place) return;
    if (next === 'drive') setDriveFolder(currentFolder?.name ?? null);
    else setCurrentFolder(driveFolder ? allFolders.find((f) => f.name === driveFolder) ?? null : null);
    setPlace(next);
  };

  useEffect(() => {
    if (!folderName) return;
    const backAction = () => {
      goBack();
      return true; // handled!
    };
    const backHandler = BackHandler.addEventListener('hardwareBackPress', backAction);
    return () => backHandler.remove();
  }, [folderName, goBack]);

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
    const uris = listFiles(f.uri).map((x) => x.uri);
    if (hasDriveCopies(uris)) {
      setDeleteChoice({ title: 'Delete folder?', what: `"${f.name}" and ${plural(count, 'file')} inside`, uris, remove: () => removeFolder(f.uri) });
      return;
    }
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

  const [exporting, setExporting] = useState<ExportJob | null>(null);

  const openRenameFileModal = (f: Saved) => {
    setPromptConfig({
      visible: true,
      title: 'Rename File',
      subtitle: `Rename "${f.name}"`,
      placeholder: 'File name',
      initialValue: stem(f.name),
      submitLabel: 'Save',
      onSubmit: (name) => {
        const renamed = renameFile(f, name);
        relinkPdf(f.uri, renamed);
        refresh();
      },
    });
  };

  const openDeleteFileModal = (f: Saved) => {
    if (hasDriveCopies([f.uri])) {
      setDeleteChoice({ title: 'Delete this file?', what: `"${f.name}"`, uris: [f.uri], remove: () => removeFile(f.uri) });
      return;
    }
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
      {folderName ? (
        <View style={s.breadcrumb}>
          <Pressable onPress={goBack} style={s.backBtn} hitSlop={8}>
            <Icon name="arrow-left" size={20} color={c.ink} />
            <Text style={s.backText}>All Files</Text>
          </Pressable>
          <LargeTitle title={folderName} sub={place === 'drive' ? 'In Google Drive' : subtitle} />
        </View>
      ) : (
        <LargeTitle title="Files" sub={place === 'drive' ? 'Synced with Google Drive' : subtitle} />
      )}

      {/* Phone / Google Drive switch, at the top level and inside folders */}
      {(
        <View style={s.seg}>
          {([['phone', 'cellphone', 'On this phone'], ['drive', 'google-drive', 'Google Drive']] as const).map(([key, icon, label]) => {
            const on = place === key;
            return (
              <Pressable key={key} onPress={() => switchPlace(key)} style={[s.segItem, on && s.segOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                <Icon name={icon} size={17} color={on ? c.ink : c.sub} />
                <Text style={[s.segText, on && s.segTextOn]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
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

      {place === 'drive' ? (
        <DriveFiles query={query} folder={driveFolder} onOpenFolder={(name) => { setDriveFolder(name); setQuery(''); }} />
      ) : (<>
      {/* Filter chips */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chips}>
        {FILTERS.map((f) => (
          <Chip key={f.key} label={f.label} active={filter === f.key} onPress={() => setFilter(f.key)} />
        ))}
      </ScrollView>

      {hasContent ? (
        <>
          {/* Folders, with "New Folder" always first (root level only) */}
          {!currentFolder && !needle && (
            <>
              <GroupLabel label="Folders" first />
              <Group>
                <Row
                  first lead={<Icon name="folder-plus-outline" size={26} color={c.accent} />} title="New Folder"
                  onPress={openNewFolderModal}
                />
                {folders.map((f) => (
                  <Row
                    key={f.uri} lead={<FolderGlyph />} title={f.name}
                    subtitle={`${plural(f.fileCount, 'file')}`} onPress={() => enterFolder(f)}
                    onLongPress={() => setMenu({ kind: 'folder', item: f })}
                  >
                    <IconBtn name="dots-vertical" color={c.sub} onPress={() => setMenu({ kind: 'folder', item: f })} />
                  </Row>
                ))}
              </Group>
            </>
          )}

          {/* Files, one group per day, newest first */}
          {byDay(filtered).map((g, gi) => (
            <View key={g.label}>
              <GroupLabel label={g.label} first={gi === 0 && (!!currentFolder || !!needle)} />
              <Group>
                {g.items.map((f, i) => (
                  <Row
                    key={f.uri} first={i === 0} lead={<DocGlyph kind={kindOf(f.name)} />} title={stem(f.name)} marquee
                    subtitle={`${fmtSize(f.size)} · ${fmtTime(f.modified)}`} onPress={() => openFile(f)}
                    onLongPress={() => setMenu({ kind: 'file', item: f })}
                  >
                    {syncIcon(f)}
                    <IconBtn name="dots-vertical" color={c.sub} onPress={() => setMenu({ kind: 'file', item: f })} />
                  </Row>
                ))}
              </Group>
            </View>
          ))}

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
                <Button icon="camera-outline" label="Scan a document" variant="secondary" onPress={() => router.push('/scanner')} />
                <Button label="Browse tools" variant="secondary" onPress={() => router.navigate('/')} />
              </>
            )}
          </View>
        </View>
      ) : (
        <Text style={s.none}>No files match "{needle || filter}".</Text>
      )}
      </>)}

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

      {/* ── Row menu ── */}
      {menu && (
        <DialogModal visible onClose={() => setMenu(null)} title={menu.item.name}>
          <View style={{ marginTop: 8 }}>
            {(menu.kind === 'file'
              ? ([
                  ...(scans.has(menu.item.name)
                    ? [['file-document-edit-outline', 'Edit scan', () => router.push({ pathname: '/scanner', params: { id: scans.get(menu.item.name)! } })]] as const
                    : []),
                  ['share-variant-outline', 'Share', () => share(menu.item)],
                  ...(kindOf(menu.item.name) === 'pdf'
                    ? [
                        ['file-word-outline', 'Save as Word doc', () => setExporting({ pdf: menu.item as Saved, to: 'docx' })],
                        ['file-image-outline', 'Save as JPEG', () => setExporting({ pdf: menu.item as Saved, to: 'jpeg' })],
                      ] as const
                    : []),
                  ['pencil-outline', 'Rename', () => openRenameFileModal(menu.item as Saved)],
                  ['folder-move-outline', 'Move to folder', () => setMovingFile(menu.item as Saved)],
                  ['delete-outline', 'Delete', () => openDeleteFileModal(menu.item as Saved)],
                ] as const)
              : ([
                  ['pencil-outline', 'Rename', () => openRenameFolderModal(menu.item as FolderWithCount)],
                  ['delete-outline', 'Delete', () => openDeleteFolderModal(menu.item as FolderWithCount)],
                ] as const)
            ).map(([icon, label, run]) => (
              <Pressable
                key={label} onPress={() => { setMenu(null); run(); }}
                style={({ pressed }) => [s.moveOption, pressed && { backgroundColor: c.sunken }]}
              >
                <Icon name={icon} size={22} color={label === 'Delete' ? c.accent : c.ink} />
                <Text style={[s.moveOptionTitle, label === 'Delete' && { color: c.accent }]}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </DialogModal>
      )}

      <ExportDialog job={exporting} onClose={() => setExporting(null)} onSaved={refresh} />

      {/* ── Delete choice (synced with Google Drive) ── */}
      {deleteChoice && (
        <DialogModal
          visible onClose={() => setDeleteChoice(null)} title={deleteChoice.title}
          subtitle={`${deleteChoice.what} ${deleteChoice.uris.length > 1 ? 'are' : 'is'} also in your Google Drive.`}
        >
          <View style={{ gap: 10, marginTop: 18 }}>
            <Button
              icon="cellphone-remove" label="Delete from this phone only" variant="secondary"
              onPress={() => { keepInDriveOnly(deleteChoice.uris); deleteChoice.remove(); setDeleteChoice(null); refresh(); }}
            />
            <Button
              icon="delete-outline" label="Delete from phone and Drive" variant="danger"
              onPress={() => { deleteChoice.remove(); setDeleteChoice(null); refresh(); }}
            />
            <Text style={s.choiceNote}>
              Phone only keeps the Drive copy; you can download it again from Files → Google Drive. Phone and Drive moves the
              Drive copy to Drive's Trash for 30 days.
            </Text>
          </View>
        </DialogModal>
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
  seg: { flexDirection: 'row', padding: 3, borderRadius: radius.control, backgroundColor: c.sunken, marginBottom: 12 },
  segItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: radius.control - 3 },
  segOn: { backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong },
  segText: { fontFamily: fonts.med, fontSize: 13.5, color: c.sub },
  segTextOn: { color: c.ink },
  search: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingLeft: 12, paddingRight: 4,
    borderRadius: radius.control, backgroundColor: c.sunken,
  },
  searchInput: { flex: 1, fontFamily: fonts.sans, fontSize: 15.5, color: c.ink, paddingVertical: 0 },
  chips: { flexDirection: 'row', gap: 8, marginTop: 12, marginBottom: 12, paddingHorizontal: 2 }, // same space above and below
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
  choiceNote: { ...typo.small, color: c.sub, textAlign: 'center' },
  moveEmpty: {
    ...typo.small,
    color: c.sub,
    textAlign: 'center',
    paddingVertical: 16,
  },
}));
