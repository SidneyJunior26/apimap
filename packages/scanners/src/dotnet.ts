import path from 'node:path';
import { lineAt } from './files.js';
import { NOISE_HOSTS } from './generic.js';
import type { Scanner } from './types.js';

const PACKAGES: Array<[RegExp, string]> = [
  [/^Refit/, 'refit'],
  [/^(RabbitMQ\.Client|MassTransit\.RabbitMQ)$/, 'rabbitmq'],
  [/^Confluent\.Kafka$/, 'kafka'],
  [/^Grpc\./, 'grpc'],
  [/^HotChocolate/, 'graphql'],
  [/^Microsoft\.AspNetCore\.SignalR/, 'signalr'],
  [/^Dapper$/, 'dapper'],
  [/^Microsoft\.EntityFrameworkCore/, 'efcore'],
];

const CONNECTION_FILE = /(^|\/)(appsettings[^/]*\.json|web\.config|app\.config)$/i;
/** Host part of ADO.NET-style connection strings. Credentials are never captured. */
const CONNECTION_HOST = /(?:^|[;"'\s])(?:Server|Data Source|Host|Address|Addr)\s*=\s*(?:tcp:)?([A-Za-z0-9_.-]+)/gi;

export function dotnetTech(framework: string): string | null {
  const f = framework.trim().toLowerCase();
  if (/^v?[1-4]\.\d/.test(f)) return 'dotnet-framework';
  const core = /^netcoreapp(\d)/.exec(f);
  if (core) return `dotnetcore${core[1]}`;
  const net = /^net(\d+)\.\d/.exec(f);
  return net ? `dotnet${net[1]}` : null;
}

/** .NET projects: framework, notable packages, kind, and database hosts from connection strings. */
export const dotnetScanner: Scanner = {
  name: 'dotnet',
  async scan(repo, acc) {
    const files = repo.list();
    for (const file of files.filter((f) => f.endsWith('.csproj'))) {
      const xml = await repo.read(file);
      const sdk = /<Project[^>]*Sdk="([^"]+)"/.exec(xml)?.[1] ?? '';
      for (const m of xml.matchAll(/<TargetFrameworks?(?:Version)?>([^<]+)</g)) {
        for (const fw of m[1]!.split(';')) {
          const tech = dotnetTech(fw);
          if (tech) acc.hints.tech.push(tech);
        }
      }
      const packages = [...xml.matchAll(/<PackageReference\s+Include="([^"]+)"/g)].map((m) => m[1]!);
      for (const pkg of packages) for (const [re, tech] of PACKAGES) if (re.test(pkg)) acc.hints.tech.push(tech);
      if (!acc.hints.kind) {
        if (sdk.includes('Worker')) acc.hints.kind = 'worker';
        else if (packages.includes('Grpc.AspNetCore')) acc.hints.kind = 'grpc';
        else if (packages.some((p) => p.startsWith('HotChocolate.AspNetCore'))) acc.hints.kind = 'graphql';
      }
    }
    if (!acc.hints.kind && files.some((f) => /\.(svc|asmx)$/i.test(f))) acc.hints.kind = 'webservice';

    for (const file of files.filter((f) => CONNECTION_FILE.test(path.posix.basename(f)) || CONNECTION_FILE.test(f))) {
      const text = await repo.read(file);
      for (const m of text.matchAll(CONNECTION_HOST)) {
        const host = m[1]!.toLowerCase();
        if (host === '.' || NOISE_HOSTS.has(host)) continue;
        acc.references.push({ protocol: 'sql', host, path: '', evidence: { file, line: lineAt(text, m.index ?? 0) } });
      }
    }
  },
};
