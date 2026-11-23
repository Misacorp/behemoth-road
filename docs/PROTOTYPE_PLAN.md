# Behemoth Road: prototype plan

The aim is to see the game in action as early as possible. Each milestone ends with something the owner can open and try. Build them in order. Do not start a milestone until the one before it has been tried and accepted.

The design reference is `docs/GAME_DESIGN.md`. Where this plan and the design disagree, ask.

## Starting values

These are guesses. Put all of them in one config and expect them to change.

| Setting                         | Starting value                                                              | Status                                          |
| ------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------- |
| Actions per player per day      | 3                                                                           | Working assumption                              |
| Cost to move one hex            | 1 action                                                                    | Decided, tunable through traits, gear, vehicles |
| Creature footprint              | 7 hexes (one centre hex and its six neighbours)                             | Decided for the first creature                  |
| Creature speed                  | 1 hex per day                                                               | Decided                                         |
| Creature heading                | Fixed general direction; each day straight ahead or one step to either side | Decided                                         |
| Window radius                   | 5 hexes from the creature's centre                                          | Guess; open question                            |
| Grace period for trailing tiles | 1 day                                                                       | Decided                                         |
| Share of empty hexes            | Most of the map                                                             | Decided in spirit; tune by eye                  |
| Players per session             | Cap 15, expect 8                                                            | Decided                                         |
| Characters per player           | 1                                                                           | Decided for now                                 |

## Milestone 0: foundations

Goal: an agreed stack and an empty app that deploys.

- Propose the tech stack and repo layout, reusing the creatures app's Discord and hosting approach where sensible. Get approval.
- Set up the game core as its own module with a test runner.
- Set up a deploy path so every accepted change can be opened in a browser.

Done when: a blank page is live, and one trivial core test passes.

## Milestone 1: the walking map

Goal: prove the central idea, a moving window around a big creature, feels good to look at and move in. Single player, no login, no persistence needed beyond the session.

Core:

- Seeded hex map generation along a route, with a few terrain types (for example plains, desert, forest, river, cliff). Mostly empty hexes.
- The creature: 7-hex footprint, heading, one step per tick, veering by seeded rule.
- The window: tiles in range are in play; trailing tiles get one grace day, then are lost.
- Fog of war: tiles are hidden, seen, or lost.
- One character: position, 3 actions per day, move one hex per action, pass through the creature's hexes.
- Left-behind rule: a character outside the window after the grace day is lost.
- Day tick as a pure function.

Interface:

- Pan and zoom hex map that works with touch and mouse.
- Tap or click a hex to see what it is in a popover. Tap a reachable hex to move.
- Remaining actions shown visually, not as a sentence.
- The creature's next likely steps hinted visually.
- Development control: "next day".

Done when: the owner can walk a character around, skip days, watch the map scroll, get left behind on purpose, and do all of it comfortably on a phone and a desktop.

Out of scope: roles, resources, sites, other players, Discord, art beyond clear placeholder shapes.

## Milestone 2: the session

Goal: several real people share one map.

- Discord sign-in. One session per Discord server. Cap of 15 players.
- Persistent game state on the server. Clients send intended actions; the server applies them through the core.
- Each player gets a character: a name, one random trait, one random quirk, from small starter lists defined as data. A plain character is always available.
- The player declares a starting role (stored, shown, no mechanics yet).
- Other players' characters are visible on the map.
- Scheduled daily tick in production; manual "next day" for an admin in development.
- A lost character can be replaced with a new one.

Done when: the owner and a few friends can join from Discord, move on the same map over several real or skipped days, and see each other.

Out of scope: role mechanics, skill trees, idle stances.

## Milestone 3: the first chain

Goal: prove that roles depend on each other. Three roles: Scout, Engineer, Scholar.

- **Scout.** Hexes can hide things: resource nodes, sites, traps. A scout who enters a hex reveals what is there for everyone. Others entering the same hex reveal less, or risk more (basics for all, mastery for specialists).
- **Gathering.** Resource nodes (for example iron deposit, sturdy rocks at a river) yield materials for an action. Engineers are better at it.
- **Engineer.** A small recipe list, defined as data, with limited crafts per day. Crafted items benefit the whole team. Must include at least one movement item (grappling hook: everyone can cross cliff edges).
- **Scholar.** Sites (for example a tomb) have tiers. A site costs one or more actions to work and may need an item or material. Success returns a find, including rare materials an engineer can use. Use a success chance here so the owner can judge how randomness feels.
- A shared team inventory, shown visually.

Done when: a scout finds a site and a node, an engineer gathers and crafts something that changes how everyone moves, and a scholar opens the site with help from that chain. The owner should be able to feel that each role mattered.

Out of scope: skill trees (use one or two fixed role perks instead), keeper, guardian, envoy, threats.

## Milestone 4: the living creature

Goal: the creature becomes a character, and the keeper role becomes a puzzle.

- Creature properties as hidden data: needs (hunger at minimum), reactions to stimuli (fire at minimum: attracted, repelled or indifferent, set per creature).
- Symptoms shown visually without naming causes. Underfed and overfed look different.
- Players can place stimuli on the map (light a fire in a hex). The creature's next step reacts according to its hidden properties. This is how steering works.
- **Keeper.** Feeds and tends the creature, gathers food and herbs, and gets clearer symptom signals than other roles. A simple pace control: make it linger one day.
- A neglected creature takes worse steps and causes trouble, but always moves.
- The first creature is tame with light quirks.

Done when: a keeper can work out by experiment how the creature reacts to fire, and the team can use that to turn it.

## Milestone 5: threats and an ending

Goal: a complete, short season that can be won or lost.

- The attack system with two or three flavours, defined as data with tags.
- **Guardian.** Clears a threat before it reaches the creature, defends when it arrives, escorts another character.
- **Envoy.** At least one people on the route to deal with, with more than one outcome.
- Peril that builds through neglect and enemy pressure; graded outcomes at the end.
- Scaling by player count and days elapsed.
- A destination: reaching it ends the season.

Done when: the group can play a full short season to a win or a loss.

## Later, not now

- Skill trees and multi-classing. (First slice built: one XP pool, tier 1 of each tree, another role's tier 1; see `docs/design/skill-trees.md`.)
- Idle stances.
- Vehicles and rescue.
- Personal objectives, sanctuary, archive, artifacts.
- Character unlocks during play, retirement at season end.
- Keeper's hypothesis log.
- Creature outfitting (keeper and engineer).
- Creature shapes other than the large hex.
- Larger events (sirens, deity, madness) and story.
- Balancing simulations: Monte Carlo runs over player patterns, using the headless seeded core. (A seeded careful/careless simulation exists in `packages/core/scripts/balance.ts`; richer player patterns after the first real season.)
- Letting other Discord servers invite the game.

## What to watch for while building

Report these to the owner as they appear, since they are the questions the prototype exists to answer:

- Does three actions a day, with movement costing actions, feel tight in a good way or just frustrating?
- How often do characters get left behind?
- Is the window the right size for the creature's footprint?
- Do resource nodes crowd the map?
- Is scouting interesting once the frontier is revealed each day?
