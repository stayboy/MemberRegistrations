# Repo rules — MemberRegistrations

Working agreement for agents in this repository. These are rules, not suggestions.

## 1. Spec first

- `documents/specs/member-registrations-api.md` is the source of truth. Any behaviour change updates
  the spec **before** code.
- If code and spec disagree, stop and fix both in the same change. Never leave a decision only in a
  chat transcript.

## 2. Grill before building

- For a non-trivial feature, run the grilling interview: map the design tree, ask the whole frontier
  in one round (numbered questions, each with a recommendation), and wait for answers.
- Do not write implementation code until the frontier is empty **and the owner has explicitly approved
  the amended spec**. Approval is a separate, explicit step.
- Record every settled decision in the spec, including the ones that were rejected.

## 3. Date and time

- Backend dates are **UTC calendar dates**. Every default and every "today" uses UTC.
- `series.timezone` is the only override, and only for deciding "today" for that series.
- Clients convert to local time. The API never returns timezone-shifted dates.

## 4. History is append-only

- Never hard-delete a record that has history. End or archive it instead.
- Shepherding calls have no update and no delete. Corrections are new calls.
- The single exception is member purge, which is PII erasure and must be documented as such.

## 5. Security and privacy

- All data routes require the bearer token; writes require `X-Actor-Id`.
- `X-Actor-Id` is audit attribution, not authentication. v1 has no per-officer scoping.
- Personal-data responses send `Cache-Control: no-store`.

## 6. Verification

Before claiming done, run:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

For runtime-affecting changes, smoke-test the compiled server on a free port. Tests assert external
behaviour — responses, persisted rows, computed counts — not internal call sequences.

## 7. Style

- TypeScript strict, ESM; Zod schemas are the contract and OpenAPI is generated from them.
- Parameterised SQL behind repository methods; never interpolate values into SQL.
- Match the existing structure and naming; keep routes thin and invariants with their data.
