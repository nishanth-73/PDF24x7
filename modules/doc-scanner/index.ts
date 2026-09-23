import type { ComponentType, Ref } from 'react';
import type { ViewProps } from 'react-native';
import { requireNativeModule, requireNativeView } from 'expo';

// [x0,y0, x1,y1, x2,y2, x3,y3]: top-left, top-right, bottom-right, bottom-left, as fractions of the upright photo.
export type Corners = number[];
export type Filter = 'original' | 'auto' | 'light' | 'gray' | 'whiteboard';
export type Stroke = { shape: 'path' | 'rect' | 'fill' | 'ellipse'; points: number[]; width: number; color: string };
export type Photo = { uri: string; width: number; height: number; corners: Corners | null };
export type ProcessOptions = {
  corners?: Corners | null; rotation?: number; filter?: Filter; brightness?: number; contrast?: number;
  strokes?: Stroke[]; maxSize?: number; dest?: string;
};
export type Processed = { uri: string; width: number; height: number; bg: string };

type Native = {
  detect(uri: string): Promise<Photo>;
  process(uri: string, options: ProcessOptions): Promise<Processed>;
  autoCrop(uri: string): Promise<[number, number, number, number] | null>;
};

const native = requireNativeModule<Native>('DocScanner');

/** Finds the page in an existing photo. `corners` is null when none is found. */
export const detectPage = (uri: string) => native.detect(uri);
/** Straightens, rotates, filters, adjusts and draws strokes, writing a JPEG. */
export const processImage = (uri: string, options: ProcessOptions) => native.process(uri, options);
/** What to keep of a rendered PDF page: [x, y, w, h] fractions, y from the top. Null when there's nothing to trim. */
export const autoCropPage = (uri: string) => native.autoCrop(uri);

export type DocCameraRef = { capture(): Promise<Photo> };
export type DocCameraProps = ViewProps & {
  ref?: Ref<DocCameraRef>;
  flash?: 'off' | 'on' | 'auto';
  detect?: boolean;
  qr?: boolean;
  onDetect?: (e: { nativeEvent: { corners: Corners } }) => void; // empty array when no page is in view
  onQr?: (e: { nativeEvent: { data: string } }) => void;
};

/** Back camera with live page detection. The preview is 3:4; give the view a 3:4 box so overlays line up. */
export const DocCameraView = requireNativeView('DocScanner') as ComponentType<DocCameraProps>;
