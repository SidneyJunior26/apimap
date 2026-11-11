import { Command } from 'commander';
import { runBuild, runLink, runScan, runServe, runValidate } from './index.js';

const program = new Command('apimap').description('Map your APIs as an interactive graph').version('0.1.0');

program
  .command('validate')
  .description('check catalog files for errors and warnings')
  .argument('[dir]', 'catalog directory', '.')
  .option('--strict', 'treat warnings as errors')
  .action(async (dir: string, opts: { strict?: boolean }) => {
    process.exitCode = await runValidate(dir, opts);
  });

program
  .command('build')
  .description('generate the static graph site')
  .argument('[dir]', 'catalog directory', '.')
  .option('-o, --out <dir>', 'output directory (default: <dir>/dist)')
  .option('--web-dist <dir>', 'use a custom web viewer build')
  .action(async (dir: string, opts: { out?: string; webDist?: string }) => {
    process.exitCode = await runBuild(dir, opts);
  });

const collect = (value: string, previous: string[] = []) => [...previous, value];

program
  .command('scan')
  .description('discover services and dependencies from repositories')
  .argument('[dir]', 'catalog directory', '.')
  .option('-s, --source <glob>', 'repository directory glob (repeatable; default: sources in apimap.config.yaml)', collect)
  .option('--dry-run', 'show what would change without writing')
  .option('--create-stubs', 'create external services for unresolved hosts outside the internal domains')
  .option('-i, --internal-domain <domain>', 'internal domain, e.g. acme.internal or *.corp.example (repeatable; adds to scan.internalDomains)', collect)
  .action(async (dir: string, opts: { source?: string[]; dryRun?: boolean; createStubs?: boolean; internalDomain?: string[] }) => {
    process.exitCode = await runScan(dir, opts);
  });

program
  .command('link')
  .description('add or update one dependency (used by AI agent skills)')
  .argument('<source>', 'service id that makes the call')
  .argument('<target>', 'service id being called')
  .option('-d, --dir <dir>', 'catalog directory', '.')
  .option('-p, --protocol <protocol>', 'http, soap, ws, grpc, graphql, amqp, kafka, sql, ftp...', 'http')
  .option('-c, --confidence <level>', 'confirmed, inferred or manual', 'inferred')
  .option('-o, --origin <origin>', 'scan, agent or manual', 'agent')
  .option('-e, --evidence <file:line>', 'where the call is made (repeatable)', collect)
  .option('-n, --note <text>', 'short note')
  .action(async (source: string, target: string, opts: { dir: string; protocol: string; confidence: string; origin: string; evidence?: string[]; note?: string }) => {
    process.exitCode = await runLink(opts.dir, source, target, opts);
  });

program
  .command('serve')
  .description('open the local editor: browse, create, edit and delete services')
  .argument('[dir]', 'catalog directory', '.')
  .option('-p, --port <port>', 'port to listen on (localhost only)', (v) => Number(v), 4321)
  .option('--open', 'open the browser')
  .option('--web-dist <dir>', 'use a custom web viewer build')
  .action(async (dir: string, opts: { port: number; open?: boolean; webDist?: string }) => {
    const code = await runServe(dir, opts);
    if (code !== 0) process.exitCode = code;
  });

program.parseAsync().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
