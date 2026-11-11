import type { Scanner } from './types.js';

const TECH: Record<string, string> = {
  react: 'react', next: 'nextjs', vue: 'vue', nuxt: 'nuxt', '@angular/core': 'angular', svelte: 'svelte',
  express: 'express', fastify: 'fastify', '@nestjs/core': 'nestjs', koa: 'koa', hono: 'hono',
  'socket.io': 'socket.io', ws: 'ws', '@apollo/server': 'apollo', 'apollo-server': 'apollo', graphql: 'graphql',
  '@grpc/grpc-js': 'grpc', amqplib: 'rabbitmq', kafkajs: 'kafka',
};
const FRONTEND = new Set(['react', 'nextjs', 'vue', 'nuxt', 'angular', 'svelte']);

/** Reads the root package.json: name, description, tech stack and a suggested kind. */
export const nodeScanner: Scanner = {
  name: 'node',
  async scan(repo, acc) {
    if (!repo.list().includes('package.json')) return;
    let pkg: {
      name?: string;
      description?: string;
      dependencies?: Record<string, string>;
    };
    try {
      pkg = JSON.parse(await repo.read('package.json')) as typeof pkg;
    } catch (err) {
      acc.errors.push({ file: 'package.json', message: err instanceof Error ? err.message : String(err) });
      return;
    }
    if (pkg.name && !acc.hints.name) acc.hints.name = pkg.name.replace(/^@[^/]+\//, '');
    if (pkg.description && !acc.hints.description) acc.hints.description = pkg.description;
    const deps = Object.keys({ ...pkg.dependencies });
    const tech = ['node', ...deps.map((d) => TECH[d]).filter((t): t is string => Boolean(t))];
    acc.hints.tech.push(...tech);
    if (!acc.hints.kind) {
      if (tech.includes('apollo')) acc.hints.kind = 'graphql';
      else if (tech.includes('socket.io')) acc.hints.kind = 'websocket';
      else if (tech.some((t) => FRONTEND.has(t))) acc.hints.kind = 'web';
    }
  },
};
