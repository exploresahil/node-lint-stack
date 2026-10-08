#!/usr/bin/env node
/**
 * Lint pipeline TUI — .lint-stack.json layers, optional paths, monorepo lintRoots.
 *
 *   npm run lint
 *   npm run lint -- src/foo.tsx
 *   npm run lint -- apps/web/src/bar.tsx packages/ui/src/x.scss
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** @typedef {{ path: string; src?: string }} StackPackage */
/** @typedef {{
 *   projectName?: string;
 *   eslintCli?: string;
 *   styleGlob?: string;
 *   lintRoots?: string[];
 *   packages?: StackPackage[];
 *   layers?: { biome?: boolean; eslint?: boolean; reactCompiler?: boolean; stylelint?: boolean };
 * }} LintStackConfig */

/** @returns {LintStackConfig} */
function readStackConfig() {
  const configPath = path.join(projectRoot, ".lint-stack.json");
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return {
      projectName: "project",
      eslintCli: "src",
      lintRoots: ["src"],
      layers: {
        biome: true,
        eslint: true,
        reactCompiler: true,
        stylelint: true,
      },
    };
  }
}

const stack = readStackConfig();
const projectLabel = stack.projectName ?? "project";

const BIOME_EXT = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".json",
  ".css",
]);
const ESLINT_EXT = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".mts"]);
const STYLE_EXT = new Set([".css", ".scss"]);
const REACT_COMPILER_EXT = new Set([".tsx", ".jsx"]);

const useColor = Boolean(process.stdout.isTTY && process.env.NO_COLOR == null);

/** @param {string} code @param {string} text */
function paint(code, text) {
  if (!useColor) {
    return text;
  }
  return `\u001b[${code}m${text}\u001b[0m`;
}

const tone = {
  bold: (t) => paint("1", t),
  dim: (t) => paint("2", t),
  cyan: (t) => paint("36", t),
  green: (t) => paint("32", t),
  red: (t) => paint("31", t),
  yellow: (t) => paint("33", t),
};

/** @type {ReadonlyArray<{ id: string; short: string; label: string; enabled: boolean }>} */
const LAYERS = [
  {
    id: "biome",
    short: "Biome",
    label: "Format + lint",
    enabled: stack.layers?.biome !== false,
  },
  {
    id: "eslint",
    short: "ESLint",
    label: "SonarJS + React Compiler plugin",
    enabled: stack.layers?.eslint !== false,
  },
  {
    id: "react-compiler",
    short: "Compiler",
    label: "react-compiler-marker",
    enabled: stack.layers?.reactCompiler !== false,
  },
  {
    id: "stylelint",
    short: "Stylelint",
    label: "SCSS / CSS",
    enabled: stack.layers?.stylelint !== false,
  },
].filter((layer) => layer.enabled);

const BOX_INNER = 58;

/** @param {string[]} argv */
function cliPathArgs(argv) {
  return argv.filter((arg) => !arg.startsWith("-"));
}

/** @param {string} p */
function toPosixRel(p) {
  const rel = path.isAbsolute(p) ? path.relative(projectRoot, p) : p;
  return rel.split(path.sep).join("/");
}

/** @returns {string[]} */
function defaultLintRoots() {
  if (stack.lintRoots?.length) {
    return stack.lintRoots.map((r) => r.replace(/\\/g, "/").replace(/\/$/, ""));
  }
  const cli = (stack.eslintCli ?? "src").replace(/\\/g, "/").replace(/\/$/, "");
  return [cli];
}

/** @param {string} relPosix */
function packageRootForFile(relPosix) {
  const packages = stack.packages ?? [];
  let best = null;
  for (const pkg of packages) {
    const prefix = pkg.path.replace(/\\/g, "/").replace(/\/$/, "");
    if (relPosix === prefix || relPosix.startsWith(`${prefix}/`)) {
      if (!best || prefix.length > best.path.length) {
        best = pkg;
      }
    }
  }
  return best?.path.replace(/\\/g, "/") ?? ".";
}

/** @param {string[]} userPaths posix rel */
function markerScanRoot(userPaths) {
  if (userPaths.length === 0) {
    return ".";
  }
  const pkgRoots = new Set(
    userPaths.map((p) => packageRootForFile(p)).filter((r) => r !== "."),
  );
  if (pkgRoots.size === 1) {
    return [...pkgRoots][0];
  }
  if (pkgRoots.size > 1) {
    return ".";
  }
  const first = userPaths[0];
  const parts = first.split("/");
  const srcIdx = parts.indexOf("src");
  if (srcIdx >= 0) {
    return parts.slice(0, srcIdx + 1).join("/");
  }
  const dir = path.posix.dirname(first);
  return dir === "." ? "." : dir;
}

/** @param {string[]} relPaths posix */
function extFilter(relPaths, extSet) {
  return relPaths.filter((p) => extSet.has(path.posix.extname(p)));
}

/** @type {Record<string, [packageName: string, binRelative: string]>} */
const TOOL_CLI = {
  biome: ["@biomejs/biome", "bin/biome"],
  eslint: ["eslint", "bin/eslint.js"],
  stylelint: ["stylelint", "bin/stylelint.mjs"],
  "react-compiler-marker": ["react-compiler-marker", "bin/cli.js"],
};

/** @param {string} tool @param {string[]} args */
function spawnCli(tool, args) {
  const spec = TOOL_CLI[tool];
  if (!spec) {
    throw new Error(`Unknown lint tool: ${tool}`);
  }
  const [pkg, rel] = spec;
  const entry = path.join(projectRoot, "node_modules", pkg, rel);
  return spawn(process.execPath, [entry, ...args], {
    cwd: projectRoot,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** Marker resolves babel-plugin from the scan directory; always use the repo root install. */
function reactCompilerMarkerArgs(scanRoot) {
  /** @type {string[]} */
  const args = [scanRoot];
  const pluginPath = path.join(
    projectRoot,
    "node_modules",
    "babel-plugin-react-compiler",
  );
  if (fs.existsSync(pluginPath)) {
    args.push("--babel-plugin-path", pluginPath);
  }
  return args;
}

/** --max-warnings gate from .lint-stack.json: number (default 0), null disables. */
function maxWarningsArgs() {
  const value = stack.maxWarnings;
  if (value === null) {
    return [];
  }
  return ["--max-warnings", String(typeof value === "number" ? value : 0)];
}

/** @param {string} relPosix */
function assertUnderProject(relPosix) {
  const abs = path.resolve(projectRoot, relPosix);
  const rel = path.relative(projectRoot, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    throw new Error(`Path escapes project root: ${relPosix}`);
  }
}

/**
 * @param {string[]} argv
 * @returns {{ mode: 'full' | 'files'; paths: string[]; roots: string[] }}
 */
function buildLintPlan(argv) {
  const roots = defaultLintRoots();
  const raw = cliPathArgs(argv);
  if (raw.length === 0) {
    return { mode: "full", paths: [], roots };
  }
  const paths = raw
    .map((p) => {
      const rel = toPosixRel(p);
      assertUnderProject(rel);
      return rel;
    })
    .filter((rel) => {
      if (fs.existsSync(path.resolve(projectRoot, rel))) {
        return true;
      }
      console.log(`skip (not found): ${rel}`);
      return false;
    });
  return { mode: "files", paths, roots };
}

/**
 * @param {string} layerId
 * @param {{ mode: 'full' | 'files'; paths: string[]; roots: string[] }} plan
 * @returns {{ skip?: boolean; skipReason?: string; tool: string; args: string[]; label: string } | null}
 */
function layerInvocation(layerId, plan) {
  if (layerId === "biome") {
    if (plan.mode === "full") {
      return {
        tool: "biome",
        args: ["check", ...plan.roots],
        label: `biome check ${plan.roots.join(" ")}`,
      };
    }
    const files = extFilter(plan.paths, BIOME_EXT);
    if (files.length === 0) {
      return { skip: true, skipReason: "no Biome-compatible files in path list" };
    }
    return {
      tool: "biome",
      args: ["check", ...files],
      label: `biome check ${files.join(" ")}`,
    };
  }

  if (layerId === "eslint") {
    if (plan.mode === "full") {
      const args = [...plan.roots, ...maxWarningsArgs()];
      return {
        tool: "eslint",
        args,
        label: `eslint ${args.join(" ")}`,
      };
    }
    const files = extFilter(plan.paths, ESLINT_EXT);
    if (files.length === 0) {
      return { skip: true, skipReason: "no ESLint-compatible files in path list" };
    }
    const args = [...files, ...maxWarningsArgs()];
    return {
      tool: "eslint",
      args,
      label: `eslint ${args.join(" ")}`,
    };
  }

  if (layerId === "react-compiler") {
    if (plan.mode === "files") {
      const files = extFilter(plan.paths, REACT_COMPILER_EXT);
      if (files.length === 0) {
        return { skip: true, skipReason: "no TSX/JSX in path list" };
      }
    }
    const scanRoot = plan.mode === "files" ? markerScanRoot(plan.paths) : ".";
    const args = reactCompilerMarkerArgs(scanRoot);
    return {
      tool: "react-compiler-marker",
      args,
      label: `react-compiler-marker ${args.join(" ")}`,
    };
  }

  if (layerId === "stylelint") {
    if (plan.mode === "full") {
      const globs = plan.roots.map((r) => `${r}/**/*.{css,scss}`);
      if (stack.styleGlob && plan.roots.length === 1) {
        return {
          tool: "stylelint",
          args: [stack.styleGlob],
          label: `stylelint ${stack.styleGlob}`,
        };
      }
      return {
        tool: "stylelint",
        args: globs,
        label: `stylelint ${globs.join(" ")}`,
      };
    }
    const files = extFilter(plan.paths, STYLE_EXT);
    if (files.length === 0) {
      return { skip: true, skipReason: "no CSS/SCSS in path list" };
    }
    return {
      tool: "stylelint",
      args: files,
      label: `stylelint ${files.join(" ")}`,
    };
  }

  return null;
}

function stripAnsi(text) {
  let out = "";
  for (let i = 0; i < text.length; i += 1) {
    if (text.charCodeAt(i) === 0x1b && text[i + 1] === "[") {
      i += 2;
      while (i < text.length && text[i] !== "m") {
        i += 1;
      }
      continue;
    }
    out += text[i];
  }
  return out;
}

function padLine(text) {
  const pad = Math.max(0, BOX_INNER - stripAnsi(text).length);
  return `${text}${" ".repeat(pad)}`;
}

/** @param {{ mode: string; paths: string[] }} plan */
function printBanner(plan) {
  const top = tone.cyan(`╭${"─".repeat(BOX_INNER + 2)}╮`);
  const row = (content) => tone.cyan("│ ") + padLine(content) + tone.cyan(" │");
  const bottom = tone.cyan(`╰${"─".repeat(BOX_INNER + 2)}╯`);

  console.log(top);
  console.log(row(tone.bold(`${projectLabel} · lint`)));
  if (plan.mode === "files") {
    const hint =
      plan.paths.length === 1
        ? plan.paths[0]
        : `${plan.paths.length} paths`;
    console.log(row(tone.dim(`scoped · ${hint}`)));
  } else if (defaultLintRoots().length > 1) {
    console.log(row(tone.dim(`monorepo · ${defaultLintRoots().join(", ")}`)));
  } else {
    console.log(row(tone.dim("Biome → ESLint → React Compiler → Stylelint")));
  }
  console.log(bottom);
  console.log("");
}

function progressBar(doneSteps, totalSteps, width = 20) {
  const ratio = totalSteps > 0 ? doneSteps / totalSteps : 0;
  const filled = Math.min(width, Math.max(0, Math.round(ratio * width)));
  const bar = `${"█".repeat(filled)}${"░".repeat(width - filled)}`;
  return tone.cyan(`[${bar}]`);
}

function formatDuration(ms) {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(2)}s`;
}

/**
 * @param {typeof LAYERS[number]} layer
 * @param {number} index
 * @param {number} total
 * @param {{ skip?: boolean; skipReason?: string; tool: string; args: string[]; label: string }} invocation
 */
function runLayer(layer, index, total, invocation) {
  const step = `${index + 1}/${total}`;
  console.log(
    `${progressBar(index, total)} ${tone.bold(step)} ${tone.bold(layer.short)} ${tone.dim(`· ${layer.label}`)}`,
  );

  if (invocation.skip) {
    console.log(
      tone.dim(`           skipped · ${invocation.skipReason ?? "n/a"}`),
    );
    console.log("");
    console.log(
      `  ${tone.yellow("○")} ${layer.short} ${tone.dim(`skipped · ${invocation.skipReason ?? "n/a"}`)}`,
    );
    console.log("");
    return Promise.resolve({
      id: layer.id,
      short: layer.short,
      ok: true,
      skipped: true,
      duration: "—",
      code: 0,
    });
  }

  console.log(tone.dim(`           ${invocation.label}`));
  console.log("");

  const started = Date.now();
  const prefix = tone.dim("  │ ");

  return new Promise((resolve) => {
    const child = spawnCli(invocation.tool, invocation.args);

    function pipeStream(stream) {
      stream.on("data", (chunk) => {
        const text = chunk.toString();
        const lines = text.split(/\r?\n/);
        for (let i = 0; i < lines.length; i += 1) {
          const line = lines[i];
          const isLastPartial = i === lines.length - 1 && !text.endsWith("\n");
          if (line.length === 0 && !isLastPartial) {
            process.stdout.write("\n");
            continue;
          }
          if (line.length > 0) {
            process.stdout.write(`${prefix}${line}\n`);
          }
        }
      });
    }

    pipeStream(child.stdout);
    pipeStream(child.stderr);

    child.on("error", (err) => {
      console.log("");
      console.log(`  ${tone.red("✖")} ${layer.short} ${tone.red(String(err.message))}`);
      console.log("");
      resolve({
        id: layer.id,
        short: layer.short,
        ok: false,
        skipped: false,
        duration: formatDuration(Date.now() - started),
        code: 1,
      });
    });

    child.on("close", (code) => {
      const duration = formatDuration(Date.now() - started);
      const exitCode = code ?? 1;
      const ok = exitCode === 0;
      console.log("");
      if (ok) {
        console.log(
          `  ${tone.green("✔")} ${layer.short} ${tone.dim(`passed · ${duration}`)}`,
        );
      } else {
        console.log(
          `  ${tone.red("✖")} ${layer.short} ${tone.red(`failed · exit ${exitCode} · ${duration}`)}`,
        );
      }
      console.log("");
      resolve({
        id: layer.id,
        short: layer.short,
        ok,
        skipped: false,
        duration,
        code: exitCode,
      });
    });
  });
}

/** @param {Array<{ short: string; ok: boolean; skipped?: boolean; duration: string }>} results */
function printSummary(results) {
  const total = LAYERS.length;
  const passed = results.filter((r) => r.ok && !r.skipped).length;
  const skipped = results.filter((r) => r.skipped).length;
  const failed = results.filter((r) => !r.ok && !r.skipped);

  console.log(tone.cyan(`${"─".repeat(BOX_INNER + 4)}`));
  console.log(tone.bold(" Summary"));
  console.log("");

  const colW = 12;
  for (const [i, r] of results.entries()) {
    const layer = LAYERS[i];
    let status = tone.green("PASS");
    if (r.skipped) {
      status = tone.yellow("SKIP");
    } else if (!r.ok) {
      status = tone.red("FAIL");
    }
    const name = layer.short.padEnd(colW);
    console.log(`  ${status}  ${name} ${tone.dim(r.duration)}`);
  }

  console.log("");
  if (failed.length === 0) {
    console.log(
      `  ${tone.green("✔")} ${passed} passed${skipped ? tone.dim(`, ${skipped} skipped`) : ""} ${tone.dim(`(${total} layers)`)}`,
    );
    console.log("");
    return 0;
  }

  console.log(
    `  ${tone.red("✖")} ${failed.length} failed ${tone.dim(`(${passed}/${total - skipped} ran)`)}`,
  );
  console.log(tone.dim("  ↑ scroll to the first ✖ block for tool output"));
  console.log("");
  return 1;
}

async function main() {
  if (LAYERS.length === 0) {
    console.error("No lint layers enabled in .lint-stack.json");
    process.exit(1);
  }

  let plan;
  try {
    plan = buildLintPlan(process.argv.slice(2));
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }

  printBanner(plan);

  const results = [];

  for (let i = 0; i < LAYERS.length; i += 1) {
    const layer = LAYERS[i];
    const invocation = layerInvocation(layer.id, plan);
    if (!invocation) {
      continue;
    }
    const outcome = await runLayer(layer, i, LAYERS.length, invocation);
    results.push(outcome);
  }

  process.exit(printSummary(results));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
