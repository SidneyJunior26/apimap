# svclens M5: plano de implementação

Objetivo: fechar o ciclo de contribuição e integração. Quem vê o site publicado consegue propor uma mudança por pull request, o scan passa a buscar repositórios direto do Git, o catálogo pode ser exportado como diagrama Mermaid e dá para ver o que mudou entre duas versões.

Spec: `docs/plans/2026-11-11-svclens-design.md`, Roadmap M5. Decisão: "Propor mudança" usa links para o GitHub, sem login nem token no site.

## Restrições

- O site publicado continua 100% estático. Nenhum token é pedido, guardado ou enviado.
- Só GitHub para "Propor mudança" nesta etapa; o formato da configuração deixa espaço para outros provedores.
- Fontes git: `git clone --depth 1` com as credenciais git da máquina, URL sempre depois de `--`, URLs começando com `-` recusadas, protocolo `ext::` bloqueado. Cache em `<catálogo>/.svclens/repos/`.
- `svclens diff` lê a versão antiga com `git archive`, sem mexer na árvore de trabalho.
- Código de serialização usado no navegador não pode importar módulos de Node.

## Foco de revisão

1. Nome de serviço com aspas, colchetes ou acentos no Mermaid: o diagrama continua válido.
2. URL de fonte maliciosa (`--upload-pack=...`, `ext::sh -c ...`): recusada antes de chamar o git.
3. Catálogo fora de um repositório git ao rodar `svclens diff`: mensagem clara, sem stack trace.
4. YAML grande na proposta de serviço novo: o link continua abrindo (limite de tamanho tratado com fallback de copiar).
5. Site publicado sem configuração de repositório: botões de proposta não aparecem.

---

### Tarefa 1: Mermaid e diff no core

Arquivos: `packages/core/src/mermaid.ts`, `packages/core/src/diff.ts`, testes.

- `toMermaid(g: GraphJson, opts?: { direction?: 'LR' | 'TB' }): string` — `flowchart`, ids seguros, rótulos escapados, formas por tipo (banco como cilindro, externo como cápsula, fila como subrotina), `-->` confirmada, `-.->` inferida, `==>` manual, protocolo como rótulo quando não é `http`, `subgraph` por grupo, `classDef` com as cores dos tipos.
- `diffGraphs(before: GraphJson, after: GraphJson): GraphDiff` com serviços e ligações adicionados, removidos e alterados (campos e confiança).
- `formatDiff(diff, format: 'text' | 'markdown'): string`.

### Tarefa 2: CLI `export` e `diff`

Arquivos: `packages/cli/src/commands/export.ts`, `packages/cli/src/commands/diff.ts`, `packages/cli/src/git.ts`.

- `svclens export [dir] --format mermaid [-o arquivo]` (saída padrão no terminal).
- `svclens diff [dir] [--base ref] [--format text|markdown]` (base padrão `origin/main`, cai para `main`). Fora de repositório git: erro claro, exit 1.

### Tarefa 3: Fontes git no scan

Arquivos: `packages/cli/src/sources.ts`, `scan.ts`, testes com repositório git local criado no teste.

- Entradas de `sources` que parecem URL git (`https://`, `ssh://`, `git@`, `file://`, terminadas em `.git`) são clonadas no cache; as demais continuam sendo globs locais.
- `--no-fetch` usa o cache sem atualizar. Serviços novos vindos de git ganham `repo` com a URL sem credenciais.

### Tarefa 4: "Propor mudança" no site publicado

Arquivos: `packages/core/src/serialize.ts` (sem Node), `packages/core/src/schema.ts` (config `edit`), `packages/core/src/graph.ts` (`GraphJson.edit`), `packages/cli/src/commands/build.ts` (detecção pelo `git remote`), `packages/web/src/propose/*`, `EditorDrawer.tsx`, `App.tsx`.

- Config `edit: { provider: github, repo: owner/name, branch: main, path: caminho/do/catalogo }`. Sem config, `svclens build` tenta descobrir pelo remote `origin` do GitHub; pode ser desligado com `edit: false`.
- Serviço novo: abre `github.com/<repo>/new/<branch>?filename=...&value=<yaml>`; se o link passar de 7.000 caracteres, copia o YAML e abre a página sem conteúdo.
- Edição: copia o YAML novo e abre `github.com/<repo>/edit/<branch>/<arquivo>`, com instrução de colar.
- Exclusão: abre `github.com/<repo>/delete/<branch>/<arquivo>`.
- O formulário é o mesmo do editor local; só muda a ação final.

### Tarefa 5: Botão Mermaid no site, testes de ponta a ponta e README

- Toolbar ganha "Mermaid", que copia o diagrama dos serviços visíveis.
- Playwright: proposta de serviço novo abre URL do GitHub com o YAML; botão Mermaid copia texto começando com `flowchart`.
- README: proposta por PR, fontes git, `export`, `diff` com exemplo de comentário automático em PR; roadmap.
