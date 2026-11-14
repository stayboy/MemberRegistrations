import { describe, expect, it } from 'vitest';
import {
  ancestorsAt,
  checkShell,
  classesOf,
  restylingClasses,
} from '../../scripts/mock/shell-check.mjs';

/**
 * A minimal stylesheet stand-in for `mockups/mvp-offerings/mock.css`. The real file is git-ignored, so
 * the guard is always given an explicit stylesheet here and in CI; only the local CLI reads the file.
 */
const CSS = `
.body { display: flex; min-height: calc(100vh - 56px); }
.top { height: 56px; display: flex; }
.side { width: 260px; }
.state { margin-bottom: 12px; padding: 28px 20px; background: var(--canvas); text-align: center; color: var(--muted); }
.screen { padding: 9px 10px; font-family: Consolas, monospace; font-size: 11.5px; white-space: pre-wrap; }
`;

const shell = ({
  head = toggle(),
  date = dateControl(),
  appearance = appearanceControls(),
  body = '<main><h1>Page</h1></main>',
  wrapper = '<div class="body">',
} = {}) => `<!doctype html>
<html lang="en">
  <body>
    <header class="top">
      <div class="brand"><div class="mark"></div><div class="brand-text"><b>Church Register</b></div></div>
      <nav class="nav"><a href="#">Members</a></nav>
      <div class="account"><span class="avatar">AM</span></div>
    </header>
    ${wrapper}
      <aside class="side">
        <div class="side-head">
          <div class="side-title"><span>Section</span><b>Imports</b></div>
          ${head}
        </div>
        <nav class="side-nav"><a href="#">Attendance</a></nav>
        <div class="side-foot">
          ${date}
          ${appearance}
        </div>
      </aside>
      ${body}
    </div>
  </body>
</html>`;

function toggle() {
  return '<button class="side-toggle" aria-label="Collapse sidebar"><svg></svg></button>';
}

function dateControl() {
  return '<div class="foot-block"><p class="foot-label">Date and time</p><button class="date-trigger"><svg class="gear"></svg><span>Day Month Year</span><svg class="chev"></svg></button></div>';
}

function appearanceControls() {
  return '<div class="foot-block"><p class="foot-label">Appearance</p><div class="foot-row"><span class="select-mini">Fluent</span><span class="switch"></span><span class="switch-label">Dark</span></div></div>';
}

const failureText = (html: string, css: string = CSS) =>
  checkShell(html, { css }).failures.join('\n');

describe('shell-check: the complete shell passes', () => {
  it('accepts a mock carrying the top bar, the head control, the nav and both footer blocks', () => {
    expect(checkShell(shell(), { css: CSS }).failures).toEqual([]);
  });

  it('accepts a layout-only wrapper class such as .body', () => {
    expect(failureText(shell())).toBe('');
  });
});

describe('shell-check: missing regions are named', () => {
  it('fails a sidebar head with no collapse control', () => {
    expect(failureText(shell({ head: '' }))).toContain('no collapse control');
  });

  it('fails a footer whose date block is prose', () => {
    const prose =
      '<div class="foot-block"><p class="foot-label">Date and time</p><div class="foot-row">Day Month Year</div></div>';
    expect(failureText(shell({ date: prose }))).toContain(
      'no control (`class="date-trigger"`), only prose',
    );
  });

  it('fails a footer with no appearance switch', () => {
    const noSwitch =
      '<div class="foot-block"><p class="foot-label">Appearance</p><div class="foot-row"><span class="select-mini">Fluent</span></div></div>';
    expect(failureText(shell({ appearance: noSwitch }))).toContain('no switch');
  });

  it('fails a footer that puts Appearance above Date and time', () => {
    const swapped = shell({ date: appearanceControls(), appearance: dateControl() });
    expect(failureText(swapped)).toContain('Appearance is above Date and time');
  });

  it('fails a page with no main element', () => {
    expect(failureText(shell({ body: '<section>no main</section>' }))).toContain(
      'no `<main>` element',
    );
  });

  it('fails a top bar with no account', () => {
    const html = shell().replace('<div class="account"><span class="avatar">AM</span></div>', '');
    expect(failureText(html)).toContain('no `class="account"`');
  });
});

describe('shell-check: a wrapper must not reuse a restyling class', () => {
  it('fails a page wrapped in .state, the annotation card', () => {
    expect(failureText(shell({ wrapper: '<div class="state">' }))).toContain(
      'reuses a mock.css class that restyles the page',
    );
  });

  it('fails a page wrapped in .screen, the monospace USSD preview', () => {
    expect(failureText(shell({ wrapper: '<div class="screen">' }))).toContain(
      'reuses a mock.css class that restyles the page',
    );
  });

  it('does not treat a layout class as restyling', () => {
    expect(restylingClasses(CSS).has('body')).toBe(false);
    expect(restylingClasses(CSS).has('side')).toBe(false);
    expect(restylingClasses(CSS).has('state')).toBe(true);
    expect(restylingClasses(CSS).has('screen')).toBe(true);
  });
});

describe('shell-check: parsing helpers', () => {
  it('reads a class attribute in either quote style', () => {
    expect(classesOf(' class="a b"')).toEqual(['a', 'b']);
    expect(classesOf(" class='a'")).toEqual(['a']);
    expect(classesOf(' id="x"')).toEqual([]);
  });

  it('walks the ancestors of the main element without losing a wrapper', () => {
    const html =
      '<body><div class="outer"><section class="inner"><main>x</main></section></div></body>';
    const at = html.indexOf('<main');
    expect(ancestorsAt(html, at).map((entry) => entry.name)).toEqual(['body', 'div', 'section']);
  });

  it('ignores void elements when walking ancestors', () => {
    const html = '<body><img src="x"><div><main>x</main></div></body>';
    expect(ancestorsAt(html, html.indexOf('<main')).map((entry) => entry.name)).toEqual([
      'body',
      'div',
    ]);
  });
});
