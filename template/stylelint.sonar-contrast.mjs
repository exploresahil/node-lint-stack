import { colord, extend } from "colord";
import a11yPlugin from "colord/plugins/a11y";
import stylelint from "stylelint";

extend([a11yPlugin]);

const ruleName = "sonarjs/color-contrast-min";
const messages = stylelint.utils.ruleMessages(ruleName, {
  rejected: (ratio) =>
    `Text does not meet the minimal contrast requirement with its background (${ratio.toFixed(2)}:1, need ≥4.5:1).`,
});

const MIN_CONTRAST = 4.5;
const PAGE_BG = "#fffef9";

function compositeOnPage(value) {
  const parsed = colord(value);
  if (!parsed.isValid()) {
    return null;
  }
  if (parsed.alpha() >= 1) {
    return parsed;
  }
  const { r, g, b, a } = parsed.toRgb();
  const alpha = a;
  const base = colord(PAGE_BG).toRgb();
  return colord({
    r: r * alpha + base.r * (1 - alpha),
    g: g * alpha + base.g * (1 - alpha),
    b: b * alpha + base.b * (1 - alpha),
  });
}

const colorContrastMin = (_primary, _secondary, options) => {
  const pageBg = options?.pageBackground ?? PAGE_BG;

  return (root, result) => {
    root.walkRules((ruleNode) => {
      let textColor = null;
      let background = null;

      ruleNode.walkDecls((decl) => {
        if (decl.prop === "color") {
          textColor = decl.value;
        }
        if (decl.prop === "background" || decl.prop === "background-color") {
          background = decl.value;
        }
      });

      if (!textColor || !background) {
        return;
      }

      const trimmedColor = textColor.trim().toLowerCase();
      if (
        trimmedColor.includes("var(") ||
        background.includes("var(") ||
        trimmedColor === "transparent" ||
        trimmedColor === "inherit" ||
        trimmedColor === "currentcolor"
      ) {
        return;
      }

      const fg = colord(textColor);
      if (!fg.isValid()) {
        return;
      }

      const parsedBg = colord(background);
      if (!parsedBg.isValid()) {
        return;
      }

      const backgroundCandidates = [];
      if (parsedBg.alpha() < 1) {
        const { r, g, b } = parsedBg.toRgb();
        backgroundCandidates.push(colord({ r, g, b }));
      }
      backgroundCandidates.push(compositeOnPage(background) ?? colord(pageBg));

      let worstRatio = Number.POSITIVE_INFINITY;
      for (const bg of backgroundCandidates) {
        if (!bg.isValid()) {
          continue;
        }
        worstRatio = Math.min(worstRatio, fg.contrast(bg));
      }

      if (worstRatio < MIN_CONTRAST) {
        stylelint.utils.report({
          ruleName,
          result,
          node: ruleNode,
          message: messages.rejected(worstRatio),
        });
      }
    });
  };
};

colorContrastMin.ruleName = ruleName;
colorContrastMin.messages = messages;

export default stylelint.createPlugin(ruleName, colorContrastMin);
