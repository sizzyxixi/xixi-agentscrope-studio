import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "upstream/**",
    "service/skills/**",
    "local/**",
    "outputs/**",
    "dist/**",
    ".wrangler/**",
    "worker-configuration.d.ts",
    "public/pdfjs/**",
    "public/agentscope-admin/**",
    "vendor/agentscope-web-ui/**",
    ".venv-agentscope-v2/**",
    ".local-tools/**",
  ]),
]);

export default eslintConfig;
