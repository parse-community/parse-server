const js = require("@eslint/js");
const babelParser = require("@babel/eslint-parser");
const globals = require("globals");
module.exports = [
  {
    ignores: ["**/lib/**", "**/coverage/**", "**/out/**"],
  },
  js.configs.recommended,
  {
    languageOptions: {
      parser: babelParser,
      ecmaVersion: 6,
      sourceType: "module",
      globals: {
        Parse: "readonly",
        ...globals.node,
      },
      parserOptions: {
        requireConfigFile: false,
      },
    },
    rules: {
      indent: ["error", 2, { SwitchCase: 1 }],
      "linebreak-style": ["error", "unix"],
      "no-trailing-spaces": "error",
      "eol-last": "error",
      "space-in-parens": ["error", "never"],
      "no-multiple-empty-lines": "warn",
      "prefer-const": "error",
      "space-infix-ops": "error",
      "no-useless-escape": "off",
      "require-atomic-updates": "off",
      "object-curly-spacing": ["error", "always"],
      curly: ["error", "all"],
      "block-spacing": ["error", "always"],
      "no-unused-vars": "off",
      "no-console": "warn"
    },
  },
];
