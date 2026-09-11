import { requireNativeModule } from 'expo';

export type Thumb = { uri: string; width: number; height: number };
type Native = { render(uri: string, maxWidth: number): Promise<Thumb[]> };

const native = requireNativeModule<Native>('PdfThumbnails');

// Renders every page of a PDF to a JPEG `maxWidth` pixels wide.
export const renderThumbnails = (uri: string, maxWidth = 360): Promise<Thumb[]> => native.render(uri, maxWidth);
