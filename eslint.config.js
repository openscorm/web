import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import globals from "globals";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "coverage", "build"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2023,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      // A native confirm or alert blocks the whole renderer until it is
      // dismissed, cannot be styled to match the app, and cannot be driven by a
      // test or by browser automation, which is how one of these survived five
      // sessions of QA. Use ConfirmDialog for a confirmation and an inline
      // message for anything else. This rule is only enforceable because all
      // five call sites were converted; do not add a sixth.
      "no-restricted-globals": [
        "error",
        {
          name: "confirm",
          message: "Use ConfirmDialog from @/components/ui/confirm-dialog instead.",
        },
        {
          name: "alert",
          message: "Show the message inline instead of blocking the renderer.",
        },
      ],
      "no-restricted-properties": [
        "error",
        {
          object: "window",
          property: "confirm",
          message: "Use ConfirmDialog from @/components/ui/confirm-dialog instead.",
        },
        {
          object: "window",
          property: "alert",
          message: "Show the message inline instead of blocking the renderer.",
        },
      ],
    },
  },
  prettier,
);
