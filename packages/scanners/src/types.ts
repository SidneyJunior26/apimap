import type { Evidence, ScanHints, Service } from '@svclens/core';

export interface RepoFiles {
  dir: string;
  /** Directory name, used as fallback service id. */
  name: string;
  /** Relative POSIX paths of files that may be scanned. */
  list(): string[];
  read(rel: string): Promise<string>;
  /** Files the walker left out on purpose, with the reason. Directories like node_modules are not listed. */
  skipped: Skipped[];
}

export interface Skipped {
  file: string;
  reason: string;
}

/** What was removed for safety. Counts only, never the removed value. */
export interface Redaction {
  file: string;
  kind: string;
  count: number;
}

/** A relation or file the scanner saw but could not turn into a confirmed dependency. */
export interface Inconclusive {
  file: string;
  key?: string;
  line?: number;
  reason: string;
}

export interface Reference {
  protocol: string;
  host: string;
  path: string;
  evidence: Evidence;
  /** Database or broker product, when the config says which one (SQL Server, PostgreSQL, ...). */
  provider?: string;
}

export interface RepoScan {
  hints: ScanHints;
  references: Reference[];
  /** Service declared by the repo owner in `svclens.yaml`, if any. */
  declared?: Partial<Service>;
  errors: Array<{ file: string; message: string }>;
  /** Files that were read. */
  analyzed: string[];
  skipped: Skipped[];
  redactions: Redaction[];
  inconclusive: Inconclusive[];
  /** Config patterns found, with counts, e.g. `connectionStrings: 2`. */
  patterns: Record<string, number>;
}

export interface Scanner {
  name: string;
  scan(repo: RepoFiles, acc: RepoScan): Promise<void>;
}
