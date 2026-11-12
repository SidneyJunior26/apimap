import { describe, expect, it } from 'vitest';
import { ServiceSchema } from '@svclens/core';
import { emptyForm, formToService, serviceToForm } from '../src/editor/form.js';

const svc = ServiceSchema.parse({
  id: 'orders-api', name: 'Orders', kind: 'core', group: 'commerce', owner: 'team', hosts: ['a.internal', 'b.internal'], tech: ['dotnet8'], tags: ['pii'],
  extra: 'kept',
  dependsOn: [
    { target: 'payments', confidence: 'confirmed', origin: 'scan', evidence: [{ file: 'appsettings.json', line: 3 }] },
    { target: 'legacy', protocol: 'soap', origin: 'manual', note: 'old' },
  ],
});

describe('form conversion', () => {
  it('round-trips a service unchanged', () => {
    expect(formToService(serviceToForm(svc), svc)).toEqual(svc);
  });

  it('splits list fields on commas and new lines, trimming blanks', () => {
    const form = { ...serviceToForm(svc), hosts: 'x.internal,\n y.internal , ,', tech: '', tags: 'a\nb' };
    const out = formToService(form, svc);
    expect(out.hosts).toEqual(['x.internal', 'y.internal']);
    expect(out.tech).toEqual([]);
    expect(out.tags).toEqual(['a', 'b']);
  });

  it('turns an edited scan dependency into manual and keeps untouched ones', () => {
    const form = serviceToForm(svc);
    form.dependsOn[0]!.note = 'checked by hand';
    const out = formToService(form, svc);
    expect(out.dependsOn[0]).toMatchObject({ target: 'payments', origin: 'manual', note: 'checked by hand', evidence: [{ file: 'appsettings.json', line: 3 }] });
    expect(out.dependsOn[1]).toEqual(svc.dependsOn[1]);
  });

  it('new rows are manual and blank rows are dropped', () => {
    const form = serviceToForm(svc);
    form.dependsOn.push({ target: 'shipping', protocol: 'http', confidence: 'manual', note: '' }, { target: ' ', protocol: 'http', confidence: 'manual', note: '' });
    const out = formToService(form, svc);
    expect(out.dependsOn.at(-1)).toEqual({ target: 'shipping', protocol: 'http', confidence: 'manual', origin: 'manual', evidence: [] });
    expect(out.dependsOn).toHaveLength(3);
  });

  it('omits empty optional text fields', () => {
    const out = formToService({ ...emptyForm('core'), id: 'x', name: 'X' });
    expect(out).toEqual({ id: 'x', name: 'X', kind: 'core', tech: [], hosts: [], tags: [], locked: false, dependsOn: [] });
  });
});
