#!/usr/bin/env node
/* global console, process, document */
/**
 * Drawer checks (round 14): the join drawer fits its width and scrolls to its bottom, and every drawer
 * (join, skills, hub, roster) closes by Escape, by a click or right-click on the map outside it and by its close control,
 * at 1440x900 and 1280x720; a phone size checks the bottom drawer still scrolls and closes. Against the
 * fake game server; written to screenshots/ as `r14-*`. Any problem is listed and exits 1.
 *
 * Usage: FAKE_GAME_PORT=5185 node apps/web/scripts/drawers.mjs
 * Not part of the unit test run. Needs the pre-installed Playwright (require('playwright')).
 */
import { mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { FakeServer, startVite } from './fake-game.mjs';

if (!process.execArgv.includes('--experimental-transform-types')) {
  const res = spawnSync(
    process.execPath,
    ['--experimental-transform-types', '--no-warnings', ...process.argv.slice(1)],
    { stdio: 'inherit' },
  );
  process.exit(res.status ?? 1);
}
const { SEEN_IDS } = await import('../../../packages/core/src/index.ts');
const { seasonScenario, notJoinedScenario } = await import('../src/api/fixtures.ts');

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../../../screenshots');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const VIEWPORTS = [
  { name: 'desktop', width: 1440, height: 900, touch: false },
  { name: 'laptop', width: 1280, height: 720, touch: false },
  { name: 'phone', width: 390, height: 844, touch: true },
];
const problems = [];

const staged = () => {
  const s = seasonScenario({});
  return { ...s, seen: [...SEEN_IDS], storyRead: s.state.story.fired };
};

async function run() {
  mkdirSync(out, { recursive: true });
  const vite = await startVite();
  const browser = await chromium.launch();
  try {
    for (const vp of VIEWPORTS) await runViewport(browser, vite, vp);
  } finally {
    await browser.close();
    vite.stop();
  }
  if (problems.length) {
    console.error(`\n${problems.length} problem(s):`);
    for (const p of problems) console.error(` - ${p}`);
    process.exit(1);
  }
  console.log('\nr14: no problems');
}

async function runViewport(browser, vite, vp) {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: 1,
    hasTouch: vp.touch,
    isMobile: vp.touch,
  });
  const page = await context.newPage();
  const fake = new FakeServer();
  await page.route(
    (u) => u.pathname.startsWith('/api/'),
    (r) => fake.route(r),
  );
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`${vp.name}: ${m.text()}`);
  });
  page.on('pageerror', (e) => problems.push(`${vp.name}: ${e.message}`));
  const fail = (msg) => problems.push(`${vp.name}: ${msg}`);
  const wait = (ms) => page.waitForTimeout(ms);
  const shot = (name) => page.screenshot({ path: join(out, `r14-${vp.name}-${name}.png`) });
  const open = async (scenario) => {
    fake.reset(scenario);
    await page.goto(vite.url);
    await page.locator('svg.map').waitFor();
    await wait(900);
  };
  const drawers = () => page.locator('.drawer').count();
  const tapAt = async (x, y) => {
    if (vp.touch) await page.touchscreen.tap(x, y);
    else await page.mouse.click(x, y);
    await wait(350);
  };
  /** A map point clear of every drawer and of the HUD's corners. */
  const emptyMapPoint = async () => {
    if (vp.touch) return [vp.width / 2, 130];
    const box = await page.locator('.drawer').first().boundingBox();
    return [box.x < vp.width / 2 ? vp.width - 200 : 200, vp.height / 2];
  };

  // 1. The join drawer fits its width and scrolls to its bottom.
  await open(notJoinedScenario());
  await page.locator('.drawer .offer').first().waitFor();
  await wait(400);
  await shot('join');
  const body = page.locator('.drawer-body').first();
  const m = await body.evaluate((el) => ({
    sw: el.scrollWidth,
    cw: el.clientWidth,
    sh: el.scrollHeight,
    ch: el.clientHeight,
  }));
  if (m.sw > m.cw + 1) fail(`the join drawer overflows sideways (${m.sw} > ${m.cw})`);
  const box = await body.boundingBox();
  if (!vp.touch) {
    const strip = await page.locator('.role-strip').evaluate((el) => ({
      sw: el.scrollWidth,
      cw: el.clientWidth,
    }));
    if (strip.sw > strip.cw + 1) fail(`the role cards scroll sideways (${strip.sw} > ${strip.cw})`);
    if (m.sh > m.ch + 1) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.wheel(0, 2000);
      await wait(300);
      const top = await body.evaluate((el) => el.scrollTop);
      if (top < m.sh - m.ch - 2) fail(`the join drawer did not scroll to its bottom (${top})`);
    }
    await shot('join-bottom');
    // Everything must be reachable: the last control (the wiki link) is in view after scrolling.
    const wiki = await page.locator('.join-wiki').boundingBox();
    const b = await body.boundingBox();
    if (!wiki || wiki.y + wiki.height > b.y + b.height + 1)
      fail('the join drawer content is cut off at the bottom');
    // Clicking anywhere in the drawer reaches it (nothing covers it), the scrollbar edge included.
    const covered = await page.evaluate(() => {
      const b = document.querySelector('.drawer').getBoundingClientRect();
      const bad = [];
      for (const fx of [0.05, 0.2, 0.35, 0.5, 0.65, 0.8, 0.95, 0.99])
        for (let fy = 0.05; fy < 1; fy += 0.15) {
          const x = b.x + b.width * fx;
          const y = b.y + b.height * fy;
          const el = document.elementFromPoint(x, y);
          if (!el?.closest('.drawer'))
            bad.push(
              `${Math.round(x)},${Math.round(y)}:${el?.className?.baseVal ?? el?.className}`,
            );
        }
      return bad;
    });
    if (covered.length) fail(`the join drawer is covered by another layer at ${covered.join(' ')}`);
  }

  // 2. Each drawer closes by Escape, by a click outside and by its close control.
  const cases = [
    {
      name: 'join',
      scenario: () => notJoinedScenario(),
      show: async () => {
        await page.locator('.drawer .offer').first().waitFor();
      },
    },
    {
      name: 'skills',
      scenario: staged,
      show: async () => {
        await page.locator('.hud-skills').click();
        await page.locator('.drawer[aria-label=Skills]').waitFor();
      },
    },
    {
      name: 'roster',
      scenario: staged,
      show: async () => {
        await page.locator('.hud-roster').click();
        await page.locator('.drawer[aria-label=Players]').waitFor();
      },
    },
    {
      name: 'hub',
      scenario: staged,
      show: async () => {
        const c = fake.scenario.state.creature.centre;
        const nums = async (n) =>
          (await page.locator('svg.map').getAttribute(n)).split(' ').map(Number);
        const [vx, vy, scale] = await nums('data-view');
        const [size, squash] = await nums('data-projection');
        await tapAt(
          vx + size * 1.5 * c.q * scale,
          vy + size * Math.sqrt(3) * (c.r + c.q / 2) * squash * scale,
        );
        await page.locator('[data-popover=bubble] [aria-label=Behemoth]').click();
        await page.locator('.drawer[aria-label=Behemoth]').waitFor({ timeout: 3000 });
      },
    },
  ];
  // Phones close by dragging the handle down; the check is of the desktop ways.
  for (const c of vp.touch ? [] : cases) {
    for (const how of ['escape', 'outside', 'right-click', 'control']) {
      const tag = `${c.name} drawer, ${how}`;
      try {
        await open(c.scenario());
        await c.show();
        await wait(300);
        // The pointer leaves the control that opened it (its hover tip would take the first Escape).
        const [mx, my] = await emptyMapPoint();
        await page.mouse.move(mx, my);
        await wait(200);
        if (how === 'escape') await page.keyboard.press('Escape');
        else if (how === 'outside') {
          const [x, y] = await emptyMapPoint();
          await tapAt(x, y);
        } else if (how === 'right-click') {
          const [x, y] = await emptyMapPoint();
          await page.mouse.click(x, y, { button: 'right' });
        } else {
          const ctl = page.locator('.drawer .drawer-close');
          if (!(await ctl.count())) {
            fail(`${tag}: no close control`);
            continue;
          }
          await ctl.first().click();
        }
        await wait(400);
        if (await drawers()) fail(`${tag}: still open`);
        else if (how === 'outside' && (await page.locator('[data-popover]').count()))
          fail(`${tag}: a tap elsewhere opened a popover`);
      } catch (e) {
        fail(`${tag}: ${e.message.split('\n')[0]}`);
      }
    }
  }
  // Focus moves into each drawer (never onto the close cross) and back to the control that opened it.
  const OPENERS = { skills: '.hud-skills', roster: '.hud-roster' };
  for (const c of cases) {
    const tag = `${c.name} drawer, focus`;
    try {
      await open(c.scenario());
      await c.show();
      await wait(300);
      const where = await page.evaluate(() => {
        const a = document.activeElement;
        return a?.closest('.drawer') ? (a.closest('.drawer-close') ? 'cross' : 'in') : 'out';
      });
      if (where !== 'in')
        fail(`${tag}: focus is ${where === 'cross' ? 'on the cross' : 'outside'}`);
      const opener = OPENERS[c.name];
      if (opener) {
        if (!vp.touch) await page.mouse.move(...(await emptyMapPoint()));
        await page.keyboard.press('Escape');
        await wait(300);
        const back = await page.evaluate(
          (q) => document.activeElement?.matches(q) ?? false,
          opener,
        );
        if (!back) fail(`${tag}: focus did not return to the opener ${opener}`);
      }
    } catch (e) {
      fail(`${tag}: ${e.message.split('\n')[0]}`);
    }
  }
  if (!vp.touch) {
    // A drag that starts on the map outside the drawer closes it and still pans the map.
    try {
      await open(staged());
      await page.locator('.hud-skills').click();
      await page.locator('.drawer[aria-label=Skills]').waitFor();
      const view = () => page.locator('svg.map').getAttribute('data-view');
      const before = await view();
      const [x, y] = await emptyMapPoint();
      await page.mouse.move(x, y);
      await page.mouse.down();
      await page.mouse.move(x + 60, y + 40, { steps: 8 });
      await page.mouse.up();
      await wait(400);
      if (await drawers()) fail('drag outside: the drawer is still open');
      if ((await view()) === before) fail('drag outside: the map did not pan');
    } catch (e) {
      fail(`drag outside: ${e.message.split('\n')[0]}`);
    }
    // A click on a control outside the map acts as usual and does not close and swallow: Story if it is
    // there, else the dev "Next day" button (a request goes out).
    try {
      const base = staged();
      await open({ ...base, storyRead: [] });
      // The roster drawer is at the left, clear of the dev buttons at the top right.
      await page.locator('.hud-roster').click();
      await page.locator('.drawer[aria-label=Players]').waitFor();
      const story = page.locator('.hud-story');
      const next = page.locator('[aria-label="Next day"]');
      const control = (await story.count()) ? story : next;
      const hasStory = (await story.count()) > 0;
      const day = () => page.locator('.hud-day span').first().textContent();
      const dayBefore = await day();
      await control.first().click();
      await wait(600);
      const acted = hasStory ? (await story.count()) === 0 : (await day()) !== dayBefore;
      if (!acted)
        fail(`a click on ${hasStory ? 'Story' : 'Next day'} with a drawer open did not act`);
      console.log(
        `drawers ${vp.name}: ${hasStory ? 'Story' : 'Next day'} clicked with a drawer open`,
      );
    } catch (e) {
      fail(`control click: ${e.message.split('\n')[0]}`);
    }
  }
  for (const c of cases) {
    await open(c.scenario());
    try {
      await c.show();
      await wait(400);
      await shot(c.name);
    } catch {
      /* reported above */
    }
  }
  console.log(`drawers ${vp.name}: done`);
}

await run();
