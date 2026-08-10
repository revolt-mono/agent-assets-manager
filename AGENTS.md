# Repository agent guide

## Commands

- `pnpm dev`: run Electron with HMR.
- `pnpm build`: typecheck (TypeScript 7 `tsc`) then build main/preload/renderer; `pnpm typecheck` runs checks alone.
- `pnpm lint`: oxlint. `pnpm format` / `pnpm format:check`: oxfmt.
- `pnpm dlx shadcn@latest add <component>`: vendor shadcn components into `src/renderer/src/components/ui` (directory is excluded from lint, format, and typecheck).

## Engineering rules

- Choose the simplest correct implementation for current requirements. Extract shared logic only when genuine duplication or a shared invariant demands the abstraction; keep one-off code inline.
- Build in layers: start from the smallest version that works end to end, then add each capability on top of a working product.
- Keep components modular, concerns separated, and code self-explanatory. Rewrite unclear logic rather than defending a design with comments.
- Preserve runtime behavior during formatting, lint, typing, and test-structure changes.

## Boundaries

- Treat `refs/` as read-only reference material; do not edit or import from that directory.
- Do not preserve backward compatibility. Remove obsolete paths directly; skip compatibility layers, fallbacks, and migrations.
- Keep public pull requests, commits, generated files, and documentation free of private names, internal context, customer-derived data, and AI attribution.

## UI

- Apply tight grids, crisp layouts with the 4px design rule.
- Do not edit or add post-styling tokens on shadcn components unless explicitly requested.
