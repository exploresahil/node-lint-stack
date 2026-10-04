import { defineConfig } from "eslint/config";
import jsxA11y from "eslint-plugin-jsx-a11y";
import react from "eslint-plugin-react";
import reactCompiler from "eslint-plugin-react-compiler";
import sonarjs from "eslint-plugin-sonarjs";
import unicorn from "eslint-plugin-unicorn";
import tseslint from "typescript-eslint";
import {
  sonarExtendedRules,
  sonarJsxBridgeRules,
  sonarTypescriptBridgeRules,
  sonarUnicornBridgeRules,
} from "./eslint.sonar-extended.mjs";

const srcFiles = __LINT_STACK_ESLINT_FILES_ARRAY__;

export default defineConfig(
  {
    ignores: [
      "**/node_modules/**",
      "**/dist/**",
      "**/build/**",
      "**/coverage/**",
      "**/.next/**",
      "**/generated/**",
    ],
  },
  {
    files: srcFiles,
    extends: [...tseslint.configs.recommended, sonarjs.configs.recommended],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: {
      "react-compiler": reactCompiler,
      react,
      "jsx-a11y": jsxA11y,
      unicorn,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      "react-compiler/react-compiler": "error",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
      ...sonarExtendedRules,
      ...sonarJsxBridgeRules,
      ...sonarUnicornBridgeRules,
      ...sonarTypescriptBridgeRules,
      "sonarjs/cognitive-complexity": ["error", 15],
      "max-params": ["error", 7],
      "sonarjs/no-nested-conditional": "error",
      "react/no-array-index-key": "error",
      "unicorn/prefer-at": "error",
      "unicorn/prefer-number-properties": "error",
      "sonarjs/no-nested-template-literals": "warn",
      "sonarjs/deprecation": "warn",
      "sonarjs/super-linear-regex": "warn",
      "sonarjs/function-return-type": "warn",
      "sonarjs/no-ignored-exceptions": "warn",
    },
  },
);
