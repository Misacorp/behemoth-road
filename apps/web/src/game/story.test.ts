import { endingOf, STORYLETS, type Hex } from '@behemoth-road/core';
import { STORY_VIGNETTE_IDS } from '@behemoth-road/art';
import { describe, expect, it } from 'vitest';
import { joined, joinedScenario, seasonScenario } from '../api/fixtures.ts';
import {
  BEAT_TEXT,
  beatText,
  ENDING_TEXT,
  endingText,
  endingVignetteOf,
  vignetteOf,
} from '../text/story.ts';
import { dateOf } from '../hud/Season.tsx';
import {
  anchorsOf,
  arrive,
  badgeShown,
  closeCard,
  NO_STORY,
  READ_BATCH,
  readBatches,
  tapBadge,
  unreadOf,
} from './story.ts';
import { standingStones, tracesAt, traceTipAt, WAYMARKS } from './traces.ts';

const none = new Map();
const A = 'beat.setting-out';
const B = 'beat.terrain.wooded';
const C = 'beat.first.settlement';

describe('what is unread', () => {
  it('is what fired minus what you read and what played, in firing order', () => {
    expect(unreadOf([A, B, C], [], [])).toEqual([A, B, C]);
    expect(unreadOf([A, B, C], [A], [])).toEqual([B, C]);
    expect(unreadOf([A, B, C], [A], [C])).toEqual([B]);
  });

  it('leaves out an id this build has no text for', () => {
    expect(unreadOf([A, 'beat.from-the-future'], [], [])).toEqual([A]);
  });

  it('includes the opening beats of a new game, which come with no event', () => {
    const view = joined();
    expect(view.events).toEqual([]);
    expect(view.game.story.fired).toContain(A);
    expect(unreadOf(view.game.story.fired, view.you.storyRead, [])).toContain(A);
  });
});

describe('the story card model', () => {
  it('plays one unread card on load (the oldest), and the rest wait behind the badge', () => {
    const r = arrive(NO_STORY, [A, B, C], none, true);
    expect(r.started).toBe(A);
    expect(r.model.playing).toEqual({ id: A, anchor: { kind: 'creature' } });
    // The played one is read; the others wait.
    const left = unreadOf([A, B, C], [], r.model.shown);
    expect(left).toEqual([B, C]);
    expect(badgeShown(r.model, left)).toBe(false);
    const closed = closeCard(r.model);
    expect(badgeShown(closed, left)).toBe(true);
  });

  it('plays the others one at a time on taps of the badge, never while one shows', () => {
    let m = closeCard(arrive(NO_STORY, [A, B, C], none, true).model);
    let left = unreadOf([A, B, C], [], m.shown);
    const first = tapBadge(m, left, none);
    expect(first.started).toBe(B);
    m = first.model;
    // A tap while a card shows does nothing.
    expect(tapBadge(m, ['x'], none).started).toBeNull();
    m = closeCard(m);
    left = unreadOf([A, B, C], [], m.shown);
    expect(tapBadge(m, left, none).started).toBe(C);
    const last = closeCard(tapBadge(m, left, none).model);
    expect(badgeShown(last, unreadOf([A, B, C], [], last.shown))).toBe(false);
  });

  it('does not replay what the next view still lists before the server echoes the read', () => {
    const m = arrive(NO_STORY, [A], none, true).model;
    expect(unreadOf([A], [], m.shown)).toEqual([]);
    expect(unreadOf([A], [A], m.shown)).toEqual([]);
  });

  it('waits for a free map: nothing plays or is noticed over a popover or drawer', () => {
    const busy = arrive(NO_STORY, [A], none, false);
    expect(busy.started).toBeNull();
    expect(busy.model).toBe(NO_STORY);
    expect(arrive(busy.model, [A], none, true).started).toBe(A);
  });

  it('plays a card that arrives later by itself once, when nothing is playing', () => {
    let m = closeCard(arrive(NO_STORY, [A], none, true).model);
    // Nothing new: no card plays by itself.
    expect(arrive(m, [B], none, true).started).toBe(B);
    m = closeCard(arrive(m, [B], none, true).model);
    const same = arrive(m, [C], none, true);
    expect(same.started).toBe(C);
    // The same unread list again plays nothing more.
    expect(arrive(closeCard(same.model), [], none, true).started).toBeNull();
  });

  it('only queues a card that arrives while another is showing', () => {
    const playing = arrive(NO_STORY, [A], none, true).model;
    const next = arrive(playing, [B], none, true);
    expect(next.started).toBeNull();
    expect(next.model.playing?.id).toBe(A);
    // After it closes, the new one is noticed and waits behind the badge.
    const closed = closeCard(next.model);
    expect(arrive(closed, [B], none, true).started).toBeNull();
    expect(badgeShown(closed, [B])).toBe(true);
  });

  it('anchors a card where its event placed it, else on the creature', () => {
    const hex: Hex = { q: 3, r: -1 };
    const anchors = anchorsOf([
      { kind: 'story', id: B, anchor: { kind: 'hex', hex } },
      { kind: 'step' },
    ]);
    expect(arrive(NO_STORY, [B], anchors, true).model.playing?.anchor).toEqual({
      kind: 'hex',
      hex,
    });
    expect(arrive(NO_STORY, [C], anchors, true).model.playing?.anchor).toEqual({
      kind: 'creature',
    });
  });

  it('sends reads in batches the server accepts, each id once', () => {
    expect(readBatches([A, A, B])).toEqual([[A, B]]);
    const many = Array.from({ length: READ_BATCH + 3 }, (_, i) => `beat.x${String(i)}`);
    expect(readBatches(many).map((b) => b.length)).toEqual([READ_BATCH, 3]);
    expect(readBatches([])).toEqual([]);
  });
});

describe('the story text', () => {
  it('has a beat for every storylet and an art vignette for each', () => {
    const ids = STORYLETS.map((s) => s.id);
    expect(Object.keys(BEAT_TEXT).sort()).toEqual([...ids].sort());
    for (const id of ids) {
      expect(STORY_VIGNETTE_IDS as readonly string[], id).toContain(vignetteOf(id));
      expect(beatText(id)).not.toBeNull();
    }
  });

  it('maps the core ids to the art ids in one place', () => {
    expect(vignetteOf('beat.terrain.wooded')).toBe('beat.first.wooded');
    expect(vignetteOf('beat.greyfold')).toBe('beat.destination');
    expect(vignetteOf('beat.first.captors')).toBe('beat.first.captors');
    expect(endingVignetteOf('mossback.safe')).toBe('ending.mossback.safe');
    expect(endingVignetteOf('ending.lost.hunger')).toBe('ending.lost.hunger');
  });

  it('keeps to one to three sentences, with no reserved body words, and the party in every ending', () => {
    const reserved =
      /\b(head|gaze|ears?|eyes?|flinch\w*|stillness|droop\w*|dullness|drowsiness)\b/i;
    for (const [id, text] of Object.entries(BEAT_TEXT)) {
      expect(text.split(/(?<=[.!?])\s+/).length, id).toBeLessThanOrEqual(3);
      expect(text, id).not.toMatch(reserved);
      expect(text, id).not.toMatch(/\b(oven|cook\w*|road)\b/i);
    }
    for (const [id, text] of Object.entries(ENDING_TEXT)) {
      expect(text.split(/(?<=[.!?])\s+/).length, id).toBeLessThanOrEqual(3);
      expect(text, id).toMatch(/\b(you|your|yours)\b/i);
      expect(text, id).not.toMatch(/\b(oven|cook\w*|road)\b/i);
      expect(STORY_VIGNETTE_IDS as readonly string[], id).toContain(endingVignetteOf(id));
    }
  });
});

describe('the ending line shown', () => {
  const ended = (outcome: 'safe' | 'wounded' | 'lost', peril = {}) => {
    const s = seasonScenario({ season: { status: 'over', outcome, day: 9 }, stats: { peril } });
    return endingOf(s.state);
  };

  it('has text for every line the core gives', () => {
    const lines = [
      ended('safe')?.line,
      ended('wounded')?.line,
      ended('lost', { added: { hunger: 4 }, eased: {}, held: 0 })?.line,
      ended('lost', { added: { 'threat:captors': 4 }, eased: {}, held: 0 })?.line,
    ];
    expect(lines).toEqual([
      'mossback.safe',
      'mossback.wounded',
      'ending.lost.hunger',
      'ending.lost.pursuer',
    ]);
    for (const l of lines) expect(endingText(l ?? null), String(l)).not.toBeNull();
  });

  it('shows the plain title for a loss with no line, and for an unknown line', () => {
    expect(ended('lost')?.line).toBeNull();
    expect(endingText(null)).toBeNull();
    expect(endingText('ending.from-the-future')).toBeNull();
    expect(ended('safe')?.title).toBe('Arrived');
  });
});

describe('the date', () => {
  it('reads the step of the route length, and a linger keeps its step', () => {
    expect(dateOf(9, 40)).toBe('9 of 40');
    expect(dateOf(0, 40)).toBe('0 of 40');
    expect(dateOf(41, 40)).toBe('40 of 40');
  });
});

describe('traces', () => {
  const base = () => joinedScenario().state;
  const hex: Hex = { q: 2, r: 1 };
  const withTraces = (traces: ReturnType<typeof base>['traces']) => ({ ...base(), traces });
  const names = (id: string): string | null => (id === 'c1' ? 'Wrena' : null);

  it('opens the tip of what is on the hex with who made it and at which step', () => {
    const s = withTraces([{ kind: 'fire', hex, step: 6, by: 'c1' }]);
    expect(traceTipAt(s, hex, names)).toEqual({ id: 'map:trace-fire', who: 'Wrena', step: 6 });
    expect(traceTipAt(s, { q: 9, r: 9 }, names)).toBeNull();
  });

  it('has no one on a trail, and shows the most telling trace of several', () => {
    const s = withTraces([
      { kind: 'trail', hex, step: 3 },
      { kind: 'cairn', hex, step: 4, by: 'c1' },
    ]);
    expect(tracesAt(s, hex).map((t) => t.kind)).toEqual(['cairn', 'trail']);
    expect(traceTipAt(s, hex, names)?.id).toBe('map:trace-cairn');
    const t = withTraces([{ kind: 'trail', hex, step: 3 }]);
    expect(traceTipAt(t, hex, names)).toEqual({ id: 'map:trace-trail', who: null, step: 3 });
  });
});

describe('standing stones', () => {
  const s0 = joinedScenario().state;
  const known = Object.keys(s0.tiles)[0]!;
  const [q, r] = known.split(',').map(Number) as [number, number];
  const at: Hex = { q, r };
  const route = s0.config.routeLength;

  it('stand on the trail left at the step the beat fired, and are remembered', () => {
    const step = Math.ceil(0.25 * route);
    const s = {
      ...s0,
      story: { ...s0.story, fired: [...s0.story.fired, WAYMARKS[0].id] },
      creature: { ...s0.creature, steps: step + 5 },
      traces: [{ kind: 'trail' as const, hex: at, step }],
    };
    const memory = new Map<string, Hex>();
    expect(standingStones(s, memory)).toEqual([{ id: WAYMARKS[0].id, hex: at, ticks: 1 }]);
    // The trail is pruned later; the stone stays.
    expect(standingStones({ ...s, traces: [] }, memory)).toHaveLength(1);
    // Without the memory it is gone (and not placed at the creature, which has walked on).
    expect(standingStones({ ...s, traces: [] }, new Map())).toEqual([]);
  });

  it('are set only for the beats that fired', () => {
    expect(standingStones(s0, new Map())).toEqual([]);
  });
});
