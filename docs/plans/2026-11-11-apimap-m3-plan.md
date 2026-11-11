# apimap M3: plano de implementação

Objetivo: `apimap serve` abre o visualizador localmente com um editor para criar, editar e excluir serviços. As mudanças vão direto para os YAML do catálogo, preservando comentários, e o grafo atualiza sozinho quando um arquivo muda no disco.

Arquitetura: a CLI ganha um servidor HTTP (Hono sobre `@hono/node-server`) que serve o visualizador já compilado, expõe uma API JSON sobre o catálogo e avisa o navegador por Server-Sent Events. O visualizador descobre se está em modo de edição consultando a API; sem API, continua somente leitura como no site estático.

Spec: `docs/plans/2026-11-11-apimap-design.md`, seção Web (item Editor) e Roadmap M3.

## Restrições

- O servidor escuta só em `127.0.0.1`. Requisições com `Host` diferente de `localhost`/`127.0.0.1` na porta do servidor são recusadas (403), contra DNS rebinding.
- Rotas que alteram dados exigem `Content-Type: application/json` e, quando o navegador manda `Origin`, ele precisa ser o próprio servidor.
- Toda escrita passa por `ServiceSchema` e por `writeServiceFile` (comentários preservados). O id vem da URL e precisa casar com o corpo; o regex de id impede caminhos como `../x`.
- Serviço `locked: true` não pode ser alterado nem excluído (423).
- Textos da interface seguem em inglês, como no restante do visualizador.

## Foco de revisão

1. Requisição vinda de outro site (Origin diferente) tentando excluir um serviço: recusada.
2. Edição de um serviço com comentários no YAML: comentários continuam no arquivo.
3. Exclusão de um serviço do qual outros dependem: a interface avisa quantos dependem antes de confirmar, e depois disso eles aparecem ligados a um nó fantasma.
4. Arquivo alterado por fora (editor de texto, `apimap scan`): o navegador atualiza sem recarregar a página e sem embaralhar o layout dos nós que já existiam.
5. Dois serviços com o mesmo id: criação recusada com 409.

---

### Tarefa 1: API do servidor

Arquivos: `packages/cli/src/serve/app.ts`, `packages/cli/test/serve.test.ts`.

- `createServeApp(root: string, opts: { webDist: string; port: number }): { app: Hono; notify(): void }`
- `GET /api/graph` responde `{ graph: GraphJson, diagnostics: Diagnostic[], editable: true }`, montado na hora a partir do disco.
- `GET /api/services/:id` responde o serviço com o campo `file`; 404 se não existir.
- `POST /api/services` cria; 409 se o id já existe; 400 com a lista de problemas se o schema falhar. Grava em `services/<id>.yaml`.
- `PUT /api/services/:id` atualiza; 400 se o id do corpo for diferente; 404 se não existir; 423 se `locked`.
- `DELETE /api/services/:id` remove o arquivo; 404 ou 423 conforme o caso; responde quantos serviços apontavam para ele.
- Fora de `/api`, serve os arquivos estáticos do visualizador.
- Testes com `app.request()` cobrindo cada rota, os focos 1, 2 e 5, e Host inválido.

### Tarefa 2: Watcher, SSE e comando `serve`

Arquivos: `packages/cli/src/serve/watch.ts`, `packages/cli/src/commands/serve.ts`, `packages/cli/src/bin.ts`.

- `watchCatalog(root: string, onChange: () => void): () => void` com chokidar sobre `apimap.config.yaml` e `services/`, debounce de 150 ms.
- `GET /api/events` (SSE) envia `event: graph` a cada mudança e um comentário a cada 25 s para manter a conexão.
- `apimap serve [dir] [--port 4321] [--open]` imprime a URL; `--open` abre o navegador.
- Teste do watcher: gravar um arquivo dispara o callback uma vez.

### Tarefa 3: Visualizador em modo de edição

Arquivos: `packages/web/src/data.ts`, `packages/web/src/api.ts`, `packages/web/src/editor/*`, `App.tsx`, `NodeDetail.tsx`, `Sidebar.tsx`, `GraphCanvas.tsx`, `layout.ts`, `theme.css`.

- `loadGraph()` tenta `./api/graph` e, se não houver API, cai para `./graph.json`; devolve `{ graph, editable }`.
- Com `editable`, abre `EventSource('./api/events')` e recarrega o grafo a cada evento.
- Botão "New service" no topo do painel; "Edit" e "Delete" no detalhe do serviço (não aparecem para `locked` nem para nós fantasma; fantasma ganha "Add to catalog", que abre o formulário com o id preenchido).
- Gaveta de edição com id, nome, kind (lista dos kinds), grupo, owner, repo, descrição, hosts, tech, tags e tabela de dependências (alvo com sugestões dos ids existentes, protocolo, confiança, nota; adicionar e remover linhas). Dependências `scan` aparecem marcadas; editar uma delas a transforma em `manual`. Erros do servidor aparecem ao lado do campo.
- Exclusão com `<dialog>` de confirmação informando o arquivo e quantos serviços dependem dele (foco 3).
- Posições preservadas: `toGraphology(g, previous?: Map<string, {x, y}>)` mantém a posição dos nós existentes e coloca os novos perto dos vizinhos; o layout roda por menos tempo quando há posições anteriores (foco 4).
- Testes unitários das funções puras: conversão formulário ⇄ serviço e semeadura de posições.

### Tarefa 4: Testes de ponta a ponta, documentação

- Playwright: copia o catálogo de demonstração para uma pasta temporária, sobe `apimap serve`, cria um serviço pela interface, edita, exclui e confere os YAML no disco; edita um arquivo por fora e confere que o grafo atualizou.
- README: comando `serve` na tabela da CLI e seção curta sobre o editor; roadmap marca a M3 como concluída.
