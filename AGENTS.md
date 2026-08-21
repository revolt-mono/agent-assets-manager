# Repository agent guide

## Commands

- `pnpm dev`: run Electron with HMR.
- `pnpm build`: typecheck (TypeScript 7 `tsc`) then build main/preload/renderer; `pnpm typecheck` runs checks alone.
- `pnpm lint`: oxlint. `pnpm format` / `pnpm format:check`: oxfmt.
- `pnpm dlx shadcn@latest add <component>`: vendor shadcn components into `src/renderer/src/components/ui` (directory is excluded from lint and format).

## Repo structure

```
src/
├── main               electron main process: typed ipc handlers, resource lifetimes, and file watchers
│   ├── ipc.ts         schema-decoding adapters for ipc methods and renderer/main events
│   ├── config*.ts     agent config io: ipc boundary, claude settings.json, codex config.toml, comment-preserving toml line editor
│   ├── skills.ts      skill folders: listing, frontmatter, uninstall/open/reveal
│   └── usage*.ts      usage-logs parses session jsonl into events; usage prices, caches per file, and buckets them for the renderer
├── preload            contextBridge exposing the typed RendererApi over ipc
├── shared
│   ├── ipc*.ts        runtime schemas plus typed method and event channel contracts
│   └── *.ts           renderer api, agent ids, config catalogs, and domain types
└── renderer/src
    ├── features       one vertical slice per page (config, skills, usage), each a page component plus an ipc-backed store
    ├── components     app chrome (PageHeader, AgentTabsList, logos, IconSwap); ui/ is vendored shadcn
    ├── lib            store primitive, cn
    └── hooks          shared react hooks
tools/oxlint           house anti-slop lint plugin wired via .oxlintrc.json
```

## Effect

- Use Effect v4 (`effect@4.0.0-rc.x`), not v3. Read `refs/effect/ai-docs/src` for idioms, `refs/effect/migration` for renames, and `refs/effect/packages` as the source of truth.
- Use Effect where typed failure, dependencies, interruption, concurrency, or resource lifetime matter. Keep pure transforms and ordinary UI promises as plain TypeScript.
- Use named `Effect.fn` for meaningful operational entry points, `Effect.gen` for branching or sequential orchestration, and direct combinators for one-step composition. Do not span tiny internal helpers.
- Decode unknown input once at ingress with a precompiled Schema decoder. Use `Data.TaggedError` for internal domain failures and schema-backed errors only when errors cross a serialized boundary.
- Tie resources and background fibers to a scope; bound filesystem and network concurrency unless the input set is already small and fixed.

## Engineering rules

- Choose the simplest correct implementation for current requirements. Only extract shared logic for genuine duplication or when a shared invariant demands the abstraction. Inline one-off/trivial wrappers.
- Build in layers: start from the smallest version that works end to end, then add each capability on top of a working product.
- Keep code self-explanatory. Rewrite unclear logic rather than defending a design with comments.
- Preserve runtime behavior during formatting, lint, typing, and test-structure changes.

## Boundaries

- Treat `refs/` as read-only reference material; do not edit or import from that directory.
- Do not preserve backward compatibility. Remove obsolete paths directly; skip compatibility layers, fallbacks, and migrations.
- Keep public pull requests, commits, generated files, and documentation free of private names, internal context, customer-derived data, and AI attribution.

## UI

- Apply tight grids, crisp layouts with the 4px design rule.
- Give every container that may scroll vertically a small vertical margin (`my-2`) so the scrollbar never gets clipped by rounded corners; keep total edge spacing by trading off padding.
- Build UI with shadcn components first; hand-roll markup and styles only as a last resort when no component fits.
- Use `className` on shadcn components for layout only (spacing, sizing, alignment); never override their visual styling unless explicitly requested.
