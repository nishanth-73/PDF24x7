// Recent scans, reachable from the camera's top bar: reopen a scan to keep editing, or delete it.
import { useState } from 'react';
import { Image, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { openFile } from '../storage';
import { ConfirmModal, Icon, fmtDate, plural } from '../ui';
import { fonts, radius, scanUi as u } from '../theme';
import { deleteDoc, isDirty, listDocs, type ScanDoc } from './model';

export function RecentScans({ onPick, onClose }: { onPick: (doc: ScanDoc) => void; onClose: () => void }) {
  const [docs, setDocs] = useState<ScanDoc[]>(listDocs);
  const [deleting, setDeleting] = useState<ScanDoc | null>(null);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <View style={s.bar}>
          <Pressable onPress={onClose} hitSlop={10} style={s.tap} accessibilityLabel="Close">
            <Icon name="close" size={24} color={u.text} />
          </Pressable>
          <Text style={s.title}>Recent scans</Text>
          <View style={s.tap} />
        </View>

        {docs.length === 0 ? (
          <View style={s.empty}>
            <Icon name="line-scan" size={48} color={u.dim} />
            <Text style={s.emptyText}>Scans you make appear here, so you can edit them again later.</Text>
          </View>
        ) : (
          <View style={{ flex: 1 }}>
            {docs.map((d) => {
              const first = d.pages[0]?.shots[0];
              return (
                <Pressable
                  key={d.id} onPress={() => onPick(d)}
                  style={({ pressed }) => [s.row, pressed && { backgroundColor: u.panel }]}
                >
                  <View style={s.thumb}>{first && <Image source={{ uri: first.out ?? first.src }} style={StyleSheet.absoluteFill} />}</View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.name} numberOfLines={1}>{d.name}</Text>
                    <Text style={s.meta}>
                      {plural(d.pages.length, 'page')} · {!d.saved ? 'Draft' : isDirty(d) ? 'Unsaved changes' : 'Saved'} · {fmtDate(d.modified)}
                    </Text>
                  </View>
                  {d.pdf && (
                    <Pressable onPress={() => openFile(d.pdf!)} hitSlop={8} style={s.tap} accessibilityLabel="Open PDF">
                      <Icon name="file-pdf-box" size={22} color={u.text} />
                    </Pressable>
                  )}
                  <Pressable onPress={() => setDeleting(d)} hitSlop={8} style={s.tap} accessibilityLabel="Delete scan">
                    <Icon name="delete-outline" size={22} color={u.dim} />
                  </Pressable>
                </Pressable>
              );
            })}
          </View>
        )}

        <ConfirmModal
          visible={!!deleting} onClose={() => setDeleting(null)} danger confirmLabel="Delete"
          title="Delete this scan?"
          message="The photos and edits are removed. A PDF you already saved stays in Files."
          onConfirm={() => { if (deleting) deleteDoc(deleting.id); setDocs(listDocs()); }}
        />
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: u.bg },
  bar: { height: 56, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 6 },
  title: { fontFamily: fonts.bold, fontSize: 16, color: u.text },
  tap: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 10 },
  thumb: { width: 40, height: 52, borderRadius: 4, overflow: 'hidden', backgroundColor: u.raised },
  name: { fontFamily: fonts.med, fontSize: 15, color: u.text },
  meta: { fontFamily: fonts.sans, fontSize: 12.5, color: u.dim, marginTop: 2 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 40 },
  emptyText: { fontFamily: fonts.sans, fontSize: 14, color: u.dim, textAlign: 'center' },
});
