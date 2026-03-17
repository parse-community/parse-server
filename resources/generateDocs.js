/**
 * Generates lib/Options/docs.js from Zod schema metadata.
 * This replaces the old buildConfigDefinitions.js docs generation.
 *
 * Run: node resources/generateDocs.js
 * Or via: npm run docs (called automatically before jsdoc)
 */
const { getAllOptionMeta, getSchemaDefault } = require('../lib/Options/schemaUtils');
const { ParseServerOptionsSchema } = require('../lib/Options/schemas/ParseServerOptions');
const { SchemaOptionsSchema } = require('../lib/Options/schemas/SchemaOptions');
const { AccountLockoutOptionsSchema } = require('../lib/Options/schemas/AccountLockoutOptions');
const { PasswordPolicyOptionsSchema } = require('../lib/Options/schemas/PasswordPolicyOptions');
const { FileUploadOptionsSchema } = require('../lib/Options/schemas/FileUploadOptions');
const { IdempotencyOptionsSchema } = require('../lib/Options/schemas/IdempotencyOptions');
const { SecurityOptionsSchema } = require('../lib/Options/schemas/SecurityOptions');
const { RequestComplexityOptionsSchema } = require('../lib/Options/schemas/RequestComplexityOptions');
const {
  PagesOptionsSchema,
  CustomPagesOptionsSchema,
  PagesCustomUrlsOptionsSchema,
  PagesRouteSchema,
} = require('../lib/Options/schemas/PagesOptions');
const {
  LiveQueryOptionsSchema,
  LiveQueryServerOptionsSchema,
} = require('../lib/Options/schemas/LiveQueryOptions');
const { RateLimitOptionsSchema } = require('../lib/Options/schemas/RateLimitOptions');
const { LogLevelsSchema } = require('../lib/Options/schemas/LogLevels');
const {
  DatabaseOptionsSchema,
  DatabaseOptionsClientMetadataSchema,
  LogClientEventSchema,
  LogLevelSchema,
} = require('../lib/Options/schemas/DatabaseOptions');
const fs = require('fs');
const path = require('path');

const { z } = require('zod');

/**
 * Maps a Zod schema field to a JSDoc type string.
 */
function getJSDocType(schema) {
  if (!schema) return '*';

  // Unwrap wrappers
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return getJSDocType(schema.unwrap());
  }
  if (schema instanceof z.ZodDefault) {
    return getJSDocType(schema.removeDefault());
  }

  // Primitives
  if (schema instanceof z.ZodString) return 'String';
  if (schema instanceof z.ZodNumber) return 'Number';
  if (schema instanceof z.ZodBoolean) return 'Boolean';

  // Arrays
  if (schema instanceof z.ZodArray) {
    const inner = getJSDocType(schema.element);
    if (inner === '*') {
      return 'Array';
    }
    return `${inner}[]`;
  }

  // Objects — check if it's a named schema we know
  if (schema instanceof z.ZodObject) {
    return 'Object';
  }

  // Records
  if (schema instanceof z.ZodRecord) return 'Object';

  // Unions
  if (schema instanceof z.ZodUnion) {
    const options = schema._zod?.def?.options || schema._def?.options || [];
    const types = options
      .map(opt => getJSDocType(opt))
      .filter((t, i, arr) => arr.indexOf(t) === i); // dedupe
    return types.join('|');
  }

  // Custom (functions, adapters)
  if (schema._def && (schema._def.type === 'custom' || schema._def.typeName === 'ZodCustom')) {
    return 'Function';
  }

  // Refinements (Zod v4 uses _def.type === 'effects')
  const defType = schema._def?.type || schema._def?.typeName;
  if (defType === 'effects' || defType === 'ZodEffects') {
    return getJSDocType(schema._def.schema);
  }

  return '*';
}

/**
 * For nested object schemas, try to find the interface name from our known map.
 */
const schemaNameMap = new Map();

function getTypeName(schema, key) {
  // Unwrap to the core type
  let core = schema;
  if (core instanceof z.ZodOptional || core instanceof z.ZodNullable) core = core.unwrap();
  if (core instanceof z.ZodDefault) core = core.removeDefault();
  const coreType = core._def?.type || core._def?.typeName;
  if (coreType === 'effects' || coreType === 'ZodEffects') core = core._def.schema;

  // Check if this is a known named schema
  const name = schemaNameMap.get(core);
  if (name) return name;

  // For arrays of known schemas
  if (core instanceof z.ZodArray) {
    const elemName = schemaNameMap.get(core.element);
    if (elemName) return `${elemName}[]`;
  }

  return getJSDocType(schema);
}

function generateJSDoc(name, schema) {
  const meta = getAllOptionMeta(schema);
  const shape = schema.shape || {};
  let doc = `/**\n * @interface ${name}\n`;
  for (const key of Object.keys(shape).sort()) {
    const fieldMeta = meta.get(key);
    const help = fieldMeta?.help || '';
    // Use docType override if available, otherwise derive from Zod schema
    const type = fieldMeta?.docType || getTypeName(shape[key], key);
    doc += ` * @property {${type}} ${key} ${help}\n`;
  }
  doc += ` */\n`;
  return doc;
}

const schemas = [
  ['SchemaOptions', SchemaOptionsSchema],
  ['ParseServerOptions', ParseServerOptionsSchema],
  ['AccountLockoutOptions', AccountLockoutOptionsSchema],
  ['PasswordPolicyOptions', PasswordPolicyOptionsSchema],
  ['FileUploadOptions', FileUploadOptionsSchema],
  ['IdempotencyOptions', IdempotencyOptionsSchema],
  ['SecurityOptions', SecurityOptionsSchema],
  ['RequestComplexityOptions', RequestComplexityOptionsSchema],
  ['PagesOptions', PagesOptionsSchema],
  ['PagesRoute', PagesRouteSchema],
  ['PagesCustomUrlsOptions', PagesCustomUrlsOptionsSchema],
  ['CustomPagesOptions', CustomPagesOptionsSchema],
  ['LiveQueryOptions', LiveQueryOptionsSchema],
  ['LiveQueryServerOptions', LiveQueryServerOptionsSchema],
  ['RateLimitOptions', RateLimitOptionsSchema],
  ['LogLevels', LogLevelsSchema],
  ['DatabaseOptions', DatabaseOptionsSchema],
  ['DatabaseOptionsClientMetadata', DatabaseOptionsClientMetadataSchema],
  ['LogClientEvent', LogClientEventSchema],
  ['LogLevel', LogLevelSchema],
];

// Register named schemas so nested references resolve to interface names
for (const [name, schema] of schemas) {
  schemaNameMap.set(schema, name);
}

const output = schemas.map(([name, schema]) => generateJSDoc(name, schema)).join('\n');
const outPath = path.resolve(__dirname, '../lib/Options/docs.js');
fs.writeFileSync(outPath, output);
console.log(`Generated ${outPath}`);
