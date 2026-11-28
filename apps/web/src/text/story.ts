/**
 * STORY: the season's twelve beats and four endings, the only prose in the game (docs/design/world/world.md,
 * sections 7 and 8.3).
 *
 * How to edit (Misa):
 * - Change any `text` below. One to three plain sentences, British English, one concrete detail.
 * - No numbers, no rules, nothing that is not on the map. Never name the creature's head, gaze, ears, eyes,
 *   stillness, lying down, droop or drowsiness: that body language belongs to the Keeper. (An ending is exempt.)
 * - The beats are keyed by the core's storylet id; the endings by the core's ending line key
 *   (`ending.line` in the view). `vignetteOf` is the one place the core's ids meet the art kit's.
 */

export const BEAT_TEXT = {
  'beat.setting-out':
    'The chain comes off the pen gate with one pull. A miller’s girl watches from the hayloft and says nothing. The Mossback steps over the chain, sniffs the wind once, and turns toward somewhere only it knows.',
  'beat.terrain.wooded':
    'The trees close over you and the light comes down green and slow. Somewhere above, a bird starts a song and thinks better of it.',
  'beat.terrain.dry':
    'The ground turns pale and cracks like a dropped plate. A dry riverbed runs beside you for a while, its stones the colour of bread crust.',
  'beat.terrain.steep':
    'The slope tilts up until you are leaning into it with your hands. Loose stones skitter away below, and take a long time to stop.',
  'beat.terrain.water':
    'Water, wide and flat, with a grey heron standing in it. The Mossback’s tracks go straight in, and the heron lets them.',
  'beat.terrain.boggy':
    'The ground gives with a soft sucking sound. Every footprint fills slowly with brown water, and a single bubble comes up.',
  'beat.first.captors':
    'Smoke behind you at dusk. Somebody back there is calling a name, the way you call an animal in for the night.',
  'beat.first.settlement':
    'A bell hangs over the village gate with its clapper tied. Children are sitting on the wall, waiting.',
  'beat.waymark.quarter':
    'A standing stone by the track, as tall as a door, with a single scratch on its face. A pebble has been wedged under its foot, and the mark is still pale.',
  'beat.waymark.half':
    'A standing stone on the slope, taller than a rider, with a fresh pebble wedged under its foot. Nobody here will say who put it there.',
  'beat.waymark.three-quarters':
    'A third standing stone, leaning a little further than the others. Three scratches on its face, and a pebble under its foot, still damp.',
  'beat.greyfold':
    'Far ahead the land folds into a long grey valley, its rim already faintly green. The Mossback quickens for the last stretch, and you have to jog to keep beside it.',
} as const;

export type BeatId = keyof typeof BEAT_TEXT;

/** The ending lines, by the core's `ending.line` key. */
export const ENDING_TEXT = {
  'mossback.safe':
    'It walks into the Greyfold and starts eating before it has stopped walking. By spring the valley is green from rim to rim, the hill folk are arguing over a new name for it, and two of you are still there, building a hut on the rim.',
  'mossback.wounded':
    'It reaches the Greyfold limping and grazes in a smaller circle than it should. The valley greens anyway, slowly, from that circle out. You stay until the first frost to be sure.',
  'ending.lost.pursuer':
    'The hooks find it at dusk. You hear the mill horn from three valleys away, and then the wheels start up again.',
  'ending.lost.hunger':
    'It stops a long way from where it was going and lies down. One of you sits with it all night, a hand in the moss. When the grass comes up there, it comes up thin and pale.',
} as const;

export type EndingLine = keyof typeof ENDING_TEXT;

const has = (table: object, id: string): boolean => Object.hasOwn(table, id);

/** A beat's text, or null for an id this build has no text for (a newer server's). */
export const beatText = (id: string): string | null =>
  has(BEAT_TEXT, id) ? BEAT_TEXT[id as BeatId] : null;

/** An ending line's text, or null for no line (the plain title) or an unknown key. */
export const endingText = (line: string | null): string | null =>
  line !== null && has(ENDING_TEXT, line) ? ENDING_TEXT[line as EndingLine] : null;

/** The art kit's vignette for a beat: the core's terrain beats are the art's `first` ones, the Greyfold its destination. */
export const vignetteOf = (id: string): string =>
  id === 'beat.greyfold' ? 'beat.destination' : id.replace(/^beat\.terrain\./, 'beat.first.');

/** The art kit's vignette for an ending line. */
export const endingVignetteOf = (line: string): string =>
  line.startsWith('ending.') ? line : `ending.${line}`;

/**
 * The "while you were away" lines: one short line for each kind of thing that happened near the creature.
 * `one` when it happened once; `many` when it happened more, where `{times}` becomes "twice", "three times"...
 * Plain game words (see docs/design/glossary.md), not story prose.
 */
export const RECAP_TEXT = {
  threat: {
    one: 'A foe came near the creature.',
    many: 'Foes came near the creature {times}.',
  },
  strike: {
    one: 'A foe attacked the creature.',
    many: 'Foes attacked the creature {times}.',
  },
  trap: {
    one: 'A trap sprang.',
    many: 'Traps sprang {times}.',
  },
  hungry: {
    one: 'The creature went hungry.',
    many: 'The creature went hungry {times}.',
  },
  find: {
    one: 'A site gave a find.',
    many: 'Sites gave finds {times}.',
  },
  reveal: {
    one: 'Something hidden was found.',
    many: 'Hidden things were found {times}.',
  },
  fire: {
    one: 'A fire was lit.',
    many: 'Fires were lit {times}.',
  },
  cleared: {
    one: 'A foe was beaten.',
    many: 'Foes were beaten {times}.',
  },
  befriended: {
    one: 'A settlement became friendly.',
    many: 'Settlements became friendly {times}.',
  },
  angered: {
    one: 'A settlement became angry.',
    many: 'Settlements became angry {times}.',
  },
} as const;

export type RecapKind = keyof typeof RECAP_TEXT;

const TIMES = ['', '', 'twice', 'three times', 'four times', 'five times', 'six times'] as const;

/** The line for something that happened `count` times, or null for a kind this build has no line for. */
export function recapText(kind: string, count: number): string | null {
  if (!has(RECAP_TEXT, kind)) return null;
  const t = RECAP_TEXT[kind as RecapKind];
  if (count <= 1) return t.one;
  return t.many.replace('{times}', TIMES[count] ?? 'many times');
}

/** How many days turned, as a line ("A day turned while you were away."). */
export function daysLine(dusks: number): string {
  const words = ['No days', 'A day', 'Two days', 'Three days', 'Four days', 'Five days'] as const;
  const n = Math.max(dusks, 1);
  return `${words[n] ?? 'Many days'} turned while you were away.`;
}
