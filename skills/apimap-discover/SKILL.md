---
name: apimap-discover
description: Descobre as dependências de um serviço lendo o código-fonte e as registra em um catálogo apimap. Use quando pedirem para mapear, documentar ou atualizar quais APIs, bancos de dados, filas, serviços SOAP, websockets ou fornecedores externos um repositório chama.
---

# apimap-discover

Objetivo: completar o catálogo apimap de um ou mais repositórios. O scanner determinístico encontra o que está nos arquivos de configuração; você encontra o que só aparece no código e registra como `inferred`, com evidência.

## Entradas

- Diretório do catálogo (contém `apimap.config.yaml` e `services/`). Pergunte se não souber.
- Diretório ou diretórios dos repositórios a analisar.

## Passos

1. **Rode o scanner primeiro**, para registrar só o que ele não consegue ver:
   ```bash
   npx apimap scan <catalogo> --source <repo>
   ```
   Leia o relatório: serviços novos, arestas adicionadas e as listas de **hosts sem dono** (internos e externos).

2. **Resolva os hosts sem dono.** Para cada host do relatório, descubra qual serviço do catálogo o atende (`services/*.yaml`, campo `hosts`). Encontrou o dono? Adicione o host à lista `hosts` desse serviço. Se for um fornecedor, crie um serviço `external` (veja a skill `apimap-add`). Se o domínio é da empresa e ainda não está em `scan.internalDomains` no `apimap.config.yaml`, sugira incluí-lo. Rode o scan de novo.

3. **Leia o código atrás de chamadas que o scanner não vê.** Procure:
   - Clientes HTTP: `HttpClient`/`IHttpClientFactory`/interfaces Refit (.NET), `fetch`/`axios`/`got`/`ky` (JS/TS), `RestTemplate`/`WebClient`/Feign (Java), `requests`/`httpx` (Python).
   - SOAP/WCF: referências de serviço, proxies `*Client` gerados, arquivos `.wsdl`.
   - Tempo real: hubs e clientes SignalR, `WebSocket`, `socket.io`.
   - Mensageria: publicadores e consumidores de RabbitMQ, Kafka, SQS/SNS, Azure Service Bus (a fila ou o tópico é o alvo).
   - Stubs gRPC, clientes GraphQL, clientes FTP/SFTP, acesso direto a banco de dados.
   - URLs base montadas a partir de chaves de configuração: siga a chave até o valor na configuração.

4. **Registre cada achado** pela CLI (ela preserva comentários e formatação):
   ```bash
   npx apimap link <id-origem> <id-alvo> -d <catalogo> \
     --protocol <http|soap|ws|grpc|graphql|amqp|kafka|sql|ftp> \
     --confidence inferred --origin agent \
     --evidence <caminho/relativo/arquivo:linha> --note "<o que a chamada faz, até 80 caracteres>"
   ```
   - `id-origem`: o serviço cujo código faz a chamada.
   - `id-alvo`: um id existente no catálogo. Se não existir, crie antes com `apimap-add`.
   - Um `--evidence` para cada ponto de chamada verificado, no máximo três.
   - Use `--confidence confirmed` só quando o alvo é inequívoco no código (URL literal ou cliente gerado para aquele serviço específico).

5. **Valide** e corrija o que for apontado:
   ```bash
   npx apimap validate <catalogo>
   ```

6. **Resuma** para o usuário: dependências adicionadas por serviço, hosts que você não conseguiu atribuir e o que precisa de decisão humana.

## Regras

- Nunca grave no catálogo URLs completas, credenciais, tokens, connection strings ou segredos. Só hosts e evidência `arquivo:linha`.
- Nunca edite dependências com `origin: manual` e nunca mexa em serviços com `locked: true`.
- Não duplique o que o scanner já registrou (`origin: scan`).
- Não leia arquivos `.env` reais nem cofres de segredos.
- Prefira poucas ligações verificadas a muitos palpites. Na dúvida, liste no resumo em vez de registrar.
