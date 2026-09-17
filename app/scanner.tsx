// The scanner flow: capture <-> review for one scan document. Opened fresh from Scan, or with ?id= to keep editing.
// Every change is written to disk as it happens, so a scan survives the app closing; leaving asks Save / Keep draft / Discard.
import { useEffect, useRef, useState } from 'react';
import { Alert, BackHandler, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Capture } from '../src/scan/Capture';
import { Review } from '../src/scan/Review';
import { RecentScans } from '../src/scan/Recent';
import {
  cleanFiles, deleteFile, discardChanges, exportPdf, isDirty, latestDraft, loadDoc, newDoc, renderShot, saveDoc, type Page, type ScanDoc,
} from '../src/scan/model';
import { openFile } from '../src/storage';
import { Button, DialogModal, plural } from '../src/ui';
import { fonts, useTheme } from '../src/theme';

export default function Scanner() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { c } = useTheme();
  const [doc, setDoc] = useState<ScanDoc>(() => (id && loadDoc(id)) || newDoc());
  const [view, setView] = useState<'capture' | 'review'>(id ? 'review' : 'capture');
  const [retake, setRetake] = useState<Page | null>(null);
  const [draft, setDraft] = useState<ScanDoc | null>(() => (id ? null : latestDraft()));
  const [asking, setAsking] = useState(false); // the leave dialog
  const [saving, setSaving] = useState(false);
  const [recentOpen, setRecentOpen] = useState(false);
  const rendering = useRef(new Set<string>());

  useEffect(() => {
    if (id) cleanFiles(doc); // sweep leftovers from a session that ended without saving or discarding
  }, []);

  const persisted = useRef(!!id);
  useEffect(() => { // autosave on every change (a small JSON write). Once on disk, keep saving even at 0 pages,
    if (!doc.pages.length && !persisted.current) return; // or deleted pages would come back after a restart
    saveDoc(doc);
    persisted.current = true;
  }, [doc]);

  useEffect(() => { // render every shot whose settings changed since its last render
    doc.pages.forEach((p) => p.shots.forEach((sh, i) => {
      if (sh.out && sh.outRev === sh.rev) return;
      const key = `${p.id}:${i}:${sh.rev}`;
      if (rendering.current.has(key)) return;
      rendering.current.add(key);
      renderShot(doc.id, sh)
        .then((r) => setDoc((d) => ({
          ...d,
          pages: d.pages.map((q) => q.id !== p.id ? q : {
            ...q,
            shots: q.shots.map((x, j) => {
              if (j !== i || x.src !== sh.src || x.rev !== sh.rev) { // edited again meanwhile: drop this render
                if (j === i) deleteFile(r.out);
                return x;
              }
              // the previous render stays until cleanFiles, in case Discard restores it
              return { ...x, out: r.out, outW: r.outW, outH: r.outH, bg: r.bg, outRev: r.outRev };
            }),
          }),
        })))
        .catch(() => setDoc((d) => ({ // unreadable photo: show and export the original rather than blocking Save forever
          ...d,
          pages: d.pages.map((q) => q.id !== p.id ? q : {
            ...q,
            shots: q.shots.map((x, j) => (j === i && x.rev === sh.rev ? { ...x, out: x.src, outW: x.width, outH: x.height, outRev: x.rev } : x)),
          }),
        })))
        .finally(() => rendering.current.delete(key));
    }));
  }, [doc]);

  const left = useRef(false); // repeated taps (close, dialog buttons) must pop the scanner only once
  const back = () => {
    if (left.current) return;
    left.current = true;
    router.back();
  };

  const leave = () => {
    if (isDirty(doc) && (doc.pages.length || doc.saved)) setAsking(true);
    else back();
  };

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (view === 'capture' && doc.pages.length) {
        setRetake(null);
        setView('review');
      } else {
        leave();
      }
      return true;
    });
    return () => sub.remove();
  }, [view, doc]);

  const addPage = (page: Page) => setDoc((d) => {
    const at = d.pages.findIndex((q) => q.id === page.id);
    return at < 0 ? { ...d, pages: [...d.pages, page] } : { ...d, pages: d.pages.map((q, j) => (j === at ? page : q)) };
  });

  const save = async () => {
    try {
      const saved = await exportPdf(doc);
      setDoc(saved);
      back();
      openFile(saved.pdf!);
    } catch (e) {
      Alert.alert('Couldn’t save the PDF', e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <>
      <StatusBar style="light" />
      {view === 'capture' || !doc.pages.length ? ( // review needs pages; with none, the camera is the only useful screen
        <Capture
          doc={doc} retake={retake} paused={!!draft || asking || recentOpen} onAdd={addPage}
          onRecent={() => setRecentOpen(true)}
          onReview={() => { setRetake(null); setView('review'); }}
          onClose={leave}
        />
      ) : (
        <Review
          doc={doc} setDoc={setDoc} onClose={leave} onSave={save}
          onAddMore={() => { setRetake(null); setView('capture'); }}
          onRetake={(p) => { setRetake(p); setView('capture'); }}
        />
      )}

      {recentOpen && (
        <RecentScans
          onClose={() => setRecentOpen(false)}
          onPick={(picked) => { setDoc(picked); setView('review'); setRecentOpen(false); setDraft(null); }}
        />
      )}

      <DialogModal
        visible={asking} onClose={() => setAsking(false)}
        title={doc.saved ? 'Save your changes?' : 'Save this scan?'}
        subtitle={doc.saved ? 'You edited this scan after saving the PDF.' : `${plural(doc.pages.length, 'page')}, not saved as a PDF yet.`}
      >
        <View style={{ gap: 10, marginTop: 18 }}>
          {doc.pages.length > 0 && <Button
            icon="file-pdf-box" label={doc.saved ? 'Update PDF' : 'Save PDF'} busy={saving}
            onPress={async () => { setSaving(true); try { await save(); } finally { setSaving(false); setAsking(false); } }}
          />}
          <Button
            icon="content-save-outline" label="Keep as draft" variant="secondary"
            onPress={() => { saveDoc(doc); setAsking(false); back(); }}
          />
          <Button
            icon="delete-outline" label={doc.saved ? 'Discard changes' : 'Discard scan'} variant="danger"
            onPress={() => { discardChanges(doc); setAsking(false); back(); }}
          />
          <Text style={{ fontFamily: fonts.sans, fontSize: 12.5, color: c.sub, textAlign: 'center' }}>
            Drafts stay in Scan → Recent scans, even after closing the app.
          </Text>
        </View>
      </DialogModal>

      <DialogModal
        visible={!!draft} onClose={() => setDraft(null)} title="Continue your unsaved scan?"
        subtitle={draft ? `${draft.name} · ${plural(draft.pages.length, 'page')}` : undefined}
      >
        <View style={{ gap: 10, marginTop: 18 }}>
          <Button
            icon="file-document-edit-outline" label="Continue editing"
            onPress={() => { if (draft) { setDoc(draft); setView('review'); } setDraft(null); }}
          />
          <Button icon="camera-outline" label="Start a new scan" variant="secondary" onPress={() => setDraft(null)} />
          <Button
            icon="delete-outline" label={draft?.saved ? 'Discard its changes' : 'Discard it'} variant="danger"
            onPress={() => { if (draft) discardChanges(draft); setDraft(null); }}
          />
        </View>
      </DialogModal>
    </>
  );
}
