import sonarContrast from "./stylelint.sonar-contrast.mjs";

/** @type {import('stylelint').Config} */
export default {
  customSyntax: "postcss-scss",
  extends: ["stylelint-config-standard-scss"],
  plugins: [sonarContrast],
  rules: {
    "sonarjs/color-contrast-min": true,
    "declaration-property-value-disallowed-list": {
      "/^word-break$/": ["break-word"],
    },
    "declaration-block-no-duplicate-properties": true,
    "no-descending-specificity": null,
    "no-duplicate-selectors": null,
    "keyframes-name-pattern": null,
    "property-no-unknown": [
      true,
      {
        ignoreProperties: ["word-break"],
      },
    ],
    "selector-class-pattern": null,
    "scss/at-mixin-pattern": null,
    "scss/at-rule-no-unknown": [
      true,
      {
        ignoreAtRules: ["tailwind", "apply", "layer", "config"],
      },
    ],
    "scss/dollar-variable-pattern": null,
    "scss/percent-placeholder-pattern": null,
    "selector-pseudo-class-no-unknown": [
      true,
      {
        ignorePseudoClasses: ["global"],
      },
    ],
  },
  ignoreFiles: ["**/node_modules/**", "**/.next/**", "**/generated/**"],
};
