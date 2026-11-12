# svclens M1 Implementation Plan

**Goal:** Ship read-only svclens: YAML catalog → validated graph → static 2D "nebula" web viewer, with a fictional demo catalog.

**Architecture:** pnpm monorepo. `@svclens/core` loads/validates YAML catalog and emits `GraphJson`. `@svclens/cli` exposes `validate` and `build`; `build` writes `graph.json` next to prebuilt web assets. `@svclens/web` (Vite + React + Sigma.js) fetches `graph.json` and renders.

**Tech Stack:** Node 20+, TypeScript 5 (strict, ESM), pnpm 9 workspaces, Zod 3, `yaml` 2, graphology + graphology-layout-forceatlas2, Sigma.js 3, React 18, Vite 5, Vitest, Playwright, commander, tsup.

**Spec:** `docs/plans/2026-11-11-svclens-design.md` (sections: Modelo de dados, Erros, Web (visual), Roadmap M1).

## Global Constraints

- License MIT. All code, identifiers, commits, README in English; UI copy in English (i18n out of scope for M1).
- Demo data 100% fictional (`acme`). No real company names from employer.
- Default kinds exactly: `bff, core, web, worker, webservice, websocket, grpc, graphql, queue, database, ftp, logs, external, legacy`.
- `confidence` ∈ `confirmed | inferred | manual`; `origin` ∈ `scan | agent | manual`. Defaults when omitted: `confidence: manual`, `origin: manual`.
- Service `id`: `^[a-z0-9][a-z0-9-]*$`, unique across catalog.
- Edge style: `confirmed` solid, `inferred` dashed, `manual` solid thinner; ghost (unresolved) node dashed outline, grey.
- Respect `prefers-reduced-motion`: disable particles and background animation.
- M1 is read-only: no `scan`, `serve`, editor, 3D (those are M2–M4).

## Review Focus

1. Empty catalog (no `services/` files) — `validate` passes with 0 services, `build` succeeds, web shows "No services yet" empty state instead of blank canvas/crash.
2. Blank or non-mapping YAML file (`services/x.yaml` empty, or a list) — one error diagnostic naming the file; other files still load.
3. Self-dependency and cycles (`a→b→a`, `a→a`) — accepted, rendered; layout and upstream/downstream traversal terminate.
4. Accented/case-varied search (`autorizacao` finds `Autorização`) — search is case- and diacritic-insensitive.
5. Duplicate edge (same `target`+`protocol` listed twice) — warning, graph keeps one edge.

---

## File Structure

```
package.json  pnpm-workspace.yaml  tsconfig.base.json  vitest.workspace.ts  LICENSE  README.md
.github/workflows/ci.yml
packages/core/src/{schema.ts, kinds.ts, load.ts, validate.ts, graph.ts, index.ts}
packages/core/test/{schema.test.ts, load.test.ts, validate.test.ts, graph.test.ts, fixtures/*}
packages/cli/src/{index.ts, commands/validate.ts, commands/build.ts, report.ts}
packages/cli/test/cli.test.ts
packages/web/{index.html, vite.config.ts}
packages/web/src/{main.tsx, App.tsx, data.ts, filters.ts, theme.css}
packages/web/src/graph/{GraphCanvas.tsx, layout.ts, glowNodeProgram.ts, particles.ts, traversal.ts}
packages/web/src/panel/{Sidebar.tsx, Search.tsx, Filters.tsx, NodeDetail.tsx, Legend.tsx}
packages/web/src/background/Nebula.tsx
packages/web/test/{filters.test.ts, traversal.test.ts}
packages/web/e2e/smoke.spec.ts
examples/acme-demo/{svclens.config.yaml, services/*.yaml}
```

---

### Task 1: Monorepo scaffold + core schema

**Files:**
- Create: root `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.workspace.ts`, `LICENSE`, `.gitignore`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/schema.ts`, `packages/core/src/kinds.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/schema.test.ts`

**Interfaces:**
- Produces (`@svclens/core`):
  - `KindDef = { label: string; color: string; icon?: string; shape?: 'circle'|'square'|'diamond'|'hexagon' }`
  - `DEFAULT_KINDS: Record<string, KindDef>` (14 kinds from Global Constraints, distinct hex colors tuned for dark bg)
  - `EvidenceSchema` `{ file: string; line?: number }`
  - `DependencySchema` `{ target: string; protocol: string = 'http'; confidence = 'manual'; origin = 'manual'; evidence: Evidence[] = []; note?: string }`
  - `ServiceSchema` `{ id; name; kind: string; group?; owner?; repo?; tech: string[]=[]; hosts: string[]=[]; description?; tags: string[]=[]; locked: boolean=false; dependsOn: Dependency[]=[] }`
  - `ConfigSchema` `{ name: string = 'API Map'; sources: string[] = []; kinds: Record<string, Partial<KindDef>> = {}; groups: Record<string, { label?: string; color?: string }> = {} }`
  - Types `Service`, `Dependency`, `Config` via `z.infer`.

- [ ] **Step 1: Scaffold workspace** — root scripts `build`, `test` (`vitest run`), `typecheck` (`tsc -b`), `lint`. `pnpm install` succeeds.
- [ ] **Step 2: Write failing tests** in `schema.test.ts`:
  - `parses minimal service` — `{id:'a', name:'A', kind:'core'}` → `dependsOn` `[]`, `locked` `false`.
  - `applies dependency defaults` — `{target:'b'}` → `protocol 'http'`, `confidence 'manual'`, `origin 'manual'`.
  - `rejects invalid id` — `'Payments Core'` and `'-x'` fail.
  - `rejects unknown confidence` — `'maybe'` fails.
  - `DEFAULT_KINDS has 14 kinds with unique colors`.
- [ ] **Step 3: Run** `pnpm vitest run packages/core` → FAIL (module missing).
- [ ] **Step 4: Implement** `schema.ts`, `kinds.ts`, export from `index.ts`. Unknown keys: `.passthrough()` on Service (forward compat).
- [ ] **Step 5: Run** → PASS. **Commit** `feat(core): add catalog schema and default kinds`.

### Task 2: Catalog loader

**Files:**
- Create: `packages/core/src/load.ts`
- Test: `packages/core/test/load.test.ts`, fixtures `packages/core/test/fixtures/{ok,broken,empty}/`

**Interfaces:**
- Consumes: `ServiceSchema`, `ConfigSchema`.
- Produces:
  - `Diagnostic = { level: 'error'|'warning'; file?: string; path?: string; message: string; code: string }`
  - `Catalog = { root: string; config: Config; kinds: Record<string, KindDef>; services: Array<Service & { file: string }> }`
  - `loadCatalog(root: string): Promise<{ catalog: Catalog; diagnostics: Diagnostic[] }>`

- [ ] **Step 1: Failing tests:**
  - `loads ok fixture` — 3 services, sorted by id; `file` is relative (`services/a.yaml`).
  - `missing config uses defaults` — `kinds` equals `DEFAULT_KINDS`.
  - `config kinds merge over defaults` — config `kinds: { delphi: {label:'Delphi', color:'#f00'}, core: {color:'#0f0'} }` → `kinds.delphi` present, `kinds.core.label` still default, color `#0f0`.
  - `invalid YAML yields error, others still load` (broken fixture: one syntax error file + one valid) → 1 error code `yaml-parse` with `file`, 1 service.
  - `blank file and list file yield error code not-a-mapping` (Review Focus 2).
  - `empty dir loads 0 services, no errors` (Review Focus 1).
  - schema failure → code `schema`, `path` like `dependsOn.0.confidence`.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** — read `svclens.config.yaml` (optional), glob `services/**/*.{yaml,yml}` (fast-glob), parse with `yaml` `parse`, `safeParse` each; merged kind missing `color` falls back to `#94a3b8`, missing `label` to id.
- [ ] **Step 4: Run** → PASS. **Commit** `feat(core): load catalog with per-file diagnostics`.

### Task 3: Validation + graph build

**Files:**
- Create: `packages/core/src/validate.ts`, `packages/core/src/graph.ts`
- Test: `packages/core/test/validate.test.ts`, `packages/core/test/graph.test.ts`

**Interfaces:**
- Consumes: `Catalog`, `Diagnostic`.
- Produces:
  - `validateCatalog(c: Catalog): Diagnostic[]`
  - `GraphNode = { id; label; kind; group?; owner?; repo?; tech; hosts; description?; tags; file?; ghost: boolean; inDegree: number; outDegree: number }`
  - `GraphEdge = { id: string /* `${source}->${target}:${protocol}` */; source; target; protocol; confidence; origin; evidence; note? }`
  - `GraphJson = { version: 1; name: string; generatedAt: string; kinds: Record<string, KindDef>; groups: Config['groups']; nodes: GraphNode[]; edges: GraphEdge[] }`
  - `buildGraph(c: Catalog, now?: Date): GraphJson`

- [ ] **Step 1: Failing tests** (`validate.test.ts`):
  - duplicate id → error `duplicate-id`, both files mentioned.
  - unknown kind → error `unknown-kind`.
  - unresolved target → warning `unresolved-target`.
  - missing owner → warning `missing-owner`.
  - duplicate edge same target+protocol → warning `duplicate-edge` (Review Focus 5).
  - self-dependency → no diagnostic (Review Focus 3).
- [ ] **Step 2: Failing tests** (`graph.test.ts`):
  - unresolved target becomes node `{ghost:true, kind:'external', label: target}`.
  - duplicate edge collapsed to one edge.
  - degrees counted (`a→b`, `c→b` → `b.inDegree === 2`).
  - cycle `a→b→a` and `a→a` produce 3 edges, no throw.
  - `generatedAt` equals injected `now.toISOString()`; output deterministic (nodes/edges sorted by id).
- [ ] **Step 3: Run** → FAIL. **Step 4: Implement.** **Step 5: Run** → PASS.
- [ ] **Step 6: Export JSON Schema** of `ServiceSchema` to `packages/core/schema/service.schema.json` via `zod-to-json-schema` script `pnpm --filter @svclens/core gen:schema` (editor autocompletion with `# yaml-language-server: $schema=`). **Commit** `feat(core): validate catalog and build graph json`.

### Task 4: CLI `validate` and `build`

**Files:**
- Create: `packages/cli/package.json` (bin `svclens`), `packages/cli/src/index.ts`, `commands/validate.ts`, `commands/build.ts`, `report.ts`
- Test: `packages/cli/test/cli.test.ts`

**Interfaces:**
- Consumes: `loadCatalog`, `validateCatalog`, `buildGraph`.
- Produces:
  - `runValidate(dir: string, opts: { strict?: boolean }): Promise<number>` — exit code.
  - `runBuild(dir: string, opts: { out: string /* default `${dir}/dist` */; webDist?: string }): Promise<number>`
  - `formatDiagnostics(d: Diagnostic[]): string` — `ERROR services/a.yaml dependsOn.0: message`, summary line `N errors, M warnings`.
- Web assets resolved from `@svclens/web/dist` via `import.meta.resolve`; `webDist` override for tests.

- [ ] **Step 1: Failing tests:**
  - `validate ok fixture exits 0`; with warning + `--strict` exits 1; with error exits 1.
  - `build writes graph.json and index.html` into tmp `out` (use stub webDist dir with `index.html`).
  - `build refuses on errors` → exit 1, no `graph.json`.
  - `build on empty catalog succeeds` with `nodes: []` (Review Focus 1).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** with commander; colors via `picocolors`; bundle with tsup. **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `feat(cli): add validate and build commands`.

### Task 5: acme-demo catalog

**Files:**
- Create: `examples/acme-demo/svclens.config.yaml`, `examples/acme-demo/services/*.yaml` (~40)

- [ ] **Step 1: Write catalog** — fictional e-commerce/insurance "Acme": groups `identity, commerce, payments, logistics, platform, partners`; every default kind used ≥1; plus custom kind `delphi` in config; mix of `confirmed`/`inferred`/`manual`; ≥1 ghost target, ≥1 cycle; names with accents (e.g. `Autorização Core`); external partners invented (`Paygate`, `ShipFast`, `MapRoute`). Each file starts with `# yaml-language-server: $schema=../../../packages/core/schema/service.schema.json`.
- [ ] **Step 2: Verify** `pnpm svclens validate examples/acme-demo` → `0 errors` (warnings allowed only for intentional ghost).
- [ ] **Step 3: Commit** `feat(examples): add fictional acme demo catalog`.

### Task 6: Web shell — data, filters, sidebar

**Files:**
- Create: `packages/web/{package.json,index.html,vite.config.ts}`, `src/{main.tsx,App.tsx,data.ts,filters.ts,theme.css}`, `src/panel/*`
- Test: `packages/web/test/filters.test.ts`

**Interfaces:**
- Consumes: `GraphJson` type from `@svclens/core` (type-only import).
- Produces:
  - `loadGraph(url = './graph.json'): Promise<GraphJson>`
  - `FilterState = { query: string; kinds: Set<string>; groups: Set<string>; confidences: Set<Confidence> }`
  - `normalize(s: string): string` — lowercase + NFD strip diacritics.
  - `applyFilters(g: GraphJson, f: FilterState): { nodeIds: Set<string>; edgeIds: Set<string> }` — edge visible only if both ends visible and confidence selected.
  - `countByKind(g: GraphJson): Record<string, number>`
- Dev: Vite dev server serves `examples/acme-demo` graph via `svclens build` output in `public/graph.json` (script `pnpm --filter @svclens/web dev:demo`).

- [ ] **Step 1: Failing tests:**
  - `search is accent and case insensitive` — query `autorizacao` matches label `Autorização Core` (Review Focus 4); also matches by `id`, `owner`, `tags`, `hosts`.
  - `kind filter hides nodes and their edges`.
  - `confidence filter hides only edges`.
  - `empty graph yields empty sets`.
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement** pure functions, then UI:
  - Glass sidebar right, 340px: `Search`, `NodeDetail` ("Click a node to see details" placeholder; shows kind badge, group, owner, repo link, hosts, tech, deps out/in lists with confidence pill + evidence `file:line`), `Filters` (kinds grouped, checkbox + color dot + count, "Select all"), `Legend` (kinds + edge styles solid/dashed/ghost).
  - Empty state when `nodes.length === 0`: centered "No services yet — add YAML files to services/".
  - `theme.css`: tokens on `:root` (`--bg-0:#070b1a; --bg-1:#111a3a; --glass: rgba(20,28,60,.55); --text:#e6e9ff; --muted:#8a93c2; --accent:#7c5cff`), font Inter.
- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `feat(web): add data loading, filters and sidebar`.

### Task 7: 2D nebula renderer

**Files:**
- Create: `src/graph/{GraphCanvas.tsx,layout.ts,glowNodeProgram.ts,particles.ts,traversal.ts}`, `src/background/Nebula.tsx`
- Test: `packages/web/test/traversal.test.ts`

**Interfaces:**
- Consumes: `GraphJson`, `applyFilters` output.
- Produces:
  - `toGraphology(g: GraphJson): Graph` and `runLayout(graph: Graph): void` (ForceAtlas2 worker 2s then stop; seed positions by group angle so clusters start apart; deterministic seed).
  - `neighbors(g: GraphJson, id: string, dir: 'up'|'down'|'both', depth: number): Set<string>` — up = who depends on id.
  - `<GraphCanvas graph visible selectedId onSelect focusMode: 'none'|'up'|'down'|'both' depth />`

- [ ] **Step 1: Failing tests** (`traversal.test.ts`):
  - `down depth 1` on `a→b→c` from `a` = `{a,b}`; depth 2 = `{a,b,c}`.
  - `up` from `c` depth 2 = `{a,b,c}`.
  - cycle `a→b→a` and self-loop terminate (Review Focus 3).
- [ ] **Step 2: Run** → FAIL. **Step 3: Implement `traversal.ts`** (BFS with visited set). **Run** → PASS.
- [ ] **Step 4: Implement renderer:**
  - Sigma with `glowNodeProgram` (custom WebGL node program: core disc + radial falloff halo in kind color, alpha 0.35; ghost = ring dashed grey). Node size `4 + 2*sqrt(inDegree+outDegree)`.
  - Edges: curved arrow program; `inferred` dashed (dashed edge program or `@sigma/edge-curve` + dash uniform); colors = source kind color at 0.45 alpha.
  - `particles.ts`: overlay `<canvas>` above Sigma, per visible edge 1–3 particles moving source→target along edge path using `sigma.graphToViewport`, rAF loop; paused when tab hidden or reduced motion.
  - Hover: highlight node + neighbors, others fade to 0.12 alpha (sigma `nodeReducer`/`edgeReducer`). Click: select, `camera.animate` to node (400ms ease). Detail panel buttons "Upstream"/"Downstream" set `focusMode`, depth slider 1–5.
  - Labels: shown for hovered/selected/neighbors and nodes above degree threshold; label color `--text`.
  - `Nebula.tsx`: fixed layer behind canvas — 3 large blurred radial gradients (violet/teal/blue) drifting via CSS keyframes 40s, dot grid (`radial-gradient` 1px at 24px), SVG noise overlay opacity .04.
  - Floating toolbar bottom-left: zoom +/−, fit, reset filters.
- [ ] **Step 5: Manual verify** `pnpm --filter @svclens/web dev:demo` — clusters visible, particles flow in call direction, hover fades, click focuses, upstream/downstream works, reduced-motion (DevTools emulation) stops animation.
- [ ] **Step 6: Commit** `feat(web): add 2D nebula graph renderer`.

### Task 8: E2E smoke, CI, README

**Files:**
- Create: `packages/web/e2e/smoke.spec.ts`, `packages/web/playwright.config.ts`, `.github/workflows/ci.yml`, `README.md`

- [ ] **Step 1: Write Playwright test** against `svclens build examples/acme-demo` output served by `vite preview`:
  - page loads, canvas visible, no console errors.
  - type `autorizacao` in search → result list contains `Autorização Core`; click → detail panel shows its owner.
  - uncheck kind `external` → searching `Paygate` shows "No matches".
  - empty catalog build (fixture) shows text `No services yet`.
- [ ] **Step 2: Run** `pnpm --filter @svclens/web e2e` → PASS.
- [ ] **Step 3: CI** — on push/PR: pnpm install, `typecheck`, `test`, build all, `svclens validate examples/acme-demo --strict` is NOT used (demo has intentional ghost warning; use plain), `e2e`; on `main` deploy `examples/acme-demo/dist` to GitHub Pages.
- [ ] **Step 4: README** — pitch, screenshot placeholder, quickstart (`npx svclens build ./my-catalog`), YAML example from spec, kinds table, roadmap M2–M5.
- [ ] **Step 5: Commit** `chore: add e2e smoke, CI and README`.
