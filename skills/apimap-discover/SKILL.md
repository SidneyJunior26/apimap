---
name: apimap-discover
description: Discover the dependencies of a service by reading its source code and record them in an apimap catalog. Use when asked to map, document or update which APIs, databases, queues, SOAP services, websockets or external vendors a repository calls.
---

# apimap-discover

Goal: complete the apimap catalog for one or more repositories. The deterministic scanner finds what is in config files; you find what is only visible in code, and record it as `inferred` with evidence.

## Inputs

- Catalog directory (contains `apimap.config.yaml` and `services/`). Ask if unknown.
- Repository directory or directories to analyze.

## Steps

1. **Run the scanner first** so you only add what it cannot see:
   ```bash
   npx apimap scan <catalog> --source <repo>
   ```
   Read the report: new services, added edges and the **unresolved hosts** list.

2. **Resolve unresolved hosts.** For each host in the report, find which catalog service owns it (`services/*.yaml`, field `hosts`). If you find the owner, add the host to that service's `hosts` list. If it belongs to a vendor, create an `external` service (see the `apimap-add` skill). Re-run the scan.

3. **Read the code for calls the scanner cannot see.** Look for:
   - HTTP clients: `HttpClient`/`IHttpClientFactory`/Refit interfaces (.NET), `fetch`/`axios`/`got`/`ky` (JS/TS), `RestTemplate`/`WebClient`/Feign (Java), `requests`/`httpx` (Python).
   - SOAP/WCF: service references, generated `*Client` proxies, `.wsdl` files.
   - Real-time: SignalR hubs and clients, `WebSocket`, `socket.io`.
   - Messaging: publishers and consumers for RabbitMQ, Kafka, SQS/SNS, Azure Service Bus (the queue or topic is the target).
   - gRPC stubs, GraphQL clients, FTP/SFTP clients, direct database access.
   - Base URLs assembled from configuration keys: follow the key to its config value.

4. **Record each finding** with the CLI (it keeps comments and formatting):
   ```bash
   npx apimap link <source-id> <target-id> -d <catalog> \
     --protocol <http|soap|ws|grpc|graphql|amqp|kafka|sql|ftp> \
     --confidence inferred --origin agent \
     --evidence <relative/file/path:line> --note "<what the call does, under 80 chars>"
   ```
   - `source-id`: the service whose code makes the call.
   - `target-id`: an existing service id. If none exists, create it first with `apimap-add`.
   - One `--evidence` per call site you verified, at most three.
   - Use `--confidence confirmed` only when the target is unambiguous in code (a literal URL or a generated client for that exact service).

5. **Validate** and fix anything reported:
   ```bash
   npx apimap validate <catalog>
   ```

6. **Summarize** for the user: dependencies added per service, hosts you could not attribute, and anything that needs a human decision.

## Rules

- Never write full URLs, credentials, tokens, connection strings or secrets into the catalog. Hosts and `file:line` evidence only.
- Never edit dependencies whose `origin` is `manual`, and never touch services with `locked: true`.
- Do not duplicate what the scanner already recorded (`origin: scan`).
- Do not read real `.env` files or secret stores.
- Prefer fewer, verified links over many guesses. When unsure, list it in the summary instead of linking.
