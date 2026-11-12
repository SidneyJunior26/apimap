import type { GraphJson, Service } from '@svclens/core';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { ApiError } from '../api';
import { DepsTable } from './DepsTable';
import { emptyForm, formToService, serviceToForm, type ServiceForm } from './form';

/** `service` must not carry the `file` field: everything in it is written to YAML. */
export type EditorTarget = { mode: 'create'; id?: string } | { mode: 'edit'; service: Service; file: string };

interface Props {
  graph: GraphJson;
  target: EditorTarget;
  /** Final action: save through the local API or prepare a GitHub proposal. Throw ApiError to show field errors. */
  onSubmit: (service: Service, isNew: boolean) => Promise<void>;
  submitLabel?: { create: string; edit: string };
  note?: string;
  onClose: () => void;
}

type TextField = Exclude<keyof ServiceForm, 'dependsOn' | 'kind'>;

export function EditorDrawer({ graph, target, onSubmit, submitLabel = { create: 'Create service', edit: 'Save changes' }, note, onClose }: Props) {
  const base = target.mode === 'edit' ? target.service : undefined;
  const [form, setForm] = useState<ServiceForm>(() => (base ? serviceToForm(base) : emptyForm('core', target.mode === 'create' ? (target.id ?? '') : '')));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const firstField = useRef<HTMLInputElement>(null);

  useEffect(() => {
    firstField.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const set = (key: TextField | 'kind', value: string) => setForm({ ...form, [key]: value });
  const groups = [...new Set([...Object.keys(graph.groups), ...graph.nodes.map((n) => n.group).filter((g): g is string => Boolean(g))])].sort();
  const serviceIds = graph.nodes.filter((n) => !n.ghost).map((n) => n.id);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setMessage(null);
    try {
      await onSubmit(formToService(form, base), !base);
    } catch (err) {
      if (err instanceof ApiError) {
        setErrors(Object.fromEntries(err.issues.map((i) => [i.path, i.message])));
        setMessage(err.message);
      } else setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  const field = (key: TextField, label: string, opts: { required?: boolean; placeholder?: string; multiline?: boolean; list?: string; disabled?: boolean } = {}) => (
    <label className="field">
      <span>
        {label}
        {opts.required && <span aria-hidden> *</span>}
      </span>
      {opts.multiline ? (
        <textarea className="input" rows={3} placeholder={opts.placeholder} value={form[key]} onChange={(e) => set(key, e.target.value)} />
      ) : (
        <input
          ref={key === 'id' || (key === 'name' && base) ? firstField : undefined}
          className="input"
          required={opts.required}
          disabled={opts.disabled}
          placeholder={opts.placeholder}
          list={opts.list}
          value={form[key]}
          onChange={(e) => set(key, e.target.value)}
        />
      )}
      {errors[key] && <span className="field-error">{errors[key]}</span>}
    </label>
  );

  return (
    <div className="drawer-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form className="drawer" aria-label={base ? `Edit ${base.name}` : 'New service'} onSubmit={submit} noValidate>
        <header className="drawer__head">
          <h2>{base ? `Edit ${base.name}` : 'New service'}</h2>
          <button type="button" className="icon-btn" aria-label="Close editor" onClick={onClose}>
            ×
          </button>
        </header>
        <div className="drawer__body">
          {note ? (
            <p className="muted small">{note}</p>
          ) : (
            target.mode === 'edit' && (
              <p className="muted small">
                Saved to <code>{target.file}</code>. Comments in the file are kept.
              </p>
            )
          )}
          {field('id', 'Id', { required: true, placeholder: 'payments-api', disabled: Boolean(base) })}
          {field('name', 'Name', { required: true, placeholder: 'Payments API' })}
          <label className="field">
            <span>Kind</span>
            <select className="input" value={form.kind} onChange={(e) => set('kind', e.target.value)}>
              {Object.entries(graph.kinds).map(([id, k]) => (
                <option key={id} value={id}>
                  {k.label}
                </option>
              ))}
            </select>
            {errors.kind && <span className="field-error">{errors.kind}</span>}
          </label>
          <datalist id="groups">
            {groups.map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          <div className="field-row">
            {field('group', 'Group', { list: 'groups' })}
            {field('owner', 'Owner', { placeholder: 'team-payments' })}
          </div>
          {field('repo', 'Repository', { placeholder: 'github.com/acme/payments-api' })}
          {field('description', 'Description', { multiline: true })}
          {field('hosts', 'Hosts', { multiline: true, placeholder: 'payments.acme.internal\napi.acme.com/payments' })}
          <div className="field-row">
            {field('tech', 'Tech', { placeholder: 'dotnet8, redis' })}
            {field('tags', 'Tags', { placeholder: 'pii, critical' })}
          </div>
          <DepsTable rows={form.dependsOn} serviceIds={serviceIds} errors={errors} onChange={(dependsOn) => setForm({ ...form, dependsOn })} />
        </div>
        <footer className="drawer__foot">
          {message && (
            <p className="field-error" role="alert">
              {message}
            </p>
          )}
          <button type="button" className="chip" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="chip chip--on" disabled={saving}>
            {saving ? 'Working…' : base ? submitLabel.edit : submitLabel.create}
          </button>
        </footer>
      </form>
    </div>
  );
}
