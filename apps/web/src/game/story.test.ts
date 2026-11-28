import { endingOf, STORYLETS, type Hex } from '@behemoth-road/core';
import { STORY_VIGNETTE_IDS } from '@behemoth-road/art';
import { describe, expect, it } from 'vitest';
import { joined, joinedScenario, seasonScenario } from '../api/fixtures.ts';
import {
  BEAT_TEXT,
  beatText,
  daysLine,
  ENDING_TEXT,
  endingText,
  endingVignetteOf,
  RECAP_TEXT,
  recapText,
  vignetteOf,
} from '../text/story.ts';
import { MARK_KINDS } from '../onboarding/welcomeBack.ts';
import { dateOf } from '../hud/Season.tsx';
import {
  anchorsOf,
  arrive,
  badgeShown,
  closeByLoss,
  closeByTap,
  NO_STORY,
  READ_AFTER_MS,
  READ_BATCH,
  readBatches,
  settle,
  tapBadge,
  unreadOf,
} from './story.ts';
import { bare, newStoneMemory, standingStones, tracesAt, traceTipAt, WAYMARKS } from './traces.ts';

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
  const T0 = 1000;
  const later = T0 + READ_AFTER_MS;
  const unreadNow = (all: string[], m: { shown: readonly string[] }) => unreadOf(all, [], m.shown);

  it('plays one unread card on load (the oldest), and the rest wait behind the badge', () => {
    const r = arrive(NO_STORY, [A, B, C], none, true, T0);
    expect(r.started).toBe(A);
    expect(r.model.playing).toMatchObject({ id: A, anchor: { kind: 'creature' } });
    // Read only once the player closes it.
    expect(r.read).toBeNull();
    const closed = closeByTap(r.model);
    expect(closed.read).toBe(A);
    const left = unreadNow([A, B, C], closed.model);
    expect(left).toEqual([B, C]);
    expect(badgeShown(closed.model, left)).toBe(true);
    expect(badgeShown(r.model, left)).toBe(false);
  });

  it('plays the others one at a time on taps of the badge, never while one shows', () => {
    let m = closeByTap(arrive(NO_STORY, [A, B, C], none, true, T0).model).model;
    const first = tapBadge(m, unreadNow([A, B, C], m), none, T0);
    expect(first.started).toBe(B);
    // A tap while a card shows does nothing.
    expect(tapBadge(first.model, ['x'], none, T0).started).toBeNull();
    m = closeByTap(first.model).model;
    const second = tapBadge(m, unreadNow([A, B, C], m), none, T0);
    expect(second.started).toBe(C);
    const last = closeByTap(second.model).model;
    expect(badgeShown(last, unreadNow([A, B, C], last))).toBe(false);
  });

  it('counts a card read after it has been up a while, even with no closing tap', () => {
    const m = arrive(NO_STORY, [A], none, true, T0).model;
    expect(settle(m, T0 + 100).read).toBeNull();
    const s = settle(m, later);
    expect(s.read).toBe(A);
    expect(unreadNow([A], s.model)).toEqual([]);
    // Closing it afterwards does not count it twice.
    expect(closeByTap(s.model).read).toBeNull();
  });

  it('puts a card taken down too soon back to unread, and it plays again once the map is free', () => {
    const m = arrive(NO_STORY, [A], none, true, T0).model;
    const lost = closeByLoss(m, T0 + 300);
    expect(lost.read).toBeNull();
    expect(lost.model.playing).toBeNull();
    expect(unreadNow([A], lost.model)).toEqual([A]);
    expect(arrive(lost.model, [A], none, false, T0 + 400).started).toBeNull();
    expect(arrive(lost.model, [A], none, true, T0 + 400).started).toBe(A);
  });

  it('counts a card taken down after it was up long enough as read', () => {
    const m = arrive(NO_STORY, [A], none, true, T0).model;
    const lost = closeByLoss(m, later);
    expect(lost.read).toBe(A);
    expect(unreadNow([A], lost.model)).toEqual([]);
  });

  it('waits for a free map: nothing plays or is noticed over a popover or drawer', () => {
    const busy = arrive(NO_STORY, [A], none, false, T0);
    expect(busy.started).toBeNull();
    expect(busy.model).toBe(NO_STORY);
    expect(arrive(busy.model, [A], none, true, T0).started).toBe(A);
  });

  it('plays a late arrival by itself: the newest that arrived, not the oldest unread', () => {
    let m = closeByTap(arrive(NO_STORY, [A], none, true, T0).model).model;
    // B waits unread behind a card that was showing when it arrived; then C and D arrive together.
    const playing = tapBadge(m, [B], none, T0);
    m = arrive(playing.model, [B, C, 'beat.waymark.half'], none, true, T0).model;
    m = closeByTap(m).model;
    expect(arrive(m, [B, C, 'beat.waymark.half'], none, true, T0).started).toBeNull();
    // Fresh ones while nothing is playing.
    const fresh = arrive(
      m,
      [B, C, 'beat.waymark.half', 'beat.greyfold', 'beat.terrain.dry'],
      none,
      true,
      T0,
    );
    expect(fresh.started).toBe('beat.terrain.dry');
  });

  it('only queues a card that arrives while another is showing', () => {
    const playing = arrive(NO_STORY, [A], none, true, T0).model;
    const next = arrive(playing, [A, B], none, true, T0);
    expect(next.started).toBeNull();
    expect(next.model.playing?.id).toBe(A);
    const closed = closeByTap(next.model).model;
    expect(arrive(closed, [B], none, true, T0).started).toBeNull();
    expect(badgeShown(closed, [B])).toBe(true);
  });

  it('anchors a card where its event placed it, else on the creature', () => {
    const hex: Hex = { q: 3, r: -1 };
    const anchors = anchorsOf([
      { kind: 'story', id: B, anchor: { kind: 'hex', hex } },
      { kind: 'step' },
    ]);
    expect(arrive(NO_STORY, [B], anchors, true, T0).model.playing?.anchor).toEqual({
      kind: 'hex',
      hex,
    });
    expect(arrive(NO_STORY, [C], anchors, true, T0).model.playing?.anchor).toEqual({
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
    const memory = newStoneMemory();
    expect(standingStones(s, memory)).toEqual([{ id: WAYMARKS[0].id, hex: at, ticks: 1 }]);
    // The trail is pruned later; the stone stays.
    expect(standingStones({ ...s, traces: [] }, memory)).toHaveLength(1);
    // Without the memory it is gone (and not placed at the creature, which has walked on).
    expect(standingStones({ ...s, traces: [] }, newStoneMemory())).toEqual([]);
  });

  it('are forgotten when the game changes (a new season)', () => {
    const step = Math.ceil(0.25 * route);
    const s = {
      ...s0,
      story: { ...s0.story, fired: [...s0.story.fired, WAYMARKS[0].id] },
      creature: { ...s0.creature, steps: step + 5 },
      traces: [{ kind: 'trail' as const, hex: at, step }],
    };
    const memory = newStoneMemory();
    expect(standingStones(s, memory)).toHaveLength(1);
    // Another game: its trail is gone and the old stone is not carried over.
    const next = { ...s, artSeed: s.artSeed + 1, traces: [] };
    expect(standingStones(next, memory)).toEqual([]);
    expect(memory.hexes.size).toBe(0);
  });

  it('are set only for the beats that fired', () => {
    expect(standingStones(s0, newStoneMemory())).toEqual([]);
  });
});

describe('trail tips are for a bare hex', () => {
  const s0 = joinedScenario().state;
  const c = s0.creature.centre;

  it('is not bare under the creature, a figure or a feature, and is elsewhere', () => {
    expect(bare(s0, c)).toBe(false);
    const figure = s0.characters.find((x) => x.status === 'active' && x.at.kind === 'hex');
    if (figure?.at.kind === 'hex') expect(bare(s0, figure.at.hex)).toBe(false);
    const featured = Object.keys(s0.features)[0];
    if (featured) {
      const [q, r] = featured.split(',').map(Number) as [number, number];
      expect(bare(s0, { q, r })).toBe(false);
    }
    expect(bare(s0, { q: c.q + 5, r: c.r - 9 })).toBe(true);
  });
});

describe('the recap lines', () => {
  it('has a line for every mark kind, once and many times, with no numbers', () => {
    for (const kind of Object.keys(RECAP_TEXT)) {
      expect(recapText(kind, 1), kind).toBe(RECAP_TEXT[kind as keyof typeof RECAP_TEXT].one);
      const many = recapText(kind, 2)!;
      expect(many, kind).not.toContain('{');
      expect(`${recapText(kind, 1)} ${many}`, kind).not.toMatch(/\d/);
    }
  });

  it('counts in words, and says a long count plainly', () => {
    expect(recapText('strike', 2)).toBe('Foes attacked the creature twice.');
    expect(recapText('strike', 3)).toBe('Foes attacked the creature three times.');
    expect(recapText('strike', 40)).toBe('Foes attacked the creature many times.');
  });

  it('has no line for a kind it does not know', () => {
    expect(recapText('unheard-of', 1)).toBeNull();
  });

  it('tells how many days turned, at least one', () => {
    expect(daysLine(1)).toBe('A day turned while you were away.');
    expect(daysLine(3)).toBe('Three days turned while you were away.');
    expect(daysLine(0)).toBe('A day turned while you were away.');
    expect(daysLine(12)).toBe('Many days turned while you were away.');
  });

  it('covers every mark the recap can show', () => {
    for (const kind of MARK_KINDS) expect(recapText(kind, 1), kind).not.toBeNull();
  });
});
