# apimap

Mapa mental das suas APIs como grafo interativo — BFFs, APIs core, aplicações web, workers, webservices SOAP, websockets, gRPC, filas, bancos de dados, FTP, sistemas legados e serviços externos — a partir de arquivos YAML versionados no Git.

- **Grafo como código:** um arquivo YAML por serviço, revisado em pull request como qualquer outra mudança.
- **Descoberta automática:** `apimap scan` lê os repositórios (configs, OpenAPI, .NET, Node, docker-compose) e registra as dependências encontradas, sem apagar o que foi cadastrado à mão.
- **Saiba o que é comprovado:** toda ligação é `confirmed` (encontrada em código/config), `inferred` ou `manual`, com evidência `arquivo:linha`.
- **Feito para ser visto:** nós com brilho em WebGL, partículas fluindo no sentido da chamada, halos por grupo e visão de impacto upstream/downstream.
- **Saída estática:** `apimap build` gera um site autocontido que pode ser hospedado em qualquer lugar (GitHub Pages, S3, servidor interno).

## Início rápido

```bash
git clone https://github.com/SidneyJunior26/apimap.git
cd apimap
pnpm install
pnpm build
pnpm apimap validate examples/acme-demo
pnpm apimap build examples/acme-demo   # gera examples/acme-demo/dist
```

Abra `examples/acme-demo/dist` com qualquer servidor estático, por exemplo `npx serve examples/acme-demo/dist`.

## Estrutura do catálogo

```
meu-catalogo/
  apimap.config.yaml      # opcional: nome, fontes, tipos e grupos
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

Alvos que não existem no catálogo aparecem como nós "fantasma" tracejados, para que nada seja descartado em silêncio. Adicione `# yaml-language-server: $schema=https://raw.githubusercontent.com/SidneyJunior26/apimap/main/packages/core/schema/service.schema.json` no topo do arquivo para ter autocompletar no editor.

### Tipos (kinds)

Nativos: `bff`, `core`, `web`, `worker`, `webservice`, `websocket`, `grpc`, `graphql`, `queue`, `database`, `ftp`, `logs`, `external`, `legacy`. Crie os seus ou mude as cores:

```yaml
# apimap.config.yaml
name: Acme API Map
sources:
  - ../repos/*            # cada diretório é um repositório a ser escaneado
kinds:
  delphi: { label: Delphi app, color: '#fb7185' }
groups:
  payments: { label: Pagamentos, color: '#facc15' }
```

## Descoberta automática

```bash
apimap scan meu-catalogo                       # usa "sources" do apimap.config.yaml
apimap scan meu-catalogo -s '../repos/*' --dry-run
```

O que o scanner lê:

| Fonte | O que extrai |
| --- | --- |
| Configs (`*.json`, `*.yaml`, `*.xml`, `*.config`, `.env.example`…) | URLs `http`, `ws`, `amqp`, `kafka`, `grpc`, `ftp`; `.svc`/`.asmx`/`?wsdl` viram `soap` |
| .NET (`*.csproj`, `appsettings*.json`, `Web.config`) | framework, pacotes (Refit, RabbitMQ, Kafka, gRPC…), tipo (worker, webservice), hosts de connection strings (`sql`) |
| Node (`package.json`) | nome, descrição, stack e tipo sugerido |
| OpenAPI/Swagger | nome, descrição e hosts do próprio serviço |
| docker-compose | `depends_on` dos serviços construídos pelo repositório |
| `apimap.yaml` na raiz do repo | descrição declarada pelo dono do serviço (prevalece sobre o scan) |

Como o scan atualiza o catálogo:

- Cada URL é casada com o campo `hosts` dos serviços (maior prefixo `host/caminho` vence) ou com o `id` (nomes do docker-compose).
- Só entradas com `origin: scan` são substituídas; `agent` e `manual` nunca são alteradas. `locked: true` congela o serviço.
- Comentários e formatação dos YAML são preservados; rodar o scan de novo sem mudanças não reescreve nada.
- Hosts sem dono aparecem no relatório. `--create-stubs` cria serviços `external` para eles (revise o `kind` depois).
- URLs completas, credenciais e arquivos `.env` reais nunca são gravados nem lidos — só host e evidência `arquivo:linha`.

### Skills para agentes de IA

A pasta [`skills/`](skills) traz instruções prontas para agentes de código:

- [`apimap-discover`](skills/apimap-discover/SKILL.md): roda o scan, lê o código atrás de chamadas que configs não mostram (HttpClient, fetch/axios, WCF, SignalR, filas…) e registra com `apimap link` como `inferred`, com evidência.
- [`apimap-add`](skills/apimap-add/SKILL.md): cadastra um serviço novo por conversa e valida.

## CLI

| Comando | O que faz |
| --- | --- |
| `apimap validate [dir] [--strict]` | Valida schema, ids duplicados, tipos desconhecidos, alvos sem cadastro e serviços sem owner. `--strict` falha em warnings. |
| `apimap build [dir] [-o saida]` | Valida e gera o visualizador + `graph.json` em `saida` (padrão `<dir>/dist`). |
| `apimap scan [dir] [-s glob] [--dry-run] [--create-stubs]` | Descobre serviços e dependências nos repositórios e atualiza o catálogo. |
| `apimap link <origem> <alvo> [-d dir] [-p protocolo] [-c confiança] [-e arquivo:linha] [-n nota]` | Adiciona ou atualiza uma dependência preservando comentários (usado pelas skills). |

## Desenvolvimento

```bash
pnpm test                                # testes unitários (Vitest)
pnpm -r typecheck
pnpm --filter @apimap/web dev:demo       # visualizador com hot reload no catálogo de demonstração
pnpm --filter @apimap/web e2e            # testes de ponta a ponta (Playwright)
```

Pacotes: `@apimap/core` (schema, carga, validação, grafo, merge), `@apimap/scanners` (descoberta), `apimap` (CLI), `@apimap/web` (visualizador).

## Roadmap

- **M1** ✅ — catálogo YAML, validação, site estático e grafo 2D
- **M2** ✅ — `apimap scan` (configs, OpenAPI, .NET, Node, docker-compose) e skills para agentes de IA
- **M3** — `apimap serve` com editor para criar, editar e excluir serviços localmente
- **M4** — modo 3D para apresentações, tema claro, exportar PNG
- **M5** — "Propor mudança" via pull request a partir do site publicado, catálogos federados, exportar Mermaid

## Licença

[MIT](LICENSE)
