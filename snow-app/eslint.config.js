import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // src/fluent/generated is SDK-authored output (keys.ts), not hand-written
    // source - linting it against our own rules is meaningless.
    ignores: ["dist/**", "target/**", "node_modules/**", ".now/**", "src/fluent/generated/**"],
  },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
    },
  },
);
