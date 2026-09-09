import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // src/fluent/generated is SDK-authored output (keys.ts), not hand-written
    // source - linting it against our own rules is meaningless.
    // diagnostics/scripts are plain ServiceNow Background Scripts, meant to
    // run inside the platform's own script runtime (gs/GlideRecord globals
    // that don't exist here) - not part of this Node/TS project at all.
    ignores: [
      "dist/**",
      "target/**",
      "node_modules/**",
      ".now/**",
      "src/fluent/generated/**",
      "diagnostics/scripts/**",
    ],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
