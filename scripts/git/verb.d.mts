export type BriefVerb = 'branch' | 'commit' | 'restore';

export interface Brief {
  verb: BriefVerb | string;
  branch?: string;
  tree?: string;
  files?: string[];
  messageFile?: string;
  revision?: string;
  reason?: string;
}

export interface RepoState {
  branch: string;
  tree: string;
}

export declare const VERBS: readonly BriefVerb[];
export declare function validateBrief(brief: unknown, state: RepoState): string[];
export declare function commandsFor(brief: Brief): string[];
