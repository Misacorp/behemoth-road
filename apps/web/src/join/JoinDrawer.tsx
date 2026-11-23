/**
 * Joining (and replacing a lost character): pick one of the offered characters, then a role, then
 * confirm. Figures, trait and quirk icons and role emblems; the characters' names are the only text.
 */
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import type { Offer } from '../api/schema.ts';
import { offerLook } from '../game/identity.ts';
import { CharacterFigure, TickMark } from '../hud/icons.tsx';
import { PALETTE } from '../map/art.ts';
import { Drawer } from '../ui/Drawer.tsx';
import { contentName, QuirkIcon, RoleEmblem, ROLE_IDS, TraitIcon } from '../ui/emblems.tsx';
import { IconTip } from '../ui/IconTip.tsx';
import { tipFor } from '../ui/tip.ts';
import { tipProps } from '../ui/press.ts';
import { ready, START, wizard, type Wizard } from './wizard.ts';
import { ArtIcon } from '../onboarding/art.tsx';
import { RoleCardView } from '../onboarding/RoleCardView.tsx';
import { ROLE_CARDS } from '../onboarding/roleCards.ts';

export interface JoinDrawerProps {
  readonly open: boolean;
  readonly offers: readonly Offer[];
  /** The party's look seeds in join order, so an offer previews the look it will have on the map. */
  readonly party: readonly number[];
  /** True while the join or replace request is in flight. */
  readonly busy: boolean;
  readonly onConfirm: (role: string, offer: number) => void;
  readonly onClose?: () => void;
}

export function BackIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M15 5l-7 7 7 7"
        fill="none"
        stroke={PALETTE.ink}
        stroke-width={2}
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}

export function OfferCard({
  offer,
  party,
}: {
  offer: Offer;
  party: readonly number[];
}): JSX.Element {
  const { accent, look } = offerLook(party, offer.lookSeed);
  return (
    <>
      <span class="offer-figure">
        <CharacterFigure accent={accent} look={look} />
      </span>
      <span class="offer-name">{offer.name}</span>
      <span class="offer-icons">
        {offer.trait && (
          <IconTip id={tipFor('trait', offer.trait)} tapShows>
            <TraitIcon id={offer.trait} />
          </IconTip>
        )}
        {offer.quirk && (
          <IconTip id={tipFor('quirk', offer.quirk)} tapShows>
            <QuirkIcon id={offer.quirk} />
          </IconTip>
        )}
      </span>
    </>
  );
}

export function JoinDrawer(props: JoinDrawerProps): JSX.Element | null {
  const [w, setW] = useState<Wizard>(START);
  useEffect(() => {
    if (props.open) setW(START);
  }, [props.open]);
  const chosen = w.offer === null ? null : (props.offers[w.offer] ?? null);

  return (
    <Drawer
      open={props.open}
      label="Join"
      side="left"
      {...(props.onClose ? { onClose: props.onClose } : {})}
    >
      <div class="join" data-step={w.step}>
        <div class="join-step join-characters" role="listbox" aria-label="Characters">
          {props.offers.map((o, i) => (
            <button
              key={`${o.name}-${String(i)}`}
              type="button"
              class="offer"
              role="option"
              aria-selected={w.offer === i}
              data-autofocus={i === 0 ? true : undefined}
              onClick={() => setW((s) => wizard(s, { kind: 'offer', index: i }))}
            >
              <OfferCard offer={o} party={props.party} />
            </button>
          ))}
        </div>
        <div class="join-step join-roles" role="listbox" aria-label="Roles">
          <button
            type="button"
            class="join-back"
            aria-label="Back"
            onClick={() => setW((s) => wizard(s, { kind: 'back' }))}
          >
            <BackIcon />
          </button>
          {/* One card a role, swiped through; a tap on a card picks it. */}
          <div class="role-strip">
            {ROLE_CARDS.filter((c) => ROLE_IDS.includes(c.role)).map((c) => (
              <button
                key={c.role}
                type="button"
                class="role"
                role="option"
                aria-label={contentName('role', c.role)}
                aria-selected={w.role === c.role}
                data-role={c.role}
                onClick={() => setW((s) => wizard(s, { kind: 'role', role: c.role }))}
                {...tipProps(tipFor('role', c.role))}
              >
                <RoleCardView card={c} />
              </button>
            ))}
          </div>
        </div>
        <div class="join-step join-confirm">
          <button
            type="button"
            class="join-back"
            aria-label="Back"
            onClick={() => setW((s) => wizard(s, { kind: 'back' }))}
          >
            <BackIcon />
          </button>
          <div class="join-choice">
            {chosen && <OfferCard offer={chosen} party={props.party} />}
            {w.role && (
              <IconTip id={tipFor('role', w.role)} tapShows>
                <RoleEmblem role={w.role} size={44} />
              </IconTip>
            )}
          </div>
          <button
            type="button"
            class="join-go"
            aria-label="Confirm"
            disabled={!ready(w) || props.busy}
            onClick={() => {
              if (ready(w)) props.onConfirm(w.role, w.offer);
            }}
          >
            <svg viewBox="-26 -26 52 52" aria-hidden="true">
              <TickMark r={24} />
            </svg>
          </button>
        </div>
        {/* The public wiki opens in the browser: the icon guide, for those who want it before choosing. */}
        <a
          class="join-wiki"
          href="/wiki"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Wiki"
        >
          <ArtIcon id="book" size={28} />
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path
              d="M5 11l6-6M6 5h5v5"
              fill="none"
              stroke={PALETTE.ink}
              stroke-width={1.8}
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </a>
      </div>
    </Drawer>
  );
}
