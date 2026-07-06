// @flow
import { StorageAdapter } from '../StorageAdapter';
import type { SchemaType, QueryType, QueryOptions } from '../StorageAdapter';
import { createClient } from './SQLiteClient';
import { getDatabaseOptionsFromURI } from './SQLiteConfigParser';
import Parse from 'parse/node';
import EventEmitter from 'events';
import fs from 'fs';
import os from 'os';
import path from 'path';
import Utils from '../../../Utils';
import { createSanitizedError } from '../../../Error';

const defaultCLPS = Object.freeze({
  find: { '*': true },
  count: { '*': true },
  get: { '*': true },
  create: { '*': true },
  update: { '*': true },
  delete: { '*': true },
  addField: { '*': true },
  protectedFields: { '*': [] },
});

const emptyCLPS = Object.freeze({
  find: {},
  count: {},
  get: {},
  create: {},
  update: {},
  delete: {},
  addField: {},
  protectedFields: {},
});

const internalClasses = new Set([
  '_GlobalConfig',
  '_GraphQLConfig',
  '_PushStatus',
  '_JobStatus',
  '_JobSchedule',
  '_Hooks',
  '_Audience',
]);

const temporarySQLiteDirectories = new Set();
let sharedMemorySQLiteDatabase;

const cleanupTemporarySQLiteDirectories = () => {
  for (const directory of temporarySQLiteDirectories) {
    try {
      fs.rmSync(directory, { recursive: true, force: true });
    } catch {
      /* */
    }
  }
  temporarySQLiteDirectories.clear();
};

process.once('exit', cleanupTemporarySQLiteDirectories);

const createTemporarySQLiteDatabasePath = () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'parse-server-sqlite-'));
  temporarySQLiteDirectories.add(directory);
  return {
    directory,
    filename: path.join(directory, 'sqlite.db'),
  };
};

const getSharedMemorySQLiteDatabasePath = () => {
  if (!sharedMemorySQLiteDatabase) {
    sharedMemorySQLiteDatabase = createTemporarySQLiteDatabasePath();
  }
  return sharedMemorySQLiteDatabase;
};

const isJoinTableClass = className =>
  typeof className === 'string' && className.indexOf('_Join:') === 0;

const toParseSchema = schema => {
  if (!schema) {
    return schema;
  }
  if (schema.className === '_User') {
    delete schema.fields._hashed_password;
  }
  if (schema.fields) {
    delete schema.fields._wperm;
    delete schema.fields._rperm;
  }
  let clps = defaultCLPS;
  if (schema.classLevelPermissions) {
    clps = { ...emptyCLPS, ...schema.classLevelPermissions };
  }
  let indexes = {};
  if (schema.indexes) {
    indexes = { ...schema.indexes };
  }
  return {
    className: schema.className,
    fields: schema.fields,
    classLevelPermissions: clps,
    indexes,
  };
};

const toSQLiteSchema = schema => {
  if (!schema) {
    return schema;
  }
  schema.fields = schema.fields || {};
  if (!isJoinTableClass(schema.className)) {
    schema.fields._wperm = { type: 'Array', contents: { type: 'String' } };
    schema.fields._rperm = { type: 'Array', contents: { type: 'String' } };
  }
  if (schema.className === '_User') {
    schema.fields._password_history = { type: 'Array' };
  }
  return schema;
};

const normalizeSQLiteSchema = (className, schema) =>
  toSQLiteSchema({
    ...(schema || {}),
    className,
    fields: {
      ...((schema && schema.fields) || {}),
    },
  });

const parseTypeToSQLiteType = (type: any) => {
  if (!type) {
    return 'TEXT';
  }
  const typeName = typeof type === 'object' ? type.type : type;
  switch (typeName) {
    case 'String':
    case 'Date':
    case 'Object':
    case 'File':
    case 'Pointer':
    case 'GeoPoint':
    case 'Bytes':
    case 'Polygon':
    case 'Array':
    case 'Relation':
      return 'TEXT';
    case 'Boolean':
    case 'Number':
      return typeName === 'Boolean' ? 'INTEGER' : 'REAL';
    default:
      return 'TEXT';
  }
};

const inferFieldType = (key: string, value: any) => {
  if (key === 'authData') {
    return { type: 'Object' };
  }
  if (value && typeof value === 'object') {
    if (value.__type === 'Pointer') {
      return { type: 'Pointer', targetClass: value.className };
    }
    if (value.__type === 'Date' || Utils.isDate(value)) {
      return { type: 'Date' };
    }
    if (value.__type === 'File') {
      return { type: 'File' };
    }
    if (value.__type === 'GeoPoint') {
      return { type: 'GeoPoint' };
    }
    if (value.__type === 'Polygon') {
      return { type: 'Polygon' };
    }
    if (value.__type === 'Relation') {
      return { type: 'Relation', targetClass: value.className };
    }
    if (Array.isArray(value)) {
      return { type: 'Array' };
    }
    return { type: 'Object' };
  }
  if (typeof value === 'boolean') {
    return { type: 'Boolean' };
  }
  if (typeof value === 'number') {
    return { type: 'Number' };
  }
  return { type: 'String' };
};

const toSQLiteValue = (value: any) => {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'boolean') {
    return value ? 1 : 0;
  }
  if (typeof value === 'object') {
    if (value.__type === 'Date') {
      return value.iso;
    }
    if (Utils.isDate(value)) {
      return value.toISOString();
    }
    if (value.__type === 'File') {
      return value.name;
    }
    if (value.__type === 'Pointer') {
      return value.objectId;
    }
    if (value.__type === 'Bytes') {
      return JSON.stringify(value);
    }
    if (value.__type === 'GeoPoint' || value.__type === 'Polygon') {
      return JSON.stringify(value);
    }
    return JSON.stringify(value);
  }
  return value;
};

const sqliteValueToParseValue = (value: any, type: any) => {
  if (value === null || value === undefined) {
    return null;
  }
  const typeName = typeof type === 'object' ? type.type : type;
  switch (typeName) {
    case 'Boolean':
      return Boolean(value);
    case 'Date':
      if (typeof value === 'string') {
        return { __type: 'Date', iso: value };
      }
      if (typeof value === 'number') {
        return { __type: 'Date', iso: new Date(value).toISOString() };
      }
      return value;
    case 'Object':
    case 'Array':
    case 'Bytes':
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return value;
    case 'GeoPoint':
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return value;
    case 'Polygon':
      if (typeof value === 'string') {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return value;
    case 'Pointer':
      if (typeof value === 'string') {
        return value;
      }
      return value;
    default:
      if (typeof value === 'string' && (value.startsWith('{') || value.startsWith('['))) {
        try {
          return JSON.parse(value);
        } catch {
          return value;
        }
      }
      return value;
  }
};

const quoteColumnName = (fieldName: string) => `"${fieldName.replace(/"/g, '""')}"`;

const validateObjectPathComponent = (component: string, fieldName: string) => {
  if (!/^[a-zA-Z0-9_\-$]+$/.test(component)) {
    throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Invalid key name: ${fieldName}`);
  }
};

const buildDotFieldPath = (fieldName: string) => {
  const parts = fieldName.split('.');
  const rootFieldName = parts.shift();
  validateFieldName(rootFieldName);
  let jsonPath = '$';
  for (const component of parts) {
    if (/^\d+$/.test(component)) {
      jsonPath += `[${component}]`;
      continue;
    }
    validateObjectPathComponent(component, fieldName);
    jsonPath += `."${component}"`;
  }
  return {
    rootFieldName,
    jsonPath,
  };
};

const isJsonEncodedValue = (value: any) => {
  if (value === null || value === undefined || Utils.isDate(value)) {
    return false;
  }
  if (Array.isArray(value)) {
    return true;
  }
  if (typeof value !== 'object') {
    return false;
  }
  return value.__type !== 'Date' && value.__type !== 'Pointer' && value.__type !== 'File';
};

const isQueryOperatorObject = (value: any) => {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Utils.isDate(value)) {
    return false;
  }
  if (value.__type) {
    return false;
  }
  return Object.keys(value).some(key => key.startsWith('$'));
};

const getParameterizedValueExpression = (value: any) => {
  return isJsonEncodedValue(value) ? 'json(?)' : '?';
};

const getJsonObjectValueExpression = (columnName: string) =>
  `CASE WHEN json_valid(${columnName}) AND json_type(${columnName}) = 'object' THEN ${columnName} ELSE '{}' END`;

const getJsonArrayValueExpression = (containerExpression: string, jsonPath: string) =>
  `CASE WHEN json_type(${containerExpression}, '${jsonPath}') = 'array' THEN json_extract(${containerExpression}, '${jsonPath}') ELSE '[]' END`;

const isPointerValue = (value: any) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  value.__type === 'Pointer' &&
  typeof value.objectId === 'string';

const getArrayElementMatchExpression = (
  targetSql: string,
  comparisonValue: any
): { sql: string, params: Array<any> } => {
  if (isPointerValue(comparisonValue)) {
    return {
      sql:
        `EXISTS (SELECT 1 FROM json_each(${targetSql}) WHERE json_extract(json_each.value, '$.__type') = 'Pointer' ` +
        `AND json_extract(json_each.value, '$.className') = ? ` +
        `AND json_extract(json_each.value, '$.objectId') = ?)`,
      params: [comparisonValue.className, comparisonValue.objectId],
    };
  }
  if (isJsonEncodedValue(comparisonValue)) {
    return {
      sql: `EXISTS (SELECT 1 FROM json_each(${targetSql}) WHERE json(json_each.value) = json(?))`,
      params: [toSQLiteValue(comparisonValue)],
    };
  }
  return {
    sql: `EXISTS (SELECT 1 FROM json_each(${targetSql}) WHERE json_each.value = ?)`,
    params: [toSQLiteValue(comparisonValue)],
  };
};

const getArrayAnyMatchExpression = (
  targetSql: string,
  comparisonValues: Array<any>
): { sql: string, params: Array<any> } => {
  const expressions = comparisonValues.map(value => getArrayElementMatchExpression(targetSql, value));
  return {
    sql: expressions.map(expression => `(${expression.sql})`).join(' OR '),
    params: expressions.flatMap(expression => expression.params),
  };
};

const validateRegexPattern = (pattern: string, flags: string) => {
  try {
    new RegExp(pattern, flags);
  } catch (error) {
    throw createSanitizedError(
      Parse.Error.INTERNAL_SERVER_ERROR,
      `Invalid regular expression: ${error.message}`,
      undefined,
      'An internal server error occurred'
    );
  }
};

const transformDotField = (fieldName: string) => {
  if (fieldName.indexOf('.') === -1) {
    validateFieldName(fieldName);
    return quoteColumnName(fieldName);
  }
  const { rootFieldName, jsonPath } = buildDotFieldPath(fieldName);
  return `json_extract(${quoteColumnName(rootFieldName)}, '${jsonPath}')`;
};

const validateFieldName = (name: string) => {
  if (typeof name !== 'string' || !name.match(/^[a-zA-Z_][a-zA-Z0-9_]*$/)) {
    throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Invalid field name: ${name}`);
  }
};

export class SQLiteStorageAdapter implements StorageAdapter {
  canSortOnJoinTables: boolean;
  schemaCacheTtl: ?number;
  enableSchemaHooks: boolean;
  _db: any;
  _uri: string;
  _collectionPrefix: string;
  _emitter: EventEmitter;
  _stmtCache: Map<string, any>;
  _existingClasses: Set<string>;
  _schemaCache: Map<string, any>;
  _temporaryDirectory: ?string;

  constructor(options: any = {}) {
    this._uri = options.uri || 'sqlite://:memory:';
    this._collectionPrefix = options.collectionPrefix || '';
    this.canSortOnJoinTables = true;
    this.schemaCacheTtl = null;
    this.enableSchemaHooks = true;
    this._emitter = new EventEmitter();
    this._emitter.setMaxListeners(0);
    this._stmtCache = new Map();
    this._existingClasses = new Set();
    this._schemaCache = new Map();
    this._temporaryDirectory = null;

    const dbOptions = getDatabaseOptionsFromURI(this._uri);
    if (options.databaseOptions) {
      Object.assign(dbOptions, options.databaseOptions);
    }
    if (dbOptions.filename === ':memory:') {
      const temporaryDatabase = getSharedMemorySQLiteDatabasePath();
      dbOptions.filename = temporaryDatabase.filename;
    }
    this._dbOptions = dbOptions;
    this._db = createClient(dbOptions);
    this._initSchemaTable();
  }

  _prepare(sql: string, dbOverride?: any): any {
    const db = dbOverride || this._db;
    if (dbOverride) {
      return db.prepare(sql);
    }
    let stmt = this._stmtCache.get(sql);
    if (!stmt) {
      stmt = db.prepare(sql);
      this._stmtCache.set(sql, stmt);
    }
    return stmt;
  }

  _notifySchemaChange() {
    if (this.enableSchemaHooks) {
      this._emitter.emit('schemaChanged');
    }
  }

  watch(callback: () => void) {
    this._emitter.on('schemaChanged', callback);
  }

  getIdempotencyIndexOptions() {
    return null;
  }

  handleShutdown() {
    if (this._db) {
      try {
        this._db.close();
      } catch {
        /* */
      }
    }
    this._stmtCache.clear();
    this._existingClasses.clear();
    this._schemaCache.clear();
    this._emitter.removeAllListeners();
    if (this._temporaryDirectory) {
      temporarySQLiteDirectories.delete(this._temporaryDirectory);
      try {
        fs.rmSync(this._temporaryDirectory, { recursive: true, force: true });
      } catch {
        /* */
      }
      this._temporaryDirectory = null;
    }
  }

  _deleteExpiredIdempotencyRecords(dbOverride?: any) {
    try {
      this._prepare(
        `DELETE FROM ${this._tableName('_Idempotency')} WHERE "expire" IS NOT NULL AND "expire" < ?`,
        dbOverride
      ).run(new Date().toISOString());
    } catch {
      /* */
    }
  }

  _initSchemaTable() {
    this._db.exec(
      'CREATE TABLE IF NOT EXISTS "_SCHEMA" ("className" TEXT PRIMARY KEY, "schema" TEXT, "isParseClass" INTEGER)'
    );
    try {
      const rows = this._db.prepare('SELECT "className", "schema" FROM "_SCHEMA"').all();
      for (const row of rows) {
        this._existingClasses.add(row.className);
        try {
          this._schemaCache.set(row.className, JSON.parse(row.schema));
        } catch {
          /* */
        }
      }
    } catch {
      /* */
    }
  }

  _tableName(className: string): string {
    return `"${(this._collectionPrefix + className).replace(/"/g, '""')}"`;
  }

  _rawTableName(className: string): string {
    return this._collectionPrefix + className;
  }

  async classExists(className: string): Promise<boolean> {
    if (this._existingClasses.has(className)) {
      return true;
    }
    const rawName = this._rawTableName(className);
    const row = this._prepare("SELECT name FROM sqlite_master WHERE type='table' AND name = ?")
      .get(rawName);
    if (row) {
      this._existingClasses.add(className);
      return true;
    }
    return false;
  }

  async _ensureColumnsExist(className: string, row: Object, schema?: SchemaType, dbOverride?: any): Promise<void> {
    const db = dbOverride || this._db;
    const tableName = this._tableName(className);
    const rawName = this._rawTableName(className);
    const tableInfo = db.prepare(`PRAGMA table_info("${rawName.replace(/"/g, '""')}")`).all();
    const existingCols = new Set(tableInfo.map(col => col.name));

    const fields = schema ? schema.fields || {} : {};
    const cachedSchema = this._schemaCache.get(className) || { fields: {} };

    for (const key of Object.keys(row)) {
      if (key.indexOf('.') >= 0) {
        const rootKey = key.split('.')[0];
        if (!existingCols.has(rootKey)) {
          db.exec(`ALTER TABLE ${tableName} ADD COLUMN "${rootKey.replace(/"/g, '""')}" TEXT`);
          existingCols.add(rootKey);
          cachedSchema.fields[rootKey] = { type: 'Object' };
          this._schemaCache.set(className, cachedSchema);
        }
        continue;
      }
      let fieldType = fields[key] || cachedSchema.fields[key];
      if (!fieldType) {
        fieldType = inferFieldType(key, row[key]);
        cachedSchema.fields[key] = fieldType;
        this._schemaCache.set(className, cachedSchema);
      }
      if (!existingCols.has(key)) {
        const sqliteType = parseTypeToSQLiteType(fieldType);
        db.exec(`ALTER TABLE ${tableName} ADD COLUMN "${key.replace(/"/g, '""')}" ${sqliteType}`);
        existingCols.add(key);
      }
    }
  }

  async setClassLevelPermissions(className: string, clps: any): Promise<void> {
    const row = this._prepare('SELECT "schema" FROM "_SCHEMA" WHERE "className" = ?')
      .get(className);
    if (!row) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, `Class ${className} does not exist.`);
    }
    let schemaObj = {};
    try {
      schemaObj = JSON.parse(row.schema);
    } catch {
      /* */
    }
    schemaObj.classLevelPermissions = clps;
    this._schemaCache.set(className, schemaObj);
    this._prepare('UPDATE "_SCHEMA" SET "schema" = ? WHERE "className" = ?')
      .run(JSON.stringify(schemaObj), className);
    this._notifySchemaChange();
  }

  async createClass(className: string, schema: SchemaType): Promise<any> {
    const tableName = this._tableName(className);
    const existing = this._prepare('SELECT "className" FROM "_SCHEMA" WHERE "className" = ?')
      .get(className);
    if (existing) {
      throw new Parse.Error(Parse.Error.DUPLICATE_VALUE, `Class ${className} already exists.`);
    }

    schema = normalizeSQLiteSchema(className, schema);
    const fields = Object.assign({}, schema ? schema.fields : {});
    if (className === '_User') {
      fields._email_verify_token_expires_at = { type: 'Date' };
      fields._email_verify_token = { type: 'String' };
      fields._account_lockout_expires_at = { type: 'Date' };
      fields._failed_login_count = { type: 'Number' };
      fields._perishable_token = { type: 'String' };
      fields._perishable_token_expires_at = { type: 'Date' };
      fields._password_changed_at = { type: 'Date' };
      fields._password_history = { type: 'Array' };
      fields.authData = { type: 'Object' };
    }

    const colDefs = [];
    const relations = [];
    Object.keys(fields).forEach(fieldName => {
      const fieldType = fields[fieldName];
      if (fieldType.type === 'Relation') {
        relations.push(fieldName);
        return;
      }
      const sqliteType = parseTypeToSQLiteType(fieldType);
      if (fieldName === 'objectId') {
        colDefs.push(`"objectId" TEXT PRIMARY KEY`);
      } else {
        colDefs.push(`"${fieldName.replace(/"/g, '""')}" ${sqliteType}`);
      }
    });

    if (!fields.objectId) {
      colDefs.unshift(`"objectId" TEXT PRIMARY KEY`);
    }

    const createStmt = `CREATE TABLE IF NOT EXISTS ${tableName} (${colDefs.join(', ')})`;
    this._db.exec(createStmt);

    for (const relField of relations) {
      const joinTableName = `"${(this._collectionPrefix + `_Join:${relField}:${className}`).replace(/"/g, '""')}"`;
      this._db.exec(
        `CREATE TABLE IF NOT EXISTS ${joinTableName} ("relatedId" TEXT, "owningId" TEXT, PRIMARY KEY("relatedId", "owningId"))`
      );
    }

    const isParseClass = internalClasses.has(className) ? 0 : 1;
    const finalSchema = schema ? { ...schema, fields } : { fields };
    this._prepare('INSERT INTO "_SCHEMA" ("className", "schema", "isParseClass") VALUES (?, ?, ?)')
      .run(className, JSON.stringify(finalSchema), isParseClass);

    this._existingClasses.add(className);
    this._schemaCache.set(className, finalSchema);

    if (schema && schema.indexes) {
      await this.setIndexesWithSchemaFormat(className, schema.indexes, {}, schema.fields);
    }

    this._notifySchemaChange();
    return toParseSchema(finalSchema);
  }

  async addFieldIfNotExists(className: string, fieldName: string, type: any): Promise<void> {
    const tableName = this._tableName(className);
    const rawName = this._rawTableName(className);

    if (!(await this.classExists(className))) {
      await this.createClass(className, { fields: { [fieldName]: type } });
      return;
    }

    if (type.type === 'Relation') {
      const joinTableName = `"${(this._collectionPrefix + `_Join:${fieldName}:${className}`).replace(/"/g, '""')}"`;
      this._db.exec(
        `CREATE TABLE IF NOT EXISTS ${joinTableName} ("relatedId" TEXT, "owningId" TEXT, PRIMARY KEY("relatedId", "owningId"))`
      );
    } else {
      const tableInfo = this._db.prepare(`PRAGMA table_info("${rawName.replace(/"/g, '""')}")`).all();
      const exists = tableInfo.some(col => col.name === fieldName);
      if (!exists) {
        const sqliteType = parseTypeToSQLiteType(type);
        this._db.exec(
          `ALTER TABLE ${tableName} ADD COLUMN "${fieldName.replace(/"/g, '""')}" ${sqliteType}`
        );
      }
    }

    const row = this._prepare('SELECT "schema" FROM "_SCHEMA" WHERE "className" = ?')
      .get(className);
    let schemaObj = {};
    if (row) {
      try {
        schemaObj = JSON.parse(row.schema);
      } catch {
        /* */
      }
    }
    schemaObj.fields = schemaObj.fields || {};
    schemaObj.fields[fieldName] = type;
    this._schemaCache.set(className, schemaObj);
    this._prepare('INSERT INTO "_SCHEMA" ("className", "schema", "isParseClass") VALUES (?, ?, 1) ON CONFLICT("className") DO UPDATE SET "schema" = excluded."schema"')
      .run(className, JSON.stringify(schemaObj));
    this._notifySchemaChange();
  }

  async updateFieldOptions(className: string, fieldName: string, type: any): Promise<void> {
    await this.addFieldIfNotExists(className, fieldName, type);
  }

  async deleteClass(className: string): Promise<void> {
    const tableName = this._tableName(className);
    const row = this._prepare('SELECT "schema" FROM "_SCHEMA" WHERE "className" = ?')
      .get(className);
    if (row) {
      try {
        const schema = JSON.parse(row.schema);
        if (schema && schema.fields) {
          Object.keys(schema.fields).forEach(field => {
            if (schema.fields[field].type === 'Relation') {
              const joinTableName = `"${(this._collectionPrefix + `_Join:${field}:${className}`).replace(/"/g, '""')}"`;
              this._db.exec(`DROP TABLE IF EXISTS ${joinTableName}`);
            }
          });
        }
      } catch {
        /* */
      }
    }
    this._db.exec(`DROP TABLE IF EXISTS ${tableName}`);
    this._prepare('DELETE FROM "_SCHEMA" WHERE "className" = ?').run(className);
    this._existingClasses.delete(className);
    this._schemaCache.delete(className);
    this._notifySchemaChange();
  }

  async deleteAllClasses(): Promise<void> {
    const rows = this._prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    for (const row of rows) {
      this._db.exec(`DROP TABLE IF EXISTS "${row.name.replace(/"/g, '""')}"`);
    }
    this._stmtCache.clear();
    this._existingClasses.clear();
    this._schemaCache.clear();
    this._initSchemaTable();
    this._notifySchemaChange();
  }

  async deleteFields(className: string, schema: SchemaType, fieldNames: Array<string>): Promise<void> {
    const row = this._prepare('SELECT "schema" FROM "_SCHEMA" WHERE "className" = ?')
      .get(className);
    if (!row) {
      return;
    }

    const schemaObj = JSON.parse(row.schema);
    for (const fieldName of fieldNames) {
      if (schemaObj.fields && schemaObj.fields[fieldName]) {
        if (schemaObj.fields[fieldName].type === 'Relation') {
          const joinTableName = `"${(this._collectionPrefix + `_Join:${fieldName}:${className}`).replace(/"/g, '""')}"`;
          this._db.exec(`DROP TABLE IF EXISTS ${joinTableName}`);
        }
        delete schemaObj.fields[fieldName];
      }
    }
    this._schemaCache.set(className, schemaObj);
    this._prepare('UPDATE "_SCHEMA" SET "schema" = ? WHERE "className" = ?')
      .run(JSON.stringify(schemaObj), className);
    this._notifySchemaChange();
  }

  async getAllClasses(): Promise<Array<any>> {
    const rows = this._prepare('SELECT * FROM "_SCHEMA" WHERE "isParseClass" = 1').all();
    return rows.map(row => {
      let schemaObj = {};
      try {
        schemaObj = JSON.parse(row.schema);
      } catch {
        schemaObj = {};
      }
      return toParseSchema({ className: row.className, ...schemaObj });
    });
  }

  async getClass(className: string): Promise<any> {
    const row = this._prepare('SELECT "schema" FROM "_SCHEMA" WHERE "className" = ?')
      .get(className);
    if (!row) {
      throw undefined;
    }
    let schemaObj = {};
    try {
      schemaObj = JSON.parse(row.schema);
    } catch {
      schemaObj = {};
    }
    return toParseSchema({ className, ...schemaObj });
  }

  _parseObjectToSQLiteRow(className: string, object: any): Object {
    const row = {};
    const copy = { ...object };
    Object.keys(copy).forEach(key => {
      const authDataMatch = key.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
      if (authDataMatch) {
        const provider = authDataMatch[1];
        copy.authData = copy.authData || {};
        copy.authData[provider] = copy[key];
        delete copy[key];
      }
    });
    Object.keys(copy).forEach(key => {
      const val = copy[key];
      row[key] = toSQLiteValue(val);
    });
    return row;
  }

  _sqliteRowToParseObject(className: string, row: any, schema: SchemaType): Object {
    if (!row) {
      return null;
    }
    const object = {};
    const cachedSchema = this._schemaCache.get(className);
    const fields = Object.assign({}, cachedSchema ? cachedSchema.fields : {}, schema ? schema.fields : {});

    Object.keys(row).forEach(key => {
      const val = row[key];
      if (val === null || val === undefined) {
        return;
      }
      if (key === 'createdAt' || key === 'updatedAt' || key === '_created_at' || key === '_updated_at') {
        const targetKey = key === '_created_at' ? 'createdAt' : key === '_updated_at' ? 'updatedAt' : key;
        object[targetKey] = typeof val === 'string' ? val : new Date(val).toISOString();
        return;
      }

      let fieldSchema = fields[key];
      if (key === 'authData' && (!fieldSchema || fieldSchema.type !== 'Object')) {
        fieldSchema = { type: 'Object' };
      }
      if (fieldSchema) {
        if (fieldSchema.type === 'Pointer' && typeof val === 'string') {
          object[key] = {
            __type: 'Pointer',
            className: fieldSchema.targetClass,
            objectId: val,
          };
          return;
        }
        if (fieldSchema.type === 'Relation') {
          object[key] = {
            __type: 'Relation',
            className: fieldSchema.targetClass,
          };
          return;
        }
        if (fieldSchema.type === 'File' && typeof val === 'string') {
          object[key] = {
            __type: 'File',
            name: val,
          };
          return;
        }
        if (fieldSchema.type === 'Date' && typeof val === 'string') {
          object[key] = {
            __type: 'Date',
            iso: val,
          };
          return;
        }
      }

      object[key] = sqliteValueToParseValue(val, fieldSchema);
    });

    if (fields) {
      Object.keys(fields).forEach(key => {
        if (fields[key].type === 'Relation' && !object[key]) {
          object[key] = {
            __type: 'Relation',
            className: fields[key].targetClass,
          };
        }
      });
    }

    return object;
  }

  async createObject(
    className: string,
    schema: SchemaType,
    object: any,
    transactionalSession?: any
  ): Promise<any> {
    if (!(await this.classExists(className))) {
      await this.createClass(className, schema);
    }
    const row = this._parseObjectToSQLiteRow(className, object);
    const db = transactionalSession || this._db;
    await this._ensureColumnsExist(className, row, schema, db);
    if (className === '_Idempotency') {
      this._deleteExpiredIdempotencyRecords(db);
    }

    const cols = Object.keys(row).map(quoteColumnName);
    const placeholders = Object.keys(row).map(() => '?');
    const values = Object.keys(row).map(k => row[k]);

    const stmtSql = `INSERT INTO ${this._tableName(className)} (${cols.join(', ')}) VALUES (${placeholders.join(', ')})`;
    try {
      this._prepare(stmtSql, transactionalSession).run(...values);
    } catch (err) {
      if (err.code === 'SQLITE_CONSTRAINT_PRIMARYKEY' || err.code === 'SQLITE_CONSTRAINT_UNIQUE' || (err.message && err.message.includes('UNIQUE constraint failed'))) {
        throw new Parse.Error(
          Parse.Error.DUPLICATE_VALUE,
          'A duplicate value for a field with unique values was provided'
        );
      }
      throw err;
    }
    return { ops: [object] };
  }

  _buildWhereClause(className: string, schema: SchemaType, query: QueryType): { sql: string, params: Array<any> } {
    const conditions = [];
    const params = [];

    for (const key of Object.keys(query)) {
      const val = query[key];

      if (key === '$or' || key === '$and' || key === '$nor') {
        const subConds = [];
        for (const subQuery of val) {
          const res = this._buildWhereClause(className, schema, subQuery);
          if (res.sql) {
            subConds.push(`(${res.sql})`);
            params.push(...res.params);
          }
        }
        if (subConds.length > 0) {
          if (key === '$or') {
            conditions.push(`(${subConds.join(' OR ')})`);
          } else if (key === '$and') {
            conditions.push(`(${subConds.join(' AND ')})`);
          } else if (key === '$nor') {
            conditions.push(`NOT (${subConds.join(' OR ')})`);
          }
        }
        continue;
      }

      if (schema.fields && schema.fields[key] && schema.fields[key].type === 'Relation') {
        continue;
      }

      if (schema.fields && schema.fields[key]) {
        const fieldType = schema.fields[key].type;
        if (fieldType === 'Number' && typeof val === 'boolean') {
          conditions.push('1 = 0');
          continue;
        }
        if (fieldType === 'Boolean' && typeof val === 'number') {
          conditions.push('1 = 0');
          continue;
        }
      }

      if (isQueryOperatorObject(val)) {
        for (const op of Object.keys(val)) {
          const opVal = val[op];
          if (opVal && typeof opVal === 'object' && opVal.$relativeTime) {
            if (['$lt', '$lte', '$gt', '$gte'].indexOf(op) === -1) {
              throw new Parse.Error(
                Parse.Error.INVALID_JSON,
                '$relativeTime can only be used with the $lt, $lte, $gt, and $gte operators'
              );
            }
            if (schema.fields && schema.fields[key] && schema.fields[key].type !== 'Date') {
              throw new Parse.Error(
                Parse.Error.INVALID_JSON,
                '$relativeTime can only be used with Date field'
              );
            }
            const parserResult = Utils.relativeTimeToDate(opVal.$relativeTime);
            if (parserResult.status === 'success') {
              val[op] = parserResult.result;
            } else {
              throw new Parse.Error(
                Parse.Error.INVALID_JSON,
                `bad $relativeTime (${opVal.$relativeTime}) value. ${parserResult.info}`
              );
            }
          }
        }
      }

      const isDotNotation = key.indexOf('.') >= 0;
      const authDataMatch = key.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
      let targetSql;
      if (authDataMatch) {
        targetSql = `json_extract("authData", '$.${authDataMatch[1]}')`;
      } else if (isDotNotation) {
        targetSql = transformDotField(key);
      } else {
        validateFieldName(key);
        targetSql = quoteColumnName(key);
      }

      const isArrayField = key === '_rperm' || key === '_wperm' || (schema.fields && schema.fields[key] && schema.fields[key].type === 'Array');

      if (val === null || val === undefined) {
        conditions.push(`${targetSql} IS NULL`);
        continue;
      }

      if (isQueryOperatorObject(val)) {
        const keys = Object.keys(val);
        for (const op of keys) {
          const opVal = val[op];
          if (op === '$eq') {
            if (opVal === null) {
              conditions.push(`${targetSql} IS NULL`);
            } else if (isArrayField) {
              const elementMatch = getArrayElementMatchExpression(targetSql, opVal);
              conditions.push(elementMatch.sql);
              params.push(...elementMatch.params);
            } else {
              conditions.push(`${targetSql} = ?`);
              params.push(toSQLiteValue(opVal));
            }
          } else if (op === '$ne') {
            if (opVal === null) {
              conditions.push(`${targetSql} IS NOT NULL`);
            } else if (isArrayField) {
              const elementMatch = getArrayElementMatchExpression(targetSql, opVal);
              conditions.push(`(${targetSql} IS NULL OR NOT (${elementMatch.sql}))`);
              params.push(...elementMatch.params);
            } else {
              conditions.push(`(${targetSql} IS NULL OR ${targetSql} != ?)`);
              params.push(toSQLiteValue(opVal));
            }
          } else if (op === '$lt') {
            conditions.push(`${targetSql} < ?`);
            params.push(toSQLiteValue(opVal));
          } else if (op === '$lte') {
            conditions.push(`${targetSql} <= ?`);
            params.push(toSQLiteValue(opVal));
          } else if (op === '$gt') {
            conditions.push(`${targetSql} > ?`);
            params.push(toSQLiteValue(opVal));
          } else if (op === '$gte') {
            conditions.push(`${targetSql} >= ?`);
            params.push(toSQLiteValue(opVal));
          } else if (op === '$in') {
            if (Array.isArray(opVal) && opVal.length > 0) {
              const hasNull = opVal.includes(null);
              const nonNulls = opVal.filter(v => v !== null);
              if (isArrayField) {
                if (nonNulls.length > 0) {
                  const anyMatch = getArrayAnyMatchExpression(targetSql, nonNulls);
                  if (hasNull) {
                    conditions.push(`(${targetSql} IS NULL OR (${anyMatch.sql}))`);
                  } else {
                    conditions.push(anyMatch.sql);
                  }
                  params.push(...anyMatch.params);
                } else if (hasNull) {
                  conditions.push(`${targetSql} IS NULL`);
                } else {
                  conditions.push('1 = 0');
                }
              } else {
                if (nonNulls.length > 0) {
                  const inPlaceholders = nonNulls.map(() => '?').join(', ');
                  if (hasNull) {
                    conditions.push(`(${targetSql} IS NULL OR ${targetSql} IN (${inPlaceholders}))`);
                  } else {
                    conditions.push(`${targetSql} IN (${inPlaceholders})`);
                  }
                  params.push(...nonNulls.map(toSQLiteValue));
                } else if (hasNull) {
                  conditions.push(`${targetSql} IS NULL`);
                } else {
                  conditions.push('1 = 0');
                }
              }
            } else {
              conditions.push('1 = 0');
            }
          } else if (op === '$nin') {
            if (Array.isArray(opVal) && opVal.length > 0) {
              const hasNull = opVal.includes(null);
              const nonNulls = opVal.filter(v => v !== null);
              if (isArrayField) {
                if (nonNulls.length > 0) {
                  const anyMatch = getArrayAnyMatchExpression(targetSql, nonNulls);
                  if (hasNull) {
                    conditions.push(`(${targetSql} IS NOT NULL AND NOT (${anyMatch.sql}))`);
                  } else {
                    conditions.push(`(${targetSql} IS NULL OR NOT (${anyMatch.sql}))`);
                  }
                  params.push(...anyMatch.params);
                } else if (hasNull) {
                  conditions.push(`${targetSql} IS NOT NULL`);
                }
              } else {
                if (nonNulls.length > 0) {
                  const inPlaceholders = nonNulls.map(() => '?').join(', ');
                  if (hasNull) {
                    conditions.push(`(${targetSql} IS NOT NULL AND ${targetSql} NOT IN (${inPlaceholders}))`);
                  } else {
                    conditions.push(`(${targetSql} IS NULL OR ${targetSql} NOT IN (${inPlaceholders}))`);
                  }
                  params.push(...nonNulls.map(toSQLiteValue));
                } else if (hasNull) {
                  conditions.push(`${targetSql} IS NOT NULL`);
                }
              }
            }
          } else if (op === '$exists') {
            if (opVal) {
              conditions.push(`${targetSql} IS NOT NULL`);
            } else {
              conditions.push(`${targetSql} IS NULL`);
            }
          } else if (op === '$regex') {
            const flags = val.$options || '';
            validateRegexPattern(opVal, flags);
            if (isArrayField) {
              if (flags) {
                conditions.push(`EXISTS (SELECT 1 FROM json_each(${targetSql}) WHERE regexp_flags(?, ?, value) = 1)`);
                params.push(opVal, flags);
              } else {
                conditions.push(`EXISTS (SELECT 1 FROM json_each(${targetSql}) WHERE value REGEXP ?)`);
                params.push(opVal);
              }
            } else {
              if (flags) {
                conditions.push(`regexp_flags(?, ?, ${targetSql}) = 1`);
                params.push(opVal, flags);
              } else {
                conditions.push(`${targetSql} REGEXP ?`);
                params.push(opVal);
              }
            }
          } else if (op === '$nearSphere') {
            const point = opVal;
            const lat = point.latitude;
            const lng = point.longitude;
            const maxDistance = val.$maxDistance;
            if (maxDistance !== undefined) {
              conditions.push(`parse_geo_distance(json_extract(${targetSql}, '$.latitude'), json_extract(${targetSql}, '$.longitude'), ?, ?) <= ?`);
              params.push(lat, lng, maxDistance);
            }
          } else if (op === '$within') {
            if (opVal.$box) {
              const box = opVal.$box;
              conditions.push(`parse_within_box(json_extract(${targetSql}, '$.latitude'), json_extract(${targetSql}, '$.longitude'), ?, ?, ?, ?) = 1`);
              params.push(box[0].latitude, box[0].longitude, box[1].latitude, box[1].longitude);
            }
          } else if (op === '$geoWithin') {
            if (opVal.$centerSphere) {
              const cs = opVal.$centerSphere;
              const point = cs[0];
              const maxDistanceRad = cs[1];
              const lat = Array.isArray(point) ? point[1] : point.latitude;
              const lng = Array.isArray(point) ? point[0] : point.longitude;
              conditions.push(`parse_geo_distance(json_extract(${targetSql}, '$.latitude'), json_extract(${targetSql}, '$.longitude'), ?, ?) <= ?`);
              params.push(lat, lng, maxDistanceRad);
            } else if (opVal.$polygon) {
              const poly = opVal.$polygon;
              conditions.push(`parse_within_polygon(json_extract(${targetSql}, '$.latitude'), json_extract(${targetSql}, '$.longitude'), ?) = 1`);
              params.push(JSON.stringify(poly));
            }
          } else if (op === '$geoIntersects') {
            if (opVal.$polygon) {
              const poly = opVal.$polygon;
              conditions.push(`parse_within_polygon(json_extract(${targetSql}, '$.latitude'), json_extract(${targetSql}, '$.longitude'), ?) = 1`);
              params.push(JSON.stringify(poly));
            }
          } else if (op === '$all') {
            if (Array.isArray(opVal)) {
              for (const elem of opVal) {
                if (isArrayField) {
                  const elementMatch = getArrayElementMatchExpression(targetSql, elem);
                  conditions.push(elementMatch.sql);
                  params.push(...elementMatch.params);
                } else {
                  conditions.push(`${targetSql} = ?`);
                  params.push(toSQLiteValue(elem));
                }
              }
            }
          } else if (op === '$containedBy') {
            if (Array.isArray(opVal)) {
              if (opVal.length === 0) {
                conditions.push(`(${targetSql} IS NULL OR json_array_length(${targetSql}) = 0)`);
              } else {
                const placeholders = opVal.map(() => '?').join(', ');
                if (isArrayField) {
                  conditions.push(`(${targetSql} IS NULL OR NOT EXISTS (SELECT 1 FROM json_each(${targetSql}) WHERE value NOT IN (${placeholders})))`);
                } else {
                  conditions.push(`(${targetSql} IS NULL OR ${targetSql} IN (${placeholders}))`);
                }
                params.push(...opVal.map(toSQLiteValue));
              }
            }
          }
        }
      } else {
        if (isArrayField) {
          const elementMatch = getArrayElementMatchExpression(targetSql, val);
          conditions.push(elementMatch.sql);
          params.push(...elementMatch.params);
        } else {
          conditions.push(`${targetSql} = ?`);
          params.push(toSQLiteValue(val));
        }
      }
    }

    return {
      sql: conditions.join(' AND '),
      params,
    };
  }

  async find(
    className: string,
    schema: SchemaType,
    query: QueryType,
    { skip, limit, sort, keys }: QueryOptions = {},
    transactionalSession?: any
  ): Promise<Array<any>> {
    const db = transactionalSession || this._db;
    if (!(await this.classExists(className))) {
      return [];
    }
    schema = normalizeSQLiteSchema(className, schema);
    const tableName = this._tableName(className);
    const where = this._buildWhereClause(className, schema, query);

    let selectSql = '*';
    if (keys && keys.length > 0) {
      const selectedCols = [];
      const selectedKeys = keys.reduce((memo, key) => {
        if (key === 'ACL') {
          memo.push('_rperm');
          memo.push('_wperm');
        } else if (key && key.length > 0) {
          memo.push(key);
        }
        return memo;
      }, []);

      for (const k of selectedKeys) {
        const rootFieldName = k.indexOf('.') >= 0 ? k.split('.')[0] : k;
        if (k !== '$score' && (!schema.fields[rootFieldName] || schema.fields[rootFieldName].type === 'Relation')) {
          continue;
        }
        if (k.indexOf('.') >= 0) {
          selectedCols.push(`${transformDotField(k)} as "${k.replace(/"/g, '""')}"`);
        } else if (k === '$score') {
          continue;
        } else {
          validateFieldName(k);
          selectedCols.push(quoteColumnName(k));
        }
      }
      if (selectedCols.length > 0) {
        selectSql = selectedCols.join(', ');
      }
    }

    let sql = `SELECT ${selectSql} FROM ${tableName}`;
    if (where.sql) {
      sql += ` WHERE ${where.sql}`;
    }

    if (sort) {
      const sortParts = [];
      for (const sortKey of Object.keys(sort)) {
        const dir = sort[sortKey] > 0 ? 'ASC' : 'DESC';
        if (sortKey.indexOf('.') >= 0) {
          sortParts.push(`${transformDotField(sortKey)} ${dir}`);
        } else {
          validateFieldName(sortKey);
          sortParts.push(`${quoteColumnName(sortKey)} ${dir}`);
        }
      }
      if (sortParts.length > 0) {
        sql += ` ORDER BY ${sortParts.join(', ')}`;
      }
    }

    if (limit !== undefined) {
      sql += ` LIMIT ${parseInt(limit, 10)}`;
    }
    if (skip !== undefined) {
      if (limit === undefined) {
        sql += ` LIMIT -1`;
      }
      sql += ` OFFSET ${parseInt(skip, 10)}`;
    }

    const rows = this._prepare(sql, db).all(...where.params);
    return rows.map(row => this._sqliteRowToParseObject(className, row, schema));
  }

  async count(
    className: string,
    schema: SchemaType,
    query: QueryType
  ): Promise<number> {
    if (!(await this.classExists(className))) {
      return 0;
    }
    const tableName = this._tableName(className);
    const where = this._buildWhereClause(className, schema, query);
    let sql = `SELECT COUNT(*) as count FROM ${tableName}`;
    if (where.sql) {
      sql += ` WHERE ${where.sql}`;
    }
    const row = this._prepare(sql).get(...where.params);
    return row ? row.count : 0;
  }

  async distinct(
    className: string,
    schema: SchemaType,
    query: QueryType,
    fieldName: string
  ): Promise<any> {
    validateFieldName(fieldName.split('.')[0]);
    if (!(await this.classExists(className))) {
      return [];
    }
    const tableName = this._tableName(className);
    const where = this._buildWhereClause(className, schema, query);
    const targetSql = fieldName.indexOf('.') >= 0 ? transformDotField(fieldName) : `"${fieldName.replace(/"/g, '""')}"`;

    let sql = `SELECT DISTINCT ${targetSql} as val FROM ${tableName}`;
    if (where.sql) {
      sql += ` WHERE ${where.sql} AND ${targetSql} IS NOT NULL`;
    } else {
      sql += ` WHERE ${targetSql} IS NOT NULL`;
    }

    const rows = this._prepare(sql).all(...where.params);
    return rows.map(r => sqliteValueToParseValue(r.val, schema ? (schema.fields || {})[fieldName] : null));
  }

  async aggregate(
    className: string,
    schema: any,
    pipeline: any
  ): Promise<any> {
    if (!(await this.classExists(className))) {
      return [];
    }
    const tableName = this._tableName(className);

    let matchQuery = {};
    let groupStage = null;
    let limitVal = null;
    let skipVal = null;
    let sortStage = null;

    for (const stage of pipeline) {
      if (stage.$match) {
        matchQuery = Object.assign(matchQuery, stage.$match);
      } else if (stage.$group) {
        groupStage = stage.$group;
      } else if (stage.$limit) {
        limitVal = stage.$limit;
      } else if (stage.$skip) {
        skipVal = stage.$skip;
      } else if (stage.$sort) {
        sortStage = stage.$sort;
      }
    }

    const where = this._buildWhereClause(className, schema, matchQuery);

    if (groupStage) {
      const groupByField = groupStage._id;
      const groupCols = [];
      const selectCols = [];

      if (groupStage._id !== null) {
        if (typeof groupByField === 'string' && groupByField.startsWith('$')) {
          const fieldName = groupByField.substring(1);
          validateFieldName(fieldName);
          groupCols.push(`"${fieldName.replace(/"/g, '""')}"`);
          selectCols.push(`"${fieldName.replace(/"/g, '""')}" as "_id"`);
        } else {
          selectCols.push(`NULL as "_id"`);
        }
      } else {
        selectCols.push(`NULL as "_id"`);
      }

      for (const key of Object.keys(groupStage)) {
        if (key === '_id') {
          continue;
        }
        const aggObj = groupStage[key];
        if (aggObj.$sum !== undefined) {
          if (aggObj.$sum === 1) {
            selectCols.push(`COUNT(*) as "${key}"`);
          } else if (typeof aggObj.$sum === 'string' && aggObj.$sum.startsWith('$')) {
            const f = aggObj.$sum.substring(1);
            validateFieldName(f);
            selectCols.push(`SUM("${f.replace(/"/g, '""')}") as "${key}"`);
          } else {
            selectCols.push(`SUM(${Number(aggObj.$sum)}) as "${key}"`);
          }
        } else if (aggObj.$avg !== undefined) {
          const f = aggObj.$avg.substring(1);
          validateFieldName(f);
          selectCols.push(`AVG("${f.replace(/"/g, '""')}") as "${key}"`);
        } else if (aggObj.$max !== undefined) {
          const f = aggObj.$max.substring(1);
          validateFieldName(f);
          selectCols.push(`MAX("${f.replace(/"/g, '""')}") as "${key}"`);
        } else if (aggObj.$min !== undefined) {
          const f = aggObj.$min.substring(1);
          validateFieldName(f);
          selectCols.push(`MIN("${f.replace(/"/g, '""')}") as "${key}"`);
        }
      }

      let sql = `SELECT ${selectCols.join(', ')} FROM ${tableName}`;
      if (where.sql) {
        sql += ` WHERE ${where.sql}`;
      }
      if (groupCols.length > 0) {
        sql += ` GROUP BY ${groupCols.join(', ')}`;
      }
      const rows = this._prepare(sql).all(...where.params);
      return rows;
    }

    return this.find(className, schema, matchQuery, { limit: limitVal, skip: skipVal, sort: sortStage });
  }

  async deleteObjectsByQuery(
    className: string,
    schema: SchemaType,
    query: QueryType,
    transactionalSession: ?any
  ): Promise<void> {
    if (!(await this.classExists(className))) {
      return;
    }
    const tableName = this._tableName(className);
    const where = this._buildWhereClause(className, schema, query);
    let sql = `DELETE FROM ${tableName}`;
    if (where.sql) {
      sql += ` WHERE ${where.sql}`;
    }
    const result = this._prepare(sql, transactionalSession).run(...where.params);
    if (!result || result.changes === 0) {
      throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Object not found.');
    }
  }

  async updateObjectsByQuery(
    className: string,
    schema: SchemaType,
    query: QueryType,
    update: any,
    transactionalSession: ?any
  ): Promise<any> {
    if (!(await this.classExists(className))) {
      return [];
    }
    schema = normalizeSQLiteSchema(className, schema);
    const db = transactionalSession || this._db;
    const existing = await this.find(className, schema, query, {}, db);
    if (!existing || existing.length === 0) {
      return [];
    }

    const tableName = this._tableName(className);
    const where = this._buildWhereClause(className, schema, query);

    const setClauses = [];
    const params = [];

    const handleOp = async (fieldName: string, fieldValue: any) => {
      if (typeof fieldValue === 'undefined') {
        return;
      }
      const authDataMatch = fieldName.match(/^_auth_data_([a-zA-Z0-9_]+)$/);
      if (authDataMatch) {
        const provider = authDataMatch[1];
        fieldName = 'authData';
        fieldValue = { [provider]: fieldValue };
      }
      const isDotNotationField = fieldName.indexOf('.') >= 0;
      const dotFieldPath = isDotNotationField ? buildDotFieldPath(fieldName) : null;
      const columnName = quoteColumnName(
        dotFieldPath ? dotFieldPath.rootFieldName : fieldName
      );

      await this._ensureColumnsExist(className, { [fieldName]: fieldValue }, schema, db);

      if (fieldValue === null) {
        if (dotFieldPath) {
          setClauses.push(
            `${columnName} = json_set(COALESCE(${columnName}, '{}'), '${dotFieldPath.jsonPath}', NULL)`
          );
        } else {
          validateFieldName(fieldName);
          setClauses.push(`${columnName} = NULL`);
        }
        return;
      }

      if (typeof fieldValue === 'object') {
        if (fieldValue.__op === 'Increment') {
          if (typeof fieldValue.amount !== 'number' || Number.isNaN(fieldValue.amount)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, 'Cannot increment by a non-numeric value.');
          }
          if (dotFieldPath) {
            setClauses.push(
              `${columnName} = json_set(COALESCE(${columnName}, '{}'), '${dotFieldPath.jsonPath}', COALESCE(json_extract(${columnName}, '${dotFieldPath.jsonPath}'), 0) + ?)`
            );
          } else {
            validateFieldName(fieldName);
            setClauses.push(`${columnName} = COALESCE(${columnName}, 0) + ?`);
          }
          params.push(fieldValue.amount);
          return;
        }
        if (fieldValue.__op === 'Add') {
          if (dotFieldPath) {
            const objectValueExpression = getJsonObjectValueExpression(columnName);
            const arrayValueExpression = getJsonArrayValueExpression(
              objectValueExpression,
              dotFieldPath.jsonPath
            );
            setClauses.push(
              `${columnName} = json_set(${objectValueExpression}, '${dotFieldPath.jsonPath}', json(parse_array_add(${arrayValueExpression}, ?)))`
            );
          } else {
            validateFieldName(fieldName);
            setClauses.push(`${columnName} = parse_array_add(${columnName}, ?)`);
          }
          params.push(JSON.stringify(fieldValue.objects));
          return;
        }
        if (fieldValue.__op === 'AddUnique') {
          if (dotFieldPath) {
            const objectValueExpression = getJsonObjectValueExpression(columnName);
            const arrayValueExpression = getJsonArrayValueExpression(
              objectValueExpression,
              dotFieldPath.jsonPath
            );
            setClauses.push(
              `${columnName} = json_set(${objectValueExpression}, '${dotFieldPath.jsonPath}', json(parse_array_add_unique(${arrayValueExpression}, ?)))`
            );
          } else {
            validateFieldName(fieldName);
            setClauses.push(`${columnName} = parse_array_add_unique(${columnName}, ?)`);
          }
          params.push(JSON.stringify(fieldValue.objects));
          return;
        }
        if (fieldValue.__op === 'Remove') {
          if (dotFieldPath) {
            const objectValueExpression = getJsonObjectValueExpression(columnName);
            const arrayValueExpression = getJsonArrayValueExpression(
              objectValueExpression,
              dotFieldPath.jsonPath
            );
            setClauses.push(
              `${columnName} = json_set(${objectValueExpression}, '${dotFieldPath.jsonPath}', json(parse_array_remove(${arrayValueExpression}, ?)))`
            );
          } else {
            validateFieldName(fieldName);
            setClauses.push(`${columnName} = parse_array_remove(${columnName}, ?)`);
          }
          params.push(JSON.stringify(fieldValue.objects));
          return;
        }
        if (fieldValue.__op === 'Delete') {
          if (dotFieldPath) {
            setClauses.push(`${columnName} = json_remove(${columnName}, '${dotFieldPath.jsonPath}')`);
          } else {
            validateFieldName(fieldName);
            setClauses.push(`${columnName} = NULL`);
          }
          return;
        }
        if (fieldName === 'authData') {
          validateFieldName('authData');
          for (const provider of Object.keys(fieldValue)) {
            let val = fieldValue[provider];
            if (val && val.__op === 'Delete') {
              val = null;
            }
            if (val === null) {
              setClauses.push(`"authData" = json_remove(COALESCE("authData", '{}'), '$."${provider}"')`);
            } else {
              setClauses.push(
                `"authData" = json_set(COALESCE("authData", '{}'), '$."${provider}"', ${getParameterizedValueExpression(val)})`
              );
              params.push(toSQLiteValue(val));
            }
          }
          return;
        }
        if (fieldValue.__type === 'Relation') {
          return;
        }
      }

      if (dotFieldPath) {
        setClauses.push(
          `${columnName} = json_set(COALESCE(${columnName}, '{}'), '${dotFieldPath.jsonPath}', ${getParameterizedValueExpression(fieldValue)})`
        );
        params.push(toSQLiteValue(fieldValue));
        return;
      }

      validateFieldName(fieldName);
      setClauses.push(`${columnName} = ?`);
      params.push(toSQLiteValue(fieldValue));
    };

    if (update.$set) {
      for (const k of Object.keys(update.$set)) {
        await handleOp(k, update.$set[k]);
      }
    }
    if (update.$inc) {
      for (const k of Object.keys(update.$inc)) {
        await handleOp(k, { __op: 'Increment', amount: update.$inc[k] });
      }
    }
    if (update.$unset) {
      for (const k of Object.keys(update.$unset)) {
        if (k.indexOf('.') >= 0) {
          const { rootFieldName, jsonPath } = buildDotFieldPath(k);
          const columnName = quoteColumnName(rootFieldName);
          setClauses.push(`${columnName} = json_remove(${columnName}, '${jsonPath}')`);
        } else {
          validateFieldName(k);
          setClauses.push(`${quoteColumnName(k)} = NULL`);
        }
      }
    }
    if (update.$add) {
      for (const k of Object.keys(update.$add)) {
        await handleOp(k, { __op: 'Add', objects: update.$add[k] });
      }
    }
    if (update.$addUnique) {
      for (const k of Object.keys(update.$addUnique)) {
        await handleOp(k, { __op: 'AddUnique', objects: update.$addUnique[k] });
      }
    }
    if (update.$remove) {
      for (const k of Object.keys(update.$remove)) {
        await handleOp(k, { __op: 'Remove', objects: update.$remove[k] });
      }
    }

    for (const k of Object.keys(update)) {
      if (!k.startsWith('$')) {
        await handleOp(k, update[k]);
      }
    }

    if (setClauses.length > 0) {
      let sql = `UPDATE ${tableName} SET ${setClauses.join(', ')}`;
      if (where.sql) {
        sql += ` WHERE ${where.sql}`;
      }
      params.push(...where.params);
      this._prepare(sql, transactionalSession).run(...params);
    }

    const ids = existing.map(o => o.objectId);
    const updated = await this.find(className, schema, { objectId: { $in: ids } }, {}, db);
    return updated;
  }

  async findOneAndUpdate(
    className: string,
    schema: SchemaType,
    query: QueryType,
    update: any,
    transactionalSession: ?any
  ): Promise<any> {
    const results = await this.updateObjectsByQuery(className, schema, query, update, transactionalSession);
    return results ? results[0] : undefined;
  }

  async upsertOneObject(
    className: string,
    schema: SchemaType,
    query: QueryType,
    update: any,
    transactionalSession: ?any
  ): Promise<any> {
    const db = transactionalSession || this._db;
    const existing = await this.find(className, schema, query, { limit: 1 });
    if (existing && existing.length > 0) {
      await this.updateObjectsByQuery(className, schema, query, update, db);
      return this.find(className, schema, { objectId: existing[0].objectId }, { limit: 1 }).then(r => r[0]);
    } else {
      const createObj = Object.assign({}, query, update.$set || {});
      await this.createObject(className, schema, createObj, db);
      return createObj;
    }
  }

  async ensureIndex(
    className: string,
    schema: SchemaType,
    fieldNames: string[],
    indexName?: string,
    _caseSensitive?: boolean = false,
    options?: Object = {}
  ): Promise<any> {
    if (_caseSensitive) {
      // SQLite indexes are case sensitive by default for text comparisons unless NOCASE is specified
    }
    if (!(await this.classExists(className))) {
      const fields = {};
      fieldNames.forEach(f => {
        fields[f] = { type: 'String' };
      });
      await this.createClass(className, schema || { fields });
    }
    const tableName = this._tableName(className);
    const idxName = indexName || `parse_default_${fieldNames.sort().join('_')}`;
    const safeIdxName = `"${idxName.replace(/"/g, '""')}"`;
    const colExprs = fieldNames.map(f => {
      validateFieldName(f);
      return `"${f.replace(/"/g, '""')}"`;
    });

    let sql = `CREATE INDEX IF NOT EXISTS ${safeIdxName} ON ${tableName} (${colExprs.join(', ')})`;
    if (options.ttl) {
      sql = `CREATE INDEX IF NOT EXISTS ${safeIdxName} ON ${tableName} ("_expiresAt")`;
    }
    try {
      this._prepare(sql, options.conn).run();
    } catch {
      /* */
    }
  }

  async ensureUniqueness(className: string, schema: SchemaType, fieldNames: Array<string>): Promise<void> {
    if (!(await this.classExists(className))) {
      const fields = {};
      fieldNames.forEach(f => {
        fields[f] = { type: 'String' };
      });
      await this.createClass(className, schema || { fields });
    }
    const tableName = this._tableName(className);
    const idxName = `unique_${fieldNames.join('_')}`;
    const safeIdxName = `"${idxName.replace(/"/g, '""')}"`;
    const colExprs = fieldNames.map(f => {
      validateFieldName(f);
      return `"${f.replace(/"/g, '""')}"`;
    });

    const sql = `CREATE UNIQUE INDEX IF NOT EXISTS ${safeIdxName} ON ${tableName} (${colExprs.join(', ')})`;
    try {
      this._prepare(sql).run();
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        throw new Parse.Error(
          Parse.Error.DUPLICATE_VALUE,
          'Tried to ensure field uniqueness for a class that already has duplicates.'
        );
      }
      throw err;
    }
  }

  async ensureAuthDataUniqueness(provider: string): Promise<void> {
    if (!(await this.classExists('_User'))) {
      await this.createClass('_User', { fields: { authData: { type: 'Object' } } });
    }
    const indexName = `_User_unique_authData_${provider}_id`;
    const safeIdxName = `"${indexName.replace(/"/g, '""')}"`;
    const tableName = this._tableName('_User');
    const sql = `CREATE UNIQUE INDEX IF NOT EXISTS ${safeIdxName} ON ${tableName} (json_extract("authData", '$."${provider}".id')) WHERE json_extract("authData", '$."${provider}".id') IS NOT NULL`;
    try {
      this._prepare(sql).run();
    } catch (err) {
      if (err.message && err.message.includes('UNIQUE constraint failed')) {
        throw new Parse.Error(
          Parse.Error.DUPLICATE_VALUE,
          'Tried to ensure field uniqueness for a class that already has duplicates.'
        );
      }
      throw err;
    }
  }

  async createIndexes(className: string, indexes: any, conn?: any): Promise<void> {
    if (!indexes) {
      return;
    }
    if (!(await this.classExists(className))) {
      await this.createClass(className, { fields: {} });
    }
    for (const name of Object.keys(indexes)) {
      const idx = indexes[name];
      const fields = Object.keys(idx);
      const idxName = `"${name.replace(/"/g, '""')}"`;
      const tableName = this._tableName(className);
      const cols = fields.map(f => {
        validateFieldName(f);
        return `"${f.replace(/"/g, '""')}"`;
      });
      this._prepare(`CREATE INDEX IF NOT EXISTS ${idxName} ON ${tableName} (${cols.join(', ')})`, conn).run();
    }
  }

  async getIndexes(className: string, connection?: any): Promise<Array<any>> {
    if (!(await this.classExists(className))) {
      return [];
    }
    const rawName = this._rawTableName(className);
    const rows = this._prepare(`PRAGMA index_list("${rawName.replace(/"/g, '""')}")`, connection).all();
    return rows.map(r => ({ name: r.name, unique: Boolean(r.unique) }));
  }

  async updateSchemaWithIndexes(): Promise<void> {}

  async setIndexesWithSchemaFormat(
    className: string,
    submittedIndexes: any,
    existingIndexes: any,
    fields: any,
    conn?: any
  ): Promise<void> {
    if (submittedIndexes) {
      await this.createIndexes(className, submittedIndexes, conn);
    }
  }

  async performInitialization(options: any = {}): Promise<void> {
    this._initSchemaTable();
    const VolatileClassesSchemas = options.VolatileClassesSchemas || [];
    for (const schema of VolatileClassesSchemas) {
      if (!(await this.classExists(schema.className))) {
        try {
          await this.createClass(schema.className, schema);
        } catch (err) {
          if (err.code !== Parse.Error.DUPLICATE_VALUE) {
            throw err;
          }
        }
      }
    }
  }

  async createTransactionalSession(): Promise<any> {
    const txDb = createClient(this._dbOptions);
    txDb.exec('BEGIN IMMEDIATE');
    return txDb;
  }

  async commitTransactionalSession(transactionalSession: any): Promise<void> {
    try {
      transactionalSession.exec('COMMIT');
    } finally {
      transactionalSession.close();
    }
  }

  async abortTransactionalSession(transactionalSession: any): Promise<void> {
    try {
      transactionalSession.exec('ROLLBACK');
    } finally {
      transactionalSession.close();
    }
  }
}

export default SQLiteStorageAdapter;
