// Modal for choosing one or more PDFs from the app's saved files and folders, or (with Drive sync on) from the synced
// Google Drive folder: those are fetched into the cache only once picked, so choosing them doesn't fill the phone.
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  BackHandler,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { listAllFiles, listFiles, listFolders, type Folder, type Saved } from './storage';
import { cachedDriveFiles, describeDriveError, downloadDriveFile, listDriveFiles, readBackup, type DriveFile, type DriveListing } from './backup';
import { DocGlyph, FolderGlyph, ToolArt } from './art';
import { Button, Group, GroupLabel, Icon, IconBtn, Marquee, fmtDate, fmtSize, plural, stem } from './ui';
import { fonts, makeStyles, radius, typo, useTheme } from './theme';

export type PickedFile = { name: string; uri: string; size?: number | null };

type FolderWithCount = Folder & { fileCount: number };

// Drive files and folders go through the same lists as saved ones, under uris no phone file can have.
const DRIVE = 'drive:';
const asSaved = (f: DriveFile): Saved => ({ name: f.name, uri: DRIVE + f.id, size: f.size, modified: f.modified });

export interface AppFilesPickerModalProps {
  visible: boolean;
  multi?: boolean;
  onClose: () => void;
  onSelect: (files: PickedFile[]) => void;
  alreadySelectedUris?: string[];
}

export function AppFilesPickerModal({
  visible,
  multi = false,
  onClose,
  onSelect,
  alreadySelectedUris = [],
}: AppFilesPickerModalProps) {
  const s = useStyles();
  const { c, scheme } = useTheme();

  const [currentFolder, setCurrentFolder] = useState<Folder | null>(null);
  const [query, setQuery] = useState('');
  const [folders, setFolders] = useState<FolderWithCount[]>([]);
  const [files, setFiles] = useState<Saved[]>([]);
  const [allFiles, setAllFiles] = useState<Saved[]>([]);
  const [selectedMap, setSelectedMap] = useState<Record<string, PickedFile>>({});
  const [source, setSource] = useState<'phone' | 'drive'>('phone');
  const [drive, setDrive] = useState<DriveListing | null>(null);
  const [busy, setBusy] = useState(''); // fetching picked Drive files
  const [problem, setProblem] = useState('');
  const driveOn = readBackup().enabled;

  // Reload folders and files when modal opens or currentFolder changes
  const reload = useCallback(() => {
    if (source === 'drive') {
      const list = drive?.files ?? [];
      setFolders((drive?.folders ?? []).map((name) => ({
        name, uri: `drive-folder:${name}`, created: 0, fileCount: list.filter((f) => f.folder === name).length,
      })));
      setFiles(list.filter((f) => f.folder === (currentFolder?.name ?? '')).map(asSaved));
      setAllFiles(list.map(asSaved));
      return;
    }
    const loadedFolders = listFolders().map((f) => ({
      ...f,
      fileCount: listFiles(f.uri).filter((x) => x.name.toLowerCase().endsWith('.pdf')).length,
    }));
    setFolders(loadedFolders);
    setFiles(listFiles(currentFolder?.uri).filter((x) => x.name.toLowerCase().endsWith('.pdf')));
    setAllFiles(listAllFiles().filter((x) => x.name.toLowerCase().endsWith('.pdf')));
  }, [currentFolder, source, drive]);

  const showSource = async (next: 'phone' | 'drive') => {
    setSource(next);
    setCurrentFolder(null);
    setQuery('');
    setProblem('');
    if (next !== 'drive') return;
    const cached = cachedDriveFiles(); // the listing the Drive tab or the last sync left behind
    if (cached) { setDrive(cached); return; }
    try {
      setDrive(await listDriveFiles());
    } catch (e) {
      setProblem(describeDriveError(e));
    }
  };

  // Picked Drive files become cache copies the tool can read; phone files pass straight through.
  const finish = async (list: PickedFile[]) => {
    if (busy) return;
    const byUri = new Map((drive?.files ?? []).map((f) => [DRIVE + f.id, f]));
    const out: PickedFile[] = [];
    setProblem('');
    try {
      for (const p of list) {
        const f = byUri.get(p.uri);
        if (!f) { out.push(p); continue; }
        setBusy(`Getting “${stem(f.name)}” from Drive…`);
        out.push(await downloadDriveFile(f));
      }
    } catch (e) {
      setProblem(describeDriveError(e));
      setBusy('');
      return;
    }
    setBusy('');
    onSelect(out);
    onClose();
  };

  // Fresh state each time the picker opens. Only `visible` triggers it: this used to also depend on `reload`, which
  // changes when a folder opens, so opening a folder reset straight back to the top level.
  useEffect(() => {
    if (!visible) return;
    setSource('phone');
    setProblem('');
    setCurrentFolder(null);
    setQuery('');
    const initialMap: Record<string, PickedFile> = {};
    const all = listAllFiles();
    for (const uri of alreadySelectedUris) {
      const found = all.find((f) => f.uri === uri);
      if (found) initialMap[uri] = { name: found.name, uri: found.uri, size: found.size };
    }
    setSelectedMap(initialMap);
  }, [visible]);
  useEffect(() => {
    if (visible) reload();
  }, [visible, reload]);

  // Handle hardware back on Android
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (query) {
        setQuery('');
        return true;
      }
      if (currentFolder) {
        setCurrentFolder(null);
        return true;
      }
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [visible, query, currentFolder, onClose]);

  const toggleSelect = (f: Saved) => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      if (next[f.uri]) {
        delete next[f.uri];
      } else {
        next[f.uri] = { name: f.name, uri: f.uri, size: f.size };
      }
      return next;
    });
  };

  const handleRowPress = (f: Saved) => {
    if (multi) toggleSelect(f);
    else finish([{ name: f.name, uri: f.uri, size: f.size }]);
  };

  const handleConfirmMulti = () => {
    const chosen = Object.values(selectedMap);
    if (chosen.length > 0) finish(chosen);
  };

  // Determine displayed files based on search vs folder navigation
  const trimmed = query.trim().toLowerCase();
  const displayedFiles = trimmed
    ? allFiles.filter((f) => f.name.toLowerCase().includes(trimmed))
    : files;

  const selectedCount = Object.keys(selectedMap).length;

  const selectAllCurrent = () => {
    setSelectedMap((prev) => {
      const next = { ...prev };
      const allSelected = displayedFiles.every((f) => !!next[f.uri]);
      if (allSelected) {
        // Deselect all visible
        for (const f of displayedFiles) delete next[f.uri];
      } else {
        // Select all visible
        for (const f of displayedFiles) {
          next[f.uri] = { name: f.name, uri: f.uri, size: f.size };
        }
      }
      return next;
    });
  };

  const allVisibleSelected = displayedFiles.length > 0 && displayedFiles.every((f) => !!selectedMap[f.uri]);

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <SafeAreaView edges={['top', 'bottom']} style={[s.root, { backgroundColor: c.surface }]}>
        {/* Header */}
        <View style={s.head}>
          {currentFolder && !trimmed ? (
            <Pressable
              onPress={() => setCurrentFolder(null)}
              style={({ pressed }) => [s.backBtn, pressed && { opacity: 0.7 }]}
              hitSlop={10}
            >
              <Icon name="arrow-left" size={24} color={c.ink} />
            </Pressable>
          ) : (
            <View style={s.headIcon}>
              <Icon name="folder-outline" size={24} color={c.accent} />
            </View>
          )}

          <View style={s.headTitles}>
            <Text style={s.headTitle}>{multi ? 'Select PDFs' : 'Select a PDF'}</Text>
            <Text style={s.headSub} numberOfLines={1}>
              {trimmed
                ? `Search in App Files`
                : currentFolder
                ? currentFolder.name
                : source === 'drive' ? 'Google Drive · PDF Tools folder' : 'App Files · Saved documents'}
            </Text>
          </View>

          <IconBtn name="close" size={22} color={c.ink} onPress={onClose} />
        </View>

        {/* Search Bar, with the phone / Drive switch above it when Drive sync is on */}
        <View style={s.searchWrap}>
          {driveOn && (
            <View style={s.seg}>
              {([['phone', 'cellphone', 'This phone'], ['drive', 'google-drive', 'Google Drive']] as const).map(([key, icon, label]) => {
                const on = source === key;
                return (
                  <Pressable key={key} onPress={() => !on && showSource(key)} style={[s.segItem, on && s.segOn]} accessibilityRole="tab" accessibilityState={{ selected: on }}>
                    <Icon name={icon} size={16} color={on ? c.ink : c.sub} />
                    <Text style={[s.segText, on && { color: c.ink }]}>{label}</Text>
                  </Pressable>
                );
              })}
            </View>
          )}
          <View style={s.searchBar}>
            <Icon name="magnify" size={20} color={c.faint} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder={source === 'drive' ? 'Search Drive PDFs…' : 'Search saved PDFs…'}
              placeholderTextColor={c.faint}
              style={s.searchInput}
              keyboardAppearance={scheme}
              autoCorrect={false}
              returnKeyType="search"
            />
            {!!query && (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Icon name="close-circle" size={18} color={c.faint} />
              </Pressable>
            )}
          </View>
        </View>

        {(!!busy || !!problem) && (
          <View style={s.status}>
            {!!busy && <ActivityIndicator color={c.accent} />}
            <Text style={[s.statusText, !busy && { color: c.accent }]}>{busy || problem}</Text>
          </View>
        )}

        {/* List Content */}
        {source === 'drive' && !drive && !problem ? (
          <View style={{ flex: 1, backgroundColor: c.bg, paddingTop: 40 }}><ActivityIndicator color={c.accent} /></View>
        ) : (
        <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={s.scrollContent} keyboardShouldPersistTaps="handled">
          {/* If not searching and at root: show Folders */}
          {!trimmed && !currentFolder && folders.length > 0 && (
            <>
              <GroupLabel label="Folders" />
              <Group>
                {folders.map((f, i) => (
                  <Pressable
                    key={f.uri}
                    onPress={() => setCurrentFolder(f)}
                    style={({ pressed }) => [s.row, pressed && { backgroundColor: c.sunken }]}
                  >
                    <FolderGlyph size={32} />
                    <View style={[s.rowBody, i > 0 && s.rowRule]}>
                      <View style={{ flex: 1 }}>
                        <Text style={s.rowTitle} numberOfLines={1}>
                          {f.name}
                        </Text>
                        <Text style={s.rowSub}>{plural(f.fileCount, 'PDF')}</Text>
                      </View>
                      <Icon name="chevron-right" size={20} color={c.faint} />
                    </View>
                  </Pressable>
                ))}
              </Group>
            </>
          )}

          {/* Files section */}
          {displayedFiles.length > 0 ? (
            <>
              <View style={s.filesHead}>
                <GroupLabel
                  label={
                    trimmed
                      ? `${plural(displayedFiles.length, 'PDF')} found`
                      : currentFolder
                      ? currentFolder.name
                      : folders.length > 0
                      ? 'Files in Root'
                      : 'All Saved PDFs'
                  }
                />
                {multi && (
                  <Text style={s.selectAllLink} onPress={selectAllCurrent}>
                    {allVisibleSelected ? 'Deselect all' : 'Select all'}
                  </Text>
                )}
              </View>

              <Group>
                {displayedFiles.map((f, i) => {
                  const isChecked = !!selectedMap[f.uri];
                  return (
                    <Pressable
                      key={f.uri}
                      onPress={() => handleRowPress(f)}
                      style={({ pressed }) => [s.row, pressed && { backgroundColor: c.sunken }]}
                    >
                      <View style={s.leadArea}>
                        {multi && (
                          <Icon
                            name={isChecked ? 'checkbox-marked' : 'checkbox-blank-outline'}
                            size={22}
                            color={isChecked ? c.accent : c.faint}
                          />
                        )}
                        <DocGlyph kind="pdf" />
                      </View>
                      <View style={[s.rowBody, i > 0 && s.rowRule]}>
                        <View style={{ flex: 1 }}>
                          <Marquee text={stem(f.name)} style={[s.rowTitle, isChecked && { color: c.accent }]} />
                          <Text style={s.rowSub} numberOfLines={1}>
                            {fmtSize(f.size)} · {fmtDate(f.modified)}
                          </Text>
                        </View>
                        {!multi && <Icon name="chevron-right" size={18} color={c.faint} />}
                      </View>
                    </Pressable>
                  );
                })}
              </Group>
            </>
          ) : (
            <View style={s.empty}>
              <ToolArt id="files" size={80} />
              <Text style={s.emptyTitle}>
                {trimmed
                  ? 'No matching PDFs'
                  : currentFolder
                  ? 'This folder is empty'
                  : 'No saved PDFs found'}
              </Text>
              <Text style={s.emptySub}>
                {trimmed
                  ? `No PDF files found matching "${query}".`
                  : currentFolder
                  ? 'PDFs saved or moved into this folder will appear here.'
                  : source === 'drive' ? 'PDFs in the PDF Tools folder of your Google Drive will appear here.' : 'PDFs saved from your tools will appear here.'}
              </Text>
            </View>
          )}
        </ScrollView>
        )}

        {/* Multi-selection sticky bottom bar */}
        {multi && (
          <View style={s.footer}>
            <View style={{ flex: 1 }}>
              <Text style={s.footerCount}>
                {selectedCount ? `${plural(selectedCount, 'PDF')} selected` : 'None selected'}
              </Text>
              {selectedCount > 0 && (
                <Text style={s.footerClear} onPress={() => setSelectedMap({})}>
                  Clear all
                </Text>
              )}
            </View>
            <Button
              label={selectedCount ? `Add (${selectedCount})` : 'Select PDFs'}
              disabled={selectedCount === 0} busy={!!busy}
              onPress={handleConfirmMulti}
              style={{ minWidth: 120 }}
            />
          </View>
        )}
      </SafeAreaView>
    </Modal>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.bg },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.lineStrong,
    backgroundColor: c.surface,
  },
  headIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.control,
    backgroundColor: c.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  backBtn: {
    width: 38,
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -4,
  },
  headTitles: { flex: 1 },
  headTitle: { ...typo.title, fontSize: 18, color: c.ink },
  headSub: { ...typo.small, color: c.sub, marginTop: 1 },
  searchWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: c.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: c.lineStrong,
  },
  seg: { flexDirection: 'row', padding: 3, borderRadius: radius.control, backgroundColor: c.sunken, marginBottom: 10 },
  segItem: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 7, borderRadius: radius.control - 3 },
  segOn: { backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong },
  segText: { fontFamily: fonts.med, fontSize: 13.5, color: c.sub },
  status: {
    flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: c.surface,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: c.lineStrong,
  },
  statusText: { ...typo.small, color: c.sub, flex: 1 },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 42,
    backgroundColor: c.sunken,
    borderRadius: radius.control,
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 15,
    color: c.ink,
    paddingVertical: 0,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 40,
  },
  filesHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  selectAllLink: {
    fontFamily: fonts.med,
    fontSize: 13,
    color: c.accent,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 14,
    paddingRight: 14,
    minHeight: 56,
  },
  leadArea: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  rowBody: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 12,
    paddingVertical: 12,
  },
  rowRule: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.line,
  },
  rowTitle: {
    fontFamily: fonts.bold,
    fontSize: 14.5,
    color: c.ink,
  },
  rowSub: {
    ...typo.small,
    color: c.sub,
    marginTop: 2,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 48,
    paddingHorizontal: 24,
  },
  emptyTitle: {
    ...typo.title,
    fontSize: 18,
    color: c.ink,
    marginTop: 14,
  },
  emptySub: {
    ...typo.body,
    fontSize: 13.5,
    color: c.sub,
    textAlign: 'center',
    marginTop: 4,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: c.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: c.lineStrong,
    gap: 12,
  },
  footerCount: {
    fontFamily: fonts.bold,
    fontSize: 14.5,
    color: c.ink,
  },
  footerClear: {
    fontFamily: fonts.med,
    fontSize: 12.5,
    color: c.accent,
    marginTop: 1,
  },
}));
