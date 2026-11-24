# Behemoth Road: game design

This is the design as of 19 November 2026. It records what is decided, what is a working assumption, and what is open. It is a concept, not a spec.

## 1. Concept

An invite-only group of friends escorts a mythical creature to where it is going, having freed it from captivity. The creature walks one step per day. Players act in the hex area around it: exploring, gathering, meeting locals, and dealing with whatever threatens it.

Play is asynchronous and takes a few minutes a day. Each player runs one character with a clear role. Each season brings a new creature with its own nature, and a season can fail.

## 2. Design pillars

Every decision is tested against these.

1. **A part to play.** Each player understands their role in the group and can see how well they are doing in it.
2. **Investment opens doors for everyone.** Any player should be able to say: "my character has gotten so good at this that we all now have more opportunities." Mastery unlocks options for the group, not just bigger private numbers.
3. **Low daily cost, real depth.** A few minutes a day is enough to contribute. Players who invest more are rewarded.
4. **Shared progress.** The group is static and invite-only. Progress counts for everyone, including those who miss days.
5. **No single hero.** Anyone can attempt the basics, but no one player can master every role.

## 3. Map and core loop

### The window

- The map is a hex grid. Only a window of hexes around the creature is in play.
- The creature occupies a cluster of about seven hexes, shaped like one large hex. Its hexes are one place, "on the creature": characters can ride it, start on it, board it and step off it, and they do not take a hex while riding (decision of 19 November 2026). Other shapes (a long serpent) may come later.
- The creature moves one hex per day. It keeps a general heading and veers only to either side (heading north, it goes north, north-east or north-west). It never turns back. Players can predict its path and plan trips out and back.
- New tiles appear at the leading edge. Tiles that fall behind stay reachable for one more day, then are lost to the fog.
- A character still outside the window after the grace day is lost for good.
- Expect many empty hexes. The map should not be crowded.

### A day

1. **New day.** The creature has moved. New tiles are in view.
2. **Act.** Each player has about three actions to spend whenever they like.
3. **Idle stance.** Unspent actions go to a stance the player has set (rest, lie in wait or gather), so an absent player still contributes something; a player can also end their day early (wait) to let the stance take the rest. See `docs/design/stances.md`.
4. **Tick.** Threats resolve, the creature's needs are checked, and it walks on.

### Actions

- Moving one hex costs one action. This is deliberate: players must decide where to be and how much risk to take.
- Other tasks cost one action or more. A harder site may need two actions, or a resource supplied by another role.
- Movement can be improved within a run: character traits (+1 movement on desert tiles), crafted gear (a grappling hook to scale cliffs), and vehicles that carry one or more characters. A vehicle can rescue a stranded character.

### Development mode

A development build can advance to the next day at will, whether or not players have acted, so a season can be played through quickly.

## 4. Systems

The game is built from a few systems. Each appears in many mechanics and flavours: an angry tribe, a rock slide and a pterodactyl swarm are all the attack system. Content carries tags (flying, desert, ancient), and skills hook into tags.

| System        | What it is                                      | Example flavours                                                     | What investment buys                                                                  |
| ------------- | ----------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Attack        | Something threatens the creature or the team    | Angry tribe, rock slide, pterodactyl swarm, ambush, pursuing captors | Skill against attacker types, clearing threats early, stronger defence                |
| Information   | What is known about the map and what lies ahead | Entering a hex to see what it hides, hints, traps, weather           | Hints about interesting hexes, safe discovery of neighbouring hexes, longer forecasts |
| Discovery     | Working the sites that have been found          | Archaeology, research, treasure hunting                              | Better toolkit, higher success on harder tiers, site specialities                     |
| Creature care | Learning and managing the creature              | Feeding balance, mood, illness, medical procedures                   | Clearer reading of the creature, stronger effect on its mood, health and pace         |
| Crafting      | Turning materials into equipment for the team   | Grappling hook, sharp knives, weapons, numbing agent                 | Better items, special effects, lower cost, gathering helpers                          |
| Diplomacy     | Dealing with the peoples along the route        | Tribes, cities, factions, trade, quests for favour                   | Wider reach, better outcomes, alliances                                               |

**Gathering** runs through every role. Any action can return resources or items, but the actions differ: a tomb cracked open yields treasure, an iron deposit yields ore. Resources sit at nodes on the map that scouts identify. If nodes crowd the map, the fallback is terrain that yields resources by its type.

**Movement** is not a system. It belongs to the character and is extended by gear and vehicles.

### Combining systems

A challenge is one or more systems plus tags and a flavour.

| Challenge                              | Systems                                   | How roles contribute                                                                                                                   |
| -------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| Pterodactyl swarm, seen two days ahead | Information + attack                      | Forecast gives time to prepare; wardens skilled against flying attackers carry the defence                                             |
| Sirens calling the creature off course | Creature care + information               | A keeper who knows the creature holds it back; scouts find the source                                                                  |
| Buried temple in a desert              | Information + discovery + crafting        | A scout finds it, crafted gear gets the party there, a scholar opens it                                                                |
| Toxic brambles on the path             | Creature care + anything players discover | Scare, lure or coax the creature around them; if it falls ill, a keeper treats it with tools from trade, a site or an engineer         |
| Captors closing in                     | Attack + diplomacy                        | Wardens delay them, or persuade locals to mislead them                                                                                 |
| Fortified city on the route            | All                                       | Keepers set the pace, scouts learn what awaits, wardens win over factions and deal with resistance, engineers trade for rare materials |

A large challenge has several ways through. The path taken depends on the team's composition. Head-on combat is rarely the only answer.

### Rules for cooperation

- **Roles over combos.** There are no built-in combination bonuses between characters. The journey needs several roles at once. A specialist can join another role's work and open new options there, as a warden does when a scout meets strangers.
- **Basics for all, mastery for specialists.** Any character can attempt the basics of any role. A specialist gets clearly better outcomes.
- **A passive option never beats an active one.** A stance is an activity a player could do on any hex with their actions (in a real-time mode they would spend each of the day's actions on it), so its use of an action is never stronger than a specialist's active action. See `docs/design/stances.md`.
- **More players do more, not just survive.** Two keepers specialise faster; more scouts find better-hidden places. Challenges scale to the team, so success never depends on headcount.

## 5. Roles

Five working roles (Guardian and Envoy merged into the Warden on 2026-11-23). Each has its own domain, its own challenge, a reason to leave the creature, and something to bring back for the team. Each profession does the main gathering for its own work.

| Role     | Domain                                                                   | Out in the world                                                                                                                                                                    | What the team gets                                                                | Upgrade directions                                                                                              |
| -------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Scout    | The map: finding and identifying everything on it                        | Enters hexes to learn what they hide, at the risk of traps                                                                                                                          | Sites, resource nodes, encounters and dangers revealed                            | Hints about interesting hexes, safe discovery of neighbouring hexes, longer forecasts                           |
| Scholar  | Sites: an archaeologist, researcher or scientist                         | Travels to sites a scout found, spends time there, brings the right tools                                                                                                           | New and rare finds, including rare crafting materials                             | Toolkit, success on harder tiers, site specialities                                                             |
| Keeper   | The creature: health, mood and pace                                      | Gathers herbs and food, entertains it, treats illness, learns its nature                                                                                                            | A healthy, calm creature improves everyone's play; it can linger or hurry         | Clearer feedback from the creature, more effective care                                                         |
| Engineer | Equipment and tools                                                      | Gathers abundant materials at nodes; chooses what to make with limited crafts per day                                                                                               | Items given to everyone (a grappling hook lets all climb cliffs)                  | Item quality and special effects, lower cost, material tiers, a gathering helper such as a robotic monkey drone |
| Warden   | Protection of the creature and the team, and the peoples along the route | Clears ambushes ahead, defends against attacks, fights when an encounter turns violent, escorts others; unites tribes, earns favour, turns enemies on each other, appeals to cities | A safer path and safer sites; safe passage, allies, better outcomes in encounters | Specialities against attacker types, stronger defence; wider circle of influence, such as message ravens        |

Notes:

- **Keeper.** Reading the creature is a puzzle of symptoms and causes. It starts as intuition. The keeper hypothesises and experiments: lighting a fire next to the creature shows whether it lingers, flees or ignores it. An underfed creature shows one symptom, an overfed one another. The team must trust the keeper's reading until a finding is confirmed. For now the team discusses this on Discord. A later option is a keeper's log of hypotheses with blanks to fill through experiments.
- **Engineer.** Crafting should be fun in itself. Hypothesis: its own gathering loop, risk and reward in crafting, and a technology tree where one path leads away from another. The creature can change the tree, so runs differ. Keeper and engineer may share the work of outfitting the creature with defences, weapons or modules.
- **Warden.** The Guardian and the Envoy are one role since 2026-11-23: both struggled to find things to do when nothing was scouted, and one role that protects and deals with peoples makes better choices. A warden can accompany others and help significantly, and the map should hold targets of its own, such as a hostile settlement at the far edge that rewards the team when dealt with. Its skill tree forks by style, not by half the role: stand fast (act on the spot) or range out (act at a distance), each with protection and diplomacy.
- **Scout.** If scouting becomes trivial, add variety: fog of war that shifts, plateaus, valleys, gorges, caves.

## 6. Characters

- Characters are named people, not necessarily human.
- Each player fields one character.
- **Rolled, not built.** Each character has a random trait and a random quirk. A quirk helps and hinders. Its downside costs the character, not the group.
- **Sidegrades, not upgrades.** No character is rarer or stronger than another. Variety is the point.
- **A declared starting role.** At the start of a run the player declares a role and plays it from day one. Characters are not locked to a role. Later skill points can branch into others, like multi-classing. A run gives enough points for one or two roles, not all.
- **One run each.** A character retires with the creature after a successful run and is lost in a failed one. Characters unlocked during play are for future runs.
- **A plain character is always available** to recruit, with no interesting properties.
- **No free swaps.** A player changes role mid-season only by giving up their character for good and bringing in a new one. A character left behind is lost the same way.

## 7. Seasons and creatures

- One season is one journey with one creature. It ends when the team wins or loses, not on a fixed date.
- The route must be long enough for characters to grow. Two weeks at three actions a day is about 40 actions, probably too few.
- A creature has a nature (personality and quirks), a need (what goes wrong when neglected), and a pursuer (who is after it). Players know the broad strokes at the start.
- **It starts largely unknown.** Its reactions are properties to be learned and differ per creature. One fears fire; another approaches it.
- **Players find the interactions.** Scaring, luring or coaxing are not preset choices. They follow from the creature's properties and what the team has learned.
- **Steering is indirect.** Nobody sits at the wheel. Players change the map around the creature and it reacts by turning, stopping or speeding up. Pace is the keeper's lever.
- **It always moves.** A neglected or sick creature takes worse paths and makes life hard, but the journey never stalls, even with no keeper.
- **Difficulty grows.** The first creature is tame with light quirks. Later ones can be very hard to control.
- Larger events mark turning points: sirens, a deity seeking control, the creature going mad.

## 8. Failure and scaling

- A season can fail: the creature can be destroyed, captured, lured away or lost to madness.
- Proposal: failure is gradual. Neglect and enemy pressure build up (a peril track), giving the team time to react. Outcomes are graded: home safe, home wounded, lost.
- Nothing carries over from a failed season. Its characters are lost.
- Challenges scale to the team. First version: scale by player count and days elapsed. Tune from real play data.
- Balancing simulations (Monte Carlo over player patterns) come later, after the first real season.

## 9. Lasting progression

Players keep variety between seasons, never raw power.

- **Personal objectives** within a season give lasting progression.
- **Roster.** Unlocked characters with their own traits and quirks, each good for one run.
- **Sanctuary.** Each creature brought home joins a shared collection.
- **Archive.** Lore, relics and discoveries are kept by the whole group.
- **Artifacts (idea, low priority).** Found through any activity; could unlock new tile types, encounters, options or cosmetic skins in later runs.

## 10. Platform and interface

- A web app connected to Discord. One session per Discord server, capped at about 15 players, around 8 expected.
- Built first for one friend group, in a way that later lets anyone invite it to their own server.
- Full experience on both mobile and desktop.
- Map-first, visual, minimal text. See the interface rules in `CLAUDE.md`.

## 11. Randomness

Undecided how much suits the game. Candidates:

- Chance-based bonuses from skills (a chance of extra ore, a chance to recruit a character).
- Success rolls on key actions (a chance to pick a tomb's lock).
- Luck that finds can influence.
- Risk and reward in crafting.

## 12. Open questions

- How large is the map window compared with the creature's footprint?
- What costs an action besides moving one hex, and how much should traits, gear and vehicles add?
- How long must a route be for characters to grow meaningfully?
- Do resource nodes crowd the map? If so, switch to resources by terrain type.
- How do scouts stay challenged?
- How much randomness suits the game?
- Do artifacts carry over between runs, and what do they unlock?
- Idle stances: the first slice is built (`docs/design/stances.md`); what more stances should exist is open.
- When do balancing simulations start?
