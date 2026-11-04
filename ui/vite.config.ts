import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const DEFAULT_GATEWAY_URL = 'https://member-registrations-mind-logs.vercel.app';

/**
 * A Content-Security-Policy is only injected into the production build: the dev
 * server needs inline styles and a websocket for HMR. Griffel (Fluent UI) injects
 * its stylesheet at runtime, which is the documented `style-src 'unsafe-inline'`
 * exception in the UI spec (NFR-3).
 */
function contentSecurityPolicy(gatewayUrl: string): Plugin {
  return {
    name: 'member-registrations-csp',
    apply: 'build',
    transformIndexHtml(html) {
      const policy = [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data:",
        "font-src 'self' data:",
        `connect-src 'self' ${gatewayUrl}`,
        "base-uri 'self'",
        "form-action 'self'",
        "object-src 'none'",
      ].join('; ');

      return html.replace(
        '<head>',
        `<head>\n    <meta http-equiv="Content-Security-Policy" content="${policy}" />`,
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const gatewayUrl = env.VITE_GATEWAY_URL || DEFAULT_GATEWAY_URL;

  return {
    // GitHub Pages serves the project under /MemberRegistrations/. Dev keeps the
    // root path so the gateway's localhost magic-link URL (/#/connect) works.
    base: mode === 'production' ? '/MemberRegistrations/' : '/',
    plugins: [react(), contentSecurityPolicy(gatewayUrl)],
    server: {
      port: 5173,
    },
    preview: {
      port: 4173,
    },
    build: {
      outDir: 'dist',
      sourcemap: false,
    },
  };
});
