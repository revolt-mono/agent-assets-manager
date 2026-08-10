# electron-app

Electron + Vite + React + TypeScript 7 + shadcn (preset `b1Zzq9vto`), linted with oxlint and formatted with oxfmt.

## Setup

```sh
pnpm install
```

## Develop

```sh
pnpm dev
```

## Scripts

| Command             | Description                            |
| ------------------- | -------------------------------------- |
| `pnpm dev`          | Dev server + Electron with HMR         |
| `pnpm build`        | Typecheck and build all processes      |
| `pnpm typecheck`    | TypeScript 7 `tsc` on node + web       |
| `pnpm lint`         | oxlint                                 |
| `pnpm format`       | oxfmt (write)                          |
| `pnpm format:check` | oxfmt (check only)                     |
| `pnpm build:mac`    | Package with electron-builder (macOS)  |
| `pnpm build:win`    | Package with electron-builder (Win)    |
| `pnpm build:linux`  | Package with electron-builder (Linux)  |

## shadcn

Add components with:

```sh
pnpm dlx shadcn@latest add <component>
```

Config lives in `components.json`; components land in `src/renderer/src/components/ui`.
