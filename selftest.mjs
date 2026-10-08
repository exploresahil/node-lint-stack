#!/usr/bin/env node
/**
 * Installer self-test: derives lint roots for independent repos, submodule-style
 * multi-package repos, npm workspaces monorepos, and bare root-code repos.
 * Run: npm test
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(fileURLToPath(import.meta.url));
const installer = path.join(repoRoot, "bin", "install.mjs");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lint-stack-selftest-"));

let failures = 0;

/** @param {string} name @param {boolean} cond @param {string} [detail] */
function check(name, cond, detail) {
  if (cond) {
    console.log(`  ok: ${name}`);
  } else {
    failures += 1;
    console.error(`  FAIL: ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** @param {string} rel @param {string} text */
function write(rel, text) {
  const abs = path.join(tmp, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text);
}

/** @param {string} dir @param {string[]} [extraArgs] */
function install(dir, extraArgs = []) {
  const res = spawnSync(
    process.execPath,
    [installer, "--dir", path.join(tmp, dir), "--all", "--no-install", ...extraArgs],
    { encoding: "utf8" },
  );
  if (res.status !== 0) {
    throw new Error(`installer failed in ${dir}:\n${res.stdout}\n${res.stderr}`);
  }
  return res.stdout;
}

/** @param {string} dir */
function stackJson(dir) {
  return JSON.parse(fs.readFileSync(path.join(tmp, dir, ".lint-stack.json"), "utf8"));
}

/** @param {string} dir */
function scriptsOf(dir) {
  return JSON.parse(fs.readFileSync(path.join(tmp, dir, "package.json"), "utf8")).scripts;
}

// A — independent repo: src/ + scripts/
console.log("independent repo");
write("independent/package.json", JSON.stringify({ name: "indep" }));
write("independent/src/app.ts", "export {};\n");
write("independent/scripts/build.js", "console.log(1);\n");
install("independent");
let s = stackJson("independent");
check(
  "roots = src + scripts",
  JSON.stringify(s.lintRoots) === JSON.stringify(["src", "scripts"]),
  JSON.stringify(s.lintRoots),
);
check("maxWarnings defaults to 0", s.maxWarnings === 0, String(s.maxWarnings));
let scripts = scriptsOf("independent");
check(
  "lint:eslint uses real roots + gate",
  scripts["lint:eslint"] === "eslint src scripts --max-warnings 0",
  scripts["lint:eslint"],
);
check(
  "lint:styles quotes each glob",
  scripts["lint:styles"] ===
    'stylelint "src/**/*.{css,scss}" "scripts/**/*.{css,scss}"',
  scripts["lint:styles"],
);

// B — submodule-style multi-package repo: no workspaces, no root src
console.log("sibling packages (no workspaces)");
write("sibling/package.json", JSON.stringify({ name: "sibling-root" }));
write("sibling/api-server/package.json", JSON.stringify({ name: "api" }));
write("sibling/api-server/server.js", "module.exports = {};\n");
write("sibling/app-ui/package.json", JSON.stringify({ name: "ui" }));
write("sibling/app-ui/src/main.ts", "export {};\n");
write("sibling/scripts/lint.js", "console.log(2);\n");
install("sibling");
s = stackJson("sibling");
check(
  "roots = pkg, pkg/src, scripts",
  JSON.stringify(s.lintRoots) ===
    JSON.stringify(["api-server", "app-ui/src", "scripts"]),
  JSON.stringify(s.lintRoots),
);
check(
  "packages recorded for marker scoping",
  JSON.stringify(s.packages) ===
    JSON.stringify([
      { path: "api-server", src: "src" },
      { path: "app-ui", src: "src" },
    ]),
  JSON.stringify(s.packages),
);
scripts = scriptsOf("sibling");
check(
  "lint:eslint uses real roots",
  scripts["lint:eslint"] ===
    "eslint api-server app-ui/src scripts --max-warnings 0",
  scripts["lint:eslint"],
);

// C — npm workspaces monorepo + root scripts/
console.log("npm workspaces monorepo");
write("workspace/package.json", JSON.stringify({ name: "mono", workspaces: ["packages/*"] }));
write("workspace/packages/a/package.json", JSON.stringify({ name: "a" }));
write("workspace/packages/a/src/x.ts", "export {};\n");
write("workspace/packages/b/package.json", JSON.stringify({ name: "b" }));
write("workspace/packages/b/y.js", "module.exports = 1;\n");
write("workspace/scripts/z.js", "console.log(3);\n");
install("workspace");
s = stackJson("workspace");
check(
  "roots = pkg/src, pkg, scripts",
  JSON.stringify(s.lintRoots) ===
    JSON.stringify(["packages/a/src", "packages/b", "scripts"]),
  JSON.stringify(s.lintRoots),
);
scripts = scriptsOf("workspace");
check(
  "lint:eslint uses workspace roots (not src)",
  scripts["lint:eslint"] === "eslint packages/a/src packages/b scripts --max-warnings 0",
  scripts["lint:eslint"],
);

// D — repo already owns eslint.config.js
console.log("repo-owned eslint config");
write("ownconfig/package.json", JSON.stringify({ name: "own" }));
write("ownconfig/eslint.config.js", "export default [];\n");
write("ownconfig/src/a.ts", "export {};\n");
const outOwn = install("ownconfig");
check("keeps repo config", outOwn.includes("keep (repo config wins): eslint.config.js"));
check("does not write shadowed .mjs", !fs.existsSync(path.join(tmp, "ownconfig", "eslint.config.mjs")));
check(
  "does not write orphan sonar-extended",
  !fs.existsSync(path.join(tmp, "ownconfig", "eslint.sonar-extended.mjs")),
);

// E — bare repo, code at the root
console.log("bare repo (code at root)");
write("bare/package.json", JSON.stringify({ name: "bare" }));
write("bare/index.js", "module.exports = 1;\n");
install("bare");
s = stackJson("bare");
check(
  "roots = repo root",
  JSON.stringify(s.lintRoots) === JSON.stringify(["."]),
  JSON.stringify(s.lintRoots),
);
check(
  "eslint glob has no ./ prefix",
  s.eslintFiles[0] === "**/*.{ts,tsx,mts,js,jsx,mjs,cjs}",
  JSON.stringify(s.eslintFiles),
);

// F -- --src forces a single root
console.log("--src override");
write("forced/package.json", JSON.stringify({ name: "forced" }));
write("forced/app/index.js", "module.exports = 1;\n");
write("forced/tools/package.json", JSON.stringify({ name: "tools" }));
install("forced", ["--src", "app"]);
s = stackJson("forced");
check(
  "single forced root",
  JSON.stringify(s.lintRoots) === JSON.stringify(["app"]),
  JSON.stringify(s.lintRoots),
);

// G — maxWarnings policy survives reinstall
console.log("maxWarnings policy preservation");
write("policy/package.json", JSON.stringify({ name: "policy" }));
write("policy/.lint-stack.json", JSON.stringify({ maxWarnings: null }));
write("policy/src/a.ts", "export {};\n");
install("policy", ["--force"]);
s = stackJson("policy");
check("maxWarnings: null preserved", s.maxWarnings === null, JSON.stringify(s.maxWarnings));
scripts = scriptsOf("policy");
check(
  "lint:eslint has no --max-warnings",
  scripts["lint:eslint"] === "eslint src",
  scripts["lint:eslint"],
);

fs.rmSync(tmp, { recursive: true, force: true });

if (failures > 0) {
  console.error(`\n${failures} check(s) failed`);
  process.exit(1);
}
console.log("\nall checks passed");
