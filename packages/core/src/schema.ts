import { z } from 'zod';

export const SERVICE_ID_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

export const ConfidenceSchema = z.enum(['confirmed', 'inferred', 'manual']);
export const OriginSchema = z.enum(['scan', 'agent', 'manual']);

export const EvidenceSchema = z.object({
  file: z.string().min(1),
  line: z.number().int().positive().optional(),
});

export const DependencySchema = z.object({
  target: z.string().min(1),
  protocol: z.string().min(1).default('http'),
  confidence: ConfidenceSchema.default('manual'),
  origin: OriginSchema.default('manual'),
  evidence: z.array(EvidenceSchema).default([]),
  note: z.string().optional(),
});

export const ServiceSchema = z
  .object({
    id: z.string().regex(SERVICE_ID_PATTERN, 'id must be lowercase letters, digits and dashes, starting with a letter or digit'),
    name: z.string().min(1),
    kind: z.string().min(1),
    group: z.string().optional(),
    owner: z.string().optional(),
    repo: z.string().optional(),
    tech: z.array(z.string()).default([]),
    hosts: z.array(z.string()).default([]),
    description: z.string().optional(),
    tags: z.array(z.string()).default([]),
    locked: z.boolean().default(false),
    dependsOn: z.array(DependencySchema).default([]),
  })
  .passthrough();

const KindOverrideSchema = z.object({
  label: z.string().optional(),
  color: z.string().optional(),
  icon: z.string().optional(),
  shape: z.enum(['circle', 'square', 'diamond', 'hexagon']).optional(),
});

export const GroupSchema = z.object({
  label: z.string().optional(),
  color: z.string().optional(),
});

/** Where the catalog lives on GitHub, so the published site can propose changes as pull requests. */
export const EditTargetSchema = z.object({
  provider: z.literal('github').default('github'),
  repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, 'repo must look like owner/name'),
  branch: z.string().min(1).default('main'),
  /** Catalog folder relative to the repository root ('' when it is the root). */
  path: z.string().default(''),
});

export const ConfigSchema = z.object({
  name: z.string().default('API Map'),
  sources: z.array(z.string()).default([]),
  kinds: z.record(KindOverrideSchema).default({}),
  groups: z.record(GroupSchema).default({}),
  scan: z
    .object({
      /** Domains owned by the company (e.g. `acme.internal`, `*.corp.example`). Unresolved hosts in them are never stubbed as external. */
      internalDomains: z.array(z.string()).default([]),
    })
    .default({}),
  /** `false` turns off "propose change" links even when the git remote is on GitHub. */
  edit: z.union([z.literal(false), EditTargetSchema]).optional(),
});

export type Confidence = z.infer<typeof ConfidenceSchema>;
export type Origin = z.infer<typeof OriginSchema>;
export type Evidence = z.infer<typeof EvidenceSchema>;
export type Dependency = z.infer<typeof DependencySchema>;
export type Service = z.infer<typeof ServiceSchema>;
export type Config = z.infer<typeof ConfigSchema>;
export type EditTarget = z.infer<typeof EditTargetSchema>;
