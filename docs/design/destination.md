# The destination

Misa's playtest: "The creature's destination is not visible on the map. The game kind of just ends. I'd like to see a visual area that the creature needs to reach for the game to end. For worldbuilding reasons no foes should traverse that area. The area can be massive or even just a line across the map and each tile in the area could have this kind of a glow indicating it's a good place to step on."

## What it is

A band of hexes across the whole map, perpendicular to the creature's heading, `from` rows out from where it set out and `depth` rows thick. It is a place, not a secret: it is known from the first day, in the view, and the map draws it on every hex of it that is on screen, fogged ones too.

**The season ends when the creature's centre steps onto the band** (`seasonEnd` in `tick.ts`, after peril is checked, as before: peril at the maximum is still a loss; below `perilWoundedAt` is safe, else wounded). It replaces "ends after `routeLength` steps".

## Rows, and why the band is where it is

The creature's step is the heading or a sixth of a turn either side (never back). Measured along the heading, a straight step is 1 row and a veering step is half a row. Left alone at the default veer weights (1 : 2 : 1) the creature averages 0.75 row a step; but fires, lures and hunger bend its path, and in the balance sim a careful party's creature averages 0.59.

`destinationFor(config, origin, heading)` puts the near edge `routeLength x destinationRowsPerStep` rows out (config; default 0.6, so 24 rows for the 40-step season). In the sim the median arrival is day 41 (careful parties, 3 and 6 players, 150 seeds: days 34 to 47); an untouched creature gets there in about 32 steps. So "9 of 40" is a guide, not a promise: the strip may read a step or two past full (clamp it, or use `destinationProgress`). `routeLength` keeps its other jobs (settlement pacing, the story's route fractions as a floor, the route strip).

The band is `depth` rows thick (config `destinationDepth`, default 3, at least 1): a step covers at most 1 row, so the creature cannot step over it. It spans the whole width of the map, so it cannot be missed by veering.

## The view

`game.destination` is public and compact:

```ts
interface Destination {
  origin: Hex; // where the creature set out
  heading: Direction; // rows are measured along it
  from: number; // rows (half rows) from the origin to the band's near edge
  depth: number; // rows thick
}
```

A hex is in the band when `from <= rowsAlong(destination, hex) < from + depth`. The web tests each hex it draws with the exported pure functions (all take the view):

- `inDestination(destination, hex)`
- `rowsAlong(destination, hex)`: exact, a multiple of 0.25.
- `destinationHexesNear(destination, centre, radius)`: the band's hexes within a radius of a hex.
- `rowsToDestination(view)`: rows the creature's centre still has to go (0 on it): the fewest steps left.
- `destinationProgress(view)`: 0 at the start, 1 at the near edge.
- `isSanctuary(view, hex)` and `regionTagsAt(view, hex)`: the band reads as the region tag `sanctuary` (`SANCTUARY_TAG`).

The band's rows are on the plane: heading north, `rowsAlong` of `(q, r)` is `-r - q / 2`, so the band is a line of hexes running east to west.

## A sanctuary

Foes keep out, read by the region tag through the usual threat rules, never by id:

- `canAppearOn` refuses a sanctuary hex, so nothing is rolled or laid in it.
- `threatPath` stops a threat at the band's edge, like a fire's ring: it holds there, it does not go round.
- `blockedFor(view, subject)` lists every known hex of the band with reason `sanctuary` (for every subject: every threat), beside the `fire` ones.
- Hazard patches (terrain and rockslide clusters) never cover a band hex (`extendHazards` takes the destination); lures are never placed in it nor led into it (`holdsLure`, `canLeadOnto`).

Threats beyond the edge keep their reach and may still strike a character standing in the band from outside it. A settlement may stand in it (a settlement is not a foe).

## Open

- The art: a glow on each hex of the band, a different look for the band as it is approached; the web agents' call.
- The story beat at the end ("Greyfold") still fires by route fraction: the step count, or the way to the band, whichever is further.
