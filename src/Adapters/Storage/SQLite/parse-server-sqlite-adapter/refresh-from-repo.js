"use strict";

const fs = require("fs");
const path = require("path");

const repoRoot = path.resolve(__dirname, "../../../../..");
const sourceDir = path.join(repoRoot, "lib/Adapters/Storage/SQLite");
const targetDir = __dirname;

const fileHeaders = {
  "SQLiteClient.js": `// Standalone package copy of the built SQLite client helpers.\n\n`,
  "SQLiteConfigParser.js": `// Standalone package copy of the built SQLite URI parser.\n\n`,
  "SQLiteStorageAdapter.js":
    `// Standalone package copy of the built SQLite adapter.\n` +
    `// The only functional edits here retarget Parse Server internals to the host app.\n\n`,
  "SQLiteUtils.js":
    `// Standalone package copy of the built SQLite adapter utility helpers.\n\n`,
};

const importRewrite = {
  search: [
    `var _StorageAdapter = require("../StorageAdapter");\n`,
    `var _SQLiteClient = require("./SQLiteClient");\n`,
    `var _SQLiteConfigParser = require("./SQLiteConfigParser");\n`,
    `var _PostgresStorageAdapter = _interopRequireDefault(require("../Postgres/PostgresStorageAdapter"));\n`,
    `var _RestQuery = _interopRequireDefault(require("../../../RestQuery"));\n`,
    `var _node = _interopRequireDefault(require("parse/node"));\n`,
    `var _fs = _interopRequireDefault(require("fs"));\n`,
    `var _os = _interopRequireDefault(require("os"));\n`,
    `var _path = _interopRequireDefault(require("path"));\n`,
    `var _bson = require("bson");\n`,
    `var _Utils = _interopRequireDefault(require("../../../Utils"));\n`,
    `var _Error = require("../../../Error");\n`,
    `var _logger = _interopRequireDefault(require("../../../logger"));\n`,
  ].join(""),
  replace: [
    `var _SQLiteClient = require("./SQLiteClient");\n`,
    `var _SQLiteConfigParser = require("./SQLiteConfigParser");\n`,
    `var _loadParseServerInternal = require("./loadParseServerInternal");\n`,
    `var _PostgresStorageAdapter = _interopRequireDefault((0, _loadParseServerInternal.loadParseServerInternal)("lib/Adapters/Storage/Postgres/PostgresStorageAdapter"));\n`,
    `var _RestQuery = _interopRequireDefault((0, _loadParseServerInternal.loadParseServerInternal)("lib/RestQuery"));\n`,
    `var _node = _interopRequireDefault(require("parse/node"));\n`,
    `var _fs = _interopRequireDefault(require("fs"));\n`,
    `var _os = _interopRequireDefault(require("os"));\n`,
    `var _path = _interopRequireDefault(require("path"));\n`,
    `var _bson = require("bson");\n`,
    `var _Utils = _interopRequireDefault((0, _loadParseServerInternal.loadParseServerInternal)("lib/Utils"));\n`,
    `var _Error = (0, _loadParseServerInternal.loadParseServerInternal)("lib/Error");\n`,
    `var _logger = _interopRequireDefault((0, _loadParseServerInternal.loadParseServerInternal)("lib/logger"));\n`,
  ].join(""),
};

function stripSourceMap(content) {
  return content.replace(/\n\/\/# sourceMappingURL=.*$/s, "");
}

function withHeader(filename, content) {
  const header = fileHeaders[filename];
  if (!header) {
    return content;
  }
  return content.replace(/^"use strict";\n\n/, `"use strict";\n\n${header}`);
}

function rewriteStandaloneImports(content) {
  if (!content.includes(importRewrite.search)) {
    throw new Error("Could not find the built SQLite import block to rewrite.");
  }
  return content.replace(importRewrite.search, importRewrite.replace);
}

for (const filename of Object.keys(fileHeaders)) {
  const sourceFile = path.join(sourceDir, filename);
  const targetFile = path.join(targetDir, filename);
  let content = fs.readFileSync(sourceFile, "utf8");
  content = stripSourceMap(content);
  if (filename === "SQLiteStorageAdapter.js") {
    content = rewriteStandaloneImports(content);
  }
  content = withHeader(filename, content);
  fs.writeFileSync(targetFile, content);
}

console.log(`Refreshed standalone package files in ${targetDir}`);
