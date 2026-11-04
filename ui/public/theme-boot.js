/*
 * Runs synchronously before first paint. Reads the same versioned keys as
 * src/theme/preference.ts and src/shell/nav-state.ts, then sets the document
 * background to the Fluent neutral surface for the chosen scheme.
 *
 * The two literal colours are the only pre-paint fallbacks: they mirror
 * `colorNeutralBackground1` in webLightTheme/webDarkTheme and exist so the page
 * never paints white before a dark theme is applied (FR-46, FR-47, NFR-12).
 */
(function () {
  var LIGHT_BACKGROUND = '#ffffff';
  var DARK_BACKGROUND = '#1b1a19';

  function safeGet(key) {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function preferredScheme(stored) {
    if (!stored) return null;
    try {
      var parsed = JSON.parse(stored);
      if (parsed && (parsed.scheme === 'light' || parsed.scheme === 'dark')) {
        return parsed.scheme;
      }
    } catch {
      return null;
    }
    return null;
  }

  var scheme = preferredScheme(safeGet('mr.theme.v1'));
  if (!scheme) {
    var query = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    scheme = query && query.matches ? 'dark' : 'light';
  }

  var root = document.documentElement;
  root.dataset.scheme = scheme;
  root.style.colorScheme = scheme;
  root.style.backgroundColor = scheme === 'dark' ? DARK_BACKGROUND : LIGHT_BACKGROUND;

  if (safeGet('mr.nav.v1') === 'collapsed') {
    root.dataset.nav = 'collapsed';
  }
})();
