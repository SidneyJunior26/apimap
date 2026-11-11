import { describe, expect, it } from 'vitest';
import { buildHostIndex, parseEndpoint, resolveHost, ServiceSchema } from '../src/index.js';

const svc = (id: string, hosts: string[] = []) => ServiceSchema.parse({ id, name: id, kind: 'core', hosts });

describe('parseEndpoint', () => {
  it('maps schemes to protocols', () => {
    expect(parseEndpoint('https://a.example/x')?.protocol).toBe('http');
    expect(parseEndpoint('wss://a.example')?.protocol).toBe('ws');
    expect(parseEndpoint('sftp://files.example/in')?.protocol).toBe('ftp');
    expect(parseEndpoint('amqps://mq.example')?.protocol).toBe('amqp');
    expect(parseEndpoint('kafka://k.example:9092')?.protocol).toBe('kafka');
    expect(parseEndpoint('grpc://p.example:50051')?.protocol).toBe('grpc');
  });

  it('drops credentials and port', () => {
    expect(parseEndpoint('https://user:s3cret@Api.Example.com:8443/v1/')).toEqual({ protocol: 'http', host: 'api.example.com', path: '/v1' });
  });

  it('detects soap endpoints', () => {
    expect(parseEndpoint('http://billing.acme.internal/BillingService.svc')?.protocol).toBe('soap');
    expect(parseEndpoint('http://legacy.acme.internal/Ws.asmx')?.protocol).toBe('soap');
    expect(parseEndpoint('http://legacy.acme.internal/service?wsdl')?.protocol).toBe('soap');
  });

  it('rejects non-urls and template placeholders', () => {
    expect(parseEndpoint('not a url')).toBeNull();
    expect(parseEndpoint('https://${HOST}/x')).toBeNull();
    expect(parseEndpoint('http://')).toBeNull();
  });
});

describe('resolveHost', () => {
  const index = buildHostIndex([
    svc('gateway', ['api.acme.com']),
    svc('payments', ['api.acme.com/payments', 'payments.acme.internal']),
    svc('orders-api'),
  ]);

  it('prefers the longest host/path prefix', () => {
    expect(resolveHost(index, 'api.acme.com', '/payments/v1')).toBe('payments');
    expect(resolveHost(index, 'api.acme.com', '/catalog')).toBe('gateway');
  });

  it('does not match partial path segments', () => {
    expect(resolveHost(index, 'api.acme.com', '/paymentsx')).toBe('gateway');
  });

  it('is case-insensitive', () => {
    expect(resolveHost(index, 'PAYMENTS.acme.internal', '')).toBe('payments');
  });

  it('falls back to service id as host (compose)', () => {
    expect(resolveHost(index, 'orders-api', '')).toBe('orders-api');
  });

  it('returns null for unknown hosts', () => {
    expect(resolveHost(index, 'localhost', '')).toBeNull();
  });
});
