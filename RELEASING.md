# Como publicar uma versão

O pacote publicado no npm é um só, `svclens`, gerado a partir de `packages/cli`. Ele já leva dentro o core, os scanners e o visualizador; os pacotes `@svclens/*` do monorepo são internos e marcados como `private`.

## Primeira publicação (manual)

O npm só permite configurar a publicação automática depois que o pacote existe, então a primeira vez é feita da sua máquina:

```bash
npm login
pnpm install
pnpm build
cd packages/cli
npm publish --provenance=false
```

O `--provenance=false` é necessário porque a atestação de origem só funciona quando a publicação sai do GitHub Actions.

Antes de publicar, dá para conferir o conteúdo do pacote com `npm pack --dry-run`.

## Configurar a publicação automática

1. No npmjs.com, abra o pacote `svclens`, vá em Settings e, em "Trusted Publisher", escolha GitHub Actions com:
   - Organization or user: `SidneyJunior26`
   - Repository: `svclens`
   - Workflow filename: `release.yml`
   - Environment: `npm`
2. No GitHub, crie o environment `npm` em Settings → Environments (pode exigir aprovação manual antes de publicar, se quiser).

Com isso nenhum token fica guardado no repositório. Se preferir usar um token, crie um "Granular Access Token" no npm com permissão de publicação só para o pacote `svclens` e salve como secret `NPM_TOKEN` no environment `npm`.

## Publicar uma nova versão

1. Atualize a versão em `packages/cli/package.json` e acrescente a seção correspondente no `CHANGELOG.md`, num pull request.
2. Depois do merge, crie a tag na `main` e envie:

   ```bash
   git checkout main && git pull
   git tag v0.2.0
   git push origin v0.2.0
   ```

3. O workflow `Release` roda os testes, confere se a tag bate com a versão do pacote e publica com atestação de origem.
