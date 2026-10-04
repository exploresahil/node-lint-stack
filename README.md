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
| `--src <dir>` | ESLint / Stylelint root (default: `src`) |
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
