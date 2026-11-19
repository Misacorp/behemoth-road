/**
 * Paper, wash and ink effects as SVG filter definitions. They apply to whole layers, never per tile, so a
 * phone runs three filters for the whole map.
 */
import { ART_TUNING } from './config.ts';
import type { Palette } from './palette.ts';
import { rgbUnit } from './palette.ts';
import { el, type SvgNode } from './svg.ts';

export type FilterName = 'wash' | 'ink' | 'grain' | 'vignette' | 'veil';

export function refId(prefix: string, name: FilterName): string {
  return `${prefix}-${name}`;
}

export function refUrl(prefix: string, name: FilterName): string {
  return `url(#${refId(prefix, name)})`;
}

/** The `<defs>` a scene needs: wash bleed, ink wobble, paper grain and the paper's edge tint. */
export function artDefs(palette: Palette, prefix: string, k: number, effects = true): SvgNode {
  const [r, g, b] = rgbUnit(palette.ink);
  const grainAlpha = ART_TUNING.grain;
  const turbulence = (freq: number, octaves: number, seed: number): SvgNode =>
    el('feTurbulence', {
      type: 'fractalNoise',
      baseFrequency: freq,
      numOctaves: octaves,
      seed,
      result: 'noise',
    });
  const displace = (scale: number): SvgNode =>
    el('feDisplacementMap', {
      in: 'SourceGraphic',
      in2: 'noise',
      scale,
      xChannelSelector: 'R',
      yChannelSelector: 'G',
    });
  const vignette = el(
    'radialGradient',
    { id: refId(prefix, 'vignette'), cx: '50%', cy: '50%', r: '72%' },
    [
      el('stop', { offset: '62%', 'stop-color': palette.paperDeep, 'stop-opacity': 0 }),
      el('stop', { offset: '100%', 'stop-color': palette.paperDeep, 'stop-opacity': 0.75 }),
    ],
  );
  // The unexplored veil: paper with a fine slanted hatch, one pattern for every veiled hex.
  const veil = el(
    'pattern',
    {
      id: refId(prefix, 'veil'),
      patternUnits: 'userSpaceOnUse',
      width: 7 * k,
      height: 7 * k,
      patternTransform: 'rotate(32)',
    },
    [
      el('rect', { x: 0, y: 0, width: 7 * k, height: 7 * k, fill: palette.paper, opacity: 0.62 }),
      el('path', {
        d: `M${(1.5 * k).toFixed(2)} 0V${(7 * k).toFixed(2)}`,
        stroke: palette.inkSoft,
        'stroke-width': 0.7 * k,
        opacity: 0.45,
      }),
    ],
  );
  if (!effects) return el('defs', {}, [vignette, veil]);
  return el('defs', {}, [
    el('filter', { id: refId(prefix, 'wash'), x: '-3%', y: '-3%', width: '106%', height: '106%' }, [
      turbulence(0.035 / k, 2, 7),
      displace(ART_TUNING.washBleed * k),
    ]),
    el('filter', { id: refId(prefix, 'ink'), x: '-3%', y: '-3%', width: '106%', height: '106%' }, [
      turbulence(0.09 / k, 1, 3),
      displace(ART_TUNING.inkWobble * k),
    ]),
    el('filter', { id: refId(prefix, 'grain'), x: '0', y: '0', width: '100%', height: '100%' }, [
      turbulence(0.85, 2, 11),
      el('feColorMatrix', {
        type: 'matrix',
        values: `0 0 0 0 ${r.toFixed(3)} 0 0 0 0 ${g.toFixed(3)} 0 0 0 0 ${b.toFixed(3)} ${(grainAlpha * 2.2).toFixed(3)} 0 0 0 ${(-grainAlpha).toFixed(3)}`,
      }),
    ]),
    vignette,
    veil,
  ]);
}
