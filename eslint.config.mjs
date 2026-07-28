import eslint from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";
import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

export default defineConfig([
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  nextPlugin.configs["core-web-vitals"],
  globalIgnores([
    "legacy/**",
    ".next/**",
    "coverage/**",
    "playwright-report/**",
  ]),
]);
