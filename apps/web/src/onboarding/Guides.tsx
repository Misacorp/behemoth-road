/**
 * The real game's guides, in one place: the first-encounter hints, the "while you were away" recap and the
 * day readout's hold menu. Rendered only in the real game (never in the practice). It tells the server
 * what has been seen (`onSeen`), and where you were last (`api.visit`), and reads the log since your last
 * visit for the recap (`api.game(since)`); it adds no hidden information to anything.
 */
import type { JSX } from 'preact';
import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { ApiClient } from '../api/client.ts';
import type { PlayerView } from '../api/schema.ts';
import { DayMenu } from './DayMenu.tsx';
import { Hint } from './Hint.tsx';
import { dueHint, HINT_MS, type HintId } from './hints.ts';
import { WelcomeBack, type WelcomeStep } from './WelcomeBack.tsx';
import { welcomeNeeded, welcomeOf, type Welcome } from './welcomeBack.ts';

export interface GuidesProps {
  readonly api: ApiClient;
  /** The view this open started from (its last visit is what the recap compares with). */
  readonly initial: PlayerView;
  /** The current view. */
  readonly view: PlayerView;
  /** What has been seen (the server's record, plus what this page has added). */
  readonly seen: ReadonlySet<string>;
  readonly onSeen: (ids: readonly string[]) => void;
  /** Peril just rose from hunger at the tick (a moment is playing). */
  readonly hungry: boolean;
  /** Something is covering the map (a drawer, the hub): hints wait. */
  readonly covered: boolean;
  /** The recap is due on this open (decided once, by whoever mounted the game first). */
  readonly recapDue: boolean;
  readonly onRecapDone: () => void;
  /** The recap's marks step centres the map on the creature. */
  readonly onFocusCreature: () => void;
  readonly onReplayIntro: () => void;
  readonly onPractice: () => void;
}

export function Guides(props: GuidesProps): JSX.Element {
  const { api, initial, view } = props;

  // Where you are now is where your next visit's recap starts: once on opening, and again when the day
  // turns under an open page.
  useEffect(() => {
    api.visit().catch((err: unknown) => console.warn('visit not recorded', err));
  }, [api, view.day]);

  // The recap: the log since your last visit (unreadable or none: the marks step is left out).
  const [welcome, setWelcome] = useState<Welcome | null>(null);
  const asked = useRef(false);
  useEffect(() => {
    if (!props.recapDue || asked.current || !welcomeNeeded(initial)) return;
    asked.current = true;
    const since = initial.you.lastVersion;
    void (async () => {
      let events: PlayerView['events'] = [];
      let truncated = true;
      if (since !== null) {
        try {
          const log = await api.game(since);
          if (!('unchanged' in log)) {
            events = log.events;
            truncated = log.eventsTruncated;
          }
        } catch (err) {
          console.warn('recap log unavailable', err);
        }
      }
      setWelcome(welcomeOf(initial, events, truncated));
    })();
  }, [api, initial, props.recapDue]);
  const recapOpen = welcome !== null && props.recapDue;
  const closeRecap = (): void => {
    setWelcome(null);
    props.onRecapDone();
  };

  // One hint at a time, never over the recap or a drawer, then marked seen (once, ever). The next one
  // waits until this one has gone.
  const [shown, setShown] = useState<HintId | null>(null);
  const quiet = props.covered || recapOpen || props.recapDue || shown !== null;
  const due = useMemo(
    () => (quiet ? null : dueHint(view, props.seen, props.hungry)),
    [quiet, view, props.seen, props.hungry],
  );
  const onSeen = useRef(props.onSeen);
  onSeen.current = props.onSeen;
  const timer = useRef(0);
  useEffect(() => {
    if (due === null) return;
    setShown(due);
    onSeen.current([due]);
    timer.current = window.setTimeout(() => setShown(null), HINT_MS);
  }, [due]);
  useEffect(() => () => window.clearTimeout(timer.current), []);

  return (
    <>
      {recapOpen && (
        <WelcomeBack
          welcome={welcome}
          onStep={(step: WelcomeStep) => {
            if (step === 'marks') props.onFocusCreature();
          }}
          onDone={closeRecap}
        />
      )}
      {shown !== null && !recapOpen && <Hint id={shown} />}
      <DayMenu onReplayIntro={props.onReplayIntro} onPractice={props.onPractice} />
    </>
  );
}
