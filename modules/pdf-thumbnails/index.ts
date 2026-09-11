import { requireOptionalNativeModule } from 'expo';

export type Thumb = { uri: string; width: number; height: number };
type Native = { render(uri: string, maxWidth: number): Promise<Thumb[]> };

// Null in Expo Go and on web, where this native module isn't built in: callers fall back to plain tiles.
const native = requireOptionalNativeModule<Native>('PdfThumbnails');

export const renderThumbnails = (uri: string, maxWidth = 360): Promise<Thumb[] | null> =>
  native ? native.render(uri, maxWidth) : Promise.resolve(null);
