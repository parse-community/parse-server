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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfbG9nZ2VyIiwicmVxdWlyZSIsIl9Db25maWciLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwiX1NjaGVtYXNSb3V0ZXIiLCJfU2NoZW1hQ29udHJvbGxlciIsIl9PcHRpb25zIiwiTWlncmF0aW9ucyIsIl9pbnRlcm9wUmVxdWlyZVdpbGRjYXJkIiwiX0F1dGgiLCJfcmVzdCIsIl9nZXRSZXF1aXJlV2lsZGNhcmRDYWNoZSIsIm5vZGVJbnRlcm9wIiwiV2Vha01hcCIsImNhY2hlQmFiZWxJbnRlcm9wIiwiY2FjaGVOb2RlSW50ZXJvcCIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiY2FjaGUiLCJoYXMiLCJnZXQiLCJuZXdPYmoiLCJoYXNQcm9wZXJ0eURlc2NyaXB0b3IiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImtleSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImRlc2MiLCJzZXQiLCJvd25LZXlzIiwib2JqZWN0IiwiZW51bWVyYWJsZU9ubHkiLCJrZXlzIiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwic3ltYm9scyIsImZpbHRlciIsInN5bSIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwidGFyZ2V0IiwiaSIsImFyZ3VtZW50cyIsImxlbmd0aCIsInNvdXJjZSIsImZvckVhY2giLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsInZhbHVlIiwiX3RvUHJvcGVydHlLZXkiLCJjb25maWd1cmFibGUiLCJ3cml0YWJsZSIsImFyZyIsIl90b1ByaW1pdGl2ZSIsIlN0cmluZyIsImlucHV0IiwiaGludCIsInByaW0iLCJTeW1ib2wiLCJ0b1ByaW1pdGl2ZSIsInVuZGVmaW5lZCIsInJlcyIsIlR5cGVFcnJvciIsIk51bWJlciIsIlBhcnNlIiwiRGVmaW5lZFNjaGVtYXMiLCJjb25zdHJ1Y3RvciIsInNjaGVtYU9wdGlvbnMiLCJjb25maWciLCJsb2NhbFNjaGVtYXMiLCJDb25maWciLCJhcHBJZCIsImRlZmluaXRpb25zIiwiQXJyYXkiLCJpc0FycmF5IiwicmV0cmllcyIsIm1heFJldHJpZXMiLCJzYXZlU2NoZW1hVG9EQiIsInNjaGVtYSIsInBheWxvYWQiLCJjbGFzc05hbWUiLCJmaWVsZHMiLCJfZmllbGRzIiwiaW5kZXhlcyIsIl9pbmRleGVzIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiX2NscCIsImludGVybmFsQ3JlYXRlU2NoZW1hIiwicmVzZXRTY2hlbWFPcHMiLCJ1cGRhdGVTY2hlbWFUb0RCIiwiaW50ZXJuYWxVcGRhdGVTY2hlbWEiLCJleGVjdXRlIiwibG9nZ2VyIiwiaW5mbyIsImJlZm9yZU1pZ3JhdGlvbiIsIlByb21pc2UiLCJyZXNvbHZlIiwiZXhlY3V0ZU1pZ3JhdGlvbnMiLCJhZnRlck1pZ3JhdGlvbiIsImUiLCJlcnJvciIsInByb2Nlc3MiLCJlbnYiLCJOT0RFX0VOViIsImV4aXQiLCJ0aW1lb3V0Iiwic2V0VGltZW91dCIsImNyZWF0ZURlbGV0ZVNlc3Npb24iLCJzY2hlbWFDb250cm9sbGVyIiwiZGF0YWJhc2UiLCJsb2FkU2NoZW1hIiwiYWxsQ2xvdWRTY2hlbWFzIiwiZ2V0QWxsQ2xhc3NlcyIsImNsZWFyVGltZW91dCIsImFsbCIsIm1hcCIsImxvY2FsU2NoZW1hIiwic2F2ZU9yVXBkYXRlIiwiY2hlY2tGb3JNaXNzaW5nU2NoZW1hcyIsImVuZm9yY2VDTFBGb3JOb25Qcm92aWRlZENsYXNzIiwid2FpdCIsInN0cmljdCIsImNsb3VkU2NoZW1hcyIsInMiLCJtaXNzaW5nU2NoZW1hcyIsImMiLCJpbmNsdWRlcyIsInN5c3RlbUNsYXNzZXMiLCJTZXQiLCJzaXplIiwiam9pbiIsIndhcm4iLCJ0aW1lIiwibm9uUHJvdmlkZWRDbGFzc2VzIiwiY2xvdWRTY2hlbWEiLCJzb21lIiwicGFyc2VTY2hlbWEiLCJTY2hlbWEiLCJoYW5kbGVDTFAiLCJyZXNwb25zZSIsInJlc3QiLCJjcmVhdGUiLCJBdXRoIiwibWFzdGVyIiwiZGVsIiwib2JqZWN0SWQiLCJmaW5kIiwic2MiLCJ1cGRhdGVTY2hlbWEiLCJzYXZlU2NoZW1hIiwibmV3TG9jYWxTY2hlbWEiLCJmaWVsZE5hbWUiLCJpc1Byb3RlY3RlZEZpZWxkcyIsImZpZWxkIiwiaGFuZGxlRmllbGRzIiwiaW5kZXhOYW1lIiwiaXNQcm90ZWN0ZWRJbmRleCIsImFkZEluZGV4IiwiZmllbGRzVG9EZWxldGUiLCJmaWVsZHNUb1JlY3JlYXRlIiwiZmllbGRzV2l0aENoYW5nZWRQYXJhbXMiLCJsb2NhbEZpZWxkIiwicGFyYW1zQXJlRXF1YWxzIiwidHlwZSIsInRhcmdldENsYXNzIiwiZnJvbSIsInRvIiwiZGVsZXRlRXh0cmFGaWVsZHMiLCJkZWxldGVGaWVsZCIsInJlY3JlYXRlTW9kaWZpZWRGaWVsZHMiLCJmaWVsZEluZm8iLCJpbmRleGVzVG9BZGQiLCJkZWxldGVJbmRleCIsImluZGV4IiwiZGVidWciLCJvIiwiY2xwIiwiYWRkRmllbGQiLCJzZXRDTFAiLCJkZWZhdWx0Q29sdW1ucyIsIl9EZWZhdWx0IiwiaW5kZXhPZiIsIm9iakEiLCJvYmpCIiwia2V5c0EiLCJrZXlzQiIsImV2ZXJ5IiwiayIsImFkZFJlbGF0aW9uIiwiYWRkUG9pbnRlciIsImV4cG9ydHMiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvU2NoZW1hTWlncmF0aW9ucy9EZWZpbmVkU2NoZW1hcy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBAZmxvd1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0IENhbm5vdCByZXNvbHZlIG1vZHVsZSBgcGFyc2Uvbm9kZWAuXG5jb25zdCBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKTtcbmltcG9ydCB7IGxvZ2dlciB9IGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG5pbXBvcnQgeyBpbnRlcm5hbENyZWF0ZVNjaGVtYSwgaW50ZXJuYWxVcGRhdGVTY2hlbWEgfSBmcm9tICcuLi9Sb3V0ZXJzL1NjaGVtYXNSb3V0ZXInO1xuaW1wb3J0IHsgZGVmYXVsdENvbHVtbnMsIHN5c3RlbUNsYXNzZXMgfSBmcm9tICcuLi9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyJztcbmltcG9ydCB7IFBhcnNlU2VydmVyT3B0aW9ucyB9IGZyb20gJy4uL09wdGlvbnMnO1xuaW1wb3J0ICogYXMgTWlncmF0aW9ucyBmcm9tICcuL01pZ3JhdGlvbnMnO1xuaW1wb3J0IEF1dGggZnJvbSAnLi4vQXV0aCc7XG5pbXBvcnQgcmVzdCBmcm9tICcuLi9yZXN0JztcblxuZXhwb3J0IGNsYXNzIERlZmluZWRTY2hlbWFzIHtcbiAgY29uZmlnOiBQYXJzZVNlcnZlck9wdGlvbnM7XG4gIHNjaGVtYU9wdGlvbnM6IE1pZ3JhdGlvbnMuU2NoZW1hT3B0aW9ucztcbiAgbG9jYWxTY2hlbWFzOiBNaWdyYXRpb25zLkpTT05TY2hlbWFbXTtcbiAgcmV0cmllczogbnVtYmVyO1xuICBtYXhSZXRyaWVzOiBudW1iZXI7XG4gIGFsbENsb3VkU2NoZW1hczogUGFyc2UuU2NoZW1hW107XG5cbiAgY29uc3RydWN0b3Ioc2NoZW1hT3B0aW9uczogTWlncmF0aW9ucy5TY2hlbWFPcHRpb25zLCBjb25maWc6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICAgIHRoaXMubG9jYWxTY2hlbWFzID0gW107XG4gICAgdGhpcy5jb25maWcgPSBDb25maWcuZ2V0KGNvbmZpZy5hcHBJZCk7XG4gICAgdGhpcy5zY2hlbWFPcHRpb25zID0gc2NoZW1hT3B0aW9ucztcbiAgICBpZiAoc2NoZW1hT3B0aW9ucyAmJiBzY2hlbWFPcHRpb25zLmRlZmluaXRpb25zKSB7XG4gICAgICBpZiAoIUFycmF5LmlzQXJyYXkoc2NoZW1hT3B0aW9ucy5kZWZpbml0aW9ucykpIHtcbiAgICAgICAgdGhyb3cgYFwic2NoZW1hLmRlZmluaXRpb25zXCIgbXVzdCBiZSBhbiBhcnJheSBvZiBzY2hlbWFzYDtcbiAgICAgIH1cblxuICAgICAgdGhpcy5sb2NhbFNjaGVtYXMgPSBzY2hlbWFPcHRpb25zLmRlZmluaXRpb25zO1xuICAgIH1cblxuICAgIHRoaXMucmV0cmllcyA9IDA7XG4gICAgdGhpcy5tYXhSZXRyaWVzID0gMztcbiAgfVxuXG4gIGFzeW5jIHNhdmVTY2hlbWFUb0RCKHNjaGVtYTogUGFyc2UuU2NoZW1hKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcGF5bG9hZCA9IHtcbiAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmNsYXNzTmFtZSxcbiAgICAgIGZpZWxkczogc2NoZW1hLl9maWVsZHMsXG4gICAgICBpbmRleGVzOiBzY2hlbWEuX2luZGV4ZXMsXG4gICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHNjaGVtYS5fY2xwLFxuICAgIH07XG4gICAgYXdhaXQgaW50ZXJuYWxDcmVhdGVTY2hlbWEoc2NoZW1hLmNsYXNzTmFtZSwgcGF5bG9hZCwgdGhpcy5jb25maWcpO1xuICAgIHRoaXMucmVzZXRTY2hlbWFPcHMoc2NoZW1hKTtcbiAgfVxuXG4gIHJlc2V0U2NoZW1hT3BzKHNjaGVtYTogUGFyc2UuU2NoZW1hKSB7XG4gICAgLy8gUmVzZXQgb3BzIGxpa2UgU0RLXG4gICAgc2NoZW1hLl9maWVsZHMgPSB7fTtcbiAgICBzY2hlbWEuX2luZGV4ZXMgPSB7fTtcbiAgfVxuXG4gIC8vIFNpbXVsYXRlIHVwZGF0ZSBsaWtlIHRoZSBTREtcbiAgLy8gV2UgY2Fubm90IHVzZSBTREsgc2luY2Ugcm91dGVzIGFyZSBkaXNhYmxlZFxuICBhc3luYyB1cGRhdGVTY2hlbWFUb0RCKHNjaGVtYTogUGFyc2UuU2NoZW1hKSB7XG4gICAgY29uc3QgcGF5bG9hZCA9IHtcbiAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmNsYXNzTmFtZSxcbiAgICAgIGZpZWxkczogc2NoZW1hLl9maWVsZHMsXG4gICAgICBpbmRleGVzOiBzY2hlbWEuX2luZGV4ZXMsXG4gICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHNjaGVtYS5fY2xwLFxuICAgIH07XG4gICAgYXdhaXQgaW50ZXJuYWxVcGRhdGVTY2hlbWEoc2NoZW1hLmNsYXNzTmFtZSwgcGF5bG9hZCwgdGhpcy5jb25maWcpO1xuICAgIHRoaXMucmVzZXRTY2hlbWFPcHMoc2NoZW1hKTtcbiAgfVxuXG4gIGFzeW5jIGV4ZWN1dGUoKSB7XG4gICAgdHJ5IHtcbiAgICAgIGxvZ2dlci5pbmZvKCdSdW5uaW5nIE1pZ3JhdGlvbnMnKTtcbiAgICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMgJiYgdGhpcy5zY2hlbWFPcHRpb25zLmJlZm9yZU1pZ3JhdGlvbikge1xuICAgICAgICBhd2FpdCBQcm9taXNlLnJlc29sdmUodGhpcy5zY2hlbWFPcHRpb25zLmJlZm9yZU1pZ3JhdGlvbigpKTtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgdGhpcy5leGVjdXRlTWlncmF0aW9ucygpO1xuXG4gICAgICBpZiAodGhpcy5zY2hlbWFPcHRpb25zICYmIHRoaXMuc2NoZW1hT3B0aW9ucy5hZnRlck1pZ3JhdGlvbikge1xuICAgICAgICBhd2FpdCBQcm9taXNlLnJlc29sdmUodGhpcy5zY2hlbWFPcHRpb25zLmFmdGVyTWlncmF0aW9uKCkpO1xuICAgICAgfVxuXG4gICAgICBsb2dnZXIuaW5mbygnUnVubmluZyBNaWdyYXRpb25zIENvbXBsZXRlZCcpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ2dlci5lcnJvcihgRmFpbGVkIHRvIHJ1biBtaWdyYXRpb25zOiAke2V9YCk7XG4gICAgICBpZiAocHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09ICdwcm9kdWN0aW9uJykgcHJvY2Vzcy5leGl0KDEpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGV4ZWN1dGVNaWdyYXRpb25zKCkge1xuICAgIGxldCB0aW1lb3V0ID0gbnVsbDtcbiAgICB0cnkge1xuICAgICAgLy8gU2V0IHVwIGEgdGltZSBvdXQgaW4gcHJvZHVjdGlvblxuICAgICAgLy8gaWYgd2UgZmFpbCB0byBnZXQgc2NoZW1hXG4gICAgICAvLyBwbTIgb3IgSzhzIGFuZCBtYW55IG90aGVyIHByb2Nlc3MgbWFuYWdlcnMgd2lsbCB0cnkgdG8gcmVzdGFydCB0aGUgcHJvY2Vzc1xuICAgICAgLy8gYWZ0ZXIgdGhlIGV4aXRcbiAgICAgIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ3Byb2R1Y3Rpb24nKSB7XG4gICAgICAgIHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ1RpbWVvdXQgb2NjdXJyZWQgZHVyaW5nIGV4ZWN1dGlvbiBvZiBtaWdyYXRpb25zLiBFeGl0aW5nLi4uJyk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9LCAyMDAwMCk7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMuY3JlYXRlRGVsZXRlU2Vzc2lvbigpO1xuICAgICAgLy8gQGZsb3ctZGlzYWJsZS1uZXh0LWxpbmVcbiAgICAgIGNvbnN0IHNjaGVtYUNvbnRyb2xsZXIgPSBhd2FpdCB0aGlzLmNvbmZpZy5kYXRhYmFzZS5sb2FkU2NoZW1hKCk7XG4gICAgICB0aGlzLmFsbENsb3VkU2NoZW1hcyA9IGF3YWl0IHNjaGVtYUNvbnRyb2xsZXIuZ2V0QWxsQ2xhc3NlcygpO1xuICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgYXdhaXQgUHJvbWlzZS5hbGwodGhpcy5sb2NhbFNjaGVtYXMubWFwKGFzeW5jIGxvY2FsU2NoZW1hID0+IHRoaXMuc2F2ZU9yVXBkYXRlKGxvY2FsU2NoZW1hKSkpO1xuXG4gICAgICB0aGlzLmNoZWNrRm9yTWlzc2luZ1NjaGVtYXMoKTtcbiAgICAgIGF3YWl0IHRoaXMuZW5mb3JjZUNMUEZvck5vblByb3ZpZGVkQ2xhc3MoKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBpZiAodGltZW91dCkgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgaWYgKHRoaXMucmV0cmllcyA8IHRoaXMubWF4UmV0cmllcykge1xuICAgICAgICB0aGlzLnJldHJpZXMrKztcbiAgICAgICAgLy8gZmlyc3QgcmV0cnkgMXNlYywgMnNlYywgM3NlYyB0b3RhbCA2c2VjIHJldHJ5IHNlcXVlbmNlXG4gICAgICAgIC8vIHJldHJ5IHdpbGwgb25seSBoYXBwZW4gaW4gY2FzZSBvZiBkZXBsb3lpbmcgbXVsdGkgcGFyc2Ugc2VydmVyIGluc3RhbmNlXG4gICAgICAgIC8vIGF0IHRoZSBzYW1lIHRpbWUuIE1vZGVybiBzeXN0ZW1zIGxpa2UgazggYXZvaWQgdGhpcyBieSBkb2luZyByb2xsaW5nIHVwZGF0ZXNcbiAgICAgICAgYXdhaXQgdGhpcy53YWl0KDEwMDAgKiB0aGlzLnJldHJpZXMpO1xuICAgICAgICBhd2FpdCB0aGlzLmV4ZWN1dGVNaWdyYXRpb25zKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2dnZXIuZXJyb3IoYEZhaWxlZCB0byBydW4gbWlncmF0aW9uczogJHtlfWApO1xuICAgICAgICBpZiAocHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09ICdwcm9kdWN0aW9uJykgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGNoZWNrRm9yTWlzc2luZ1NjaGVtYXMoKSB7XG4gICAgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucy5zdHJpY3QgIT09IHRydWUpIHtcbiAgICAgIHJldHVybjtcbiAgICB9XG5cbiAgICBjb25zdCBjbG91ZFNjaGVtYXMgPSB0aGlzLmFsbENsb3VkU2NoZW1hcy5tYXAocyA9PiBzLmNsYXNzTmFtZSk7XG4gICAgY29uc3QgbG9jYWxTY2hlbWFzID0gdGhpcy5sb2NhbFNjaGVtYXMubWFwKHMgPT4gcy5jbGFzc05hbWUpO1xuICAgIGNvbnN0IG1pc3NpbmdTY2hlbWFzID0gY2xvdWRTY2hlbWFzLmZpbHRlcihcbiAgICAgIGMgPT4gIWxvY2FsU2NoZW1hcy5pbmNsdWRlcyhjKSAmJiAhc3lzdGVtQ2xhc3Nlcy5pbmNsdWRlcyhjKVxuICAgICk7XG5cbiAgICBpZiAobmV3IFNldChsb2NhbFNjaGVtYXMpLnNpemUgIT09IGxvY2FsU2NoZW1hcy5sZW5ndGgpIHtcbiAgICAgIGxvZ2dlci5lcnJvcihcbiAgICAgICAgYFRoZSBsaXN0IG9mIHNjaGVtYXMgcHJvdmlkZWQgY29udGFpbnMgZHVwbGljYXRlZCBcImNsYXNzTmFtZVwiICBcIiR7bG9jYWxTY2hlbWFzLmpvaW4oXG4gICAgICAgICAgJ1wiLFwiJ1xuICAgICAgICApfVwiYFxuICAgICAgKTtcbiAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5zY2hlbWFPcHRpb25zLnN0cmljdCAmJiBtaXNzaW5nU2NoZW1hcy5sZW5ndGgpIHtcbiAgICAgIGxvZ2dlci53YXJuKFxuICAgICAgICBgVGhlIGZvbGxvd2luZyBzY2hlbWFzIGFyZSBjdXJyZW50bHkgcHJlc2VudCBpbiB0aGUgZGF0YWJhc2UsIGJ1dCBub3QgZXhwbGljaXRseSBkZWZpbmVkIGluIGEgc2NoZW1hOiBcIiR7bWlzc2luZ1NjaGVtYXMuam9pbihcbiAgICAgICAgICAnXCIsIFwiJ1xuICAgICAgICApfVwiYFxuICAgICAgKTtcbiAgICB9XG4gIH1cblxuICAvLyBSZXF1aXJlZCBmb3IgdGVzdGluZyBwdXJwb3NlXG4gIHdhaXQodGltZTogbnVtYmVyKSB7XG4gICAgcmV0dXJuIG5ldyBQcm9taXNlPHZvaWQ+KHJlc29sdmUgPT4gc2V0VGltZW91dChyZXNvbHZlLCB0aW1lKSk7XG4gIH1cblxuICBhc3luYyBlbmZvcmNlQ0xQRm9yTm9uUHJvdmlkZWRDbGFzcygpOiBQcm9taXNlPHZvaWQ+IHtcbiAgICBjb25zdCBub25Qcm92aWRlZENsYXNzZXMgPSB0aGlzLmFsbENsb3VkU2NoZW1hcy5maWx0ZXIoXG4gICAgICBjbG91ZFNjaGVtYSA9PlxuICAgICAgICAhdGhpcy5sb2NhbFNjaGVtYXMuc29tZShsb2NhbFNjaGVtYSA9PiBsb2NhbFNjaGVtYS5jbGFzc05hbWUgPT09IGNsb3VkU2NoZW1hLmNsYXNzTmFtZSlcbiAgICApO1xuICAgIGF3YWl0IFByb21pc2UuYWxsKFxuICAgICAgbm9uUHJvdmlkZWRDbGFzc2VzLm1hcChhc3luYyBzY2hlbWEgPT4ge1xuICAgICAgICBjb25zdCBwYXJzZVNjaGVtYSA9IG5ldyBQYXJzZS5TY2hlbWEoc2NoZW1hLmNsYXNzTmFtZSk7XG4gICAgICAgIHRoaXMuaGFuZGxlQ0xQKHNjaGVtYSwgcGFyc2VTY2hlbWEpO1xuICAgICAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYVRvREIocGFyc2VTY2hlbWEpO1xuICAgICAgfSlcbiAgICApO1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgZmFrZSBzZXNzaW9uIHNpbmNlIFBhcnNlIGRvIG5vdCBjcmVhdGUgdGhlIF9TZXNzaW9uIHVudGlsXG4gIC8vIGEgc2Vzc2lvbiBpcyBjcmVhdGVkXG4gIGFzeW5jIGNyZWF0ZURlbGV0ZVNlc3Npb24oKSB7XG4gICAgY29uc3QgeyByZXNwb25zZSB9ID0gYXdhaXQgcmVzdC5jcmVhdGUodGhpcy5jb25maWcsIEF1dGgubWFzdGVyKHRoaXMuY29uZmlnKSwgJ19TZXNzaW9uJywge30pO1xuICAgIGF3YWl0IHJlc3QuZGVsKHRoaXMuY29uZmlnLCBBdXRoLm1hc3Rlcih0aGlzLmNvbmZpZyksICdfU2Vzc2lvbicsIHJlc3BvbnNlLm9iamVjdElkKTtcbiAgfVxuXG4gIGFzeW5jIHNhdmVPclVwZGF0ZShsb2NhbFNjaGVtYTogTWlncmF0aW9ucy5KU09OU2NoZW1hKSB7XG4gICAgY29uc3QgY2xvdWRTY2hlbWEgPSB0aGlzLmFsbENsb3VkU2NoZW1hcy5maW5kKHNjID0+IHNjLmNsYXNzTmFtZSA9PT0gbG9jYWxTY2hlbWEuY2xhc3NOYW1lKTtcbiAgICBpZiAoY2xvdWRTY2hlbWEpIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hKGxvY2FsU2NoZW1hLCBjbG91ZFNjaGVtYSk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHRocm93IGBFcnJvciBkdXJpbmcgdXBkYXRlIG9mIHNjaGVtYSBmb3IgdHlwZSAke2Nsb3VkU2NoZW1hLmNsYXNzTmFtZX06ICR7ZX1gO1xuICAgICAgfVxuICAgIH0gZWxzZSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0aGlzLnNhdmVTY2hlbWEobG9jYWxTY2hlbWEpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICB0aHJvdyBgRXJyb3Igd2hpbGUgc2F2aW5nIFNjaGVtYSBmb3IgdHlwZSAke2xvY2FsU2NoZW1hLmNsYXNzTmFtZX06ICR7ZX1gO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIGFzeW5jIHNhdmVTY2hlbWEobG9jYWxTY2hlbWE6IE1pZ3JhdGlvbnMuSlNPTlNjaGVtYSkge1xuICAgIGNvbnN0IG5ld0xvY2FsU2NoZW1hID0gbmV3IFBhcnNlLlNjaGVtYShsb2NhbFNjaGVtYS5jbGFzc05hbWUpO1xuICAgIGlmIChsb2NhbFNjaGVtYS5maWVsZHMpIHtcbiAgICAgIC8vIEhhbmRsZSBmaWVsZHNcbiAgICAgIE9iamVjdC5rZXlzKGxvY2FsU2NoZW1hLmZpZWxkcylcbiAgICAgICAgLmZpbHRlcihmaWVsZE5hbWUgPT4gIXRoaXMuaXNQcm90ZWN0ZWRGaWVsZHMobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBmaWVsZE5hbWUpKVxuICAgICAgICAuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgIGlmIChsb2NhbFNjaGVtYS5maWVsZHMpIHtcbiAgICAgICAgICAgIGNvbnN0IGZpZWxkID0gbG9jYWxTY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgICB0aGlzLmhhbmRsZUZpZWxkcyhuZXdMb2NhbFNjaGVtYSwgZmllbGROYW1lLCBmaWVsZCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG4gICAgLy8gSGFuZGxlIGluZGV4ZXNcbiAgICBpZiAobG9jYWxTY2hlbWEuaW5kZXhlcykge1xuICAgICAgT2JqZWN0LmtleXMobG9jYWxTY2hlbWEuaW5kZXhlcykuZm9yRWFjaChpbmRleE5hbWUgPT4ge1xuICAgICAgICBpZiAobG9jYWxTY2hlbWEuaW5kZXhlcyAmJiAhdGhpcy5pc1Byb3RlY3RlZEluZGV4KGxvY2FsU2NoZW1hLmNsYXNzTmFtZSwgaW5kZXhOYW1lKSkge1xuICAgICAgICAgIG5ld0xvY2FsU2NoZW1hLmFkZEluZGV4KGluZGV4TmFtZSwgbG9jYWxTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgdGhpcy5oYW5kbGVDTFAobG9jYWxTY2hlbWEsIG5ld0xvY2FsU2NoZW1hKTtcblxuICAgIHJldHVybiBhd2FpdCB0aGlzLnNhdmVTY2hlbWFUb0RCKG5ld0xvY2FsU2NoZW1hKTtcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZVNjaGVtYShsb2NhbFNjaGVtYTogTWlncmF0aW9ucy5KU09OU2NoZW1hLCBjbG91ZFNjaGVtYTogUGFyc2UuU2NoZW1hKSB7XG4gICAgY29uc3QgbmV3TG9jYWxTY2hlbWEgPSBuZXcgUGFyc2UuU2NoZW1hKGxvY2FsU2NoZW1hLmNsYXNzTmFtZSk7XG5cbiAgICAvLyBIYW5kbGUgZmllbGRzXG4gICAgLy8gQ2hlY2sgYWRkaXRpb25cbiAgICBpZiAobG9jYWxTY2hlbWEuZmllbGRzKSB7XG4gICAgICBPYmplY3Qua2V5cyhsb2NhbFNjaGVtYS5maWVsZHMpXG4gICAgICAgIC5maWx0ZXIoZmllbGROYW1lID0+ICF0aGlzLmlzUHJvdGVjdGVkRmllbGRzKGxvY2FsU2NoZW1hLmNsYXNzTmFtZSwgZmllbGROYW1lKSlcbiAgICAgICAgLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICAvLyBAZmxvdy1kaXNhYmxlLW5leHRcbiAgICAgICAgICBjb25zdCBmaWVsZCA9IGxvY2FsU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgIGlmICghY2xvdWRTY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlRmllbGRzKG5ld0xvY2FsU2NoZW1hLCBmaWVsZE5hbWUsIGZpZWxkKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IGZpZWxkc1RvRGVsZXRlOiBzdHJpbmdbXSA9IFtdO1xuICAgIGNvbnN0IGZpZWxkc1RvUmVjcmVhdGU6IHtcbiAgICAgIGZpZWxkTmFtZTogc3RyaW5nLFxuICAgICAgZnJvbTogeyB0eXBlOiBzdHJpbmcsIHRhcmdldENsYXNzPzogc3RyaW5nIH0sXG4gICAgICB0bzogeyB0eXBlOiBzdHJpbmcsIHRhcmdldENsYXNzPzogc3RyaW5nIH0sXG4gICAgfVtdID0gW107XG4gICAgY29uc3QgZmllbGRzV2l0aENoYW5nZWRQYXJhbXM6IHN0cmluZ1tdID0gW107XG5cbiAgICAvLyBDaGVjayBkZWxldGlvblxuICAgIE9iamVjdC5rZXlzKGNsb3VkU2NoZW1hLmZpZWxkcylcbiAgICAgIC5maWx0ZXIoZmllbGROYW1lID0+ICF0aGlzLmlzUHJvdGVjdGVkRmllbGRzKGxvY2FsU2NoZW1hLmNsYXNzTmFtZSwgZmllbGROYW1lKSlcbiAgICAgIC5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgIGNvbnN0IGZpZWxkID0gY2xvdWRTY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgIGlmICghbG9jYWxTY2hlbWEuZmllbGRzIHx8ICFsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXSkge1xuICAgICAgICAgIGZpZWxkc1RvRGVsZXRlLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICBjb25zdCBsb2NhbEZpZWxkID0gbG9jYWxTY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgIC8vIENoZWNrIGlmIGZpZWxkIGhhcyBhIGNoYW5nZWQgdHlwZVxuICAgICAgICBpZiAoXG4gICAgICAgICAgIXRoaXMucGFyYW1zQXJlRXF1YWxzKFxuICAgICAgICAgICAgeyB0eXBlOiBmaWVsZC50eXBlLCB0YXJnZXRDbGFzczogZmllbGQudGFyZ2V0Q2xhc3MgfSxcbiAgICAgICAgICAgIHsgdHlwZTogbG9jYWxGaWVsZC50eXBlLCB0YXJnZXRDbGFzczogbG9jYWxGaWVsZC50YXJnZXRDbGFzcyB9XG4gICAgICAgICAgKVxuICAgICAgICApIHtcbiAgICAgICAgICBmaWVsZHNUb1JlY3JlYXRlLnB1c2goe1xuICAgICAgICAgICAgZmllbGROYW1lLFxuICAgICAgICAgICAgZnJvbTogeyB0eXBlOiBmaWVsZC50eXBlLCB0YXJnZXRDbGFzczogZmllbGQudGFyZ2V0Q2xhc3MgfSxcbiAgICAgICAgICAgIHRvOiB7IHR5cGU6IGxvY2FsRmllbGQudHlwZSwgdGFyZ2V0Q2xhc3M6IGxvY2FsRmllbGQudGFyZ2V0Q2xhc3MgfSxcbiAgICAgICAgICB9KTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDaGVjayBpZiBzb21ldGhpbmcgY2hhbmdlZCBvdGhlciB0aGFuIHRoZSB0eXBlIChsaWtlIHJlcXVpcmVkLCBkZWZhdWx0VmFsdWUpXG4gICAgICAgIGlmICghdGhpcy5wYXJhbXNBcmVFcXVhbHMoZmllbGQsIGxvY2FsRmllbGQpKSB7XG4gICAgICAgICAgZmllbGRzV2l0aENoYW5nZWRQYXJhbXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMuZGVsZXRlRXh0cmFGaWVsZHMgPT09IHRydWUpIHtcbiAgICAgIGZpZWxkc1RvRGVsZXRlLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgbmV3TG9jYWxTY2hlbWEuZGVsZXRlRmllbGQoZmllbGROYW1lKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBEZWxldGUgZmllbGRzIGZyb20gdGhlIHNjaGVtYSB0aGVuIGFwcGx5IGNoYW5nZXNcbiAgICAgIGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hVG9EQihuZXdMb2NhbFNjaGVtYSk7XG4gICAgfSBlbHNlIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMuc3RyaWN0ID09PSB0cnVlICYmIGZpZWxkc1RvRGVsZXRlLmxlbmd0aCkge1xuICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgIGBUaGUgZm9sbG93aW5nIGZpZWxkcyBleGlzdCBpbiB0aGUgZGF0YWJhc2UgZm9yIFwiJHtcbiAgICAgICAgICBsb2NhbFNjaGVtYS5jbGFzc05hbWVcbiAgICAgICAgfVwiLCBidXQgYXJlIG1pc3NpbmcgaW4gdGhlIHNjaGVtYSA6IFwiJHtmaWVsZHNUb0RlbGV0ZS5qb2luKCdcIiAsXCInKX1cImBcbiAgICAgICk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucy5yZWNyZWF0ZU1vZGlmaWVkRmllbGRzID09PSB0cnVlKSB7XG4gICAgICBmaWVsZHNUb1JlY3JlYXRlLmZvckVhY2goZmllbGQgPT4ge1xuICAgICAgICBuZXdMb2NhbFNjaGVtYS5kZWxldGVGaWVsZChmaWVsZC5maWVsZE5hbWUpO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIERlbGV0ZSBmaWVsZHMgZnJvbSB0aGUgc2NoZW1hIHRoZW4gYXBwbHkgY2hhbmdlc1xuICAgICAgYXdhaXQgdGhpcy51cGRhdGVTY2hlbWFUb0RCKG5ld0xvY2FsU2NoZW1hKTtcblxuICAgICAgZmllbGRzVG9SZWNyZWF0ZS5mb3JFYWNoKGZpZWxkSW5mbyA9PiB7XG4gICAgICAgIGlmIChsb2NhbFNjaGVtYS5maWVsZHMpIHtcbiAgICAgICAgICBjb25zdCBmaWVsZCA9IGxvY2FsU2NoZW1hLmZpZWxkc1tmaWVsZEluZm8uZmllbGROYW1lXTtcbiAgICAgICAgICB0aGlzLmhhbmRsZUZpZWxkcyhuZXdMb2NhbFNjaGVtYSwgZmllbGRJbmZvLmZpZWxkTmFtZSwgZmllbGQpO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucy5zdHJpY3QgPT09IHRydWUgJiYgZmllbGRzVG9SZWNyZWF0ZS5sZW5ndGgpIHtcbiAgICAgIGZpZWxkc1RvUmVjcmVhdGUuZm9yRWFjaChmaWVsZCA9PiB7XG4gICAgICAgIGNvbnN0IGZyb20gPVxuICAgICAgICAgIGZpZWxkLmZyb20udHlwZSArIChmaWVsZC5mcm9tLnRhcmdldENsYXNzID8gYCAoJHtmaWVsZC5mcm9tLnRhcmdldENsYXNzfSlgIDogJycpO1xuICAgICAgICBjb25zdCB0byA9IGZpZWxkLnRvLnR5cGUgKyAoZmllbGQudG8udGFyZ2V0Q2xhc3MgPyBgICgke2ZpZWxkLnRvLnRhcmdldENsYXNzfSlgIDogJycpO1xuXG4gICAgICAgIGxvZ2dlci53YXJuKFxuICAgICAgICAgIGBUaGUgZmllbGQgXCIke2ZpZWxkLmZpZWxkTmFtZX1cIiB0eXBlIGRpZmZlciBiZXR3ZWVuIHRoZSBzY2hlbWEgYW5kIHRoZSBkYXRhYmFzZSBmb3IgXCIke2xvY2FsU2NoZW1hLmNsYXNzTmFtZX1cIjsgU2NoZW1hIGlzIGRlZmluZWQgYXMgXCIke3RvfVwiIGFuZCBjdXJyZW50IGRhdGFiYXNlIHR5cGUgaXMgXCIke2Zyb219XCJgXG4gICAgICAgICk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBmaWVsZHNXaXRoQ2hhbmdlZFBhcmFtcy5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBpZiAobG9jYWxTY2hlbWEuZmllbGRzKSB7XG4gICAgICAgIGNvbnN0IGZpZWxkID0gbG9jYWxTY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgIHRoaXMuaGFuZGxlRmllbGRzKG5ld0xvY2FsU2NoZW1hLCBmaWVsZE5hbWUsIGZpZWxkKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIC8vIEhhbmRsZSBJbmRleGVzXG4gICAgLy8gQ2hlY2sgYWRkaXRpb25cbiAgICBpZiAobG9jYWxTY2hlbWEuaW5kZXhlcykge1xuICAgICAgT2JqZWN0LmtleXMobG9jYWxTY2hlbWEuaW5kZXhlcykuZm9yRWFjaChpbmRleE5hbWUgPT4ge1xuICAgICAgICBpZiAoXG4gICAgICAgICAgKCFjbG91ZFNjaGVtYS5pbmRleGVzIHx8ICFjbG91ZFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0pICYmXG4gICAgICAgICAgIXRoaXMuaXNQcm90ZWN0ZWRJbmRleChsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGluZGV4TmFtZSlcbiAgICAgICAgKSB7XG4gICAgICAgICAgaWYgKGxvY2FsU2NoZW1hLmluZGV4ZXMpIHtcbiAgICAgICAgICAgIG5ld0xvY2FsU2NoZW1hLmFkZEluZGV4KGluZGV4TmFtZSwgbG9jYWxTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGNvbnN0IGluZGV4ZXNUb0FkZCA9IFtdO1xuXG4gICAgLy8gQ2hlY2sgZGVsZXRpb25cbiAgICBpZiAoY2xvdWRTY2hlbWEuaW5kZXhlcykge1xuICAgICAgT2JqZWN0LmtleXMoY2xvdWRTY2hlbWEuaW5kZXhlcykuZm9yRWFjaChpbmRleE5hbWUgPT4ge1xuICAgICAgICBpZiAoIXRoaXMuaXNQcm90ZWN0ZWRJbmRleChsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGluZGV4TmFtZSkpIHtcbiAgICAgICAgICBpZiAoIWxvY2FsU2NoZW1hLmluZGV4ZXMgfHwgIWxvY2FsU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSkge1xuICAgICAgICAgICAgbmV3TG9jYWxTY2hlbWEuZGVsZXRlSW5kZXgoaW5kZXhOYW1lKTtcbiAgICAgICAgICB9IGVsc2UgaWYgKFxuICAgICAgICAgICAgIXRoaXMucGFyYW1zQXJlRXF1YWxzKGxvY2FsU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSwgY2xvdWRTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdKVxuICAgICAgICAgICkge1xuICAgICAgICAgICAgbmV3TG9jYWxTY2hlbWEuZGVsZXRlSW5kZXgoaW5kZXhOYW1lKTtcbiAgICAgICAgICAgIGlmIChsb2NhbFNjaGVtYS5pbmRleGVzKSB7XG4gICAgICAgICAgICAgIGluZGV4ZXNUb0FkZC5wdXNoKHtcbiAgICAgICAgICAgICAgICBpbmRleE5hbWUsXG4gICAgICAgICAgICAgICAgaW5kZXg6IGxvY2FsU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSxcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICB0aGlzLmhhbmRsZUNMUChsb2NhbFNjaGVtYSwgbmV3TG9jYWxTY2hlbWEsIGNsb3VkU2NoZW1hKTtcbiAgICAvLyBBcHBseSBjaGFuZ2VzXG4gICAgYXdhaXQgdGhpcy51cGRhdGVTY2hlbWFUb0RCKG5ld0xvY2FsU2NoZW1hKTtcbiAgICAvLyBBcHBseSBuZXcvY2hhbmdlZCBpbmRleGVzXG4gICAgaWYgKGluZGV4ZXNUb0FkZC5sZW5ndGgpIHtcbiAgICAgIGxvZ2dlci5kZWJ1ZyhcbiAgICAgICAgYFVwZGF0aW5nIGluZGV4ZXMgZm9yIFwiJHtuZXdMb2NhbFNjaGVtYS5jbGFzc05hbWV9XCIgOiAgJHtpbmRleGVzVG9BZGQuam9pbignICwnKX1gXG4gICAgICApO1xuICAgICAgaW5kZXhlc1RvQWRkLmZvckVhY2gobyA9PiBuZXdMb2NhbFNjaGVtYS5hZGRJbmRleChvLmluZGV4TmFtZSwgby5pbmRleCkpO1xuICAgICAgYXdhaXQgdGhpcy51cGRhdGVTY2hlbWFUb0RCKG5ld0xvY2FsU2NoZW1hKTtcbiAgICB9XG4gIH1cblxuICBoYW5kbGVDTFAoXG4gICAgbG9jYWxTY2hlbWE6IE1pZ3JhdGlvbnMuSlNPTlNjaGVtYSxcbiAgICBuZXdMb2NhbFNjaGVtYTogUGFyc2UuU2NoZW1hLFxuICAgIGNsb3VkU2NoZW1hOiBQYXJzZS5TY2hlbWFcbiAgKSB7XG4gICAgaWYgKCFsb2NhbFNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMgJiYgIWNsb3VkU2NoZW1hKSB7XG4gICAgICBsb2dnZXIud2FybihgY2xhc3NMZXZlbFBlcm1pc3Npb25zIG5vdCBwcm92aWRlZCBmb3IgJHtsb2NhbFNjaGVtYS5jbGFzc05hbWV9LmApO1xuICAgIH1cbiAgICAvLyBVc2Ugc3ByZWFkIHRvIGF2b2lkIHJlYWQgb25seSBpc3N1ZSAoZW5jb3VudGVyZWQgYnkgTW91bW91bHMgdXNpbmcgZGlyZWN0QWNjZXNzKVxuICAgIGNvbnN0IGNscCA9ICh7IC4uLmxvY2FsU2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyB9IHx8IHt9OiBQYXJzZS5DTFAuUGVybWlzc2lvbnNNYXApO1xuICAgIC8vIFRvIGF2b2lkIGluY29uc2lzdGVuY3kgd2UgbmVlZCB0byByZW1vdmUgYWxsIHJpZ2h0cyBvbiBhZGRGaWVsZFxuICAgIGNscC5hZGRGaWVsZCA9IHt9O1xuICAgIG5ld0xvY2FsU2NoZW1hLnNldENMUChjbHApO1xuICB9XG5cbiAgaXNQcm90ZWN0ZWRGaWVsZHMoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nKSB7XG4gICAgcmV0dXJuIChcbiAgICAgICEhZGVmYXVsdENvbHVtbnMuX0RlZmF1bHRbZmllbGROYW1lXSB8fFxuICAgICAgISEoZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXSAmJiBkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdW2ZpZWxkTmFtZV0pXG4gICAgKTtcbiAgfVxuXG4gIGlzUHJvdGVjdGVkSW5kZXgoY2xhc3NOYW1lOiBzdHJpbmcsIGluZGV4TmFtZTogc3RyaW5nKSB7XG4gICAgY29uc3QgaW5kZXhlcyA9IFsnX2lkXyddO1xuICAgIHN3aXRjaCAoY2xhc3NOYW1lKSB7XG4gICAgICBjYXNlICdfVXNlcic6XG4gICAgICAgIGluZGV4ZXMucHVzaChcbiAgICAgICAgICAnY2FzZV9pbnNlbnNpdGl2ZV91c2VybmFtZScsXG4gICAgICAgICAgJ2Nhc2VfaW5zZW5zaXRpdmVfZW1haWwnLFxuICAgICAgICAgICd1c2VybmFtZV8xJyxcbiAgICAgICAgICAnZW1haWxfMSdcbiAgICAgICAgKTtcbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdfUm9sZSc6XG4gICAgICAgIGluZGV4ZXMucHVzaCgnbmFtZV8xJyk7XG4gICAgICAgIGJyZWFrO1xuXG4gICAgICBjYXNlICdfSWRlbXBvdGVuY3knOlxuICAgICAgICBpbmRleGVzLnB1c2goJ3JlcUlkXzEnKTtcbiAgICAgICAgYnJlYWs7XG4gICAgfVxuXG4gICAgcmV0dXJuIGluZGV4ZXMuaW5kZXhPZihpbmRleE5hbWUpICE9PSAtMTtcbiAgfVxuXG4gIHBhcmFtc0FyZUVxdWFsczxUOiB7IFtrZXk6IHN0cmluZ106IGFueSB9PihvYmpBOiBULCBvYmpCOiBUKSB7XG4gICAgY29uc3Qga2V5c0E6IHN0cmluZ1tdID0gT2JqZWN0LmtleXMob2JqQSk7XG4gICAgY29uc3Qga2V5c0I6IHN0cmluZ1tdID0gT2JqZWN0LmtleXMob2JqQik7XG5cbiAgICAvLyBDaGVjayBrZXkgbmFtZVxuICAgIGlmIChrZXlzQS5sZW5ndGggIT09IGtleXNCLmxlbmd0aCkgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiBrZXlzQS5ldmVyeShrID0+IG9iakFba10gPT09IG9iakJba10pO1xuICB9XG5cbiAgaGFuZGxlRmllbGRzKG5ld0xvY2FsU2NoZW1hOiBQYXJzZS5TY2hlbWEsIGZpZWxkTmFtZTogc3RyaW5nLCBmaWVsZDogTWlncmF0aW9ucy5GaWVsZFR5cGUpIHtcbiAgICBpZiAoZmllbGQudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgbmV3TG9jYWxTY2hlbWEuYWRkUmVsYXRpb24oZmllbGROYW1lLCBmaWVsZC50YXJnZXRDbGFzcyk7XG4gICAgfSBlbHNlIGlmIChmaWVsZC50eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgIG5ld0xvY2FsU2NoZW1hLmFkZFBvaW50ZXIoZmllbGROYW1lLCBmaWVsZC50YXJnZXRDbGFzcywgZmllbGQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBuZXdMb2NhbFNjaGVtYS5hZGRGaWVsZChmaWVsZE5hbWUsIGZpZWxkLnR5cGUsIGZpZWxkKTtcbiAgICB9XG4gIH1cbn1c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