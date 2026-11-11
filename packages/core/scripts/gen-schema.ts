import { mkdir, writeFile } from 'node:fs/promises';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ConfigSchema, ServiceSchema } from '../src/schema.js';

const outDir = new URL('../schema/', import.meta.url);
await mkdir(outDir, { recursive: true });

const write = (name: string, schema: object) =>
  writeFile(new URL(name, outDir), `${JSON.stringify(schema, null, 2)}\n`);

await write('service.schema.json', zodToJsonSchema(ServiceSchema, { name: 'Service', $refStrategy: 'none' }));
await write('config.schema.json', zodToJsonSchema(ConfigSchema, { name: 'Config', $refStrategy: 'none' }));
