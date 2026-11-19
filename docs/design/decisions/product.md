# Product

Features, UX and behaviour the users see.

<!-- Maintained with `node scripts/decisions.mjs`; see README.md. Newest first. -->

## 2026-11-19: Movement reads one entry rule that can name what makes a step possible

ID: `2026-11-19-movement-reads-one-entry-rule-that` · Status: current · Amends: `2026-11-19-paths-are-planned-by-cheapest-cost`

**Decision.** One rule, `entryInto(state, hex)`, decides whether a character may enter a hex. It returns the cost and an optional `via` tag naming what makes the step possible, or null. `move`, `planPath` and the new `reachableHexes(state, id)` all read it. `reachableHexes` lists every hex the character can reach with its actions left, with its cheapest cost, using the same search as `planPath`. `planPath` now returns steps (`{ hex, cost, via? }`), and `moveAlong` accepts steps or bare hexes. Nothing sets `via` in Milestone 1.

**Reasoning.** Misa's movement design lights up the reachable hexes when the character is tapped, then draws an arrow that can mark the stretch that needs gear (a rope, a tunnel, a boat). With one entry rule, gear can plug in later without changing the API.

## 2026-11-19: Paths are planned by cheapest cost and walked all or nothing

ID: `2026-11-19-paths-are-planned-by-cheapest-cost` · Status: current, amended by `2026-11-19-movement-reads-one-entry-rule-that`

**Decision.** `planPath(state, id, to)` runs a uniform-cost search over reachable, passable hexes, breaking ties in a fixed order. It returns the steps and their total cost, or a refusal: `not-enough-actions` when the cheapest path costs more than the actions left, `no-path` when nothing connects. `moveAlong(state, id, path)` applies each step through `move` and returns either the final state or the refusal and the index of the refused step, changing nothing. Both refuse non-integer or non-finite coordinates (`invalid-hex`).

**Reasoning.** The interface previews a multi-hex path and its cost on a tap, then walks it on one confirm. Reusing `move` for each step keeps a single set of rules for the server to check.

## 2026-11-19: Characters start on the creature's centre

ID: `2026-11-19-characters-start-on-the-creature-s` · Status: current · Supersedes: `2026-11-19-characters-start-together-on-the-passable`

**Decision.** `createGame` puts every character on the creature's centre. That hex is always passable, so no search for a nearby free hex is needed.

**Reasoning.** Follows from the creature's hexes always being passable. It is the simplest start.

## 2026-11-19: The creature's hexes are always passable to characters

ID: `2026-11-19-the-creature-s-hexes-are-always` · Status: current · Amends: `2026-11-19-cliffs-are-impassable-to-characters-in`

**Decision.** A character may enter any of the creature's hexes whatever terrain lies under it, cliffs included. Outside the creature, cliffs still block. Move cost is still the terrain's.

**Reasoning.** The creature walks over any terrain, and characters can climb onto and through it, so its back is a way across a ridge. It also means the start hex (the creature's centre) is always legal.

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

## 2026-11-19: Isometric 3D hexes are the long-term goal; the map is built to allow it **[Misa]**

ID: `2026-11-19-isometric-3d-hexes-are-the-long` · Status: current

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

ID: `2026-11-19-accessibility-is-not-traded-away` · Status: current

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

## 2026-11-19: Characters start together on the passable hex nearest the creature

ID: `2026-11-19-characters-start-together-on-the-passable` · Status: superseded by `2026-11-19-characters-start-on-the-creature-s`

**Decision.** `createGame` puts every character on the same hex: the creature's centre if it is passable, otherwise the first passable hex found ring by ring outwards. Characters may share a hex.

**Reasoning.** Simplest start that is always legal. Spreading characters out or letting players choose a start can come later without changing the state shape.
