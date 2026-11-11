# apimap

Map your APIs as an interactive graph — BFFs, core APIs, web apps, workers, SOAP webservices, websockets, gRPC, queues, databases, FTP drops, legacy apps and external vendors — from plain YAML files that live in Git.

- **Graph as code:** one YAML file per service, reviewed in pull requests like any other change.
- **Know what is proven:** every link is `confirmed` (found in code/config), `inferred` or `manual`, with `file:line` evidence.
- **Built to be looked at:** glowing WebGL nodes, particles flowing in the call direction, group halos, upstream/downstream impact view.
- **Static output:** `apimap build` produces a self-contained site you can host anywhere (GitHub Pages, S3, an internal server).

## Quickstart

```bash
git clone https://github.com/SidneyJunior26/apimap.git
cd apimap
pnpm install
pnpm build
pnpm apimap validate examples/acme-demo
pnpm apimap build examples/acme-demo   # writes examples/acme-demo/dist
```

Open `examples/acme-demo/dist/index.html` through any static server, for example `npx serve examples/acme-demo/dist`.

## Catalog layout

```
my-catalog/
  apimap.config.yaml      # optional: name, custom kinds, groups
  services/
    payments-core.yaml
    identity-api.yaml
```

```yaml
# services/payments-core.yaml
id: payments-core
name: Payments Core API
kind: core
group: payments
owner: team-payments
repo: github.com/acme/payments-core
tech: [dotnet8]
hosts: [payments.acme.internal]
dependsOn:
  - target: identity-api
    protocol: http          # http | soap | ws | grpc | graphql | amqp | kafka | sql | ftp | ...
    confidence: confirmed   # confirmed | inferred | manual
    origin: scan            # scan | agent | manual
    evidence: [{ file: src/Clients/IdentityClient.cs, line: 42 }]
```

Targets that are not in the catalog show up as dashed "ghost" nodes so nothing is silently dropped. Add `# yaml-language-server: $schema=<path>/packages/core/schema/service.schema.json` to the top of a file for editor autocompletion.

### Kinds

Built in: `bff`, `core`, `web`, `worker`, `webservice`, `websocket`, `grpc`, `graphql`, `queue`, `database`, `ftp`, `logs`, `external`, `legacy`. Add your own or recolor existing ones:

```yaml
# apimap.config.yaml
name: Acme API Map
kinds:
  delphi: { label: Delphi app, color: '#fb7185' }
groups:
  payments: { label: Payments, color: '#facc15' }
```

## CLI

| Command | What it does |
| --- | --- |
| `apimap validate [dir] [--strict]` | Checks schema, duplicate ids, unknown kinds, unresolved targets, missing owners. `--strict` fails on warnings. |
| `apimap build [dir] [-o out]` | Validates, then writes the viewer and `graph.json` to `out` (default `<dir>/dist`). |

## Development

```bash
pnpm test                                # unit tests (Vitest)
pnpm -r typecheck
pnpm --filter @apimap/web dev:demo       # viewer with hot reload on the demo catalog
pnpm --filter @apimap/web e2e            # Playwright smoke tests
```

Packages: `@apimap/core` (schema, loader, validation, graph), `apimap` (CLI), `@apimap/web` (viewer).

## Roadmap

- **M2** — `apimap scan` (OpenAPI, .NET, Node, docker-compose) and an AI agent skill for deeper discovery
- **M3** — `apimap serve` with an editor to create, edit and delete services locally
- **M4** — 3D presentation mode, light theme, PNG export
- **M5** — "Propose change" pull requests from the hosted site, federated catalogs, Mermaid export

## License

[MIT](LICENSE)
