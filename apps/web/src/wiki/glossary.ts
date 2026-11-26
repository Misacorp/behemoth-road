/**
 * The icon glossary: every icon the game draws, with its name and tip text, grouped. Built from the same
 * registries the game uses (the content lists, the art kit's icon tables and the tips table), so a new role,
 * material, threat or tip shows up here by itself, and the test fails when one has no entry or no text.
 */
import {
  ACTION_MOTIFS,
  drawBurnableMark,
  drawFearsFireMark,
  drawBlockedHexes,
  drawOddsMark,
  drawGlyph,
  drawNightsLeft,
  drawIcon,
  drawMoment,
  drawPackIcon,
  drawRouteDestination,
  drawStandingStone,
  drawTrace,
  TRACE_KINDS,
  drawSettlementIcon,
  drawSkillNode,
  drawStoresIcon,
  drawThreatIcon,
  el,
  hasIcon,
  isometric,
  MOMENT_KINDS,
  renderScene,
  type SvgNode,
} from '@behemoth-road/art';
import {
  BOONS,
  DEFAULT_CONFIG,
  FEATURE_TYPES,
  MATERIALS,
  PEOPLE_TYPES,
  QUIRKS,
  ROLES,
  SKILL_NODES,
  STANCES,
  TERRAIN_TYPES,
  THREAT_TYPES,
  TRAITS,
  UNLOCKS,
} from '@behemoth-road/core';
import { PALETTE } from '../map/art.ts';
import { burntLookOf } from '../map/cells.ts';
import { MAP_TUNING } from '../map/config.ts';
import { fillTip, tipValues } from '../text/tipValues.ts';
import { TIP_TABLE, type TipId } from '../text/tips.ts';
import { titleOf } from '../ui/Tip.tsx';
import { tipFor } from '../ui/tip.ts';

export type GroupId =
  | 'hud'
  | 'actions'
  | 'materials'
  | 'features'
  | 'terrain'
  | 'threats'
  | 'settlements'
  | 'roles'
  | 'stances'
  | 'traits'
  | 'skills'
  | 'marks';

/** Group titles, in page order. */
export const GROUPS: readonly { readonly id: GroupId; readonly title: string }[] = [
  { id: 'hud', title: 'Screen' },
  { id: 'actions', title: 'Actions' },
  { id: 'materials', title: 'Materials and items' },
  { id: 'features', title: 'Features' },
  { id: 'terrain', title: 'Terrain' },
  { id: 'threats', title: 'Threats' },
  { id: 'settlements', title: 'Settlements and boons' },
  { id: 'roles', title: 'Roles' },
  { id: 'stances', title: 'Stances' },
  { id: 'traits', title: 'Traits and quirks' },
  { id: 'skills', title: 'Skills' },
  { id: 'marks', title: 'Marks' },
];

/** How an entry is drawn. `hud` entries are drawn by the page from the game's own icon components. */
export type Draw =
  | { readonly kind: 'icon'; readonly id: string; readonly tile?: 'trait' | 'quirk' }
  | { readonly kind: 'skill'; readonly icon: string }
  | { readonly kind: 'glyph'; readonly id: string }
  | { readonly kind: 'tile'; readonly terrain: string; readonly look?: string }
  | { readonly kind: 'threat'; readonly look: string }
  | { readonly kind: 'settlement'; readonly look: string; readonly attitude: string }
  | { readonly kind: 'moment'; readonly moment: string }
  | { readonly kind: 'trace'; readonly trace: string }
  | { readonly kind: 'stone' }
  | { readonly kind: 'fire'; readonly mark: FireMark }
  | { readonly kind: 'hud'; readonly id: string };

/** The fire rework's marks, as the glossary draws them. */
export const FIRE_MARKS = [
  'brazier-lit',
  'burnable',
  'burnt',
  'fears-fire',
  'blocked',
  'odds',
  'nights',
  'pinned',
] as const;
export type FireMark = (typeof FIRE_MARKS)[number];

export interface GlossaryEntry {
  readonly key: string;
  readonly group: GroupId;
  readonly name: string;
  /** The tip's text with its numbers filled, or null when the game has no tip for it. */
  readonly text: string | null;
  readonly tip: TipId | null;
  readonly draw: Draw;
}

const VALUES = { ...tipValues(DEFAULT_CONFIG), note: 'Success 80% · Buried 20%' };

const prettify = (key: string): string => {
  const words = key.replace(/-/g, ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/** The entry for an icon with a tip id (or none): its name is the tip's title. */
function entry(
  group: GroupId,
  key: string,
  tip: TipId | null,
  draw: Draw,
  name?: string,
): GlossaryEntry {
  const raw = tip === null ? key : titleOf(tip);
  const shown = name ?? (raw === (tip?.split(':')[1] ?? key) ? prettify(raw) : raw);
  return {
    key: `${group}:${key}`,
    group,
    name: shown,
    text: tip === null ? null : fillTip(TIP_TABLE[tip].text, VALUES),
    tip,
    draw,
  };
}

/** The icon each action tip is drawn with in the game (others have none and draw the neutral mark). */
const ACTION_ICON: Readonly<Record<string, string>> = { survey: 'spyglass', build: 'hammer' };

const BOON_IDS: ReadonlySet<string> = new Set(BOONS);

/** The screen's own icons: tip id, name from the tip and the icon the page draws for it. */
export const HUD_ICONS: readonly string[] = [
  'day',
  'pack',
  'stores',
  'recentre-me',
  'recentre-creature',
  'recap',
  'join',
  'story',
  'greyfold',
  'date',
];

export function buildGlossary(): readonly GlossaryEntry[] {
  const out: GlossaryEntry[] = [];

  for (const id of HUD_ICONS) out.push(entry('hud', id, tipFor('hud', id), { kind: 'hud', id }));

  // Actions: every action the game has a tip for, minus the boons (those are the settlements' own).
  const actionKeys = new Set<string>([
    ...Object.keys(ACTION_MOTIFS).filter((k) => !BOON_IDS.has(k)),
    ...Object.keys(TIP_TABLE)
      .filter((k) => k.startsWith('action:'))
      .map((k) => k.slice(7)),
  ]);
  for (const key of actionKeys) {
    const icon = ACTION_ICON[key] ?? key;
    out.push(
      entry('actions', key, tipFor('action', key), {
        kind: 'icon',
        id: hasIcon(icon) ? icon : key,
      }),
    );
  }

  for (const m of MATERIALS)
    out.push(
      entry('materials', m.id, tipFor('material', m.id), { kind: 'icon', id: m.icon }, m.name),
    );
  for (const u of UNLOCKS)
    out.push(
      entry('materials', u.id, tipFor('unlock', u.id), { kind: 'icon', id: u.icon }, u.name),
    );

  for (const f of FEATURE_TYPES)
    out.push(
      entry(
        'features',
        f.id,
        tipFor('feature', f.id),
        {
          kind: 'tile',
          terrain: f.placement.on.includes('island') ? 'islet' : 'plains',
          look: f.icon,
        },
        f.name,
      ),
    );
  for (const t of TERRAIN_TYPES)
    out.push(entry('terrain', t.id, tipFor('terrain', t.id), { kind: 'tile', terrain: t.id }));
  for (const t of THREAT_TYPES)
    out.push(
      entry('threats', t.id, tipFor('threat', t.id), { kind: 'threat', look: t.icon }, t.name),
    );

  for (const attitude of ['wary', 'friendly', 'angry']) {
    const people = PEOPLE_TYPES[0];
    out.push(
      entry('settlements', attitude, tipFor('settlement', attitude), {
        kind: 'settlement',
        look: people?.icon ?? 'hill-folk',
        attitude,
      }),
    );
  }
  for (const p of PEOPLE_TYPES)
    out.push(
      entry(
        'settlements',
        p.id,
        tipFor('people', p.id),
        { kind: 'settlement', look: p.icon, attitude: 'wary' },
        p.name,
      ),
    );
  for (const b of BOONS)
    out.push(entry('settlements', b, tipFor('boon', b), { kind: 'icon', id: b }));

  for (const r of ROLES)
    out.push(
      entry('roles', r.id, tipFor('role', r.id), { kind: 'icon', id: `role:${r.id}` }, r.name),
    );
  // Stances: the glyph each wears on the map and in the picker, plus the fallback and waiting marks.
  for (const st of STANCES)
    out.push(
      entry('stances', st.id, tipFor('stance', st.id), { kind: 'glyph', id: st.icon }, st.name),
    );
  out.push(
    entry('stances', 'fallback', tipFor('stance', 'fallback'), { kind: 'glyph', id: 'moon' }),
    entry(
      'stances',
      'waiting',
      tipFor('action', 'wait'),
      { kind: 'glyph', id: 'hourglass' },
      'Waiting',
    ),
  );
  for (const t of TRAITS)
    out.push(
      entry(
        'traits',
        t.id,
        tipFor('trait', t.id),
        { kind: 'icon', id: t.icon, tile: 'trait' },
        t.name,
      ),
    );
  for (const q of QUIRKS)
    out.push(
      entry(
        'traits',
        q.id,
        tipFor('quirk', q.id),
        { kind: 'icon', id: q.icon, tile: 'quirk' },
        q.name,
      ),
    );

  for (const n of SKILL_NODES)
    out.push(entry('skills', n.id, tipFor('skill', n.id), { kind: 'skill', icon: n.icon }, n.name));

  // What the walk leaves on the map.
  for (const kind of TRACE_KINDS)
    out.push(
      entry('marks', `trace-${kind}`, tipFor('map', `trace-${kind}`), {
        kind: 'trace',
        trace: kind,
      }),
    );
  out.push(entry('marks', 'standing-stone', tipFor('map', 'standing-stone'), { kind: 'stone' }));

  // The fire rework: a lit brazier and its embers, what a fire would take, what keeps clear of it.
  const FIRE_TIPS: Readonly<Record<FireMark, TipId>> = {
    'brazier-lit': 'map:fire-brazier',
    burnable: 'map:burnable',
    burnt: 'map:burnt',
    'fears-fire': 'map:fears-fire',
    blocked: 'map:blocked',
    odds: 'map:odds',
    nights: 'map:nights',
    pinned: 'map:pinned',
  };
  for (const mark of FIRE_MARKS)
    out.push(entry('marks', `fire-${mark}`, FIRE_TIPS[mark], { kind: 'fire', mark }));

  for (const kind of MOMENT_KINDS)
    out.push(entry('marks', kind, null, { kind: 'moment', moment: kind }));

  return out;
}

const MINI = isometric(24, MAP_TUNING.tilt);

/** An entry's drawing as an SVG tree, or null for the screen's own icon components (the page draws those). */
export function drawEntry(d: Draw, size: number): SvgNode | null {
  switch (d.kind) {
    case 'icon':
      return drawIcon(d.id, PALETTE, size, d.tile ? { tile: d.tile } : {});
    case 'glyph':
      return drawGlyph(d.id, PALETTE, size);
    case 'skill':
      return drawSkillNode(PALETTE, d.icon, size, 'plain');
    case 'threat':
      return drawThreatIcon(d.look, PALETTE, size);
    case 'settlement':
      return drawSettlementIcon(PALETTE, size, {
        look: d.look,
        attitude: d.attitude as 'wary' | 'friendly' | 'angry',
        favour: 0,
      });
    case 'moment':
      return drawMoment(d.moment, PALETTE, size);
    case 'trace':
    case 'stone': {
      const drawn =
        d.kind === 'trace'
          ? drawTrace(PALETTE, d.trace, { k: 0.8, seed: 1 })
          : drawStandingStone(PALETTE, { k: 0.8, seed: 1, ticks: 2 });
      const { x0, y0, x1, y1 } = drawn.box;
      const pad = 3;
      const w = x1 - x0 + 2 * pad;
      const h = y1 - y0 + 2 * pad;
      const side = Math.max(w, h);
      return el(
        'svg',
        {
          viewBox: `${x0 - pad - (side - w) / 2} ${y0 - pad - (side - h) / 2} ${side} ${side}`,
          width: size,
          height: size,
        },
        drawn.nodes,
      );
    }
    case 'fire':
      return drawFireMark(d.mark, size);
    case 'tile': {
      const scene = renderScene({
        cells: [
          {
            q: 0,
            r: 0,
            terrain: d.terrain,
            state: 'seen',
            ...(d.look ? { feature: { look: d.look } } : {}),
          },
        ],
        projection: MINI,
        palette: PALETTE,
        seed: d.terrain,
        idPrefix: `gl-${d.terrain}-${d.look ?? 'ground'}`,
        frame: 'none',
      });
      return el('svg', { ...scene.attrs, width: size * 1.14, height: size }, scene.children);
    }
    case 'hud':
      if (d.id === 'pack') return drawPackIcon(PALETTE, size, 3, DEFAULT_CONFIG.packCapacity);
      if (d.id === 'stores') return drawStoresIcon(PALETTE, size);
      if (d.id === 'greyfold') return drawRouteDestination(PALETTE, size);
      return null;
  }
}

/** A fire mark: the art kit's own mark, or a small scene for the ones that sit on the map. */
function drawFireMark(mark: FireMark, size: number): SvgNode {
  if (mark === 'burnable') return drawBurnableMark(PALETTE, size);
  if (mark === 'fears-fire') return drawFearsFireMark(PALETTE, size);
  if (mark === 'nights') return drawNightsLeft(PALETTE, 2, size);
  if (mark === 'odds') return drawOddsMark(PALETTE, 0.8, 'rocks', { size: size * 0.5 });
  const scene = renderScene({
    cells: [
      {
        q: 0,
        r: 0,
        terrain: 'plains',
        state: 'seen',
        ...(mark === 'brazier-lit'
          ? { feature: { look: 'brazier', lit: true, nightsLeft: 2 } }
          : mark === 'burnt'
            ? { burnt: burntLookOf(FEATURE_TYPES.find((f) => f.burntLook)?.id ?? '') }
            : {}),
      },
    ],
    ...(mark === 'pinned'
      ? { characters: [{ id: 'gl', q: 0, r: 0, accent: 'slate', marks: { pinned: true } }] }
      : {}),
    projection: MINI,
    palette: PALETTE,
    seed: mark,
    idPrefix: `gl-fire-${mark}`,
    frame: 'none',
  });
  if (mark === 'blocked') {
    // The stripes reach past the one hex the scene frames: widen the frame to take them in.
    const [x = 0, y = 0, w = 1, h = 1] = String(scene.attrs['viewBox']).split(' ').map(Number);
    const grow = 0.6;
    return el(
      'svg',
      {
        viewBox: `${x - w * grow} ${y - h * grow} ${w * (1 + 2 * grow)} ${h * (1 + 2 * grow)}`,
        width: size * 1.14,
        height: size,
      },
      [
        ...scene.children,
        drawBlockedHexes(
          MINI,
          [
            { q: 0, r: 0 },
            { q: 1, r: 0 },
            { q: 0, r: 1 },
          ],
          PALETTE,
          {
            reason: 'fire',
          },
        ),
      ],
    );
  }
  return el('svg', { ...scene.attrs, width: size * 1.14, height: size }, scene.children);
}
