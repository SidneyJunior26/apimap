# apimap

O apimap monta um grafo interativo das APIs de uma empresa e de como elas se chamam. Entram no mapa BFFs, APIs core, aplicações web, workers, webservices SOAP, websockets, gRPC, filas, bancos de dados, FTP, sistemas legados e fornecedores externos. O mapa vem de arquivos YAML guardados no Git, e boa parte deles pode ser gerada lendo o código dos repositórios.

Demonstração com dados fictícios: https://sidneyjunior26.github.io/apimap/

## O problema

Em empresas grandes, o número de serviços cresce mais rápido do que a documentação. Um time cria um BFF novo, outro passa a consumir uma API core por um atalho, um worker começa a ler uma fila que ninguém lembrava que existia, e o webservice SOAP de dez anos atrás continua recebendo chamadas de um sistema em Delphi. Cada mudança faz sentido isolada. Somadas, deixam a empresa sem uma resposta confiável para perguntas simples:

- Se eu mudar o contrato desta API, quem quebra?
- Este fornecedor ficou fora do ar. Quais sistemas param junto?
- Ainda tem alguém chamando o serviço que queremos desligar?
- Por onde passa uma requisição do app até o banco de dados?

Normalmente quem responde é alguém que está há anos na empresa, ou um diagrama no wiki que ficou desatualizado na semana seguinte. Ferramentas de observabilidade mostram o tráfego que aconteceu, mas não cobrem o que roda uma vez por mês, o que está em homologação ou o que só aparece numa connection string.

O apimap guarda essa informação junto do código, num formato que dá para revisar em pull request, e mostra cada ligação com a evidência de onde ela foi encontrada.

## Como funciona

Cada serviço é um arquivo YAML em `services/`. As dependências ficam no próprio arquivo e cada uma diz de onde veio: `confirmed` quando foi encontrada em código ou configuração, `inferred` quando um agente de IA deduziu lendo o código, `manual` quando alguém cadastrou. Sempre que possível, a dependência aponta o `arquivo:linha` em que aparece.

O comando `apimap scan` lê os repositórios e atualiza esses arquivos. Ele não apaga nem altera o que foi cadastrado à mão. Para cadastrar ou corrigir serviços sem abrir o YAML, use `apimap serve`, que sobe um editor local. O comando `apimap build` transforma o catálogo num site estático que pode ficar no GitHub Pages, num bucket S3 ou num servidor interno.

No visualizador, cada tipo de serviço tem uma cor. Partículas andam pelas arestas no sentido da chamada, os grupos (domínios) ganham uma área própria e, ao clicar num serviço, dá para ver quem depende dele (upstream) e do que ele depende (downstream), com a profundidade que você escolher.

### 3D, tema claro e imagem

A barra no canto inferior esquerdo tem três botões além do zoom. "3D" troca para uma visão em três dimensões, pensada para apresentações: os serviços viram esferas com brilho, a câmera gira com o mouse e voa até o serviço selecionado. Filtros, busca e upstream/downstream continuam valendo. O código do 3D só é baixado quando alguém abre esse modo.

"Light" e "Dark" alternam entre o tema escuro e um tema claro em tom de papel, em que as cores dos tipos ficam mais escuras para manter o contraste. "PNG" baixa a visão atual como imagem, com o fundo do tema e o nome do catálogo no rodapé.

O modo e o tema ficam na URL (`?view=3d&theme=paper`), então um link compartilhado abre do mesmo jeito. Sem parâmetros, o tema segue a preferência do sistema. Se o navegador não tiver WebGL, o 3D avisa e volta para o 2D.

## Início rápido

```bash
git clone https://github.com/SidneyJunior26/apimap.git
cd apimap
pnpm install
pnpm build
pnpm apimap validate examples/acme-demo
pnpm apimap build examples/acme-demo   # gera examples/acme-demo/dist
```

Para abrir o resultado, sirva a pasta com qualquer servidor estático, por exemplo `npx serve examples/acme-demo/dist`.

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

Se uma dependência aponta para um serviço que ainda não está no catálogo, ele aparece no grafo como um nó tracejado ("fantasma"). Assim a ligação não some só porque falta um cadastro.

Para ter autocompletar no editor, coloque esta linha no topo do arquivo:

```yaml
# yaml-language-server: $schema=https://raw.githubusercontent.com/SidneyJunior26/apimap/main/packages/core/schema/service.schema.json
```

### Tipos de serviço

Os tipos nativos são `bff`, `core`, `web`, `worker`, `webservice`, `websocket`, `grpc`, `graphql`, `queue`, `database`, `ftp`, `logs`, `external` e `legacy`. Você pode criar outros e trocar as cores no `apimap.config.yaml`:

```yaml
# apimap.config.yaml
name: Acme API Map
sources:
  - ../repos/*            # cada diretório é um repositório a ser escaneado
scan:
  internalDomains:        # domínios da empresa; hosts neles nunca viram "external"
    - acme.internal       # o próprio domínio e qualquer subdomínio
    - '*.corp.example'    # só subdomínios
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

O scanner procura nestes lugares:

| Fonte | O que extrai |
| --- | --- |
| Arquivos de configuração (`*.json`, `*.yaml`, `*.xml`, `*.config`, `.env.example` etc.) | URLs `http`, `ws`, `amqp`, `kafka`, `grpc` e `ftp`. Endereços terminados em `.svc` ou `.asmx`, ou com `?wsdl`, são marcados como `soap` |
| .NET (`*.csproj`, `appsettings*.json`, `Web.config`) | Versão do framework, pacotes como Refit, RabbitMQ, Kafka e gRPC, se o projeto é worker ou webservice, e o host do banco nas connection strings |
| Node (`package.json`) | Nome, descrição, stack e um tipo sugerido |
| OpenAPI ou Swagger | Nome, descrição e os hosts do próprio serviço |
| docker-compose | O `depends_on` dos serviços construídos a partir do repositório |
| `apimap.yaml` na raiz do repositório | A descrição que o dono do serviço escreveu, que tem prioridade sobre o que o scan encontrou |

Regras de atualização do catálogo:

- Cada URL encontrada é comparada com o campo `hosts` dos serviços. Quando mais de um combina, vence o prefixo `host/caminho` mais longo. Nomes sem domínio, como os do docker-compose, são comparados com o `id`.
- O scan só substitui dependências com `origin: scan`. As de origem `agent` e `manual` ficam como estão, e um serviço com `locked: true` não é alterado.
- Comentários e formatação dos YAML são preservados. Se nada mudou nos repositórios, rodar o scan de novo não reescreve nenhum arquivo.
- Hosts que não pertencem a nenhum serviço aparecem no relatório, separados em internos e externos. Internos são os que estão em `scan.internalDomains` (ou na opção `--internal-domain`, que pode ser repetida) e os nomes sem ponto.
- A opção `--create-stubs` cadastra como `external` os hosts externos sem dono. Hosts internos nunca viram stub: o certo é adicioná-los ao `hosts` do serviço que os atende.
- URLs completas, usuários, senhas e arquivos `.env` reais não são lidos nem gravados. O catálogo guarda só o host e o `arquivo:linha` da evidência.

### Skills para agentes de IA

A pasta [`skills/`](skills) tem instruções prontas para agentes de código:

- [`apimap-discover`](skills/apimap-discover/SKILL.md) roda o scan, procura no código chamadas que a configuração não mostra (HttpClient, fetch, axios, WCF, SignalR, filas) e registra cada uma com `apimap link` como `inferred`, junto com a evidência.
- [`apimap-add`](skills/apimap-add/SKILL.md) cadastra um serviço novo fazendo poucas perguntas e valida o resultado.

## Editor local

```bash
apimap serve meu-catalogo --open
```

O comando abre o visualizador em `http://localhost:4321` com edição ligada. O botão "New service" cria um serviço, e o painel de detalhes ganha "Edit" e "Delete". Um nó fantasma pode ser cadastrado direto pelo botão "Add to catalog". Tudo vai para os YAML de `services/`, com os comentários preservados, e dá para revisar as mudanças com `git diff` antes de abrir o pull request.

Algumas regras do editor:

- Antes de excluir, a confirmação mostra quais serviços dependem daquele. Depois da exclusão, essas ligações passam a apontar para um nó fantasma.
- Editar uma dependência encontrada pelo scan transforma ela em `manual`, para que o próximo scan não desfaça a alteração.
- Serviços com `locked: true` aparecem sem os botões de edição.
- Se um arquivo mudar por fora (no editor de texto ou num `apimap scan`), o navegador atualiza sozinho e os nós que já existiam ficam no lugar.
- O servidor só aceita conexões da própria máquina e recusa pedidos vindos de outros sites.

## CLI

| Comando | O que faz |
| --- | --- |
| `apimap validate [dir] [--strict]` | Confere o schema, ids duplicados, tipos desconhecidos, alvos sem cadastro e serviços sem owner. Com `--strict`, avisos também fazem o comando falhar. |
| `apimap build [dir] [-o saida]` | Valida o catálogo e gera o visualizador com o `graph.json` em `saida` (por padrão, `<dir>/dist`). |
| `apimap scan [dir] [-s glob] [-i domínio] [--dry-run] [--create-stubs]` | Lê os repositórios e atualiza serviços e dependências no catálogo. |
| `apimap link <origem> <alvo> [-d dir] [-p protocolo] [-c confiança] [-e arquivo:linha] [-n nota]` | Adiciona ou atualiza uma dependência sem mexer nos comentários do arquivo. As skills usam este comando. |
| `apimap serve [dir] [-p porta] [--open]` | Abre o editor local para criar, editar e excluir serviços (porta padrão 4321, só para a própria máquina). |

## Desenvolvimento

```bash
pnpm test                                # testes unitários (Vitest)
pnpm -r typecheck
pnpm --filter @apimap/web dev:demo       # visualizador com hot reload usando o catálogo de demonstração
pnpm --filter @apimap/web e2e            # testes de ponta a ponta (Playwright)
```

O repositório tem quatro pacotes: `@apimap/core` (schema, leitura, validação, grafo e merge), `@apimap/scanners` (descoberta), `apimap` (CLI e servidor do editor) e `@apimap/web` (visualizador e editor).

## Roadmap

- M1, concluída: catálogo em YAML, validação, site estático e grafo 2D.
- M2, concluída: `apimap scan` (configuração, OpenAPI, .NET, Node e docker-compose) e skills para agentes de IA.
- M3, concluída: `apimap serve`, com um editor local para criar, editar e excluir serviços.
- M4, concluída: modo 3D para apresentações, tema claro e exportação em PNG.
- M5: botão "Propor mudança" no site publicado, que abre um pull request, catálogos federados e exportação para Mermaid.

## Licença

[MIT](LICENSE)
