import { mergeKinds, ServiceSchema, ConfigSchema, type Catalog } from '../src/index.js';

export function makeCatalog(services: Array<Record<string, unknown>>): Catalog {
  return {
    root: '/tmp/x',
    config: ConfigSchema.parse({ name: 'Test' }),
    kinds: mergeKinds({}),
    services: services.map((s) => ({
      ...ServiceSchema.parse({ name: String(s.id), kind: 'core', owner: 'team', ...s }),
      file: `services/${String(s.id)}.yaml`,
    })),
  };
}
