# Vehicles and rescue: a proposal

For Misa to react to. Numbers are starting guesses for the tuning config or content data.

> **Note (2026-11-26):** the cart came first, as Misa's ask, before the sled: a hand cart built like the raft, hauling goods or one rider (`docs/design/cart.md`). It follows the principles below (its own action to board, no stance drives it, the tick never moves it) and gives the sled its data shape: an unlock with `vehicle: { terrainTags, seats }`. The sled and the tow line's rescue role are unchanged and still to come.

## 1. The problem today

- **The rule.** End each day inside the window (radius 6). A hex that leaves it stays reachable one more day (`graceDays` 1), then is lost, with anyone on it and their pack.
- **Absent players pay most.** Left 6 hexes behind the creature, a character is lost after two missed ticks; 4 behind, about three. Gathering at the rear can cost a character over a weekend.
- **Bad luck pays too.** A trap or rockslide ends your day, a strike leaves 1 action, a swamp costs 2 a step. Any of these on a grace hex is fatal, and nobody can help.
- **Long walks back.** Materials count only once in the stores on the creature, so every trip is out and back on foot while the creature walks away.

Nothing lets the team save someone. Rescue should be a team moment, not a free safety net.

## 2. The vehicles

Engineer unlocks, each unique. There is one project at a time, so a vehicle competes with the hook, lantern and boards.

**Tow line** (on the creature, not placed)

- Any rider spends 1 action to haul a character within 2 hexes of the footprint onto the creature, over any terrain.
- Limits: one haul per rider per day; reach 2.
- Built from 2 timber, 1 stone, 3 work.
- Map: a coiled rope on the creature's back; choosing haul shows a rope ring; the moment is a rope arcing out and reeling in.

**Sled** (placed, open ground)

- 2 seats, driver included.
- A run costs 1 action: up to 2 hexes over connected, explored hexes tagged `open`. Elsewhere it is dragged: a normal step +1.
- Limits: never into unexplored hexes or through a threat's hex; left on a hex that is lost, it is lost with everyone aboard.
- Built from 3 timber, 1 iron, 5 work.
- Map: a runner sled with seat dots; stowed, it is strapped to the creature's flank. On the path arrow, a run is one long stride with the sled's via disc and one pip.

**Raft** (placed, water)

- 3 seats; the sled's rule with tag `water`, up to 3 hexes a run. Rivers are narrow ribbons, so geography limits it. Dragged over land, +1 a step.
- Built from 4 timber, 4 work.
- Map: a log raft with a pole.

**Later:** a glider launched from the creature's back, outward only, the tow line's counterpart.

**Driving.** Anyone drives (basics for all); a role tagged `build` drags at no extra cost (mastery). Boarding a vehicle on your hex and stepping off are free. A driver may load anyone on the hex, absent players included. Passengers move with the driver and spend nothing. Boarding the creature with a vehicle stows it (1 action, as now); passengers become riders and their packs go to the stores. A rider takes a stowed vehicle out for free.

## 3. Rescue

- **Tow line:** saves someone close with 0 or 1 actions (trapped, struck, absent), which walking cannot.
- **Vehicle run:** out, load, run back. Passengers need no actions.
- **Keeper linger (proposed change, Q1):** a lingering creature holds the fog: no hex is lost at a linger tick. Today grace runs during a linger (`m4-creature.md`), so it saves no one already in grace.
- **Scout guiding:** runs only cross explored ground, so surveys and Sweep open the road home. No new action.

**Stranded mark.** A pure core function, `stranded(view, characterId)`: on a grace hex and either waiting or unable to afford the cheapest path into the window. Everyone sees a small orange flare above the figure.

**Edge cases.**

- A lost character cannot be saved; the chance lasts until the losing tick.
- A rescuer ending the day in grace with a passenger: both flare tomorrow, and a second rescuer can come.
- The creature walking onto a vehicle stows it; its passengers ride, as today's pick-up.
- Carrying a waiting character is allowed (being carried is not acting).
- Everything is refused once the season is over.

**Cost.** The rescuer's actions out and back, the engineer's project slot and materials, and the risk to the vehicle. The rescued character loses nothing more (pillar 4). A haul, or a delivery from grace into the window, earns the rescuer 1 XP, like any helpful act.

## 4. Roles, skills, stances, threats

- **Engineer** builds and drags; a vehicle over the lantern is a real call. **Scout:** explored ground is the road. **Keeper:** linger holds the fog. **Scholar:** far sites are worth the trip. **Warden:** escort covers passengers, and a warden aboard escorts the rest.
- **Skill trees:** no new node now. If driving matters in play, an engineer "+1 stride" node is judged later against the existing ones.
- **Stances:** no stance drives or hauls, and the tick never moves a vehicle, so a passive action stays weaker than an active one. Passengers keep their stance; lying in wait on a parked sled works.
- **Threats:** no protection. Passengers are struck like walkers; a run stops before a threat's hex.

## 5. Data shape and first slice

```ts
// Unlock (content/items.ts), optional:
vehicle?: { terrainTags: string[]; stride: number; seats: number } // sled ['open'], 2, 2
haul?: { reach: number; perRiderPerDay: number }                   // tow line 2, 1
// tags: sled ['vehicle','runner'], raft ['vehicle','boat'], tow line ['rope','rescue']

// GameState, public:
vehicles: { id: string; at: Place }[] // at the creature = stowed
// Character:
aboard: string | null                 // `at` stays the vehicle's hex
```

- **Config:** `vehicleDragExtra` 1, `haulCost` 1, `rescueXp` 1.
- **Actions:** `haul { character }`, `board-vehicle { character? }` (self, or load someone), `step-off-vehicle`, `take-vehicle { vehicle }`. The path search gains run edges, `via: <vehicle id>`.
- **Refusals:** `out-of-reach`, `no-seat`, `needs-unlock`, `not-aboard`; `already-have` for a second haul.
- A lost vehicle is removed and its unlock cleared (Q3).

**First slice:** the tow line, the flare and linger holding the fog. No new place kind and no path change. The sled comes next; the raft is then data only.

**Tests.**

1. Haul at reach 2: the character is on the creature, their pack deposited, the rider down 1 action, +1 XP. Reach 3, no unlock, a second haul and a lost target are refused.
2. A trapped character on a grace hex is lost at the tick, but active after it when hauled first.
3. `stranded` on built views: grace, cost against actions, waiting.
4. A linger tick loses no hex; the next walking tick does.
5. Sled: a run of 2 on explored `open` costs 1; refused into unexplored; stops before a threat; drag +1 (0 for `build`); passengers spend nothing; seats hold.
6. A vehicle on a lost hex is lost with its passengers, unlock cleared; the creature stepping onto it stows it.
7. The tick never moves a vehicle, whatever the stances.
8. Same seed, same result; the view leaks nothing hidden.

## 6. Questions for Misa

1. **Should linger hold the fog?** It changes an M4 rule. Pick: yes.
2. **A "head home" stance for absent players** (unspent actions walk toward the creature)? The principle allows it, but it would make most rescues pointless. Pick: not now; count losses in play first.
3. **A lost vehicle:** rebuilt at full cost, or gone for the season? Pick: rebuilt at full cost.
4. **First slice:** the tow line alone, or with the sled? Pick: tow line, flare and linger first; the sled next.
5. **Load or haul anyone without asking?** Pick: yes; a present player steps off for free.
