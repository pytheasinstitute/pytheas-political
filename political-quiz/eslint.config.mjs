import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// Dieselbe Plugin-Instanz wie in der Next-Config — Flat-Config verlangt sie
// im Objekt, das Regeln dieses Plugins überschreibt.
const reactHooksPlugin = nextVitals.find((c) => c.plugins?.["react-hooks"])?.plugins[
  "react-hooks"
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    ...(reactHooksPlugin ? { plugins: { "react-hooks": reactHooksPlugin } } : {}),
    rules: {
      // Altlast-Muster im Bestandscode — als Warnung führen statt blockieren.
      "react-hooks/set-state-in-effect": "warn",
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
