export * from './hex.ts';
export { createRng, hashInts, hashString, hashToUnit, pickWeighted } from './random.ts';
export {
  DEFAULT_CONFIG,
  resolveConfig,
  type ConfigOverrides,
  type TuningConfig,
  type VeerWeights,
} from './config.ts';
export {
  BY_NAMES,
  CONTENT_VERSION,
  KNOWN_CONTENT_VERSIONS,
  NAME_ENDS,
  NAME_STARTS,
  QUIRKS,
  ROLES,
  TERRAIN_GENERATION,
  TERRAIN_TYPES,
  TRAITS,
  type Quirk,
  type Role,
  type Trait,
  type FieldCondition,
  type FieldRef,
  type TerrainGeneration,
  type TerrainRule,
  type TerrainType,
} from './content/index.ts';
export {
  DEFAULT_MAP_CONTENT,
  terrainAt,
  terrainById,
  terrainIdAt,
  terrainOf,
  type MapContent,
} from './map.ts';
export { noiseAt, type NoiseField } from './noise.ts';
export type {
  Character,
  CharacterStatus,
  Creature,
  GameState,
  GameStateView,
  Place,
  TileKnowledge,
  Visibility,
} from './state.ts';
export { findCharacter, hasSeed } from './state.ts';
export {
  creatureHexes,
  isCreatureHex,
  isInWindow,
  isReachable,
  pruneLostTiles,
  visibilityAt,
  windowHexes,
} from './window.ts';
export { chooseCreatureStep, predictCreature, type CreatureStepOption } from './creature.ts';
export {
  entryInto,
  entryToPlace,
  isPassable,
  isPlaceReachable,
  legalMoves,
  move,
  type ActionResult,
  type Entry,
  type MoveRefusal,
} from './actions.ts';
export {
  moveAlong,
  planPath,
  reachablePlaces,
  type PathPlan,
  type PathRefusal,
  type PathResult,
  type PathStep,
  type ReachablePlace,
} from './path.ts';
export {
  arePlacesAdjacent,
  creatureEdge,
  isBesideCreature,
  ON_CREATURE,
  onHex,
  placeAt,
  placeEquals,
  placeHex,
  placeKey,
  placeNeighbours,
  toPlace,
} from './places.ts';
export { nextDay } from './tick.ts';
export { createGame, type CreateGameOptions } from './game.ts';
export {
  addCharacter,
  characterChoices,
  characterOf,
  replaceCharacter,
  rollCharacters,
  type CharacterChoice,
  type CharacterRefusal,
  type CharacterRequest,
  type CharacterResult,
} from './characters.ts';
export {
  isKnownContentVersion,
  loadGame,
  toPlayerView,
  UnknownContentVersionError,
} from './view.ts';
