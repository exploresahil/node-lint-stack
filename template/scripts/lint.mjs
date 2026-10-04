#!/usr/bin/env node
/**
 * Lint pipeline TUI — reads .lint-stack.json for enabled layers.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/** @typedef {{ projectName?: string; layers?: { biome?: boolean; eslint?: boolean; reactCompiler?: boolean; stylelint?: boolean } }} LintStackConfig */

/** @returns {LintStackConfig} */
function readStackConfig() {
  const configPath = path.join(projectRoot, ".lint-stack.json");
  try {
    return JSON.parse(fs.readFileSync(configPath, "utf8"));
  } catch {
    return {
      projectName: "project",
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

/** @type {ReadonlyArray<{ id: string; short: string; label: string; npmScript: string; enabled: boolean }>} */
const ALL_LAYERS = [
  {
    id: "biome",
    short: "Biome",
    label: "Format + lint",
    npmScript: "lint:biome",
    enabled: stack.layers?.biome !== false,
  },
  {
    id: "eslint",
    short: "ESLint",
    label: "SonarJS + React Compiler plugin",
    npmScript: "lint:eslint",
    enabled: stack.layers?.eslint !== false,
  },
  {
    id: "react-compiler",
    short: "Compiler",
    label: "react-compiler-marker",
    npmScript: "lint:react-compiler",
    enabled: stack.layers?.reactCompiler !== false,
  },
  {
    id: "stylelint",
    short: "Stylelint",
    label: "SCSS / CSS",
    npmScript: "lint:styles",
    enabled: stack.layers?.stylelint !== false,
  },
];

const LAYERS = ALL_LAYERS.filter((layer) => layer.enabled);

const BOX_INNER = 58;

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

function printBanner() {
  const top = tone.cyan(`╭${"─".repeat(BOX_INNER + 2)}╮`);
  const row = (content) => tone.cyan("│ ") + padLine(content) + tone.cyan(" │");
  const bottom = tone.cyan(`╰${"─".repeat(BOX_INNER + 2)}╯`);

  console.log(top);
  console.log(row(tone.bold(`${projectLabel} · lint`)));
  console.log(row(tone.dim("Biome → ESLint → React Compiler → Stylelint")));
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

function runLayer(layer, index, total) {
  const step = `${index + 1}/${total}`;
  console.log(
    `${progressBar(index, total)} ${tone.bold(step)} ${tone.bold(layer.short)} ${tone.dim(`· ${layer.label}`)}`,
  );
  console.log(tone.dim(`           npm run ${layer.npmScript}`));
  console.log("");

  const started = Date.now();
  const prefix = tone.dim("  │ ");

  return new Promise((resolve) => {
    const child = spawn(`npm run ${layer.npmScript}`, {
      cwd: projectRoot,
      shell: true,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });

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

function printSummary(results) {
  const total = LAYERS.length;
  const passed = results.filter((r) => r.ok).length;
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
  if (failed.length === 0 && passed === total) {
    console.log(
      `  ${tone.green("✔")} All ${total} layers passed ${tone.dim(`(${passed}/${total})`)}`,
    );
    console.log("");
    return 0;
  }

  console.log(
    `  ${tone.red("✖")} ${failed.length} failed ${tone.dim(`(${passed}/${total} passed)`)}`,
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

  printBanner();

  const results = [];

  for (let i = 0; i < LAYERS.length; i += 1) {
    const outcome = await runLayer(LAYERS[i], i, LAYERS.length);
    results.push(outcome);
  }

  process.exit(printSummary(results));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
