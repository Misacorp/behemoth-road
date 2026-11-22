/**
 * The skill tree drawer (the one bottom drawer on phones, a side drawer on desktop): your role's tree with
 * the emblem as its root and two branches of three nodes, the paths between them drawn by the art kit. Small
 * tabs open the other roles' trees, which show their first node only. A tap on any node shows its tip at once
 * (through the press layer); on an available node the same tap also arms it (it lifts), and the tick below
 * takes it, and a moment inks the node. A tap on any other node shows why and never acts. No prose.
 */
import { drawBranchPath, drawNotchRing, drawSkillNode, type RoleId } from '@behemoth-road/art';
import type { Character, GameStateView, SkillNode } from '@behemoth-road/core';
import type { JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { whyOfPick } from '../game/why.ts';
import { TickMark } from '../hud/icons.tsx';
import { PALETTE } from '../map/art.ts';
import { toPreact } from '../map/svgToPreact.ts';
import { Drawer } from '../ui/Drawer.tsx';
import { RoleEmblem } from '../ui/emblems.tsx';
import { elementTarget, TIP_TAP_EVENT, TIPS, tipProps } from '../ui/press.ts';
import { tipFor } from '../ui/tip.ts';
import {
  type BranchView,
  type NodeView,
  nodeTip,
  orderedTabs,
  ringOf,
  tapNode,
  treeOf,
} from './model.ts';

const NODE_SIZE = 56;
const PATH_SIZE = 40;
const ROOT_SIZE = 72;
/** How long the inked node plays its moment, in ms. */
const INK_MS = 900;

export interface SkillDrawerProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly state: GameStateView;
  readonly me: Character;
  readonly busy: boolean;
  /** Sends the pick; answers the server's refusal code, or null when it went through. */
  readonly onPick: (node: SkillNode) => Promise<string | null>;
}

function Node({
  n,
  armed,
  inked,
  onTap,
}: {
  n: NodeView;
  armed: boolean;
  inked: boolean;
  onTap: (n: NodeView) => void;
}): JSX.Element {
  const id = n.node.id;
  const tip = nodeTip(n);
  // Every node shows its tip on a tap; the press layer then tells the node (an available one arms).
  const ref = useRef<HTMLButtonElement>(null);
  const tapped = useRef(onTap);
  tapped.current = onTap;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fn = (): void => tapped.current(nodeRef.current);
    el.addEventListener(TIP_TAP_EVENT, fn);
    return () => el.removeEventListener(TIP_TAP_EVENT, fn);
  }, []);
  const nodeRef = useRef(n);
  nodeRef.current = n;
  return (
    <button
      ref={ref}
      type="button"
      class={`skill-node${armed ? ' is-armed' : ''}${inked ? ' is-inked' : ''}`}
      data-skill={id}
      data-state={n.state}
      data-armed={armed ? true : undefined}
      aria-label={n.state === 'veiled' ? 'Veiled' : n.node.name}
      aria-pressed={n.state === 'available' ? armed : undefined}
      {...tipProps(tip)}
      data-tip-tap=""
    >
      {toPreact(drawSkillNode(PALETTE, n.node.icon, NODE_SIZE, n.state))}
    </button>
  );
}

function Branch({
  b,
  armedKey,
  inkedId,
  onTap,
}: {
  b: BranchView;
  armedKey: string | null;
  inkedId: string | null;
  onTap: (n: NodeView) => void;
}): JSX.Element {
  return (
    <div class="skills-branch" data-branch={b.branch} data-closed={b.closed ? true : undefined}>
      {b.nodes.map((n, i) => (
        <div class="skills-step" key={n.node.id}>
          <span class="skills-path" data-path={b.paths[i]}>
            {toPreact(drawBranchPath(PALETTE, b.paths[i] ?? 'open', PATH_SIZE))}
          </span>
          <Node n={n} armed={armedKey === n.node.id} inked={inkedId === n.node.id} onTap={onTap} />
        </div>
      ))}
    </div>
  );
}

export function SkillDrawer(props: SkillDrawerProps): JSX.Element | null {
  const { state, me } = props;
  const [role, setRole] = useState(me.role);
  const [armed, setArmed] = useState<string | null>(null);
  const [inked, setInked] = useState<string | null>(null);
  const sending = useRef(false);

  // Each opening starts on your own tree with nothing armed.
  useEffect(() => {
    if (props.open) {
      setRole(me.role);
      setArmed(null);
    }
  }, [props.open, me.role]);
  const close = (): void => {
    setArmed(null);
    props.onClose();
  };

  const tabs = orderedTabs(state, me);
  const own = role === me.role;
  const tree = treeOf(state, me, role, !own);
  const available = new Set(
    tree.flatMap((b) => b.nodes.filter((n) => n.state === 'available').map((n) => n.node.id)),
  );
  // A node that stops being available under an armed tap (a refresh) drops the arming.
  useEffect(() => {
    if (armed !== null && !available.has(armed)) setArmed(null);
  });

  // A node newly taken (from this tap or any refresh) plays its inking moment once.
  const takenBefore = useRef(me.skills.taken);
  const inkTimer = useRef(0);
  useEffect(() => {
    const fresh = me.skills.taken.filter((t) => !takenBefore.current.includes(t));
    takenBefore.current = me.skills.taken;
    if (fresh.length === 0) return;
    setInked(fresh.at(-1) ?? null);
    window.clearTimeout(inkTimer.current);
    inkTimer.current = window.setTimeout(() => setInked(null), INK_MS);
  }, [me.skills.taken]);
  useEffect(() => () => window.clearTimeout(inkTimer.current), []);

  const send = async (n: SkillNode): Promise<void> => {
    // While busy the arm stays: the tap is not lost, the check answers again when it is free.
    if (sending.current || props.busy) return;
    sending.current = true;
    setArmed(null);
    try {
      const refused = await props.onPick(n);
      if (refused !== null) {
        // The server said no (a stale view): its reason shows on the node as a tip.
        const el = document.querySelector(`[data-skill="${n.id}"]`);
        const why = whyOfPick(refused as Parameters<typeof whyOfPick>[0]);
        if (el) TIPS.tap(why, elementTarget(el));
      }
    } finally {
      sending.current = false;
    }
  };

  const onTap = (n: NodeView): void => {
    // The press layer has shown the tip; an available node also arms. Sending is the check's.
    setArmed(tapNode(armed, n).armed);
  };
  const armedNode = tree.flatMap((b) => b.nodes).find((n) => n.node.id === armed) ?? null;

  const ring = ringOf(state, me, role);
  return (
    <Drawer open={props.open} onClose={close} side="right" label="Skills">
      <div class="skills" data-skills data-role={role} data-own={own ? true : undefined}>
        <div class="skills-tabs">
          {tabs.map((t) => (
            <button
              key={t.role}
              type="button"
              class="skills-tab"
              data-tab={t.role}
              data-mine={t.mine ? true : undefined}
              data-ready={t.ready ? true : undefined}
              aria-pressed={t.role === role}
              aria-label={t.role}
              {...tipProps(tipFor('role', t.role))}
              onClick={() => {
                setRole(t.role);
                setArmed(null);
              }}
            >
              <RoleEmblem role={t.role} size={30} />
              {t.ready && <span class="skills-tab-dot" />}
            </button>
          ))}
        </div>
        <div class="skills-tree" data-closed={tree.some((b) => b.closed) ? true : undefined}>
          <div class="skills-root" {...tipProps(tipFor('role', role))} data-tip-tap="">
            {own ? (
              toPreact(
                drawNotchRing(PALETTE, role as RoleId, ring.notches, ring.perPick, ROOT_SIZE),
              )
            ) : (
              <RoleEmblem role={role} size={ROOT_SIZE * 0.75} />
            )}
          </div>
          <div class="skills-branches">
            {tree.map((b) => (
              <Branch key={b.branch} b={b} armedKey={armed} inkedId={inked} onTap={onTap} />
            ))}
          </div>
        </div>
        <div class="skills-confirm">
          <button
            type="button"
            class="skills-go"
            aria-label="Take"
            data-go
            disabled={props.busy}
            hidden={armedNode === null}
            onClick={() => armedNode && void send(armedNode.node)}
          >
            <svg viewBox="-24 -24 48 48" aria-hidden="true">
              <TickMark r={20} />
            </svg>
          </button>
        </div>
      </div>
    </Drawer>
  );
}
