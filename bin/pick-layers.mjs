#!/usr/bin/env node
/**
 * Checkbox TUI: ↑↓ navigate, Space toggle, Enter confirm.
 * @returns {Promise<{ biome: boolean; eslint: boolean; reactCompiler: boolean; stylelint: boolean }>}
 */
import readline from "node:readline";

/** @typedef {{ biome: boolean; eslint: boolean; reactCompiler: boolean; stylelint: boolean }} LayerSelection */

/** @type {LayerSelection} */
export function allLayersOn() {
  return {
    biome: true,
    eslint: true,
    reactCompiler: true,
    stylelint: true,
  };
}

const ROW_META = [
  { key: "selectAll", label: "Select all layers", hint: "Space toggles every layer" },
  {
    key: "biome",
    label: "Biome",
    hint: "format + lint (biome.json, format scripts)",
  },
  {
    key: "eslint",
    label: "ESLint (Sonar parity)",
    hint: "eslint.config.mjs + type-aware TS rules",
  },
  {
    key: "reactCompiler",
    label: "React Compiler",
    hint: "react-compiler-marker + ESLint plugin (needs ESLint)",
  },
  {
    key: "stylelint",
    label: "Stylelint",
    hint: "SCSS/CSS + Sonar contrast rule",
  },
];

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
};

/** @param {LayerSelection} layers */
function allLayerKeysOn(layers) {
  return (
    layers.biome &&
    layers.eslint &&
    layers.reactCompiler &&
    layers.stylelint
  );
}

/** @param {LayerSelection} layers */
function anyLayerOn(layers) {
  return layers.biome || layers.eslint || layers.reactCompiler || layers.stylelint;
}

/** @param {LayerSelection} layers @param {number} rowIndex */
function rowChecked(layers, rowIndex) {
  const key = ROW_META[rowIndex].key;
  if (key === "selectAll") {
    return allLayerKeysOn(layers);
  }
  return layers[key];
}

/** @param {LayerSelection} layers @param {number} rowIndex */
function toggleRow(layers, rowIndex) {
  const key = ROW_META[rowIndex].key;
  if (key === "selectAll") {
    const next = !allLayerKeysOn(layers);
    layers.biome = next;
    layers.eslint = next;
    layers.reactCompiler = next;
    layers.stylelint = next;
    return;
  }

  layers[key] = !layers[key];

  if (key === "reactCompiler" && layers.reactCompiler) {
    layers.eslint = true;
  }
  if (key === "eslint" && !layers.eslint) {
    layers.reactCompiler = false;
  }
}

/** @param {LayerSelection} layers @param {number} index */
function render(layers, index) {
  readline.cursorTo(process.stdout, 0, 0);
  readline.clearScreenDown(process.stdout);

  console.log(tone.bold("node-lint-stack — choose layers"));
  console.log(
    tone.dim("  ↑ ↓ move   Space toggle   Enter install   Ctrl+C cancel"),
  );
  console.log("");

  for (let i = 0; i < ROW_META.length; i += 1) {
    const row = ROW_META[i];
    const focused = i === index;
    const mark = focused ? tone.cyan("›") : " ";
    const box = rowChecked(layers, i) ? tone.green("[×]") : "[ ]";
    const label = focused ? tone.bold(row.label) : row.label;
    const hint = focused ? tone.dim(` — ${row.hint}`) : "";
    console.log(`${mark} ${box} ${label}${hint}`);
  }

  console.log("");
  if (!anyLayerOn(layers)) {
    console.log(tone.dim("  Select at least one layer to continue."));
  }
}

/**
 * @param {LayerSelection} [initial]
 * @returns {Promise<LayerSelection>}
 */
export function pickLayersInteractive(initial) {
  /** @type {LayerSelection} */
  const layers = { ...allLayersOn(), ...initial };
  let index = 1;

  return new Promise((resolve, reject) => {
    if (!process.stdin.isTTY) {
      resolve(layers);
      return;
    }

    readline.emitKeypressEvents(process.stdin);
    if (process.stdin.isTTY) {
      process.stdin.setRawMode(true);
    }
    process.stdin.resume();
    process.stdin.setEncoding("utf8");

    render(layers, index);

    /** @param {string} str @param {readline.Key} key */
    function onKey(str, key) {
      if (key.ctrl && key.name === "c") {
        cleanup();
        reject(new Error("Cancelled"));
        return;
      }

      if (key.name === "up") {
        index = (index - 1 + ROW_META.length) % ROW_META.length;
        render(layers, index);
        return;
      }

      if (key.name === "down") {
        index = (index + 1) % ROW_META.length;
        render(layers, index);
        return;
      }

      if (key.name === "space") {
        toggleRow(layers, index);
        render(layers, index);
        return;
      }

      if (key.name === "return" || key.name === "enter") {
        if (!anyLayerOn(layers)) {
          render(layers, index);
          return;
        }
        cleanup();
        readline.clearScreenDown(process.stdout);
        console.log("");
        resolve({ ...layers });
      }
    }

    function cleanup() {
      process.stdin.off("keypress", onKey);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
      process.stdin.pause();
    }

    process.stdin.on("keypress", onKey);
  });
}
