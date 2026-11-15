# Typecheck lanes: does the production build catch what the DOM lane misses?

**2026-11-15.** Corroborating a proposed lesson: _"The DOM lane is not the production build. `npm --prefix ui run
build` type-checks the test files too … and the symptom is 'webServer exited 2', which names neither the file nor
the rule."_ The incident: `ui/src/components/SessionHeadcount.dom.test.tsx` cast `HeadcountInput` straight to
`Record<string, unknown>` (commit `a542972`, whose message records "the e2e webServer exited 2 twice on CI"), now
`as unknown as Record<string, unknown>`. Sources are primary (vendor docs, compiler output) unless labelled.

## 1. Vitest does not type-check

**Finding.** Type checking is an opt-in second process. The typechecking guide presents it as a feature you add
("To enable typechecking, just add `--typecheck`"), and the config reference gives the default: `false`.

**Citations.** https://vitest.dev/config/typecheck — `typecheck.enabled`: "**Default:** `false` … Enable
typechecking alongside your regular tests" (the block is marked _experimental_). https://vitest.dev/guide/testing-types
— "Vitest uses `tsc --noEmit` or `vue-tsc --noEmit`, depending on your configuration." The mechanism sentence is on
Vite's page, https://vite.dev/guide/features#transpile-only — "Vite only performs transpilation on `.ts` files and
does **NOT** perform type checking … type checking requires knowledge of the entire module graph."

**Does the typechecking page say transformations skip types?** Not in those words — it says typecheck is a separate
compiler invocation, off by default. The claim is right; its best citation is the config page plus Vite, not the
guide alone.

**Applies here.** `ui/vitest.dom.config.ts` has no `typecheck` block; `test:dom` runs `vitest run --config
vitest.dom.config.ts`. The lane executes the file and never reads the assertion.

## 2. TypeScript checks every file in the program, tests included

**Finding.** The program is what `files`/`include` match, minus `exclude`.

**Citations.** https://www.typescriptlang.org/tsconfig#include — "Specifies an array of filenames or patterns to
include in the program." https://www.typescriptlang.org/tsconfig#exclude — "`exclude` _only_ changes which files are
included as a result of the `include` setting."

**Applies here.** `ui/tsconfig.json` has `"include": ["src", "tests", "e2e", …]` and no `exclude`. Verified:
`tsc --noEmit --listFilesOnly` lists `src/components/SessionHeadcount.dom.test.tsx` and the other `*.dom.test.tsx`
files. `build` is `tsc --noEmit && vite build`, so the build is a full program check.

## 3. TS2352 and the double assertion

**Finding.** TS2352 refuses an assertion between types that do not sufficiently overlap, and names the escape hatch
in the message.

**Citations.** https://www.typescriptlang.org/docs/handbook/2/everyday-types.html#type-assertions quotes the message
verbatim — "Conversion of type 'string' to type 'number' may be a mistake because neither type sufficiently overlaps
with the other. If this was intentional, convert the expression to 'unknown' first" — and documents the route:
"you can use two assertions, first to `any` (or `unknown` …), then to the desired type." Compiler string in
`node_modules/typescript/lib/typescript.js`: `Conversion_of_type_0_to_type_1_may_be_a_mistake…` →
`diag(2352, 1 /* Error */, …)`.

Reproduced with the repo's TypeScript 5.9.3 on a minimal `HeadcountInput`: `error TS2352: Conversion of type
'HeadcountInput' to type 'Record<string, unknown>' may be a mistake …`, plus `Index signature for type 'string' is
missing in type 'HeadcountInput'.` — `tsc` exited **2**.

**Applies here.** The fix used exactly the documented route, not a local workaround.

## 4. Playwright `webServer` aborts when its command fails

**Finding.** The docs define the contract but not the failure behaviour; the runner aborts the run during setup.

**Citations.** https://playwright.dev/docs/test-webserver — `timeout`: "How long to wait for the process to start up
and be available in milliseconds. Defaults to 60000"; `url`: expects "a 2xx, 3xx, 400 … status code when the server
is ready"; `reuseExistingServer`: "If `true`, it will re-use an existing server … when available."
`node_modules/playwright/lib/runner/index.js` (bundle comment names `packages/playwright/src/plugins/webServerPlugin.ts`)
rejects the start promise with `` `Process from config.webServer was not able to start. Exit code: ${code}` ``.

**Applies here.** `ui/playwright.config.ts`: `command: 'npm --prefix ui run build && npm --prefix ui run preview …'`,
`cwd: repoRoot`, `timeout: 180_000`, `reuseExistingServer: !process.env.CI`. In CI the command always runs, so a
failing `tsc` aborts before any test starts. **Nuance the lesson gets loose:** the number in the message is the
child's code; Playwright's own exit code is its error exit (1). Locally `reuseExistingServer` is true, so a live
preview skips the command entirely.

## 5. `npm --prefix` — working directory and script execution

**Finding.** `--prefix` makes npm treat the named folder as the project; scripts then run from that package root,
and a non-zero script exit aborts the npm process.

**Citations.** https://docs.npmjs.com/cli/v11/using-npm/config#prefix — "If set on the command line, then it forces
non-global commands to run in the specified folder." (`-C`.) https://docs.npmjs.com/cli/v11/commands/npm-run —
"Scripts are run from the root of the package folder, regardless of what the current working directory is when `npm
run` is called." https://docs.npmjs.com/cli/v11/using-npm/scripts#exiting — "If the script exits with a code other
than 0, then this will abort the process."

**Applies here.** `cwd: repoRoot` is why the config needs `--prefix ui` (else `ui/ui`); `tsc` and `vite` resolve
`ui/tsconfig.json` because the script's cwd is `ui/`. With `&&`, a `tsc` failure means `vite preview` never starts,
so Playwright has no URL to poll. That npm forwards the child's status — so the chain exits 2 — is observed
behaviour, not a documented sentence.

## 6. React purity: no side effects in render

**Finding.** Purity is a stated rule: rendering must be idempotent and free of side effects, because React may run a
component more than once.

**Citations.** https://react.dev/reference/rules/components-and-hooks-must-be-pure — "**Has no side effects in
render** – Code with side effects should run _separately from rendering_"; "Side effects are typically written inside
of event handlers or Effects. But never during render"; "React can render components multiple times".
https://react.dev/learn/keeping-components-pure#side-effects-unintended-consequences — the worked example of a side
effect firing once per render pass.

**Applies here.** A `signOut()` called from the render body runs on every render pass, including discarded ones, so
one user action can fire it N times. The repo's calls sit in effects and callbacks (`SessionHeadcount.tsx` calls it
in a `useEffect` for a 401 query error and in `useMutation.onError`) — the documented shape. **This point is
independent of the typecheck story.**

## 7. What would close the gap (and what the lesson overstates)

- **Vitest can type-check, opt-in.** `--typecheck` runs `tsc --noEmit`; by default only for `*.test-d.ts`
  (`typecheck.include` default `['**/*.{test,spec}-d.?(c|m)[jt]s?(x)']`), but it also reports source errors
  (`typecheck.ignoreSourceErrors` exists for that). Widening `typecheck.include` to `**/*.dom.test.tsx` would have
  caught this in the lane.
- **`vite-plugin-checker`** surfaces type errors in the dev server; Vite's docs name it.
- **Project references** (`tsconfig.references`) split the program; they relocate the check, they do not remove it.
- **The gate already existed.** Root `package.json` has `ui:typecheck` (`tsc --noEmit`) inside `verify:fast`, and
  `ui run build` runs the same compiler. The incident was sequencing — the cast landed after the last local
  typecheck and merged before review — not a missing check.

## How strong is this lesson

**Documented fact:** the DOM lane does not type-check unless asked (§1); a test file under `include` is in the `tsc`
program (§2, plus `--listFilesOnly`); the TS2352 message, the `as unknown as T` route and `tsc`'s exit code 2 (§3,
reproduced); a failing webServer command aborts the Playwright run and its code appears in the error (§4, runner
source); `--prefix` semantics and "scripts run from the package root" (§5); the purity rule (§6).

**Inference from our own incident:** the full chain — cast → `tsc` fails → build exits → webServer aborts → e2e
fails pre-test — rests on one commit message and one diff. No CI log is captured in the repo, so "exited 2 twice on
CI" is a record, not a reproduction. That Playwright's _process_ exit code is 2 is not supported.

**Claims the sources do not support as written:** (a) "the build type-checks the test files" holds _because this
`tsconfig.json` includes `src`_ — it is a repo fact, not a general one; (b) "names neither the file nor the rule" is
fair about the Playwright line, but `tsc`'s file-and-line output sits a few lines above it — unhelpful, not silent;
(c) the React-purity half is sound but is a separate lesson; it is not evidence that the DOM lane hides type errors.

**Verdict:** the mechanical core is fully corroborated and worth a lesson. Trim the causal certainty and the
purity tail, keep "check the build, not only the lane, after touching a test's types", and it stands.
