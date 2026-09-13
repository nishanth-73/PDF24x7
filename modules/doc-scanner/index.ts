import { requireNativeModule } from 'expo';

type Native = { scan(pageLimit: number): Promise<string[]> };

const native = requireNativeModule<Native>('DocScanner');

// Google's ML Kit document scanner: live edge detection, auto capture, auto crop, perspective fix, auto rotate,
// filters and stain/finger cleanup. Resolves to cropped page JPEG uris; [] if cancelled.
// Rejects when the device can't run it (no Play services, or under 1.7 GB RAM).
export const scanDocument = (pageLimit = 0): Promise<string[]> => native.scan(pageLimit);
