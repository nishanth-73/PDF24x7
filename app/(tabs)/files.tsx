import { useCallback, useState } from 'react';
import { Alert, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { listFiles, removeFile, share, type Saved } from '../../src/storage';
import { DocGlyph, ToolArt, kindOf } from '../../src/art';
import { Button, Group, IconBtn, LargeTitle, Row, Screen, fmtDate, fmtSize, plural } from '../../src/ui';
import { makeStyles, typo } from '../../src/theme';

export default function FilesTab() {
  const s = useStyles();
  const [files, setFiles] = useState<Saved[]>([]);
  const refresh = useCallback(() => { setFiles(listFiles()); }, []);
  useFocusEffect(refresh);
  const total = files.reduce((sum, f) => sum + f.size, 0);

  const confirmDelete = (f: Saved) =>
    Alert.alert('Delete this file?', `${f.name} will be removed from this phone. Copies you already shared are not affected.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => { removeFile(f.uri); refresh(); } },
    ]);

  return (
    <Screen>
      <LargeTitle title="Files" sub={files.length ? `${plural(files.length, 'file')} · ${fmtSize(total)} on this phone` : undefined} />

      {files.length ? (
        <Group>
          {files.map((f, i) => (
            <Row
              key={f.uri} first={i === 0} lead={<DocGlyph kind={kindOf(f.name)} />} title={f.name}
              subtitle={`${fmtSize(f.size)} · ${fmtDate(f.modified)}`} onPress={() => share(f)}
            >
              <IconBtn name="share-variant-outline" onPress={() => share(f)} />
              <IconBtn name="delete-outline" onPress={() => confirmDelete(f)} />
            </Row>
          ))}
        </Group>
      ) : (
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
      )}
    </Screen>
  );
}

const useStyles = makeStyles((c) => ({
  empty: { alignItems: 'center', paddingTop: 36, paddingHorizontal: 12 },
  emptyTitle: { ...typo.title, fontSize: 23, color: c.ink, marginTop: 14 },
  emptyBody: { ...typo.body, color: c.sub, textAlign: 'center', marginTop: 6 },
  actions: { alignSelf: 'stretch', gap: 10, marginTop: 24 },
}));
