<p align="center">
  <img src="build/icon.png" width="128" alt="Volt icon">
</p>

<h1 align="center">Volt</h1>

Volt is a macOS desktop app that manages the coding agents installed on your machine. It supports Claude Code and Codex.

- **Config.** Edit `~/.claude/settings.json` and `~/.codex/config.toml` from one UI. Edits to the TOML file keep your comments and layout intact.
- **Skills.** Browse the skills under `~/.claude/skills` and `~/.codex/skills`, read each `SKILL.md`, and open, reveal, or uninstall a skill.
- **Usage.** Volt parses each agent's session logs, prices the tokens per model, and charts spend by hour.

File watchers keep every page in sync, so changes made outside the app show up without a restart.

## Install

Volt runs on Apple Silicon only.

1. Download `volt-<version>-arm64.zip` from [releases](https://github.com/revolt-mono/agent-assets-manager/releases).
2. Unzip it and move `Volt.app` to `/Applications`.
3. Remove the quarantine flag before the first launch:

```sh
xattr -dr com.apple.quarantine /Applications/Volt.app
```

The last step is required because Volt is signed with a self-issued certificate and is not notarized, so Gatekeeper blocks it by default.

## Develop

```sh
pnpm install
pnpm dev
```

Volt is built with Electron, React, TypeScript, and shadcn. oxlint lints, oxfmt formats, and vitest runs the tests.

| Command             | Description                              |
| ------------------- | ---------------------------------------- |
| `pnpm dev`          | Run Electron with HMR                    |
| `pnpm test`         | Run vitest                               |
| `pnpm typecheck`    | Typecheck the node and web projects      |
| `pnpm lint`         | Lint with oxlint                         |
| `pnpm format`       | Format with oxfmt                        |
| `pnpm build`        | Typecheck, then build all processes      |
| `pnpm build:mac`    | Package a signed arm64 zip into `dist/`  |
| `pnpm build:unpack` | Package an unpacked build for inspection |

Add shadcn components with `pnpm dlx shadcn@latest add <component>`; they land in `src/renderer/src/components/ui`.
