import path from 'node:path';
import { parse } from 'yaml';
import { lineAt } from './files.js';
import type { Scanner } from './types.js';

const COMPOSE_FILE = /^(docker-)?compose[^/]*\.ya?ml$/i;

const IMAGE_PROTOCOLS: Array<[RegExp, string]> = [
  [/(^|\/)(postgres|mysql|mariadb|mssql|sqlserver|oracle|cockroach)/i, 'sql'],
  [/(^|\/)mongo/i, 'mongodb'],
  [/(^|\/)(redis|valkey)/i, 'redis'],
  [/(^|\/)rabbitmq/i, 'amqp'],
  [/(^|\/)(kafka|redpanda|cp-kafka)/i, 'kafka'],
  [/(^|\/)(elasticsearch|opensearch)/i, 'http'],
];

interface ComposeService {
  build?: unknown;
  image?: string;
  depends_on?: string[] | Record<string, unknown>;
}

const protocolFor = (image: string | undefined): string =>
  IMAGE_PROTOCOLS.find(([re]) => image && re.test(image))?.[1] ?? 'http';

/** docker-compose: services built from this repo depend on the services listed in depends_on. */
export const composeScanner: Scanner = {
  name: 'compose',
  async scan(repo, acc) {
    for (const file of repo.list().filter((f) => COMPOSE_FILE.test(path.posix.basename(f)))) {
      const text = await repo.read(file);
      let doc: { services?: Record<string, ComposeService> };
      try {
        doc = (parse(text) ?? {}) as typeof doc;
      } catch (err) {
        acc.errors.push({ file, message: err instanceof Error ? err.message : String(err) });
        continue;
      }
      const services = doc.services ?? {};
      const built = Object.keys(services).filter((name) => services[name]?.build !== undefined);
      const own = new Set(built.length ? built : Object.keys(services));
      for (const name of own) {
        const deps = services[name]?.depends_on;
        const targets = Array.isArray(deps) ? deps : Object.keys(deps ?? {});
        const section = text.indexOf('depends_on', text.indexOf(`${name}:`));
        for (const target of targets) {
          if (own.has(target)) continue;
          const at = text.indexOf(target, Math.max(section, 0));
          acc.references.push({
            protocol: protocolFor(services[target]?.image),
            host: target.toLowerCase(),
            path: '',
            evidence: { file, line: lineAt(text, at < 0 ? 0 : at) },
          });
        }
      }
    }
  },
};
