# Idle stances

Answers the open question "How do idle stances work?" (`docs/GAME_DESIGN.md`, "A day", step 3). Misa's direction: an idle stance is basically a player doing nothing, and sometimes there are good gameplay reasons to sit on a hex and do nothing. A player must be able to skip the rest of their turn entirely (for example to wait on a hex for threats to arrive so they can attack them), and somewhat passive but beneficial options are welcome. Less is better for now: three stances.

**Guiding principle.** A passive option is an activity a player could do on any hex with their actions (in a real-time mode they would spend each of the day's actions on it), so a stance's use of an action must never be stronger than a specialist's active action. This is also in `GAME_DESIGN.md`, "Rules for cooperation".

## Rules

- Every character has **one stance**, chosen any time for free (a `set-stance` action, no actions spent) and kept until changed. A new character rests. An absent player's stance applies exactly like a present player's: at the tick, each active character's **unspent actions go to their stance**.
- Stances are content (`packages/core/src/content/stances.ts`): `id`, `tags`, `needs` and an `icon`. Rules read tags and needs, never ids.
- A stance has a **need** (`hex`, `node` or none). When it does not hold where the character stands, the stance **falls back to rest** and does nothing; there is no chance to find anything. The HUD shows this: the stance icon fades and a small moon sits on it. The choice is kept, so it acts again once it fits.
- **Wait** (`wait` action, free): ends the character's day. The unspent actions stay on the character and are spent by the stance at the tick. Afterwards the character can neither move nor act (only change stance or take a skill pick); the tick clears the flag. A waiting character counts as spent for fast rounds (no actions left, or waiting). Refused with no actions left.

## The three stances

| Stance         | Tags     | Needs                                               | At the tick                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| -------------- | -------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rest (default) | `rest`   | none                                                | Nothing. A struck character is not helped by resting (shaking off a strike would beat what any specialist can do).                                                                                                                                                                                                                                                                                                                                                                   |
| Lie in wait    | `ambush` | standing on a hex                                   | Prepares an ambush on the hex. A threat that ends its move on, or crosses, the hex is struck first: the character's strike power (the `defend` role tag's higher base, strike skills) once for the first unspent action, plus `stanceAmbushPerAction` (1) for each further one. A threat cleared never reaches anyone. A weakened one goes on. If nothing comes, nothing happens (the actions were still used). Earns the XP of a strike. With no unspent action there is no ambush. |
| Gather         | `gather` | a gatherable node on the hex, with room in the pack | Each unspent action gathers from the node through the same rules as the gather action: the same yield per action, never more.                                                                                                                                                                                                                                                                                                                                                        |

The principle is checked in the rules: `stanceAmbushPerAction` may not exceed `clearPowerOther` (the config refuses it), so for any role the stance's total over _n_ actions (`power + (n − 1) × bonus`) never exceeds _n_ active strikes (`n × power`), and is strictly weaker for the defender.

## Interface

- **Stance control** by the character button on the HUD: a small round button with the stance's glyph. A tap opens a popover of three bubbles (picker style) to choose; a hold on any shows its tip (hint only). Focus moves into the popover and back, without a ring. A stance that does not fit where you stand is faded in the popover and fades the control with a moon on it.
- **Wait** is an hourglass beside the action arrows: tap arms it (a tick replaces the hourglass), tap again confirms; it disarms after a few seconds or on a tap elsewhere, and is faded when you have no actions or have already waited.
- **On the map**: a stance doing something shows as a small glyph disc beside the head of the figure, for everyone; a waiting character shows an hourglass disc on the other side. Rest shows nothing.
- **Roster**: each row shows the stance that will act and, when waiting, the hourglass.

## Tuning (`config.ts`)

`stanceAmbushPerAction` 1 (at most `clearPowerOther`).

## Balance

100 seeds, dev season of 12 steps and full season of 40, careful and careless parties of 3 and 6: unchanged by this slice (`docs/progress.md`). The sim's careless party rides, and both lie in wait and gather need a hex, so the stances give absent riders nothing; the balance of absent players is unaffected by construction.

## Dropped for now

Watch (explore neighbouring hexes with spare actions) was dropped because anyone resting would out-scout the Scout. Help aboard (defence or work on the unlock for riders) was dropped to keep the first slice small. Resting no longer shakes off being struck, for the principle above.

## Future ideas

- A Warden skill or action to **taunt** threats toward themselves instead of the creature (the strength is to be judged later, against the principle).
- More stances as content, each held to the principle, if play shows a need.
