import type { Confidence, Dependency, Service } from '@svclens/core';

export interface DepRow {
  target: string;
  protocol: string;
  confidence: Confidence;
  note: string;
  /** The dependency this row was loaded from; absent for rows added in the form. */
  original?: Dependency;
}

export interface ServiceForm {
  id: string;
  name: string;
  kind: string;
  group: string;
  owner: string;
  repo: string;
  description: string;
  /** Comma or newline separated. */
  hosts: string;
  tech: string;
  tags: string;
  dependsOn: DepRow[];
}

export const emptyForm = (kind: string, id = ''): ServiceForm => ({
  id, name: '', kind, group: '', owner: '', repo: '', description: '', hosts: '', tech: '', tags: '', dependsOn: [],
});

export const emptyRow = (): DepRow => ({ target: '', protocol: 'http', confidence: 'manual', note: '' });

const splitList = (text: string): string[] => text.split(/[,\n]/).map((s) => s.trim()).filter(Boolean);

export function serviceToForm(s: Service): ServiceForm {
  return {
    id: s.id,
    name: s.name,
    kind: s.kind,
    group: s.group ?? '',
    owner: s.owner ?? '',
    repo: s.repo ?? '',
    description: s.description ?? '',
    hosts: s.hosts.join('\n'),
    tech: s.tech.join(', '),
    tags: s.tags.join(', '),
    dependsOn: s.dependsOn.map((d) => ({ target: d.target, protocol: d.protocol, confidence: d.confidence, note: d.note ?? '', original: d })),
  };
}

function rowToDependency(row: DepRow): Dependency {
  const target = row.target.trim();
  const protocol = row.protocol.trim() || 'http';
  const note = row.note.trim();
  const o = row.original;
  if (o && o.target === target && o.protocol === protocol && o.confidence === row.confidence && (o.note ?? '') === note) return o;
  const dep: Dependency = {
    ...(o ?? { evidence: [] }),
    target,
    protocol,
    confidence: row.confidence,
    // A scan would overwrite an edited scan entry; once a person touches it, it is theirs.
    origin: o && o.origin !== 'scan' ? o.origin : 'manual',
    evidence: o?.evidence ?? [],
  };
  if (note) dep.note = note;
  else delete dep.note;
  return dep;
}

/** Builds a service from the form. `base` keeps fields the form does not show (locked, unknown keys). */
export function formToService(form: ServiceForm, base?: Service): Service {
  const out: Service = {
    ...(base ?? { tech: [], hosts: [], tags: [], locked: false, dependsOn: [] }),
    id: form.id.trim(),
    name: form.name.trim(),
    kind: form.kind,
    tech: splitList(form.tech),
    hosts: splitList(form.hosts),
    tags: splitList(form.tags),
    dependsOn: form.dependsOn.filter((r) => r.target.trim()).map(rowToDependency),
  } as Service;
  for (const key of ['group', 'owner', 'repo', 'description'] as const) {
    const v = form[key].trim();
    if (v) out[key] = v;
    else delete out[key];
  }
  return out;
}
