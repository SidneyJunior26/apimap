# apimap M4: plano de implementação

Objetivo: o visualizador ganha um modo 3D para apresentações, um tema claro e exportação do grafo em PNG.

Arquitetura: tudo dentro de `@apimap/web`. O modo 3D usa 3d-force-graph (three.js) carregado sob demanda, para não pesar no 2D. Tema e modo ficam na URL (`?view=3d&theme=paper`), para que um link compartilhado abra igual; a última escolha também fica no `localStorage` do navegador. A exportação junta as camadas do canvas atual numa imagem só.

Spec: `docs/plans/2026-11-11-apimap-design.md`, seção Web (itens 3D, Fundo, toolbar) e Roadmap M4.

## Restrições

- Versões fixas publicadas há mais de um mês: `3d-force-graph@1.80.1`, `three@0.186.1`.
- three.js só é baixado quando alguém abre o modo 3D (import dinâmico, chunk separado).
- O modo 3D respeita filtros, busca, seleção e upstream/downstream do painel, como o 2D.
- `prefers-reduced-motion`: sem partículas, sem animação de câmera, também no 3D.
- No tema claro, cores dos tipos escurecem o suficiente para contraste sobre fundo claro; brilho e partículas usam composição normal (a aditiva some no branco).
- A imagem exportada inclui o fundo do tema, o grafo como está na tela e o nome do catálogo no rodapé.

## Foco de revisão

1. Link com `?view=3d` aberto num navegador sem WebGL: cai para o 2D com aviso, sem tela em branco.
2. Trocar de 3D para 2D e voltar: sem vazamento de renderer (o anterior é destruído).
3. Exportar PNG no tema claro: fundo claro na imagem, sem áreas transparentes.
4. Parâmetro inválido na URL (`?theme=xyz`): ignora e usa o padrão.
5. Exportar logo após uma recarga do grafo no editor: a imagem tem os nós atuais.

---

### Tarefa 1: Estado de visualização na URL e tema claro

Arquivos: `src/viewState.ts`, `src/theme.ts`, `src/theme.css`, `App.tsx`, componentes que usam cores, `graph/glowNodeProgram.ts`, `graph/links.ts`, `graph/labels.ts`; testes `test/viewState.test.ts`, `test/theme.test.ts`.

- `ViewState = { view: '2d' | '3d'; theme: 'nebula' | 'paper' }`
- `readViewState(search: string, stored: Partial<ViewState> | null, prefersLight: boolean): ViewState` — URL vence, depois o salvo, depois o sistema; valores inválidos ignorados.
- `writeViewState(state, url: URL): string` — devolve a nova query mantendo outros parâmetros; o padrão (`2d`, tema do sistema) não polui a URL.
- `themeColor(hex: string, theme): string` — no `paper`, escurece a cor (mistura com preto até contraste mínimo 3:1 contra o fundo `#f6f4ef`).
- `createGlowProgram(intensity: number)` substitui a constante; `paper` usa brilho menor.
- `LinksLayer` recebe o tema: composição `source-over` e alfas maiores no `paper`.
- Tokens CSS em `:root[data-theme="paper"]`; fundo `Paper` (papel com grade sutil) no lugar do `Nebula`.

### Tarefa 2: Modo 3D

Arquivos: `src/graph3d/Graph3D.tsx`, `src/graph3d/scene.ts`, `src/graph/Toolbar.tsx`; teste `test/scene.test.ts`.

- `toForceData(g: GraphJson, visible: Visible, theme): { nodes; links }` — puro, testável: só visíveis, cor pelo tema, tamanho pelo grau, partículas 2 em `confirmed`, 1 nos demais, 0 com movimento reduzido.
- `Graph3D` carrega `3d-force-graph` sob demanda, aplica bloom (`UnrealBloomPass`, mais fraco no `paper`), destaca vizinhança no hover e foco/upstream/downstream como no 2D, voa a câmera até o nó selecionado e destrói o renderer ao desmontar.
- Sem WebGL: mostra aviso e volta para o 2D.
- Toolbar ganha botões "2D/3D", "Tema" e "PNG".

### Tarefa 3: Exportar PNG

Arquivos: `src/export/png.ts`; teste `test/png.test.ts`.

- `exportFileName(name: string, date: Date): string` → `acme-api-map-2026-11-11.png`.
- `composeLayers(layers: CanvasImageSource[], size, background, caption): HTMLCanvasElement` — fundo do tema, camadas em ordem, legenda no rodapé.
- 2D: força um render síncrono do sigma e captura `links`, `nodes`, `labels` na mesma tarefa (o WebGL não preserva o buffer). 3D: renderer criado com `preserveDrawingBuffer: true`.
- Download via `canvas.toBlob` e link temporário.

### Tarefa 4: Testes de ponta a ponta e documentação

- Playwright: alternar para 3D e voltar; `?theme=paper` aplica `data-theme`; exportar PNG gera download `.png` com tamanho maior que zero (2D e 3D).
- README: modo 3D, tema e exportação; roadmap marca M4 como concluída.
