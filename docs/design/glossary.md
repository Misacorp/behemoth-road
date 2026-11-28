# Player glossary

The words the game uses with players, and the rules for writing them. Every string a player reads (tips, buttons, card lines, hints, skill texts, the wiki) must follow it. Prose is reserved for story (`apps/web/src/text/story.ts`); everything else is plain game language. The audit of today's text against this page is `text-audit.md`. The decision is in `decisions/product.md`.

Code ids (`threat`, `settlement`, `unlock`, `work-site`, `ambush`, `defend-tick`) are not player text and do not change. The glossary is about what the player reads.

## Style rules

1. **Short, plain words.** One idea per sentence. Under about 12 words where you can.
2. **Only glossary terms.** One word per concept, everywhere: a tip, a button, a skill, a hint, the wiki. If a thing needs a new word, add it here first.
3. **No metaphors, idioms or figures of speech.** Nothing a literal reader could take another way: "turns a blow", "stand guard", "catch your eye", "goes wrong", "walks away with", "sway the creature". If the real effect is a number or a rule, say that.
4. **Say the effect in terms the player can see:** actions, hexes, peril, a foe's strength, materials, favour. Not "better", "more", "harder" alone: more of what? ("Takes 1 more peril off each attack", not "turns more of each blow".)
5. **Say when and who.** "When the day turns", "while you ride the creature", "on your hex". A skill text says what changes, by how much (as a placeholder from `tipValues.ts`, never a typed number), and when it applies.
6. **A skill or stance name never repeats another thing's name.** If an action is called Defend, no skill is "Standing guard" and no tip says "stand guard". Names may be short and flavourful only if the text under them says exactly what happens.
7. **Hint, don't explain** (CLAUDE.md) still holds: never say what an undiscovered thing does. A found thing's tip says what it does.
8. **British English.** Burnt, defence, favour, colour, practise (verb), grey.
9. **Verbs on buttons are one word, the same word as the tip's title and the glossary.** "Search" on the button is "Search" in the tip, not "Work" on one and "Search the tomb" on the other.
10. **No negative-then-positive riddles** ("not two days running"): say "Once a day" or "Not on the day after a Linger".
11. **Numbers come from the config** (`{placeholder}`), never typed into a text. A placeholder named here that `tipValues.ts` does not have yet (for example `{gatherYield}`, `{buildWork}`, `{xpPerPick}`, `{perilMax}`) must be added with the rewrite.
12. **Capitalise role names, action names and skill names when they name the thing** ("only a Scholar can Search a deep tomb"). Lower case for the same word used plainly ("search the shelves").
13. **Say "creature"** for the Behemoth in rules text. "Behemoth" is the game's title; the creature's own name (the Mossback) belongs to the story.

## Terms

Icon = the art-kit key a thing is drawn with today (see `apps/web/src/wiki/glossary.ts` for the live list). "Avoid" lists words that must not be used for this concept.

### The game

| Term                    | Meaning                                                                                             | Icon         | Avoid                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------- | ------------ | --------------------------------------------------------- |
| **Creature**            | The big animal the party escorts home (the Mossback is its name). Say "the creature" in rules text. | creature art | behemoth (the title only), beast, mount                   |
| **Party**               | All the players' characters together.                                                               | roster       | team, group, band                                         |
| **Home** (the Greyfold) | Where the creature is going.                                                                        | `greyfold`   | destination, goal                                         |
| **Day**                 | One round: everyone acts, then the day turns.                                                       | `day`        | turn, round                                               |
| **When the day turns**  | The moment the day ends: stances act, foes move, the creature walks. The only phrase for it.        | `day`        | dusk, nightfall, at the tick, end of day, as the day ends |
| **Step**                | One hex the creature walks. The route counts steps.                                                 | `date`       | move (move is for characters), day-count                  |
| **Season**              | One whole game, from setting out to the ending.                                                     | recap        | run, game                                                 |
| **Hex**                 | One map tile.                                                                                       | tile         | tile, cell, square, space                                 |

### Characters and roles

| Term              | Meaning                                                                                                                                                   | Icon                      | Avoid                  |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- | ---------------------- |
| **Character**     | A player's figure on the map.                                                                                                                             | standee                   | hero, avatar, unit     |
| **Role**          | What a character is: Scout, Scholar, Keeper, Engineer, Warden.                                                                                            | `role:<id>`               | class, job             |
| **Scout**         | Sees ahead: surveys cheaply, finds things first.                                                                                                          | `spyglass`                | explorer, seeker       |
| **Scholar**       | Searches tombs and other sites for finds.                                                                                                                 | `book`                    | seeker                 |
| **Keeper**        | Tends the creature: feeds it, makes it linger.                                                                                                            | `crook`                   | -                      |
| **Engineer**      | Builds gear from the stores.                                                                                                                              | `hammer`                  | crafter                |
| **Warden**        | Fights and protects: strikes harder, defends, parleys.                                                                                                    | `shield`                  | guardian, envoy, guard |
| **Skill**         | A permanent upgrade picked with XP.                                                                                                                       | `skill:<id>`              | perk, talent, upgrade  |
| **XP**            | Points earned by acting. Each {xpPerPick} XP is one skill pick. Always "XP", never "experience".                                                          | ring on the skills button | points, exp            |
| **Pick**          | Choosing a skill. Verb: "Pick".                                                                                                                           | `pick-skill`              | learn, unlock, buy     |
| **Branch / Tier** | A role's skills sit on two branches (a, b) of three tiers. Your first pick in a role closes its other branch. From another role you may pick tier 1 only. | skill tree                | path, tree level, step |
| **Trait / Quirk** | A character's knack / a help-and-hinder pair. Not in play yet: say nothing more.                                                                          | trait, quirk tiles        | -                      |

### States

| Term                        | Meaning                                                                                                               | Icon           | Avoid                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------- |
| **Riding**                  | Standing on the creature's back. Verb: "ride". To get on: "Ride" (step onto the creature's hex).                      | rider mark     | boarding the creature, mounted, aboard (cart only)                        |
| **On foot**                 | On the map, not riding.                                                                                               | standee        | walking (walking is what the creature does), roaming                      |
| **Pinned**                  | Trapped under a rockslide; cannot act until freed. Free yourself with Struggle or be freed with Dig out.              | `pinned`       | buried, trapped, stuck, crushed                                           |
| **Hurt**                    | A foe attacked your character: only {struckActions} action tomorrow. Shown as a bandage.                              | bandage        | struck, hit, wounded, injured (wounded is for the creature at the ending) |
| **Lost**                    | A character left behind in the fog and out of the game until they rejoin.                                             | `gate` trace   | stranded, gone, dead                                                      |
| **Cut off**                 | A character on foot outside the window today, who cannot get back to the creature before the day turns. Not lost yet. | `map:stranded` | stranded, marooned                                                        |
| **Aboard / Hitched**        | In the cart / pulling the cart. Cart words only.                                                                      | cart marks     | -                                                                         |
| **Waiting**                 | You ended your day early. Your stance gets the rest of your actions.                                                  | `hourglass`    | done, finished, ready                                                     |
| **Done**                    | Out of actions for today.                                                                                             | pips empty     | spent, exhausted                                                          |
| **Wary / Friendly / Angry** | A settlement's mood.                                                                                                  | settlement art | hostile, neutral, attitude                                                |
| **Hungry / Full**           | How much the creature wants food. Hungry raises peril.                                                                | `hud:appetite` | starving, peckish                                                         |

### Map and world

| Term               | Meaning                                                                                                                                                                            | Icon                    | Avoid                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------- | -------------------------------------------------------------- |
| **Fog**            | A hex nobody has explored: veiled.                                                                                                                                                 | veil                    | darkness, unknown, hidden (hidden is for things not yet found) |
| **Explored**       | A hex shown at least once. The stat "Explored" counts them.                                                                                                                        | lifted veil             | discovered, revealed, uncovered                                |
| **Survey**         | The action: look into a neighbouring hex without entering it. It explores that hex.                                                                                                | `spyglass`              | scout (verb), reveal, look around, peek                        |
| **Found / find**   | A thing a site or hex gives up. A "find" is a material or item from a site.                                                                                                        | find rising             | loot, treasure, reward, drop                                   |
| **Site**           | A place you search: tomb, deep tomb, sunken shrine, water temple.                                                                                                                  | feature art             | dungeon, ruin, chamber                                         |
| **Node**           | Never shown to players. Say what it is: "iron deposit", "timber stand". A place you gather from is a **deposit** or **stand** by name, and "a hex you can gather from" in general. | feature art             | resource node, source, vein                                    |
| **Trap**           | A hidden hazard (snare, pitfall, undertow). Springs on whoever walks in, unless found first.                                                                                       | trap art                | danger, mine                                                   |
| **Hazard**         | Ground that harms the creature if it steps there (scree field, sour water, glass waste).                                                                                           | hazard icons            | danger                                                         |
| **Terrain**        | The ground type of a hex. Each has a name (Plains, Forest, ...).                                                                                                                   | tile                    | biome, ground type                                             |
| **Window**         | The part of the map near the creature where players can act. Never shown to players: say "near the creature".                                                                      | -                       | -                                                              |
| **Settlement**     | A place where people live. In story prose "village" is fine; in rules text always "settlement".                                                                                    | settlement art          | village, town, camp                                            |
| **Folk**           | The people of a settlement ("Hill folk", "River folk").                                                                                                                            | people art              | tribe, natives                                                 |
| **Favour**         | A settlement's liking for the party. Enough favour makes it friendly.                                                                                                              | favour pips             | trust, reputation, goodwill                                    |
| **Boon**           | What a friendly settlement grants once: Gift, Mislead, Shelter.                                                                                                                    | boon icons              | reward, blessing, perk                                         |
| **Fire / Brazier** | A fire is lit with timber and burns until the day turns. A brazier is an old fire site: lit with timber, it burns {brazierNights} nights.                                          | `light-fire`, `brazier` | campfire, torch, beacon (Beacon is a skill name only)          |
| **Cart**           | The hand cart gear. Hitch it or sit in it.                                                                                                                                         | `cart`                  | wagon                                                          |
| **Capybara**       | The small animal you can Lead.                                                                                                                                                     | `lure`                  | lure (code word), pet                                          |

### Things you carry and build

| Term         | Meaning                                                                                                                                       | Icon          | Avoid                                              |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------- |
| **Material** | Anything gathered or found that goes in a pack or the stores: iron, stone, timber, food, ancient alloy, old coin, river pearl.                | material icon | resource, goods, supplies, units, stuff            |
| **Food**     | The material the creature eats. (Content name today: Forage; see Choices.)                                                                    | `forage`      | forage (as a noun), fodder                         |
| **Pack**     | What one character carries, up to {packSize}.                                                                                                 | `pack`        | bag, inventory, backpack                           |
| **Stores**   | The party's shared materials, kept on the creature. Depositing: ride the creature and the pack empties into the stores.                       | `stores`      | storage, stash, supplies                           |
| **Gear**     | Things the Engineer builds for the whole party: grappling hook, tow line, lantern, climbing spikes, marsh boards, raft, cart. (Code: unlock.) | item icons    | unlocks, upgrades, tech, items (items is too wide) |
| **Build**    | Engineer action: add work to the gear being built. Each action adds {buildWork} work.                                                         | `hammer`      | craft, make, construct                             |
| **Work**     | The amount of effort a build needs. Always a number of "work".                                                                                | -             | progress, effort                                   |

### Measures

| Term         | Meaning                                                                                                                                                              | Icon              | Avoid                                                  |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- | ------------------------------------------------------ |
| **Actions**  | What a character can do today. {actionsPerDay} a day; they refill when the day turns. Always the plural noun "actions", with a number: "2 actions".                  | pips              | AP, energy, moves, points, stamina                     |
| **Peril**    | The creature's danger meter, 0 to {perilMax}. Full: the season is lost. Raised by foe attacks and hunger, lowered by quiet days and shelter. Say "peril" every time. | `hud:peril` gauge | danger, harm (as a noun), health, damage, threat level |
| **Strength** | How strong a foe is. A Strike lowers it; at 0 the foe is beaten. A foe's attack adds its strength to peril.                                                          | foe number        | health, HP, power (power is internal)                  |
| **Favour**   | See Map and world.                                                                                                                                                   |                   |                                                        |
| **Nights**   | How many nights a lit brazier still burns.                                                                                                                           | embers            | days (days is for the calendar)                        |
| **Leads**    | How many times a capybara can still be led.                                                                                                                          | paws              | moves                                                  |

### Foes

| Term         | Meaning                                                                                                                                                                                             | Icon             | Avoid                                            |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- | ------------------------------------------------ |
| **Foe**      | Anything that attacks the creature or its party: captor band, pterodactyl swarm, ambush, stampede, raiders, and the rockslide. (Code: threat.)                                                      | foe icons        | threat, enemy, monster, attacker, danger         |
| **Attack**   | What a foe does when it reaches the creature: its strength is added to peril, less what Defend takes off. A foe attacks a character as well ("hurts"). Always the noun and verb "attack" for a foe. | `threat-strikes` | strike, blow, hit, assault, bite                 |
| **Foe path** | The hexes a foe will cross at the day's turn. Shown when you tap the foe.                                                                                                                           | arrow            | trail, route, track (track/trail are for traces) |

### Actions (button words)

One verb per button. The tip title is the same word. Cost is shown as pips, never in text.

| Button              | Meaning (the tip text)                                                                                                                                             | Icon key     | Avoid                                                        |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------ | ------------------------------------------------------------ |
| **Survey**          | Look into a neighbouring hex without entering it.                                                                                                                  | `spyglass`   | Look around, Scout, Reveal                                   |
| **Gather**          | Take one {gatherYield} material from the hex you stand on into your pack.                                                                                          | `gather`     | Collect, Forage, Harvest, Mine                               |
| **Search**          | Search a site for finds (code: work-site). Costs {workSiteCost} actions. May find nothing; try another day.                                                        | `work-site`  | Work, Study, Open, Explore                                   |
| **Build**           | Add work to the gear being built. Engineers, riding.                                                                                                               | `hammer`     | Craft                                                        |
| **Light**           | Burn {fireFuel} timber from your pack on this hex. It burns until the day turns.                                                                                   | `light-fire` | Ignite, Light a fire (the title and button are both "Light") |
| **Feed**            | Riding: give the creature food from the stores.                                                                                                                    | `feed`       | Give, Tend                                                   |
| **Linger**          | Keepers, riding: the creature stays where it is when the day turns. Once a day.                                                                                    | `linger`     | Wait (Wait is yours), Rest, Stay                             |
| **Throw**           | Throw the tow line to someone cut off.                                                                                                                             | `throw-line` | Cast, Toss                                                   |
| **Grab**            | Take a thrown tow line and be pulled onto the creature.                                                                                                            | `grab-line`  | Take line                                                    |
| **Hitch / Unhitch** | Take / let go of the cart's shafts.                                                                                                                                | cart marks   | Attach                                                       |
| **Sit / Climb out** | Get into / out of the cart. (Today: Board / Leave. "Board" must not also mean riding the creature.)                                                                | cart marks   | Board the creature                                           |
| **Load / Unload**   | Put materials into / take them out of the cart.                                                                                                                    | cart marks   | Pack                                                         |
| **Strike**          | Lower the strength of a foe next to you by {strike.other} ({strike.warden} for a Warden). At 0 the foe is beaten. Always a Strike on a foe, never on the creature. | `strike`     | Attack (attack is the foe's word), Hit, Fight, Weaken        |
| **Dig out**         | Free a pinned character on your hex or next to you.                                                                                                                | `dig-out`    | Dig, Free, Rescue                                            |
| **Struggle**        | Try to free yourself when pinned. Each try is likelier to work.                                                                                                    | `struggle`   | Escape, Wriggle                                              |
| **Lead**            | Move a capybara one hex.                                                                                                                                           | `lead`       | Guide, Herd                                                  |
| **Defend**          | Warden, riding: for today, every foe attack on the creature adds {defendReduction} less peril. Lasts until the day turns.                                          | `defend`     | Guard, Stand guard, Shield, Protect                          |
| **Parley**          | Win a wary settlement's favour. A Warden gains {parleyFavour.warden}; others gain {parleyFavour.other} and may anger it.                                           | `parley`     | Talk, Negotiate                                              |
| **Offer**           | Give an old coin or river pearl to a wary settlement: {offerFavour} favour, no risk.                                                                               | `offer`      | Gift, Trade                                                  |
| **Ask**             | Ask a friendly settlement for one boon.                                                                                                                            | `ask-boon`   | Request                                                      |
| **Pick**            | Take a skill.                                                                                                                                                      | `pick-skill` | Learn                                                        |
| **Stance**          | Choose what your spare actions do when the day turns.                                                                                                              | `set-stance` | Mode, Posture                                                |
| **Wait**            | End your day now. Your stance gets any actions you have left.                                                                                                      | `hourglass`  | End turn, Pass, Skip                                         |
| **Move**            | Not a button: tap yourself, tap a hex, confirm. Costs actions by terrain. Only characters "move"; the creature "walks".                                            | arrow        | Walk (for characters), Travel                                |

### Stances

Your stance is what your spare (unspent) actions do **when the day turns**. A stance never beats doing the same thing by hand.

| Stance          | Meaning                                                                                                                                   | Icon     | Avoid                                     |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | -------- | ----------------------------------------- |
| **Rest**        | Your spare actions do nothing. The default.                                                                                               | `moon`   | Idle, Sleep                               |
| **Lie in wait** | On foot, on a hex: when the day turns, you Strike any foe that stops on or crosses your hex, before it attacks. Needs a hex (not riding). | `grass`  | Ambush (a foe name), Guard, Watch, Defend |
| **Gather**      | On a hex with a gatherable deposit: your spare actions gather from it.                                                                    | `basket` | Forage                                    |

### Skill effects (words to use)

| Effect                        | Say                                                                                                       | Do not say                                                                 |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| Skill makes Defend stronger   | "Defend takes {n} off each attack"                                                                        | "turns a blow", "blocks more"                                              |
| Auto-defend skill             | "When the day turns, if you ride the creature and have an action left, you Defend (it uses that action)." | "A guard who never rests"                                                  |
| Skill makes something cheaper | "costs {n} action"                                                                                        | "takes less of your day"                                                   |
| Skill increases a chance      | "{n} % better chance"                                                                                     | "better odds" (odds is the Odds mark's word; use "chance" in running text) |
| Skill works for everyone      | "for everyone"                                                                                            | "for the party's benefit"                                                  |
| Skill reaches further         | "{n} hexes further"                                                                                       | "reaches further", "much further off"                                      |

## Choices to confirm with Misa

These are picks made so the glossary is complete. Each is one edit here and in the audit.

1. **Foe, not threat** in player text (Misa's word; code keeps `threat`). The rockslide is called a foe too, though it never moves. Alternative: keep "threat". Pick: foe.
2. **Attack for a foe's action; Strike for ours.** Misa's playtest says "attack"; the button is already "Strike", with a bandage for a hurt character. Alternative: rename the button to "Attack" and call a foe's action "hits". Pick: button stays Strike, foes attack, characters are hurt.
3. **Gear, not unlock** for built things. "Unlock" also reads as "unlock a door" and clashes with "Pick" for skills. Pick: gear.
4. **Food, not forage** for the material (item renamed in content and skill "Good forage" renamed). Alternative: keep Forage and say "forage" everywhere. Pick: food.
5. **"When the day turns" for the tick** (not "dusk"). The intro card and one hint say dusk. Pick: when the day turns.

## How "Standing guard" fits (for reference)

- **Defend** (action, Warden only, riding): spend 1 action; for the rest of the day every foe attack on the creature adds {defendReduction} less peril (never below 0). Several Wardens add up. It clears when the day turns.
- **Bulwark** (Warden skill, tier 1): Defend takes 3 off instead of 2.
- **Standing guard** (Warden skill, tier 3): at the day's turn, a riding Warden who still has an action left Defends by themselves, spending that action. It is Defend, done automatically, only for the riding Warden. Proposed name: **Auto-defend**.
- **Lie in wait** (stance, anyone): a different system. On foot on a hex, at the day's turn, strike any foe that stops on or crosses that hex. It protects a hex, not the creature, and a foe it weakens can still reach the creature.
- **Escort** (Warden, on foot, passive): foes cannot hurt characters on or next to the Warden. Not an action, not Defend. "Wide guard" widens it; proposed name **Wide escort**.
