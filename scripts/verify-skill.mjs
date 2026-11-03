#!/usr/bin/env node
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const canonical =
  process.env.ORCHESTRATOR_SKILL_DIR ?? join(homedir(), '.agents', 'skills', 'orchestrator');
const isCI = Boolean(process.env.CI);
const failures = [];
const notes = [];

const fail = (message) => failures.push(message);

// Repo-side artefacts are always checked, including in CI.
const policyPath = join(repoRoot, 'documents', 'agents', 'orchestrator-policy.md');
if (!existsSync(policyPath)) {
  fail('missing documents/agents/orchestrator-policy.md');
}

const agentsPath = join(repoRoot, 'AGENTS.md');
if (!existsSync(agentsPath)) {
  fail('missing AGENTS.md');
} else if (!readFileSync(agentsPath, 'utf8').includes('documents/agents/orchestrator-policy.md')) {
  fail('AGENTS.md does not point at documents/agents/orchestrator-policy.md');
}

// Canonical skill: a local gate. CI has no canonical, so it is recorded, not failed.
const manifestPath = join(canonical, 'skill-manifest.json');
if (!existsSync(manifestPath)) {
  if (isCI) {
    notes.push(`canonical skill not installed at ${canonical}; skipped (CI)`);
  } else {
    fail(`canonical skill not installed at ${canonical} (set ORCHESTRATOR_SKILL_DIR)`);
  }
} else {
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
  for (const entry of manifest.files ?? []) {
    const file = join(canonical, entry.path);
    if (!existsSync(file)) {
      fail(`missing canonical file: ${entry.path}`);
      continue;
    }
    const sha = createHash('sha256').update(readFileSync(file)).digest('hex');
    if (sha !== entry.sha256) {
      fail(`canonical drift: ${entry.path}`);
    }
  }

  let models = null;
  try {
    models = execSync('opencode models', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
  } catch {
    notes.push('opencode CLI unavailable; seat model-id resolution skipped');
  }
  if (models) {
    const available = new Set(
      models
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean),
    );
    for (const seat of manifest.seats ?? []) {
      if (!available.has(seat.model)) {
        fail(`seat ${seat.role}: ${seat.model} is not in opencode models`);
      }
    }
  }
}

for (const note of notes) console.log(`note: ${note}`);
if (failures.length > 0) {
  for (const failure of failures) console.error(`FAIL: ${failure}`);
  process.exit(1);
}
console.log('verify:skill ok');
