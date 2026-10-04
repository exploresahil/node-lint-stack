# node-lint-stack

Personal lint template (not published to npm). Installs the same layered stack used in [next-ocr](https://github.com/exploresahil/next-ocr):

**Biome → ESLint (SonarJS parity) → react-compiler-marker → Stylelint**

## One command (any Node / Next project)

From the project root:

```bash
npx github:exploresahil/node-lint-stack
```

Pin a branch:

```bash
npx github:exploresahil/node-lint-stack#main
```

Use your fork or another URL:

```bash
npx github:YOUR_USER/node-lint-stack
```

## Options

```bash
npx github:exploresahil/node-lint-stack -- --dir . --src src --next --force
```

| Flag | Meaning |
|------|---------|
| `--dir <path>` | Target project (default: current directory) |
| `--from owner/repo` | Pull template from another GitHub repo (when running `install.mjs` directly) |
| `--src <dir>` | Lint this folder (default: `src`) |
| `--name <label>` | TUI banner title (default: `package.json` name) |
| `--next` | Force Biome `next` domain |
| `--no-styles` | Skip Stylelint |
| `--no-react-compiler` | Skip `react-compiler-marker` |
| `--force` | Overwrite existing config files |
| `--no-install` | Merge `package.json` only; run `npm install` yourself |

After install:

```bash
npm run lint
```

## Local clone (develop the template)

```bash
cd F:\github\sahil-github\node-lint-stack
node bin/install.mjs --dir path\to\some-project --force
```

Or pipe from GitHub (no npx):

```bash
curl -fsSL https://raw.githubusercontent.com/exploresahil/node-lint-stack/main/bin/install.mjs -o /tmp/install-lint.mjs
node /tmp/install-lint.mjs --from exploresahil/node-lint-stack --dir .
```

## What gets added

- `biome.json`, `eslint.config.mjs`, `eslint.sonar-extended.mjs`
- `stylelint.config.mjs`, `stylelint.sonar-contrast.mjs` (unless `--no-styles`)
- `scripts/lint.mjs`, `.lint-stack.json`
- `package.json` scripts: `lint`, `lint:*`, `format`, `format:unsafe`
- Matching `devDependencies` (merged, not replacing yours)

Re-run with `--force` to refresh configs from the template.

## Requirements

- Node 20+
- Git (only when using `--from` to clone a remote template)
- TypeScript project recommended for type-aware ESLint (`projectService`)
