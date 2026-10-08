# node-lint-stack

Personal lint template (not on npm). Same layered stack as [next-ocr](https://github.com/exploresahil/next-ocr):

**Biome → ESLint (SonarJS parity) → react-compiler-marker → Stylelint**

Install only the layers you want. `npm run lint` runs **every enabled layer** and reports all failures (no early exit).

## Install

From the target project root:

```bash
npx github:exploresahil/node-lint-stack
```

Pin the default branch:

```bash
npx github:exploresahil/node-lint-stack@main
```

Use a fork:

```bash
npx github:YOUR_USER/node-lint-stack
```

### Interactive layer picker (TTY)

When stdin is a terminal, a checklist runs before anything is copied:

| Key | Action |
|-----|--------|
| **↑ / ↓** | Move highlight |
| **Space** | Toggle the focused row |
| **Select all layers** | Turn every layer on or off |
| **Enter** | Install checked layers |

Rows: **Biome** · **ESLint (Sonar parity)** · **React Compiler** · **Stylelint**

- Enabling **React Compiler** also enables **ESLint** (plugin lives in ESLint config).
- Disabling **ESLint** disables **React Compiler**.
- At least one layer must be selected.

### Non-interactive

Install everything (no picker):

```bash
npx github:exploresahil/node-lint-stack -- --all
```

Same as `--yes` / `-y` or `--no-interactive`.

Pick layers with flags instead of the TUI:

```bash
npx github:exploresahil/node-lint-stack -- --no-styles --no-react-compiler
```

## CLI options

Pass after `--` when using `npx`:

```bash
npx github:exploresahil/node-lint-stack -- --dir . --src src --next --force
```

| Flag | Meaning |
|------|---------|
| `--dir <path>` | Target project (default: current directory) |
| `--from owner/repo` | Template from another GitHub repo (`owner/repo` or `#branch`) |
| `--src <dir>` | Force a single lint root (default: auto-detect) |
| `--name <label>` | Title in `npm run lint` banner (default: `package.json` name) |
| `--next` | Force Biome `next` domain (auto if `next` is a dependency) |
| `--all`, `-y`, `--yes` | All layers; skip picker |
| `--no-interactive` | Same as `--all` on a TTY |
| `--no-biome` | Omit Biome |
| `--no-eslint` | Omit ESLint (and React Compiler ESLint plugin) |
| `--no-react-compiler` | Omit `react-compiler-marker` |
| `--no-styles` | Omit Stylelint |
| `--force` | Overwrite existing stack files |
| `--no-install` | Merge `package.json` only; run `npm install` yourself |

## After install

```bash
npm install   # skipped if the installer already ran it
npm run lint
```

The lint TUI runs each **enabled** layer in order (Biome → ESLint → Compiler → Stylelint). If one fails, the rest still run; exit code is non-zero if any layer failed.

### Lint one or more paths

Pass files or directories after `--` (Windows paths with `()` are fine):

```bash
npm run lint -- src/components/Button.tsx
npm run lint -- "src/app/(client)/_components/GlobalOcrProcessStatus.client.tsx"
```

Each layer only runs when the path matches its file types (e.g. Stylelint is skipped for a `.tsx`-only list). Paths that do not exist are skipped with a note instead of failing the run. React Compiler marker scans the **workspace package** that contains the file (see lint roots), or the repo root when paths span packages.

### Lint roots (auto-detected)

The installer derives lint roots from the repo layout — independent repos and monorepos both work with no extra flags:

| Layout | Roots |
|--------|-------|
| npm **`workspaces`** monorepo | every workspace package: `pkg/src` (or `pkg` when it has no `src`) |
| Multi-package repo without workspaces (sibling `package.json` dirs, git submodules) | same rule per top-level package |
| Independent repo | `src/` when present, otherwise the repo root (`.`) |
| Top-level `scripts/` containing code | added whenever it exists |

`--src <dir>` forces a single root instead of auto-detecting. The result is written to `.lint-stack.json` (`lintRoots`, `eslintCli`, `styleGlob`, `packages` — `{ "path": "apps/web", "src": "src" }` for marker scoping). Edit those and re-run `npm run lint` to adjust without reinstalling. Re-run install with `--force` after adding workspaces.

If the repo already has its own `eslint.config.*`, the installer keeps it (ESLint resolves the nearest config per file) and does not write the stack's `eslint.config.mjs`.

### Warning gate (`maxWarnings`)

`.lint-stack.json` controls whether ESLint warnings fail `npm run lint`:

- `0` (default) — any warning fails the run
- `null` — report-only; only errors fail

Re-installs preserve the value already in `.lint-stack.json`.

Per-layer scripts: `lint:biome`, `lint:eslint`, `lint:react-compiler`, `lint:styles`, plus `format` / `format:unsafe` when Biome is installed.

## What gets added (by layer)

| Layer | Files / deps (representative) |
|-------|-------------------------------|
| **Biome** | `biome.json`, `lint:biome`, `format*` |
| **ESLint** | `eslint.config.mjs`, `eslint.sonar-extended.mjs`, `.npmrc` (`legacy-peer-deps=true` for ESLint 10 + jsx-a11y) |
| **React Compiler** | `lint:react-compiler`, marker + ESLint plugin in config |
| **Stylelint** | `stylelint.config.mjs`, `stylelint.sonar-contrast.mjs`, `lint:styles` |

Always (when at least one layer is chosen):

- `scripts/lint.mjs` — orchestrator (reads `.lint-stack.json`)
- `.lint-stack.json` — which layers are on
- Merged `package.json` **scripts** and **devDependencies** (existing entries kept)

Re-run the installer with `--force` to refresh configs from the template.

## Requirements

- Node 20+
- Git (only for `--from` when cloning a remote template)
- TypeScript recommended for type-aware ESLint (`projectService`)

## Development

`npm test` runs `selftest.mjs`: installs the stack into throwaway fixtures (independent, submodule-style, npm-workspaces, bare-root repos) and asserts the derived lint roots, merged `package.json` scripts, and `maxWarnings` handling.
