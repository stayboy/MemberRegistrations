import { describe, expect, it } from 'vitest';
import { commandsFor, validateBrief } from '../../scripts/git/verb.mjs';

const TREE = 'a'.repeat(40);
const HEAD = 'b'.repeat(40);
const state = { branch: 'feat/x', tree: TREE };

const commit = {
  verb: 'commit',
  branch: 'feat/x',
  tree: TREE,
  files: ['documents/backlog.md'],
  messageFile: '.gates/msg.txt',
};

describe('git/verb: validateBrief', () => {
  it('accepts a well-formed commit brief', () => {
    expect(validateBrief(commit, state)).toEqual([]);
  });

  it('accepts a branch brief on any branch, because it creates one', () => {
    expect(validateBrief({ verb: 'branch', branch: 'feat/new', tree: TREE }, state)).toEqual([]);
  });

  it('accepts a restore brief with a revision and a stated reason', () => {
    const brief = {
      verb: 'restore',
      branch: 'feat/x',
      tree: TREE,
      files: ['AGENTS.md'],
      revision: HEAD,
      reason: 'undo my own uncommitted edit to the seat rules',
    };
    expect(validateBrief(brief, state)).toEqual([]);
  });

  it('refuses a verb outside the three', () => {
    expect(validateBrief({ ...commit, verb: 'push' }, state)).toEqual([
      'verb must be one of branch, commit, restore; got "push"',
    ]);
  });

  it('refuses a stale tree', () => {
    expect(validateBrief({ ...commit, tree: HEAD }, state)).toEqual([
      `tree does not match HEAD: brief ${HEAD}, HEAD ${TREE}`,
    ]);
  });

  it('refuses a malformed tree', () => {
    expect(validateBrief({ ...commit, tree: 'REISSUE' }, state)).toEqual([
      'tree must be the 40-character hash `git rev-parse HEAD^{tree}` prints',
    ]);
  });

  it('refuses a commit with no files', () => {
    expect(validateBrief({ ...commit, files: [] }, state)).toEqual(['commit needs files']);
  });

  it('refuses a commit with no message file', () => {
    const { messageFile: _unused, ...withoutMessage } = commit;
    expect(validateBrief(withoutMessage, state)).toEqual(['commit needs messageFile']);
  });

  it('refuses a verb aimed at a branch HEAD is not on', () => {
    expect(validateBrief({ ...commit, branch: 'feat/other' }, state)).toEqual([
      'the verb runs on feat/other but HEAD is on feat/x',
    ]);
  });

  it('refuses a restore with no revision, a branch as revision, or no reason', () => {
    const base = { verb: 'restore', branch: 'feat/x', tree: TREE, files: ['AGENTS.md'] };
    expect(validateBrief(base, state)).toContain(
      'restore needs revision: HEAD or a 40-character commit hash',
    );
    expect(validateBrief({ ...base, revision: 'main', reason: 'x'.repeat(20) }, state)).toContain(
      'restore needs revision: HEAD or a 40-character commit hash',
    );
    expect(validateBrief({ ...base, revision: 'HEAD', reason: 'short' }, state)).toContain(
      'restore must state, in reason, what is being discarded',
    );
  });
});

describe('git/verb: commandsFor', () => {
  it('turns a commit into stage-then-commit with the message file', () => {
    expect(commandsFor(commit)).toEqual([
      'git add -- documents/backlog.md',
      'git commit -F .gates/msg.txt',
    ]);
  });

  it('turns a branch into a switch from main', () => {
    expect(commandsFor({ verb: 'branch', branch: 'feat/new' })).toEqual([
      'git switch -c feat/new main',
    ]);
  });

  it('turns a restore into a narrow checkout', () => {
    expect(commandsFor({ verb: 'restore', files: ['AGENTS.md'], revision: 'HEAD' })).toEqual([
      'git checkout HEAD -- AGENTS.md',
    ]);
  });
});
