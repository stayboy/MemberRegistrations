# Round - imports shell, member import and batch lookup (15)

|        |                                                                |
| ------ | -------------------------------------------------------------- |
| Status | OPEN                                                           |
| Tier   | 2 - Reviewed                                                   |
| Mode   | `unattended (auto-accept recommendations)`                     |
| Base   | `28b8a2d`                                                      |
| Spec   | `documents/specs/member-registrations-ui.md` §5.4, FR-33–FR-41 |
| Ticket | 15                                                             |

Provider: `ollama-cloud` (worker `deepseek-v4.1-flash:1017`; reviewer `deepseek-v4-pro:0813`).

## Plan

Ticket 15 was split in the Q143–Q147 round: this ticket is the shared import shell, the member-database
import and batch lookup; ticket 15b builds the attendance screen on the same shell.

Decisions applied:

- **Q144** — CSV parses with **Papa Parse** (`papaparse`), the workbook with **`read-excel-file`**; both
  are reachable only from the lazy imports route.
- **Q145** — the split above.
- **Q146** — batch lookup is in this ticket (FR-38): this tab's ids in `sessionStorage` plus an id
  lookup, with no claim of server-side history.
- **Q147** — cells are normalised before preview and commit (dates → `YYYY-MM-DD`, booleans →
  `true`/`false`, numbers → trimmed strings, empty optional cells omitted), so both paths send the same
  shape.
- The retired **Event list** nav item and its placeholder route are removed; `imports/attendance` stays a
  placeholder until 15b.

Not in this ticket: the attendance screen and its occurrence picker (15b); the browser gate (ticket 19).

## Verification

| Gate                      | Command                                                   | Result                                  |
| ------------------------- | --------------------------------------------------------- | --------------------------------------- |
| UI tests                  | `npm --prefix ui run test`                                | pass - 11 files, 119 tests              |
| Typecheck / lint / format | `npm --prefix ui run typecheck` / `lint` / `format:check` | pass                                    |
| Build                     | `npm --prefix ui run build`                               | pass                                    |
| Root tests (serialized)   | `npx vitest run --no-file-parallelism`                    | pass - 17 files, 206 passed / 3 skipped |

| Chunk               | Size                                                   |
| ------------------- | ------------------------------------------------------ |
| entry               | 40.49 kB                                               |
| `vendor`            | 887.66 kB (Fluent UI + React + router + query)         |
| `import-parsers`    | 84.96 kB (Papa Parse + `read-excel-file` and its deps) |
| `ImportsPage`       | 16.20 kB                                               |
| `ImportBatchesPage` | 6.68 kB                                                |

The parsers are statically imported only by `ImportsPage`, never by the entry chunk, so a member who
never opens Imports does not download them.

## Review

`deepseek-v4-pro:0813`: **ACCEPT**, no P1, two P2 and five nits. Applied before commit:

- the batch list key now matches the spec's `mr.imports.v1` (it had invented its own namespace);
- required columns are derived from the `columns[].required` the API publishes, so the client cannot
  drift from the contract;
- the file-input exception (Fluent v9 has no file picker) and the panel's accessibility contract are
  documented on the component, and the result panel announces itself;
- the Vite comment no longer claims every `node_modules` module lands in `vendor`.

Parked, with backlog rows: the API's structured `rows` array is declared but never emitted, so the
panel's row list only fires for client-side validation; and the downloaded template carries an example
row that would import if uploaded unedited.

## Acceptance

| #   | Criterion                                                                         | Met      | Evidence                                                          |
| --- | --------------------------------------------------------------------------------- | -------- | ----------------------------------------------------------------- |
| 1   | CSV and `.xlsx` accepted; values normalised before preview and commit             | yes      | `ui/src/format/import-file.ts`, tests                             |
| 2   | Preview shows count, first five rows and row errors; nothing sent before confirm  | yes      | `ImportPanel.tsx` preview + `canCommit`                           |
| 3   | Limits enforced with split guidance, no chunking                                  | yes      | `checkImportLimits`, boundary tests                               |
| 4   | Confirm posts to `/v1/imports/members` and shows the batch fields; file discarded | yes      | `ImportPanel` result panel; `onSuccess` clears the file           |
| 5   | Rejected rows show reasons and the register is unchanged                          | yes      | client-side row errors; the API's `import_failed` detail is shown |
| 6   | Members list and detail refresh after success                                     | yes      | `ImportsPage` invalidation                                        |
| 7   | Batch lookup lists this tab's ids and resolves one by id                          | yes      | `ImportBatchesPage`, `import-batches.ts` + tests                  |
| 8   | Event list nav and routes removed                                                 | yes      | `navigation.ts`, `router.tsx`, `navigation.test.ts`               |
| 9   | Matches the local mock at the recorded viewport                                   | deferred | Pixel parity is ticket 19 by the accepted deferral                |

Verdict: **ACCEPTED**.

## Deviations

- **Pixel-level mock comparison** stays with ticket 19, as recorded for every UI ticket since 14.
- **The file picker is a hidden native `<input type="file">`** driven by a Fluent `Button`: Fluent v9 has
  no file-picker component, which is the §16 exception and is recorded on the component.
- **No component tests**: the UI test environment is node-only; the parsers, limits, storage and API
  client are covered, and the browser gate is ticket 19.
- **Two parked items** (structured row errors, template example row) are in `documents/backlog.md`, not
  silently dropped.
