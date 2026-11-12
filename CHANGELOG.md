# Changelog

## 0.1.1

- Corrige o caminho do comando `svclens` no `package.json`, que o npm precisava corrigir a cada publicação.
- Passa a publicar por tag no GitHub Actions: o workflow envia a versão para a fila do npm (`npm stage publish`) e a publicação final depende da aprovação com a passkey.

## 0.1.0

Primeira versão publicada.

- Catálogo de serviços em YAML com validação (`svclens validate`) e site estático (`svclens build`).
- Visualizador com grafo 2D, modo 3D, tema escuro e claro, busca, filtros, upstream/downstream e exportação em PNG.
- Descoberta automática a partir de repositórios locais ou git (`svclens scan`), com scanners para arquivos de configuração, .NET, Node, OpenAPI e docker-compose.
- Editor local (`svclens serve`) e propostas de mudança por pull request a partir do site publicado.
- `svclens link`, `svclens export --format mermaid` e `svclens diff`.
- Skills para agentes de IA em `skills/`.
