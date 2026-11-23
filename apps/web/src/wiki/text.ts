/**
 * The wiki's text, from the game's own: a role's line and a node's effect line are the tips' strings with the
 * numbers filled from the default tuning. Nodes with no tip yet (the planned tiers) have no effect line.
 */
import { DEFAULT_CONFIG, ROLES, type SkillNode } from '@behemoth-road/core';
import { fillTip, tipValues } from '../text/tipValues.ts';
import { TIP_TABLE } from '../text/tips.ts';
import { tipFor } from '../ui/tip.ts';

const VALUES = tipValues(DEFAULT_CONFIG);

const textOf = (kind: string, id: string): string | null => {
  const tip = tipFor(kind, id);
  return tip === null ? null : fillTip(TIP_TABLE[tip].text, VALUES);
};

/** One line about a role. */
export const roleLine = (role: string): string => textOf('role', role) ?? '';

/** The role's name (content). */
export const roleName = (role: string): string => ROLES.find((r) => r.id === role)?.name ?? role;

/** One line about what a node does, or null when the game has no tip for it. */
export const effectLine = (node: SkillNode): string | null => textOf('skill', node.id);
