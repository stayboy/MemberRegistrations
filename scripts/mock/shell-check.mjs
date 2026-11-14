// shell-check - the shell guard for visual mocks.
//
// Every mock under `mockups/` draws the product shell: a top bar, a section head with a collapse
// control, the section's submenu, and a pinned footer holding the Date and time control above the
// Appearance control. The definition is the Fluent prototype (`v2-shell-mock`) as captured in
// `mockups/v2-settings/02-date-time-sidebar.png`; `mockups/mvp-offerings/mock.css` mirrors it.
//
// This module answers one question: does this HTML carry the whole shell? It reads the stylesheet to
// catch the other trap - a page wrapper named after a class `mock.css` already owns. `.state` is the
// dashed annotation card (padding, centred, muted) and `.screen` is the monospace `pre-wrap` USSD
// preview; either one silently restyles a whole page while the markup still looks correct.
//
// It is deliberately a checker, not a generator: mocks stay hand-written HTML with no build step.
// `mockups/` is git-ignored, so the fixtures here are inline and the CLI runs locally.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const MOCK_CSS = join(repoRoot, 'mockups', 'mvp-offerings', 'mock.css');

/**
 * Properties that make a class a *restyling* class rather than a layout one. A wrapper carrying one
 * of these re-colours, re-centres or re-sizes everything beneath it.
 */
const RESTYLING = [
  /(^|;)\s*text-align\s*:/,
  /(^|;)\s*font-family\s*:/,
  /(^|;)\s*font-size\s*:/,
  /(^|;)\s*white-space\s*:/,
  /(^|;)\s*color\s*:/,
];

/** The simple `.class { ... }` rules of mock.css, keyed by class name. */
export function restylingClasses(css) {
  const out = new Map();
  const rule = /\.([a-z][a-z0-9-]*)\s*\{([^}]*)\}/gi;
  let match;
  while ((match = rule.exec(css)) !== null) {
    const [, name, body] = match;
    if (!RESTYLING.some((pattern) => pattern.test(body))) continue;
    out.set(name, body.replace(/\s+/g, ' ').trim());
  }
  return out;
}

const VOID = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'source',
  'track',
  'wbr',
]);

/** The elements enclosing `targetIndex`, outermost first, as `{ tag, attrs }`. */
export function ancestorsAt(html, targetIndex) {
  const stack = [];
  const tag = /<(\/?)([a-zA-Z][\w-]*)([^>]*)>/g;
  tag.lastIndex = 0;
  const before = html.slice(0, targetIndex);
  let match;
  while ((match = tag.exec(before)) !== null) {
    const [, closing, rawName, attrs] = match;
    const name = rawName.toLowerCase();
    if (VOID.has(name)) continue;
    if (closing) {
      const at = stack.map((entry) => entry.name).lastIndexOf(name);
      if (at !== -1) stack.length = at;
      continue;
    }
    if (attrs.trimEnd().endsWith('/')) continue;
    stack.push({ name, attrs, classes: classesOf(attrs) });
  }
  return stack;
}

/** The class list of a start tag's attribute text. */
export function classesOf(attrs) {
  const match = /\bclass\s*=\s*"([^"]*)"/i.exec(attrs) ?? /\bclass\s*=\s*'([^']*)'/i.exec(attrs);
  return match === null ? [] : match[1].split(/\s+/).filter(Boolean);
}

const has = (html, pattern) => pattern.test(html);

/**
 * Check one mock's HTML against the shell definition.
 *
 * @param {string} html
 * @param {{ css?: string }} [options] `css` defaults to the repository's `mock.css`.
 * @returns {{ failures: string[] }} named failures, empty when the shell is complete.
 */
export function checkShell(html, options = {}) {
  const css = options.css ?? readFileSync(MOCK_CSS, 'utf8');
  const failures = [];

  // 1. Top bar: brand, top nav, account.
  if (!has(html, /<header\s+class="top"/)) {
    failures.push('top bar: no `<header class="top">`');
  } else {
    for (const part of ['brand', 'nav', 'account']) {
      if (!has(html, new RegExp(`class="${part}"`))) {
        failures.push(`top bar: no \`class="${part}"\``);
      }
    }
  }

  // 2. Section head with the collapse control.
  if (!has(html, /class="side-head"/)) {
    failures.push('sidebar head: no `class="side-head"`');
  } else {
    if (!has(html, /class="side-title"/)) failures.push('sidebar head: no section title');
    if (!has(html, /class="side-toggle"/)) {
      failures.push('sidebar head: no collapse control (`class="side-toggle"`)');
    }
  }

  // 3. The section's submenu.
  if (!has(html, /class="side-nav"/)) failures.push('sidebar nav: no `class="side-nav"`');

  // 4. Footer: Date and time (gear, label, chevron) above Appearance (field, switch, Dark).
  const foot = /<div class="side-foot">([\s\S]*?)\n\s*<\/aside>/.exec(html);
  if (foot === null) {
    failures.push('sidebar footer: no `class="side-foot"`');
  } else {
    const body = foot[1];
    if (!has(body, /foot-label">Date and time</)) {
      failures.push('sidebar footer: no "Date and time" block');
    }
    if (!has(body, /class="date-trigger"/)) {
      failures.push(
        'sidebar footer: the date block has no control (`class="date-trigger"`), only prose',
      );
    }
    if (!has(body, /class="date-trigger"[\s\S]*?<svg/)) {
      failures.push('sidebar footer: the date control has no gear glyph');
    }
    if (!has(body, /foot-label">Appearance</)) {
      failures.push('sidebar footer: no "Appearance" block');
    }
    if (!has(body, /class="select-mini"/)) {
      failures.push(
        'sidebar footer: the appearance block has no format field (`class="select-mini"`)',
      );
    }
    if (!has(body, /class="switch"/)) {
      failures.push('sidebar footer: the appearance block has no switch');
    }
    const dateAt = body.indexOf('Date and time');
    const appearanceAt = body.indexOf('Appearance');
    if (dateAt !== -1 && appearanceAt !== -1 && dateAt > appearanceAt) {
      failures.push(
        'sidebar footer: Appearance is above Date and time (the shell orders DATE AND TIME first)',
      );
    }
  }

  // 5. No wrapper between <html> and <main> may reuse a restyling class from mock.css.
  const mainAt = html.search(/<main[\s>]/);
  if (mainAt === -1) {
    failures.push('page: no `<main>` element');
  } else {
    const owned = restylingClasses(css);
    for (const ancestor of ancestorsAt(html, mainAt)) {
      for (const name of ancestor.classes) {
        if (!owned.has(name)) continue;
        failures.push(
          `page wrapper: <${ancestor.name} class="${name}"> reuses a mock.css class that restyles the page (${owned.get(name)})`,
        );
      }
    }
  }

  return { failures };
}

/**
 * The mock HTML files under `mockups/<set>/`, sorted. `index.html` is the set's own index page, not a
 * screen, so it is not expected to carry the shell.
 */
export function mockFiles(set) {
  const dir = join(repoRoot, 'mockups', set);
  let names;
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  return names
    .filter((name) => name.endsWith('.html') && name !== 'index.html')
    .sort()
    .map((name) => join(dir, name));
}

export { repoRoot, MOCK_CSS };

/**
 * The sets the shell sweep covers, in the order the owner approved (2026-11-14). Excluded, and why:
 * `old/` is retired, `ussd/` draws a phone frame and a back-office console rather than the page shell,
 * `ui-fixed-gateway-origin/` holds comparison pages for one diagnostic, and `mvp-hardening/` is a
 * retired hardening set. `_archive` and `headcount` are handled on their own.
 */
export const SWEEP_SETS = [
  'v2-shell',
  'v2-imports',
  'v2-events',
  'headcount',
  'mvp-offerings',
  'offering-grid',
  'v2-settings',
];

// CLI: `node scripts/mock/shell-check.mjs [set ...]` - no set means the sweep's sets.
const invokedDirectly =
  process.argv[1] !== undefined && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (invokedDirectly) {
  const sets = process.argv.slice(2);
  const chosen = sets.length > 0 ? sets : SWEEP_SETS;

  let failed = 0;
  let checked = 0;
  for (const set of chosen) {
    if (!existsSync(join(repoRoot, 'mockups', set))) {
      console.error(`shell-check: no mock set "${set}"`);
      failed += 1;
      continue;
    }
    for (const file of mockFiles(set)) {
      checked += 1;
      const { failures } = checkShell(readFileSync(file, 'utf8'));
      const rel = file.slice(repoRoot.length + 1).replaceAll('\\', '/');
      if (failures.length === 0) {
        console.log(`ok    ${rel}`);
        continue;
      }
      failed += 1;
      console.error(`FAIL  ${rel}`);
      for (const failure of failures) console.error(`        ${failure}`);
    }
  }
  console.error(`\nshell-check: ${checked - failed}/${checked} mocks carry the shell`);
  process.exit(failed === 0 ? 0 : 1);
}
