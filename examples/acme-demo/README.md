# Acme demo catalog

Fictional company used to showcase apimap. All names, hosts and vendors are invented.

- 49 services across 6 groups, every built-in kind plus a custom `delphi` kind
- Mix of `confirmed`, `inferred` and `manual` dependencies
- One intentional ghost node (`tax-authority-api`) and an `orders-api` ⇄ `shipping-api` cycle

```bash
pnpm apimap validate examples/acme-demo
pnpm apimap build examples/acme-demo
```
