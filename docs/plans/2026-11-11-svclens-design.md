# svclens — Mapa mental de APIs como grafo (open source)

> O projeto nasceu com o nome provisório `apimap`. Antes da primeira publicação foi renomeado para `svclens`, porque o nome antigo já tinha sido usado e despublicado no npm, era parecido com `api-map` (o npm recusa nomes assim) e confundia com outros projetos.

## Contexto

Times com muitas APIs (BFFs, APIs core, web, workers, webservices SOAP, websockets, gRPC, filas, FTP, sistemas legados, serviços externos) perdem a visão de quem chama quem. Objetivo: ferramenta open source, genérica para qualquer empresa, que monta mapa mental das APIs como grafo interativo — sidebar com busca, detalhe do nó, filtros por categoria, legenda por tipo, aresta sólida = confirmada no código, tracejada = inferida — com visual caprichado: animações, fundo e cores.

Decisões de design:
1. **Fonte da verdade = arquivos YAML no Git** (graph-as-code, sem backend).
2. **Descoberta híbrida**: CLI determinístico (arestas `confirmed`) + skill de agente IA (arestas `inferred` com evidência).
3. **Visual: 2D WebGL padrão + toggle 3D** (modo apresentação).
4. **Edição**: MVP local (`svclens serve` grava YAML); v2 site publicado abre PR.
5. **Multi-repo**: repo central + federação opcional (`svclens.yaml` em cada repo).
6. **Stack**: TypeScript monorepo pnpm.

Importante: dataset de exemplo **fictício** (`acme-demo`). Nada de dados reais de empresas no repo público.

## Arquitetura

```
svclens/                         (repositório)
  packages/
    core/       schema Zod, load/merge/validate, modelo de grafo (graphology), JSON Schema exportado
    scanners/   plugins: openapi, dotnet (appsettings*.json, HttpClient/Refit config), node (.env, axios baseURL), docker-compose, k8s, generic-url
    cli/        svclens init | scan | validate | serve | build
    web/        Vite + React; 2D Sigma.js; 3D 3d-force-graph; editor (modo serve)
  skills/
    svclens-discover/SKILL.md    (análise profunda por agente, agnóstico de ferramenta de IA)
    svclens-add/SKILL.md         (cadastrar serviço conversando)
  examples/acme-demo/           catálogo fictício ~40 serviços cobrindo todos tipos
  docs/  .github/workflows/  LICENSE (MIT)
```

Fluxo: `scan`/skill/UI escrevem `services/*.yaml` → `validate` → `build` gera `graph.json` + site estático (GitHub Pages) ou `serve` sobe UI local com edição.

## Modelo de dados (core)

`svclens.config.yaml`:
- `sources`: globs locais (`../repos/*`), v2 git URLs.
- `kinds`: tipos customizáveis com `label`, `color`, `icon`, `shape`. Defaults: `bff, core, web, worker, webservice, websocket, grpc, graphql, queue, database, ftp, logs, external, legacy`. Empresa pode adicionar `delphi` etc.
- `groups`/domínios opcionais (cluster visual).

`services/<id>.yaml`:
```yaml
id: payments-core
name: Payments Core API
kind: core
group: financeiro
owner: time-pagamentos
repo: github.com/acme/payments-core
tech: [dotnet8]
hosts: [payments.acme.internal, api.acme.com/payments]   # resolve URL -> serviço
description: ...
tags: []
dependsOn:
  - target: identity-api
    protocol: http          # http|soap|ws|grpc|graphql|amqp|kafka|sql|ftp|...
    confidence: confirmed   # confirmed|inferred|manual
    origin: scan            # scan|agent|manual
    evidence: [{ file: src/Clients/IdentityClient.cs, line: 42 }]
    note: valida token
```

Regras de merge (rescan): só atualiza entradas da mesma `origin`; `manual` nunca sobrescrito; campo `locked: true` congela serviço. Aresta `scan` não encontrada no rescan → removida e listada no relatório. Target desconhecido → nó "fantasma" (warning, render tracejado) ou stub `external` auto-criado se host externo. YAML editado via `yaml` Document API preservando comentários.

## Descoberta

- **CLI determinístico**: lê configs, extrai URLs/hosts, casa com `hosts` dos serviços → aresta `confirmed`. OpenAPI vira metadados/endpoints. Falha por arquivo não fatal; relatório final (novos, removidos, não resolvidos).
- **Skill `svclens-discover`**: instrui agente a rodar `svclens scan` primeiro, depois ler código (HttpClient, fetch/axios, WSDL/SOAP, SignalR/ws, produtores/consumidores de fila, FTP, connection strings), escrever `dependsOn` com `confidence: inferred` + `evidence`, e terminar com `svclens validate`.

## Web (visual)

- Layout inspirado no atual, refinado: canvas full-bleed, painel lateral glass (busca fuzzy, detalhe do nó, filtros por kind/grupo/confiança com contagem, legenda), toolbar flutuante (2D/3D, tema, fit, export PNG).
- **2D (padrão)**: Sigma.js + graphology + ForceAtlas2 em worker. Nó com glow colorido por kind, halo suave por grupo, arestas com partículas animadas no sentido da chamada, sólida=confirmed / tracejada=inferred.
- **3D**: 3d-force-graph + UnrealBloom, `linkDirectionalParticles`, câmera orbital animada ao focar nó.
- **Fundo**: gradiente mesh animado lento + grid de pontos sutil + noise; temas `nebula` (escuro) e `paper` (claro). Respeita `prefers-reduced-motion`.
- **Interações**: hover destaca vizinhança e esmaece resto; clique foca com animação de câmera; upstream/downstream ("quem depende de X" / "X depende de quem") com profundidade configurável.
- **Editor (só `serve`)**: drawer com formulário criar/editar/excluir serviço e dependências; servidor Hono local (GET /graph, PUT/DELETE /services/:id); file watcher + SSE recarrega UI quando YAML muda no disco.

## Erros

Zod valida tudo com mensagens `arquivo:caminho`. Erros (bloqueiam build): id duplicado, kind inexistente, YAML inválido. Warnings: target não resolvido, serviço sem owner, evidência apontando arquivo inexistente. `svclens validate --strict` transforma warnings em erro (CI).

## Roadmap

- **M1** core + schema + `validate`/`build` + web 2D read-only + `acme-demo`.
- **M2** scanners (openapi, dotnet, node, compose, generic-url) + `scan` com merge + skills.
- **M3** `serve` com editor CRUD + watcher.
- **M4** modo 3D, temas, polish de animação, export PNG.
- **M5** botão "Propor mudança" (PR GitHub/GitLab), sources git federados, export Mermaid, diff entre versões.

## Primeiros passos de execução

1. Criar o repositório `svclens` e inicializar o git.
2. Gravar este design em `docs/plans/2026-11-11-svclens-design.md` e commitar.
3. Gerar plano de implementação detalhado de M1 (`docs/plans/2026-11-11-svclens-m1-plan.md`) e executar.

## Verificação

- `pnpm test` (vitest): schema, merge, resolução host→serviço; scanners com fixtures em `packages/scanners/__fixtures__` + snapshots.
- `pnpm svclens validate examples/acme-demo` sem erros; `svclens build` gera site; abrir e conferir render 2D/3D, filtros, busca, foco.
- Playwright smoke: carrega grafo, filtra kind, abre detalhe, (M3) cria/edita/exclui serviço e verifica YAML no disco.
- CI GitHub Actions: lint, typecheck, test, build demo, deploy demo no GitHub Pages.
