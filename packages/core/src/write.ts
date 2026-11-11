import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { Document, isSeq, parseDocument, YAMLSeq } from 'yaml';
import { DependencySchema, type Dependency, type Service } from './schema.js';
import { KEY_ORDER, plainDependency, SERVICE_SCHEMA_URL, toPlainService } from './serialize.js';
import { sameValue } from './stable.js';

function updateDependsOn(doc: Document, deps: Dependency[]): void {
  const old = doc.get('dependsOn', true);
  const oldItems = isSeq(old) ? old.items : [];
  const pool = oldItems.map((node) => {
    const parsed = DependencySchema.safeParse((node as { toJSON?: () => unknown }).toJSON?.() ?? node);
    return { node, value: parsed.success ? parsed.data : null, used: false };
  });
  const seq = new YAMLSeq();
  if (isSeq(old)) {
    seq.commentBefore = old.commentBefore;
    seq.comment = old.comment;
    seq.flow = old.flow;
  }
  for (const d of deps) {
    const match = pool.find((p) => !p.used && p.value && sameValue(p.value, d));
    if (match) {
      match.used = true;
      seq.items.push(match.node);
    } else {
      seq.items.push(doc.createNode(plainDependency(d)));
    }
  }
  doc.set('dependsOn', seq);
}

/**
 * Writes a service, preserving comments and untouched nodes of an existing file.
 * Returns true when the file was written, false when nothing changed.
 */
export async function writeServiceFile(file: string, service: Service): Promise<boolean> {
  const plain = toPlainService(service);
  let text: string | null = null;
  try {
    text = await readFile(file, 'utf8');
  } catch {
    // new file
  }

  if (text === null) {
    const doc = new Document(plain);
    doc.commentBefore = ` yaml-language-server: $schema=${SERVICE_SCHEMA_URL}`;
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, doc.toString({ lineWidth: 0 }));
    return true;
  }

  const doc = parseDocument(text);
  const current = (doc.toJS() ?? {}) as Record<string, unknown>;
  let dirty = false;

  for (const [key, value] of Object.entries(plain)) {
    if (key === 'dependsOn') {
      const currentDeps = Array.isArray(current.dependsOn) ? current.dependsOn.map((d) => DependencySchema.safeParse(d)) : [];
      const parsed = currentDeps.every((r) => r.success) ? currentDeps.map((r) => r.data) : null;
      if (!parsed || !sameValue(parsed, service.dependsOn)) {
        updateDependsOn(doc, service.dependsOn);
        dirty = true;
      }
    } else if (!sameValue(current[key], value)) {
      doc.set(key, doc.createNode(value));
      dirty = true;
    }
  }
  for (const key of Object.keys(current)) {
    if (!(key in plain) && KEY_ORDER.includes(key)) {
      const v = current[key];
      const isEmpty = v === undefined || v === null || v === false || (Array.isArray(v) && v.length === 0);
      if (!isEmpty) {
        doc.delete(key);
        dirty = true;
      }
    }
  }

  if (!dirty) return false;
  await writeFile(file, doc.toString({ lineWidth: 0 }));
  return true;
}
