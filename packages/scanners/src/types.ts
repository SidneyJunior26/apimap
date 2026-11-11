import type { Evidence, ScanHints, Service } from '@apimap/core';

export interface RepoFiles {
  dir: string;
  /** Directory name, used as fallback service id. */
  name: string;
  /** Relative POSIX paths of files that may be scanned. */
  list(): string[];
  read(rel: string): Promise<string>;
}

export interface Reference {
  protocol: string;
  host: string;
  path: string;
  evidence: Evidence;
}

export interface RepoScan {
  hints: ScanHints;
  references: Reference[];
  /** Service declared by the repo owner in `apimap.yaml`, if any. */
  declared?: Partial<Service>;
  errors: Array<{ file: string; message: string }>;
}

export interface Scanner {
  name: string;
  scan(repo: RepoFiles, acc: RepoScan): Promise<void>;
}
