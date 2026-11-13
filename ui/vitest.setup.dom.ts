/**
 * DOM-lane setup: the guards between jsdom and Fluent UI v9.
 *
 * Only the DOM lane loads this (`vitest.dom.config.ts`), never the node lane and
 * never Playwright, so the browser tests keep the real platform APIs. Every
 * assignment is guarded, so a future switch to a real browser changes nothing.
 *
 * The inventory comes from `documents/rounds/rtl-adoption.md`; the short version
 * is that jsdom implements the DOM and no platform layer: no layout, no observers,
 * no media queries, no Web Animations, no pointer capture, no clipboard.
 */
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';

// Fluent's MessageBar constructs `ownerWindow.ResizeObserver` on mount and throws
// `TypeError: win.ResizeObserver is not a constructor` without it; overlays and
// tooltips construct observers too. Inert on purpose: jsdom has no layout, so a
// callback would report geometry no renderer produced. Layout truth is Playwright's.
if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  } as unknown as typeof ResizeObserver;
}

if (typeof globalThis.IntersectionObserver === 'undefined') {
  globalThis.IntersectionObserver = class {
    root = null;
    rootMargin = '';
    thresholds: readonly number[] = [];
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  } as unknown as typeof IntersectionObserver;
}

// Media queries are real behaviour here: the theme and reduced-motion paths read
// them, and Fluent reads `prefers-reduced-motion` and `forced-colors`. A per-test
// map lets a test assert dark mode without a browser; the default is light.
const mediaMatches = new Map<string, boolean>();
export function setMediaMatches(query: string, matches: boolean): void {
  mediaMatches.set(query, matches);
}

if (typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    get matches() {
      return mediaMatches.get(query) ?? false;
    },
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

// jsdom has no PointerEvent class at all, so `event instanceof PointerEvent` throws
// instead of returning false, and menus/comboboxes call the capture methods.
if (typeof globalThis.PointerEvent === 'undefined') {
  class PointerEventStub extends MouseEvent {
    readonly pointerId: number;
    readonly pointerType: string;
    readonly isPrimary: boolean;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
      this.pointerType = init.pointerType ?? 'mouse';
      this.isPrimary = init.isPrimary ?? true;
    }
  }
  globalThis.PointerEvent = PointerEventStub as unknown as typeof PointerEvent;
}

for (const method of ['setPointerCapture', 'releasePointerCapture', 'hasPointerCapture'] as const) {
  if (typeof Element.prototype[method] !== 'function') {
    Object.defineProperty(Element.prototype, method, {
      configurable: true,
      writable: true,
      value: () => (method === 'hasPointerCapture' ? false : undefined),
    });
  }
}

// Web Animations: overlays settle animations through these; an empty array is the
// honest answer under a renderer that never animates.
if (typeof Element !== 'undefined' && typeof Element.prototype.getAnimations !== 'function') {
  Object.defineProperty(Element.prototype, 'getAnimations', {
    configurable: true,
    writable: true,
    value: () => [],
  });
}
if (typeof document !== 'undefined' && typeof document.getAnimations !== 'function') {
  Object.defineProperty(document, 'getAnimations', {
    configurable: true,
    writable: true,
    value: () => [],
  });
}
if (typeof Element !== 'undefined' && typeof Element.prototype.animate !== 'function') {
  Object.defineProperty(Element.prototype, 'animate', {
    configurable: true,
    writable: true,
    value: () => ({
      cancel: () => {},
      finish: () => {},
      play: () => {},
      pause: () => {},
      reverse: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      finished: Promise.resolve(),
    }),
  });
}

// Focus management and text layout read these; jsdom computes neither.
if (typeof Element.prototype.scrollIntoView !== 'function') {
  Element.prototype.scrollIntoView = () => {};
}
if (typeof Element.prototype.scrollTo !== 'function') {
  (Element.prototype as unknown as { scrollTo: () => void }).scrollTo = () => {};
}
if (typeof Range !== 'undefined' && typeof Range.prototype.getClientRects !== 'function') {
  (Range.prototype as unknown as { getClientRects: () => unknown[] }).getClientRects = () => [];
}

// Focus trapping sets `inert`; jsdom has no property for it.
if (typeof HTMLElement !== 'undefined' && !('inert' in HTMLElement.prototype)) {
  Object.defineProperty(HTMLElement.prototype, 'inert', {
    configurable: true,
    writable: true,
    value: false,
  });
}

// Copy actions and exports: two platform APIs the app actually calls.
if (typeof navigator !== 'undefined' && !navigator.clipboard) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: async () => {}, readText: async () => '' },
  });
}
if (typeof URL.createObjectURL !== 'function') {
  URL.createObjectURL = () => 'blob:test';
}
if (typeof URL.revokeObjectURL !== 'function') {
  URL.revokeObjectURL = () => {};
}

beforeEach(() => {
  // A previous test's session must never survive into the next one; a green suite
  // built on a leaked credential is worse than a red one.
  window.localStorage.clear();
  window.sessionStorage.clear();
  mediaMatches.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
