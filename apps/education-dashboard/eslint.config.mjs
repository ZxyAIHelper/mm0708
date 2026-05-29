import nextPlugin from "@next/eslint-plugin-next";
import tsEslintPlugin from "@typescript-eslint/eslint-plugin";
import tsParser from "@typescript-eslint/parser";

const nextCoreWebVitalsRules = {
  ...nextPlugin.configs.recommended.rules,
  ...nextPlugin.configs["core-web-vitals"].rules
};

const typeScriptRecommendedRules = {
  ...tsEslintPlugin.configs.recommended.rules
};

export default [
  {
    ignores: [".next/**", "node_modules/**"]
  },
  {
    files: ["**/*.{js,mjs,cjs,jsx,ts,tsx}"],
    ignores: ["next-env.d.ts"],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: "latest",
        sourceType: "module",
        ecmaFeatures: {
          jsx: true
        }
      }
    },
    plugins: {
      "@next/next": nextPlugin,
      "@typescript-eslint": tsEslintPlugin
    },
    rules: {
      ...typeScriptRecommendedRules,
      ...nextCoreWebVitalsRules
    }
  }
];
