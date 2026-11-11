---
name: apimap-add
description: Cadastra um serviço novo (API, BFF, worker, banco de dados, fila, sistema legado ou fornecedor externo) em um catálogo apimap, fazendo poucas perguntas e gravando um services/<id>.yaml válido. Use quando o usuário quiser registrar ou descrever um serviço manualmente.
---

# apimap-add

Objetivo: criar um arquivo de serviço válido em um catálogo apimap.

## Passos

1. Encontre o diretório do catálogo (contém `services/` e normalmente `apimap.config.yaml`). Leia o `apimap.config.yaml` para conhecer `kinds` e `groups` customizados.
2. Pergunte só o que não dá para deduzir, uma pergunta curta por vez:
   - **nome** (legível) e **id** (letras minúsculas, números e hífens; sugira um a partir do nome)
   - **tipo (kind)**: `bff`, `core`, `web`, `worker`, `webservice`, `websocket`, `grpc`, `graphql`, `queue`, `database`, `ftp`, `logs`, `external`, `legacy` ou um tipo customizado da configuração
   - **grupo** (domínio), **owner** (time), **repo** (opcional)
   - **hosts** em que o serviço responde (host ou host/caminho, sem esquema e sem credenciais)
   - **dependências**: quais serviços ele chama e como (`http`, `soap`, `ws`, `grpc`, `graphql`, `amqp`, `kafka`, `sql`, `ftp`)
3. Confira que `services/<id>.yaml` não existe e que nenhum outro arquivo usa o mesmo `id`.
4. Grave o arquivo:
   ```yaml
   # yaml-language-server: $schema=https://raw.githubusercontent.com/SidneyJunior26/apimap/main/packages/core/schema/service.schema.json
   id: payments-api
   name: Payments API
   kind: core
   group: payments
   owner: team-payments
   hosts: [payments.acme.internal]
   description: Cobranças, capturas e estornos.
   dependsOn:
     - target: paygate
       confidence: manual
       origin: manual
   ```
   Dependências informadas pelo usuário são `confidence: manual` e `origin: manual`.
5. Rode `npx apimap validate <catalogo>` e corrija qualquer erro. Um aviso de alvo não resolvido significa que aquele serviço ainda não está no catálogo: ofereça cadastrá-lo também.

## Regras

- Nunca grave URLs com credenciais, tokens ou connection strings.
- Não altere arquivos de outros serviços sem o usuário pedir.
