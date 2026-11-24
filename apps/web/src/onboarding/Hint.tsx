/**
 * A first-encounter hint: a small passing popover at the top of the map with an icon and one short line.
 * It takes no taps (the map under it stays live) and leaves by itself. Its icon moves a little so the eye
 * finds it; the line only says the thing is there.
 */
import type { JSX } from 'preact';
import { ArtCreature, ArtHungry, ArtIcon, ArtMoment, ArtSettlement, ArtThreat } from './art.tsx';
import { HINT_LINES, type HintId } from './hints.ts';

function HintArt({ id }: { id: HintId }): JSX.Element {
  switch (id) {
    case 'hint:fog':
      return <ArtIcon id="cloud" size={34} />;
    case 'hint:trap':
      return <ArtMoment kind="trap" size={34} />;
    case 'hint:threat':
      return <ArtThreat look="captors" size={38} />;
    case 'hint:settlement':
      return <ArtSettlement size={38} />;
    case 'hint:hunger':
      return (
        <>
          <ArtCreature size={38} />
          <ArtHungry size={30} />
        </>
      );
  }
}

export function Hint({ id }: { id: HintId }): JSX.Element {
  return (
    <div class="onb-hint" role="status" data-hint={id} key={id}>
      <span class="onb-hint-art">
        <HintArt id={id} />
      </span>
      <span class="onb-hint-line">{HINT_LINES[id]}</span>
    </div>
  );
}
