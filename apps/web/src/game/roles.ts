/**
 * Which role a greyed action needs, read from the core: when `checkAction` refuses for a reason that is
 * about who you are (`ROLE_REFUSALS`), the role is the first one in content order under which the core no
 * longer gives that reason. No table of action-to-role here: the core's rules and the roles' tags decide.
 */
import {
  type ActCheck,
  type Action,
  checkAction,
  type GameStateView,
  ROLES,
} from '@behemoth-road/core';

/** The core's refusals that mean "someone in another role can". */
export const ROLE_REFUSALS: ReadonlySet<string> = new Set([
  'needs-specialist',
  'needs-keeper',
  'needs-guardian',
  'cannot-work',
]);

/** The role id a refused action needs, or null when the refusal is not about the role. */
export function neededRole(
  game: GameStateView,
  characterId: string,
  action: Action,
  check: ActCheck = checkAction(game, characterId, action),
): string | null {
  if (check.ok || !ROLE_REFUSALS.has(check.reason)) return null;
  const me = game.characters.find((c) => c.id === characterId);
  if (!me) return null;
  for (const role of ROLES) {
    if (role.id === me.role) continue;
    const as: GameStateView = {
      ...game,
      characters: game.characters.map((c) => (c.id === characterId ? { ...c, role: role.id } : c)),
    };
    const other = checkAction(as, characterId, action);
    if (other.ok || other.reason !== check.reason) return role.id;
  }
  return null;
}
