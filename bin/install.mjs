#!/usr/bin/env node
/**
 * Copy lint stack into a Node project and merge package.json scripts + devDependencies.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { allLayersOn, pickLayersInteractive } from "./pick-layers.mjs";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** @typedef {{ dir?: string; from?: string; src?: string; name?: string; next?: boolean; noStyles?: boolean; noReactCompiler?: boolean; noBiome?: boolean; noEslint?: boolean; force?: boolean; noInstall?: boolean; help?: boolean; all?: boolean; yes?: boolean; nonInteractive?: boolean }} CliFlags */

/** @typedef {{ biome: boolean; eslint: boolean; reactCompiler: boolean; stylelint: boolean }} LayerSelection */

function printHelp() {
  console.log(`node-lint-stack — install lint configs into a Node project

Usage:
  npx github:OWNER/node-lint-stack [options]
  node bin/install.mjs [options]

Interactive (default on a TTY):
  Arrow keys move, Space toggles layers, Enter installs.
  "Select all layers" toggles every layer at once.

Options:
  --dir <path>           Target project (default: cwd)
  --from <owner/repo>    Template source (default: bundled template/)
  --src <dir>            Source folder for ESLint/stylelint (default: src)
  --name <label>         Banner name (default: package.json name)
  --next                 Enable Biome "next" domain (Next.js apps)
  --all, -y, --yes       Install all layers (skip picker)
  --no-interactive       Same as --all when stdin is a TTY
  --no-biome             Skip Biome (non-interactive preset)
  --no-eslint            Skip ESLint
  --no-styles            Skip Stylelint
  --no-react-compiler    Skip react-compiler-marker
  --force                Overwrite existing lint config files
  --no-install           Skip npm install after merge
  -h, --help             Show this help
`);
}

/** @returns {CliFlags} */
function parseArgs(argv) {
  /** @type {CliFlags} */
  const flags = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "-h" || arg === "--help") {
      flags.help = true;
      continue;
    }
    if (arg === "--next") {
      flags.next = true;
      continue;
    }
    if (arg === "--no-styles") {
      flags.noStyles = true;
      continue;
    }
    if (arg === "--no-react-compiler") {
      flags.noReactCompiler = true;
      continue;
    }
    if (arg === "--no-biome") {
      flags.noBiome = true;
      continue;
    }
    if (arg === "--no-eslint") {
      flags.noEslint = true;
      continue;
    }
    if (arg === "--force") {
      flags.force = true;
      continue;
    }
    if (arg === "--no-install") {
      flags.noInstall = true;
      continue;
    }
    if (arg === "--all" || arg === "-y" || arg === "--yes") {
      flags.all = true;
      continue;
    }
    if (arg === "--no-interactive") {
      flags.nonInteractive = true;
      continue;
    }
    if (arg === "--dir" && argv[i + 1]) {
      flags.dir = argv[++i];
      continue;
    }
    if (arg === "--from" && argv[i + 1]) {
      flags.from = argv[++i];
      continue;
    }
    if (arg === "--src" && argv[i + 1]) {
      flags.src = argv[++i];
      continue;
    }
    if (arg === "--name" && argv[i + 1]) {
      flags.name = argv[++i];
      continue;
    }
  }
  return flags;
}

/** @param {CliFlags} flags */
function layersFromFlags(flags) {
  const all = allLayersOn();
  if (flags.noBiome) {
    all.biome = false;
  }
  if (flags.noEslint) {
    all.eslint = false;
    all.reactCompiler = false;
  }
  if (flags.noReactCompiler) {
    all.reactCompiler = false;
  }
  if (flags.noStyles) {
    all.stylelint = false;
  }
  return all;
}

/** @param {CliFlags} flags */
function hasExplicitLayerFlags(flags) {
  return (
    flags.noBiome ||
    flags.noEslint ||
    flags.noReactCompiler ||
    flags.noStyles
  );
}

/** @param {CliFlags} flags @returns {Promise<LayerSelection>} */
async function resolveLayers(flags) {
  if (flags.all || flags.nonInteractive) {
    return allLayersOn();
  }
  if (hasExplicitLayerFlags(flags)) {
    return layersFromFlags(flags);
  }
  if (process.stdin.isTTY) {
    return pickLayersInteractive(allLayersOn());
  }
  return allLayersOn();
}

/** @param {string} ref */
function parseRepoRef(ref) {
  const trimmed = ref.trim().replace(/\/$/, "");
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const url = trimmed.endsWith(".git") ? trimmed : `${trimmed}.git`;
    return { url, branch: "main" };
  }
  const [repo, branch = "main"] = trimmed.split("#");
  return { url: `https://github.com/${repo}.git`, branch };
}

/** @param {string} ref */
function cloneTemplateRepo(ref) {
  const { url, branch } = parseRepoRef(ref);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "node-lint-stack-"));
  const cloneDir = path.join(tmp, "repo");
  const result = spawnSync(
    "git",
    ["clone", "--depth", "1", "--branch", branch, url, cloneDir],
    { stdio: "inherit" },
  );
  if (result.status !== 0) {
    throw new Error(`git clone failed for ${ref}`);
  }
  return path.join(cloneDir, "template");
}

/** @param {string} templateDir @param {string} fileName */
function readTemplateText(templateDir, fileName) {
  return fs.readFileSync(path.join(templateDir, fileName), "utf8");
}

const NPMRC_LEGACY = "legacy-peer-deps=true\n";

/** ESLint 10 + eslint-plugin-jsx-a11y needs legacy peer resolution (see next-ocr). */
/** @param {string} targetDir @param {boolean} force */
function ensureLegacyPeerDepsNpmrc(targetDir, force) {
  const dest = path.join(targetDir, ".npmrc");
  if (fs.existsSync(dest) && !force) {
    const existing = fs.readFileSync(dest, "utf8");
    if (existing.includes("legacy-peer-deps")) {
      console.log("  skip (exists): .npmrc");
      return;
    }
    fs.writeFileSync(dest, `${existing.trimEnd()}\n${NPMRC_LEGACY}`);
    console.log("  updated: .npmrc (legacy-peer-deps=true)");
    return;
  }
  fs.writeFileSync(dest, NPMRC_LEGACY);
  console.log("  wrote: .npmrc");
}

/** @param {string} templateDir @param {string} targetDir @param {string} relPath @param {boolean} force */
function copyIfAllowed(templateDir, targetDir, relPath, force) {
  const src = path.join(templateDir, relPath);
  const dest = path.join(targetDir, relPath);
  if (!fs.existsSync(src)) {
    return;
  }
  if (fs.existsSync(dest) && !force) {
    console.log(`  skip (exists): ${relPath}`);
    return;
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  console.log(`  wrote: ${relPath}`);
}

/** @param {string} targetDir */
function readTargetPackageJson(targetDir) {
  const pkgPath = path.join(targetDir, "package.json");
  if (!fs.existsSync(pkgPath)) {
    throw new Error(`No package.json in ${targetDir}`);
  }
  return { pkgPath, pkg: JSON.parse(fs.readFileSync(pkgPath, "utf8")) };
}

/** @param {string} manifestPath */
function readManifest(manifestPath) {
  return JSON.parse(fs.readFileSync(manifestPath, "utf8"));
}

/** @param {Record<string, string>} scripts @param {LayerSelection} layers @param {string} srcDir @param {string} styleGlob */
function filterScripts(scripts, layers, srcDir, styleGlob) {
  /** @type {Record<string, string>} */
  const out = { ...scripts };
  for (const [key, value] of Object.entries(out)) {
    out[key] = value
      .replaceAll("__LINT_STACK_ESLINT_CLI__", srcDir)
      .replaceAll("__LINT_STACK_STYLE_GLOB__", styleGlob);
  }

  if (!layers.biome) {
    delete out["lint:biome"];
    delete out.format;
    delete out["format:unsafe"];
  }
  if (!layers.eslint) {
    delete out["lint:eslint"];
  }
  if (!layers.reactCompiler) {
    delete out["lint:react-compiler"];
  }
  if (!layers.stylelint) {
    delete out["lint:styles"];
  }

  if (Object.keys(out).filter((k) => k.startsWith("lint")).length > 0) {
    out.lint = "node scripts/lint.mjs";
  }

  return out;
}

/** @param {Record<string, string>} devDeps @param {LayerSelection} layers */
function filterDevDeps(devDeps, layers) {
  /** @type {Record<string, string>} */
  const out = { ...devDeps };

  if (!layers.biome) {
    delete out["@biomejs/biome"];
  }

  if (!layers.eslint) {
    delete out["@eslint/js"];
    delete out.eslint;
    delete out["eslint-plugin-jsx-a11y"];
    delete out["eslint-plugin-react"];
    delete out["eslint-plugin-sonarjs"];
    delete out["eslint-plugin-unicorn"];
    delete out["typescript-eslint"];
  }

  if (!layers.reactCompiler) {
    delete out["react-compiler-marker"];
    delete out["babel-plugin-react-compiler"];
    delete out["eslint-plugin-react-compiler"];
  }

  if (!layers.stylelint) {
    delete out.stylelint;
    delete out["stylelint-config-standard-scss"];
    delete out["postcss-scss"];
    delete out.colord;
    delete out.sass;
  }

  if (!layers.eslint && !layers.reactCompiler && !layers.stylelint && layers.biome) {
    delete out.typescript;
  }

  return out;
}

/** @param {string} templateDir @param {boolean} enableNext */
function buildBiomeJson(templateDir, enableNext) {
  let text = readTemplateText(templateDir, "biome.json");
  if (enableNext) {
    const snippet = readTemplateText(templateDir, "biome.next-snippet.json").trim();
    text = text.replace(
      `"react": "recommended"`,
      `"react": "recommended",\n      ${snippet}`,
    );
  }
  return text;
}

/** @param {string} text @param {boolean} withReactCompiler */
function buildEslintConfig(text, withReactCompiler) {
  if (withReactCompiler) {
    return text;
  }
  return text
    .replace(
      /import reactCompiler from "eslint-plugin-react-compiler";\n/,
      "",
    )
    .replace(/\s*"react-compiler": reactCompiler,\n/, "")
    .replace(/\s*"react-compiler\/react-compiler": "error",\n/, "");
}

/** @param {string} srcDir */
function eslintFileGlobs(srcDir) {
  const base = srcDir.replace(/\\/g, "/").replace(/\/$/, "");
  return [`${base}/**/*.{ts,tsx,mts,js,jsx,mjs,cjs}`];
}

/** @param {LayerSelection} layers */
function formatLayerSummary(layers) {
  const names = [];
  if (layers.biome) {
    names.push("Biome");
  }
  if (layers.eslint) {
    names.push("ESLint");
  }
  if (layers.reactCompiler) {
    names.push("React Compiler");
  }
  if (layers.stylelint) {
    names.push("Stylelint");
  }
  return names.join(" → ");
}

async function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    printHelp();
    process.exit(0);
  }

  const layers = await resolveLayers(flags);

  const targetDir = path.resolve(flags.dir ?? process.cwd());
  const srcDir = (flags.src ?? "src").replace(/\\/g, "/").replace(/\/$/, "");
  const styleGlob = `${srcDir}/**/*.{css,scss}`;
  const eslintCli = srcDir;
  const eslintFiles = eslintFileGlobs(srcDir);
  const eslintFilesJson = JSON.stringify(eslintFiles);

  let templateDir = path.join(packageRoot, "template");
  if (flags.from) {
    console.log(`Fetching template from ${flags.from}…`);
    templateDir = cloneTemplateRepo(flags.from);
  }

  if (!fs.existsSync(templateDir)) {
    throw new Error(`Template directory not found: ${templateDir}`);
  }

  const { pkgPath, pkg } = readTargetPackageJson(targetDir);
  const projectName =
    flags.name ?? (typeof pkg.name === "string" ? pkg.name : "project");

  const detectNext =
    flags.next ??
    (typeof pkg.dependencies?.next === "string" ||
      typeof pkg.devDependencies?.next === "string");

  const manifest = readManifest(path.join(packageRoot, "stack.manifest.json"));
  if (flags.from) {
    const remoteManifest = path.join(path.dirname(templateDir), "stack.manifest.json");
    if (fs.existsSync(remoteManifest)) {
      Object.assign(manifest, readManifest(remoteManifest));
    }
  }

  console.log(`\nInstalling into ${targetDir}`);
  console.log(`Layers: ${formatLayerSummary(layers)}\n`);

  const force = Boolean(flags.force);

  if (layers.biome) {
    const dest = path.join(targetDir, "biome.json");
    if (fs.existsSync(dest) && !force) {
      console.log("  skip (exists): biome.json");
    } else {
      fs.writeFileSync(dest, buildBiomeJson(templateDir, detectNext));
      console.log("  wrote: biome.json");
    }
  }

  if (layers.eslint) {
    ensureLegacyPeerDepsNpmrc(targetDir, force);
    let eslintText = readTemplateText(templateDir, "eslint.config.mjs");
    eslintText = buildEslintConfig(
      eslintText.replace("__LINT_STACK_ESLINT_FILES_ARRAY__", eslintFilesJson),
      layers.reactCompiler,
    );
    const eslintDest = path.join(targetDir, "eslint.config.mjs");
    if (fs.existsSync(eslintDest) && !force) {
      console.log("  skip (exists): eslint.config.mjs");
    } else {
      fs.writeFileSync(eslintDest, eslintText);
      console.log("  wrote: eslint.config.mjs");
    }
    copyIfAllowed(templateDir, targetDir, "eslint.sonar-extended.mjs", force);
  }

  if (layers.stylelint) {
    copyIfAllowed(templateDir, targetDir, "stylelint.config.mjs", force);
    copyIfAllowed(templateDir, targetDir, "stylelint.sonar-contrast.mjs", force);
  }

  {
    let stackText = readTemplateText(templateDir, ".lint-stack.json");
    stackText = stackText
      .replaceAll("__LINT_STACK_PROJECT_NAME__", projectName)
      .replaceAll("__LINT_STACK_ESLINT_FILES__", eslintFilesJson)
      .replaceAll("__LINT_STACK_ESLINT_CLI__", eslintCli)
      .replaceAll("__LINT_STACK_STYLE_GLOB__", styleGlob)
      .replaceAll("__LINT_STACK_BIOME__", String(layers.biome))
      .replaceAll("__LINT_STACK_ESLINT__", String(layers.eslint))
      .replaceAll("__LINT_STACK_REACT_COMPILER__", String(layers.reactCompiler))
      .replaceAll("__LINT_STACK_STYLELINT__", String(layers.stylelint))
      .replaceAll("__LINT_STACK_BIOME_NEXT__", String(detectNext && layers.biome));
    const dest = path.join(targetDir, ".lint-stack.json");
    if (fs.existsSync(dest) && !force) {
      console.log("  skip (exists): .lint-stack.json");
    } else {
      fs.writeFileSync(dest, stackText);
      console.log("  wrote: .lint-stack.json");
    }
  }

  copyIfAllowed(templateDir, targetDir, "scripts/lint.mjs", force);

  const mergedScripts = filterScripts(
    manifest.scripts,
    layers,
    srcDir,
    styleGlob,
  );
  pkg.scripts = { ...pkg.scripts, ...mergedScripts };
  pkg.devDependencies = {
    ...pkg.devDependencies,
    ...filterDevDeps(manifest.devDependencies, layers),
  };
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log("  merged: package.json scripts + devDependencies");

  if (!flags.noInstall) {
    console.log("\nRunning npm install…\n");
    const installArgs = ["install"];
    if (layers.eslint) {
      installArgs.push("--legacy-peer-deps");
    }
    const install = spawnSync("npm", installArgs, {
      cwd: targetDir,
      stdio: "inherit",
      shell: true,
    });
    if (install.status !== 0) {
      process.exit(install.status ?? 1);
    }
  }

  console.log("\nDone. Run: npm run lint\n");
}

main().catch((err) => {
  if (err instanceof Error && err.message === "Cancelled") {
    process.exit(130);
  }
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
