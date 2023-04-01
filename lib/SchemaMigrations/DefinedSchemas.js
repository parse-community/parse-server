"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DefinedSchemas = void 0;
var _logger = require("../logger");
var _Config = _interopRequireDefault(require("../Config"));
var _SchemasRouter = require("../Routers/SchemasRouter");
var _SchemaController = require("../Controllers/SchemaController");
var _Options = require("../Options");
var Migrations = _interopRequireWildcard(require("./Migrations"));
var _Auth = _interopRequireDefault(require("../Auth"));
var _rest = _interopRequireDefault(require("../rest"));
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
// -disable-next Cannot resolve module `parse/node`.
const Parse = require('parse/node');
class DefinedSchemas {
  constructor(schemaOptions, config) {
    this.localSchemas = [];
    this.config = _Config.default.get(config.appId);
    this.schemaOptions = schemaOptions;
    if (schemaOptions && schemaOptions.definitions) {
      if (!Array.isArray(schemaOptions.definitions)) {
        throw `"schema.definitions" must be an array of schemas`;
      }
      this.localSchemas = schemaOptions.definitions;
    }
    this.retries = 0;
    this.maxRetries = 3;
  }
  async saveSchemaToDB(schema) {
    const payload = {
      className: schema.className,
      fields: schema._fields,
      indexes: schema._indexes,
      classLevelPermissions: schema._clp
    };
    await (0, _SchemasRouter.internalCreateSchema)(schema.className, payload, this.config);
    this.resetSchemaOps(schema);
  }
  resetSchemaOps(schema) {
    // Reset ops like SDK
    schema._fields = {};
    schema._indexes = {};
  }

  // Simulate update like the SDK
  // We cannot use SDK since routes are disabled
  async updateSchemaToDB(schema) {
    const payload = {
      className: schema.className,
      fields: schema._fields,
      indexes: schema._indexes,
      classLevelPermissions: schema._clp
    };
    await (0, _SchemasRouter.internalUpdateSchema)(schema.className, payload, this.config);
    this.resetSchemaOps(schema);
  }
  async execute() {
    try {
      _logger.logger.info('Running Migrations');
      if (this.schemaOptions && this.schemaOptions.beforeMigration) {
        await Promise.resolve(this.schemaOptions.beforeMigration());
      }
      await this.executeMigrations();
      if (this.schemaOptions && this.schemaOptions.afterMigration) {
        await Promise.resolve(this.schemaOptions.afterMigration());
      }
      _logger.logger.info('Running Migrations Completed');
    } catch (e) {
      _logger.logger.error(`Failed to run migrations: ${e}`);
      if (process.env.NODE_ENV === 'production') process.exit(1);
    }
  }
  async executeMigrations() {
    let timeout = null;
    try {
      // Set up a time out in production
      // if we fail to get schema
      // pm2 or K8s and many other process managers will try to restart the process
      // after the exit
      if (process.env.NODE_ENV === 'production') {
        timeout = setTimeout(() => {
          _logger.logger.error('Timeout occurred during execution of migrations. Exiting...');
          process.exit(1);
        }, 20000);
      }
      await this.createDeleteSession();
      // -disable-next-line
      const schemaController = await this.config.database.loadSchema();
      this.allCloudSchemas = await schemaController.getAllClasses();
      clearTimeout(timeout);
      await Promise.all(this.localSchemas.map(async localSchema => this.saveOrUpdate(localSchema)));
      this.checkForMissingSchemas();
      await this.enforceCLPForNonProvidedClass();
    } catch (e) {
      if (timeout) clearTimeout(timeout);
      if (this.retries < this.maxRetries) {
        this.retries++;
        // first retry 1sec, 2sec, 3sec total 6sec retry sequence
        // retry will only happen in case of deploying multi parse server instance
        // at the same time. Modern systems like k8 avoid this by doing rolling updates
        await this.wait(1000 * this.retries);
        await this.executeMigrations();
      } else {
        _logger.logger.error(`Failed to run migrations: ${e}`);
        if (process.env.NODE_ENV === 'production') process.exit(1);
      }
    }
  }
  checkForMissingSchemas() {
    if (this.schemaOptions.strict !== true) {
      return;
    }
    const cloudSchemas = this.allCloudSchemas.map(s => s.className);
    const localSchemas = this.localSchemas.map(s => s.className);
    const missingSchemas = cloudSchemas.filter(c => !localSchemas.includes(c) && !_SchemaController.systemClasses.includes(c));
    if (new Set(localSchemas).size !== localSchemas.length) {
      _logger.logger.error(`The list of schemas provided contains duplicated "className"  "${localSchemas.join('","')}"`);
      process.exit(1);
    }
    if (this.schemaOptions.strict && missingSchemas.length) {
      _logger.logger.warn(`The following schemas are currently present in the database, but not explicitly defined in a schema: "${missingSchemas.join('", "')}"`);
    }
  }

  // Required for testing purpose
  wait(time) {
    return new Promise(resolve => setTimeout(resolve, time));
  }
  async enforceCLPForNonProvidedClass() {
    const nonProvidedClasses = this.allCloudSchemas.filter(cloudSchema => !this.localSchemas.some(localSchema => localSchema.className === cloudSchema.className));
    await Promise.all(nonProvidedClasses.map(async schema => {
      const parseSchema = new Parse.Schema(schema.className);
      this.handleCLP(schema, parseSchema);
      await this.updateSchemaToDB(parseSchema);
    }));
  }

  // Create a fake session since Parse do not create the _Session until
  // a session is created
  async createDeleteSession() {
    const {
      response
    } = await _rest.default.create(this.config, _Auth.default.master(this.config), '_Session', {});
    await _rest.default.del(this.config, _Auth.default.master(this.config), '_Session', response.objectId);
  }
  async saveOrUpdate(localSchema) {
    const cloudSchema = this.allCloudSchemas.find(sc => sc.className === localSchema.className);
    if (cloudSchema) {
      try {
        await this.updateSchema(localSchema, cloudSchema);
      } catch (e) {
        throw `Error during update of schema for type ${cloudSchema.className}: ${e}`;
      }
    } else {
      try {
        await this.saveSchema(localSchema);
      } catch (e) {
        throw `Error while saving Schema for type ${localSchema.className}: ${e}`;
      }
    }
  }
  async saveSchema(localSchema) {
    const newLocalSchema = new Parse.Schema(localSchema.className);
    if (localSchema.fields) {
      // Handle fields
      Object.keys(localSchema.fields).filter(fieldName => !this.isProtectedFields(localSchema.className, fieldName)).forEach(fieldName => {
        if (localSchema.fields) {
          const field = localSchema.fields[fieldName];
          this.handleFields(newLocalSchema, fieldName, field);
        }
      });
    }
    // Handle indexes
    if (localSchema.indexes) {
      Object.keys(localSchema.indexes).forEach(indexName => {
        if (localSchema.indexes && !this.isProtectedIndex(localSchema.className, indexName)) {
          newLocalSchema.addIndex(indexName, localSchema.indexes[indexName]);
        }
      });
    }
    this.handleCLP(localSchema, newLocalSchema);
    return await this.saveSchemaToDB(newLocalSchema);
  }
  async updateSchema(localSchema, cloudSchema) {
    const newLocalSchema = new Parse.Schema(localSchema.className);

    // Handle fields
    // Check addition
    if (localSchema.fields) {
      Object.keys(localSchema.fields).filter(fieldName => !this.isProtectedFields(localSchema.className, fieldName)).forEach(fieldName => {
        // -disable-next
        const field = localSchema.fields[fieldName];
        if (!cloudSchema.fields[fieldName]) {
          this.handleFields(newLocalSchema, fieldName, field);
        }
      });
    }
    const fieldsToDelete = [];
    const fieldsToRecreate = [];
    const fieldsWithChangedParams = [];

    // Check deletion
    Object.keys(cloudSchema.fields).filter(fieldName => !this.isProtectedFields(localSchema.className, fieldName)).forEach(fieldName => {
      const field = cloudSchema.fields[fieldName];
      if (!localSchema.fields || !localSchema.fields[fieldName]) {
        fieldsToDelete.push(fieldName);
        return;
      }
      const localField = localSchema.fields[fieldName];
      // Check if field has a changed type
      if (!this.paramsAreEquals({
        type: field.type,
        targetClass: field.targetClass
      }, {
        type: localField.type,
        targetClass: localField.targetClass
      })) {
        fieldsToRecreate.push({
          fieldName,
          from: {
            type: field.type,
            targetClass: field.targetClass
          },
          to: {
            type: localField.type,
            targetClass: localField.targetClass
          }
        });
        return;
      }

      // Check if something changed other than the type (like required, defaultValue)
      if (!this.paramsAreEquals(field, localField)) {
        fieldsWithChangedParams.push(fieldName);
      }
    });
    if (this.schemaOptions.deleteExtraFields === true) {
      fieldsToDelete.forEach(fieldName => {
        newLocalSchema.deleteField(fieldName);
      });

      // Delete fields from the schema then apply changes
      await this.updateSchemaToDB(newLocalSchema);
    } else if (this.schemaOptions.strict === true && fieldsToDelete.length) {
      _logger.logger.warn(`The following fields exist in the database for "${localSchema.className}", but are missing in the schema : "${fieldsToDelete.join('" ,"')}"`);
    }
    if (this.schemaOptions.recreateModifiedFields === true) {
      fieldsToRecreate.forEach(field => {
        newLocalSchema.deleteField(field.fieldName);
      });

      // Delete fields from the schema then apply changes
      await this.updateSchemaToDB(newLocalSchema);
      fieldsToRecreate.forEach(fieldInfo => {
        if (localSchema.fields) {
          const field = localSchema.fields[fieldInfo.fieldName];
          this.handleFields(newLocalSchema, fieldInfo.fieldName, field);
        }
      });
    } else if (this.schemaOptions.strict === true && fieldsToRecreate.length) {
      fieldsToRecreate.forEach(field => {
        const from = field.from.type + (field.from.targetClass ? ` (${field.from.targetClass})` : '');
        const to = field.to.type + (field.to.targetClass ? ` (${field.to.targetClass})` : '');
        _logger.logger.warn(`The field "${field.fieldName}" type differ between the schema and the database for "${localSchema.className}"; Schema is defined as "${to}" and current database type is "${from}"`);
      });
    }
    fieldsWithChangedParams.forEach(fieldName => {
      if (localSchema.fields) {
        const field = localSchema.fields[fieldName];
        this.handleFields(newLocalSchema, fieldName, field);
      }
    });

    // Handle Indexes
    // Check addition
    if (localSchema.indexes) {
      Object.keys(localSchema.indexes).forEach(indexName => {
        if ((!cloudSchema.indexes || !cloudSchema.indexes[indexName]) && !this.isProtectedIndex(localSchema.className, indexName)) {
          if (localSchema.indexes) {
            newLocalSchema.addIndex(indexName, localSchema.indexes[indexName]);
          }
        }
      });
    }
    const indexesToAdd = [];

    // Check deletion
    if (cloudSchema.indexes) {
      Object.keys(cloudSchema.indexes).forEach(indexName => {
        if (!this.isProtectedIndex(localSchema.className, indexName)) {
          if (!localSchema.indexes || !localSchema.indexes[indexName]) {
            newLocalSchema.deleteIndex(indexName);
          } else if (!this.paramsAreEquals(localSchema.indexes[indexName], cloudSchema.indexes[indexName])) {
            newLocalSchema.deleteIndex(indexName);
            if (localSchema.indexes) {
              indexesToAdd.push({
                indexName,
                index: localSchema.indexes[indexName]
              });
            }
          }
        }
      });
    }
    this.handleCLP(localSchema, newLocalSchema, cloudSchema);
    // Apply changes
    await this.updateSchemaToDB(newLocalSchema);
    // Apply new/changed indexes
    if (indexesToAdd.length) {
      _logger.logger.debug(`Updating indexes for "${newLocalSchema.className}" :  ${indexesToAdd.join(' ,')}`);
      indexesToAdd.forEach(o => newLocalSchema.addIndex(o.indexName, o.index));
      await this.updateSchemaToDB(newLocalSchema);
    }
  }
  handleCLP(localSchema, newLocalSchema, cloudSchema) {
    if (!localSchema.classLevelPermissions && !cloudSchema) {
      _logger.logger.warn(`classLevelPermissions not provided for ${localSchema.className}.`);
    }
    // Use spread to avoid read only issue (encountered by Moumouls using directAccess)
    const clp = _objectSpread({}, localSchema.classLevelPermissions) || {};
    // To avoid inconsistency we need to remove all rights on addField
    clp.addField = {};
    newLocalSchema.setCLP(clp);
  }
  isProtectedFields(className, fieldName) {
    return !!_SchemaController.defaultColumns._Default[fieldName] || !!(_SchemaController.defaultColumns[className] && _SchemaController.defaultColumns[className][fieldName]);
  }
  isProtectedIndex(className, indexName) {
    const indexes = ['_id_'];
    switch (className) {
      case '_User':
        indexes.push('case_insensitive_username', 'case_insensitive_email', 'username_1', 'email_1');
        break;
      case '_Role':
        indexes.push('name_1');
        break;
      case '_Idempotency':
        indexes.push('reqId_1');
        break;
    }
    return indexes.indexOf(indexName) !== -1;
  }
  paramsAreEquals(objA, objB) {
    const keysA = Object.keys(objA);
    const keysB = Object.keys(objB);

    // Check key name
    if (keysA.length !== keysB.length) return false;
    return keysA.every(k => objA[k] === objB[k]);
  }
  handleFields(newLocalSchema, fieldName, field) {
    if (field.type === 'Relation') {
      newLocalSchema.addRelation(fieldName, field.targetClass);
    } else if (field.type === 'Pointer') {
      newLocalSchema.addPointer(fieldName, field.targetClass, field);
    } else {
      newLocalSchema.addField(fieldName, field.type, field);
    }
  }
}
exports.DefinedSchemas = DefinedSchemas;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQYXJzZSIsInJlcXVpcmUiLCJEZWZpbmVkU2NoZW1hcyIsImNvbnN0cnVjdG9yIiwic2NoZW1hT3B0aW9ucyIsImNvbmZpZyIsImxvY2FsU2NoZW1hcyIsIkNvbmZpZyIsImdldCIsImFwcElkIiwiZGVmaW5pdGlvbnMiLCJBcnJheSIsImlzQXJyYXkiLCJyZXRyaWVzIiwibWF4UmV0cmllcyIsInNhdmVTY2hlbWFUb0RCIiwic2NoZW1hIiwicGF5bG9hZCIsImNsYXNzTmFtZSIsImZpZWxkcyIsIl9maWVsZHMiLCJpbmRleGVzIiwiX2luZGV4ZXMiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJfY2xwIiwiaW50ZXJuYWxDcmVhdGVTY2hlbWEiLCJyZXNldFNjaGVtYU9wcyIsInVwZGF0ZVNjaGVtYVRvREIiLCJpbnRlcm5hbFVwZGF0ZVNjaGVtYSIsImV4ZWN1dGUiLCJsb2dnZXIiLCJpbmZvIiwiYmVmb3JlTWlncmF0aW9uIiwiUHJvbWlzZSIsInJlc29sdmUiLCJleGVjdXRlTWlncmF0aW9ucyIsImFmdGVyTWlncmF0aW9uIiwiZSIsImVycm9yIiwicHJvY2VzcyIsImVudiIsIk5PREVfRU5WIiwiZXhpdCIsInRpbWVvdXQiLCJzZXRUaW1lb3V0IiwiY3JlYXRlRGVsZXRlU2Vzc2lvbiIsInNjaGVtYUNvbnRyb2xsZXIiLCJkYXRhYmFzZSIsImxvYWRTY2hlbWEiLCJhbGxDbG91ZFNjaGVtYXMiLCJnZXRBbGxDbGFzc2VzIiwiY2xlYXJUaW1lb3V0IiwiYWxsIiwibWFwIiwibG9jYWxTY2hlbWEiLCJzYXZlT3JVcGRhdGUiLCJjaGVja0Zvck1pc3NpbmdTY2hlbWFzIiwiZW5mb3JjZUNMUEZvck5vblByb3ZpZGVkQ2xhc3MiLCJ3YWl0Iiwic3RyaWN0IiwiY2xvdWRTY2hlbWFzIiwicyIsIm1pc3NpbmdTY2hlbWFzIiwiZmlsdGVyIiwiYyIsImluY2x1ZGVzIiwic3lzdGVtQ2xhc3NlcyIsIlNldCIsInNpemUiLCJsZW5ndGgiLCJqb2luIiwid2FybiIsInRpbWUiLCJub25Qcm92aWRlZENsYXNzZXMiLCJjbG91ZFNjaGVtYSIsInNvbWUiLCJwYXJzZVNjaGVtYSIsIlNjaGVtYSIsImhhbmRsZUNMUCIsInJlc3BvbnNlIiwicmVzdCIsImNyZWF0ZSIsIkF1dGgiLCJtYXN0ZXIiLCJkZWwiLCJvYmplY3RJZCIsImZpbmQiLCJzYyIsInVwZGF0ZVNjaGVtYSIsInNhdmVTY2hlbWEiLCJuZXdMb2NhbFNjaGVtYSIsIk9iamVjdCIsImtleXMiLCJmaWVsZE5hbWUiLCJpc1Byb3RlY3RlZEZpZWxkcyIsImZvckVhY2giLCJmaWVsZCIsImhhbmRsZUZpZWxkcyIsImluZGV4TmFtZSIsImlzUHJvdGVjdGVkSW5kZXgiLCJhZGRJbmRleCIsImZpZWxkc1RvRGVsZXRlIiwiZmllbGRzVG9SZWNyZWF0ZSIsImZpZWxkc1dpdGhDaGFuZ2VkUGFyYW1zIiwicHVzaCIsImxvY2FsRmllbGQiLCJwYXJhbXNBcmVFcXVhbHMiLCJ0eXBlIiwidGFyZ2V0Q2xhc3MiLCJmcm9tIiwidG8iLCJkZWxldGVFeHRyYUZpZWxkcyIsImRlbGV0ZUZpZWxkIiwicmVjcmVhdGVNb2RpZmllZEZpZWxkcyIsImZpZWxkSW5mbyIsImluZGV4ZXNUb0FkZCIsImRlbGV0ZUluZGV4IiwiaW5kZXgiLCJkZWJ1ZyIsIm8iLCJjbHAiLCJhZGRGaWVsZCIsInNldENMUCIsImRlZmF1bHRDb2x1bW5zIiwiX0RlZmF1bHQiLCJpbmRleE9mIiwib2JqQSIsIm9iakIiLCJrZXlzQSIsImtleXNCIiwiZXZlcnkiLCJrIiwiYWRkUmVsYXRpb24iLCJhZGRQb2ludGVyIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL1NjaGVtYU1pZ3JhdGlvbnMvRGVmaW5lZFNjaGVtYXMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQGZsb3dcbi8vIEBmbG93LWRpc2FibGUtbmV4dCBDYW5ub3QgcmVzb2x2ZSBtb2R1bGUgYHBhcnNlL25vZGVgLlxuY29uc3QgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJyk7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuaW1wb3J0IHsgaW50ZXJuYWxDcmVhdGVTY2hlbWEsIGludGVybmFsVXBkYXRlU2NoZW1hIH0gZnJvbSAnLi4vUm91dGVycy9TY2hlbWFzUm91dGVyJztcbmltcG9ydCB7IGRlZmF1bHRDb2x1bW5zLCBzeXN0ZW1DbGFzc2VzIH0gZnJvbSAnLi4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcic7XG5pbXBvcnQgeyBQYXJzZVNlcnZlck9wdGlvbnMgfSBmcm9tICcuLi9PcHRpb25zJztcbmltcG9ydCAqIGFzIE1pZ3JhdGlvbnMgZnJvbSAnLi9NaWdyYXRpb25zJztcbmltcG9ydCBBdXRoIGZyb20gJy4uL0F1dGgnO1xuaW1wb3J0IHJlc3QgZnJvbSAnLi4vcmVzdCc7XG5cbmV4cG9ydCBjbGFzcyBEZWZpbmVkU2NoZW1hcyB7XG4gIGNvbmZpZzogUGFyc2VTZXJ2ZXJPcHRpb25zO1xuICBzY2hlbWFPcHRpb25zOiBNaWdyYXRpb25zLlNjaGVtYU9wdGlvbnM7XG4gIGxvY2FsU2NoZW1hczogTWlncmF0aW9ucy5KU09OU2NoZW1hW107XG4gIHJldHJpZXM6IG51bWJlcjtcbiAgbWF4UmV0cmllczogbnVtYmVyO1xuICBhbGxDbG91ZFNjaGVtYXM6IFBhcnNlLlNjaGVtYVtdO1xuXG4gIGNvbnN0cnVjdG9yKHNjaGVtYU9wdGlvbnM6IE1pZ3JhdGlvbnMuU2NoZW1hT3B0aW9ucywgY29uZmlnOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICB0aGlzLmxvY2FsU2NoZW1hcyA9IFtdO1xuICAgIHRoaXMuY29uZmlnID0gQ29uZmlnLmdldChjb25maWcuYXBwSWQpO1xuICAgIHRoaXMuc2NoZW1hT3B0aW9ucyA9IHNjaGVtYU9wdGlvbnM7XG4gICAgaWYgKHNjaGVtYU9wdGlvbnMgJiYgc2NoZW1hT3B0aW9ucy5kZWZpbml0aW9ucykge1xuICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHNjaGVtYU9wdGlvbnMuZGVmaW5pdGlvbnMpKSB7XG4gICAgICAgIHRocm93IGBcInNjaGVtYS5kZWZpbml0aW9uc1wiIG11c3QgYmUgYW4gYXJyYXkgb2Ygc2NoZW1hc2A7XG4gICAgICB9XG5cbiAgICAgIHRoaXMubG9jYWxTY2hlbWFzID0gc2NoZW1hT3B0aW9ucy5kZWZpbml0aW9ucztcbiAgICB9XG5cbiAgICB0aGlzLnJldHJpZXMgPSAwO1xuICAgIHRoaXMubWF4UmV0cmllcyA9IDM7XG4gIH1cblxuICBhc3luYyBzYXZlU2NoZW1hVG9EQihzY2hlbWE6IFBhcnNlLlNjaGVtYSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHBheWxvYWQgPSB7XG4gICAgICBjbGFzc05hbWU6IHNjaGVtYS5jbGFzc05hbWUsXG4gICAgICBmaWVsZHM6IHNjaGVtYS5fZmllbGRzLFxuICAgICAgaW5kZXhlczogc2NoZW1hLl9pbmRleGVzLFxuICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBzY2hlbWEuX2NscCxcbiAgICB9O1xuICAgIGF3YWl0IGludGVybmFsQ3JlYXRlU2NoZW1hKHNjaGVtYS5jbGFzc05hbWUsIHBheWxvYWQsIHRoaXMuY29uZmlnKTtcbiAgICB0aGlzLnJlc2V0U2NoZW1hT3BzKHNjaGVtYSk7XG4gIH1cblxuICByZXNldFNjaGVtYU9wcyhzY2hlbWE6IFBhcnNlLlNjaGVtYSkge1xuICAgIC8vIFJlc2V0IG9wcyBsaWtlIFNES1xuICAgIHNjaGVtYS5fZmllbGRzID0ge307XG4gICAgc2NoZW1hLl9pbmRleGVzID0ge307XG4gIH1cblxuICAvLyBTaW11bGF0ZSB1cGRhdGUgbGlrZSB0aGUgU0RLXG4gIC8vIFdlIGNhbm5vdCB1c2UgU0RLIHNpbmNlIHJvdXRlcyBhcmUgZGlzYWJsZWRcbiAgYXN5bmMgdXBkYXRlU2NoZW1hVG9EQihzY2hlbWE6IFBhcnNlLlNjaGVtYSkge1xuICAgIGNvbnN0IHBheWxvYWQgPSB7XG4gICAgICBjbGFzc05hbWU6IHNjaGVtYS5jbGFzc05hbWUsXG4gICAgICBmaWVsZHM6IHNjaGVtYS5fZmllbGRzLFxuICAgICAgaW5kZXhlczogc2NoZW1hLl9pbmRleGVzLFxuICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBzY2hlbWEuX2NscCxcbiAgICB9O1xuICAgIGF3YWl0IGludGVybmFsVXBkYXRlU2NoZW1hKHNjaGVtYS5jbGFzc05hbWUsIHBheWxvYWQsIHRoaXMuY29uZmlnKTtcbiAgICB0aGlzLnJlc2V0U2NoZW1hT3BzKHNjaGVtYSk7XG4gIH1cblxuICBhc3luYyBleGVjdXRlKCkge1xuICAgIHRyeSB7XG4gICAgICBsb2dnZXIuaW5mbygnUnVubmluZyBNaWdyYXRpb25zJyk7XG4gICAgICBpZiAodGhpcy5zY2hlbWFPcHRpb25zICYmIHRoaXMuc2NoZW1hT3B0aW9ucy5iZWZvcmVNaWdyYXRpb24pIHtcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHRoaXMuc2NoZW1hT3B0aW9ucy5iZWZvcmVNaWdyYXRpb24oKSk7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMuZXhlY3V0ZU1pZ3JhdGlvbnMoKTtcblxuICAgICAgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucyAmJiB0aGlzLnNjaGVtYU9wdGlvbnMuYWZ0ZXJNaWdyYXRpb24pIHtcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHRoaXMuc2NoZW1hT3B0aW9ucy5hZnRlck1pZ3JhdGlvbigpKTtcbiAgICAgIH1cblxuICAgICAgbG9nZ2VyLmluZm8oJ1J1bm5pbmcgTWlncmF0aW9ucyBDb21wbGV0ZWQnKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoYEZhaWxlZCB0byBydW4gbWlncmF0aW9uczogJHtlfWApO1xuICAgICAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAncHJvZHVjdGlvbicpIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBleGVjdXRlTWlncmF0aW9ucygpIHtcbiAgICBsZXQgdGltZW91dCA9IG51bGw7XG4gICAgdHJ5IHtcbiAgICAgIC8vIFNldCB1cCBhIHRpbWUgb3V0IGluIHByb2R1Y3Rpb25cbiAgICAgIC8vIGlmIHdlIGZhaWwgdG8gZ2V0IHNjaGVtYVxuICAgICAgLy8gcG0yIG9yIEs4cyBhbmQgbWFueSBvdGhlciBwcm9jZXNzIG1hbmFnZXJzIHdpbGwgdHJ5IHRvIHJlc3RhcnQgdGhlIHByb2Nlc3NcbiAgICAgIC8vIGFmdGVyIHRoZSBleGl0XG4gICAgICBpZiAocHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09ICdwcm9kdWN0aW9uJykge1xuICAgICAgICB0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKCdUaW1lb3V0IG9jY3VycmVkIGR1cmluZyBleGVjdXRpb24gb2YgbWlncmF0aW9ucy4gRXhpdGluZy4uLicpO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgfSwgMjAwMDApO1xuICAgICAgfVxuXG4gICAgICBhd2FpdCB0aGlzLmNyZWF0ZURlbGV0ZVNlc3Npb24oKTtcbiAgICAgIC8vIEBmbG93LWRpc2FibGUtbmV4dC1saW5lXG4gICAgICBjb25zdCBzY2hlbWFDb250cm9sbGVyID0gYXdhaXQgdGhpcy5jb25maWcuZGF0YWJhc2UubG9hZFNjaGVtYSgpO1xuICAgICAgdGhpcy5hbGxDbG91ZFNjaGVtYXMgPSBhd2FpdCBzY2hlbWFDb250cm9sbGVyLmdldEFsbENsYXNzZXMoKTtcbiAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgIGF3YWl0IFByb21pc2UuYWxsKHRoaXMubG9jYWxTY2hlbWFzLm1hcChhc3luYyBsb2NhbFNjaGVtYSA9PiB0aGlzLnNhdmVPclVwZGF0ZShsb2NhbFNjaGVtYSkpKTtcblxuICAgICAgdGhpcy5jaGVja0Zvck1pc3NpbmdTY2hlbWFzKCk7XG4gICAgICBhd2FpdCB0aGlzLmVuZm9yY2VDTFBGb3JOb25Qcm92aWRlZENsYXNzKCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKHRpbWVvdXQpIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgIGlmICh0aGlzLnJldHJpZXMgPCB0aGlzLm1heFJldHJpZXMpIHtcbiAgICAgICAgdGhpcy5yZXRyaWVzKys7XG4gICAgICAgIC8vIGZpcnN0IHJldHJ5IDFzZWMsIDJzZWMsIDNzZWMgdG90YWwgNnNlYyByZXRyeSBzZXF1ZW5jZVxuICAgICAgICAvLyByZXRyeSB3aWxsIG9ubHkgaGFwcGVuIGluIGNhc2Ugb2YgZGVwbG95aW5nIG11bHRpIHBhcnNlIHNlcnZlciBpbnN0YW5jZVxuICAgICAgICAvLyBhdCB0aGUgc2FtZSB0aW1lLiBNb2Rlcm4gc3lzdGVtcyBsaWtlIGs4IGF2b2lkIHRoaXMgYnkgZG9pbmcgcm9sbGluZyB1cGRhdGVzXG4gICAgICAgIGF3YWl0IHRoaXMud2FpdCgxMDAwICogdGhpcy5yZXRyaWVzKTtcbiAgICAgICAgYXdhaXQgdGhpcy5leGVjdXRlTWlncmF0aW9ucygpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGBGYWlsZWQgdG8gcnVuIG1pZ3JhdGlvbnM6ICR7ZX1gKTtcbiAgICAgICAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAncHJvZHVjdGlvbicpIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBjaGVja0Zvck1pc3NpbmdTY2hlbWFzKCkge1xuICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMuc3RyaWN0ICE9PSB0cnVlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgY2xvdWRTY2hlbWFzID0gdGhpcy5hbGxDbG91ZFNjaGVtYXMubWFwKHMgPT4gcy5jbGFzc05hbWUpO1xuICAgIGNvbnN0IGxvY2FsU2NoZW1hcyA9IHRoaXMubG9jYWxTY2hlbWFzLm1hcChzID0+IHMuY2xhc3NOYW1lKTtcbiAgICBjb25zdCBtaXNzaW5nU2NoZW1hcyA9IGNsb3VkU2NoZW1hcy5maWx0ZXIoXG4gICAgICBjID0+ICFsb2NhbFNjaGVtYXMuaW5jbHVkZXMoYykgJiYgIXN5c3RlbUNsYXNzZXMuaW5jbHVkZXMoYylcbiAgICApO1xuXG4gICAgaWYgKG5ldyBTZXQobG9jYWxTY2hlbWFzKS5zaXplICE9PSBsb2NhbFNjaGVtYXMubGVuZ3RoKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgIGBUaGUgbGlzdCBvZiBzY2hlbWFzIHByb3ZpZGVkIGNvbnRhaW5zIGR1cGxpY2F0ZWQgXCJjbGFzc05hbWVcIiAgXCIke2xvY2FsU2NoZW1hcy5qb2luKFxuICAgICAgICAgICdcIixcIidcbiAgICAgICAgKX1cImBcbiAgICAgICk7XG4gICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucy5zdHJpY3QgJiYgbWlzc2luZ1NjaGVtYXMubGVuZ3RoKSB7XG4gICAgICBsb2dnZXIud2FybihcbiAgICAgICAgYFRoZSBmb2xsb3dpbmcgc2NoZW1hcyBhcmUgY3VycmVudGx5IHByZXNlbnQgaW4gdGhlIGRhdGFiYXNlLCBidXQgbm90IGV4cGxpY2l0bHkgZGVmaW5lZCBpbiBhIHNjaGVtYTogXCIke21pc3NpbmdTY2hlbWFzLmpvaW4oXG4gICAgICAgICAgJ1wiLCBcIidcbiAgICAgICAgKX1cImBcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgLy8gUmVxdWlyZWQgZm9yIHRlc3RpbmcgcHVycG9zZVxuICB3YWl0KHRpbWU6IG51bWJlcikge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgdGltZSkpO1xuICB9XG5cbiAgYXN5bmMgZW5mb3JjZUNMUEZvck5vblByb3ZpZGVkQ2xhc3MoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgbm9uUHJvdmlkZWRDbGFzc2VzID0gdGhpcy5hbGxDbG91ZFNjaGVtYXMuZmlsdGVyKFxuICAgICAgY2xvdWRTY2hlbWEgPT5cbiAgICAgICAgIXRoaXMubG9jYWxTY2hlbWFzLnNvbWUobG9jYWxTY2hlbWEgPT4gbG9jYWxTY2hlbWEuY2xhc3NOYW1lID09PSBjbG91ZFNjaGVtYS5jbGFzc05hbWUpXG4gICAgKTtcbiAgICBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgIG5vblByb3ZpZGVkQ2xhc3Nlcy5tYXAoYXN5bmMgc2NoZW1hID0+IHtcbiAgICAgICAgY29uc3QgcGFyc2VTY2hlbWEgPSBuZXcgUGFyc2UuU2NoZW1hKHNjaGVtYS5jbGFzc05hbWUpO1xuICAgICAgICB0aGlzLmhhbmRsZUNMUChzY2hlbWEsIHBhcnNlU2NoZW1hKTtcbiAgICAgICAgYXdhaXQgdGhpcy51cGRhdGVTY2hlbWFUb0RCKHBhcnNlU2NoZW1hKTtcbiAgICAgIH0pXG4gICAgKTtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIGZha2Ugc2Vzc2lvbiBzaW5jZSBQYXJzZSBkbyBub3QgY3JlYXRlIHRoZSBfU2Vzc2lvbiB1bnRpbFxuICAvLyBhIHNlc3Npb24gaXMgY3JlYXRlZFxuICBhc3luYyBjcmVhdGVEZWxldGVTZXNzaW9uKCkge1xuICAgIGNvbnN0IHsgcmVzcG9uc2UgfSA9IGF3YWl0IHJlc3QuY3JlYXRlKHRoaXMuY29uZmlnLCBBdXRoLm1hc3Rlcih0aGlzLmNvbmZpZyksICdfU2Vzc2lvbicsIHt9KTtcbiAgICBhd2FpdCByZXN0LmRlbCh0aGlzLmNvbmZpZywgQXV0aC5tYXN0ZXIodGhpcy5jb25maWcpLCAnX1Nlc3Npb24nLCByZXNwb25zZS5vYmplY3RJZCk7XG4gIH1cblxuICBhc3luYyBzYXZlT3JVcGRhdGUobG9jYWxTY2hlbWE6IE1pZ3JhdGlvbnMuSlNPTlNjaGVtYSkge1xuICAgIGNvbnN0IGNsb3VkU2NoZW1hID0gdGhpcy5hbGxDbG91ZFNjaGVtYXMuZmluZChzYyA9PiBzYy5jbGFzc05hbWUgPT09IGxvY2FsU2NoZW1hLmNsYXNzTmFtZSk7XG4gICAgaWYgKGNsb3VkU2NoZW1hKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYShsb2NhbFNjaGVtYSwgY2xvdWRTY2hlbWEpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICB0aHJvdyBgRXJyb3IgZHVyaW5nIHVwZGF0ZSBvZiBzY2hlbWEgZm9yIHR5cGUgJHtjbG91ZFNjaGVtYS5jbGFzc05hbWV9OiAke2V9YDtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy5zYXZlU2NoZW1hKGxvY2FsU2NoZW1hKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgdGhyb3cgYEVycm9yIHdoaWxlIHNhdmluZyBTY2hlbWEgZm9yIHR5cGUgJHtsb2NhbFNjaGVtYS5jbGFzc05hbWV9OiAke2V9YDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBhc3luYyBzYXZlU2NoZW1hKGxvY2FsU2NoZW1hOiBNaWdyYXRpb25zLkpTT05TY2hlbWEpIHtcbiAgICBjb25zdCBuZXdMb2NhbFNjaGVtYSA9IG5ldyBQYXJzZS5TY2hlbWEobG9jYWxTY2hlbWEuY2xhc3NOYW1lKTtcbiAgICBpZiAobG9jYWxTY2hlbWEuZmllbGRzKSB7XG4gICAgICAvLyBIYW5kbGUgZmllbGRzXG4gICAgICBPYmplY3Qua2V5cyhsb2NhbFNjaGVtYS5maWVsZHMpXG4gICAgICAgIC5maWx0ZXIoZmllbGROYW1lID0+ICF0aGlzLmlzUHJvdGVjdGVkRmllbGRzKGxvY2FsU2NoZW1hLmNsYXNzTmFtZSwgZmllbGROYW1lKSlcbiAgICAgICAgLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICBpZiAobG9jYWxTY2hlbWEuZmllbGRzKSB7XG4gICAgICAgICAgICBjb25zdCBmaWVsZCA9IGxvY2FsU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgICAgdGhpcy5oYW5kbGVGaWVsZHMobmV3TG9jYWxTY2hlbWEsIGZpZWxkTmFtZSwgZmllbGQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuICAgIC8vIEhhbmRsZSBpbmRleGVzXG4gICAgaWYgKGxvY2FsU2NoZW1hLmluZGV4ZXMpIHtcbiAgICAgIE9iamVjdC5rZXlzKGxvY2FsU2NoZW1hLmluZGV4ZXMpLmZvckVhY2goaW5kZXhOYW1lID0+IHtcbiAgICAgICAgaWYgKGxvY2FsU2NoZW1hLmluZGV4ZXMgJiYgIXRoaXMuaXNQcm90ZWN0ZWRJbmRleChsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGluZGV4TmFtZSkpIHtcbiAgICAgICAgICBuZXdMb2NhbFNjaGVtYS5hZGRJbmRleChpbmRleE5hbWUsIGxvY2FsU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHRoaXMuaGFuZGxlQ0xQKGxvY2FsU2NoZW1hLCBuZXdMb2NhbFNjaGVtYSk7XG5cbiAgICByZXR1cm4gYXdhaXQgdGhpcy5zYXZlU2NoZW1hVG9EQihuZXdMb2NhbFNjaGVtYSk7XG4gIH1cblxuICBhc3luYyB1cGRhdGVTY2hlbWEobG9jYWxTY2hlbWE6IE1pZ3JhdGlvbnMuSlNPTlNjaGVtYSwgY2xvdWRTY2hlbWE6IFBhcnNlLlNjaGVtYSkge1xuICAgIGNvbnN0IG5ld0xvY2FsU2NoZW1hID0gbmV3IFBhcnNlLlNjaGVtYShsb2NhbFNjaGVtYS5jbGFzc05hbWUpO1xuXG4gICAgLy8gSGFuZGxlIGZpZWxkc1xuICAgIC8vIENoZWNrIGFkZGl0aW9uXG4gICAgaWYgKGxvY2FsU2NoZW1hLmZpZWxkcykge1xuICAgICAgT2JqZWN0LmtleXMobG9jYWxTY2hlbWEuZmllbGRzKVxuICAgICAgICAuZmlsdGVyKGZpZWxkTmFtZSA9PiAhdGhpcy5pc1Byb3RlY3RlZEZpZWxkcyhsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGZpZWxkTmFtZSkpXG4gICAgICAgIC5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG4gICAgICAgICAgY29uc3QgZmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICBpZiAoIWNsb3VkU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB0aGlzLmhhbmRsZUZpZWxkcyhuZXdMb2NhbFNjaGVtYSwgZmllbGROYW1lLCBmaWVsZCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBmaWVsZHNUb0RlbGV0ZTogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBmaWVsZHNUb1JlY3JlYXRlOiB7XG4gICAgICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgICAgIGZyb206IHsgdHlwZTogc3RyaW5nLCB0YXJnZXRDbGFzcz86IHN0cmluZyB9LFxuICAgICAgdG86IHsgdHlwZTogc3RyaW5nLCB0YXJnZXRDbGFzcz86IHN0cmluZyB9LFxuICAgIH1bXSA9IFtdO1xuICAgIGNvbnN0IGZpZWxkc1dpdGhDaGFuZ2VkUGFyYW1zOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgLy8gQ2hlY2sgZGVsZXRpb25cbiAgICBPYmplY3Qua2V5cyhjbG91ZFNjaGVtYS5maWVsZHMpXG4gICAgICAuZmlsdGVyKGZpZWxkTmFtZSA9PiAhdGhpcy5pc1Byb3RlY3RlZEZpZWxkcyhsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGZpZWxkTmFtZSkpXG4gICAgICAuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICBjb25zdCBmaWVsZCA9IGNsb3VkU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICBpZiAoIWxvY2FsU2NoZW1hLmZpZWxkcyB8fCAhbG9jYWxTY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICBmaWVsZHNUb0RlbGV0ZS5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbG9jYWxGaWVsZCA9IGxvY2FsU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAvLyBDaGVjayBpZiBmaWVsZCBoYXMgYSBjaGFuZ2VkIHR5cGVcbiAgICAgICAgaWYgKFxuICAgICAgICAgICF0aGlzLnBhcmFtc0FyZUVxdWFscyhcbiAgICAgICAgICAgIHsgdHlwZTogZmllbGQudHlwZSwgdGFyZ2V0Q2xhc3M6IGZpZWxkLnRhcmdldENsYXNzIH0sXG4gICAgICAgICAgICB7IHR5cGU6IGxvY2FsRmllbGQudHlwZSwgdGFyZ2V0Q2xhc3M6IGxvY2FsRmllbGQudGFyZ2V0Q2xhc3MgfVxuICAgICAgICAgIClcbiAgICAgICAgKSB7XG4gICAgICAgICAgZmllbGRzVG9SZWNyZWF0ZS5wdXNoKHtcbiAgICAgICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgICAgIGZyb206IHsgdHlwZTogZmllbGQudHlwZSwgdGFyZ2V0Q2xhc3M6IGZpZWxkLnRhcmdldENsYXNzIH0sXG4gICAgICAgICAgICB0bzogeyB0eXBlOiBsb2NhbEZpZWxkLnR5cGUsIHRhcmdldENsYXNzOiBsb2NhbEZpZWxkLnRhcmdldENsYXNzIH0sXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgc29tZXRoaW5nIGNoYW5nZWQgb3RoZXIgdGhhbiB0aGUgdHlwZSAobGlrZSByZXF1aXJlZCwgZGVmYXVsdFZhbHVlKVxuICAgICAgICBpZiAoIXRoaXMucGFyYW1zQXJlRXF1YWxzKGZpZWxkLCBsb2NhbEZpZWxkKSkge1xuICAgICAgICAgIGZpZWxkc1dpdGhDaGFuZ2VkUGFyYW1zLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICBpZiAodGhpcy5zY2hlbWFPcHRpb25zLmRlbGV0ZUV4dHJhRmllbGRzID09PSB0cnVlKSB7XG4gICAgICBmaWVsZHNUb0RlbGV0ZS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgIG5ld0xvY2FsU2NoZW1hLmRlbGV0ZUZpZWxkKGZpZWxkTmFtZSk7XG4gICAgICB9KTtcblxuICAgICAgLy8gRGVsZXRlIGZpZWxkcyBmcm9tIHRoZSBzY2hlbWEgdGhlbiBhcHBseSBjaGFuZ2VzXG4gICAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYVRvREIobmV3TG9jYWxTY2hlbWEpO1xuICAgIH0gZWxzZSBpZiAodGhpcy5zY2hlbWFPcHRpb25zLnN0cmljdCA9PT0gdHJ1ZSAmJiBmaWVsZHNUb0RlbGV0ZS5sZW5ndGgpIHtcbiAgICAgIGxvZ2dlci53YXJuKFxuICAgICAgICBgVGhlIGZvbGxvd2luZyBmaWVsZHMgZXhpc3QgaW4gdGhlIGRhdGFiYXNlIGZvciBcIiR7XG4gICAgICAgICAgbG9jYWxTY2hlbWEuY2xhc3NOYW1lXG4gICAgICAgIH1cIiwgYnV0IGFyZSBtaXNzaW5nIGluIHRoZSBzY2hlbWEgOiBcIiR7ZmllbGRzVG9EZWxldGUuam9pbignXCIgLFwiJyl9XCJgXG4gICAgICApO1xuICAgIH1cblxuICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMucmVjcmVhdGVNb2RpZmllZEZpZWxkcyA9PT0gdHJ1ZSkge1xuICAgICAgZmllbGRzVG9SZWNyZWF0ZS5mb3JFYWNoKGZpZWxkID0+IHtcbiAgICAgICAgbmV3TG9jYWxTY2hlbWEuZGVsZXRlRmllbGQoZmllbGQuZmllbGROYW1lKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBEZWxldGUgZmllbGRzIGZyb20gdGhlIHNjaGVtYSB0aGVuIGFwcGx5IGNoYW5nZXNcbiAgICAgIGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hVG9EQihuZXdMb2NhbFNjaGVtYSk7XG5cbiAgICAgIGZpZWxkc1RvUmVjcmVhdGUuZm9yRWFjaChmaWVsZEluZm8gPT4ge1xuICAgICAgICBpZiAobG9jYWxTY2hlbWEuZmllbGRzKSB7XG4gICAgICAgICAgY29uc3QgZmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGRJbmZvLmZpZWxkTmFtZV07XG4gICAgICAgICAgdGhpcy5oYW5kbGVGaWVsZHMobmV3TG9jYWxTY2hlbWEsIGZpZWxkSW5mby5maWVsZE5hbWUsIGZpZWxkKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSBlbHNlIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMuc3RyaWN0ID09PSB0cnVlICYmIGZpZWxkc1RvUmVjcmVhdGUubGVuZ3RoKSB7XG4gICAgICBmaWVsZHNUb1JlY3JlYXRlLmZvckVhY2goZmllbGQgPT4ge1xuICAgICAgICBjb25zdCBmcm9tID1cbiAgICAgICAgICBmaWVsZC5mcm9tLnR5cGUgKyAoZmllbGQuZnJvbS50YXJnZXRDbGFzcyA/IGAgKCR7ZmllbGQuZnJvbS50YXJnZXRDbGFzc30pYCA6ICcnKTtcbiAgICAgICAgY29uc3QgdG8gPSBmaWVsZC50by50eXBlICsgKGZpZWxkLnRvLnRhcmdldENsYXNzID8gYCAoJHtmaWVsZC50by50YXJnZXRDbGFzc30pYCA6ICcnKTtcblxuICAgICAgICBsb2dnZXIud2FybihcbiAgICAgICAgICBgVGhlIGZpZWxkIFwiJHtmaWVsZC5maWVsZE5hbWV9XCIgdHlwZSBkaWZmZXIgYmV0d2VlbiB0aGUgc2NoZW1hIGFuZCB0aGUgZGF0YWJhc2UgZm9yIFwiJHtsb2NhbFNjaGVtYS5jbGFzc05hbWV9XCI7IFNjaGVtYSBpcyBkZWZpbmVkIGFzIFwiJHt0b31cIiBhbmQgY3VycmVudCBkYXRhYmFzZSB0eXBlIGlzIFwiJHtmcm9tfVwiYFxuICAgICAgICApO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgZmllbGRzV2l0aENoYW5nZWRQYXJhbXMuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKGxvY2FsU2NoZW1hLmZpZWxkcykge1xuICAgICAgICBjb25zdCBmaWVsZCA9IGxvY2FsU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICB0aGlzLmhhbmRsZUZpZWxkcyhuZXdMb2NhbFNjaGVtYSwgZmllbGROYW1lLCBmaWVsZCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBIYW5kbGUgSW5kZXhlc1xuICAgIC8vIENoZWNrIGFkZGl0aW9uXG4gICAgaWYgKGxvY2FsU2NoZW1hLmluZGV4ZXMpIHtcbiAgICAgIE9iamVjdC5rZXlzKGxvY2FsU2NoZW1hLmluZGV4ZXMpLmZvckVhY2goaW5kZXhOYW1lID0+IHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgICghY2xvdWRTY2hlbWEuaW5kZXhlcyB8fCAhY2xvdWRTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdKSAmJlxuICAgICAgICAgICF0aGlzLmlzUHJvdGVjdGVkSW5kZXgobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBpbmRleE5hbWUpXG4gICAgICAgICkge1xuICAgICAgICAgIGlmIChsb2NhbFNjaGVtYS5pbmRleGVzKSB7XG4gICAgICAgICAgICBuZXdMb2NhbFNjaGVtYS5hZGRJbmRleChpbmRleE5hbWUsIGxvY2FsU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBpbmRleGVzVG9BZGQgPSBbXTtcblxuICAgIC8vIENoZWNrIGRlbGV0aW9uXG4gICAgaWYgKGNsb3VkU2NoZW1hLmluZGV4ZXMpIHtcbiAgICAgIE9iamVjdC5rZXlzKGNsb3VkU2NoZW1hLmluZGV4ZXMpLmZvckVhY2goaW5kZXhOYW1lID0+IHtcbiAgICAgICAgaWYgKCF0aGlzLmlzUHJvdGVjdGVkSW5kZXgobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBpbmRleE5hbWUpKSB7XG4gICAgICAgICAgaWYgKCFsb2NhbFNjaGVtYS5pbmRleGVzIHx8ICFsb2NhbFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0pIHtcbiAgICAgICAgICAgIG5ld0xvY2FsU2NoZW1hLmRlbGV0ZUluZGV4KGluZGV4TmFtZSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICAgICF0aGlzLnBhcmFtc0FyZUVxdWFscyhsb2NhbFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0sIGNsb3VkU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSlcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIG5ld0xvY2FsU2NoZW1hLmRlbGV0ZUluZGV4KGluZGV4TmFtZSk7XG4gICAgICAgICAgICBpZiAobG9jYWxTY2hlbWEuaW5kZXhlcykge1xuICAgICAgICAgICAgICBpbmRleGVzVG9BZGQucHVzaCh7XG4gICAgICAgICAgICAgICAgaW5kZXhOYW1lLFxuICAgICAgICAgICAgICAgIGluZGV4OiBsb2NhbFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0sXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgdGhpcy5oYW5kbGVDTFAobG9jYWxTY2hlbWEsIG5ld0xvY2FsU2NoZW1hLCBjbG91ZFNjaGVtYSk7XG4gICAgLy8gQXBwbHkgY2hhbmdlc1xuICAgIGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hVG9EQihuZXdMb2NhbFNjaGVtYSk7XG4gICAgLy8gQXBwbHkgbmV3L2NoYW5nZWQgaW5kZXhlc1xuICAgIGlmIChpbmRleGVzVG9BZGQubGVuZ3RoKSB7XG4gICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgIGBVcGRhdGluZyBpbmRleGVzIGZvciBcIiR7bmV3TG9jYWxTY2hlbWEuY2xhc3NOYW1lfVwiIDogICR7aW5kZXhlc1RvQWRkLmpvaW4oJyAsJyl9YFxuICAgICAgKTtcbiAgICAgIGluZGV4ZXNUb0FkZC5mb3JFYWNoKG8gPT4gbmV3TG9jYWxTY2hlbWEuYWRkSW5kZXgoby5pbmRleE5hbWUsIG8uaW5kZXgpKTtcbiAgICAgIGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hVG9EQihuZXdMb2NhbFNjaGVtYSk7XG4gICAgfVxuICB9XG5cbiAgaGFuZGxlQ0xQKFxuICAgIGxvY2FsU2NoZW1hOiBNaWdyYXRpb25zLkpTT05TY2hlbWEsXG4gICAgbmV3TG9jYWxTY2hlbWE6IFBhcnNlLlNjaGVtYSxcbiAgICBjbG91ZFNjaGVtYTogUGFyc2UuU2NoZW1hXG4gICkge1xuICAgIGlmICghbG9jYWxTY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zICYmICFjbG91ZFNjaGVtYSkge1xuICAgICAgbG9nZ2VyLndhcm4oYGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyBub3QgcHJvdmlkZWQgZm9yICR7bG9jYWxTY2hlbWEuY2xhc3NOYW1lfS5gKTtcbiAgICB9XG4gICAgLy8gVXNlIHNwcmVhZCB0byBhdm9pZCByZWFkIG9ubHkgaXNzdWUgKGVuY291bnRlcmVkIGJ5IE1vdW1vdWxzIHVzaW5nIGRpcmVjdEFjY2VzcylcbiAgICBjb25zdCBjbHAgPSAoeyAuLi5sb2NhbFNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMgfSB8fCB7fTogUGFyc2UuQ0xQLlBlcm1pc3Npb25zTWFwKTtcbiAgICAvLyBUbyBhdm9pZCBpbmNvbnNpc3RlbmN5IHdlIG5lZWQgdG8gcmVtb3ZlIGFsbCByaWdodHMgb24gYWRkRmllbGRcbiAgICBjbHAuYWRkRmllbGQgPSB7fTtcbiAgICBuZXdMb2NhbFNjaGVtYS5zZXRDTFAoY2xwKTtcbiAgfVxuXG4gIGlzUHJvdGVjdGVkRmllbGRzKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiAoXG4gICAgICAhIWRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0W2ZpZWxkTmFtZV0gfHxcbiAgICAgICEhKGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV0gJiYgZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXVtmaWVsZE5hbWVdKVxuICAgICk7XG4gIH1cblxuICBpc1Byb3RlY3RlZEluZGV4KGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleE5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IGluZGV4ZXMgPSBbJ19pZF8nXTtcbiAgICBzd2l0Y2ggKGNsYXNzTmFtZSkge1xuICAgICAgY2FzZSAnX1VzZXInOlxuICAgICAgICBpbmRleGVzLnB1c2goXG4gICAgICAgICAgJ2Nhc2VfaW5zZW5zaXRpdmVfdXNlcm5hbWUnLFxuICAgICAgICAgICdjYXNlX2luc2Vuc2l0aXZlX2VtYWlsJyxcbiAgICAgICAgICAndXNlcm5hbWVfMScsXG4gICAgICAgICAgJ2VtYWlsXzEnXG4gICAgICAgICk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnX1JvbGUnOlxuICAgICAgICBpbmRleGVzLnB1c2goJ25hbWVfMScpO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnX0lkZW1wb3RlbmN5JzpcbiAgICAgICAgaW5kZXhlcy5wdXNoKCdyZXFJZF8xJyk7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIHJldHVybiBpbmRleGVzLmluZGV4T2YoaW5kZXhOYW1lKSAhPT0gLTE7XG4gIH1cblxuICBwYXJhbXNBcmVFcXVhbHM8VDogeyBba2V5OiBzdHJpbmddOiBhbnkgfT4ob2JqQTogVCwgb2JqQjogVCkge1xuICAgIGNvbnN0IGtleXNBOiBzdHJpbmdbXSA9IE9iamVjdC5rZXlzKG9iakEpO1xuICAgIGNvbnN0IGtleXNCOiBzdHJpbmdbXSA9IE9iamVjdC5rZXlzKG9iakIpO1xuXG4gICAgLy8gQ2hlY2sga2V5IG5hbWVcbiAgICBpZiAoa2V5c0EubGVuZ3RoICE9PSBrZXlzQi5sZW5ndGgpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4ga2V5c0EuZXZlcnkoayA9PiBvYmpBW2tdID09PSBvYmpCW2tdKTtcbiAgfVxuXG4gIGhhbmRsZUZpZWxkcyhuZXdMb2NhbFNjaGVtYTogUGFyc2UuU2NoZW1hLCBmaWVsZE5hbWU6IHN0cmluZywgZmllbGQ6IE1pZ3JhdGlvbnMuRmllbGRUeXBlKSB7XG4gICAgaWYgKGZpZWxkLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgIG5ld0xvY2FsU2NoZW1hLmFkZFJlbGF0aW9uKGZpZWxkTmFtZSwgZmllbGQudGFyZ2V0Q2xhc3MpO1xuICAgIH0gZWxzZSBpZiAoZmllbGQudHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICBuZXdMb2NhbFNjaGVtYS5hZGRQb2ludGVyKGZpZWxkTmFtZSwgZmllbGQudGFyZ2V0Q2xhc3MsIGZpZWxkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV3TG9jYWxTY2hlbWEuYWRkRmllbGQoZmllbGROYW1lLCBmaWVsZC50eXBlLCBmaWVsZCk7XG4gICAgfVxuICB9XG59XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUdBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFBMkI7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQVQzQjtBQUNBLE1BQU1BLEtBQUssR0FBR0MsT0FBTyxDQUFDLFlBQVksQ0FBQztBQVU1QixNQUFNQyxjQUFjLENBQUM7RUFRMUJDLFdBQVcsQ0FBQ0MsYUFBdUMsRUFBRUMsTUFBMEIsRUFBRTtJQUMvRSxJQUFJLENBQUNDLFlBQVksR0FBRyxFQUFFO0lBQ3RCLElBQUksQ0FBQ0QsTUFBTSxHQUFHRSxlQUFNLENBQUNDLEdBQUcsQ0FBQ0gsTUFBTSxDQUFDSSxLQUFLLENBQUM7SUFDdEMsSUFBSSxDQUFDTCxhQUFhLEdBQUdBLGFBQWE7SUFDbEMsSUFBSUEsYUFBYSxJQUFJQSxhQUFhLENBQUNNLFdBQVcsRUFBRTtNQUM5QyxJQUFJLENBQUNDLEtBQUssQ0FBQ0MsT0FBTyxDQUFDUixhQUFhLENBQUNNLFdBQVcsQ0FBQyxFQUFFO1FBQzdDLE1BQU8sa0RBQWlEO01BQzFEO01BRUEsSUFBSSxDQUFDSixZQUFZLEdBQUdGLGFBQWEsQ0FBQ00sV0FBVztJQUMvQztJQUVBLElBQUksQ0FBQ0csT0FBTyxHQUFHLENBQUM7SUFDaEIsSUFBSSxDQUFDQyxVQUFVLEdBQUcsQ0FBQztFQUNyQjtFQUVBLE1BQU1DLGNBQWMsQ0FBQ0MsTUFBb0IsRUFBaUI7SUFDeEQsTUFBTUMsT0FBTyxHQUFHO01BQ2RDLFNBQVMsRUFBRUYsTUFBTSxDQUFDRSxTQUFTO01BQzNCQyxNQUFNLEVBQUVILE1BQU0sQ0FBQ0ksT0FBTztNQUN0QkMsT0FBTyxFQUFFTCxNQUFNLENBQUNNLFFBQVE7TUFDeEJDLHFCQUFxQixFQUFFUCxNQUFNLENBQUNRO0lBQ2hDLENBQUM7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