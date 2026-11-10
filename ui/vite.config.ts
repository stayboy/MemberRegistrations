import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv, type Plugin } from 'vite';
import { resolveGatewayOrigin } from './src/auth/gatewayOrigin.ts';

/**
 * A Content-Security-Policy is injected into every `vite build` (production and
 * `--mode development`, which the Docker image uses); the dev server needs
 * inline styles and a websocket for HMR and gets none. Griffel (Fluent UI)
 * injects its stylesheet at runtime, which is the documented
 * `style-src 'unsafe-inline'` exception in the UI spec (NFR-3).
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
  // Throws on a missing, invalid or non-https value in a production build, so
  // the build stops before an artefact exists (AC-10b). The CSP below is
  // generated from this same result.
  const gatewayUrl = resolveGatewayOrigin(env.VITE_GATEWAY_URL, mode);

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
      // Rolldown path (Vite 8): `manualChunks` is deprecated and may be dropped,
      // so vendor grouping is expressed with rolldown's `codeSplitting.groups`.
      // `vendor` holds every node_modules module except the explicitly
      // carved-out `import-parsers` group; app code (including the lazy route
      // chunks) stays separate.
      rolldownOptions: {
        output: {
          codeSplitting: {
            groups: [
              // The import parsers are only reachable from the lazy imports
              // route, so they get their own chunk instead of the eager vendor
              // one; read-excel-file's dependencies travel with it.
              {
                name: 'import-parsers',
                test: /node_modules[\\/](?:papaparse|read-excel-file|fflate|saxen|unzipper-esm|worker-f)[\\/]/,
              },
              { name: 'vendor', test: /node_modules[\\/]/ },
            ],
          },
        },
      },
    },
  };
});
