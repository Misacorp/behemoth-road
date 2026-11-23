/**
 * The intro cards: a few cards, one at a time, led by the game's own art with one short line each, so a new
 * player knows what Behemoth Road is about (a party of friends escorts a huge creature home across a wild
 * map; each of you has a few actions a day; at dusk the creature walks and dangers move; together you reach
 * home). Back is at the top left, Skip at the top right; a swipe or the round button goes on. Shown once per
 * Discord user (the server keeps that), and again from the day readout's menu.
 */
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { CharacterFigure, TickMark } from '../hud/icons.tsx';
import { RouteStrip } from '../hud/Season.tsx';
import { Pips } from '../hud/icons.tsx';
import { PALETTE } from '../map/art.ts';
import { BackIcon } from '../join/JoinDrawer.tsx';
import { RoleEmblem } from '../ui/emblems.tsx';
import { ArtCreature, ArtIcon, ArtThreat } from './art.tsx';
import { cardAfter, INTRO_CARDS, type IntroCard, swipeTo } from './intro.ts';

const PARTY: readonly string[] = ['sky', 'plum', 'sage', 'ochre', 'slate'];

/** The art of one card. */
function CardArt({ id }: { id: IntroCard['id'] }): JSX.Element {
  switch (id) {
    case 'journey':
      return (
        <div class="onb-art onb-art-journey">
          <ArtCreature size={190} />
          <div class="onb-party">
            {PARTY.map((accent) => (
              <span key={accent} class="onb-figure">
                <CharacterFigure accent={accent} />
              </span>
            ))}
          </div>
        </div>
      );
    case 'actions':
      return (
        <div class="onb-art onb-art-actions">
          <div class="onb-roles">
            {(['scout', 'scholar', 'keeper', 'engineer', 'warden'] as const).map((r) => (
              <RoleEmblem key={r} role={r} size={44} />
            ))}
          </div>
          <span class="onb-figure onb-figure-big">
            <CharacterFigure accent="sky" />
          </span>
          <div class="onb-pips">
            <Pips total={3} left={3} size={30} />
          </div>
        </div>
      );
    case 'dusk':
      return (
        <div class="onb-art onb-art-dusk">
          <span class="onb-moon">
            <ArtIcon id="moon" size={72} />
          </span>
          <div class="onb-dusk-row">
            <span class="onb-threat">
              <ArtThreat look="captors" size={76} />
            </span>
            <svg class="onb-arrow" viewBox="0 0 60 16" aria-hidden="true">
              <path
                d="M4 8h48m-8-6 8 6-8 6"
                fill="none"
                stroke={PALETTE.ink}
                stroke-width={2.4}
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <ArtCreature size={120} />
          </div>
        </div>
      );
    case 'home':
      return (
        <div class="onb-art onb-art-home">
          <ArtCreature size={130} />
          <div class="onb-route">
            <RouteStrip steps={7} length={10} width={260} />
          </div>
          <span class="onb-home">
            <ArtIcon id="shelter" size={84} />
          </span>
        </div>
      );
  }
}

export interface IntroCardsProps {
  /** Done: the last card's tick. */
  readonly onDone: () => void;
  /** Skip, from any card. */
  readonly onSkip: () => void;
}

export function IntroCards({ onDone, onSkip }: IntroCardsProps): JSX.Element {
  const [page, setPage] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number } | null>(null);

  // Focus moves in when the cards open and leaves with them, without a ring.
  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
    return () => {
      if (ref.current?.contains(document.activeElement)) {
        (document.activeElement as HTMLElement).blur();
      }
    };
  }, []);

  const card = INTRO_CARDS[page] ?? INTRO_CARDS[0]!;
  const last = page === INTRO_CARDS.length - 1;
  const go = (to: number): void => {
    if (to >= INTRO_CARDS.length) onDone();
    else setPage(Math.max(0, to));
  };

  return (
    <div
      ref={ref}
      class="onb onb-intro"
      role="dialog"
      aria-label="Welcome"
      tabindex={-1}
      onPointerDown={(e) => {
        drag.current = { id: e.pointerId, x: e.clientX };
      }}
      onPointerUp={(e) => {
        const d = drag.current;
        drag.current = null;
        if (!d || d.id !== e.pointerId) return;
        const to = swipeTo(page, e.clientX - d.x);
        if (to !== null) go(to);
      }}
      onPointerCancel={() => {
        drag.current = null;
      }}
    >
      <div class="onb-top">
        {page > 0 ? (
          <button
            type="button"
            class="onb-back"
            aria-label="Back"
            onClick={() => go(cardAfter(page, -1))}
          >
            <BackIcon />
          </button>
        ) : (
          <span />
        )}
        <button type="button" class="chip onb-skip" onClick={onSkip}>
          Skip
        </button>
      </div>
      <div class="onb-card" key={card.id} data-card={card.id}>
        <CardArt id={card.id} />
        <p class="onb-line">{card.line}</p>
      </div>
      <div class="onb-foot">
        <span class="onb-dots" aria-hidden="true">
          {INTRO_CARDS.map((c, i) => (
            <i key={c.id} class={i === page ? 'on' : ''} />
          ))}
        </span>
        <button
          type="button"
          class="round onb-next"
          aria-label={last ? 'Done' : 'Next'}
          data-autofocus
          onClick={() => go(page + 1)}
        >
          {last ? (
            <svg viewBox="-26 -26 52 52" aria-hidden="true">
              <TickMark r={24} />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M9 5l7 7-7 7"
                fill="none"
                stroke={PALETTE.ink}
                stroke-width={2}
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          )}
        </button>
      </div>
    </div>
  );
}
