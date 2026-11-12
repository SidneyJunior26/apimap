# Catálogo de demonstração Acme

Empresa fictícia usada para demonstrar o svclens. Todos os nomes, hosts e fornecedores são inventados.

- 49 serviços em 6 grupos, todos os tipos nativos e um tipo customizado `delphi`
- Mistura de dependências `confirmed`, `inferred` e `manual`
- Um nó fantasma proposital (`tax-authority-api`) e um ciclo `orders-api` ⇄ `shipping-api`

```bash
pnpm svclens validate examples/acme-demo
pnpm svclens build examples/acme-demo
```
