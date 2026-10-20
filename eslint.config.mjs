import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";

const compat = new FlatCompat({ baseDirectory: dirname(fileURLToPath(import.meta.url)) });

const config = [
  {
    ignores: [
      ".next/**",
      ".next-build/**",
      "node_modules/**",
      ".data/**",
      "storage/**",
      "playwright-report/**",
      "test-results/**",
      "infra/**",
      "next-env.d.ts",
      "dist/**",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    rules: {
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
      // React escapes text content; apostrophes in prose are safe and readable as-is.
      "react/no-unescaped-entities": "off",
    },
  },
];

export default config;
