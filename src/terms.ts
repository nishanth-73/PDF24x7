// Whether the terms and privacy policy have been accepted on this device. Raising TERMS_VERSION shows the screen
// again after an update, which is what the policy itself promises.
import { File, Paths } from 'expo-file-system';

export const TERMS_VERSION = 2;
export const TERMS_UPDATED = '22 September 2026';

const stateFile = () => new File(Paths.document, 'consent.json');

export function acceptedTerms(): boolean {
  try {
    return (JSON.parse(stateFile().textSync()) as { version?: number }).version === TERMS_VERSION;
  } catch {
    return false; // never accepted, or the file is unreadable: ask again rather than assume
  }
}

export function acceptTerms() {
  try {
    const f = stateFile();
    if (!f.exists) f.create();
    f.write(JSON.stringify({ version: TERMS_VERSION, at: Date.now() }));
  } catch {} // a phone that can't write this just asks again next launch
}
