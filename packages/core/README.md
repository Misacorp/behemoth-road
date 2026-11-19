# @behemoth-road/core

The game rules: pure, headless and seeded. No UI, network or storage code. Every function takes a state (and an input) and returns a new state; the same seed and inputs always give the same result. The core knows hex coordinates only, never screen positions.

## API

- **Start and advance:** `createGame(seed, { characterIds, config, heading, start })` returns day 1 with every character riding the creature. `nextDay(state)` is the day tick: the creature steps, the window and fog update, riders move with it, anyone the creature stepped onto is now riding it (no cost), characters left outside after the grace days are lost, actions reset.
- **Places:** a character's `at` is `{ kind: 'hex', hex }` or `{ kind: 'creature' }` (riding). The creature's seven footprint hexes are one place: any of them, given as a target, means the creature (`placeAt`, `toPlace`). Helpers: `ON_CREATURE`, `onHex`, `placeKey`, `placeEquals`, `placeHex` (where to draw a place), `placeNeighbours`, `creatureEdge` (the hexes beside the footprint).
- **Act:** `move(state, characterId, to)` takes a hex or a place and returns `{ ok: true, state }` or `{ ok: false, reason }` (`invalid-hex`, `unknown-character`, `character-lost`, `not-adjacent`, `unreachable`, `impassable`, `not-enough-actions`). Boarding from a hex beside the footprint and stepping off onto one each cost a normal step. `reachablePlaces(state, id)` lists every place in reach with the actions left (the creature included), with the cheapest cost. `planPath(state, id, to)` returns the cheapest path as steps (`{ place, cost, via? }`), crossing the creature when that is cheaper, or a refusal (also `no-path`). `moveAlong(state, id, steps, places or hexes)` walks it all or nothing (a refusal names the failed `step`). `legalMoves` lists one-step places. `entryInto(state, hex)` is the one rule for entering a hex: its cost and an optional `via` tag (gear, later), or null; footprint hexes are never entered as hexes.
- **Read:** `terrainAt(seed, hex)` (from seeded noise fields: regions, river and ridge ribbons), `visibilityAt(state, hex)` (`hidden` | `seen` | `lost`), `isReachable`, `windowHexes`, `isInWindow`, `creatureHexes`, `isCreatureHex`, `predictCreature(state)` (the possible next centres with chances), `findCharacter`.
- **Hex maths** (axial, flat-top; directions `n`, `ne`, `se`, `s`, `sw`, `nw`): `hex`, `hexKey`, `neighbour`, `neighbours`, `hexDistance`, `isAdjacent`, `isValidHex`, `hexesInRange`, `hexRing`, `rotate`.
- **Randomness:** `hashToUnit(seed, ...ints)` for values tied to a place or day, `createRng(seed)` for local sequences, `pickWeighted`.
- **Data:** `TERRAIN_TYPES` and `TERRAIN_GENERATION` (the layout rules) in `src/content/`, `noiseAt` for the fields, and `DEFAULT_CONFIG` / `resolveConfig(overrides)`: every tuning number in one place (`src/config.ts`). A game stores its resolved config in its state.

`GameState` is plain JSON: store it, send it, and pass it back in.
