import { destinationProgress, type GameStateView } from '@behemoth-road/core';
import type { RouteProps } from './Season.tsx';

/**
 * The route strip's numbers for a game: the date counts steps, but how far along the creature is comes from
 * the destination band, so the strip is full exactly when the season ends there.
 */
export const routeOf = (
  game: Pick<GameStateView, 'creature' | 'config' | 'destination'>,
): RouteProps => ({
  steps: game.creature.steps,
  length: game.config.routeLength,
  progress: destinationProgress(game),
});
