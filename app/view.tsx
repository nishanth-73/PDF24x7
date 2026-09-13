import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator, Animated, BackHandler, FlatList, Image, Modal, PanResponder, PixelRatio, Platform, Pressable, ScrollView, Share,
  StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { renderThumbnails, type Thumb } from '../modules/pdf-thumbnails';
import { readPicked, share } from '../src/storage';
import { extractAllText, type PageTextResult } from '../src/pdf';
import { Button, DialogModal, Icon, IconBtn } from '../src/ui';
import { fonts, makeStyles, radius, typo, useTheme } from '../src/theme';

const PAD = 12;

type ViewMode = 'pages' | 'text';

type SearchMatch = {
  pageIndex: number;
  pageNumber: number;
  snippet: string;
};

type PageItemProps = {
  item: Thumb;
  index: number;
  totalPages: number;
  pageW: number;
  zoom: number;
  text?: string;
  isExpanded: boolean;
  isSearchHit: boolean;
  onToggleExpand: (index: number) => void;
  onCopyText: (text: string, pageNum: number) => void;
};

const PageItem = memo(function PageItem({
  item,
  index,
  totalPages,
  pageW,
  zoom,
  text,
  isExpanded,
  isSearchHit,
  onToggleExpand,
  onCopyText,
}: PageItemProps) {
  const s = useStyles();
  const { c } = useTheme();
  const hasText = !!text;
  const imgW = pageW * zoom;
  const imgH = ((pageW * item.height) / item.width) * zoom;

  return (
    <View style={s.pageWrapper}>
      {/* Search Hit Banner */}
      {isSearchHit && (
        <View style={s.hitBanner}>
          <Icon name="check-circle-outline" size={14} color={c.accent} />
          <Text style={s.hitBannerText}>Search match on this page</Text>
        </View>
      )}

      {/* Rendered Page Image (Scrollable horizontally when zoomed) */}
      {zoom > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <Image source={{ uri: item.uri }} style={[s.page, { width: imgW, height: imgH }]} resizeMode="contain" />
        </ScrollView>
      ) : (
        <Image source={{ uri: item.uri }} style={[s.page, { width: imgW, height: imgH }]} resizeMode="contain" />
      )}

      {/* Page Footer Info & Selectable Text Trigger */}
      <View style={s.pageFooter}>
        <Text style={s.pageNo}>Page {index + 1} of {totalPages}</Text>
        {hasText && (
          <Pressable onPress={() => onToggleExpand(index)} style={s.selectTextToggle}>
            <Icon name={isExpanded ? 'chevron-up' : 'format-text'} size={15} color={c.accent} />
            <Text style={s.selectTextToggleLabel}>
              {isExpanded ? 'Hide text' : 'Select / copy text'}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Expandable Selectable Text Card */}
      {isExpanded && hasText && (
        <View style={s.inlineTextBox}>
          <View style={s.inlineTextHead}>
            <Text style={s.inlineTextTitle}>Selectable Page Text:</Text>
            <Pressable onPress={() => onCopyText(text || '', index + 1)} style={s.inlineCopyBtn}>
              <Icon name="content-copy" size={13} color={c.ink} />
              <Text style={s.inlineCopyText}>Share text</Text>
            </Pressable>
          </View>
          <TextInput
            value={text}
            editable={false}
            multiline
            scrollEnabled={false}
            showSoftInputOnFocus={false}
            contextMenuHidden={false}
            selectionColor={c.accent}
            cursorColor={c.accent}
            style={s.selectableContent}
          />
        </View>
      )}
    </View>
  );
});

type TextPageItemProps = {
  index: number;
  totalPages: number;
  text?: string;
  isSearchHit: boolean;
  onCopyText: (text: string, pageNum: number) => void;
};

const TextPageItem = memo(function TextPageItem({
  index,
  totalPages,
  text,
  isSearchHit,
  onCopyText,
}: TextPageItemProps) {
  const s = useStyles();
  const { c } = useTheme();
  const rawText = text || '';

  return (
    <View style={[s.textCard, isSearchHit && s.textCardHighlighted]}>
      <View style={s.textCardHead}>
        <View style={s.textCardHeadLeft}>
          <Icon name="file-document-outline" size={16} color={c.accent} />
          <Text style={s.textCardPage}>Page {index + 1} of {totalPages}</Text>
        </View>
        {!!rawText && (
          <Pressable onPress={() => onCopyText(rawText, index + 1)} style={s.inlineCopyBtn}>
            <Icon name="content-copy" size={13} color={c.ink} />
            <Text style={s.inlineCopyText}>Share page</Text>
          </Pressable>
        )}
      </View>

      {rawText ? (
        <TextInput
          value={rawText}
          editable={false}
          multiline
          scrollEnabled={false}
          showSoftInputOnFocus={false}
          contextMenuHidden={false}
          selectionColor={c.accent}
          cursorColor={c.accent}
          style={s.selectableContent}
        />
      ) : (
        <Text style={s.emptyPageText}>No text detected on this page.</Text>
      )}
    </View>
  );
});

type GridTileProps = {
  item: Thumb;
  index: number;
  onSelect: (index: number) => void;
};

const GridTile = memo(function GridTile({ item, index, onSelect }: GridTileProps) {
  const s = useStyles();
  return (
    <Pressable onPress={() => onSelect(index)} style={s.gridTile}>
      <Image source={{ uri: item.uri }} style={s.gridThumb} resizeMode="contain" />
      <Text style={s.gridPageNo}>{index + 1}</Text>
    </Pressable>
  );
});

const GRIP_H = 52;

// Android-style fast scroll: a grip on the right edge that shows while scrolling; dragging it seeks through the document.
// ponytail: the page label assumes pages of similar height; map offsets through measured item layouts if mixed sizes matter.
function FastScroll({ y, contentH, viewH, count, seek }: {
  y: Animated.Value; contentH: number; viewH: number; count: number; seek: (offset: number) => void;
}) {
  const s = useStyles();
  const { c } = useTheme();
  const maxScroll = Math.max(1, contentH - viewH);
  const track = Math.max(1, viewH - GRIP_H);
  const m = useRef({ maxScroll, track, count, seek, last: 0, start: 0, dragging: false });
  Object.assign(m.current, { maxScroll, track, count, seek });
  const opacity = useRef(new Animated.Value(0)).current;
  const [visible, setVisible] = useState(false);
  const [page, setPage] = useState(-1); // page label, only while dragging
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const fade = (on: boolean) => {
    setVisible(on);
    Animated.timing(opacity, { toValue: on ? 1 : 0, duration: on ? 120 : 250, useNativeDriver: false }).start();
  };
  const hideLater = () => {
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => !m.current.dragging && fade(false), 1500);
  };

  useEffect(() => {
    let shown = false;
    const id = y.addListener(({ value }) => {
      m.current.last = value;
      if (!shown) { shown = true; fade(true); }
      hideLater();
    });
    const off = opacity.addListener(({ value }) => { if (value === 0) shown = false; });
    return () => { y.removeListener(id); opacity.removeListener(off); clearTimeout(hideTimer.current); };
  }, [y]);

  const pan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onPanResponderTerminationRequest: () => false,
    onPanResponderGrant: () => { m.current.dragging = true; m.current.start = m.current.last; fade(true); },
    onPanResponderMove: (_, g) => {
      const r = m.current;
      const offset = Math.min(r.maxScroll, Math.max(0, r.start + g.dy * (r.maxScroll / r.track)));
      r.seek(offset);
      setPage(Math.min(r.count - 1, Math.floor((offset / r.maxScroll) * r.count)));
    },
    onPanResponderRelease: () => { m.current.dragging = false; setPage(-1); hideLater(); },
    onPanResponderTerminate: () => { m.current.dragging = false; setPage(-1); hideLater(); },
  })).current;

  const top = y.interpolate({ inputRange: [0, maxScroll], outputRange: [0, track], extrapolate: 'clamp' });
  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[s.fastWrap, { opacity, transform: [{ translateY: top }] }]}
    >
      {page >= 0 && (
        <View style={s.fastBubble}>
          <Text style={s.fastBubbleText}>{page + 1} / {count}</Text>
        </View>
      )}
      <View style={s.fastGrip} {...pan.panHandlers} accessibilityLabel="Fast scroll">
        <Icon name="drag-vertical" size={20} color={c.sub} />
      </View>
    </Animated.View>
  );
}

export default function Viewer() {
  const s = useStyles();
  const { c, scheme } = useTheme();
  const { uri, name } = useLocalSearchParams<{ uri: string; name: string }>();
  const { width } = useWindowDimensions();
  const pageW = width - PAD * 2;
  const file = { uri: uri || '', name: name || 'Document.pdf' };

  const flatListRef = useRef<FlatList>(null);
  const textListRef = useRef<FlatList>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [contentH, setContentH] = useState(0);
  const [viewH, setViewH] = useState(0);
  const listScroll = {
    onScroll: (e: { nativeEvent: { contentOffset: { y: number } } }) => scrollY.setValue(e.nativeEvent.contentOffset.y),
    scrollEventThrottle: 16,
    onContentSizeChange: (_: number, h: number) => setContentH(h),
    onLayout: (e: { nativeEvent: { layout: { height: number } } }) => setViewH(e.nativeEvent.layout.height),
  };

  // Core state
  const [pages, setPages] = useState<Thumb[] | null>(null);
  const [pageTexts, setPageTexts] = useState<PageTextResult[]>([]);
  const [error, setError] = useState('');
  const [mode, setMode] = useState<ViewMode>('pages');

  // Zoom state (for page mode)
  const [zoom, setZoom] = useState(1);

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentMatchIdx, setCurrentMatchIdx] = useState(0);

  // Jump to page modal
  const [jumpOpen, setJumpOpen] = useState(false);
  const [jumpInput, setJumpInput] = useState('');

  // Thumbnails overview modal
  const [gridOpen, setGridOpen] = useState(false);

  // Track expanded text panels on individual pages in "pages" mode
  const [expandedTextPages, setExpandedTextPages] = useState<Record<number, boolean>>({});

  // Handle Android hardware back press when modals or search bar are open
  useEffect(() => {
    const onBackPress = () => {
      if (jumpOpen) {
        setJumpOpen(false);
        return true;
      }
      if (gridOpen) {
        setGridOpen(false);
        return true;
      }
      if (searchOpen) {
        setSearchOpen(false);
        setSearchQuery('');
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener('hardwareBackPress', onBackPress);
    return () => sub.remove();
  }, [jumpOpen, gridOpen, searchOpen]);

  // Render thumbnails at optimal capped width to preserve memory on long PDFs
  useEffect(() => {
    if (!uri) {
      setError('No PDF file specified.');
      return;
    }
    let live = true;
    const targetW = Math.min(720, Math.round(pageW * 1.8));
    renderThumbnails(uri, targetW)
      .then((p) => live && setPages(p))
      .catch(() => live && setError('This PDF can’t be shown. It may be password-protected or damaged.'));
    return () => { live = false; };
  }, [uri, pageW]);

  // Extract text in background AFTER pages are displayed, or when search is triggered
  useEffect(() => {
    if (!uri || !pages) return;
    let live = true;
    const timer = setTimeout(() => {
      readPicked(uri)
        .then((bytes) => extractAllText(bytes))
        .then((res) => { if (live) setPageTexts(res); })
        .catch((e) => console.warn('Text extraction error:', e));
    }, 350);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [uri, !!pages]);

  // If user opens search or text mode immediately, trigger extraction right away
  useEffect(() => {
    if (!uri || pageTexts.length > 0) return;
    if (searchOpen || mode === 'text') {
      readPicked(uri)
        .then((bytes) => extractAllText(bytes))
        .then((res) => setPageTexts(res))
        .catch((e) => console.warn('Text extraction error:', e));
    }
  }, [uri, searchOpen, mode, pageTexts.length]);

  // Compute search matches with useMemo
  const needle = searchQuery.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!needle || pageTexts.length === 0) return [];
    const results: SearchMatch[] = [];
    pageTexts.forEach((pt) => {
      const lower = pt.text.toLowerCase();
      let pos = lower.indexOf(needle);
      while (pos !== -1) {
        const start = Math.max(0, pos - 30);
        const end = Math.min(pt.text.length, pos + needle.length + 30);
        const snippet = (start > 0 ? '…' : '') + pt.text.slice(start, end).trim() + (end < pt.text.length ? '…' : '');
        results.push({ pageIndex: pt.pageIndex, pageNumber: pt.pageIndex + 1, snippet });
        pos = lower.indexOf(needle, pos + needle.length);
      }
    });
    return results;
  }, [needle, pageTexts]);

  const searchHitIndices = useMemo(() => {
    if (!needle || matches.length === 0) return new Set<number>();
    return new Set(matches.map((m) => m.pageIndex));
  }, [needle, matches]);

  const pageTextsMap = useMemo(() => {
    const map = new Map<number, string>();
    for (const pt of pageTexts) map.set(pt.pageIndex, pt.text);
    return map;
  }, [pageTexts]);

  // Scroll to current search match
  const scrollToPage = useCallback((pageIndex: number) => {
    if (pageIndex < 0 || !pages || pageIndex >= pages.length) return;
    try {
      if (mode === 'pages') {
        flatListRef.current?.scrollToIndex({ index: pageIndex, animated: true, viewPosition: 0.1 });
      } else {
        textListRef.current?.scrollToIndex({ index: pageIndex, animated: true, viewPosition: 0.1 });
      }
    } catch {
      // flatList fallback
    }
  }, [mode, pages]);

  const handleNextMatch = () => {
    if (!matches.length) return;
    const next = (currentMatchIdx + 1) % matches.length;
    setCurrentMatchIdx(next);
    scrollToPage(matches[next].pageIndex);
  };

  const handlePrevMatch = () => {
    if (!matches.length) return;
    const prev = (currentMatchIdx - 1 + matches.length) % matches.length;
    setCurrentMatchIdx(prev);
    scrollToPage(matches[prev].pageIndex);
  };

  // Jump to specific page number
  const handleJump = () => {
    const p = parseInt(jumpInput, 10);
    if (pages && p >= 1 && p <= pages.length) {
      setJumpOpen(false);
      setJumpInput('');
      scrollToPage(p - 1);
    }
  };

  // Callbacks
  const handleToggleExpand = useCallback((idx: number) => {
    setExpandedTextPages((prev) => ({ ...prev, [idx]: !prev[idx] }));
  }, []);

  const handleCopyText = useCallback((text: string, pageNum: number) => {
    if (!text) return;
    Share.share({
      message: text,
      title: `${name} — Page ${pageNum}`,
    });
  }, [name]);

  const handleSelectGridPage = useCallback((index: number) => {
    setGridOpen(false);
    scrollToPage(index);
  }, [scrollToPage]);

  const hasAnyText = pageTexts.some((p) => p.text.length > 0);

  return (
    <SafeAreaView edges={['top', 'bottom']} style={[s.root, { backgroundColor: c.surface }]}>
      {/* ── Top Header Bar ── */}
      <View style={s.bar}>
        <IconBtn name="chevron-left" size={24} onPress={() => (router.canGoBack() ? router.back() : router.replace('/files'))} />
        <Text style={s.name} numberOfLines={1}>{name}</Text>

        <View style={s.headerActions}>
          <IconBtn
            name="magnify"
            size={20}
            color={searchOpen ? c.accent : c.ink}
            onPress={() => {
              setSearchOpen((prev) => !prev);
              if (searchOpen) setSearchQuery('');
            }}
          />

          <IconBtn
            name={mode === 'pages' ? 'text-box-outline' : 'file-document-outline'}
            size={20}
            color={mode === 'text' ? c.accent : c.ink}
            onPress={() => setMode((m) => (m === 'pages' ? 'text' : 'pages'))}
          />

          <IconBtn
            name="view-grid-outline"
            size={20}
            color={c.ink}
            onPress={() => setGridOpen(true)}
          />

          <IconBtn name="share-variant-outline" size={20} onPress={() => share(file)} />
        </View>
      </View>

      {/* ── Search Bar Overlay ── */}
      {searchOpen && (
        <View style={s.searchBar}>
          <Icon name="magnify" size={18} color={c.sub} />
          <TextInput
            autoFocus
            value={searchQuery}
            onChangeText={(text) => {
              setSearchQuery(text);
              setCurrentMatchIdx(0);
              if (text.trim() && pageTexts.length > 0) {
                const firstMatch = pageTexts.find((p) => p.text.toLowerCase().includes(text.trim().toLowerCase()));
                if (firstMatch) scrollToPage(firstMatch.pageIndex);
              }
            }}
            placeholder="Search in PDF…"
            placeholderTextColor={c.faint}
            style={s.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardAppearance={scheme}
            returnKeyType="search"
          />

          {matches.length > 0 && (
            <Text style={s.matchCount}>
              {currentMatchIdx + 1}/{matches.length}
            </Text>
          )}

          {needle && matches.length === 0 && (
            <Text style={s.matchCountNone}>No matches</Text>
          )}

          {matches.length > 0 && (
            <View style={s.searchNav}>
              <IconBtn name="chevron-up" size={20} onPress={handlePrevMatch} />
              <IconBtn name="chevron-down" size={20} onPress={handleNextMatch} />
            </View>
          )}

          <IconBtn
            name="close"
            size={18}
            color={c.faint}
            onPress={() => {
              setSearchOpen(false);
              setSearchQuery('');
            }}
          />
        </View>
      )}

      {/* ── Main Content Area ── */}
      {pages ? (
        <View style={{ flex: 1 }}>
        {mode === 'pages' ? (
          /* ── Visual Pages View ── */
          <FlatList
            ref={flatListRef}
            data={pages}
            keyExtractor={(p) => p.uri}
            {...listScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.list}
            initialNumToRender={2}
            maxToRenderPerBatch={3}
            windowSize={4}
            updateCellsBatchingPeriod={40}
            removeClippedSubviews={Platform.OS === 'android'}
            onScrollToIndexFailed={(info) => {
              flatListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
            }}
            renderItem={({ item, index }) => (
              <PageItem
                key={item.uri}
                item={item}
                index={index}
                totalPages={pages.length}
                pageW={pageW}
                zoom={zoom}
                text={pageTextsMap.get(index)}
                isExpanded={!!expandedTextPages[index]}
                isSearchHit={searchHitIndices.has(index)}
                onToggleExpand={handleToggleExpand}
                onCopyText={handleCopyText}
              />
            )}
          />
        ) : (
          /* ── Dedicated Selectable Text View ── */
          <FlatList
            ref={textListRef}
            data={pages}
            keyExtractor={(_, i) => `text-page-${i}`}
            {...listScroll}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={s.list}
            initialNumToRender={4}
            maxToRenderPerBatch={4}
            windowSize={4}
            updateCellsBatchingPeriod={40}
            removeClippedSubviews={Platform.OS === 'android'}
            onScrollToIndexFailed={(info) => {
              textListRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
            }}
            ListHeaderComponent={
              !hasAnyText ? (
                <View style={s.noTextNotice}>
                  <Icon name="information-outline" size={20} color={c.sub} />
                  <Text style={s.noTextNoticeText}>
                    No embedded text layer was found in this PDF. If this is a photo or scanned document, pages are pure images.
                  </Text>
                </View>
              ) : (
                <View style={s.selectionTip}>
                  <Icon name="gesture-tap-hold" size={16} color={c.accent} />
                  <Text style={s.selectionTipText}>
                    Long-press on any word to show native Android drag handles and drag to select text.
                  </Text>
                </View>
              )
            }
            renderItem={({ index }) => (
              <TextPageItem
                key={`text-${index}`}
                index={index}
                totalPages={pages.length}
                text={pageTextsMap.get(index)}
                isSearchHit={searchHitIndices.has(index)}
                onCopyText={handleCopyText}
              />
            )}
          />
        )}
        {pages.length > 2 && contentH > viewH * 2 && (
          <FastScroll
            key={mode} y={scrollY} contentH={contentH} viewH={viewH} count={pages.length}
            seek={(offset) => (mode === 'pages' ? flatListRef : textListRef).current?.scrollToOffset({ offset, animated: false })}
          />
        )}
        </View>
      ) : error ? (
        <View style={s.center}>
          <Text style={s.msg}>{error}</Text>
          {!!uri && (
            <Button
              icon="share-variant-outline"
              label="Share instead"
              onPress={() => share(file)}
              style={{ alignSelf: 'stretch', marginTop: 18 }}
            />
          )}
          <Button
            label="Back to Files"
            variant="secondary"
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/files'))}
            style={{ alignSelf: 'stretch', marginTop: 10 }}
          />
        </View>
      ) : (
        <View style={s.center}>
          <ActivityIndicator color={c.ink} />
          <Text style={[s.msg, { marginTop: 12 }]}>Loading document…</Text>
        </View>
      )}

      {/* ── Jump to Page Modal ── */}
      <DialogModal
        visible={jumpOpen}
        onClose={() => setJumpOpen(false)}
        title="Jump to Page"
        subtitle={pages ? `Enter page 1 to ${pages.length}` : undefined}
      >
        <TextInput
          autoFocus
          value={jumpInput}
          onChangeText={setJumpInput}
          placeholder={pages ? `1 - ${pages.length}` : 'Page number'}
          placeholderTextColor={c.faint}
          keyboardType="number-pad"
          style={[s.jumpInput, { marginTop: 14, marginBottom: 16 }]}
          keyboardAppearance={scheme}
          onSubmitEditing={handleJump}
        />
        <View style={s.quickJumps}>
          <Pressable onPress={() => { setJumpOpen(false); scrollToPage(0); }} style={s.quickJumpBtn}>
            <Text style={s.quickJumpText}>First Page (1)</Text>
          </Pressable>
          {pages && pages.length > 1 && (
            <Pressable onPress={() => { setJumpOpen(false); scrollToPage(pages.length - 1); }} style={s.quickJumpBtn}>
              <Text style={s.quickJumpText}>Last Page ({pages.length})</Text>
            </Pressable>
          )}
        </View>
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
          <Button label="Cancel" variant="secondary" onPress={() => setJumpOpen(false)} style={{ flex: 1 }} />
          <Button label="Go" variant="primary" onPress={handleJump} style={{ flex: 1 }} />
        </View>
      </DialogModal>

      {/* ── Thumbnails Grid Overview Modal ── */}
      <Modal visible={gridOpen} animationType="slide" onRequestClose={() => setGridOpen(false)}>
        <SafeAreaView edges={['top', 'bottom']} style={[s.root, { backgroundColor: c.surface }]}>
          <View style={s.bar}>
            <IconBtn name="close" size={22} onPress={() => setGridOpen(false)} />
            <Text style={s.name}>All Pages ({pages?.length || 0})</Text>
            <View style={{ width: 36 }} />
          </View>
          <FlatList
            style={{ flex: 1, backgroundColor: c.bg }}
            data={pages || []}
            numColumns={3}
            keyExtractor={(_, i) => `grid-${i}`}
            contentContainerStyle={s.gridContainer}
            initialNumToRender={12}
            maxToRenderPerBatch={9}
            windowSize={5}
            updateCellsBatchingPeriod={40}
            removeClippedSubviews={Platform.OS === 'android'}
            getItemLayout={(_, index) => ({
              length: 150,
              offset: 150 * Math.floor(index / 3),
              index,
            })}
            renderItem={({ item, index }) => (
              <GridTile item={item} index={index} onSelect={handleSelectGridPage} />
            )}
          />
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.sunken },
  bar: {
    flexDirection: 'row', alignItems: 'center', gap: 4, height: 50, paddingHorizontal: 6,
    backgroundColor: c.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong,
  },
  name: { flex: 1, textAlign: 'center', fontFamily: fonts.bold, fontSize: 14, color: c.ink },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  searchBar: {
    flexDirection: 'row', alignItems: 'center', gap: 8, height: 46, paddingHorizontal: 12,
    backgroundColor: c.surface, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong,
  },
  searchInput: { flex: 1, fontFamily: fonts.sans, fontSize: 14, color: c.ink, paddingVertical: 0 },
  matchCount: { fontFamily: fonts.med, fontSize: 12, color: c.sub },
  matchCountNone: { fontFamily: fonts.sans, fontSize: 12, color: c.accent },
  searchNav: { flexDirection: 'row', alignItems: 'center' },
  list: { padding: PAD, gap: 14 },
  pageWrapper: { gap: 6 },
  hitBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 5,
    backgroundColor: c.accentSoft, borderRadius: 6,
  },
  hitBannerText: { fontFamily: fonts.med, fontSize: 11.5, color: c.accentInk },
  page: { backgroundColor: '#FFFFFF', borderRadius: 3, borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong },
  pageFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 },
  pageNo: { ...typo.small, fontSize: 12, color: c.sub },
  selectTextToggle: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 2 },
  selectTextToggleLabel: { fontFamily: fonts.med, fontSize: 12, color: c.accent },
  inlineTextBox: {
    backgroundColor: c.surface, borderRadius: radius.tile, borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.lineStrong, padding: 12, marginTop: 4,
  },
  inlineTextHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  inlineTextTitle: { fontFamily: fonts.bold, fontSize: 12, color: c.ink },
  inlineCopyBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, padding: 4 },
  inlineCopyText: { fontFamily: fonts.med, fontSize: 11, color: c.sub },
  selectableContent: {
    fontFamily: fonts.sans,
    fontSize: 13.5,
    lineHeight: 22,
    color: c.ink,
    padding: 0,
    backgroundColor: 'transparent',
  },
  selectionTip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: radius.tile,
    backgroundColor: c.sunken,
    marginBottom: 10,
  },
  selectionTipText: {
    flex: 1,
    fontFamily: fonts.sans,
    fontSize: 12,
    color: c.sub,
    lineHeight: 17,
  },
  textCard: {
    backgroundColor: c.surface, borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth,
    borderColor: c.lineStrong, padding: 14,
  },
  textCardHighlighted: { borderColor: c.accent, borderWidth: 1.5 },
  textCardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  textCardHeadLeft: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  textCardPage: { fontFamily: fonts.bold, fontSize: 13, color: c.ink },
  emptyPageText: { fontFamily: fonts.sans, fontSize: 12, color: c.faint, fontStyle: 'italic' },
  noTextNotice: {
    flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: radius.tile,
    backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: c.lineStrong, marginBottom: 10,
  },
  noTextNoticeText: { flex: 1, fontFamily: fonts.sans, fontSize: 12, color: c.sub, lineHeight: 17 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  msg: { ...typo.body, color: c.sub, textAlign: 'center' },
  jumpInput: {
    height: 48, paddingHorizontal: 14, borderRadius: radius.control, borderWidth: 1, borderColor: c.line,
    backgroundColor: c.surface, fontFamily: fonts.sans, fontSize: 16, color: c.ink, textAlign: 'center',
  },
  quickJumps: { flexDirection: 'row', gap: 8, marginBottom: 6 },
  quickJumpBtn: { flex: 1, paddingVertical: 8, alignItems: 'center', backgroundColor: c.sunken, borderRadius: radius.tile },
  quickJumpText: { fontFamily: fonts.med, fontSize: 12, color: c.ink },
  fastWrap: { position: 'absolute', top: 0, right: 0, height: GRIP_H, flexDirection: 'row', alignItems: 'center', gap: 8 },
  fastGrip: {
    width: 34, height: GRIP_H, alignItems: 'center', justifyContent: 'center', borderTopLeftRadius: GRIP_H / 2,
    borderBottomLeftRadius: GRIP_H / 2, backgroundColor: c.surface, borderWidth: StyleSheet.hairlineWidth, borderRightWidth: 0,
    borderColor: c.lineStrong, elevation: 4, shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  fastBubble: {
    paddingHorizontal: 16, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: c.surface, elevation: 4,
    shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 6, shadowOffset: { width: 0, height: 2 },
  },
  fastBubbleText: { fontFamily: fonts.bold, fontSize: 20, color: c.ink },
  gridContainer: { padding: 8 },
  gridTile: { flex: 1 / 3, margin: 4, alignItems: 'center', backgroundColor: c.surface, borderRadius: 6, padding: 6 },
  gridThumb: { width: '100%', height: 110, borderRadius: 3 },
  gridPageNo: { fontFamily: fonts.med, fontSize: 11, color: c.sub, marginTop: 4 },
}));
