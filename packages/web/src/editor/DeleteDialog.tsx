import type { GraphJson } from '@apimap/core';
import { useEffect, useRef, useState } from 'react';

interface Props {
  graph: GraphJson;
  id: string;
  /** Deletes through the local API, or opens GitHub's delete page in proposal mode. */
  onConfirm: () => Promise<void>;
  confirmLabel?: string;
  description?: string;
  onCancel: () => void;
}

export function DeleteDialog({ graph, id, onConfirm, confirmLabel = 'Delete service', description, onCancel }: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const node = graph.nodes.find((n) => n.id === id);
  const dependents = [...new Set(graph.edges.filter((e) => e.target === id && e.source !== id).map((e) => e.source))];

  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => dialog?.close();
  }, []);

  const confirm = async () => {
    setBusy(true);
    try {
      await onConfirm();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} className="confirm" aria-labelledby="delete-title" onCancel={(e) => (e.preventDefault(), onCancel())}>
      <h2 id="delete-title">Delete {node?.label ?? id}?</h2>
      <p>{description ?? <>This removes <code>{node?.file ?? `services/${id}.yaml`}</code> from the catalog.</>}</p>
      {dependents.length > 0 && (
        <p>
          {dependents.length} {dependents.length === 1 ? 'service depends' : 'services depend'} on it ({dependents.join(', ')}). Their links will point to a ghost node until you
          remove them or add the service back.
        </p>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <div className="confirm__actions">
        <button type="button" className="chip" onClick={onCancel} autoFocus>
          Cancel
        </button>
        <button type="button" className="chip chip--danger" onClick={confirm} disabled={busy}>
          {busy ? 'Working…' : confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
