/**
 * The player roster: a drawer listing every player (Discord name as text only), their role emblem and how
 * their day stands (action arrows, done, lost, riding or out on the map, no character yet). Tapping a row
 * with a character finds it on the map: the map recentres, its card opens and, on a phone, the drawer
 * lowers to a peek. Rows update with each view.
 */
import type { JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { Pips } from '../hud/icons.tsx';
import { Drawer, type Snap } from '../ui/Drawer.tsx';
import { RoleEmblem } from '../ui/emblems.tsx';
import { IconTip } from '../ui/IconTip.tsx';
import { tipFor } from '../ui/tip.ts';
import { DoneMark, WhereMark } from './marks.tsx';
import type { RosterRow } from './model.ts';

export interface RosterProps {
  readonly open: boolean;
  readonly rows: readonly RosterRow[];
  /** The character whose card is open on the map: its row is marked. */
  readonly selected: string | null;
  /** Each increase lowers the phone drawer to its peek (a row was tapped). */
  readonly peek: number;
  readonly onSnap: (snap: Snap) => void;
  readonly onPick: (row: RosterRow) => void;
  readonly onClose: () => void;
}

function Row({
  row,
  selected,
  onPick,
}: {
  row: RosterRow;
  selected: boolean;
  onPick: (row: RosterRow) => void;
}): JSX.Element {
  const inner = (
    <>
      <span class="roster-role">
        <IconTip id={tipFor('role', row.role)}>
          <RoleEmblem role={row.role} size={32} />
        </IconTip>
      </span>
      <span class="roster-name">{row.name}</span>
      <span class="roster-state">
        {row.where === 'riding' || row.where === 'map' ? (
          <>
            <span class="roster-actions" data-tip="roster:actions">
              <Pips total={row.actionsPerDay} left={row.actionsLeft} size={11} />
            </span>
            {row.done && (
              <IconTip id="roster:done">
                <span class="roster-mark" data-mark="done">
                  <DoneMark />
                </span>
              </IconTip>
            )}
          </>
        ) : null}
        <IconTip id={`roster:${row.where === 'riding' ? 'riding' : row.where}`}>
          <span class="roster-mark" data-mark={row.where}>
            <WhereMark where={row.where} />
          </span>
        </IconTip>
      </span>
    </>
  );
  const common = {
    class: 'roster-row',
    'data-user': row.userId,
    'data-where': row.where,
    ...(row.mine ? { 'data-mine': true } : {}),
    ...(selected ? { 'data-selected': true } : {}),
  };
  return row.tappable && row.characterId !== null ? (
    <button type="button" {...common} data-character={row.characterId} onClick={() => onPick(row)}>
      {inner}
    </button>
  ) : (
    <div {...common}>{inner}</div>
  );
}

export function Roster(props: RosterProps): JSX.Element | null {
  const list = useRef<HTMLDivElement>(null);
  // Lowered to its peek, the drawer shows the row that was picked.
  useEffect(() => {
    if (props.peek === 0) return;
    list.current?.querySelector('[data-selected]')?.scrollIntoView({ block: 'start' });
  }, [props.peek]);
  return (
    <Drawer
      open={props.open}
      onClose={props.onClose}
      side="left"
      label="Players"
      peek={props.peek}
      onSnap={props.onSnap}
    >
      <div class="roster" ref={list} data-roster>
        {props.rows.map((r) => (
          <Row
            key={r.userId}
            row={r}
            selected={r.characterId !== null && r.characterId === props.selected}
            onPick={props.onPick}
          />
        ))}
      </div>
    </Drawer>
  );
}
