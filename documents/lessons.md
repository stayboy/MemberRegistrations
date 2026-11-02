# Lessons

Durable, owner-accepted lessons, newest first. Each entry names the rule, the evidence and the
trigger that should have caught it. Product rules belong in the spec, not here.

Propose an entry in the reply; it reaches this file only when the owner accepts it.

Owner acceptance is recorded with the entry. The 2026-11-02 entry was accepted with the workflow
adoption on 2026-11-02 (grill Q16: "all as recommended").

---

## 2026-11-02 — A green test run does not prove the Node entrypoint

**Rule.** Before reporting a runtime-affecting change as done, run the compiled artifact
(`npm run build && npm run smoke`), not only the test suite.

**Evidence.** `rrule` ships CommonJS plus a `module` field with no `exports` map. Vitest resolved the
ESM entry, so the named `rrulestr` import passed in tests; `node dist/index.js` failed at startup with
`does not provide an export named 'rrulestr'`. The first live smoke test caught it.

**Trigger.** Any dependency with dual CJS/ESM packaging or a `module` field; any change to the app
entrypoint, imports, or provider wiring.
