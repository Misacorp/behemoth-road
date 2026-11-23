/**
 * Role emblems and trait and quirk icons: the art kit's `drawIcon`, keyed by the content's `icon` ids
 * (`packages/core` content), through the same allowlisted mapper as the map. Unknown ids draw the art
 * kit's neutral mark. Their only text is their content name, shown on a tap or hover (`Named`).
 */
import { drawIcon } from '@behemoth-road/art';
import { QUIRKS, ROLES, TRAITS } from '@behemoth-road/core';
import { cloneElement, type JSX } from 'preact';
import { PALETTE } from '../map/art.ts';
import { toPreact } from '../map/svgToPreact.ts';

/** A role, trait or quirk's content name (the only text these icons have), or the id itself. */
export function contentName(kind: 'role' | 'trait' | 'quirk', id: string): string {
  const list = kind === 'role' ? ROLES : kind === 'trait' ? TRAITS : QUIRKS;
  return list.find((x) => x.id === id)?.name ?? id;
}

/** The six role ids, in content order. */
export const ROLE_IDS: readonly string[] = ROLES.map((r) => r.id);

const iconOf = (list: readonly { id: string; icon: string }[], id: string): string =>
  list.find((x) => x.id === id)?.icon ?? id;

function Icon(props: {
  icon: string;
  size: number;
  tile?: 'trait' | 'quirk';
  data: Record<string, string>;
}): JSX.Element {
  const node = drawIcon(props.icon, PALETTE, props.size, props.tile ? { tile: props.tile } : {});
  // The icon is its own <svg>, so it sits in HTML and inside the map's SVG popovers alike.
  return cloneElement(toPreact(node), { ...props.data, 'aria-hidden': 'true' });
}

export function RoleEmblem({
  role,
  size = 32,
}: {
  role: string | null;
  size?: number;
}): JSX.Element {
  const icon = role === null ? 'role:none' : `role:${role}`;
  return <Icon icon={icon} size={size} data={{ 'data-role-icon': role ?? '' }} />;
}

/** A trait's icon; nothing for the plain character. */
export function TraitIcon({
  id,
  size = 20,
}: {
  id: string | null;
  size?: number;
}): JSX.Element | null {
  if (id === null) return null;
  return <Icon icon={iconOf(TRAITS, id)} size={size} tile="trait" data={{ 'data-trait': id }} />;
}

/** A quirk's icon; nothing for the plain character. */
export function QuirkIcon({
  id,
  size = 20,
}: {
  id: string | null;
  size?: number;
}): JSX.Element | null {
  if (id === null) return null;
  return <Icon icon={iconOf(QUIRKS, id)} size={size} tile="quirk" data={{ 'data-quirk': id }} />;
}
