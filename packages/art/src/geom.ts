/** Small geometry helpers: points, boxes and SVG path strings with rounded numbers. */
export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Box {
  readonly x0: number;
  readonly y0: number;
  readonly x1: number;
  readonly y1: number;
}

/** A number for path data: one decimal, never `-0`. */
export function f(n: number): string {
  if (!Number.isFinite(n)) throw new Error(`Not a finite number: ${n}`);
  const v = Math.round(n * 10) / 10;
  return Object.is(v, -0) ? '0' : String(v);
}

const pt = (p: Point): string => `${f(p.x)} ${f(p.y)}`;

export function poly(points: readonly Point[], close = true): string {
  if (points.length === 0) return '';
  const [first, ...rest] = points;
  return `M${pt(first!)}${rest.map((p) => `L${pt(p)}`).join('')}${close ? 'Z' : ''}`;
}

/** A closed Catmull-Rom curve through the points, as cubic Béziers. */
export function smoothClosed(points: readonly Point[]): string {
  const n = points.length;
  if (n < 3) return poly(points);
  const at = (i: number): Point => points[((i % n) + n) % n]!;
  let d = `M${pt(at(0))}`;
  for (let i = 0; i < n; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += `C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  return `${d}Z`;
}

/** An open Catmull-Rom curve through the points. */
export function smoothOpen(points: readonly Point[]): string {
  const n = points.length;
  if (n < 3) return poly(points, false);
  const at = (i: number): Point => points[Math.max(0, Math.min(n - 1, i))]!;
  let d = `M${pt(at(0))}`;
  for (let i = 0; i < n - 1; i += 1) {
    const p0 = at(i - 1);
    const p1 = at(i);
    const p2 = at(i + 1);
    const p3 = at(i + 2);
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 };
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 };
    d += `C${pt(c1)} ${pt(c2)} ${pt(p2)}`;
  }
  return d;
}

export function ellipsePath(cx: number, cy: number, rx: number, ry: number): string {
  return `M${f(cx - rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx + rx)} ${f(cy)}A${f(rx)} ${f(ry)} 0 1 0 ${f(cx - rx)} ${f(cy)}Z`;
}

export function boxOf(points: readonly Point[]): Box {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const p of points) {
    x0 = Math.min(x0, p.x);
    y0 = Math.min(y0, p.y);
    x1 = Math.max(x1, p.x);
    y1 = Math.max(y1, p.y);
  }
  return { x0, y0, x1, y1 };
}

export function unionBox(boxes: readonly Box[]): Box {
  return {
    x0: Math.min(...boxes.map((b) => b.x0)),
    y0: Math.min(...boxes.map((b) => b.y0)),
    x1: Math.max(...boxes.map((b) => b.x1)),
    y1: Math.max(...boxes.map((b) => b.y1)),
  };
}

/**
 * Maps local drawing units (y up is negative, base at 0,0) to the screen. `dir` -1 mirrors; `ky` scales
 * heights separately (foreshortening at a high view).
 */
export function mapper(
  origin: Point,
  k: number,
  dir: 1 | -1 = 1,
  ky: number = k,
): (x: number, y: number) => Point {
  return (x, y) => ({ x: origin.x + dir * x * k, y: origin.y + y * ky });
}
