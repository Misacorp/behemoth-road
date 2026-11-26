# The cart: contract for the web

Content version 24 (other r13 branches bump it too; the lead merges the lines). Misa's ask: a cart, or similar vehicle, that hauls more goods or a single player. The rules are in `packages/core` (`cart.ts`, `act.ts`, `actions.ts`, `path.ts`, `tick.ts`); nothing here needs the web to compute anything. Decisions: "A cart, the first land vehicle" and "Cart rules: seat, hitch, load, push and loss" in `decisions/product.md`. No UI is built yet.

## What it is

A hand cart, one per party (`cartsMax` 1). An **Engineer** builds it at the hub like the raft (2 timber from the stores, 3 work). Finishing it puts it on the map on the nearest rollable hex beside the creature. It carries up to `cartCargo` (8) units of material (a pack holds `packCapacity`, 6, so a cart is a bigger pack that stays on the ground), has one seat, and moves only when someone pulls it.

## View fields (all public)

- `carts[]`: `{ id, hex, cargo: Materials, puller: string | null, rider: string | null }`. Always a hex, never the creature. `puller` and `rider` are character ids; both stand on `hex`. `cargo` is `{ materialId: count }` (absent keys are zero).
- `unlocks` does **not** list the cart. A built cart is `carts.length > 0`. A project in progress is still `project: { unlock: 'cart', work }`.
- `config`: `cartsMax` 1, `cartCargo` 8, `cartHitchCost` 1, `cartBoardCost` 1, `cartPullExtra` 1.
- Content (`UNLOCKS`, from the core package): the entry with `vehicle: { terrainTags: ['open', 'wooded'], seats: 1 }`, `id: 'cart'`, `icon: 'cart'` (art to do), `tags: ['vehicle', 'wheeled']`, `cost` timber 2, `work` 3. Read the `vehicle` property, not the id. Exported: `cartUnlock()`, `isVehicleUnlock(unlock)`, `cartCanEnter(view, hex)`, `cartAtHex(view, hex)`, `cartPulledBy(view, characterId)`, `cartRiddenBy(view, characterId)`, `cartRoom(view, cart)`, `cartSpot(view, hex)`; type `Cart`, `VehicleSpec`.

## Actions (`POST /api/game/act`, strict bodies; identity from the session)

| Action       | Body                                   | Cost                | Does                                                                                                        |
| ------------ | -------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------- |
| `hitch`      | `{ kind: 'hitch' }`                    | `cartHitchCost` (1) | On the cart's hex: become its puller.                                                                       |
| `unhitch`    | `{ kind: 'unhitch' }`                  | 0                   | Let go where it stands.                                                                                     |
| `board-cart` | `{ kind: 'board-cart' }`               | `cartBoardCost` (1) | On the cart's hex, seat free: become its rider.                                                             |
| `leave-cart` | `{ kind: 'leave-cart' }`               | 0                   | Out of the seat, on the same hex.                                                                           |
| `load`       | `{ kind: 'load', material, amount }`   | 0                   | Pack to cart; `amount` an integer 1 to 99. On the cart's hex or next to it (a rider on the creature too).   |
| `unload`     | `{ kind: 'unload', material, amount }` | 0                   | Cart to pack. From the creature, the goods go straight into the stores (events: `unloaded` then `deposit`). |

There is no cart id in a body: with one cart per party the character's hex (or, for load and unload, the nearest cart on or beside their place) names it. `checkAction` and `actionsHere` list all six (`actionsHere` offers one `load` per material in the pack and one `unload` per material in the cart, each for as much as fits). Building is the existing `{ kind: 'build', unlock: 'cart' }`.

## Moving

- **Hitched** (puller): every step costs `moveCost + terrain extra + cartPullExtra`, and the cart and its rider go with the puller. A step the cart cannot make is refused `cart-terrain`: onto the creature, or a hex whose terrain has none of the vehicle's `terrainTags` (water, swamp, cliff, deep water; forest and plains and desert are fine). `planPath` (a path for a puller costs the extra on every step; a target the cart cannot enter is `cart-terrain`), `reachablePlaces`, `moveAlong` and `move` all agree.
- **Aboard** (rider): cannot move at all (`aboard`; `planPath` answers `aboard`, `reachablePlaces` is empty). They move for nothing when the puller moves the cart. They can still act on the hex they are on (gather, strike, survey, light a fire and so on; building and feeding need the creature). Leaving is free.
- `stranded(view, id)` counts a puller or rider's way home on foot, because letting go is free.

## Refusal reasons (409 `{ error }`, and `checkAction(...).reason`)

New in `ActRefusal`: `no-cart` (none on the hex, or for load and unload none on or beside the place), `cart-taken` (hitching a cart someone else pulls), `seat-taken` (boarding a seat that is taken), `not-hitched`, `not-aboard`, `aboard` (hitching while seated), `hitched` (boarding while pulling), `cart-full`, `cart-empty`, `no-material` (loading what the pack lacks), `no-room` (building with nowhere to put it).
Reused: `already-have` (a cart exists at `cartsMax`; hitching when already hitched; boarding when already aboard), `not-enough-actions`, `pack-full` (unload past the pack's room), `invalid-action` (unknown material, bad amount), `missing-materials`, `needs-specialist`, `not-riding`, `busy`, `pinned`, `waiting`.
New in `MoveRefusal` (and so `PathRefusal`): `aboard`, `cart-terrain`.

## Events (each carries the usual `version`)

- `cart-built` `{ cart, hex, characterId? }`: after `unlock-progress` and `unlock-done` (`{ unlock: 'cart' }`, kept so the tallies and the celebration work). `characterId` is absent if a self-winding skill finished it at the tick.
- `hitched`, `unhitched`, `boarded-cart`, `left-cart` `{ cart, characterId, hex }`. The tick also sends `unhitched` and `left-cart` when a creature pick-up makes someone let go.
- `loaded`, `unloaded` `{ cart, characterId, hex, material, amount }`.
- `cart-lost` `{ cart, hex, cargo }` from the tick: lost with its cargo. A rider on it also gets the usual `lost` event.
- There is no event for the push below; the cart's new `hex` is in the view.

## Rules the web should not copy

- **The tick never moves a cart** that is in the window, whoever is hitched and whatever the stances: it stays where it was left, and a puller stays hitched overnight.
- **Window, fog and grace** apply like a character: outside the window the cart has the grace days, then it is lost with its cargo (and a rider as a character is). Shown the same way as a grace hex.
- **The creature walking onto it** hauls its puller and rider aboard (they let go) and pushes the cart to the nearest rollable hex outside the footprint that is in view (rings outward from where it stood, the same every time), cargo kept. With none, it is lost.
- **Tow line:** a puller or rider who grabs the line lets go of the cart, which stays.
- **Rebuilding:** a lost cart can be built again at full cost (`cartsMax` counts carts on the map).
- **Sim:** the balance sim never builds it, so balance is unchanged.
