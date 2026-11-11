import { describe, expect, it } from 'vitest';
import { ConfigSchema, isInternalHost } from '../src/index.js';

describe('ConfigSchema.scan', () => {
  it('defaults to no internal domains', () => {
    expect(ConfigSchema.parse({}).scan).toEqual({ internalDomains: [] });
  });
});

describe('isInternalHost', () => {
  const domains = ['acme.internal', '*.corp.example', 'svc.cluster.local'];

  it('matches the domain itself and any subdomain', () => {
    expect(isInternalHost('acme.internal', domains)).toBe(true);
    expect(isInternalHost('mq.acme.internal', domains)).toBe(true);
    expect(isInternalHost('a.b.svc.cluster.local', domains)).toBe(true);
  });

  it('treats a leading *. as subdomains only', () => {
    expect(isInternalHost('api.corp.example', domains)).toBe(true);
    expect(isInternalHost('corp.example', domains)).toBe(false);
  });

  it('does not match lookalike suffixes', () => {
    expect(isInternalHost('evilacme.internal', domains)).toBe(false);
    expect(isInternalHost('api.paygate.example', domains)).toBe(false);
  });

  it('is case-insensitive and ignores blanks', () => {
    expect(isInternalHost('MQ.ACME.Internal', [' Acme.Internal '])).toBe(true);
    expect(isInternalHost('x.example', [''])).toBe(false);
  });

  it('treats single-label hosts as internal', () => {
    expect(isInternalHost('rabbitmq', [])).toBe(true);
  });
});
