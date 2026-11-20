# Fresh-eyes playtest: Milestone 3 (2026-11-20)

An agent that had never seen the project played `m3/integration` (05be473) locally as two players: a casual player on a phone (390×844, days 1–8) and a strategy-minded player on desktop (1440×900, days 4–8, same game). It learned the game only from the screen.

## What worked

- The art and the creature with a garden on its back were the standout ("lovely", "delightful").
- Moving felt good: tap the character, tap a tile, a dashed arrow with pips, a big tick.
- Desktop wheel zoom and drag pan were smooth; the desktop join drawer showed the whole choice at once.
- Other players' cards were tidy and readable.

## What confused or broke

- The Worker did not start locally (an exported constant in the Worker entry), and the README did not say to build the web app first.
- Role, trait and quirk icons had no names, so choosing was a guess. Tapping a trait icon selected the card.
- The pink trodden ground around the creature first read as danger, and riding the creature was not obvious.
- Being left behind came as a jolt: an hourglass appeared, and the next day the character was gone with no warning beat or story moment.
- After "next day" the camera re-centred on the creature, so it never looked like the creature moved.
- Beyond moving, no actions were discovered: nothing hinted that standing on a node or site, or next to an unexplored hex, offers something.
- The pack box on desktop opened empty and did not close.
- Other players' moves appeared only after one's own action or a reload (the poll is every 30 s; the tester waited 15 s).

## Top suggestions (the tester's order)

1. Fix the local Worker start and document the web build step.
2. Make losing a character readable: a visible "too far" edge, and a moment when a character is lost.
3. Hint at actions beyond moving where they are possible.
4. Name role, trait and quirk icons on tap or hover (names only), and stop a trait tap from selecting the card.
5. Show other players' moves sooner, and show the creature's step on day change. Fix the stuck pack box.

## Follow-up

All five are being addressed on `m3/web` and `m3/worker` as a polish round on PR #9. The trodden ground's colour reading as danger is a question for Misa.
