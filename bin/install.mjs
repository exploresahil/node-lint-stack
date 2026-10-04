#!/usr/bin/env node
/**
 * Copy lint stack into a Node project and merge package.json scripts + devDependencies.
 *
 * Usage:
 *   npx github:exploresahil/node-lint-stack
 *   node path/to/install.mjs --dir ./my-app --from exploresahil/node-lint-stack
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** @typedef {{ dir?: string; from?: string; src?: string; name?: string; next?: boolean; noStyles?: boolean; noReactCompiler?: boolean; force?: boolean; noInstall?: boolean; help?: boolean }} CliFlags */

function printHelp() {
  console.log(`node-lint-stack — install lint configs into a Node project

Usage:
  npx github:OWNER/node-lint-stack [options]
  node bin/install.mjs [options]

Options:
  --dir <path>           Target project (default: cwd)
  --from <owner/repo>    Template source (default: bundled template/)
                         Examples: exploresahil/node-lint-stack#main
  --src <dir>            Source folder for ESLint/stylelint (default: src)
  --name <label>         Banner name (default: package.json name)
  --next                 Enable Biome "next" domain (Next.js apps)
  --no-styles            Skip Stylelint files and layer
  --no-react-compiler    Skip react-compiler-marker layer
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
    if (arg === "--force") {
      flags.force = true;
      continue;
    }
    if (arg === "--no-install") {
      flags.noInstall = true;
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

/** @param {string} targetDir @param {string} relPath @param {boolean} force */
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

/** @param {Record<string, string>} scripts @param {CliFlags} flags @param {string} srcDir @param {string} styleGlob */
function filterScripts(scripts, flags, srcDir, styleGlob) {
  /** @type {Record<string, string>} */
  const out = { ...scripts };
  for (const [key, value] of Object.entries(out)) {
    out[key] = value
      .replaceAll("__LINT_STACK_ESLINT_CLI__", srcDir)
      .replaceAll("__LINT_STACK_STYLE_GLOB__", styleGlob);
  }
  if (flags.noReactCompiler) {
    delete out["lint:react-compiler"];
  }
  if (flags.noStyles) {
    delete out["lint:styles"];
  }
  return out;
}

/** @param {Record<string, string>} devDeps @param {CliFlags} flags */
function filterDevDeps(devDeps, flags) {
  /** @type {Record<string, string>} */
  const out = { ...devDeps };
  if (flags.noReactCompiler) {
    delete out["react-compiler-marker"];
    delete out["babel-plugin-react-compiler"];
    delete out["eslint-plugin-react-compiler"];
  }
  if (flags.noStyles) {
    delete out.stylelint;
    delete out["stylelint-config-standard-scss"];
    delete out["postcss-scss"];
    delete out.colord;
    delete out.sass;
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

/** @param {string} srcDir */
function eslintFileGlobs(srcDir) {
  const base = srcDir.replace(/\\/g, "/").replace(/\/$/, "");
  return [`${base}/**/*.{ts,tsx,mts,js,jsx,mjs,cjs}`];
}

function main() {
  const flags = parseArgs(process.argv.slice(2));
  if (flags.help) {
    printHelp();
    process.exit(0);
  }

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

  console.log(`\nInstalling lint stack into ${targetDir}\n`);

  const force = Boolean(flags.force);
  const rootFiles = [
    ".lint-stack.json",
    "eslint.config.mjs",
    "eslint.sonar-extended.mjs",
    "biome.json",
  ];
  if (!flags.noStyles) {
    rootFiles.push("stylelint.config.mjs", "stylelint.sonar-contrast.mjs");
  }
  for (const file of rootFiles) {
    if (file === "biome.json") {
      const dest = path.join(targetDir, "biome.json");
      if (fs.existsSync(dest) && !force) {
        console.log("  skip (exists): biome.json");
      } else {
        fs.writeFileSync(dest, buildBiomeJson(templateDir, detectNext));
        console.log("  wrote: biome.json");
      }
      continue;
    }
    if (file === ".lint-stack.json") {
      let stackText = readTemplateText(templateDir, ".lint-stack.json");
      stackText = stackText
        .replaceAll("__LINT_STACK_PROJECT_NAME__", projectName)
        .replaceAll("__LINT_STACK_ESLINT_FILES__", eslintFilesJson)
        .replaceAll("__LINT_STACK_ESLINT_CLI__", eslintCli)
        .replaceAll("__LINT_STACK_STYLE_GLOB__", styleGlob)
        .replaceAll("__LINT_STACK_REACT_COMPILER__", String(!flags.noReactCompiler))
        .replaceAll("__LINT_STACK_STYLELINT__", String(!flags.noStyles))
        .replaceAll("__LINT_STACK_BIOME_NEXT__", String(detectNext));
      const dest = path.join(targetDir, ".lint-stack.json");
      if (fs.existsSync(dest) && !force) {
        console.log("  skip (exists): .lint-stack.json");
      } else {
        fs.writeFileSync(dest, stackText);
        console.log("  wrote: .lint-stack.json");
      }
      continue;
    }
    if (file === "eslint.config.mjs") {
      let eslintText = readTemplateText(templateDir, "eslint.config.mjs");
      eslintText = eslintText.replace(
        "__LINT_STACK_ESLINT_FILES_ARRAY__",
        eslintFilesJson,
      );
      const dest = path.join(targetDir, file);
      if (fs.existsSync(dest) && !force) {
        console.log(`  skip (exists): ${file}`);
      } else {
        fs.writeFileSync(dest, eslintText);
        console.log(`  wrote: ${file}`);
      }
      continue;
    }
    copyIfAllowed(templateDir, targetDir, file, force);
  }

  copyIfAllowed(templateDir, targetDir, "scripts/lint.mjs", force);

  pkg.scripts = { ...pkg.scripts, ...filterScripts(manifest.scripts, flags, srcDir, styleGlob) };
  pkg.devDependencies = {
    ...pkg.devDependencies,
    ...filterDevDeps(manifest.devDependencies, flags),
  };
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  console.log("  merged: package.json scripts + devDependencies");

  if (!flags.noInstall) {
    console.log("\nRunning npm install…\n");
    const install = spawnSync("npm", ["install"], {
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

try {
  main();
} catch (err) {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
}
