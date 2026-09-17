// Hand-drawn tool pictures for operations a stock icon can't show (interleave, split by bookmark, n-up…).
// One visual grammar: ink pages are your input, red pages are the result. Drawn on a 48×48 grid.
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import { fonts, makeStyles, radius, useTheme, type Palette } from './theme';

type Kit = { fill: string; stroke: string; line: string; accent: string; soft: string };
const kitOf = (c: Palette): Kit => ({ fill: c.page, stroke: c.ink, line: c.faint, accent: c.accent, soft: c.accentSoft });
const SW = 1.5;

type PageProps = { x: number; y: number; w: number; h: number; k: Kit; lines?: number; from?: number; stripe?: boolean; accent?: boolean };
function Page({ x, y, w, h, k, lines = 3, from, stripe, accent }: PageProps) {
  const f = Math.round(w * 0.3);
  const stroke = accent ? k.accent : k.stroke;
  const top = from ?? y + f + 3;
  return (
    <G>
      <Path d={`M${x} ${y}H${x + w - f}L${x + w} ${y + f}V${y + h}H${x}Z`} fill={accent ? k.soft : k.fill} stroke={stroke} strokeWidth={SW} strokeLinejoin="round" />
      <Path d={`M${x + w - f} ${y}V${y + f}H${x + w}`} fill="none" stroke={stroke} strokeWidth={SW} strokeLinejoin="round" />
      {Array.from({ length: lines }, (_, i) => {
        const ly = top + i * 3.6;
        const end = i === lines - 1 && lines > 1 ? x + w * 0.55 : x + w - 3.5;
        return (
          <Line key={i} x1={x + 3.5} y1={ly} x2={end} y2={ly} stroke={stripe && i % 2 ? k.accent : k.line} strokeWidth={1.4} strokeLinecap="round" />
        );
      })}
    </G>
  );
}

const Mark = ({ d, k, w = 1.8, dash }: { d: string; k: Kit; w?: number; dash?: boolean }) => (
  <Path d={d} fill="none" stroke={k.accent} strokeWidth={w} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash ? '3 3' : undefined} />
);

const ART: Record<string, (k: Kit) => ReactNode> = {
  scan: (k) => (
    <>
      <Page x={15} y={12} w={18} h={24} k={k} />
      <Mark k={k} w={2} d="M9 17V10H16M32 10H39V17M9 31V38H16M39 31V38H32" />
    </>
  ),
  workflow: (k) => (
    <>
      <Page x={4} y={12} w={17} h={23} k={k} />
      <Mark k={k} d="M24 23.5H29.5M27.5 21.5L29.5 23.5L27.5 25.5" />
      <Line x1={36} y1={12} x2={36} y2={36} stroke={k.accent} strokeWidth={1.5} />
      {[12, 24, 36].map((cy, i) => (
        <Circle key={cy} cx={36} cy={cy} r={3.4} fill={i === 2 ? k.accent : k.soft} stroke={k.accent} strokeWidth={1.5} />
      ))}
    </>
  ),
  merge: (k) => (
    <>
      <Page x={4} y={6} w={13} h={17} k={k} lines={2} />
      <Page x={4} y={25} w={13} h={17} k={k} lines={2} />
      <Mark k={k} d="M19.5 14.5C24 14.5 23 24 27.5 24M19.5 33.5C24 33.5 23 24 27.5 24M25 21.5L27.5 24L25 26.5" />
      <Page x={30} y={12} w={15} h={24} k={k} accent />
    </>
  ),
  alternate: (k) => (
    <>
      <Page x={4} y={5} w={15} h={19} k={k} lines={2} />
      <Page x={29} y={5} w={15} h={19} k={k} lines={2} accent />
      <Page x={14} y={19} w={20} h={25} k={k} lines={5} stripe />
    </>
  ),
  compress: (k) => (
    <>
      <Page x={15} y={13} w={18} h={22} k={k} />
      <Mark k={k} d="M24 3V10M20.5 6.5L24 10L27.5 6.5M24 45V38M20.5 41.5L24 38L27.5 41.5" />
    </>
  ),
  split: (k) => (
    <>
      <Page x={3} y={12} w={17} h={24} k={k} />
      <Page x={28} y={12} w={17} h={24} k={k} accent />
      <Mark k={k} w={1.6} dash d="M24 5V43" />
    </>
  ),
  splitText: (k) => (
    <>
      <Page x={11} y={5} w={26} h={33} k={k} lines={0} />
      <Line x1={14.5} y1={17} x2={30} y2={17} stroke={k.line} strokeWidth={1.4} strokeLinecap="round" />
      <Line x1={14.5} y1={21} x2={33.5} y2={21} stroke={k.line} strokeWidth={1.4} strokeLinecap="round" />
      <Rect x={13} y={23.5} width={22} height={5.5} rx={1.5} fill={k.soft} />
      <Line x1={15.5} y1={26.25} x2={31} y2={26.25} stroke={k.accent} strokeWidth={1.6} strokeLinecap="round" />
      <Line x1={14.5} y1={32} x2={27} y2={32} stroke={k.line} strokeWidth={1.4} strokeLinecap="round" />
      <Mark k={k} w={1.6} dash d="M9 43H43" />
      <Path d="M3 40L7.5 43L3 46Z" fill={k.accent} />
    </>
  ),
  splitBookmarks: (k) => (
    <>
      <Page x={11} y={8} w={26} h={33} k={k} lines={4} from={26} />
      <Path d="M16 5V22L19.5 18.5L23 22V5Z" fill={k.accent} stroke={k.accent} strokeWidth={1.2} strokeLinejoin="round" />
    </>
  ),
  splitHalf: (k) => (
    <>
      <Path d="M5 13Q14 10 23 13V38Q14 35 5 38Z" fill={k.fill} stroke={k.stroke} strokeWidth={SW} strokeLinejoin="round" />
      <Path d="M25 13Q34 10 43 13V38Q34 35 25 38Z" fill={k.soft} stroke={k.accent} strokeWidth={SW} strokeLinejoin="round" />
      {[19, 23, 27].map((y) => (
        <G key={y}>
          <Line x1={9} y1={y} x2={19} y2={y} stroke={k.line} strokeWidth={1.4} strokeLinecap="round" />
          <Line x1={29} y1={y} x2={39} y2={y} stroke={k.line} strokeWidth={1.4} strokeLinecap="round" />
        </G>
      ))}
      <Mark k={k} w={1.6} dash d="M24 5V44" />
    </>
  ),
  splitSize: (k) => (
    <>
      <Page x={6} y={6} w={24} h={34} k={k} lines={5} />
      <Mark k={k} w={1.6} dash d="M3 24H33" />
      <Mark k={k} w={1.6} d="M39 6V40M36.5 6H41.5M36.5 40H41.5M37 24H41" />
    </>
  ),
  organize: (k) => (
    <>
      <Page x={5} y={4} w={14} h={18} k={k} lines={2} />
      <Page x={27} y={4} w={14} h={18} k={k} lines={2} />
      <Page x={5} y={26} w={14} h={18} k={k} lines={2} />
      <Rect x={27} y={26} width={14} height={18} rx={1.5} fill="none" stroke={k.line} strokeWidth={1.4} strokeDasharray="2.5 2" />
      <G transform="rotate(8 31 31)">
        <Page x={23} y={21} w={14} h={18} k={k} lines={2} accent />
      </G>
    </>
  ),
  rotate: (k) => (
    <>
      <G transform="rotate(-12 24 24)">
        <Page x={16} y={13.5} w={16} h={21} k={k} />
      </G>
      <Mark k={k} d="M40.5 14.5A19 19 0 0 1 30.5 41.9M34.3 43.3L30.5 41.9L32.5 38.4" />
    </>
  ),
  flip: (k) => (
    <>
      <Page x={4} y={9} w={17} h={24} k={k} />
      <G transform="translate(48 0) scale(-1 1)">
        <Page x={4} y={9} w={17} h={24} k={k} accent />
      </G>
      <Mark k={k} w={1.6} dash d="M24 4V36" />
      <Mark k={k} w={1.6} d="M16 41H32M18.5 38.5L16 41L18.5 43.5M29.5 38.5L32 41L29.5 43.5" />
    </>
  ),
  nup: (k) => (
    <>
      <Page x={9} y={5} w={30} h={38} k={k} lines={0} />
      {[[13, 15], [25, 15], [13, 29], [25, 29]].map(([x, y]) => (
        <Rect key={`${x}-${y}`} x={x} y={y} width={10} height={11} rx={1.2} fill={k.soft} stroke={k.accent} strokeWidth={1.3} />
      ))}
    </>
  ),
  crop: (k) => (
    <>
      <Page x={12} y={11} w={24} h={29} k={k} />
      <Mark k={k} w={2} d="M7 16H32V41M16 7V32H41" />
    </>
  ),
  zip: (k) => (
    <>
      <Page x={15} y={5} w={24} h={29} k={k} lines={0} />
      <Page x={9} y={12} w={24} h={31} k={k} lines={0} />
      {[0, 1, 2, 3, 4].map((i) => (
        <Rect key={i} x={i % 2 ? 19.5 : 17} y={21 + i * 3.2} width={2.5} height={2.5} fill={k.accent} />
      ))}
      <Rect x={16.5} y={37} width={5.5} height={5} rx={1.2} fill={k.soft} stroke={k.accent} strokeWidth={1.3} />
    </>
  ),
  watermark: (k) => (
    <>
      <Page x={9} y={5} w={30} h={38} k={k} lines={6} />
      <SvgText x={24} y={28} fontSize={8.5} fontFamily={fonts.bold} fill={k.accent} textAnchor="middle" transform="rotate(-38 24 25)">
        DRAFT
      </SvgText>
    </>
  ),
  redact: (k) => (
    <>
      <Page x={9} y={5} w={30} h={38} k={k} lines={0} />
      <Line x1={13.5} y1={17} x2={30} y2={17} stroke={k.line} strokeWidth={1.4} strokeLinecap="round" />
      <Rect x={12.5} y={20.5} width={18} height={4.5} rx={1} fill={k.stroke} />
      <Line x1={13.5} y1={29.5} x2={34.5} y2={29.5} stroke={k.line} strokeWidth={1.4} strokeLinecap="round" />
      <Rect x={20} y={33} width={15} height={4.5} rx={1} fill={k.accent} />
    </>
  ),
  password: (k) => (
    <>
      <Page x={7} y={5} w={26} h={34} k={k} lines={4} />
      <Path d="M27.5 29V25A5 5 0 0 1 37.5 25V29" fill="none" stroke={k.accent} strokeWidth={2.2} />
      <Rect x={24} y={28} width={17} height={14} rx={2.5} fill={k.accent} />
      <Circle cx={32.5} cy={34.5} r={1.9} fill={k.fill} />
    </>
  ),
  pageNumbers: (k) => (
    <>
      <Page x={9} y={5} w={30} h={38} k={k} lines={4} />
      <Rect x={18} y={34} width={12} height={6.5} rx={3.25} fill={k.accent} />
      <SvgText x={24} y={39} fontSize={5.5} fontFamily={fonts.bold} fill={k.fill} textAnchor="middle">
        12
      </SvgText>
    </>
  ),
  files: (k) => (
    <>
      <G transform="rotate(-10 24 30)">
        <Page x={10} y={9} w={22} h={29} k={k} lines={0} />
      </G>
      <G transform="rotate(7 24 30)">
        <Page x={16} y={9} w={22} h={29} k={k} lines={0} />
      </G>
      <Page x={13} y={12} w={22} h={29} k={k} lines={4} accent />
    </>
  ),
};

export function ToolArt({ id, size = 40 }: { id: string; size?: number }) {
  const { c } = useTheme();
  const draw = ART[id];
  if (!draw) return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 48 48">
      {draw(kitOf(c))}
    </Svg>
  );
}

export function ArtTile({ id, size = 44 }: { id: string; size?: number }) {
  const s = useStyles();
  return (
    <View style={[s.tile, { width: size, height: size, borderRadius: size > 50 ? radius.card : radius.tile }]}>
      <ToolArt id={id} size={Math.round(size * 0.8)} />
    </View>
  );
}

// File thumbnail for lists: a page with a PDF / ZIP / DOC / JPG label.
export function DocGlyph({ kind, size = 36 }: { kind: DocKind; size?: number }) {
  const { c } = useTheme();
  const k = kitOf(c);
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36">
      <Page x={8} y={3} w={22} h={30} k={k} lines={0} />
      <Rect x={3} y={17} width={20} height={9} rx={2} fill={kind === 'zip' ? k.stroke : k.accent} />
      <SvgText x={13} y={24} fontSize={6.5} fontFamily={fonts.bold} fill={k.fill} textAnchor="middle">
        {kind.toUpperCase()}
      </SvgText>
    </Svg>
  );
}

// Folder icon for file-list rows.
export function FolderGlyph({ size = 36 }: { size?: number }) {
  const { c } = useTheme();
  const k = kitOf(c);
  return (
    <Svg width={size} height={size} viewBox="0 0 36 36">
      <Path d="M4 10C4 8.9 4.9 8 6 8H14L17 12H30C31.1 12 32 12.9 32 14V28C32 29.1 31.1 30 30 30H6C4.9 30 4 29.1 4 28V10Z" fill={k.soft} stroke={k.accent} strokeWidth={1.5} strokeLinejoin="round" />
    </Svg>
  );
}

export type DocKind = 'pdf' | 'zip' | 'doc' | 'jpg';
export const kindOf = (name: string): DocKind => {
  const ext = name.toLowerCase().split('.').pop();
  return ext === 'zip' ? 'zip' : ext === 'docx' ? 'doc' : ext === 'jpg' ? 'jpg' : 'pdf';
};

const useStyles = makeStyles((c) => ({
  tile: { backgroundColor: c.sunken, alignItems: 'center', justifyContent: 'center' },
}));
