---
name: apimap-add
description: Add a new service (API, BFF, worker, database, queue, legacy system or external vendor) to an apimap catalog by asking a few questions and writing a valid services/<id>.yaml. Use when the user wants to register or describe a service by hand.
---

# apimap-add

Goal: create one valid service file in an apimap catalog.

## Steps

1. Find the catalog directory (it contains `services/` and usually `apimap.config.yaml`). Read `apimap.config.yaml` for custom `kinds` and `groups`.
2. Ask only for what you cannot infer, one short question at a time:
   - **name** (human name) and **id** (lowercase, digits and dashes; suggest one from the name)
   - **kind**: `bff`, `core`, `web`, `worker`, `webservice`, `websocket`, `grpc`, `graphql`, `queue`, `database`, `ftp`, `logs`, `external`, `legacy`, or a custom kind from the config
   - **group** (domain), **owner** (team), **repo** (optional)
   - **hosts** it is reachable at (host or host/path, no scheme, no credentials)
   - **dependencies**: which services it calls and how (`http`, `soap`, `ws`, `grpc`, `graphql`, `amqp`, `kafka`, `sql`, `ftp`)
3. Check that `services/<id>.yaml` does not exist and no other file uses the same `id`.
4. Write the file:
   ```yaml
   # yaml-language-server: $schema=https://raw.githubusercontent.com/SidneyJunior26/apimap/main/packages/core/schema/service.schema.json
   id: payments-api
   name: Payments API
   kind: core
   group: payments
   owner: team-payments
   hosts: [payments.acme.internal]
   description: Charges, captures and refunds.
   dependsOn:
     - target: paygate
       confidence: manual
       origin: manual
   ```
   Dependencies the user tells you about are `confidence: manual`, `origin: manual`.
5. Run `npx apimap validate <catalog>` and fix any error. A warning about an unresolved target means that service is not in the catalog yet: offer to add it too.

## Rules

- Never store URLs with credentials, tokens or connection strings.
- Do not change other services' files unless the user asks.
