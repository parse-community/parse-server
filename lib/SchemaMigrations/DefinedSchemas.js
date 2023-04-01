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

      // Hack to force session schema to be created
      await this.createDeleteSession();
      this.allCloudSchemas = await Parse.Schema.all();
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
    const session = new Parse.Session();
    await session.save(null, {
      useMasterKey: true
    });
    await session.destroy({
      useMasterKey: true
    });
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbG9nZ2VyIiwicmVxdWlyZSIsIl9Db25maWciLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX1NjaGVtYXNSb3V0ZXIiLCJfU2NoZW1hQ29udHJvbGxlciIsIl9PcHRpb25zIiwiTWlncmF0aW9ucyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX2dldFJlcXVpcmVXaWxkY2FyZENhY2hlIiwibm9kZUludGVyb3AiLCJXZWFrTWFwIiwiY2FjaGVCYWJlbEludGVyb3AiLCJjYWNoZU5vZGVJbnRlcm9wIiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJjYWNoZSIsImhhcyIsImdldCIsIm5ld09iaiIsImhhc1Byb3BlcnR5RGVzY3JpcHRvciIsIk9iamVjdCIsImRlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9yIiwia2V5IiwicHJvdG90eXBlIiwiaGFzT3duUHJvcGVydHkiLCJjYWxsIiwiZGVzYyIsInNldCIsIm93bktleXMiLCJvYmplY3QiLCJlbnVtZXJhYmxlT25seSIsImtleXMiLCJnZXRPd25Qcm9wZXJ0eVN5bWJvbHMiLCJzeW1ib2xzIiwiZmlsdGVyIiwic3ltIiwiZW51bWVyYWJsZSIsInB1c2giLCJhcHBseSIsIl9vYmplY3RTcHJlYWQiLCJ0YXJnZXQiLCJpIiwiYXJndW1lbnRzIiwibGVuZ3RoIiwic291cmNlIiwiZm9yRWFjaCIsIl9kZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvcnMiLCJkZWZpbmVQcm9wZXJ0aWVzIiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiYXJnIiwiX3RvUHJpbWl0aXZlIiwiU3RyaW5nIiwiaW5wdXQiLCJoaW50IiwicHJpbSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwidW5kZWZpbmVkIiwicmVzIiwiVHlwZUVycm9yIiwiTnVtYmVyIiwiUGFyc2UiLCJEZWZpbmVkU2NoZW1hcyIsImNvbnN0cnVjdG9yIiwic2NoZW1hT3B0aW9ucyIsImNvbmZpZyIsImxvY2FsU2NoZW1hcyIsIkNvbmZpZyIsImFwcElkIiwiZGVmaW5pdGlvbnMiLCJBcnJheSIsImlzQXJyYXkiLCJyZXRyaWVzIiwibWF4UmV0cmllcyIsInNhdmVTY2hlbWFUb0RCIiwic2NoZW1hIiwicGF5bG9hZCIsImNsYXNzTmFtZSIsImZpZWxkcyIsIl9maWVsZHMiLCJpbmRleGVzIiwiX2luZGV4ZXMiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJfY2xwIiwiaW50ZXJuYWxDcmVhdGVTY2hlbWEiLCJyZXNldFNjaGVtYU9wcyIsInVwZGF0ZVNjaGVtYVRvREIiLCJpbnRlcm5hbFVwZGF0ZVNjaGVtYSIsImV4ZWN1dGUiLCJsb2dnZXIiLCJpbmZvIiwiYmVmb3JlTWlncmF0aW9uIiwiUHJvbWlzZSIsInJlc29sdmUiLCJleGVjdXRlTWlncmF0aW9ucyIsImFmdGVyTWlncmF0aW9uIiwiZSIsImVycm9yIiwicHJvY2VzcyIsImVudiIsIk5PREVfRU5WIiwiZXhpdCIsInRpbWVvdXQiLCJzZXRUaW1lb3V0IiwiY3JlYXRlRGVsZXRlU2Vzc2lvbiIsImFsbENsb3VkU2NoZW1hcyIsIlNjaGVtYSIsImFsbCIsImNsZWFyVGltZW91dCIsIm1hcCIsImxvY2FsU2NoZW1hIiwic2F2ZU9yVXBkYXRlIiwiY2hlY2tGb3JNaXNzaW5nU2NoZW1hcyIsImVuZm9yY2VDTFBGb3JOb25Qcm92aWRlZENsYXNzIiwid2FpdCIsInN0cmljdCIsImNsb3VkU2NoZW1hcyIsInMiLCJtaXNzaW5nU2NoZW1hcyIsImMiLCJpbmNsdWRlcyIsInN5c3RlbUNsYXNzZXMiLCJTZXQiLCJzaXplIiwiam9pbiIsIndhcm4iLCJ0aW1lIiwibm9uUHJvdmlkZWRDbGFzc2VzIiwiY2xvdWRTY2hlbWEiLCJzb21lIiwicGFyc2VTY2hlbWEiLCJoYW5kbGVDTFAiLCJzZXNzaW9uIiwiU2Vzc2lvbiIsInNhdmUiLCJ1c2VNYXN0ZXJLZXkiLCJkZXN0cm95IiwiZmluZCIsInNjIiwidXBkYXRlU2NoZW1hIiwic2F2ZVNjaGVtYSIsIm5ld0xvY2FsU2NoZW1hIiwiZmllbGROYW1lIiwiaXNQcm90ZWN0ZWRGaWVsZHMiLCJmaWVsZCIsImhhbmRsZUZpZWxkcyIsImluZGV4TmFtZSIsImlzUHJvdGVjdGVkSW5kZXgiLCJhZGRJbmRleCIsImZpZWxkc1RvRGVsZXRlIiwiZmllbGRzVG9SZWNyZWF0ZSIsImZpZWxkc1dpdGhDaGFuZ2VkUGFyYW1zIiwibG9jYWxGaWVsZCIsInBhcmFtc0FyZUVxdWFscyIsInR5cGUiLCJ0YXJnZXRDbGFzcyIsImZyb20iLCJ0byIsImRlbGV0ZUV4dHJhRmllbGRzIiwiZGVsZXRlRmllbGQiLCJyZWNyZWF0ZU1vZGlmaWVkRmllbGRzIiwiZmllbGRJbmZvIiwiaW5kZXhlc1RvQWRkIiwiZGVsZXRlSW5kZXgiLCJpbmRleCIsImRlYnVnIiwibyIsImNscCIsImFkZEZpZWxkIiwic2V0Q0xQIiwiZGVmYXVsdENvbHVtbnMiLCJfRGVmYXVsdCIsImluZGV4T2YiLCJvYmpBIiwib2JqQiIsImtleXNBIiwia2V5c0IiLCJldmVyeSIsImsiLCJhZGRSZWxhdGlvbiIsImFkZFBvaW50ZXIiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL1NjaGVtYU1pZ3JhdGlvbnMvRGVmaW5lZFNjaGVtYXMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQGZsb3dcbi8vIEBmbG93LWRpc2FibGUtbmV4dCBDYW5ub3QgcmVzb2x2ZSBtb2R1bGUgYHBhcnNlL25vZGVgLlxuY29uc3QgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJyk7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuaW1wb3J0IHsgaW50ZXJuYWxDcmVhdGVTY2hlbWEsIGludGVybmFsVXBkYXRlU2NoZW1hIH0gZnJvbSAnLi4vUm91dGVycy9TY2hlbWFzUm91dGVyJztcbmltcG9ydCB7IGRlZmF1bHRDb2x1bW5zLCBzeXN0ZW1DbGFzc2VzIH0gZnJvbSAnLi4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcic7XG5pbXBvcnQgeyBQYXJzZVNlcnZlck9wdGlvbnMgfSBmcm9tICcuLi9PcHRpb25zJztcbmltcG9ydCAqIGFzIE1pZ3JhdGlvbnMgZnJvbSAnLi9NaWdyYXRpb25zJztcblxuZXhwb3J0IGNsYXNzIERlZmluZWRTY2hlbWFzIHtcbiAgY29uZmlnOiBQYXJzZVNlcnZlck9wdGlvbnM7XG4gIHNjaGVtYU9wdGlvbnM6IE1pZ3JhdGlvbnMuU2NoZW1hT3B0aW9ucztcbiAgbG9jYWxTY2hlbWFzOiBNaWdyYXRpb25zLkpTT05TY2hlbWFbXTtcbiAgcmV0cmllczogbnVtYmVyO1xuICBtYXhSZXRyaWVzOiBudW1iZXI7XG4gIGFsbENsb3VkU2NoZW1hczogUGFyc2UuU2NoZW1hW107XG5cbiAgY29uc3RydWN0b3Ioc2NoZW1hT3B0aW9uczogTWlncmF0aW9ucy5TY2hlbWFPcHRpb25zLCBjb25maWc6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICAgIHRoaXMubG9jYWxTY2hlbWFzID0gW107XG4gICAgdGhpcy5jb25maWcgPSBDb25maWcuZ2V0KGNvbmZpZy5hcHBJZCk7XG4gICAgdGhpcy5zY2hlbWFPcHRpb25zID0gc2NoZW1hT3B0aW9ucztcbiAgICBpZiAoc2NoZW1hT3B0aW9ucyAmJiBzY2hlbWFPcHRpb25zLmRlZmluaXRpb25zKSB7XG4gICAgICBpZiAoIUFycmF5LmlzQXJyYXkoc2NoZW1hT3B0aW9ucy5kZWZpbml0aW9ucykpIHtcbiAgICAgICAgdGhyb3cgYFwic2NoZW1hLmRlZmluaXRpb25zXCIgbXVzdCBiZSBhbiBhcnJheSBvZiBzY2hlbWFzYDtcbiAgICAgIH1cblxuICAgICAgdGhpcy5sb2NhbFNjaGVtYXMgPSBzY2hlbWFPcHRpb25zLmRlZmluaXRpb25zO1xuICAgIH1cblxuICAgIHRoaXMucmV0cmllcyA9IDA7XG4gICAgdGhpcy5tYXhSZXRyaWVzID0gMztcbiAgfVxuXG4gIGFzeW5jIHNhdmVTY2hlbWFUb0RCKHNjaGVtYTogUGFyc2UuU2NoZW1hKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcGF5bG9hZCA9IHtcbiAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmNsYXNzTmFtZSxcbiAgICAgIGZpZWxkczogc2NoZW1hLl9maWVsZHMsXG4gICAgICBpbmRleGVzOiBzY2hlbWEuX2luZGV4ZXMsXG4gICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHNjaGVtYS5fY2xwLFxuICAgIH07XG4gICAgYXdhaXQgaW50ZXJuYWxDcmVhdGVTY2hlbWEoc2NoZW1hLmNsYXNzTmFtZSwgcGF5bG9hZCwgdGhpcy5jb25maWcpO1xuICAgIHRoaXMucmVzZXRTY2hlbWFPcHMoc2NoZW1hKTtcbiAgfVxuXG4gIHJlc2V0U2NoZW1hT3BzKHNjaGVtYTogUGFyc2UuU2NoZW1hKSB7XG4gICAgLy8gUmVzZXQgb3BzIGxpa2UgU0RLXG4gICAgc2NoZW1hLl9maWVsZHMgPSB7fTtcbiAgICBzY2hlbWEuX2luZGV4ZXMgPSB7fTtcbiAgfVxuXG4gIC8vIFNpbXVsYXRlIHVwZGF0ZSBsaWtlIHRoZSBTREtcbiAgLy8gV2UgY2Fubm90IHVzZSBTREsgc2luY2Ugcm91dGVzIGFyZSBkaXNhYmxlZFxuICBhc3luYyB1cGRhdGVTY2hlbWFUb0RCKHNjaGVtYTogUGFyc2UuU2NoZW1hKSB7XG4gICAgY29uc3QgcGF5bG9hZCA9IHtcbiAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmNsYXNzTmFtZSxcbiAgICAgIGZpZWxkczogc2NoZW1hLl9maWVsZHMsXG4gICAgICBpbmRleGVzOiBzY2hlbWEuX2luZGV4ZXMsXG4gICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHNjaGVtYS5fY2xwLFxuICAgIH07XG4gICAgYXdhaXQgaW50ZXJuYWxVcGRhdGVTY2hlbWEoc2NoZW1hLmNsYXNzTmFtZSwgcGF5bG9hZCwgdGhpcy5jb25maWcpO1xuICAgIHRoaXMucmVzZXRTY2hlbWFPcHMoc2NoZW1hKTtcbiAgfVxuXG4gIGFzeW5jIGV4ZWN1dGUoKSB7XG4gICAgdHJ5IHtcbiAgICAgIGxvZ2dlci5pbmZvKCdSdW5uaW5nIE1pZ3JhdGlvbnMnKTtcbiAgICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMgJiYgdGhpcy5zY2hlbWFPcHRpb25zLmJlZm9yZU1pZ3JhdGlvbikge1xuICAgICAgICBhd2FpdCBQcm9taXNlLnJlc29sdmUodGhpcy5zY2hlbWFPcHRpb25zLmJlZm9yZU1pZ3JhdGlvbigpKTtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgdGhpcy5leGVjdXRlTWlncmF0aW9ucygpO1xuXG4gICAgICBpZiAodGhpcy5zY2hlbWFPcHRpb25zICYmIHRoaXMuc2NoZW1hT3B0aW9ucy5hZnRlck1pZ3JhdGlvbikge1xuICAgICAgICBhd2FpdCBQcm9taXNlLnJlc29sdmUodGhpcy5zY2hlbWFPcHRpb25zLmFmdGVyTWlncmF0aW9uKCkpO1xuICAgICAgfVxuXG4gICAgICBsb2dnZXIuaW5mbygnUnVubmluZyBNaWdyYXRpb25zIENvbXBsZXRlZCcpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ2dlci5lcnJvcihgRmFpbGVkIHRvIHJ1biBtaWdyYXRpb25zOiAke2V9YCk7XG4gICAgICBpZiAocHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09ICdwcm9kdWN0aW9uJykgcHJvY2Vzcy5leGl0KDEpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGV4ZWN1dGVNaWdyYXRpb25zKCkge1xuICAgIGxldCB0aW1lb3V0ID0gbnVsbDtcbiAgICB0cnkge1xuICAgICAgLy8gU2V0IHVwIGEgdGltZSBvdXQgaW4gcHJvZHVjdGlvblxuICAgICAgLy8gaWYgd2UgZmFpbCB0byBnZXQgc2NoZW1hXG4gICAgICAvLyBwbTIgb3IgSzhzIGFuZCBtYW55IG90aGVyIHByb2Nlc3MgbWFuYWdlcnMgd2lsbCB0cnkgdG8gcmVzdGFydCB0aGUgcHJvY2Vzc1xuICAgICAgLy8gYWZ0ZXIgdGhlIGV4aXRcbiAgICAgIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ3Byb2R1Y3Rpb24nKSB7XG4gICAgICAgIHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ1RpbWVvdXQgb2NjdXJyZWQgZHVyaW5nIGV4ZWN1dGlvbiBvZiBtaWdyYXRpb25zLiBFeGl0aW5nLi4uJyk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9LCAyMDAwMCk7XG4gICAgICB9XG5cbiAgICAgIC8vIEhhY2sgdG8gZm9yY2Ugc2Vzc2lvbiBzY2hlbWEgdG8gYmUgY3JlYXRlZFxuICAgICAgYXdhaXQgdGhpcy5jcmVhdGVEZWxldGVTZXNzaW9uKCk7XG4gICAgICB0aGlzLmFsbENsb3VkU2NoZW1hcyA9IGF3YWl0IFBhcnNlLlNjaGVtYS5hbGwoKTtcbiAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgIGF3YWl0IFByb21pc2UuYWxsKHRoaXMubG9jYWxTY2hlbWFzLm1hcChhc3luYyBsb2NhbFNjaGVtYSA9PiB0aGlzLnNhdmVPclVwZGF0ZShsb2NhbFNjaGVtYSkpKTtcblxuICAgICAgdGhpcy5jaGVja0Zvck1pc3NpbmdTY2hlbWFzKCk7XG4gICAgICBhd2FpdCB0aGlzLmVuZm9yY2VDTFBGb3JOb25Qcm92aWRlZENsYXNzKCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKHRpbWVvdXQpIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgIGlmICh0aGlzLnJldHJpZXMgPCB0aGlzLm1heFJldHJpZXMpIHtcbiAgICAgICAgdGhpcy5yZXRyaWVzKys7XG4gICAgICAgIC8vIGZpcnN0IHJldHJ5IDFzZWMsIDJzZWMsIDNzZWMgdG90YWwgNnNlYyByZXRyeSBzZXF1ZW5jZVxuICAgICAgICAvLyByZXRyeSB3aWxsIG9ubHkgaGFwcGVuIGluIGNhc2Ugb2YgZGVwbG95aW5nIG11bHRpIHBhcnNlIHNlcnZlciBpbnN0YW5jZVxuICAgICAgICAvLyBhdCB0aGUgc2FtZSB0aW1lLiBNb2Rlcm4gc3lzdGVtcyBsaWtlIGs4IGF2b2lkIHRoaXMgYnkgZG9pbmcgcm9sbGluZyB1cGRhdGVzXG4gICAgICAgIGF3YWl0IHRoaXMud2FpdCgxMDAwICogdGhpcy5yZXRyaWVzKTtcbiAgICAgICAgYXdhaXQgdGhpcy5leGVjdXRlTWlncmF0aW9ucygpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGBGYWlsZWQgdG8gcnVuIG1pZ3JhdGlvbnM6ICR7ZX1gKTtcbiAgICAgICAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAncHJvZHVjdGlvbicpIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBjaGVja0Zvck1pc3NpbmdTY2hlbWFzKCkge1xuICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMuc3RyaWN0ICE9PSB0cnVlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgY2xvdWRTY2hlbWFzID0gdGhpcy5hbGxDbG91ZFNjaGVtYXMubWFwKHMgPT4gcy5jbGFzc05hbWUpO1xuICAgIGNvbnN0IGxvY2FsU2NoZW1hcyA9IHRoaXMubG9jYWxTY2hlbWFzLm1hcChzID0+IHMuY2xhc3NOYW1lKTtcbiAgICBjb25zdCBtaXNzaW5nU2NoZW1hcyA9IGNsb3VkU2NoZW1hcy5maWx0ZXIoXG4gICAgICBjID0+ICFsb2NhbFNjaGVtYXMuaW5jbHVkZXMoYykgJiYgIXN5c3RlbUNsYXNzZXMuaW5jbHVkZXMoYylcbiAgICApO1xuXG4gICAgaWYgKG5ldyBTZXQobG9jYWxTY2hlbWFzKS5zaXplICE9PSBsb2NhbFNjaGVtYXMubGVuZ3RoKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgIGBUaGUgbGlzdCBvZiBzY2hlbWFzIHByb3ZpZGVkIGNvbnRhaW5zIGR1cGxpY2F0ZWQgXCJjbGFzc05hbWVcIiAgXCIke2xvY2FsU2NoZW1hcy5qb2luKFxuICAgICAgICAgICdcIixcIidcbiAgICAgICAgKX1cImBcbiAgICAgICk7XG4gICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucy5zdHJpY3QgJiYgbWlzc2luZ1NjaGVtYXMubGVuZ3RoKSB7XG4gICAgICBsb2dnZXIud2FybihcbiAgICAgICAgYFRoZSBmb2xsb3dpbmcgc2NoZW1hcyBhcmUgY3VycmVudGx5IHByZXNlbnQgaW4gdGhlIGRhdGFiYXNlLCBidXQgbm90IGV4cGxpY2l0bHkgZGVmaW5lZCBpbiBhIHNjaGVtYTogXCIke21pc3NpbmdTY2hlbWFzLmpvaW4oXG4gICAgICAgICAgJ1wiLCBcIidcbiAgICAgICAgKX1cImBcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgLy8gUmVxdWlyZWQgZm9yIHRlc3RpbmcgcHVycG9zZVxuICB3YWl0KHRpbWU6IG51bWJlcikge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgdGltZSkpO1xuICB9XG5cbiAgYXN5bmMgZW5mb3JjZUNMUEZvck5vblByb3ZpZGVkQ2xhc3MoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgbm9uUHJvdmlkZWRDbGFzc2VzID0gdGhpcy5hbGxDbG91ZFNjaGVtYXMuZmlsdGVyKFxuICAgICAgY2xvdWRTY2hlbWEgPT5cbiAgICAgICAgIXRoaXMubG9jYWxTY2hlbWFzLnNvbWUobG9jYWxTY2hlbWEgPT4gbG9jYWxTY2hlbWEuY2xhc3NOYW1lID09PSBjbG91ZFNjaGVtYS5jbGFzc05hbWUpXG4gICAgKTtcbiAgICBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgIG5vblByb3ZpZGVkQ2xhc3Nlcy5tYXAoYXN5bmMgc2NoZW1hID0+IHtcbiAgICAgICAgY29uc3QgcGFyc2VTY2hlbWEgPSBuZXcgUGFyc2UuU2NoZW1hKHNjaGVtYS5jbGFzc05hbWUpO1xuICAgICAgICB0aGlzLmhhbmRsZUNMUChzY2hlbWEsIHBhcnNlU2NoZW1hKTtcbiAgICAgICAgYXdhaXQgdGhpcy51cGRhdGVTY2hlbWFUb0RCKHBhcnNlU2NoZW1hKTtcbiAgICAgIH0pXG4gICAgKTtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIGZha2Ugc2Vzc2lvbiBzaW5jZSBQYXJzZSBkbyBub3QgY3JlYXRlIHRoZSBfU2Vzc2lvbiB1bnRpbFxuICAvLyBhIHNlc3Npb24gaXMgY3JlYXRlZFxuICBhc3luYyBjcmVhdGVEZWxldGVTZXNzaW9uKCkge1xuICAgIGNvbnN0IHNlc3Npb24gPSBuZXcgUGFyc2UuU2Vzc2lvbigpO1xuICAgIGF3YWl0IHNlc3Npb24uc2F2ZShudWxsLCB7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgICBhd2FpdCBzZXNzaW9uLmRlc3Ryb3koeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIH1cblxuICBhc3luYyBzYXZlT3JVcGRhdGUobG9jYWxTY2hlbWE6IE1pZ3JhdGlvbnMuSlNPTlNjaGVtYSkge1xuICAgIGNvbnN0IGNsb3VkU2NoZW1hID0gdGhpcy5hbGxDbG91ZFNjaGVtYXMuZmluZChzYyA9PiBzYy5jbGFzc05hbWUgPT09IGxvY2FsU2NoZW1hLmNsYXNzTmFtZSk7XG4gICAgaWYgKGNsb3VkU2NoZW1hKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYShsb2NhbFNjaGVtYSwgY2xvdWRTY2hlbWEpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICB0aHJvdyBgRXJyb3IgZHVyaW5nIHVwZGF0ZSBvZiBzY2hlbWEgZm9yIHR5cGUgJHtjbG91ZFNjaGVtYS5jbGFzc05hbWV9OiAke2V9YDtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy5zYXZlU2NoZW1hKGxvY2FsU2NoZW1hKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgdGhyb3cgYEVycm9yIHdoaWxlIHNhdmluZyBTY2hlbWEgZm9yIHR5cGUgJHtsb2NhbFNjaGVtYS5jbGFzc05hbWV9OiAke2V9YDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBhc3luYyBzYXZlU2NoZW1hKGxvY2FsU2NoZW1hOiBNaWdyYXRpb25zLkpTT05TY2hlbWEpIHtcbiAgICBjb25zdCBuZXdMb2NhbFNjaGVtYSA9IG5ldyBQYXJzZS5TY2hlbWEobG9jYWxTY2hlbWEuY2xhc3NOYW1lKTtcbiAgICBpZiAobG9jYWxTY2hlbWEuZmllbGRzKSB7XG4gICAgICAvLyBIYW5kbGUgZmllbGRzXG4gICAgICBPYmplY3Qua2V5cyhsb2NhbFNjaGVtYS5maWVsZHMpXG4gICAgICAgIC5maWx0ZXIoZmllbGROYW1lID0+ICF0aGlzLmlzUHJvdGVjdGVkRmllbGRzKGxvY2FsU2NoZW1hLmNsYXNzTmFtZSwgZmllbGROYW1lKSlcbiAgICAgICAgLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICBpZiAobG9jYWxTY2hlbWEuZmllbGRzKSB7XG4gICAgICAgICAgICBjb25zdCBmaWVsZCA9IGxvY2FsU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgICAgdGhpcy5oYW5kbGVGaWVsZHMobmV3TG9jYWxTY2hlbWEsIGZpZWxkTmFtZSwgZmllbGQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuICAgIC8vIEhhbmRsZSBpbmRleGVzXG4gICAgaWYgKGxvY2FsU2NoZW1hLmluZGV4ZXMpIHtcbiAgICAgIE9iamVjdC5rZXlzKGxvY2FsU2NoZW1hLmluZGV4ZXMpLmZvckVhY2goaW5kZXhOYW1lID0+IHtcbiAgICAgICAgaWYgKGxvY2FsU2NoZW1hLmluZGV4ZXMgJiYgIXRoaXMuaXNQcm90ZWN0ZWRJbmRleChsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGluZGV4TmFtZSkpIHtcbiAgICAgICAgICBuZXdMb2NhbFNjaGVtYS5hZGRJbmRleChpbmRleE5hbWUsIGxvY2FsU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHRoaXMuaGFuZGxlQ0xQKGxvY2FsU2NoZW1hLCBuZXdMb2NhbFNjaGVtYSk7XG5cbiAgICByZXR1cm4gYXdhaXQgdGhpcy5zYXZlU2NoZW1hVG9EQihuZXdMb2NhbFNjaGVtYSk7XG4gIH1cblxuICBhc3luYyB1cGRhdGVTY2hlbWEobG9jYWxTY2hlbWE6IE1pZ3JhdGlvbnMuSlNPTlNjaGVtYSwgY2xvdWRTY2hlbWE6IFBhcnNlLlNjaGVtYSkge1xuICAgIGNvbnN0IG5ld0xvY2FsU2NoZW1hID0gbmV3IFBhcnNlLlNjaGVtYShsb2NhbFNjaGVtYS5jbGFzc05hbWUpO1xuXG4gICAgLy8gSGFuZGxlIGZpZWxkc1xuICAgIC8vIENoZWNrIGFkZGl0aW9uXG4gICAgaWYgKGxvY2FsU2NoZW1hLmZpZWxkcykge1xuICAgICAgT2JqZWN0LmtleXMobG9jYWxTY2hlbWEuZmllbGRzKVxuICAgICAgICAuZmlsdGVyKGZpZWxkTmFtZSA9PiAhdGhpcy5pc1Byb3RlY3RlZEZpZWxkcyhsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGZpZWxkTmFtZSkpXG4gICAgICAgIC5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG4gICAgICAgICAgY29uc3QgZmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICBpZiAoIWNsb3VkU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB0aGlzLmhhbmRsZUZpZWxkcyhuZXdMb2NhbFNjaGVtYSwgZmllbGROYW1lLCBmaWVsZCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBmaWVsZHNUb0RlbGV0ZTogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBmaWVsZHNUb1JlY3JlYXRlOiB7XG4gICAgICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgICAgIGZyb206IHsgdHlwZTogc3RyaW5nLCB0YXJnZXRDbGFzcz86IHN0cmluZyB9LFxuICAgICAgdG86IHsgdHlwZTogc3RyaW5nLCB0YXJnZXRDbGFzcz86IHN0cmluZyB9LFxuICAgIH1bXSA9IFtdO1xuICAgIGNvbnN0IGZpZWxkc1dpdGhDaGFuZ2VkUGFyYW1zOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgLy8gQ2hlY2sgZGVsZXRpb25cbiAgICBPYmplY3Qua2V5cyhjbG91ZFNjaGVtYS5maWVsZHMpXG4gICAgICAuZmlsdGVyKGZpZWxkTmFtZSA9PiAhdGhpcy5pc1Byb3RlY3RlZEZpZWxkcyhsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGZpZWxkTmFtZSkpXG4gICAgICAuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICBjb25zdCBmaWVsZCA9IGNsb3VkU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICBpZiAoIWxvY2FsU2NoZW1hLmZpZWxkcyB8fCAhbG9jYWxTY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICBmaWVsZHNUb0RlbGV0ZS5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbG9jYWxGaWVsZCA9IGxvY2FsU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAvLyBDaGVjayBpZiBmaWVsZCBoYXMgYSBjaGFuZ2VkIHR5cGVcbiAgICAgICAgaWYgKFxuICAgICAgICAgICF0aGlzLnBhcmFtc0FyZUVxdWFscyhcbiAgICAgICAgICAgIHsgdHlwZTogZmllbGQudHlwZSwgdGFyZ2V0Q2xhc3M6IGZpZWxkLnRhcmdldENsYXNzIH0sXG4gICAgICAgICAgICB7IHR5cGU6IGxvY2FsRmllbGQudHlwZSwgdGFyZ2V0Q2xhc3M6IGxvY2FsRmllbGQudGFyZ2V0Q2xhc3MgfVxuICAgICAgICAgIClcbiAgICAgICAgKSB7XG4gICAgICAgICAgZmllbGRzVG9SZWNyZWF0ZS5wdXNoKHtcbiAgICAgICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgICAgIGZyb206IHsgdHlwZTogZmllbGQudHlwZSwgdGFyZ2V0Q2xhc3M6IGZpZWxkLnRhcmdldENsYXNzIH0sXG4gICAgICAgICAgICB0bzogeyB0eXBlOiBsb2NhbEZpZWxkLnR5cGUsIHRhcmdldENsYXNzOiBsb2NhbEZpZWxkLnRhcmdldENsYXNzIH0sXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgc29tZXRoaW5nIGNoYW5nZWQgb3RoZXIgdGhhbiB0aGUgdHlwZSAobGlrZSByZXF1aXJlZCwgZGVmYXVsdFZhbHVlKVxuICAgICAgICBpZiAoIXRoaXMucGFyYW1zQXJlRXF1YWxzKGZpZWxkLCBsb2NhbEZpZWxkKSkge1xuICAgICAgICAgIGZpZWxkc1dpdGhDaGFuZ2VkUGFyYW1zLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICBpZiAodGhpcy5zY2hlbWFPcHRpb25zLmRlbGV0ZUV4dHJhRmllbGRzID09PSB0cnVlKSB7XG4gICAgICBmaWVsZHNUb0RlbGV0ZS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgIG5ld0xvY2FsU2NoZW1hLmRlbGV0ZUZpZWxkKGZpZWxkTmFtZSk7XG4gICAgICB9KTtcblxuICAgICAgLy8gRGVsZXRlIGZpZWxkcyBmcm9tIHRoZSBzY2hlbWEgdGhlbiBhcHBseSBjaGFuZ2VzXG4gICAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYVRvREIobmV3TG9jYWxTY2hlbWEpO1xuICAgIH0gZWxzZSBpZiAodGhpcy5zY2hlbWFPcHRpb25zLnN0cmljdCA9PT0gdHJ1ZSAmJiBmaWVsZHNUb0RlbGV0ZS5sZW5ndGgpIHtcbiAgICAgIGxvZ2dlci53YXJuKFxuICAgICAgICBgVGhlIGZvbGxvd2luZyBmaWVsZHMgZXhpc3QgaW4gdGhlIGRhdGFiYXNlIGZvciBcIiR7XG4gICAgICAgICAgbG9jYWxTY2hlbWEuY2xhc3NOYW1lXG4gICAgICAgIH1cIiwgYnV0IGFyZSBtaXNzaW5nIGluIHRoZSBzY2hlbWEgOiBcIiR7ZmllbGRzVG9EZWxldGUuam9pbignXCIgLFwiJyl9XCJgXG4gICAgICApO1xuICAgIH1cblxuICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMucmVjcmVhdGVNb2RpZmllZEZpZWxkcyA9PT0gdHJ1ZSkge1xuICAgICAgZmllbGRzVG9SZWNyZWF0ZS5mb3JFYWNoKGZpZWxkID0+IHtcbiAgICAgICAgbmV3TG9jYWxTY2hlbWEuZGVsZXRlRmllbGQoZmllbGQuZmllbGROYW1lKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBEZWxldGUgZmllbGRzIGZyb20gdGhlIHNjaGVtYSB0aGVuIGFwcGx5IGNoYW5nZXNcbiAgICAgIGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hVG9EQihuZXdMb2NhbFNjaGVtYSk7XG5cbiAgICAgIGZpZWxkc1RvUmVjcmVhdGUuZm9yRWFjaChmaWVsZEluZm8gPT4ge1xuICAgICAgICBpZiAobG9jYWxTY2hlbWEuZmllbGRzKSB7XG4gICAgICAgICAgY29uc3QgZmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGRJbmZvLmZpZWxkTmFtZV07XG4gICAgICAgICAgdGhpcy5oYW5kbGVGaWVsZHMobmV3TG9jYWxTY2hlbWEsIGZpZWxkSW5mby5maWVsZE5hbWUsIGZpZWxkKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSBlbHNlIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMuc3RyaWN0ID09PSB0cnVlICYmIGZpZWxkc1RvUmVjcmVhdGUubGVuZ3RoKSB7XG4gICAgICBmaWVsZHNUb1JlY3JlYXRlLmZvckVhY2goZmllbGQgPT4ge1xuICAgICAgICBjb25zdCBmcm9tID1cbiAgICAgICAgICBmaWVsZC5mcm9tLnR5cGUgKyAoZmllbGQuZnJvbS50YXJnZXRDbGFzcyA/IGAgKCR7ZmllbGQuZnJvbS50YXJnZXRDbGFzc30pYCA6ICcnKTtcbiAgICAgICAgY29uc3QgdG8gPSBmaWVsZC50by50eXBlICsgKGZpZWxkLnRvLnRhcmdldENsYXNzID8gYCAoJHtmaWVsZC50by50YXJnZXRDbGFzc30pYCA6ICcnKTtcblxuICAgICAgICBsb2dnZXIud2FybihcbiAgICAgICAgICBgVGhlIGZpZWxkIFwiJHtmaWVsZC5maWVsZE5hbWV9XCIgdHlwZSBkaWZmZXIgYmV0d2VlbiB0aGUgc2NoZW1hIGFuZCB0aGUgZGF0YWJhc2UgZm9yIFwiJHtsb2NhbFNjaGVtYS5jbGFzc05hbWV9XCI7IFNjaGVtYSBpcyBkZWZpbmVkIGFzIFwiJHt0b31cIiBhbmQgY3VycmVudCBkYXRhYmFzZSB0eXBlIGlzIFwiJHtmcm9tfVwiYFxuICAgICAgICApO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgZmllbGRzV2l0aENoYW5nZWRQYXJhbXMuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKGxvY2FsU2NoZW1hLmZpZWxkcykge1xuICAgICAgICBjb25zdCBmaWVsZCA9IGxvY2FsU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICB0aGlzLmhhbmRsZUZpZWxkcyhuZXdMb2NhbFNjaGVtYSwgZmllbGROYW1lLCBmaWVsZCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBIYW5kbGUgSW5kZXhlc1xuICAgIC8vIENoZWNrIGFkZGl0aW9uXG4gICAgaWYgKGxvY2FsU2NoZW1hLmluZGV4ZXMpIHtcbiAgICAgIE9iamVjdC5rZXlzKGxvY2FsU2NoZW1hLmluZGV4ZXMpLmZvckVhY2goaW5kZXhOYW1lID0+IHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgICghY2xvdWRTY2hlbWEuaW5kZXhlcyB8fCAhY2xvdWRTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdKSAmJlxuICAgICAgICAgICF0aGlzLmlzUHJvdGVjdGVkSW5kZXgobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBpbmRleE5hbWUpXG4gICAgICAgICkge1xuICAgICAgICAgIGlmIChsb2NhbFNjaGVtYS5pbmRleGVzKSB7XG4gICAgICAgICAgICBuZXdMb2NhbFNjaGVtYS5hZGRJbmRleChpbmRleE5hbWUsIGxvY2FsU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBpbmRleGVzVG9BZGQgPSBbXTtcblxuICAgIC8vIENoZWNrIGRlbGV0aW9uXG4gICAgaWYgKGNsb3VkU2NoZW1hLmluZGV4ZXMpIHtcbiAgICAgIE9iamVjdC5rZXlzKGNsb3VkU2NoZW1hLmluZGV4ZXMpLmZvckVhY2goaW5kZXhOYW1lID0+IHtcbiAgICAgICAgaWYgKCF0aGlzLmlzUHJvdGVjdGVkSW5kZXgobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBpbmRleE5hbWUpKSB7XG4gICAgICAgICAgaWYgKCFsb2NhbFNjaGVtYS5pbmRleGVzIHx8ICFsb2NhbFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0pIHtcbiAgICAgICAgICAgIG5ld0xvY2FsU2NoZW1hLmRlbGV0ZUluZGV4KGluZGV4TmFtZSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICAgICF0aGlzLnBhcmFtc0FyZUVxdWFscyhsb2NhbFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0sIGNsb3VkU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSlcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIG5ld0xvY2FsU2NoZW1hLmRlbGV0ZUluZGV4KGluZGV4TmFtZSk7XG4gICAgICAgICAgICBpZiAobG9jYWxTY2hlbWEuaW5kZXhlcykge1xuICAgICAgICAgICAgICBpbmRleGVzVG9BZGQucHVzaCh7XG4gICAgICAgICAgICAgICAgaW5kZXhOYW1lLFxuICAgICAgICAgICAgICAgIGluZGV4OiBsb2NhbFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0sXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgdGhpcy5oYW5kbGVDTFAobG9jYWxTY2hlbWEsIG5ld0xvY2FsU2NoZW1hLCBjbG91ZFNjaGVtYSk7XG4gICAgLy8gQXBwbHkgY2hhbmdlc1xuICAgIGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hVG9EQihuZXdMb2NhbFNjaGVtYSk7XG4gICAgLy8gQXBwbHkgbmV3L2NoYW5nZWQgaW5kZXhlc1xuICAgIGlmIChpbmRleGVzVG9BZGQubGVuZ3RoKSB7XG4gICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgIGBVcGRhdGluZyBpbmRleGVzIGZvciBcIiR7bmV3TG9jYWxTY2hlbWEuY2xhc3NOYW1lfVwiIDogICR7aW5kZXhlc1RvQWRkLmpvaW4oJyAsJyl9YFxuICAgICAgKTtcbiAgICAgIGluZGV4ZXNUb0FkZC5mb3JFYWNoKG8gPT4gbmV3TG9jYWxTY2hlbWEuYWRkSW5kZXgoby5pbmRleE5hbWUsIG8uaW5kZXgpKTtcbiAgICAgIGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hVG9EQihuZXdMb2NhbFNjaGVtYSk7XG4gICAgfVxuICB9XG5cbiAgaGFuZGxlQ0xQKFxuICAgIGxvY2FsU2NoZW1hOiBNaWdyYXRpb25zLkpTT05TY2hlbWEsXG4gICAgbmV3TG9jYWxTY2hlbWE6IFBhcnNlLlNjaGVtYSxcbiAgICBjbG91ZFNjaGVtYTogUGFyc2UuU2NoZW1hXG4gICkge1xuICAgIGlmICghbG9jYWxTY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zICYmICFjbG91ZFNjaGVtYSkge1xuICAgICAgbG9nZ2VyLndhcm4oYGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyBub3QgcHJvdmlkZWQgZm9yICR7bG9jYWxTY2hlbWEuY2xhc3NOYW1lfS5gKTtcbiAgICB9XG4gICAgLy8gVXNlIHNwcmVhZCB0byBhdm9pZCByZWFkIG9ubHkgaXNzdWUgKGVuY291bnRlcmVkIGJ5IE1vdW1vdWxzIHVzaW5nIGRpcmVjdEFjY2VzcylcbiAgICBjb25zdCBjbHAgPSAoeyAuLi5sb2NhbFNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMgfSB8fCB7fTogUGFyc2UuQ0xQLlBlcm1pc3Npb25zTWFwKTtcbiAgICAvLyBUbyBhdm9pZCBpbmNvbnNpc3RlbmN5IHdlIG5lZWQgdG8gcmVtb3ZlIGFsbCByaWdodHMgb24gYWRkRmllbGRcbiAgICBjbHAuYWRkRmllbGQgPSB7fTtcbiAgICBuZXdMb2NhbFNjaGVtYS5zZXRDTFAoY2xwKTtcbiAgfVxuXG4gIGlzUHJvdGVjdGVkRmllbGRzKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiAoXG4gICAgICAhIWRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0W2ZpZWxkTmFtZV0gfHxcbiAgICAgICEhKGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV0gJiYgZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXVtmaWVsZE5hbWVdKVxuICAgICk7XG4gIH1cblxuICBpc1Byb3RlY3RlZEluZGV4KGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleE5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IGluZGV4ZXMgPSBbJ19pZF8nXTtcbiAgICBzd2l0Y2ggKGNsYXNzTmFtZSkge1xuICAgICAgY2FzZSAnX1VzZXInOlxuICAgICAgICBpbmRleGVzLnB1c2goXG4gICAgICAgICAgJ2Nhc2VfaW5zZW5zaXRpdmVfdXNlcm5hbWUnLFxuICAgICAgICAgICdjYXNlX2luc2Vuc2l0aXZlX2VtYWlsJyxcbiAgICAgICAgICAndXNlcm5hbWVfMScsXG4gICAgICAgICAgJ2VtYWlsXzEnXG4gICAgICAgICk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnX1JvbGUnOlxuICAgICAgICBpbmRleGVzLnB1c2goJ25hbWVfMScpO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnX0lkZW1wb3RlbmN5JzpcbiAgICAgICAgaW5kZXhlcy5wdXNoKCdyZXFJZF8xJyk7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIHJldHVybiBpbmRleGVzLmluZGV4T2YoaW5kZXhOYW1lKSAhPT0gLTE7XG4gIH1cblxuICBwYXJhbXNBcmVFcXVhbHM8VDogeyBba2V5OiBzdHJpbmddOiBhbnkgfT4ob2JqQTogVCwgb2JqQjogVCkge1xuICAgIGNvbnN0IGtleXNBOiBzdHJpbmdbXSA9IE9iamVjdC5rZXlzKG9iakEpO1xuICAgIGNvbnN0IGtleXNCOiBzdHJpbmdbXSA9IE9iamVjdC5rZXlzKG9iakIpO1xuXG4gICAgLy8gQ2hlY2sga2V5IG5hbWVcbiAgICBpZiAoa2V5c0EubGVuZ3RoICE9PSBrZXlzQi5sZW5ndGgpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4ga2V5c0EuZXZlcnkoayA9PiBvYmpBW2tdID09PSBvYmpCW2tdKTtcbiAgfVxuXG4gIGhhbmRsZUZpZWxkcyhuZXdMb2NhbFNjaGVtYTogUGFyc2UuU2NoZW1hLCBmaWVsZE5hbWU6IHN0cmluZywgZmllbGQ6IE1pZ3JhdGlvbnMuRmllbGRUeXBlKSB7XG4gICAgaWYgKGZpZWxkLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgIG5ld0xvY2FsU2NoZW1hLmFkZFJlbGF0aW9uKGZpZWxkTmFtZSwgZmllbGQudGFyZ2V0Q2xhc3MpO1xuICAgIH0gZWxzZSBpZiAoZmllbGQudHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICBuZXdMb2NhbFNjaGVtYS5hZGRQb2ludGVyKGZpZWxkTmFtZSwgZmllbGQudGFyZ2V0Q2xhc3MsIGZpZWxkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV3TG9jYWxTY2hlbWEuYWRkRmllbGQoZmllbGROYW1lLCBmaWVsZC50eXBlLCBmaWVsZCk7XG4gICAgfVxuICB9XG59XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUdBLElBQUFBLE9BQUEsR0FBQUMsT0FBQTtBQUNBLElBQUFDLE9BQUEsR0FBQUMsc0JBQUEsQ0FBQUYsT0FBQTtBQUNBLElBQUFHLGNBQUEsR0FBQUgsT0FBQTtBQUNBLElBQUFJLGlCQUFBLEdBQUFKLE9BQUE7QUFDQSxJQUFBSyxRQUFBLEdBQUFMLE9BQUE7QUFDQSxJQUFBTSxVQUFBLEdBQUFDLHVCQUFBLENBQUFQLE9BQUE7QUFBMkMsU0FBQVEseUJBQUFDLFdBQUEsZUFBQUMsT0FBQSxrQ0FBQUMs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