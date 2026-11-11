import { Command } from 'commander';
import { runBuild, runValidate } from './index.js';

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

program.parseAsync().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
