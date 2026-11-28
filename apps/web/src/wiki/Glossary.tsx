/**
 * The icon glossary page: every icon the game draws, grouped, with its name and tip text (`glossary.ts`).
 * Drawings go through the allowlisted SvgNode mapper; the screen's own icons are the game's components.
 */
import type { JSX } from 'preact';
import {
  CharacterIcon,
  CreatureIcon,
  JoinIcon,
  RecapIcon,
  StoryIcon,
  SunIcon,
} from '../hud/icons.tsx';
import { toPreact } from '../map/svgToPreact.ts';
import { buildGlossary, drawEntry, type GlossaryEntry, GROUPS } from './glossary.ts';

const ICON_SIZE = 52;

const HUD_COMPONENTS: Readonly<Record<string, () => JSX.Element>> = {
  day: SunIcon,
  'recentre-me': CharacterIcon,
  'recentre-creature': CreatureIcon,
  recap: RecapIcon,
  join: JoinIcon,
  story: StoryIcon,
  date: SunIcon,
};

function Picture({ e }: { e: GlossaryEntry }): JSX.Element {
  const node = drawEntry(e.draw, ICON_SIZE);
  if (node) return <span class="gl-icon">{toPreact(node)}</span>;
  const Hud = e.draw.kind === 'hud' ? HUD_COMPONENTS[e.draw.id] : undefined;
  return <span class="gl-icon gl-hud">{Hud ? <Hud /> : null}</span>;
}

const ENTRIES = buildGlossary();

export function Glossary(): JSX.Element {
  return (
    <div class="gl" data-glossary>
      {GROUPS.map((g) => {
        const entries = ENTRIES.filter((e) => e.group === g.id);
        if (entries.length === 0) return null;
        return (
          <section class="gl-group" data-group={g.id} key={g.id}>
            <h2>{g.title}</h2>
            <div class="gl-list">
              {entries.map((e) => (
                <div class="gl-entry" data-entry={e.key} key={e.key}>
                  <Picture e={e} />
                  <div class="gl-text">
                    <span class="gl-name">{e.name}</span>
                    {e.text !== null && <span class="gl-line">{e.text}</span>}
                  </div>
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
