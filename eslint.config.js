const js = require("@eslint/js");
const babelParser = require("@babel/eslint-parser");
const globals = require("globals");
const unusedImports = require("eslint-plugin-unused-imports");

module.exports = [
  {
    ignores: ["**/lib/**", "**/coverage/**", "**/out/**", "**/types/**"],
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
    plugins: {
      "unused-imports": unusedImports,
    },
    rules: {
      indent: ["error", 2, { SwitchCase: 1 }],
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": "error",
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
      "no-console": "warn",
      "no-restricted-syntax": [
        "error",
        {
          selector: "BinaryExpression[operator='instanceof'][right.name='Date']",
          message: "Use Utils.isDate() instead of instanceof Date (cross-realm safe).",
        },
        {
          selector: "BinaryExpression[operator='instanceof'][right.name='RegExp']",
          message: "Use Utils.isRegExp() instead of instanceof RegExp (cross-realm safe).",
        },
        {
          selector: "BinaryExpression[operator='instanceof'][right.name='Error']",
          message: "Use Utils.isNativeError() instead of instanceof Error (cross-realm safe).",
        },
        {
          selector: "BinaryExpression[operator='instanceof'][right.name='Promise']",
          message: "Use Utils.isPromise() instead of instanceof Promise (cross-realm safe).",
        },
        {
          selector: "BinaryExpression[operator='instanceof'][right.name='Map']",
          message: "Use Utils.isMap() instead of instanceof Map (cross-realm safe).",
        },
        {
          selector: "BinaryExpression[operator='instanceof'][right.name='Object']",
          message: "Use Utils.isObject() instead of instanceof Object (cross-realm safe).",
        },
        {
          selector: "BinaryExpression[operator='instanceof'][right.name='Set']",
          message: "Use Utils.isSet() instead of instanceof Set (cross-realm safe).",
        },
        {
          selector: "BinaryExpression[operator='instanceof'][right.name='Buffer']",
          message: "Use Buffer.isBuffer() instead of instanceof Buffer (cross-realm safe).",
        },
        {
          selector: "BinaryExpression[operator='instanceof'][right.name='Array']",
          message: "Use Array.isArray() instead of instanceof Array (cross-realm safe).",
        },
      ]
    },
  },
];
