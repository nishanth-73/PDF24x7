// Shown once, before anything else, on a fresh install — and again from Settings to read back. One plain screen that
// fits without scrolling: what the app does with your files, then a tick for each document. The documents themselves
// open on top, since that is the only part long enough to need scrolling.
import { useState } from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Icon } from './ui';
import { TERMS_UPDATED } from './terms';
import { fonts, makeStyles, typo, useTheme } from './theme';
import type { IconName } from './tools';

// A published privacy policy needs somewhere to write to. Set this to a real address before release.
const CONTACT = 'support@example.com';

const POINTS: [IconName, string][] = [
  ['cellphone-lock', 'Every tool runs on this phone'],
  ['account-off-outline', 'No account, no tracking, no ads'],
  ['google-drive', 'Google Drive backup is optional'],
  ['wifi-off', 'Works with no connection'],
];

const PRIVACY = `1. What we collect
Nothing. PDF Tools has no accounts, no analytics, no advertising and no crash reporting. We do not collect, receive or store your documents, your name, your email address or any identifier.

2. Where your files live
Every tool runs entirely on this device. Saved PDFs are kept in the app's own private storage, which other apps cannot read. They are never sent to us, because there is nowhere to send them to.

3. Google Drive backup
Off unless you turn it on. When you do, the app signs in to the Google account you choose and copies your saved PDFs to your own Google Drive. Those files travel from this phone to Google directly. You can disconnect at any time in Settings, which revokes the app's access to your account. What Google does with files in your Drive is covered by Google's own privacy policy.

4. Permissions
Camera is used only while you are scanning a document. Photos is used only when you pick an image to turn into a PDF or to place a signature. Neither is used in the background, and the app asks the first time it needs each one.

5. Reading text from scans
Making a scanned PDF searchable uses a text recognition model built into the app. The page images and the text read from them never leave the device, and it needs no connection.

6. Children
The app is not directed at children under 13, and collects no data from anyone of any age.

7. Changes
If this policy changes in a way that matters, the app will show it to you again before you carry on.

8. Contact
Questions about this policy: ${CONTACT}`;

const TERMS = `1. The app
PDF Tools is provided free of charge, as is, for use on your own device.

2. Your files are your responsibility
The app changes documents you choose, and some changes cannot be undone: redaction removes content for good, a password locks a file, cropping discards part of a page. Keep your own copy of anything you cannot afford to lose. We have no copy and cannot recover one for you.

3. Acceptable use
Do not use the app to alter documents in order to deceive anyone, to forge a signature, or for anything unlawful where you live. Placing a signature image on a document is not a statement about that document's legal standing — whether a signed PDF binds anyone depends on your local law and on the parties involved.

4. No warranty
The app comes with no warranty of any kind. Page detection, text recognition and compression are approximate by their nature, and any tool may contain errors. Check the result before you rely on it.

5. Limitation of liability
So far as the law allows, we are not liable for lost data, lost profits, or any indirect or consequential loss arising from your use of the app.

6. Third-party services
Google Drive backup is optional and is governed by Google's own terms of service.

7. Changes
If these terms change, the app will ask you to accept them again. Continuing to use it means you accept the version shown.`;

const DOCS = { privacy: ['Privacy Policy', PRIVACY], terms: ['Terms & Conditions', TERMS] } as const;
type DocKey = keyof typeof DOCS;

export function Consent({ onAccept, onClose }: { onAccept?: () => void; onClose?: () => void }) {
  const s = useStyles();
  const { c } = useTheme();
  const [doc, setDoc] = useState<DocKey | null>(null);
  const [ticked, setTicked] = useState<Record<DocKey, boolean>>({ privacy: false, terms: false });
  const both = ticked.privacy && ticked.terms;

  const tick = (key: DocKey, before: string) => (
    <Pressable
      onPress={() => setTicked((t) => ({ ...t, [key]: !t[key] }))}
      style={s.tickRow} accessibilityRole="checkbox" accessibilityState={{ checked: ticked[key] }}
    >
      <View style={[s.box, ticked[key] && { backgroundColor: c.accent, borderColor: c.accent }]}>
        {ticked[key] && <Icon name="check" size={15} color="#FFFFFF" />}
      </View>
      <Text style={s.tickText}>
        {before}{' '}
        <Text style={s.link} onPress={() => setDoc(key)} suppressHighlighting>{DOCS[key][0]}</Text>
      </Text>
    </Pressable>
  );

  return (
    <SafeAreaView style={s.root} edges={['top', 'bottom']}>
      {!!onClose && (
        <View style={s.docBar}>
          <View />
          <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
            <Icon name="close" size={24} color={c.ink} />
          </Pressable>
        </View>
      )}
      <View style={s.middle}>
        <Icon name="file-pdf-box" size={46} color={c.accent} />
        <Text style={s.title}>PDF Tools</Text>
        <Text style={s.sub}>Your documents never leave this phone.</Text>

        <View style={s.points}>
          {POINTS.map(([icon, label]) => (
            <View key={label} style={s.point}>
              <Icon name={icon} size={18} color={c.sub} />
              <Text style={s.pointText}>{label}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={s.bottom}>
        {onAccept ? (
          <>
            {tick('privacy', 'I have read the')}
            {tick('terms', 'I agree to the')}
            <Button label="Continue" disabled={!both} onPress={onAccept} style={{ marginTop: 14 }} />
          </>
        ) : (
          <>
            <Text style={[s.link, s.readLink]} onPress={() => setDoc('privacy')}>Privacy Policy</Text>
            <Text style={[s.link, s.readLink]} onPress={() => setDoc('terms')}>Terms & Conditions</Text>
          </>
        )}
        <Text style={s.updated}>Last updated {TERMS_UPDATED}</Text>
      </View>

      <Modal visible={!!doc} animationType="slide" onRequestClose={() => setDoc(null)}>
        <SafeAreaView style={s.root} edges={['top', 'bottom']}>
          <View style={s.docBar}>
            <Text style={s.docTitle}>{doc ? DOCS[doc][0] : ''}</Text>
            <Pressable onPress={() => setDoc(null)} hitSlop={10} accessibilityLabel="Close">
              <Icon name="close" size={24} color={c.ink} />
            </Pressable>
          </View>
          <ScrollView contentContainerStyle={s.docBody} showsVerticalScrollIndicator={false}>
            <Text style={s.docText}>{doc ? DOCS[doc][1] : ''}</Text>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.bg },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 30 },
  title: { ...typo.largeTitle, color: c.ink, marginTop: 12 },
  sub: { fontFamily: fonts.sans, fontSize: 15, color: c.sub, marginTop: 6, textAlign: 'center' },
  points: { marginTop: 30, gap: 14, alignSelf: 'stretch' },
  point: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pointText: { fontFamily: fonts.sans, fontSize: 14.5, color: c.ink, flex: 1 },
  bottom: { paddingHorizontal: 24, paddingBottom: 6 },
  tickRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9 },
  box: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: c.lineStrong, alignItems: 'center', justifyContent: 'center' },
  tickText: { fontFamily: fonts.sans, fontSize: 14, color: c.sub, flex: 1 },
  link: { fontFamily: fonts.med, color: c.accent },
  readLink: { fontSize: 15, paddingVertical: 11 },
  updated: { ...typo.small, color: c.faint, textAlign: 'center', marginTop: 14 },
  docBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, height: 56 },
  docTitle: { fontFamily: fonts.bold, fontSize: 18, color: c.ink },
  docBody: { paddingHorizontal: 20, paddingBottom: 40 },
  docText: { fontFamily: fonts.sans, fontSize: 14, lineHeight: 22, color: c.sub },
}));
