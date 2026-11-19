# @behemoth-road/core

The game rules: pure, headless and seeded. No UI, network or storage code. Every function takes a state (and an input) and returns a new state; the same seed and inputs always give the same result. The core knows hex coordinates only, never screen positions.

## API

- **Start and advance:** `createGame(seed, { characterIds, config, heading, start })` returns day 1 with characters placed near the creature. `nextDay(state)` is the day tick: the creature steps, the window and fog update, characters left outside after the grace days are lost, actions reset.
- **Act:** `move(state, characterId, to)` returns `{ ok: true, state }` or `{ ok: false, reason }` (`unknown-character`, `character-lost`, `not-adjacent`, `unreachable`, `impassable`, `not-enough-actions`). `legalMoves(state, id)` lists the hexes a character can move to; `moveCost(state, hex)` is the cost.
- **Read:** `terrainAt(seed, hex)`, `visibilityAt(state, hex)` (`hidden` | `seen` | `lost`), `isReachable`, `windowHexes`, `isInWindow`, `creatureHexes`, `isCreatureHex`, `predictCreature(state)` (the possible next centres with chances), `findCharacter`.
- **Hex maths** (axial, flat-top; directions `n`, `ne`, `se`, `s`, `sw`, `nw`): `hex`, `hexKey`, `neighbour`, `neighbours`, `hexDistance`, `isAdjacent`, `hexesInRange`, `hexRing`, `rotate`.
- **Randomness:** `hashToUnit(seed, ...ints)` for values tied to a place or day, `createRng(seed)` for local sequences, `pickWeighted`.
- **Data:** `TERRAIN_TYPES` (`src/content/`), and `DEFAULT_CONFIG` / `resolveConfig(overrides)`: every tuning number in one place (`src/config.ts`). A game stores its resolved config in its state.

`GameState` is plain JSON: store it, send it, and pass it back in.
