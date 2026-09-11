import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Image, PixelRatio, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { renderThumbnails, type Thumb } from '../modules/pdf-thumbnails';
import { share } from '../src/storage';
import { Button, IconBtn } from '../src/ui';
import { fonts, makeStyles, typo, useTheme } from '../src/theme';

const PAD = 12;

// In-app PDF viewer: pages are drawn to images by the native PdfThumbnails module.
export default function Viewer() {
  const s = useStyles();
  const { c } = useTheme();
  const { uri, name } = useLocalSearchParams<{ uri: string; name: string }>();
  const { width } = useWindowDimensions();
  const [pages, setPages] = useState<Thumb[] | null>(null);
  const [error, setError] = useState('');
  const pageW = width - PAD * 2;
  const file = { uri, name };

  useEffect(() => {
    let live = true;
    // ponytail: renders every page up front; render pages as they scroll into view if long PDFs open slowly.
    renderThumbnails(uri, Math.round(pageW * PixelRatio.get()))
      .then((p) => live && setPages(p))
      .catch(() => live && setError('This PDF can’t be shown. It may be password-protected or damaged.'));
    return () => { live = false; };
  }, [uri]);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={s.root}>
      <View style={s.bar}>
        <IconBtn name="chevron-left" size={26} onPress={() => (router.canGoBack() ? router.back() : router.replace('/files'))} />
        <Text style={s.name} numberOfLines={1}>{name}</Text>
        <IconBtn name="share-variant-outline" onPress={() => share(file)} />
      </View>

      {pages ? (
        <FlatList
          data={pages} keyExtractor={(p) => p.uri} contentContainerStyle={s.list} initialNumToRender={3} windowSize={5}
          renderItem={({ item, index }) => (
            <View>
              <Image source={{ uri: item.uri }} style={[s.page, { width: pageW, height: (pageW * item.height) / item.width }]} />
              <Text style={s.pageNo}>{index + 1} of {pages.length}</Text>
            </View>
          )}
        />
      ) : error ? (
        <View style={s.center}>
          <Text style={s.msg}>{error}</Text>
          <Button icon="share-variant-outline" label="Share instead" onPress={() => share(file)} style={{ alignSelf: 'stretch', marginTop: 18 }} />
        </View>
      ) : (
        <View style={s.center}>
          <ActivityIndicator color={c.ink} />
          <Text style={[s.msg, { marginTop: 12 }]}>Rendering pages…</Text>
        </View>
      )}
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.sunken },
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 4, height: 54, paddingHorizontal: 6,
    backgroundColor: c.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong,
  },
  name: { flex: 1, textAlign: 'center', fontFamily: fonts.bold, fontSize: 15, color: c.ink },
  list: { padding: PAD, gap: 14 },
  page: { backgroundColor: '#FFFFFF', borderRadius: 2, borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong },
  pageNo: { ...typo.small, color: c.sub, textAlign: 'center', marginTop: 6 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  msg: { ...typo.body, color: c.sub, textAlign: 'center' },
}));
