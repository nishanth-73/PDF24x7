// Scan home: start a new scan, or reopen a recent one to keep editing (crop, filters, cleanup...) and re-save.
import { useCallback, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { File } from 'expo-file-system';
import { router, useFocusEffect } from 'expo-router';
import { ConfirmModal, Group, GroupLabel, Icon, IconBtn, LargeTitle, Row, Screen, fmtDate, plural } from '../../src/ui';
import { fonts, makeStyles, radius, scanUi, useTheme } from '../../src/theme';
import { openFile } from '../../src/storage';
import { deleteDoc, isDirty, listDocs, type ScanDoc } from '../../src/scan/model';

export default function ScanTab() {
  const s = useStyles();
  const { c } = useTheme();
  const [docs, setDocs] = useState<ScanDoc[]>([]);
  const [deleting, setDeleting] = useState<ScanDoc | null>(null);

  useFocusEffect(useCallback(() => { setDocs(listDocs()); }, []));

  return (
    <Screen>
      <LargeTitle title="Scan" sub="Edges are found, straightened and cleaned up automatically." />
      <Pressable onPress={() => router.push('/scanner')} style={({ pressed }) => [s.hero, pressed && { opacity: 0.92 }]}>
        <View style={s.heroIcon}><Icon name="line-scan" size={30} color="#FFF" /></View>
        <View style={{ flex: 1 }}>
          <Text style={s.heroTitle}>Start scanning</Text>
          <Text style={s.heroSub}>Documents, books, ID cards, business cards and whiteboards</Text>
        </View>
        <Icon name="chevron-right" size={24} color="#FFF" />
      </Pressable>

      {docs.length > 0 && (
        <>
          <GroupLabel label="Recent scans" />
          <Group>
            {docs.map((d, i) => {
              const first = d.pages[0]?.shots[0];
              return (
                <Row
                  key={d.id} first={i === 0} title={d.name} onPress={() => router.push({ pathname: '/scanner', params: { id: d.id } })}
                  subtitle={`${plural(d.pages.length, 'page')} · ${!d.saved ? 'Draft' : isDirty(d) ? 'Unsaved changes' : 'Saved'} · ${fmtDate(d.modified)}`}
                  lead={<View style={s.thumb}>{first && <Image source={{ uri: first.out ?? first.src }} style={StyleSheet.absoluteFill} />}</View>}
                >
                  {d.pdf && new File(d.pdf.uri).exists && <IconBtn name="file-pdf-box" color={c.accent} onPress={() => openFile(d.pdf!)} />}
                  <IconBtn name="delete-outline" onPress={() => setDeleting(d)} />
                </Row>
              );
            })}
          </Group>
          <Text style={s.hint}>Tap a scan to crop, change filters, clean up or add pages, then save the PDF again.</Text>
        </>
      )}

      <ConfirmModal
        visible={!!deleting} onClose={() => setDeleting(null)} danger confirmLabel="Delete"
        title="Delete this scan?"
        message="The photos and edits are removed. A PDF you already saved stays in Files."
        onConfirm={() => { if (deleting) deleteDoc(deleting.id); setDocs(listDocs()); }}
      />
    </Screen>
  );
}

const useStyles = makeStyles((c) => ({
  hero: {
    flexDirection: 'row', alignItems: 'center', gap: 14, padding: 18, borderRadius: radius.card, backgroundColor: scanUi.blue, marginBottom: 8,
  },
  heroIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  heroTitle: { fontFamily: fonts.display, fontSize: 19, color: '#FFF' },
  heroSub: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18, color: 'rgba(255,255,255,0.85)', marginTop: 2 },
  thumb: { width: 40, height: 52, borderRadius: 4, overflow: 'hidden', backgroundColor: c.sunken, borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong },
  hint: { fontFamily: fonts.sans, fontSize: 13, color: c.sub, marginTop: 10 },
}));
