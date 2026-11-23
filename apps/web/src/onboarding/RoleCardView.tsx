/**
 * One role's card in the join drawer: its emblem and name, then what you do out there as icons leading to
 * what the team gets, and one short line. The whole card is the role's button (a tap picks it, a swipe moves
 * on to the next card).
 */
import type { JSX } from 'preact';
import { contentName, RoleEmblem } from '../ui/emblems.tsx';
import { ArtCreature, ArtIcon, ArtMoment, ArtVia } from './art.tsx';
import type { RoleCard, RoleGet } from './roleCards.ts';

function Get({ get }: { get: RoleGet }): JSX.Element {
  switch (get.kind) {
    case 'moment':
      return <ArtMoment kind={get.id} size={52} />;
    case 'icon':
      return <ArtIcon id={get.id} size={52} />;
    case 'via':
      return <ArtVia id={get.id} size={52} />;
    case 'creature':
      return <ArtCreature size={64} />;
  }
}

export function RoleCardView({ card }: { card: RoleCard }): JSX.Element {
  return (
    <>
      <span class="role-emblem">
        <RoleEmblem role={card.role} size={64} />
      </span>
      <span class="role-name">{contentName('role', card.role)}</span>
      <span class="role-chain" aria-hidden="true">
        <span class="role-does">
          {card.does.map((id) => (
            <ArtIcon key={id} id={id} size={40} />
          ))}
        </span>
        <svg class="role-chev" viewBox="0 0 24 24">
          <path
            d="M8 4l8 8-8 8"
            fill="none"
            stroke="currentColor"
            stroke-width={2.4}
            stroke-linecap="round"
            stroke-linejoin="round"
          />
        </svg>
        <span class="role-gets">
          <Get get={card.gets} />
        </span>
      </span>
      <span class="role-line">{card.line}</span>
    </>
  );
}
