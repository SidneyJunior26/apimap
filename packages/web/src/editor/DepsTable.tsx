import type { Confidence } from '@svclens/core';
import { emptyRow, type DepRow } from './form';

const PROTOCOLS = ['http', 'soap', 'ws', 'grpc', 'graphql', 'amqp', 'kafka', 'sql', 'redis', 'ftp'];
const CONFIDENCES: Confidence[] = ['manual', 'confirmed', 'inferred'];

interface Props {
  rows: DepRow[];
  serviceIds: string[];
  errors: Record<string, string>;
  onChange: (rows: DepRow[]) => void;
}

export function DepsTable({ rows, serviceIds, errors, onChange }: Props) {
  const update = (i: number, patch: Partial<DepRow>) => onChange(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  return (
    <fieldset className="deps-edit">
      <legend>Depends on</legend>
      <datalist id="service-ids">
        {serviceIds.map((id) => (
          <option key={id} value={id} />
        ))}
      </datalist>
      <datalist id="protocols">
        {PROTOCOLS.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      {rows.length === 0 && <p className="muted">No dependencies yet.</p>}
      <ul>
        {rows.map((row, i) => (
          <li key={i} className="dep-row">
            <div className="dep-row__main">
              <input className="input" aria-label={`Dependency ${i + 1} target`} list="service-ids" placeholder="service id" value={row.target} onChange={(e) => update(i, { target: e.target.value })} />
              <input className="input dep-row__protocol" aria-label={`Dependency ${i + 1} protocol`} list="protocols" value={row.protocol} onChange={(e) => update(i, { protocol: e.target.value })} />
              <select className="input dep-row__confidence" aria-label={`Dependency ${i + 1} confidence`} value={row.confidence} onChange={(e) => update(i, { confidence: e.target.value as Confidence })}>
                {CONFIDENCES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <button type="button" className="icon-btn" aria-label={`Remove dependency ${i + 1}`} onClick={() => onChange(rows.filter((_, j) => j !== i))}>
                ×
              </button>
            </div>
            <input className="input" aria-label={`Dependency ${i + 1} note`} placeholder="note (optional)" value={row.note} onChange={(e) => update(i, { note: e.target.value })} />
            {row.original?.origin === 'scan' && <p className="hint">Found by scan. Editing it makes it manual, so the next scan keeps your version.</p>}
            {errors[`dependsOn.${i}.target`] && <p className="field-error">{errors[`dependsOn.${i}.target`]}</p>}
          </li>
        ))}
      </ul>
      <button type="button" className="chip" onClick={() => onChange([...rows, emptyRow()])}>
        + Add dependency
      </button>
    </fieldset>
  );
}
