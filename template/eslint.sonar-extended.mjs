/**
 * Extra rules for SonarLint ↔ ESLint parity (beyond sonarjs/recommended).
 */
export const sonarExtendedRules = {
  "sonarjs/no-collapsible-if": "warn",
  "sonarjs/no-commented-code": "warn",
  "sonarjs/no-inconsistent-returns": "error",
  "consistent-return": "error",
  "sonarjs/no-incorrect-string-concat": "warn",
  "sonarjs/nested-control-flow": ["warn", { maximumNestingLevel: 4 }],
  "sonarjs/no-redundant-jump": "warn",
  "sonarjs/no-useless-catch": "warn",
  "sonarjs/prefer-immediate-return": "warn",
  "sonarjs/prefer-object-literal": "warn",
  "sonarjs/prefer-single-boolean-return": "warn",
  "sonarjs/useless-string-operation": "warn",
};

export const sonarJsxBridgeRules = {
  "react/jsx-child-element-spacing": "error",
  "jsx-a11y/no-noninteractive-element-interactions": "error",
  "jsx-a11y/click-events-have-key-events": "warn",
  "jsx-a11y/no-static-element-interactions": "warn",
};

export const sonarUnicornBridgeRules = {
  "unicorn/prefer-string-raw": "error",
  "unicorn/prefer-string-replace-all": "error",
};

export const sonarTypescriptBridgeRules = {
  "@typescript-eslint/prefer-optional-chain": "error",
  "@typescript-eslint/prefer-nullish-coalescing": "warn",
  "unicorn/prefer-set-has": "error",
};
