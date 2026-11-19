# Product

Features, UX and behaviour the users see.

<!-- Maintained with `node scripts/decisions.mjs`; see README.md. Newest first. -->

## 2026-11-19: Joining is a drawer wizard; each character's cloak colour comes from its name

ID: `2026-11-19-joining-is-a-drawer-wizard-each` · Status: current

**Decision.** Joining and replacing a lost character share one drawer. On phones it is the bottom drawer, which can be dragged between half and full height and closed from half; it shows one step at a time (character, role, confirm) with a back arrow. On desktop it is a side drawer from the left showing every step at once. Characters are shown as figures with trait and quirk icons, and their names are the only text. Roles are six ink emblems: a spyglass, a book, a lantern, a shield, a cog and a pennant. The drawer opens by itself when you have no active character, and a round join button reopens it after you close it. Each character's cloak colour is a stable hash of its name over the four accents, so a rolled character keeps its colour from the drawer onto the map. Another player's character opens a small card with its figure, name, role emblem, trait and quirk, from its figure on a hex or from the hub bubble. "Next day" shows only when the server offers dev tools and you are an admin; "New game" is gone.

**Reasoning.** This follows the M2 plan and Misa's "show, don't tell". Players need to tell characters apart on a shared map, and a name-based colour needs no new field in the contract.

## 2026-11-19: Character choices are rolled from the game, the player and the attempt; players pick by index

ID: `2026-11-19-character-choices-are-rolled-from-the` · Status: current

**Decision.** `characterOffers(state, userId)` returns two or three characters, each with a generated name, a trait and a quirk (none repeated), followed by a plain one with a name only. The roll is seeded by the game seed, the user id and the number of characters that user has had, so a reload shows the same list and a replacement gets a fresh one. `addCharacter` and `replaceCharacter` take the index of the chosen entry and roll again on the server, so a client cannot invent a trait. Character ids are `<userId>.<attempt>`. The cap counts active characters only, so a lost character frees a place.

**Reasoning.** Picking by index keeps the server authoritative over what was rolled. Because rolls need the seed, the server must send the choices to the joining player: the contract needs a field or a call for them.

## 2026-11-19: Popovers point at their subject; grace-day tiles and figures warn without words

ID: `2026-11-19-popovers-point-at-their-subject-grace` · Status: current

**Decision.** Every popover, bubble and card has a small paper chevron with ink sides on the edge facing its subject: the hex, the destination, or the creature. The chevron slides along that edge to keep pointing when the card is clamped to the screen, and stays clear of the card's corners. Tiles in their grace day (out of the window, lost at the next tick) get a paler wash and a dashed ink edge on top of the art's fading look. A character standing on one carries a small hourglass mark above its figure. Both keep a minimum on-screen size when zoomed out. The grace rule itself is unchanged and checked end to end through the map's flow and overlays: a hex that leaves the window at the tick into day D stays reachable through day D and is lost at the next tick. Escape and right-click close everything back to idle, cancelling a plan or selection. Right-click reads `closeOnRightClick` from `apps/web/src/settings.ts` (default on), and the browser menu never opens over the map, whatever the setting.

**Reasoning.** Misa expected one more move before being left behind; the rule already gave it, but the tile did not look different enough to say so. The chevron ties a card to its subject when cards move above or below to stay on screen.

## 2026-11-19: Three actions a day, and moving costs actions **[Misa]**

ID: `2026-11-19-three-actions-a-day-and-moving` · Status: current

**Decision.** A character keeps three actions a day, and moving one hex costs one of them. The alternative, three free moves plus one action on top, is not used.

**Reasoning.** Misa tried the prototype: three actions is hard to judge before there is more to do, but one budget for everything is much simpler than separate move and action budgets, so the game works within it.

## 2026-11-19: Escape and right-click close popovers on desktop; right-click is a setting **[Misa]**

ID: `2026-11-19-escape-and-right-click-close-popovers` · Status: current · Amends: `2026-11-19-touch-first-drag-to-pan-pinch`

**Decision.** On desktop, Escape closes the open popover or bubble, and right-clicking anywhere on the map closes it too (and never opens the browser's menu over the map). Right-click closing sits behind a player setting that is on by default; for now the setting lives in the map's settings module, and an options screen can expose it later. Nothing else needs a keyboard.

**Reasoning.** Misa asked for both as desktop conveniences, with right-click closing switchable because some players may dislike it.

## 2026-11-19: The map's hub bubble: a generic list of characters plus a place entry

ID: `2026-11-19-the-map-s-hub-bubble-a` · Status: current · Amends: `2026-11-19-on-the-map-the-creature-is`

**Decision.** This implements Misa's "The creature is the party's hub" on the map. A tap on the creature never lands on a rider's figure; riders are not tap targets. If you ride, it selects you (the step-off hexes light up) and opens a bubble above the creature. If you don't ride, it opens the same bubble without selecting anyone; if you are selected beside the creature, it plans boarding instead. The bubble (`Bubble` in `apps/web/src/map/Popover.tsx`) takes a list of characters (your own drawn with a selection ring, the others inert for now) and an optional place entry: a round creature mini that opens the creature card. A tap on your own hex selects your character. Rider seats come from the art kit's `riderSeats`, the same function the scene seats riders with, and a test checks every figure position the map computes against the positions the scene reports drawing.

**Reasoning.** Keeping the bubble generic lets Milestone 2 reuse it for any hex with several characters. One seat function, plus a test against the scene's own output, keeps picking and drawing from drifting apart.

## 2026-11-19: On the map the creature is one place: one outline, a seat at the arrow's end, its own popover

ID: `2026-11-19-on-the-map-the-creature-is` · Status: current, amended by `2026-11-19-the-map-s-hub-bubble-a`

**Decision.** When your character is selected and can board, the creature lights up as one target: a soft wash over its whole footprint and one dashed outline around its outside edge, not seven hex washes. Tapping any footprint hex plans to board. The arrow ends at the rider slot the character would take, and the confirm card shows the pip cost. A rider is selected by tapping its figure on the creature's back; the stepping-off hexes light up and the arrow starts from its seat. A selected rider's ring is drawn over the creature, as an outline only. Tapping the creature when not planning opens a small card with a drawing of the creature turned to its heading, plus a compass arrow for the heading. Tapping your own figure with no actions left looks at your place (the hex or the creature) instead of selecting it. The confirm card sits below the destination when the arrow arrives from above, so it never covers the arrow. "Recentre on me" centres on a rider's seat.

**Reasoning.** This follows the riding decision (the footprint is one place) and the lead's brief. Picking a figure before the hex under it is what lets a rider select itself while a tap anywhere else on the footprint means the creature.

## 2026-11-19: The creature is the party's hub; a tap picks your own character first **[Misa]**

ID: `2026-11-19-the-creature-is-the-party-s` · Status: current · Amends: `2026-11-19-moving-tap-your-character-tap-a`

**Decision.** The creature is the party's hub: tapping it is where the shared expedition information will live (later milestones open it into a drawer). A tap on a place picks the player's own character first, because players can only move their own:

- **You ride the creature:** tapping anywhere on it selects your character, so the hexes you can step off to light up at once, and opens a small bubble by the creature. The bubble holds your character (shown selected), the other riders, and the creature itself as the way into the hub.
- **You don't ride it:** tapping the creature opens the same bubble without selecting anyone, and the hub is the main thing in it.
- **Any hex with several characters**, from Milestone 2: the same bubble lists who is there. Your own character is preselected for moving, and choosing another character opens their details (loadout, stats) when those exist.

Riders' figures on the creature's back are not tap targets of their own; the whole creature is.

**Reasoning.** Misa's intuition: the game should assume a player means their own character, since they cannot move anyone else's, and a lightweight bubble can name the others when there is a real choice. This also fixes a figure on the creature's back being a tiny tap target that hid a footprint hex.

## 2026-11-19: A character's place is a hex or the creature; paths treat the creature as one node

ID: `2026-11-19-a-character-s-place-is-a-2` · Status: current

## 2026-11-19: Riders stand in numbered slots on the creature's back

ID: `2026-11-19-riders-stand-in-numbered-slots-on` · Status: current · Amends: `2026-11-19-the-art-kit-draws-a-compact`

**Decision.** Characters on footprint hexes ride the creature. The art kit places riders by rider index, not by hex: slot 0 is the middle of the back, then a ring of six, then a wider ring of eight (fifteen, the player cap), shifted a little towards the viewer where the high view shows the back best (`riderSlot`, `riderAnchor`). Riders draw just after the creature, back to front among themselves, each with a firm contact shadow. The trees, rock and pond on the back sit out at the rim, clear of the inner slots. The footprint keeps its trodden-ground look. `riderAnchor(look, heading, index, origin, size, squash)` is exported so the map's picking finds riders where they are drawn.

**Reasoning.** Misa: characters start on the creature, can board and step off, and end up on it when it walks onto them. Slots by index keep several riders apart whichever footprint hex the core records them on.

## 2026-11-19: The art kit draws a compact creature on trodden ground, measured against its footprint

ID: `2026-11-19-the-art-kit-draws-a-compact` · Status: current, amended by `2026-11-19-riders-stand-in-numbered-slots-on` · Amends: `2026-11-19-the-creature-stays-mostly-inside-its`

**Decision.** The default build is `highback`: the high, mossy back with its trees, rock and pond, a moderately long neck and a longer tail, sized so that at `scale` 1 the body stays over its footprint. A test draws it for all six headings at tilt 0.8 and requires that no hex beyond the footprint has a third or more of its top face covered, that no such hex's centre is covered, and that the centre hex is covered. The seven footprint hexes are drawn as trodden ground (palette ramp `trodden`, scuffed earth) in place of their terrain. Characters are no longer drawn as riders: no contact shadow and no special order. The `broad`, `longneck` and `low` builds stay as data.

**Reasoning.** Misa's pick: a compact creature keeps the map readable, and the trodden ground keeps it feeling huge. Measuring coverage on the drawn outlines keeps "never a whole hex" true as the drawing changes; the old large build covered up to 70% of a neighbouring hex.

## 2026-11-19: Characters start riding the creature **[Misa]**

ID: `2026-11-19-characters-start-riding-the-creature` · Status: current · Supersedes: `2026-11-19-characters-start-on-a-free-hex`

**Decision.** New characters start on the creature, riding it (see "Characters ride the creature…").

**Reasoning.** Misa: starting on the creature means no one spends a move to reach it.

## 2026-11-19: Characters ride the creature; its footprint is one place, not seven hexes **[Misa]**

ID: `2026-11-19-characters-ride-the-creature-its-footprint` · Status: current · Supersedes: `2026-11-19-the-creature-s-hexes-are-occupied`

**Decision.** The creature's 7 footprint hexes are not hexes a character stands on; together they are one place, "on the creature".

- Characters start on the creature, riding it, and riders move with it each day, so they are never left behind.
- Riders take no hex slot; they are drawn on its back, side by side.
- Boarding from a hex next to the footprint costs one step, and so does stepping off onto any passable hex next to the footprint. A path may cross the creature by boarding and stepping off.
- When the creature steps onto a hex where a character stands, that character ends up riding it, at no cost.
- Tapping any footprint hex means the creature.
- Players can do their duties from the creature's back (later milestones).

This supersedes the rule that characters cannot enter the creature's hexes and the push-aside rule in it. It also replaces "Characters start on a free hex next to the creature".

**Reasoning.** Misa: riding the creature is a thing in this game. It keeps characters off the hex grid while they travel with it, and starting on it means no one spends a move to get there.

## 2026-11-19: The creature stays mostly inside its footprint so the map stays readable **[Misa]**

ID: `2026-11-19-the-creature-stays-mostly-inside-its` · Status: current, amended by `2026-11-19-the-art-kit-draws-a-compact` · Amends: `2026-11-19-the-creature-is-a-behemoth-it`

**Decision.** The creature is drawn smaller, between the broad high back and the long-neck, long-tail shapes. Its body stays mostly within its 7-hex footprint; the head, neck and tail may reach a little into neighbouring hexes, but never cover a whole hex outside the footprint. The footprint hexes are drawn in their own colour (ground the creature is standing on), so its size reads from the ground as well as the body. The map is not rotatable.

**Reasoning.** Misa: a big creature hid the tiles behind it and its neck crossed other hexes, which hurts readability without a way to rotate the map. Marking the occupied hexes keeps it feeling huge while the drawing stays compact. Rotation (and true 3D) is not planned.

## 2026-11-19: The creature is a behemoth: it fills its footprint and carries a small landscape

ID: `2026-11-19-the-creature-is-a-behemoth-it` · Status: current, amended by `2026-11-19-the-creature-stays-mostly-inside-its` · Amends: `2026-11-19-the-creature-is-modelled-as-small`

**Decision.** At `scale` 1 (a creature data value) the creature's body fills its seven-hex footprint, and its head and tail reach past it, so a character beside it looks tiny. It reads as an ancient walking hill: a broad hide body under a lumpy moss blanket, with two or three small trees, a rock, a tiny pond and grass on its back, a long strong neck, a large calm head with closed eyes and small swept horns, small ears, thick legs with mossy feet, and a tail tucked under the body. Its build is data: `broad` (high tortoise-like back, the default), `longneck` (narrower body, neck rising high, long tail) or `low` (wide, low, mossier), offered to Misa as the pick "Which creature shape?". A character standing on a footprint hex is drawn over the creature with a firm contact shadow, so it reads as standing on its back.

**Reasoning.** The lead's review: at the old size it covered about one hex and read as a pet, not a behemoth. The landscape on its back is its signature and shows its size against the trees on the map.

## 2026-11-19: The creature is modelled as small solids and turns to all six headings; upright props shrink part way at the high view

ID: `2026-11-19-the-creature-is-modelled-as-small` · Status: current, amended by `2026-11-19-the-creature-is-a-behemoth-it` · Amends: `2026-11-19-the-creature-faces-where-it-walks`

**Decision.** The art kit draws the creature as a few soft solids (body, head, snout, legs, ears, tail) in its own frame, turned to its heading and projected like the ground, so one drawing covers all six hex directions and shows its back, spots and the garden on it from above. `CreatureArt` takes a `heading` (an axial step) instead of a facing; the side view, the view from behind and `facingFor` are gone. Upright props and characters keep their side view but shrink in height halfway between upright and the true foreshortening (`riseFor`, 0.875 at tilt 0.8), and tile side faces are thinner (`sideDepth` 0.26). The kit's defaults are now Spring and tilt 0.8, and the map uses them. Whether the creature's back is round or long is offered to Misa as a pick.

**Reasoning.** This follows Misa's picks: a high view at 0.8 with the creature seen from above. Projecting solids gives correct turns and overlaps for every heading without hand-drawing six views. Fully foreshortened props looked like flat cut-outs from above, while unshrunk ones looked too tall, so they meet halfway.

## 2026-11-19: The creature is drawn from above, at the map's view angle **[Misa]**

ID: `2026-11-19-the-creature-is-drawn-from-above` · Status: current · Amends: `2026-11-19-the-creature-faces-where-it-walks`

**Decision.** The creature is drawn from the same high viewpoint as the map, looking down on it at about the tilt the map uses, so its back and shape read from above and its head points where it walks. It replaces both the side view and the rear view. Props and characters stay upright but should be checked against the higher view and given a little top-down foreshortening where they look like cut-outs.

**Reasoning.** Misa: the side view is very side-on; bringing the view angle upward makes the creature easier to draw and read, and it matches the higher map view.

## 2026-11-19: Spring palette and a high view: tilt 0.8 **[Misa]**

ID: `2026-11-19-spring-palette-and-a-high-view` · Status: current · Amends: `2026-11-19-first-map-art-a-squashed-hex`

**Decision.** The game uses the Spring palette and a view tilt of 0.8 (vertical squash of the hex plane; 1 is top-down). Both are the defaults in the art kit and the map.

**Reasoning.** Misa picked Spring because desert, plains and forest are the most clearly told apart. Top-down was too flat and 0.6 was the best of the samples, but they want the view higher up, at around 0.8.

## 2026-11-19: Map popovers are drawn in SVG; the view follows the creature each day

ID: `2026-11-19-map-popovers-are-drawn-in-svg` · Status: current

**Decision.** Map popovers (what is known about a hex; the cost pips and confirm button of a planned move) are drawn inside the map's SVG in screen space, placed by maths above the tapped hex (below it when there is no room) and clamped inside the screen. A hex popover shows the terrain as a one-tile miniature from the art kit and the fog state as an eye mark (open, half-lidded, mist, dotted). After a confirmed move the character stays selected while it has actions left. A tap on a character's upright figure selects it, even where the figure overlaps the hex behind. When a day passes, the view eases along with the creature so the map scrolls under it; a new game jumps to the character. The first zoom fits about 3.5 hexes around the character on a phone and the whole window on a wide screen (at most zoom 1).

**Reasoning.** The CSP forbids inline styles, so an HTML popover could not be positioned without CSSOM tricks; an SVG group takes a `transform` attribute instead and shares the map's ink look. Keeping the selection makes walking several single steps quick. Following the creature is what makes the map visibly move day by day.

## 2026-11-19: Moving: tap your character, tap a tile, see the arrow, confirm **[Misa]**

ID: `2026-11-19-moving-tap-your-character-tap-a` · Status: current, amended by `2026-11-19-the-creature-is-the-party-s` · Amends: `2026-11-19-touch-first-drag-to-pan-pinch`

**Decision.** Moving a character takes three taps:

1. Tap your character. The tiles it can reach with the actions it has left light up.
2. Tap one of those tiles. An arrow, drawn as a dashed ink line, runs along the path to it, with the cost shown as action pips. Where the path relies on something special, such as a rope over a cliff, a tunnel or a boat across a river, the arrow shows it with a small mark on that stretch, so the means of travel is visible in the arrow itself.
3. Confirm the move in a small popover by the destination.

Tapping elsewhere, or another reachable tile, changes or cancels the plan before anything is spent. This replaces the "Acting" bullet of the touch-first decision for movement; other actions still use tap-to-select and confirm in the popover.

**Reasoning.** Misa's design: selecting the character first makes its range visible at a glance, and the arrow makes both the cost and the tools of travel readable without text, which suits later gear and vehicles (grappling hook, boats).

## 2026-11-19: No focus outlines or other visible accessibility aids in the game **[Misa]**

ID: `2026-11-19-no-focus-outlines-or-other-visible` · Status: current · Amends: `2026-11-19-accessibility-is-not-traded-away`

**Decision.** Visible accessibility aids are not built into the game: no focus outlines or focus rings anywhere (`outline: none` on focus, including `:focus-visible`), and no other highlight that exists only for accessibility. Focus management stays: focus moves into a dialog, popover or drawer when it opens and back to where it was when it closes, without drawing a ring. Invisible extras that cost nothing (button elements, labels) are fine. The colour-plus-shape rule and `prefers-reduced-motion` are no longer requirements, though they may still be used where they help the look.

**Reasoning.** Misa: this is a game, accessibility is not a priority, and focus outlines keep appearing where they spoil the look. Focus management still matters so dialogs behave.

## 2026-11-19: Touch first: drag to pan, pinch or wheel to zoom, tap or click to act **[Misa]**

ID: `2026-11-19-touch-first-drag-to-pan-pinch` · Status: current, amended by `2026-11-19-escape-and-right-click-close-popovers`, `2026-11-19-moving-tap-your-character-tap-a`

**Decision.** The whole game is played with taps and drags; nothing needs a keyboard.

- **Phone:** one finger drags the map; pinch zooms around the fingers; a tap selects. A drag that moves more than a few pixels never counts as a tap.
- **Desktop:** drag with the mouse to pan; the wheel or trackpad zooms around the pointer; a click is a tap. Hover may add a light highlight but is never needed to see or do anything.
- **Acting:** tapping a hex selects it and opens a small popover with what is known about it and what can be done there. Spending actions always takes a second tap on the action in the popover, so panning or a stray tap never spends anything. Tapping a hex a few steps away shows the path and its cost in action pips; one confirm walks it.
- **Getting back:** one small floating button recentres on your character, and another on the creature.
- Bigger views open in drawers (bottom drawer on phones, side drawers on desktop), as in CLAUDE.md.
- Buttons stay ordinary focusable buttons, so a keyboard or screen reader still works where the browser gives that for free, but no keyboard shortcuts or keyboard-only controls are built.

**Reasoning.** Misa's standard: tapping, pinching and dragging on a phone, and dragging and clicking on desktop, with as little keyboard as possible. Two-step actions guard scarce actions (three a day) against mistakes while panning. Path previews were the lead's call, so a player can plan a trip out and back in one go.

## 2026-11-19: The map starts isometric, with flat ground first and heights later **[Misa]**

ID: `2026-11-19-the-map-starts-isometric-with-flat` · Status: current · Amends: `2026-11-19-isometric-3d-hexes-are-the-long`

**Decision.** The map is drawn in an isometric-style view from Milestone 1: the hex plane is tilted (squashed vertically), tiles show a thin side face, and props, characters and the creature stand upright and are drawn back to front. All tiles sit at one height at first; terrain heights (cliffs, plateaus) come later through terrain data. It stays SVG, and tapping uses the tile shapes themselves, so no hand-written hit testing is needed. One projection function in the renderer turns hex coordinates into screen positions; a flat top-down projection remains available for debugging.

**Reasoning.** Misa asked to go straight for isometric if it does not slow prototyping. With flat ground, a tilted SVG hex map costs little more than a top-down one: the core is unchanged, and upright props were already the plan. Heights are what make isometric hard (tiles hiding tiles, harder tapping), so they wait.

## 2026-11-19: Movement reads one entry rule that can name what makes a step possible

ID: `2026-11-19-movement-reads-one-entry-rule-that` · Status: current · Amends: `2026-11-19-paths-are-planned-by-cheapest-cost`

**Decision.** One rule, `entryInto(state, hex)`, decides whether a character may enter a hex. It returns the cost and an optional `via` tag naming what makes the step possible, or null. `move`, `planPath` and the new `reachableHexes(state, id)` all read it. `reachableHexes` lists every hex the character can reach with its actions left, with its cheapest cost, using the same search as `planPath`. `planPath` now returns steps (`{ hex, cost, via? }`), and `moveAlong` accepts steps or bare hexes. Nothing sets `via` in Milestone 1.

**Reasoning.** Misa's movement design lights up the reachable hexes when the character is tapped, then draws an arrow that can mark the stretch that needs gear (a rope, a tunnel, a boat). With one entry rule, gear can plug in later without changing the API.

## 2026-11-19: Paths are planned by cheapest cost and walked all or nothing

ID: `2026-11-19-paths-are-planned-by-cheapest-cost` · Status: current, amended by `2026-11-19-movement-reads-one-entry-rule-that`

**Decision.** `planPath(state, id, to)` runs a uniform-cost search over reachable, passable hexes, breaking ties in a fixed order. It returns the steps and their total cost, or a refusal: `not-enough-actions` when the cheapest path costs more than the actions left, `no-path` when nothing connects. `moveAlong(state, id, path)` applies each step through `move` and returns either the final state or the refusal and the index of the refused step, changing nothing. Both refuse non-integer or non-finite coordinates (`invalid-hex`).

**Reasoning.** The interface previews a multi-hex path and its cost on a tap, then walks it on one confirm. Reusing `move` for each step keeps a single set of rules for the server to check.

## 2026-11-19: The window is always in play; lost characters stay lost

ID: `2026-11-19-the-window-is-always-in-play` · Status: current

**Decision.** Every hex within the window radius of the creature's centre is `seen` and reachable, even one that was lost before and came back into range when the creature veered. A hex that leaves the window records the day it left and becomes `lost` once `graceDays` have passed (1: reachable for one more day). A character standing on a lost hex at the tick is lost for good, with no way back in Milestone 1. Hexes never in view are `hidden`.

**Reasoning.** The design says trailing tiles are lost to the fog and left-behind characters are lost for good; it does not say what happens to a tile the window touches again. Keeping the whole window in play avoids holes in the area around the creature. A later rule (for example a fog that lingers) can still mark such hexes differently.

## 2026-11-19: Cliffs are impassable to characters in Milestone 1

ID: `2026-11-19-cliffs-are-impassable-to-characters-in` · Status: current, amended by `2026-11-19-the-creature-s-hexes-are-always`

**Decision.** Terrain has a `passable` property; cliffs set it to false and no character can enter them. All terrain costs the base move cost (an `extraMoveCost` of 0 everywhere).

**Reasoning.** Milestone 3's grappling hook is meant to let everyone cross cliff edges, which needs cliffs to block first. Per-terrain costs exist as data so traits and gear can change them later.

## 2026-11-19: The creature veers by a seeded daily roll and ignores terrain for now

ID: `2026-11-19-the-creature-veers-by-a-seeded` · Status: current

**Decision.** The creature keeps one general heading for the whole game (north by default). Each tick it steps one hex: anticlockwise of the heading, straight, or clockwise, picked by weight (1 : 2 : 1, in the tuning config) with a roll that is a pure hash of the seed and the day. It never turns back and walks over any terrain, cliffs included. `predictCreature` returns the three possible next centres with their chances.

**Reasoning.** Matches the documented starting rule and keeps the step a function of (seed, day), so no random state is stored. Steering by stimuli (Milestone 4) can change the weights without changing the shape.

## 2026-11-19: The creature faces where it walks; cliffs are escarpments

ID: `2026-11-19-the-creature-faces-where-it-walks` · Status: current, amended by `2026-11-19-the-creature-is-drawn-from-above`, `2026-11-19-the-creature-is-modelled-as-small`

**Decision.** The creature's side view mirrors to face the east or west part of its heading (`facingFor`). For a heading straight north there are two options, the side view facing right or a three-quarter view from behind walking up the screen, and Misa picks one in the review batch (pick `creature-facing`). Cliffs are drawn as an escarpment, a rock face with a plateau strip running across the tile, not a single standing rock.

**Reasoning.** The lead asked for the creature to face where it walks and for cliffs that read as terrain. Both straight-north options stay available until Misa chooses.

## 2026-11-19: First map art: a squashed hex plane with open-edge sides, upright props and four fog states

ID: `2026-11-19-first-map-art-a-squashed-hex` · Status: current, amended by `2026-11-19-spring-palette-and-a-high-view`

**Decision.** The first map art draws flat-top hexes on a plane squashed vertically (tilt 0.6 in `ART_TUNING`, Misa to pick against 0.5 and top-down). Each tile has a watercolour top and shows its thin side face only where no tile stands in front of it. Props, characters and the creature stand upright in side view and are drawn back to front. Unseen tiles are blank paper with a faint dotted outline; fading tiles are veiled with paper and their props half transparent; lost tiles are a fog wash with mist curls; the hint mark is a small glint that never says what is there. Three palettes (Morning, Mist, Spring) go to Misa as a pick; the first creature is a gentle, round, spotted beast with leaf ears, horn nubs and a small garden on its back.

**Reasoning.** This follows Misa's ink-and-wash atlas look and the isometric goal while keeping all tiles at one height. Drawing sides only on open edges keeps the plane reading as one raised landmass instead of a stack of tiles. The tilt and palette stay in one config so Misa's picks are one edit each.

## 2026-11-19: Isometric 3D hexes are the long-term goal; the map is built to allow it **[Misa]**

ID: `2026-11-19-isometric-3d-hexes-are-the-long` · Status: current, amended by `2026-11-19-the-map-starts-isometric-with-flat`

**Decision.** The long-term goal is an isometric 3D hex map with tile heights; the first milestones use a flat top-down view. To keep the way open, the game core knows only hex coordinates and never screen positions, the map renderer converts coordinates to the screen through one projection function, tiles draw their top face separately from any sides, and props (trees, hills, ruins, the creature) are drawn upright in side view, as on old maps, so they can stand on a tilted map later.

**Reasoning.** Misa would like the hex grid to become isometric 3D eventually, but not to start there. Keeping projection in one place and drawing props upright costs little now and avoids redrawing every asset later.

## 2026-11-19: The look is a light ink-and-wash atlas in pastel, broken colours **[Misa]**

ID: `2026-11-19-the-look-is-a-light-ink` · Status: current

**Decision.** The game looks like an explorer's atlas drawn in ink and watercolour wash, in a light, approachable palette of pastel, broken (slightly greyed) colours on paper, closer to a storybook than to retro or high-contrast games. Unexplored land is blank paper. Pixel art and dark, contrasty looks are out.

**Reasoning.** Misa chose the ink-atlas and storybook directions over flat vector and pixel art, because retro and pixel styles tend towards darker, more contrasty moods than this game wants.

## 2026-11-19: Phone first, desktop too

ID: `2026-11-19-phone-first-desktop-too` · Status: current

**Decision.** Every screen is designed and checked at a phone width (390 px, and 360 px for tight spots) and at a desktop width (1100 px). Nothing overflows its parent or scrolls sideways by accident, and long names are cut with "…". On a wide window the layout uses the space instead of a narrow fixed column.

**Reasoning.** Most use is on phones, but layouts tuned only at phone width looked wrong on desktop, and the owner asked for desktop more than once.

## 2026-11-19: Accessibility is not traded away

ID: `2026-11-19-accessibility-is-not-traded-away` · Status: current, amended by `2026-11-19-no-focus-outlines-or-other-visible`

**Decision.** Colour is never the only cue: a state or category also has an icon, a shape or a word. `prefers-reduced-motion` is respected everywhere, and every control has a spoken name. Only errors use `role="alert"`; other notices use `role="status"` so they never interrupt a screen reader.

**Reasoning.** These cost little when built in from the start and are hard to add later. A notice that interrupts a screen reader for good news is worse than none.

## 2026-11-19: Focus returns to the opener only for keyboard users

ID: `2026-11-19-focus-returns-to-the-opener-only` · Status: current

**Decision.** Closing a drawer, popover or sheet returns focus to the control that opened it only when that control had keyboard focus (`:focus-visible`). After a tap or click, closing leaves no focus ring behind.

**Reasoning.** A leftover ring after a tap looks like a bug to touch and mouse users, but keyboard users still need focus to come back where they were. Following how the thing was opened serves both.

## 2026-11-19: One overlay at a time

ID: `2026-11-19-one-overlay-at-a-time` · Status: current

**Decision.** Only one drawer or sheet is open at a time: a choice made inside a drawer opens inside it as a step with "‹ Back", never as a second sheet on top. While a modal is open, the page behind it does not scroll and shows no second scrollbar. Small popovers on their own layer are the only thing that may open over a drawer.

**Reasoning.** The owner found a sheet opening over a drawer stressful, and two scrollbars side by side looked broken. A drill-in step keeps the user in one place.

## 2026-11-19: Don't choose for the user; destructive actions go last

ID: `2026-11-19-don-t-choose-for-the-user` · Status: current

**Decision.** A picker opens with nothing selected; the app never preselects an item for the user. In a row of actions, a destructive one comes last.

**Reasoning.** The owner did not want the app to choose for them. A destructive action placed last is the hardest to hit by accident.

## 2026-11-19: Every clickable thing looks clickable, without hover

ID: `2026-11-19-every-clickable-thing-looks-clickable-without` · Status: current

**Decision.** Every clickable thing has a visible cue that shows without hover, and decoration has none and is not a target. Hover may add to the cue but never carries it alone. A click that ends a drag is swallowed in one shared place, so a drag never opens a popover.

**Reasoning.** Phones have no hover, so a hover-only cue shows nothing before the tap. When some targets had labels and others did not, the owner could not tell what was clickable.

## 2026-11-19: Hidden overflow gets a hint

ID: `2026-11-19-hidden-overflow-gets-a-hint` · Status: current

**Decision.** A box that scrolls without a visible scrollbar shows a hint that there is more: an edge fade, and where it suits, one shared pan hint that is the same on every sideways-scrolling area and goes away once the user scrolls. Phones keep the system's own overlay scrollbar; a styled scrollbar is for mouse users only.

**Reasoning.** Users did not notice that panels without a scrollbar scrolled. One shared hint keeps the cue the same everywhere, and a permanent bar on touch looks cramped.

## 2026-11-19: Nothing fills in after the page has drawn

ID: `2026-11-19-nothing-fills-in-after-the-page` · Status: current

**Decision.** A card or row never adds text after the page has drawn. If it needs data that arrives later, it reserves its space or is left out.

**Reasoning.** Late text made the layout jump under the user's finger, which the owner saw on their phone.

## 2026-11-19: Touch targets fit their context

ID: `2026-11-19-touch-targets-fit-their-context` · Status: current

**Decision.** A control on its own gets a touch target of at least 44 px. A control nested inside a tappable tile gets a target only a little larger than the drawn control, so the tile itself stays easy to tap. Pressed and focused states of a new control are screenshotted too.

**Reasoning.** A 44 px checkbox inside a tile took over most of the tile. Pressed and focus states were where visual glitches hid.

## 2026-11-19: Show, don't tell; fewer boxes

ID: `2026-11-19-show-don-t-tell-fewer-boxes` · Status: current

**Decision.** Icons and fixed places come before words, with short labels where text is needed; no prose about what just happened when the screen already shows it, and no titles where the position already says what something is. No boxes inside boxes and few coloured outlines. No hidden rules or behaviour the user cannot reason about.

**Reasoning.** These are the owner's standing priorities for every UI review. A busy screen hides the thing the user came for.

## 2026-11-19: One spacing scale, set by containers

ID: `2026-11-19-one-spacing-scale-set-by-containers` · Status: current

**Decision.** Panels, drawers and popovers use one spacing scale defined as tokens (for example 4 px within a group, 8 px between blocks, 12 px above a button on its own line, 16 px between sections). Containers space their children; parts set no outer margins of their own. A test fails when a stylesheet gives such a part its own vertical margin.

**Reasoning.** A measured pass found gaps in seven sizes with no rule, caused by parts setting their own margins and global rules leaking in. Spacing owned by containers stays the same wherever a part is placed.

## 2026-11-19: Shared components are listed, guarded and reused

ID: `2026-11-19-shared-components-are-listed-guarded-and` · Status: current

**Decision.** Standing UX rules and a lookup table of shared components ("for this job, use this") are kept in one doc that UI work reads first. A new interaction that other screens could use ships as shared parts in the same PR, with a row in the table and a guard test that fails when it is built again elsewhere. Small, rare duplication is acceptable.

**Reasoning.** Without the table, agents rebuilt pickers and layouts that already existed. The guard test is what makes later agents find the shared part.

## 2026-11-19: Drag and drop always has a tap and keyboard alternative

ID: `2026-11-19-drag-and-drop-always-has-a` · Status: current

**Decision.** Drag and drop is built on pointer events, not the HTML5 drag API, and lifts only after a few pixels of movement. Every drag action can also be done by tapping and by keyboard.

**Reasoning.** The HTML5 drag API fails on mobile. Drag alone excludes keyboard users and anyone who finds dragging awkward.

## 2026-11-19: Counts read "1 / 3", and terms explain themselves without "?" icons

ID: `2026-11-19-counts-read-1-3-and-terms` · Status: current

**Decision.** A count against a total is written with a spaced slash ("1 / 3", "200 / 2500 XP"), never "1 of 3", and a guard test checks the strings. A tappable term opens its explanation from the term itself (a chip, or a dotted underline on a word); no "?" icon is added to it. A small help button is kept only beside a heading or a control.

**Reasoning.** Both are the owner's standing wording and style preferences. A guard test keeps the count rule from slipping back in new code.

<!-- Superseded entries below: kept for history, no longer in force. -->

# Superseded

## 2026-11-19: Characters start on a free hex next to the creature **[Misa]**

ID: `2026-11-19-characters-start-on-a-free-hex` · Status: superseded by `2026-11-19-characters-start-riding-the-creature` · Supersedes: `2026-11-19-characters-start-on-the-creature-s`

**Decision.** New characters start on a free, passable hex next to the creature's footprint, chosen by a fixed order so it is deterministic. Several characters may share it.

**Reasoning.** The creature's hexes are now off limits (see "The creature's hexes are occupied"), so the old start on its centre no longer works.

## 2026-11-19: The creature's hexes are occupied: characters cannot enter them **[Misa]**

ID: `2026-11-19-the-creature-s-hexes-are-occupied` · Status: superseded by `2026-11-19-characters-ride-the-creature-its-footprint` · Supersedes: `2026-11-19-the-creature-s-hexes-are-always`

**Decision.** The creature's hexes are occupied: characters cannot enter, stand on or pass through them, and they offer no actions. Paths go around the creature. Characters start on a free hex next to it. When the creature steps onto a hex where a character stands, the character is moved to the nearest free hex the character could stand on, preferring the hexes beside and behind the creature (a fixed order, so it is deterministic), and the move costs no actions.

**Reasoning.** Misa: the occupied hexes are the creature's own ground; making them off limits lets the creature be drawn smaller without losing its size. Being pushed aside rather than lost or blocked keeps the daily step simple; the push rule was the lead's call.

## 2026-11-19: Characters start on the creature's centre

ID: `2026-11-19-characters-start-on-the-creature-s` · Status: superseded by `2026-11-19-characters-start-on-a-free-hex` · Supersedes: `2026-11-19-characters-start-together-on-the-passable`

**Decision.** `createGame` puts every character on the creature's centre. That hex is always passable, so no search for a nearby free hex is needed.

**Reasoning.** Follows from the creature's hexes always being passable. It is the simplest start.

## 2026-11-19: The creature's hexes are always passable to characters

ID: `2026-11-19-the-creature-s-hexes-are-always` · Status: superseded by `2026-11-19-the-creature-s-hexes-are-occupied` · Amends: `2026-11-19-cliffs-are-impassable-to-characters-in`

**Decision.** A character may enter any of the creature's hexes whatever terrain lies under it, cliffs included. Outside the creature, cliffs still block. Move cost is still the terrain's.

**Reasoning.** The creature walks over any terrain, and characters can climb onto and through it, so its back is a way across a ridge. It also means the start hex (the creature's centre) is always legal.

## 2026-11-19: Characters start together on the passable hex nearest the creature

ID: `2026-11-19-characters-start-together-on-the-passable` · Status: superseded by `2026-11-19-characters-start-on-the-creature-s`

**Decision.** `createGame` puts every character on the same hex: the creature's centre if it is passable, otherwise the first passable hex found ring by ring outwards. Characters may share a hex.

**Reasoning.** Simplest start that is always legal. Spreading characters out or letting players choose a start can come later without changing the state shape.
