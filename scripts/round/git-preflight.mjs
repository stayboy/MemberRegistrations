#!/usr/bin/env node
/**
 * Prints what a git brief needs, so the parent never guesses a tree hash.
 *
 * Usage: node scripts/round/git-preflight.mjs [--round documents/rounds/<slug>.md]
 *
 * Prints, in the order a brief consumes them:
 *   branch   the current branch
 *   head     the short sha and subject of HEAD
 *   tree     `git rev-parse 'HEAD^{tree}'` - what a brief's `tree:` must say
 *   dirty    every modified, staged or untracked path, one per line
 *   declared the paths the round doc's git-write table names, so a parent can
 *            see at a glance whether the dirty set is the declared set
 *
 * It is an aid, not a gate: `check-round` and the seat's own rules remain the
 * enforcement. Its whole purpose is that a brief's `tree:` is copied from one
 * output instead of remembered.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function git(args) {
  return execFileSync('git', args, { encoding: 'utf8' }).trimEnd();
}

function roundPathFrom(argv) {
  const at = argv.indexOf('--round');
  if (at === -1) {
    return null;
  }
  const value = argv[at + 1];
  if (!value) {
    throw new Error('--round needs a path, for example documents/rounds/<slug>.md');
  }
  return value;
}

/** Paths a round doc names in backticks, restricted to repo-looking paths. */
function declaredPaths(text) {
  const seen = new Set();
  for (const match of text.matchAll(/`([A-Za-z0-9_./-]+\/[A-Za-z0-9_./-]+)`/g)) {
    const value = match[1];
    if (value.startsWith('documents/') || value.startsWith('src/') || value.startsWith('ui/')) {
      seen.add(value);
    }
  }
  return [...seen].sort();
}

function main() {
  const roundPath = roundPathFrom(process.argv.slice(2));

  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD']);
  const head = git(['log', '-1', '--format=%h %s']);
  const tree = git(['rev-parse', 'HEAD^{tree}']);
  const dirty = git(['status', '--porcelain'])
    .split('\n')
    .filter((line) => line.trim() !== '')
    .map((line) => line.slice(3).trim());

  console.log(`branch   ${branch}`);
  console.log(`head     ${head}`);
  console.log(`tree     ${tree}`);
  console.log(`dirty    ${dirty.length === 0 ? '(none)' : ''}`);
  for (const path of dirty) {
    console.log(`         ${path}`);
  }

  if (roundPath) {
    const declared = declaredPaths(readFileSync(roundPath, 'utf8'));
    console.log(`declared ${roundPath}`);
    for (const path of declared) {
      const mark = dirty.includes(path) ? '*' : ' ';
      console.log(`       ${mark} ${path}`);
    }
    const undeclared = dirty.filter((path) => !declared.includes(path));
    if (undeclared.length > 0) {
      console.log('undeclared (dirty, not named in the round doc):');
      for (const path of undeclared) {
        console.log(`         ${path}`);
      }
    }
  }
}

try {
  main();
} catch (error) {
  console.error(`git-preflight: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
