module.exports = {
    "root": true,
    "extends": "eslint:recommended",
    "env": {
        "node": true,
        "es6": true
    },
    "parser": "babel-eslint",
    "plugins": [
        "flowtype"
    ],
    "parserOptions": {
        "ecmaVersion": 6,
        "sourceType": "module"
    },
    "rules": {
        "indent": ["error", 2],
        "linebreak-style": ["error", (require("os").EOL === "\r\n" ? "windows" : "unix")],
        "no-trailing-spaces": 2,
        "eol-last": 2,
        "space-in-parens": ["error", "never"],
        "no-multiple-empty-lines": 1,
        "prefer-const": "error",
        "space-infix-ops": "error",
        "no-useless-escape": "off"
    }
}
