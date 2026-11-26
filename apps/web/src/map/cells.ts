/**
 * What the art kit draws for a game state: which hexes, in which fog state, with which terrain look.
 * Reads the core only; the core never learns about the screen.
 */
import type { ArtCell, CellState, FeatureArt, CharacterArt, CreatureArt } from '@behemoth-road/art';
import { GENTLE_AMBLER } from '@behemoth-road/art';
import {
  type CreatureSigns,
  featureType,
  FIRE_SITE_TAG,
  firesBurning,
  nightsLeft,
  STIMULUS_TYPES,
  directionOffset,
  type GameStateView,
  terrainOf,
  hexDistance,
  hexesInRange,
  hexKey,
  placeHex,
  stranded,
} from '@behemoth-road/core';
import { accentOf, lookOf } from '../game/identity.ts';
import { actingStance, stanceIcon } from '../game/stances.ts';
import { escortedIds, settlementInfo, struckToday, threatMarks } from '../game/season.ts';
import { MAP_TUNING } from './config.ts';

/** The fog state of a hex: hidden is blank paper, a seen hex outside the window is fading. */
export function cellStateAt(state: GameStateView, key: string): CellState {
  const tile = state.tiles[key];
  if (!tile) return 'unseen';
  if (tile.visibility === 'lost') return 'lost';
  if (tile.leftWindowOnDay !== null) return 'fading';
  // In the window: under the veil until someone enters or surveys it.
  return tile.explored ? 'seen' : 'unexplored';
}

/** Whether the terrain of a hex in this state is known to the player (drawn, named on its card). */
export const terrainKnown = (s: CellState): boolean =>
  s === 'seen' || s === 'unexplored' || s === 'fading';

/**
 * The hexes to draw: the window and its fading edge, blank paper a few rings beyond, and lost tiles near
 * the creature or under a character (so a lost character still stands somewhere).
 */
export function sceneCells(
  state: GameStateView,
  glints: readonly { readonly q: number; readonly r: number }[] = [],
): ArtCell[] {
  const { centre } = state.creature;
  const outer = state.config.windowRadius + MAP_TUNING.paperRings;
  const lostLimit = state.config.windowRadius + MAP_TUNING.lostRings;
  const keys = new Map<string, { q: number; r: number }>();
  for (const h of hexesInRange(centre, outer)) keys.set(hexKey(h), h);
  for (const [key, tile] of Object.entries(state.tiles)) {
    if (keys.has(key)) continue;
    const [q, r] = key.split(',').map(Number) as [number, number];
    if (tile.visibility === 'seen' || hexDistance({ q, r }, centre) <= lostLimit) {
      keys.set(key, { q, r });
    }
  }
  for (const c of state.characters) if (c.at.kind === 'hex') keys.set(hexKey(c.at.hex), c.at.hex);
  const fires = fireKeys(state);
  for (const s of state.stimuli) if (fires.has(hexKey(s.hex))) keys.set(hexKey(s.hex), s.hex);
  // Threats and settlements are public: drawn wherever they are, also under the veil.
  const threats = new Map(threatMarks(state).map((t) => [hexKey(t.hex), t]));
  const settlements = new Map(state.settlements.map((s) => [hexKey(s.hex), s.id]));
  for (const t of state.threats) keys.set(hexKey(t.hex), t.hex);
  for (const s of state.settlements) keys.set(hexKey(s.hex), s.hex);

  // The viewer's own glints (the scout's skill): a hint mark on hexes that hold something, never what.
  const glinting = new Set(glints.map(hexKey));
  for (const g of glints) keys.set(hexKey(g), g);
  const burnt = burntKeys(state);
  const cells: ArtCell[] = [];
  for (const [key, h] of keys) {
    const cellState = cellStateAt(state, key);
    const burntLook = burnt.get(key);
    const known = terrainKnown(cellState);
    const feature = known ? featureArtAt(state, key) : null;
    const threat = threats.get(key);
    const settlementId = settlements.get(key);
    const settlement = settlementId ? settlementInfo(state, settlementId) : null;
    cells.push({
      q: h.q,
      r: h.r,
      state: cellState,
      terrain: known ? (terrainOf(state, h)?.id ?? 'unknown') : 'unknown',
      ...(feature ? { feature } : {}),
      ...(glinting.has(key) ? { hint: true } : {}),
      // A lit fire shows to everyone, also under the veil and on paper never seen.
      // A brazier draws its own flame, so it is not drawn a second fire beside it.
      ...(fires.has(key) && !isBrazierAt(state, key) ? { fire: true } : {}),
      ...(burntLook ? { burnt: burntLook } : {}),
      ...(threat
        ? {
            threat: {
              look: threat.icon,
              strength: threat.strength,
              toward: threat.next ? { q: threat.next.q - h.q, r: threat.next.r - h.r } : null,
              arrivesTomorrow: threat.arrives === 'tomorrow',
            },
          }
        : {}),
      ...(settlement
        ? {
            settlement: {
              look: settlement.look,
              attitude: settlement.attitude,
              favour: settlement.favour,
              favourNeeded: settlement.needed,
            },
          }
        : {}),
    });
  }
  return cells;
}

/** A revealed feature's drawing: its content icon key, and used up once nothing is left. */
export function featureArtAt(state: GameStateView, key: string): FeatureArt | null {
  const f = state.features[key];
  if (!f?.revealed) return null;
  let type;
  try {
    type = featureType(f.type);
  } catch {
    return { look: f.type };
  }
  if (type.tags.includes(FIRE_SITE_TAG)) {
    // A brazier: lit exactly while a fire (a stimulus tagged `fire`, nights left) burns on its hex.
    const fire = firesBurning(state).find((x) => hexKey(x.hex) === key);
    return fire
      ? { look: type.icon, lit: true, nightsLeft: nightsLeft(state, fire) }
      : {
          look: type.icon,
          ...((f as { stocked?: boolean }).stocked === true ? { stocked: true } : {}),
        };
  }
  if (type.kind === 'trap') return { look: type.icon, trap: true };
  if (f.left > 0) return { look: type.icon };
  return { look: type.icon, state: type.kind === 'node' ? 'depleted' : 'spent' };
}

/** Whether a revealed brazier (a feature tagged `fire-site`) stands on this hex. */
export function isBrazierAt(state: GameStateView, key: string): boolean {
  const f = state.features[key];
  if (!f?.revealed) return false;
  try {
    return featureType(f.type).tags.includes(FIRE_SITE_TAG);
  } catch {
    return false;
  }
}

/**
 * The look of a burnt feature's ground: the feature type's own `burntLook` (content data), else its icon.
 * An unknown type draws the art kit's default.
 */
export function burntLookOf(featureId: string): string {
  try {
    const type = featureType(featureId);
    return type.burntLook ?? type.icon;
  } catch {
    return featureId;
  }
}

/**
 * Hexes where a burnable burnt away for good (the view's public `burnt`), by the look each left. Nothing
 * burnt shows on a hex that holds a feature again.
 */
export function burntKeys(state: GameStateView): Map<string, string> {
  const out = new Map<string, string>();
  for (const b of state.burnt) {
    const key = hexKey(b.hex);
    if (!state.features[key]) out.set(key, burntLookOf(b.feature));
  }
  return out;
}

/** Stimulus content ids that draw as a fire: read by the `fire` tag, never by id. */
const FIRE_TYPES: ReadonlySet<string> = new Set(
  STIMULUS_TYPES.filter((t) => t.tags.includes('fire')).map((t) => t.id),
);

/** The hexes where a fire burns (the view's stimuli tagged `fire`; unknown types are left out). */
export function fireKeys(state: GameStateView): Set<string> {
  return new Set(state.stimuli.filter((s) => FIRE_TYPES.has(s.type)).map((s) => hexKey(s.hex)));
}

/**
 * The creature as the art kit draws it for one viewer: lying down while it lingers (public), and the
 * viewer's own signs (`PlayerView.signs`): the appetite as they see it (faint for a non-keeper) and, for a
 * keeper, the reaction cues. Without signs (a card that shows only the public creature) it is plain.
 */
export function creatureArt(state: GameStateView, signs: CreatureSigns | null = null): CreatureArt {
  return {
    pose: state.creature.lingering ? 'lying' : 'standing',
    appetite: signs?.appetite ?? null,
    cues: (signs?.cues ?? []).map((c) => ({ hex: c.hex, reaction: c.reaction })),
    q: state.creature.centre.q,
    r: state.creature.centre.r,
    heading: directionOffset(state.creature.heading),
    look: GENTLE_AMBLER,
    // The team stores, as crates on its back.
    stores: Object.values(state.stores).reduce((a, n) => a + n, 0),
    // Wardens defending it: a ring and shields on the map, for every player.
    defenders: state.creature.defenders.length,
  };
}

/** Active characters for the scene, in character order; riders stand at the creature's centre. */
export function characterArts(
  state: GameStateView,
  which: 'all' | 'riders' | 'walkers' = 'all',
): CharacterArt[] {
  const escorted = escortedIds(state);
  const defenders = new Set(state.creature.defenders);
  return state.characters
    .filter((c) => c.status === 'active')
    .filter((c) => which === 'all' || (c.at.kind === 'creature') === (which === 'riders'))
    .map((c) => {
      const at = placeHex(state, c.at);
      const look = lookOf(c.id);
      const acting = actingStance(state, c);
      // The day's signs: a shield beside a warden, a bandage once struck, a shield raised in defence.
      const marks = {
        ...(escorted.has(c.id) ? { escorted: true } : {}),
        ...(struckToday(c, state.day) ? { struck: true } : {}),
        ...(c.at.kind === 'creature' && defenders.has(c.id) ? { defending: true } : {}),
        // The stance doing something with the spare actions (never rest), and an ended day.
        ...(acting ? { stance: stanceIcon(acting) } : {}),
        ...(c.waiting ? { waiting: true } : {}),
        ...(c.pinnedDay !== undefined ? { pinned: true } : {}),
        // The rescue flare, for everyone: public state only.
        ...(stranded(state, c.id) ? { stranded: true } : {}),
      };
      return {
        id: c.id,
        q: at.q,
        r: at.r,
        accent: accentOf(c.id, MAP_TUNING.accent),
        ...(look ? { look } : {}),
        ...(Object.keys(marks).length > 0 ? { marks } : {}),
      };
    });
}
