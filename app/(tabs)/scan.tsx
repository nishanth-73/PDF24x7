import { Redirect } from 'expo-router';

// No Scan screen any more: the round Scan button in the tab bar opens the camera. This route only keeps the tab slot
// (and any old "/scan" link) pointing at the scanner.
export default function ScanTab() {
  return <Redirect href="/scanner" />;
}
