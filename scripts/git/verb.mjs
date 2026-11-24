#!/usr/bin/env node
/**
 * A brief-file runner for the git-executor seat.
 *
 * The seat's checks live in `.opencode/agents/git-executor*.md` as prose, and an agent
 * executing them writes its own shell. That shell has repeatedly been rejected by the
 * tool layer (compound commands) or drifted from the rule. This runner keeps the checks
 * in code, so the same brief is executed the same way every time.
 *
 * Usage: node scripts/git/verb.mjs briefs/<name>.json [--dry-run]
 *
 * A brief is JSON:
 *   {
 *     "verb": "branch" | "commit" | "restore",
 *     "branch": "feat/x",              // the branch the verb runs on, or the one to create
 *     "tree": "<40 hex>",              // the parent's `git rev-parse 'HEAD^{tree}'`
 *     "files": ["path", ...],          // commit and restore: the exact paths
 *     "messageFile": ".gates/msg.txt", // commit: the message, read by git via -F
 *     "revision": "HEAD" | "<sha>",    // restore only
 *     "reason": "what is discarded"    // restore only
 *   }
 *
 * It refuses rather than guessing: a tree that does not match HEAD, a verb outside the
 * three here, a missing field, or a restore with no stated reason.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

export const VERBS = ['branch', 'commit', 'restore'];
const HEX40 = /^[0-9a-f]{40}$/;

/**
 * Pure: decides whether a brief may run against a known repository state.
 * Returns a list of problems; an empty list means it may run.
 */
export function validateBrief(brief, state) {
  const problems = [];
  if (brief === null || typeof brief !== 'object') {
    return ['the brief is not an object'];
  }
  if (!VERBS.includes(brief.verb)) {
    problems.push(`verb must be one of ${VERBS.join(', ')}; got ${JSON.stringify(brief.verb)}`);
  }
  if (typeof brief.branch !== 'string' || brief.branch.trim() === '') {
    problems.push('branch is required');
  }
  if (typeof brief.tree !== 'string' || !HEX40.test(brief.tree)) {
    problems.push('tree must be the 40-character hash `git rev-parse HEAD^{tree}` prints');
  } else if (brief.tree !== state.tree) {
    problems.push(`tree does not match HEAD: brief ${brief.tree}, HEAD ${state.tree}`);
  }
  if (brief.verb === 'commit') {
    if (!Array.isArray(brief.files) || brief.files.length === 0) {
      problems.push('commit needs files');
    }
    if (typeof brief.messageFile !== 'string' || brief.messageFile.trim() === '') {
      problems.push('commit needs messageFile');
    }
  }
  if (brief.verb === 'restore') {
    if (!Array.isArray(brief.files) || brief.files.length === 0) {
      problems.push('restore needs files');
    }
    if (brief.revision !== 'HEAD' && !HEX40.test(String(brief.revision))) {
      problems.push('restore needs revision: HEAD or a 40-character commit hash');
    }
    if (typeof brief.reason !== 'string' || brief.reason.trim().length < 10) {
      problems.push('restore must state, in reason, what is being discarded');
    }
  }
  if (brief.verb !== 'branch' && brief.branch !== state.branch) {
    problems.push(`the verb runs on ${brief.branch} but HEAD is on ${state.branch}`);
  }
  return problems;
}

/** Pure: the exact commands a validated brief turns into. */
export function commandsFor(brief) {
  switch (brief.verb) {
    case 'branch':
      return [`git switch -c ${brief.branch} main`];
    case 'commit':
      return [`git add -- ${brief.files.join(' ')}`, `git commit -F ${brief.messageFile}`];
    case 'restore':
      return [`git checkout ${brief.revision} -- ${brief.files.join(' ')}`];
    default:
      return [];
  }
}

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trim();
}

function readState() {
  return {
    branch: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    tree: git(['rev-parse', 'HEAD^{tree}']),
  };
}

function run(command) {
  const [file, ...args] = command.split(' ');
  execFileSync(file, args, { stdio: 'inherit' });
}

function main() {
  const args = process.argv.slice(2);
  const briefPath = args.find((arg) => !arg.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  if (!briefPath) {
    console.error('git-verb: pass a brief file, for example briefs/branch.json');
    process.exit(2);
  }

  const brief = JSON.parse(readFileSync(briefPath, 'utf8'));
  const problems = validateBrief(brief, readState());
  if (problems.length > 0) {
    for (const problem of problems) {
      console.error(`git-verb: REFUSED: ${problem}`);
    }
    process.exit(1);
  }

  for (const command of commandsFor(brief)) {
    if (dryRun) {
      console.log(command);
      continue;
    }
    run(command);
  }
}

if (process.argv[1]?.replaceAll('\\', '/').endsWith('scripts/git/verb.mjs')) {
  main();
}
