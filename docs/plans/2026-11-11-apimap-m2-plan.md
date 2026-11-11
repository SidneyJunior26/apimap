# apimap M2 — Plano de implementação

**Objetivo:** descoberta automática. `apimap scan` lê repositórios, encontra URLs/hosts em configs, casa com serviços do catálogo e grava arestas `confirmed` nos YAML sem destruir edições manuais. Skills para agentes de IA completam com arestas `inferred`.

**Arquitetura:** novo pacote `@apimap/scanners` (scanners puros: arquivos → achados). `@apimap/core` ganha resolução host→serviço, merge e escrita YAML preservando comentários. CLI ganha `scan` e `link`.

**Spec:** `docs/plans/2026-11-11-apimap-design.md` (seções Modelo de dados, Regras de merge, Descoberta, Roadmap M2).

## Restrições globais

- Scanner **nunca grava URL completa** nem credenciais: só host (+ path para casar) e evidência `arquivo:linha`.
- Arquivos `.env` reais não são lidos; apenas `.env.example`, `.env.sample`, `.env.template`, `.env.development`.
- Ignorados sempre: `node_modules`, `dist`, `build`, `bin`, `obj`, `.git`, `vendor`, lockfiles.
- Merge: entradas `origin: scan` são substituídas a cada scan; `agent`/`manual` nunca são alteradas; `locked: true` congela o serviço inteiro.
- Escrita YAML via `yaml` Document API: comentários e ordem de chaves existentes preservados.
- Texto de README, commits e PR em português; código e saída da CLI em inglês.

## Foco de revisão

1. URL com credencial (`https://user:pass@host`) — catálogo e relatório não contêm `user`/`pass`.
2. Serviço `locked: true` — scan não altera o arquivo (bytes idênticos).
3. Comentário em dependência manual — sobrevive ao rescan.
4. Rescan sem mudanças no repo — nenhum arquivo reescrito (idempotente).
5. Host referenciado pelo próprio serviço (self) — não vira aresta.

---

### Tarefa 1: Resolução host → serviço (core)

**Arquivos:** `packages/core/src/resolve.ts`, `packages/core/test/resolve.test.ts`

**Interfaces produzidas:**
- `parseEndpoint(raw: string): { protocol: string; host: string; path: string } | null` — aceita `scheme://[cred@]host[:port]/path`; protocolo: `http(s)`→`http`, `ws(s)`→`ws`, `ftp/sftp`→`ftp`, `amqp(s)`→`amqp`, `kafka`→`kafka`, `grpc(s)`→`grpc`; path terminado em `.svc`/`.asmx` ou query `wsdl` → `soap`. Descarta credenciais e porta do host.
- `buildHostIndex(services: Service[]): HostIndex` e `resolveHost(index, host: string, path: string): string | null` — casa por `hosts` (entrada `host` ou `host/prefixo`, maior prefixo vence, sem diferenciar maiúsculas) e, se nada casar, por `id === host` (nomes de serviço em docker-compose).

**Testes:** credenciais removidas; porta removida; `.svc` vira soap; `api.acme.com/payments/v1` casa `api.acme.com/payments` antes de `api.acme.com`; host igual a id casa; `localhost` não casa nada.

### Tarefa 2: Merge e escrita YAML (core)

**Arquivos:** `packages/core/src/merge.ts`, `packages/core/src/write.ts`, testes correspondentes.

**Interfaces produzidas:**
- `ScanHints = { name?; kind?; description?; tech: string[]; hosts: string[]; repo? }`
- `ScannedDependency = Dependency & { origin: 'scan' }`
- `mergeScan(existing: Service | undefined, id: string, hints: ScanHints, deps: ScannedDependency[]): { service: Service; added: string[]; removed: string[]; changed: boolean }` — novo serviço: criado a partir das dicas (kind padrão `core`, nome = id). Existente: só preenche campos vazios; `tech` e `hosts` viram união; substitui entradas `scan`; ignora dep `scan` cujo `target+protocol` já existe como `agent`/`manual`. `locked` → `changed: false`. Chaves de aresta no formato `target:protocol`.
- `writeServiceFile(file: string, service: Service): Promise<boolean>` — se arquivo existe, aplica diferenças no Document (reaproveitando nós das deps não-scan); só grava se o conteúdo mudou; retorna se gravou. Arquivo novo leva cabeçalho `# yaml-language-server: $schema=...` relativo.

**Testes:** Foco 2, 3 e 4; dep manual com mesmo alvo bloqueia duplicata scan; dep scan removida aparece em `removed`; união de hosts sem duplicar.

### Tarefa 3: Pacote de scanners — base, URLs genéricas e Node

**Arquivos:** `packages/scanners/src/{types.ts, files.ts, generic.ts, node.ts, index.ts}`, fixtures `packages/scanners/test/fixtures/repos/*`.

**Interfaces produzidas:**
- `RepoFiles = { dir: string; name: string; list(): string[]; read(rel: string): Promise<string> }` e `openRepo(dir: string): Promise<RepoFiles>` (respeita ignorados globais).
- `Reference = { protocol: string; host: string; path: string; evidence: Evidence }`
- `RepoScan = { hints: ScanHints; references: Reference[]; declared?: Service; errors: Array<{ file: string; message: string }> }`
- `Scanner = { name: string; scan(repo: RepoFiles, acc: RepoScan): Promise<void> }`
- `scanRepo(dir: string, scanners?: Scanner[]): Promise<RepoScan>` — roda todos, erro por arquivo vira `errors` sem abortar.
- `generic`: arquivos `*.{json,yaml,yml,xml,config,properties,toml}` + `.env.*` permitidos; extrai endpoints com `parseEndpoint` e linha.
- `node`: `package.json` → `name`, `description`, tech (`react`, `next`, `vue`, `angular`, `express`, `fastify`, `nestjs`, `socket.io`, `apollo`) e kind sugerido (`web` para frameworks front, `websocket` para socket.io, `graphql` para apollo-server).

**Testes:** fixture `storefront-bff` (Node + `.env.example` + `.env` com segredo que não pode ser lido); Foco 1.

### Tarefa 4: Scanners .NET, OpenAPI, docker-compose e manifesto federado

**Arquivos:** `packages/scanners/src/{dotnet.ts, openapi.ts, compose.ts, manifest.ts}`.

- `dotnet`: `*.csproj` → tech `dotnetN`/`dotnet-framework`, pacotes (`Grpc.*`→`grpc`, `Refit`, `MassTransit`/`RabbitMQ.Client`→`rabbitmq`, `Confluent.Kafka`→`kafka`); connection strings (`Server=`/`Data Source=`/`Host=`) em `appsettings*.json`/`Web.config` → referência `sql`; `Connected Services/**` e `*.svcmap`/`*.wsdl` com endpoint → `soap`; projeto com `*.svc` → kind `webservice`; `Worker` SDK → kind `worker`.
- `openapi`: `openapi*.{yaml,yml,json}`, `swagger*.json` → `name` (info.title), `description`, `hosts` a partir de `servers[].url` (dicas do próprio serviço, não referências).
- `compose`: `docker-compose*.yml`/`compose*.yml` → `depends_on` vira referência `http` para o nome do serviço compose; imagens conhecidas (`postgres`, `mysql`, `mssql`, `mongo`, `redis` → `sql`/`redis`; `rabbitmq` → `amqp`; `kafka` → `kafka`).
- `manifest`: `apimap.yaml` na raiz do repo → `declared` (serviço parcial validado com `ServiceSchema.partial()`); campos declarados prevalecem; deps declaradas entram como `origin: scan` com a `confidence` declarada (padrão `manual`).
- Inferência de kind por nome do repo quando nenhum scanner sugeriu: contém `bff` → `bff`, `worker` → `worker`, `web`/`portal`/`app` → `web`.
- Referência para o próprio serviço é descartada (Foco 5).

**Testes:** fixtures `orders-api` (.NET + connection string + Connected Service SOAP), `catalog-api` (OpenAPI), `platform` (compose), `billing-ws` (`.svc`), `partner-gateway` (com `apimap.yaml`).

### Tarefa 5: CLI `scan` e `link`

**Arquivos:** `packages/cli/src/commands/{scan.ts, link.ts}`, `packages/cli/test/scan.test.ts`.

- `apimap scan [dir] [--source <glob>...] [--dry-run] [--create-stubs]` — fontes = `--source` ou `config.sources` (globs relativos ao catálogo; cada diretório = um repo). Id do serviço: serviço com `repo` terminando no nome do diretório, senão slug do nome do diretório. Resolve referências; não resolvidas listadas por host; `--create-stubs` cria serviço `external` para hosts não resolvidos (id = host sem `www.`/`api.`, pontos→hífens). Relatório: serviços novos/alterados/inalterados, arestas `+`/`-`, hosts não resolvidos, erros por arquivo. `--dry-run` não grava. Sem fontes → erro claro, exit 1. Ao final roda validação e imprime resumo.
- `apimap link <dir> <source> <target> [--protocol http] [--confidence inferred] [--origin agent] [--evidence arquivo:linha]... [--note texto]` — adiciona/atualiza uma dependência preservando comentários (usado pelas skills). Serviço inexistente → exit 1.
- Interfaces: `runScan(dir, opts): Promise<number>`, `runLink(dir, source, target, opts): Promise<number>`.

**Testes:** scan sobre catálogo temporário + fixtures cria serviços e arestas; segundo scan não grava nada; `--dry-run` não grava; `link` adiciona dep e mantém comentário existente.

### Tarefa 6: Skills, documentação e demo

**Arquivos:** `skills/apimap-discover/SKILL.md`, `skills/apimap-add/SKILL.md`, `README.md` (traduzido para português + seção de descoberta), `examples/acme-demo/README.md`.

- `apimap-discover`: rodar `apimap scan`; ler código cliente (HttpClient/Refit, fetch/axios, WCF/SOAP, SignalR/WebSocket, produtores/consumidores de fila, FTP, connection strings); para cada achado não coberto, `apimap link ... --confidence inferred --origin agent --evidence arquivo:linha`; nunca registrar URL completa ou segredo; terminar com `apimap validate`.
- `apimap-add`: conversa curta para criar `services/<id>.yaml` válido (id, nome, kind, grupo, owner, hosts, dependências) e validar.
- Skills em Markdown neutro (frontmatter `name`/`description`), utilizáveis por qualquer agente.

**Verificação final:** `pnpm test`, `pnpm -r typecheck`, `pnpm build`, `pnpm --filter @apimap/web e2e`, e `apimap scan --dry-run` sobre as fixtures com relatório coerente.
