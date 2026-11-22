/**
 * True in the Vite dev server and in the local Compose build; false in a
 * deployed build.
 *
 * The local UI image still builds with `vite build --mode development` so
 * `resolveGatewayOrigin` keeps permitting the `http://` loopback gateway, but
 * Vite derives `DEV`/`PROD` from `NODE_ENV`, whose build default is `production`,
 * so `import.meta.env.DEV` is false there. The image therefore sets
 * `VITE_USSD_CONSOLE=true` and this helper opts the console in; a deployed build
 * never sets it. The comparison is against the exact string `'true'` - no
 * truthiness, no `1` - so a stray value cannot open the surface.
 */
export function isLocalTools(
  dev: boolean = import.meta.env.DEV,
  flag: string | undefined = import.meta.env.VITE_USSD_CONSOLE,
): boolean {
  return dev || flag === 'true';
}
