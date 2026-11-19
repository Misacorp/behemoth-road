/**
 * The only place colours are written. Every colour the art uses comes from a palette here (a test checks it).
 * Colours are pastel and broken (slightly greyed); ink is a soft sepia, indigo or olive, never black.
 */
export interface Ramp {
  readonly light: string;
  readonly base: string;
  readonly shade: string;
}

export const MATERIALS = [
  'grass',
  'moss',
  'heath',
  'sand',
  'rock',
  'water',
  'earth',
  'neutral',
  'foliage',
  'conifer',
  'bark',
  'stone',
  'hide',
  'trodden',
] as const;
export type Material = (typeof MATERIALS)[number];

export const ACCENTS = ['rose', 'ochre', 'teal', 'plum', 'sage', 'slate', 'coral', 'sky'] as const;
export type Accent = (typeof ACCENTS)[number];

export interface Palette {
  readonly id: string;
  readonly name: string;
  readonly paper: string;
  readonly paperDeep: string;
  readonly ink: string;
  readonly inkSoft: string;
  readonly shadow: string;
  readonly fog: string;
  readonly hint: string;
  readonly skin: string;
  /** Skin tones for characters (the first is `skin`). */
  readonly skins: readonly string[];
  readonly belly: string;
  readonly marking: string;
  readonly horn: string;
  readonly ramps: Readonly<Record<Material, Ramp>>;
  readonly accents: Readonly<Record<Accent, Ramp>>;
}

const r = (light: string, base: string, shade: string): Ramp => ({ light, base, shade });

/** Warm: cream paper, sepia ink, peach and ochre washes. */
export const MORNING: Palette = {
  id: 'morning',
  name: 'Morning',
  paper: '#f4ecdc',
  paperDeep: '#e4d6bc',
  ink: '#6b5442',
  inkSoft: '#a08b74',
  shadow: '#8a735c',
  fog: '#ebe4d6',
  hint: '#c98f6b',
  skin: '#f0d8c0',
  skins: ['#f0d8c0', '#d9b48f', '#a97d5c'],
  belly: '#f0e0cb',
  marking: '#a8846f',
  horn: '#efe3cb',
  ramps: {
    grass: r('#e2e3c1', '#cdd1a3', '#aab083'),
    moss: r('#cfd5a9', '#b3bb8c', '#909a6e'),
    heath: r('#e6d9b0', '#d1c293', '#ad9f73'),
    sand: r('#f2e0bb', '#e6cc9c', '#c9ad7d'),
    rock: r('#ddd5ca', '#bfb5a8', '#9a8f82'),
    water: r('#cde0df', '#aac7c9', '#86a8ac'),
    earth: r('#dccaa9', '#c2ab89', '#9f8a6c'),
    neutral: r('#e6ddcd', '#d1c7b5', '#aea492'),
    foliage: r('#c3cfa2', '#a0b17f', '#7d8e62'),
    conifer: r('#adbd9a', '#8a9d7d', '#68795f'),
    bark: r('#bfa58b', '#a08670', '#7e6652'),
    stone: r('#e8dfcf', '#cbbfa9', '#a69983'),
    hide: r('#e2c8b6', '#c9a693', '#a3816f'),
    trodden: r('#e9d2b6', '#d6b994', '#b39672'),
  },
  accents: {
    rose: r('#ecc8c3', '#d9a3a0', '#b48280'),
    ochre: r('#efd9a8', '#ddba7c', '#b99a5e'),
    teal: r('#c3dbd5', '#93bdb5', '#729a93'),
    plum: r('#d6c9dc', '#b5a0bf', '#917e9c'),
    sage: r('#d6e2c6', '#adc497', '#8ba376'),
    slate: r('#d0d6de', '#a0abbb', '#7f8a9b'),
    coral: r('#f2cbbb', '#e4a28b', '#c0826c'),
    sky: r('#cde1ef', '#9cc2dc', '#7ca2bc'),
  },
};

/** Cool: grey-blue paper, indigo ink, sage and slate washes. */
export const MIST: Palette = {
  id: 'mist',
  name: 'Mist',
  paper: '#eef0ea',
  paperDeep: '#d9dfda',
  ink: '#4e5873',
  inkSoft: '#8890a6',
  shadow: '#5f6880',
  fog: '#e3e7e5',
  hint: '#8fa8c9',
  skin: '#eedcd0',
  skins: ['#eedcd0', '#d4b296', '#a07c62'],
  belly: '#e8e5ee',
  marking: '#8f89a8',
  horn: '#ecebe2',
  ramps: {
    grass: r('#dce4d1', '#c0ceb5', '#9dad95'),
    moss: r('#cfdac6', '#afc1a8', '#8ea18a'),
    heath: r('#e0ddc7', '#c7c3a7', '#a4a085'),
    sand: r('#ece4cf', '#d9cdb2', '#b8ab91'),
    rock: r('#d6d9dc', '#b6bbc2', '#9399a2'),
    water: r('#c9d9e2', '#a5bdcc', '#829bb0'),
    earth: r('#d2d3ca', '#b3b5ab', '#93958c'),
    neutral: r('#e0e2dd', '#c9ccc6', '#a7aba5'),
    foliage: r('#b8cab8', '#94a997', '#728775'),
    conifer: r('#a8bcb6', '#839a92', '#627870'),
    bark: r('#b4aaa3', '#978c86', '#756b66'),
    stone: r('#e2e2dd', '#c6c7c1', '#a2a49e'),
    hide: r('#d6d2e2', '#b0abc4', '#8d88a3'),
    trodden: r('#e2d8cc', '#cbbca9', '#a89884'),
  },
  accents: {
    rose: r('#ead0d3', '#d6a7ad', '#b4878e'),
    ochre: r('#ece0bd', '#dcc58e', '#b9a36f'),
    teal: r('#c4dcdb', '#8fbcbc', '#6f9a9b'),
    plum: r('#d3cce2', '#ab9ec4', '#8a7ea3'),
    sage: r('#d6e2c6', '#adc497', '#8ba376'),
    slate: r('#d0d6de', '#a0abbb', '#7f8a9b'),
    coral: r('#f2cbbb', '#e4a28b', '#c0826c'),
    sky: r('#cde1ef', '#9cc2dc', '#7ca2bc'),
  },
};

/** Green: warm paper, olive-sepia ink, fresh sage and meadow washes. */
export const SPRING: Palette = {
  id: 'spring',
  name: 'Spring',
  paper: '#f3f1e2',
  paperDeep: '#e1ddc3',
  ink: '#5c5a43',
  inkSoft: '#9a9776',
  shadow: '#6f6e55',
  fog: '#e9e8db',
  hint: '#d6a26f',
  skin: '#f1dcc0',
  skins: ['#f1dcc0', '#d8b48e', '#a77c58'],
  belly: '#f2e6d0',
  marking: '#a88f6c',
  horn: '#efe6c8',
  ramps: {
    grass: r('#e0e9c3', '#c3d6a0', '#9eb47d'),
    moss: r('#d0e0b0', '#aec88c', '#8aa76c'),
    heath: r('#e8dfb5', '#d1c794', '#afa574'),
    sand: r('#f2e5ba', '#e4d098', '#c4ae77'),
    rock: r('#dcdccc', '#bebeab', '#9a9a87'),
    water: r('#c6e0d8', '#a1c9c0', '#7ea8a0'),
    earth: r('#dccfa8', '#bdaf88', '#9a8d6a'),
    neutral: r('#e6e4d2', '#cfcdb8', '#adab96'),
    foliage: r('#bcd3a2', '#95b37b', '#72915d'),
    conifer: r('#a5c09b', '#7f9f78', '#5f7f5b'),
    bark: r('#bea68a', '#a08a6c', '#7d6950'),
    stone: r('#e6e2ce', '#cbc5ab', '#a7a187'),
    hide: r('#e6d2b8', '#cfb393', '#ab9071'),
    trodden: r('#ebd6bd', '#d9b996', '#b59574'),
  },
  accents: {
    rose: r('#efcdc4', '#e0a99e', '#bc887e'),
    ochre: r('#f0dcab', '#e3c27c', '#bf9f5f'),
    teal: r('#c5e0d7', '#8fc2b4', '#6f9f93'),
    plum: r('#dccfe2', '#b9a3c6', '#9583a2'),
    sage: r('#d6e2c6', '#adc497', '#8ba376'),
    slate: r('#d0d6de', '#a0abbb', '#7f8a9b'),
    coral: r('#f2cbbb', '#e4a28b', '#c0826c'),
    sky: r('#cde1ef', '#9cc2dc', '#7ca2bc'),
  },
};

export const PALETTES: readonly Palette[] = [MORNING, MIST, SPRING];

export function paletteById(id: string): Palette {
  return PALETTES.find((p) => p.id === id) ?? MORNING;
}

/** An accent ramp by key; unknown keys fall back to the first accent. */
export function accentRamp(palette: Palette, key: string): Ramp {
  return (ACCENTS as readonly string[]).includes(key)
    ? palette.accents[key as Accent]
    : palette.accents[ACCENTS[0]];
}

/** Every colour in a palette (lower case), for the colour lint. */
export function paletteColours(palette: Palette): Set<string> {
  const out = new Set<string>();
  const add = (c: string): void => {
    out.add(c.toLowerCase());
  };
  for (const [key, value] of Object.entries(palette)) {
    if (key === 'id' || key === 'name') continue;
    if (typeof value === 'string') add(value);
    else if (Array.isArray(value)) for (const v of value) if (typeof v === 'string') add(v);
  }
  for (const ramp of [...Object.values(palette.ramps), ...Object.values(palette.accents)]) {
    add(ramp.light);
    add(ramp.base);
    add(ramp.shade);
  }
  return out;
}

/** `#rrggbb` to 0..1 channels (for SVG filter matrices). */
export function rgbUnit(hex: string): readonly [number, number, number] {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`Not a #rrggbb colour: ${hex}`);
  return [parseInt(m[1]!, 16) / 255, parseInt(m[2]!, 16) / 255, parseInt(m[3]!, 16) / 255];
}
