# Como publicar uma versão

O pacote publicado no npm é um só, `svclens`, gerado a partir de `packages/cli`. Ele já leva dentro o core, os scanners e o visualizador; os pacotes `@svclens/*` do monorepo são internos e marcados como `private`.

A publicação é feita pelo GitHub Actions, sem nenhum token guardado no repositório, e **precisa da sua aprovação** antes de a versão ficar pública.

## Como funciona

1. Você envia uma tag `vX.Y.Z`.
2. O workflow [`release.yml`](.github/workflows/release.yml) roda a checagem de tipos, os testes e o build, confere se a tag bate com a versão de `packages/cli/package.json` e envia o pacote para a fila do npm com `npm stage publish`. O workflow se identifica ao npm por OIDC, pelo Trusted Publisher.
3. A versão fica em espera. Para torná-la pública, você aprova com a passkey (Touch ID).

## Configuração única

No npmjs.com, em Settings do pacote `svclens`, Trusted Publisher, o cadastro precisa ter:

- repositório `SidneyJunior26/svclens`
- workflow `release.yml`
- environment `npm`
- permissão "npm stage publish"

No GitHub, o environment `npm` precisa existir em Settings, Environments.

## Publicar uma nova versão

1. Atualize a versão em `packages/cli/package.json` e acrescente a seção correspondente no `CHANGELOG.md`, num pull request.
2. Depois do merge, crie a tag na `main` e envie:

   ```bash
   git checkout main && git pull
   git tag v0.2.0
   git push origin v0.2.0
   ```

3. Espere o workflow `Release` terminar. O resumo da execução repete os próximos comandos.
4. Num terminal comum (não dentro de uma ferramenta que não seja interativa), liste e aprove a versão que está na fila:

   ```bash
   npx --yes npm@11.21.2 stage list svclens
   npx --yes npm@11.21.2 stage approve <stage-id>
   ```

   O npm mostra um link de autenticação; confirme com o Touch ID e a versão fica pública. Para recusar uma versão, use `stage reject <stage-id>`.

Antes de enviar a tag, dá para conferir o conteúdo do pacote com `npm pack --dry-run` dentro de `packages/cli`.

## Publicação manual (reserva)

Se o workflow não puder ser usado, publique da sua máquina, depois de `pnpm install && pnpm build`. Como o `npm` 10 não oferece a autenticação pela passkey na publicação, use o 11:

```bash
cd packages/cli
npx --yes npm@11.21.2 publish --provenance=false
```

O `--provenance=false` é necessário porque a atestação de origem só funciona quando a publicação sai do GitHub Actions.

## Versões que não podem ser reaproveitadas

Uma versão publicada no npm nunca pode ser publicada de novo, nem depois de removida. Para corrigir um erro, publique um número novo.
