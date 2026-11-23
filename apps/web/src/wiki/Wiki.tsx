/**
 * The wiki: every role's skill tree, drawn with the art kit from the core's content, and a build planner.
 * Tap nodes to plan; the cost (picks, XP, days of play) follows and the plan lives in the URL hash. Public
 * and out of game: it shows the planned tiers too and nothing of any game in progress. Text is rendered as
 * text through Preact, the drawings through the allowlisted SvgNode mapper.
 */
import { drawBranchPath, drawSkillNode } from '@behemoth-road/art';
import type { JSX } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { PALETTE } from '../map/art.ts';
import { toPreact } from '../map/svgToPreact.ts';
import { RoleEmblem } from '../ui/emblems.tsx';
import {
  costOf,
  emptyPlan,
  formatHash,
  parseHash,
  type Plan,
  roleIds,
  togglePick,
  treeOf,
  type WikiBranch,
  WIKI_XP_PER_DAY,
  withRole,
  XP_PER_PICK,
} from './model.ts';
import { effectLine, roleLine, roleName } from './text.ts';

const NODE_SIZE = 56;
const PATH_SIZE = 32;

function Branch({ b, onTap }: { b: WikiBranch; onTap: (id: string) => void }): JSX.Element {
  return (
    <div class="wiki-branch" data-branch={b.branch} data-closed={b.closed ? true : undefined}>
      {b.nodes.map((n, i) => {
        const effect = effectLine(n.node);
        return (
          <div class="wiki-step" key={n.node.id}>
            <span class="wiki-path" data-path={b.paths[i]}>
              {toPreact(drawBranchPath(PALETTE, b.paths[i] ?? 'open', PATH_SIZE))}
            </span>
            <button
              type="button"
              class="wiki-node"
              data-skill={n.node.id}
              data-state={n.state}
              data-tier={n.node.tier}
              aria-pressed={n.state === 'taken'}
              onClick={() => onTap(n.node.id)}
            >
              <span class="wiki-icon">
                {toPreact(drawSkillNode(PALETTE, n.node.icon, NODE_SIZE, n.state))}
              </span>
              <span class="wiki-node-text">
                <span class="wiki-node-name">{n.node.name}</span>
                <span class="wiki-node-effect">{effect ?? 'Planned'}</span>
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function RoleCard({
  role,
  plan,
  onTap,
}: {
  role: string;
  plan: Plan;
  onTap: (id: string) => void;
}): JSX.Element {
  const tree = treeOf(plan, role);
  const mine = role === plan.me;
  return (
    <section class="wiki-card" data-role={role} data-mine={mine ? true : undefined}>
      <header class="wiki-card-head">
        <RoleEmblem role={role} size={64} />
        <div>
          <h2>{roleName(role)}</h2>
          <p>{roleLine(role)}</p>
        </div>
      </header>
      <div class="wiki-branches">
        {tree.map((b) => (
          <Branch key={b.branch} b={b} onTap={onTap} />
        ))}
      </div>
    </section>
  );
}

const initialPlan = (): Plan => parseHash(window.location.hash) ?? emptyPlan();

export function Wiki(): JSX.Element {
  const [plan, setPlan] = useState<Plan>(initialPlan);
  const [copied, setCopied] = useState(false);

  // The plan is the hash; a hand-edited or pasted link is read again, strictly.
  useEffect(() => {
    const url = `${window.location.pathname}${window.location.search}${formatHash(plan)}`;
    window.history.replaceState(null, '', url);
  }, [plan]);
  useEffect(() => {
    const read = (): void => setPlan(initialPlan());
    window.addEventListener('hashchange', read);
    return () => window.removeEventListener('hashchange', read);
  }, []);

  const cost = costOf(plan);
  const roles = roleIds();
  const copy = (): void => {
    void navigator.clipboard?.writeText(window.location.href).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <div class="wiki">
      <header class="wiki-top">
        <h1>Behemoth Road: skills</h1>
        <div class="wiki-me" role="group" aria-label="My role">
          {roles.map((r) => (
            <button
              key={r}
              type="button"
              class="wiki-me-btn"
              data-me={r}
              aria-pressed={r === plan.me}
              aria-label={roleName(r)}
              title={roleName(r)}
              onClick={() => setPlan(withRole(plan, r))}
            >
              <RoleEmblem role={r} size={36} />
            </button>
          ))}
        </div>
        <div class="wiki-cost" data-cost>
          <span>
            <b data-picks>{cost.picks}</b> picks
          </span>
          <span>
            <b data-xp>{cost.xp}</b> XP
          </span>
          <span>
            about <b data-days>{cost.days}</b> days
          </span>
        </div>
        <div class="wiki-actions">
          <button
            type="button"
            class="wiki-btn"
            data-reset
            onClick={() => setPlan(emptyPlan(plan.me))}
          >
            Reset
          </button>
          <button type="button" class="wiki-btn" data-copy onClick={copy}>
            {copied ? 'Copied' : 'Copy link'}
          </button>
        </div>
        <p class="wiki-note">
          One pick per {XP_PER_PICK} XP, at about {WIKI_XP_PER_DAY} XP a day for an active player.
          Your first pick in a tree closes its other branch; other roles open at tier 1 only. Tiers
          marked planned are not in the game yet.
        </p>
      </header>
      <main class="wiki-grid">
        {[plan.me, ...roles.filter((r) => r !== plan.me)].map((r) => (
          <RoleCard key={r} role={r} plan={plan} onTap={(id) => setPlan(togglePick(plan, id))} />
        ))}
      </main>
    </div>
  );
}
