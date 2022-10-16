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

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) { symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); } keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

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
  } // Simulate update like the SDK
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
      } // Hack to force session schema to be created


      await this.createDeleteSession();
      this.allCloudSchemas = await Parse.Schema.all();
      clearTimeout(timeout);
      await Promise.all(this.localSchemas.map(async localSchema => this.saveOrUpdate(localSchema)));
      this.checkForMissingSchemas();
      await this.enforceCLPForNonProvidedClass();
    } catch (e) {
      if (timeout) clearTimeout(timeout);

      if (this.retries < this.maxRetries) {
        this.retries++; // first retry 1sec, 2sec, 3sec total 6sec retry sequence
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
  } // Required for testing purpose


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
  } // Create a fake session since Parse do not create the _Session until
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
    } // Handle indexes


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
    const newLocalSchema = new Parse.Schema(localSchema.className); // Handle fields
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
    const fieldsWithChangedParams = []; // Check deletion

    Object.keys(cloudSchema.fields).filter(fieldName => !this.isProtectedFields(localSchema.className, fieldName)).forEach(fieldName => {
      const field = cloudSchema.fields[fieldName];

      if (!localSchema.fields || !localSchema.fields[fieldName]) {
        fieldsToDelete.push(fieldName);
        return;
      }

      const localField = localSchema.fields[fieldName]; // Check if field has a changed type

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
      } // Check if something changed other than the type (like required, defaultValue)


      if (!this.paramsAreEquals(field, localField)) {
        fieldsWithChangedParams.push(fieldName);
      }
    });

    if (this.schemaOptions.deleteExtraFields === true) {
      fieldsToDelete.forEach(fieldName => {
        newLocalSchema.deleteField(fieldName);
      }); // Delete fields from the schema then apply changes

      await this.updateSchemaToDB(newLocalSchema);
    } else if (this.schemaOptions.strict === true && fieldsToDelete.length) {
      _logger.logger.warn(`The following fields exist in the database for "${localSchema.className}", but are missing in the schema : "${fieldsToDelete.join('" ,"')}"`);
    }

    if (this.schemaOptions.recreateModifiedFields === true) {
      fieldsToRecreate.forEach(field => {
        newLocalSchema.deleteField(field.fieldName);
      }); // Delete fields from the schema then apply changes

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
    }); // Handle Indexes
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

    const indexesToAdd = []; // Check deletion

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

    this.handleCLP(localSchema, newLocalSchema, cloudSchema); // Apply changes

    await this.updateSchemaToDB(newLocalSchema); // Apply new/changed indexes

    if (indexesToAdd.length) {
      _logger.logger.debug(`Updating indexes for "${newLocalSchema.className}" :  ${indexesToAdd.join(' ,')}`);

      indexesToAdd.forEach(o => newLocalSchema.addIndex(o.indexName, o.index));
      await this.updateSchemaToDB(newLocalSchema);
    }
  }

  handleCLP(localSchema, newLocalSchema, cloudSchema) {
    if (!localSchema.classLevelPermissions && !cloudSchema) {
      _logger.logger.warn(`classLevelPermissions not provided for ${localSchema.className}.`);
    } // Use spread to avoid read only issue (encountered by Moumouls using directAccess)


    const clp = _objectSpread({}, localSchema.classLevelPermissions) || {}; // To avoid inconsistency we need to remove all rights on addField

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
    const keysB = Object.keys(objB); // Check key name

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9TY2hlbWFNaWdyYXRpb25zL0RlZmluZWRTY2hlbWFzLmpzIl0sIm5hbWVzIjpbIlBhcnNlIiwicmVxdWlyZSIsIkRlZmluZWRTY2hlbWFzIiwiY29uc3RydWN0b3IiLCJzY2hlbWFPcHRpb25zIiwiY29uZmlnIiwibG9jYWxTY2hlbWFzIiwiQ29uZmlnIiwiZ2V0IiwiYXBwSWQiLCJkZWZpbml0aW9ucyIsIkFycmF5IiwiaXNBcnJheSIsInJldHJpZXMiLCJtYXhSZXRyaWVzIiwic2F2ZVNjaGVtYVRvREIiLCJzY2hlbWEiLCJwYXlsb2FkIiwiY2xhc3NOYW1lIiwiZmllbGRzIiwiX2ZpZWxkcyIsImluZGV4ZXMiLCJfaW5kZXhlcyIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsIl9jbHAiLCJyZXNldFNjaGVtYU9wcyIsInVwZGF0ZVNjaGVtYVRvREIiLCJleGVjdXRlIiwibG9nZ2VyIiwiaW5mbyIsImJlZm9yZU1pZ3JhdGlvbiIsIlByb21pc2UiLCJyZXNvbHZlIiwiZXhlY3V0ZU1pZ3JhdGlvbnMiLCJhZnRlck1pZ3JhdGlvbiIsImUiLCJlcnJvciIsInByb2Nlc3MiLCJlbnYiLCJOT0RFX0VOViIsImV4aXQiLCJ0aW1lb3V0Iiwic2V0VGltZW91dCIsImNyZWF0ZURlbGV0ZVNlc3Npb24iLCJhbGxDbG91ZFNjaGVtYXMiLCJTY2hlbWEiLCJhbGwiLCJjbGVhclRpbWVvdXQiLCJtYXAiLCJsb2NhbFNjaGVtYSIsInNhdmVPclVwZGF0ZSIsImNoZWNrRm9yTWlzc2luZ1NjaGVtYXMiLCJlbmZvcmNlQ0xQRm9yTm9uUHJvdmlkZWRDbGFzcyIsIndhaXQiLCJzdHJpY3QiLCJjbG91ZFNjaGVtYXMiLCJzIiwibWlzc2luZ1NjaGVtYXMiLCJmaWx0ZXIiLCJjIiwiaW5jbHVkZXMiLCJzeXN0ZW1DbGFzc2VzIiwiU2V0Iiwic2l6ZSIsImxlbmd0aCIsImpvaW4iLCJ3YXJuIiwidGltZSIsIm5vblByb3ZpZGVkQ2xhc3NlcyIsImNsb3VkU2NoZW1hIiwic29tZSIsInBhcnNlU2NoZW1hIiwiaGFuZGxlQ0xQIiwic2Vzc2lvbiIsIlNlc3Npb24iLCJzYXZlIiwidXNlTWFzdGVyS2V5IiwiZGVzdHJveSIsImZpbmQiLCJzYyIsInVwZGF0ZVNjaGVtYSIsInNhdmVTY2hlbWEiLCJuZXdMb2NhbFNjaGVtYSIsIk9iamVjdCIsImtleXMiLCJmaWVsZE5hbWUiLCJpc1Byb3RlY3RlZEZpZWxkcyIsImZvckVhY2giLCJmaWVsZCIsImhhbmRsZUZpZWxkcyIsImluZGV4TmFtZSIsImlzUHJvdGVjdGVkSW5kZXgiLCJhZGRJbmRleCIsImZpZWxkc1RvRGVsZXRlIiwiZmllbGRzVG9SZWNyZWF0ZSIsImZpZWxkc1dpdGhDaGFuZ2VkUGFyYW1zIiwicHVzaCIsImxvY2FsRmllbGQiLCJwYXJhbXNBcmVFcXVhbHMiLCJ0eXBlIiwidGFyZ2V0Q2xhc3MiLCJmcm9tIiwidG8iLCJkZWxldGVFeHRyYUZpZWxkcyIsImRlbGV0ZUZpZWxkIiwicmVjcmVhdGVNb2RpZmllZEZpZWxkcyIsImZpZWxkSW5mbyIsImluZGV4ZXNUb0FkZCIsImRlbGV0ZUluZGV4IiwiaW5kZXgiLCJkZWJ1ZyIsIm8iLCJjbHAiLCJhZGRGaWVsZCIsInNldENMUCIsImRlZmF1bHRDb2x1bW5zIiwiX0RlZmF1bHQiLCJpbmRleE9mIiwib2JqQSIsIm9iakIiLCJrZXlzQSIsImtleXNCIiwiZXZlcnkiLCJrIiwiYWRkUmVsYXRpb24iLCJhZGRQb2ludGVyIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBR0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7O0FBUEE7QUFDQSxNQUFNQSxLQUFLLEdBQUdDLE9BQU8sQ0FBQyxZQUFELENBQXJCOztBQVFPLE1BQU1DLGNBQU4sQ0FBcUI7QUFRMUJDLEVBQUFBLFdBQVcsQ0FBQ0MsYUFBRCxFQUEwQ0MsTUFBMUMsRUFBc0U7QUFDL0UsU0FBS0MsWUFBTCxHQUFvQixFQUFwQjtBQUNBLFNBQUtELE1BQUwsR0FBY0UsZ0JBQU9D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RUFBQUEsZUFBZSxDQUE0Qm9CLElBQTVCLEVBQXFDQyxJQUFyQyxFQUE4QztBQUMzRCxVQUFNQyxLQUFlLEdBQUdyQyxNQUFNLENBQUNDLElBQVAsQ0FBWWtDLElBQVosQ0FBeEI7QUFDQSxVQUFNRyxLQUFlLEdBQUd0QyxNQUFNLENBQUNDLElBQVAsQ0FBWW1DLElBQVosQ0FBeEIsQ0FGMkQsQ0FJM0Q7O0FBQ0EsUUFBSUMsS0FBSyxDQUFDeEQsTUFBTixLQUFpQnlELEtBQUssQ0FBQ3pELE1BQTNCLEVBQW1DLE9BQU8sS0FBUDtBQUNuQyxXQUFPd0QsS0FBSyxDQUFDRSxLQUFOLENBQVlDLENBQUMsSUFBSUwsSUFBSSxDQUFDSyxDQUFELENBQUosS0FBWUosSUFBSSxDQUFDSSxDQUFELENBQWpDLENBQVA7QUFDRDs7QUFFRGxDLEVBQUFBLFlBQVksQ0FBQ1AsY0FBRCxFQUErQkcsU0FBL0IsRUFBa0RHLEtBQWxELEVBQStFO0FBQ3pGLFFBQUlBLEtBQUssQ0FBQ1csSUFBTixLQUFlLFVBQW5CLEVBQStCO0FBQzdCakIsTUFBQUEsY0FBYyxDQUFDMEMsV0FBZixDQUEyQnZDLFNBQTNCLEVBQXNDRyxLQUFLLENBQUNZLFdBQTVDO0FBQ0QsS0FGRCxNQUVPLElBQUlaLEtBQUssQ0FBQ1csSUFBTixLQUFlLFNBQW5CLEVBQThCO0FBQ25DakIsTUFBQUEsY0FBYyxDQUFDMkMsVUFBZixDQUEwQnhDLFNBQTFCLEVBQXFDRyxLQUFLLENBQUNZLFdBQTNDLEVBQXdEWixLQUF4RDtBQUNELEtBRk0sTUFFQTtBQUNMTixNQUFBQSxjQUFjLENBQUMrQixRQUFmLENBQXdCNUIsU0FBeEIsRUFBbUNHLEtBQUssQ0FBQ1csSUFBekMsRUFBK0NYLEtBQS9DO0FBQ0Q7QUFDRjs7QUE5YXlCIiwic291cmNlc0NvbnRlbnQiOlsiLy8gQGZsb3dcbi8vIEBmbG93LWRpc2FibGUtbmV4dCBDYW5ub3QgcmVzb2x2ZSBtb2R1bGUgYHBhcnNlL25vZGVgLlxuY29uc3QgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJyk7XG5pbXBvcnQgeyBsb2dnZXIgfSBmcm9tICcuLi9sb2dnZXInO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuaW1wb3J0IHsgaW50ZXJuYWxDcmVhdGVTY2hlbWEsIGludGVybmFsVXBkYXRlU2NoZW1hIH0gZnJvbSAnLi4vUm91dGVycy9TY2hlbWFzUm91dGVyJztcbmltcG9ydCB7IGRlZmF1bHRDb2x1bW5zLCBzeXN0ZW1DbGFzc2VzIH0gZnJvbSAnLi4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcic7XG5pbXBvcnQgeyBQYXJzZVNlcnZlck9wdGlvbnMgfSBmcm9tICcuLi9PcHRpb25zJztcbmltcG9ydCAqIGFzIE1pZ3JhdGlvbnMgZnJvbSAnLi9NaWdyYXRpb25zJztcblxuZXhwb3J0IGNsYXNzIERlZmluZWRTY2hlbWFzIHtcbiAgY29uZmlnOiBQYXJzZVNlcnZlck9wdGlvbnM7XG4gIHNjaGVtYU9wdGlvbnM6IE1pZ3JhdGlvbnMuU2NoZW1hT3B0aW9ucztcbiAgbG9jYWxTY2hlbWFzOiBNaWdyYXRpb25zLkpTT05TY2hlbWFbXTtcbiAgcmV0cmllczogbnVtYmVyO1xuICBtYXhSZXRyaWVzOiBudW1iZXI7XG4gIGFsbENsb3VkU2NoZW1hczogUGFyc2UuU2NoZW1hW107XG5cbiAgY29uc3RydWN0b3Ioc2NoZW1hT3B0aW9uczogTWlncmF0aW9ucy5TY2hlbWFPcHRpb25zLCBjb25maWc6IFBhcnNlU2VydmVyT3B0aW9ucykge1xuICAgIHRoaXMubG9jYWxTY2hlbWFzID0gW107XG4gICAgdGhpcy5jb25maWcgPSBDb25maWcuZ2V0KGNvbmZpZy5hcHBJZCk7XG4gICAgdGhpcy5zY2hlbWFPcHRpb25zID0gc2NoZW1hT3B0aW9ucztcbiAgICBpZiAoc2NoZW1hT3B0aW9ucyAmJiBzY2hlbWFPcHRpb25zLmRlZmluaXRpb25zKSB7XG4gICAgICBpZiAoIUFycmF5LmlzQXJyYXkoc2NoZW1hT3B0aW9ucy5kZWZpbml0aW9ucykpIHtcbiAgICAgICAgdGhyb3cgYFwic2NoZW1hLmRlZmluaXRpb25zXCIgbXVzdCBiZSBhbiBhcnJheSBvZiBzY2hlbWFzYDtcbiAgICAgIH1cblxuICAgICAgdGhpcy5sb2NhbFNjaGVtYXMgPSBzY2hlbWFPcHRpb25zLmRlZmluaXRpb25zO1xuICAgIH1cblxuICAgIHRoaXMucmV0cmllcyA9IDA7XG4gICAgdGhpcy5tYXhSZXRyaWVzID0gMztcbiAgfVxuXG4gIGFzeW5jIHNhdmVTY2hlbWFUb0RCKHNjaGVtYTogUGFyc2UuU2NoZW1hKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3QgcGF5bG9hZCA9IHtcbiAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmNsYXNzTmFtZSxcbiAgICAgIGZpZWxkczogc2NoZW1hLl9maWVsZHMsXG4gICAgICBpbmRleGVzOiBzY2hlbWEuX2luZGV4ZXMsXG4gICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHNjaGVtYS5fY2xwLFxuICAgIH07XG4gICAgYXdhaXQgaW50ZXJuYWxDcmVhdGVTY2hlbWEoc2NoZW1hLmNsYXNzTmFtZSwgcGF5bG9hZCwgdGhpcy5jb25maWcpO1xuICAgIHRoaXMucmVzZXRTY2hlbWFPcHMoc2NoZW1hKTtcbiAgfVxuXG4gIHJlc2V0U2NoZW1hT3BzKHNjaGVtYTogUGFyc2UuU2NoZW1hKSB7XG4gICAgLy8gUmVzZXQgb3BzIGxpa2UgU0RLXG4gICAgc2NoZW1hLl9maWVsZHMgPSB7fTtcbiAgICBzY2hlbWEuX2luZGV4ZXMgPSB7fTtcbiAgfVxuXG4gIC8vIFNpbXVsYXRlIHVwZGF0ZSBsaWtlIHRoZSBTREtcbiAgLy8gV2UgY2Fubm90IHVzZSBTREsgc2luY2Ugcm91dGVzIGFyZSBkaXNhYmxlZFxuICBhc3luYyB1cGRhdGVTY2hlbWFUb0RCKHNjaGVtYTogUGFyc2UuU2NoZW1hKSB7XG4gICAgY29uc3QgcGF5bG9hZCA9IHtcbiAgICAgIGNsYXNzTmFtZTogc2NoZW1hLmNsYXNzTmFtZSxcbiAgICAgIGZpZWxkczogc2NoZW1hLl9maWVsZHMsXG4gICAgICBpbmRleGVzOiBzY2hlbWEuX2luZGV4ZXMsXG4gICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHNjaGVtYS5fY2xwLFxuICAgIH07XG4gICAgYXdhaXQgaW50ZXJuYWxVcGRhdGVTY2hlbWEoc2NoZW1hLmNsYXNzTmFtZSwgcGF5bG9hZCwgdGhpcy5jb25maWcpO1xuICAgIHRoaXMucmVzZXRTY2hlbWFPcHMoc2NoZW1hKTtcbiAgfVxuXG4gIGFzeW5jIGV4ZWN1dGUoKSB7XG4gICAgdHJ5IHtcbiAgICAgIGxvZ2dlci5pbmZvKCdSdW5uaW5nIE1pZ3JhdGlvbnMnKTtcbiAgICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMgJiYgdGhpcy5zY2hlbWFPcHRpb25zLmJlZm9yZU1pZ3JhdGlvbikge1xuICAgICAgICBhd2FpdCBQcm9taXNlLnJlc29sdmUodGhpcy5zY2hlbWFPcHRpb25zLmJlZm9yZU1pZ3JhdGlvbigpKTtcbiAgICAgIH1cblxuICAgICAgYXdhaXQgdGhpcy5leGVjdXRlTWlncmF0aW9ucygpO1xuXG4gICAgICBpZiAodGhpcy5zY2hlbWFPcHRpb25zICYmIHRoaXMuc2NoZW1hT3B0aW9ucy5hZnRlck1pZ3JhdGlvbikge1xuICAgICAgICBhd2FpdCBQcm9taXNlLnJlc29sdmUodGhpcy5zY2hlbWFPcHRpb25zLmFmdGVyTWlncmF0aW9uKCkpO1xuICAgICAgfVxuXG4gICAgICBsb2dnZXIuaW5mbygnUnVubmluZyBNaWdyYXRpb25zIENvbXBsZXRlZCcpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGxvZ2dlci5lcnJvcihgRmFpbGVkIHRvIHJ1biBtaWdyYXRpb25zOiAke2V9YCk7XG4gICAgICBpZiAocHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09ICdwcm9kdWN0aW9uJykgcHJvY2Vzcy5leGl0KDEpO1xuICAgIH1cbiAgfVxuXG4gIGFzeW5jIGV4ZWN1dGVNaWdyYXRpb25zKCkge1xuICAgIGxldCB0aW1lb3V0ID0gbnVsbDtcbiAgICB0cnkge1xuICAgICAgLy8gU2V0IHVwIGEgdGltZSBvdXQgaW4gcHJvZHVjdGlvblxuICAgICAgLy8gaWYgd2UgZmFpbCB0byBnZXQgc2NoZW1hXG4gICAgICAvLyBwbTIgb3IgSzhzIGFuZCBtYW55IG90aGVyIHByb2Nlc3MgbWFuYWdlcnMgd2lsbCB0cnkgdG8gcmVzdGFydCB0aGUgcHJvY2Vzc1xuICAgICAgLy8gYWZ0ZXIgdGhlIGV4aXRcbiAgICAgIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ3Byb2R1Y3Rpb24nKSB7XG4gICAgICAgIHRpbWVvdXQgPSBzZXRUaW1lb3V0KCgpID0+IHtcbiAgICAgICAgICBsb2dnZXIuZXJyb3IoJ1RpbWVvdXQgb2NjdXJyZWQgZHVyaW5nIGV4ZWN1dGlvbiBvZiBtaWdyYXRpb25zLiBFeGl0aW5nLi4uJyk7XG4gICAgICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgICB9LCAyMDAwMCk7XG4gICAgICB9XG5cbiAgICAgIC8vIEhhY2sgdG8gZm9yY2Ugc2Vzc2lvbiBzY2hlbWEgdG8gYmUgY3JlYXRlZFxuICAgICAgYXdhaXQgdGhpcy5jcmVhdGVEZWxldGVTZXNzaW9uKCk7XG4gICAgICB0aGlzLmFsbENsb3VkU2NoZW1hcyA9IGF3YWl0IFBhcnNlLlNjaGVtYS5hbGwoKTtcbiAgICAgIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgIGF3YWl0IFByb21pc2UuYWxsKHRoaXMubG9jYWxTY2hlbWFzLm1hcChhc3luYyBsb2NhbFNjaGVtYSA9PiB0aGlzLnNhdmVPclVwZGF0ZShsb2NhbFNjaGVtYSkpKTtcblxuICAgICAgdGhpcy5jaGVja0Zvck1pc3NpbmdTY2hlbWFzKCk7XG4gICAgICBhd2FpdCB0aGlzLmVuZm9yY2VDTFBGb3JOb25Qcm92aWRlZENsYXNzKCk7XG4gICAgfSBjYXRjaCAoZSkge1xuICAgICAgaWYgKHRpbWVvdXQpIGNsZWFyVGltZW91dCh0aW1lb3V0KTtcbiAgICAgIGlmICh0aGlzLnJldHJpZXMgPCB0aGlzLm1heFJldHJpZXMpIHtcbiAgICAgICAgdGhpcy5yZXRyaWVzKys7XG4gICAgICAgIC8vIGZpcnN0IHJldHJ5IDFzZWMsIDJzZWMsIDNzZWMgdG90YWwgNnNlYyByZXRyeSBzZXF1ZW5jZVxuICAgICAgICAvLyByZXRyeSB3aWxsIG9ubHkgaGFwcGVuIGluIGNhc2Ugb2YgZGVwbG95aW5nIG11bHRpIHBhcnNlIHNlcnZlciBpbnN0YW5jZVxuICAgICAgICAvLyBhdCB0aGUgc2FtZSB0aW1lLiBNb2Rlcm4gc3lzdGVtcyBsaWtlIGs4IGF2b2lkIHRoaXMgYnkgZG9pbmcgcm9sbGluZyB1cGRhdGVzXG4gICAgICAgIGF3YWl0IHRoaXMud2FpdCgxMDAwICogdGhpcy5yZXRyaWVzKTtcbiAgICAgICAgYXdhaXQgdGhpcy5leGVjdXRlTWlncmF0aW9ucygpO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgbG9nZ2VyLmVycm9yKGBGYWlsZWQgdG8gcnVuIG1pZ3JhdGlvbnM6ICR7ZX1gKTtcbiAgICAgICAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAncHJvZHVjdGlvbicpIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBjaGVja0Zvck1pc3NpbmdTY2hlbWFzKCkge1xuICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMuc3RyaWN0ICE9PSB0cnVlKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuXG4gICAgY29uc3QgY2xvdWRTY2hlbWFzID0gdGhpcy5hbGxDbG91ZFNjaGVtYXMubWFwKHMgPT4gcy5jbGFzc05hbWUpO1xuICAgIGNvbnN0IGxvY2FsU2NoZW1hcyA9IHRoaXMubG9jYWxTY2hlbWFzLm1hcChzID0+IHMuY2xhc3NOYW1lKTtcbiAgICBjb25zdCBtaXNzaW5nU2NoZW1hcyA9IGNsb3VkU2NoZW1hcy5maWx0ZXIoXG4gICAgICBjID0+ICFsb2NhbFNjaGVtYXMuaW5jbHVkZXMoYykgJiYgIXN5c3RlbUNsYXNzZXMuaW5jbHVkZXMoYylcbiAgICApO1xuXG4gICAgaWYgKG5ldyBTZXQobG9jYWxTY2hlbWFzKS5zaXplICE9PSBsb2NhbFNjaGVtYXMubGVuZ3RoKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoXG4gICAgICAgIGBUaGUgbGlzdCBvZiBzY2hlbWFzIHByb3ZpZGVkIGNvbnRhaW5zIGR1cGxpY2F0ZWQgXCJjbGFzc05hbWVcIiAgXCIke2xvY2FsU2NoZW1hcy5qb2luKFxuICAgICAgICAgICdcIixcIidcbiAgICAgICAgKX1cImBcbiAgICAgICk7XG4gICAgICBwcm9jZXNzLmV4aXQoMSk7XG4gICAgfVxuXG4gICAgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucy5zdHJpY3QgJiYgbWlzc2luZ1NjaGVtYXMubGVuZ3RoKSB7XG4gICAgICBsb2dnZXIud2FybihcbiAgICAgICAgYFRoZSBmb2xsb3dpbmcgc2NoZW1hcyBhcmUgY3VycmVudGx5IHByZXNlbnQgaW4gdGhlIGRhdGFiYXNlLCBidXQgbm90IGV4cGxpY2l0bHkgZGVmaW5lZCBpbiBhIHNjaGVtYTogXCIke21pc3NpbmdTY2hlbWFzLmpvaW4oXG4gICAgICAgICAgJ1wiLCBcIidcbiAgICAgICAgKX1cImBcbiAgICAgICk7XG4gICAgfVxuICB9XG5cbiAgLy8gUmVxdWlyZWQgZm9yIHRlc3RpbmcgcHVycG9zZVxuICB3YWl0KHRpbWU6IG51bWJlcikge1xuICAgIHJldHVybiBuZXcgUHJvbWlzZTx2b2lkPihyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgdGltZSkpO1xuICB9XG5cbiAgYXN5bmMgZW5mb3JjZUNMUEZvck5vblByb3ZpZGVkQ2xhc3MoKTogUHJvbWlzZTx2b2lkPiB7XG4gICAgY29uc3Qgbm9uUHJvdmlkZWRDbGFzc2VzID0gdGhpcy5hbGxDbG91ZFNjaGVtYXMuZmlsdGVyKFxuICAgICAgY2xvdWRTY2hlbWEgPT5cbiAgICAgICAgIXRoaXMubG9jYWxTY2hlbWFzLnNvbWUobG9jYWxTY2hlbWEgPT4gbG9jYWxTY2hlbWEuY2xhc3NOYW1lID09PSBjbG91ZFNjaGVtYS5jbGFzc05hbWUpXG4gICAgKTtcbiAgICBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgIG5vblByb3ZpZGVkQ2xhc3Nlcy5tYXAoYXN5bmMgc2NoZW1hID0+IHtcbiAgICAgICAgY29uc3QgcGFyc2VTY2hlbWEgPSBuZXcgUGFyc2UuU2NoZW1hKHNjaGVtYS5jbGFzc05hbWUpO1xuICAgICAgICB0aGlzLmhhbmRsZUNMUChzY2hlbWEsIHBhcnNlU2NoZW1hKTtcbiAgICAgICAgYXdhaXQgdGhpcy51cGRhdGVTY2hlbWFUb0RCKHBhcnNlU2NoZW1hKTtcbiAgICAgIH0pXG4gICAgKTtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIGZha2Ugc2Vzc2lvbiBzaW5jZSBQYXJzZSBkbyBub3QgY3JlYXRlIHRoZSBfU2Vzc2lvbiB1bnRpbFxuICAvLyBhIHNlc3Npb24gaXMgY3JlYXRlZFxuICBhc3luYyBjcmVhdGVEZWxldGVTZXNzaW9uKCkge1xuICAgIGNvbnN0IHNlc3Npb24gPSBuZXcgUGFyc2UuU2Vzc2lvbigpO1xuICAgIGF3YWl0IHNlc3Npb24uc2F2ZShudWxsLCB7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgICBhd2FpdCBzZXNzaW9uLmRlc3Ryb3koeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIH1cblxuICBhc3luYyBzYXZlT3JVcGRhdGUobG9jYWxTY2hlbWE6IE1pZ3JhdGlvbnMuSlNPTlNjaGVtYSkge1xuICAgIGNvbnN0IGNsb3VkU2NoZW1hID0gdGhpcy5hbGxDbG91ZFNjaGVtYXMuZmluZChzYyA9PiBzYy5jbGFzc05hbWUgPT09IGxvY2FsU2NoZW1hLmNsYXNzTmFtZSk7XG4gICAgaWYgKGNsb3VkU2NoZW1hKSB7XG4gICAgICB0cnkge1xuICAgICAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYShsb2NhbFNjaGVtYSwgY2xvdWRTY2hlbWEpO1xuICAgICAgfSBjYXRjaCAoZSkge1xuICAgICAgICB0aHJvdyBgRXJyb3IgZHVyaW5nIHVwZGF0ZSBvZiBzY2hlbWEgZm9yIHR5cGUgJHtjbG91ZFNjaGVtYS5jbGFzc05hbWV9OiAke2V9YDtcbiAgICAgIH1cbiAgICB9IGVsc2Uge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy5zYXZlU2NoZW1hKGxvY2FsU2NoZW1hKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgdGhyb3cgYEVycm9yIHdoaWxlIHNhdmluZyBTY2hlbWEgZm9yIHR5cGUgJHtsb2NhbFNjaGVtYS5jbGFzc05hbWV9OiAke2V9YDtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICBhc3luYyBzYXZlU2NoZW1hKGxvY2FsU2NoZW1hOiBNaWdyYXRpb25zLkpTT05TY2hlbWEpIHtcbiAgICBjb25zdCBuZXdMb2NhbFNjaGVtYSA9IG5ldyBQYXJzZS5TY2hlbWEobG9jYWxTY2hlbWEuY2xhc3NOYW1lKTtcbiAgICBpZiAobG9jYWxTY2hlbWEuZmllbGRzKSB7XG4gICAgICAvLyBIYW5kbGUgZmllbGRzXG4gICAgICBPYmplY3Qua2V5cyhsb2NhbFNjaGVtYS5maWVsZHMpXG4gICAgICAgIC5maWx0ZXIoZmllbGROYW1lID0+ICF0aGlzLmlzUHJvdGVjdGVkRmllbGRzKGxvY2FsU2NoZW1hLmNsYXNzTmFtZSwgZmllbGROYW1lKSlcbiAgICAgICAgLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICBpZiAobG9jYWxTY2hlbWEuZmllbGRzKSB7XG4gICAgICAgICAgICBjb25zdCBmaWVsZCA9IGxvY2FsU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgICAgdGhpcy5oYW5kbGVGaWVsZHMobmV3TG9jYWxTY2hlbWEsIGZpZWxkTmFtZSwgZmllbGQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuICAgIC8vIEhhbmRsZSBpbmRleGVzXG4gICAgaWYgKGxvY2FsU2NoZW1hLmluZGV4ZXMpIHtcbiAgICAgIE9iamVjdC5rZXlzKGxvY2FsU2NoZW1hLmluZGV4ZXMpLmZvckVhY2goaW5kZXhOYW1lID0+IHtcbiAgICAgICAgaWYgKGxvY2FsU2NoZW1hLmluZGV4ZXMgJiYgIXRoaXMuaXNQcm90ZWN0ZWRJbmRleChsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGluZGV4TmFtZSkpIHtcbiAgICAgICAgICBuZXdMb2NhbFNjaGVtYS5hZGRJbmRleChpbmRleE5hbWUsIGxvY2FsU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHRoaXMuaGFuZGxlQ0xQKGxvY2FsU2NoZW1hLCBuZXdMb2NhbFNjaGVtYSk7XG5cbiAgICByZXR1cm4gYXdhaXQgdGhpcy5zYXZlU2NoZW1hVG9EQihuZXdMb2NhbFNjaGVtYSk7XG4gIH1cblxuICBhc3luYyB1cGRhdGVTY2hlbWEobG9jYWxTY2hlbWE6IE1pZ3JhdGlvbnMuSlNPTlNjaGVtYSwgY2xvdWRTY2hlbWE6IFBhcnNlLlNjaGVtYSkge1xuICAgIGNvbnN0IG5ld0xvY2FsU2NoZW1hID0gbmV3IFBhcnNlLlNjaGVtYShsb2NhbFNjaGVtYS5jbGFzc05hbWUpO1xuXG4gICAgLy8gSGFuZGxlIGZpZWxkc1xuICAgIC8vIENoZWNrIGFkZGl0aW9uXG4gICAgaWYgKGxvY2FsU2NoZW1hLmZpZWxkcykge1xuICAgICAgT2JqZWN0LmtleXMobG9jYWxTY2hlbWEuZmllbGRzKVxuICAgICAgICAuZmlsdGVyKGZpZWxkTmFtZSA9PiAhdGhpcy5pc1Byb3RlY3RlZEZpZWxkcyhsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGZpZWxkTmFtZSkpXG4gICAgICAgIC5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG4gICAgICAgICAgY29uc3QgZmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICBpZiAoIWNsb3VkU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB0aGlzLmhhbmRsZUZpZWxkcyhuZXdMb2NhbFNjaGVtYSwgZmllbGROYW1lLCBmaWVsZCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBmaWVsZHNUb0RlbGV0ZTogc3RyaW5nW10gPSBbXTtcbiAgICBjb25zdCBmaWVsZHNUb1JlY3JlYXRlOiB7XG4gICAgICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgICAgIGZyb206IHsgdHlwZTogc3RyaW5nLCB0YXJnZXRDbGFzcz86IHN0cmluZyB9LFxuICAgICAgdG86IHsgdHlwZTogc3RyaW5nLCB0YXJnZXRDbGFzcz86IHN0cmluZyB9LFxuICAgIH1bXSA9IFtdO1xuICAgIGNvbnN0IGZpZWxkc1dpdGhDaGFuZ2VkUGFyYW1zOiBzdHJpbmdbXSA9IFtdO1xuXG4gICAgLy8gQ2hlY2sgZGVsZXRpb25cbiAgICBPYmplY3Qua2V5cyhjbG91ZFNjaGVtYS5maWVsZHMpXG4gICAgICAuZmlsdGVyKGZpZWxkTmFtZSA9PiAhdGhpcy5pc1Byb3RlY3RlZEZpZWxkcyhsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGZpZWxkTmFtZSkpXG4gICAgICAuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICBjb25zdCBmaWVsZCA9IGNsb3VkU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICBpZiAoIWxvY2FsU2NoZW1hLmZpZWxkcyB8fCAhbG9jYWxTY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICBmaWVsZHNUb0RlbGV0ZS5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgY29uc3QgbG9jYWxGaWVsZCA9IGxvY2FsU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAvLyBDaGVjayBpZiBmaWVsZCBoYXMgYSBjaGFuZ2VkIHR5cGVcbiAgICAgICAgaWYgKFxuICAgICAgICAgICF0aGlzLnBhcmFtc0FyZUVxdWFscyhcbiAgICAgICAgICAgIHsgdHlwZTogZmllbGQudHlwZSwgdGFyZ2V0Q2xhc3M6IGZpZWxkLnRhcmdldENsYXNzIH0sXG4gICAgICAgICAgICB7IHR5cGU6IGxvY2FsRmllbGQudHlwZSwgdGFyZ2V0Q2xhc3M6IGxvY2FsRmllbGQudGFyZ2V0Q2xhc3MgfVxuICAgICAgICAgIClcbiAgICAgICAgKSB7XG4gICAgICAgICAgZmllbGRzVG9SZWNyZWF0ZS5wdXNoKHtcbiAgICAgICAgICAgIGZpZWxkTmFtZSxcbiAgICAgICAgICAgIGZyb206IHsgdHlwZTogZmllbGQudHlwZSwgdGFyZ2V0Q2xhc3M6IGZpZWxkLnRhcmdldENsYXNzIH0sXG4gICAgICAgICAgICB0bzogeyB0eXBlOiBsb2NhbEZpZWxkLnR5cGUsIHRhcmdldENsYXNzOiBsb2NhbEZpZWxkLnRhcmdldENsYXNzIH0sXG4gICAgICAgICAgfSk7XG4gICAgICAgICAgcmV0dXJuO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gQ2hlY2sgaWYgc29tZXRoaW5nIGNoYW5nZWQgb3RoZXIgdGhhbiB0aGUgdHlwZSAobGlrZSByZXF1aXJlZCwgZGVmYXVsdFZhbHVlKVxuICAgICAgICBpZiAoIXRoaXMucGFyYW1zQXJlRXF1YWxzKGZpZWxkLCBsb2NhbEZpZWxkKSkge1xuICAgICAgICAgIGZpZWxkc1dpdGhDaGFuZ2VkUGFyYW1zLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG5cbiAgICBpZiAodGhpcy5zY2hlbWFPcHRpb25zLmRlbGV0ZUV4dHJhRmllbGRzID09PSB0cnVlKSB7XG4gICAgICBmaWVsZHNUb0RlbGV0ZS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgIG5ld0xvY2FsU2NoZW1hLmRlbGV0ZUZpZWxkKGZpZWxkTmFtZSk7XG4gICAgICB9KTtcblxuICAgICAgLy8gRGVsZXRlIGZpZWxkcyBmcm9tIHRoZSBzY2hlbWEgdGhlbiBhcHBseSBjaGFuZ2VzXG4gICAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYVRvREIobmV3TG9jYWxTY2hlbWEpO1xuICAgIH0gZWxzZSBpZiAodGhpcy5zY2hlbWFPcHRpb25zLnN0cmljdCA9PT0gdHJ1ZSAmJiBmaWVsZHNUb0RlbGV0ZS5sZW5ndGgpIHtcbiAgICAgIGxvZ2dlci53YXJuKFxuICAgICAgICBgVGhlIGZvbGxvd2luZyBmaWVsZHMgZXhpc3QgaW4gdGhlIGRhdGFiYXNlIGZvciBcIiR7XG4gICAgICAgICAgbG9jYWxTY2hlbWEuY2xhc3NOYW1lXG4gICAgICAgIH1cIiwgYnV0IGFyZSBtaXNzaW5nIGluIHRoZSBzY2hlbWEgOiBcIiR7ZmllbGRzVG9EZWxldGUuam9pbignXCIgLFwiJyl9XCJgXG4gICAgICApO1xuICAgIH1cblxuICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMucmVjcmVhdGVNb2RpZmllZEZpZWxkcyA9PT0gdHJ1ZSkge1xuICAgICAgZmllbGRzVG9SZWNyZWF0ZS5mb3JFYWNoKGZpZWxkID0+IHtcbiAgICAgICAgbmV3TG9jYWxTY2hlbWEuZGVsZXRlRmllbGQoZmllbGQuZmllbGROYW1lKTtcbiAgICAgIH0pO1xuXG4gICAgICAvLyBEZWxldGUgZmllbGRzIGZyb20gdGhlIHNjaGVtYSB0aGVuIGFwcGx5IGNoYW5nZXNcbiAgICAgIGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hVG9EQihuZXdMb2NhbFNjaGVtYSk7XG5cbiAgICAgIGZpZWxkc1RvUmVjcmVhdGUuZm9yRWFjaChmaWVsZEluZm8gPT4ge1xuICAgICAgICBpZiAobG9jYWxTY2hlbWEuZmllbGRzKSB7XG4gICAgICAgICAgY29uc3QgZmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGRJbmZvLmZpZWxkTmFtZV07XG4gICAgICAgICAgdGhpcy5oYW5kbGVGaWVsZHMobmV3TG9jYWxTY2hlbWEsIGZpZWxkSW5mby5maWVsZE5hbWUsIGZpZWxkKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfSBlbHNlIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMuc3RyaWN0ID09PSB0cnVlICYmIGZpZWxkc1RvUmVjcmVhdGUubGVuZ3RoKSB7XG4gICAgICBmaWVsZHNUb1JlY3JlYXRlLmZvckVhY2goZmllbGQgPT4ge1xuICAgICAgICBjb25zdCBmcm9tID1cbiAgICAgICAgICBmaWVsZC5mcm9tLnR5cGUgKyAoZmllbGQuZnJvbS50YXJnZXRDbGFzcyA/IGAgKCR7ZmllbGQuZnJvbS50YXJnZXRDbGFzc30pYCA6ICcnKTtcbiAgICAgICAgY29uc3QgdG8gPSBmaWVsZC50by50eXBlICsgKGZpZWxkLnRvLnRhcmdldENsYXNzID8gYCAoJHtmaWVsZC50by50YXJnZXRDbGFzc30pYCA6ICcnKTtcblxuICAgICAgICBsb2dnZXIud2FybihcbiAgICAgICAgICBgVGhlIGZpZWxkIFwiJHtmaWVsZC5maWVsZE5hbWV9XCIgdHlwZSBkaWZmZXIgYmV0d2VlbiB0aGUgc2NoZW1hIGFuZCB0aGUgZGF0YWJhc2UgZm9yIFwiJHtsb2NhbFNjaGVtYS5jbGFzc05hbWV9XCI7IFNjaGVtYSBpcyBkZWZpbmVkIGFzIFwiJHt0b31cIiBhbmQgY3VycmVudCBkYXRhYmFzZSB0eXBlIGlzIFwiJHtmcm9tfVwiYFxuICAgICAgICApO1xuICAgICAgfSk7XG4gICAgfVxuXG4gICAgZmllbGRzV2l0aENoYW5nZWRQYXJhbXMuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKGxvY2FsU2NoZW1hLmZpZWxkcykge1xuICAgICAgICBjb25zdCBmaWVsZCA9IGxvY2FsU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICB0aGlzLmhhbmRsZUZpZWxkcyhuZXdMb2NhbFNjaGVtYSwgZmllbGROYW1lLCBmaWVsZCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICAvLyBIYW5kbGUgSW5kZXhlc1xuICAgIC8vIENoZWNrIGFkZGl0aW9uXG4gICAgaWYgKGxvY2FsU2NoZW1hLmluZGV4ZXMpIHtcbiAgICAgIE9iamVjdC5rZXlzKGxvY2FsU2NoZW1hLmluZGV4ZXMpLmZvckVhY2goaW5kZXhOYW1lID0+IHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgICghY2xvdWRTY2hlbWEuaW5kZXhlcyB8fCAhY2xvdWRTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdKSAmJlxuICAgICAgICAgICF0aGlzLmlzUHJvdGVjdGVkSW5kZXgobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBpbmRleE5hbWUpXG4gICAgICAgICkge1xuICAgICAgICAgIGlmIChsb2NhbFNjaGVtYS5pbmRleGVzKSB7XG4gICAgICAgICAgICBuZXdMb2NhbFNjaGVtYS5hZGRJbmRleChpbmRleE5hbWUsIGxvY2FsU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBpbmRleGVzVG9BZGQgPSBbXTtcblxuICAgIC8vIENoZWNrIGRlbGV0aW9uXG4gICAgaWYgKGNsb3VkU2NoZW1hLmluZGV4ZXMpIHtcbiAgICAgIE9iamVjdC5rZXlzKGNsb3VkU2NoZW1hLmluZGV4ZXMpLmZvckVhY2goaW5kZXhOYW1lID0+IHtcbiAgICAgICAgaWYgKCF0aGlzLmlzUHJvdGVjdGVkSW5kZXgobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBpbmRleE5hbWUpKSB7XG4gICAgICAgICAgaWYgKCFsb2NhbFNjaGVtYS5pbmRleGVzIHx8ICFsb2NhbFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0pIHtcbiAgICAgICAgICAgIG5ld0xvY2FsU2NoZW1hLmRlbGV0ZUluZGV4KGluZGV4TmFtZSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICAgICF0aGlzLnBhcmFtc0FyZUVxdWFscyhsb2NhbFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0sIGNsb3VkU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSlcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIG5ld0xvY2FsU2NoZW1hLmRlbGV0ZUluZGV4KGluZGV4TmFtZSk7XG4gICAgICAgICAgICBpZiAobG9jYWxTY2hlbWEuaW5kZXhlcykge1xuICAgICAgICAgICAgICBpbmRleGVzVG9BZGQucHVzaCh7XG4gICAgICAgICAgICAgICAgaW5kZXhOYW1lLFxuICAgICAgICAgICAgICAgIGluZGV4OiBsb2NhbFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0sXG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgfVxuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgdGhpcy5oYW5kbGVDTFAobG9jYWxTY2hlbWEsIG5ld0xvY2FsU2NoZW1hLCBjbG91ZFNjaGVtYSk7XG4gICAgLy8gQXBwbHkgY2hhbmdlc1xuICAgIGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hVG9EQihuZXdMb2NhbFNjaGVtYSk7XG4gICAgLy8gQXBwbHkgbmV3L2NoYW5nZWQgaW5kZXhlc1xuICAgIGlmIChpbmRleGVzVG9BZGQubGVuZ3RoKSB7XG4gICAgICBsb2dnZXIuZGVidWcoXG4gICAgICAgIGBVcGRhdGluZyBpbmRleGVzIGZvciBcIiR7bmV3TG9jYWxTY2hlbWEuY2xhc3NOYW1lfVwiIDogICR7aW5kZXhlc1RvQWRkLmpvaW4oJyAsJyl9YFxuICAgICAgKTtcbiAgICAgIGluZGV4ZXNUb0FkZC5mb3JFYWNoKG8gPT4gbmV3TG9jYWxTY2hlbWEuYWRkSW5kZXgoby5pbmRleE5hbWUsIG8uaW5kZXgpKTtcbiAgICAgIGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hVG9EQihuZXdMb2NhbFNjaGVtYSk7XG4gICAgfVxuICB9XG5cbiAgaGFuZGxlQ0xQKFxuICAgIGxvY2FsU2NoZW1hOiBNaWdyYXRpb25zLkpTT05TY2hlbWEsXG4gICAgbmV3TG9jYWxTY2hlbWE6IFBhcnNlLlNjaGVtYSxcbiAgICBjbG91ZFNjaGVtYTogUGFyc2UuU2NoZW1hXG4gICkge1xuICAgIGlmICghbG9jYWxTY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zICYmICFjbG91ZFNjaGVtYSkge1xuICAgICAgbG9nZ2VyLndhcm4oYGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyBub3QgcHJvdmlkZWQgZm9yICR7bG9jYWxTY2hlbWEuY2xhc3NOYW1lfS5gKTtcbiAgICB9XG4gICAgLy8gVXNlIHNwcmVhZCB0byBhdm9pZCByZWFkIG9ubHkgaXNzdWUgKGVuY291bnRlcmVkIGJ5IE1vdW1vdWxzIHVzaW5nIGRpcmVjdEFjY2VzcylcbiAgICBjb25zdCBjbHAgPSAoeyAuLi5sb2NhbFNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMgfSB8fCB7fTogUGFyc2UuQ0xQLlBlcm1pc3Npb25zTWFwKTtcbiAgICAvLyBUbyBhdm9pZCBpbmNvbnNpc3RlbmN5IHdlIG5lZWQgdG8gcmVtb3ZlIGFsbCByaWdodHMgb24gYWRkRmllbGRcbiAgICBjbHAuYWRkRmllbGQgPSB7fTtcbiAgICBuZXdMb2NhbFNjaGVtYS5zZXRDTFAoY2xwKTtcbiAgfVxuXG4gIGlzUHJvdGVjdGVkRmllbGRzKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZykge1xuICAgIHJldHVybiAoXG4gICAgICAhIWRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0W2ZpZWxkTmFtZV0gfHxcbiAgICAgICEhKGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV0gJiYgZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXVtmaWVsZE5hbWVdKVxuICAgICk7XG4gIH1cblxuICBpc1Byb3RlY3RlZEluZGV4KGNsYXNzTmFtZTogc3RyaW5nLCBpbmRleE5hbWU6IHN0cmluZykge1xuICAgIGNvbnN0IGluZGV4ZXMgPSBbJ19pZF8nXTtcbiAgICBzd2l0Y2ggKGNsYXNzTmFtZSkge1xuICAgICAgY2FzZSAnX1VzZXInOlxuICAgICAgICBpbmRleGVzLnB1c2goXG4gICAgICAgICAgJ2Nhc2VfaW5zZW5zaXRpdmVfdXNlcm5hbWUnLFxuICAgICAgICAgICdjYXNlX2luc2Vuc2l0aXZlX2VtYWlsJyxcbiAgICAgICAgICAndXNlcm5hbWVfMScsXG4gICAgICAgICAgJ2VtYWlsXzEnXG4gICAgICAgICk7XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnX1JvbGUnOlxuICAgICAgICBpbmRleGVzLnB1c2goJ25hbWVfMScpO1xuICAgICAgICBicmVhaztcblxuICAgICAgY2FzZSAnX0lkZW1wb3RlbmN5JzpcbiAgICAgICAgaW5kZXhlcy5wdXNoKCdyZXFJZF8xJyk7XG4gICAgICAgIGJyZWFrO1xuICAgIH1cblxuICAgIHJldHVybiBpbmRleGVzLmluZGV4T2YoaW5kZXhOYW1lKSAhPT0gLTE7XG4gIH1cblxuICBwYXJhbXNBcmVFcXVhbHM8VDogeyBba2V5OiBzdHJpbmddOiBhbnkgfT4ob2JqQTogVCwgb2JqQjogVCkge1xuICAgIGNvbnN0IGtleXNBOiBzdHJpbmdbXSA9IE9iamVjdC5rZXlzKG9iakEpO1xuICAgIGNvbnN0IGtleXNCOiBzdHJpbmdbXSA9IE9iamVjdC5rZXlzKG9iakIpO1xuXG4gICAgLy8gQ2hlY2sga2V5IG5hbWVcbiAgICBpZiAoa2V5c0EubGVuZ3RoICE9PSBrZXlzQi5sZW5ndGgpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4ga2V5c0EuZXZlcnkoayA9PiBvYmpBW2tdID09PSBvYmpCW2tdKTtcbiAgfVxuXG4gIGhhbmRsZUZpZWxkcyhuZXdMb2NhbFNjaGVtYTogUGFyc2UuU2NoZW1hLCBmaWVsZE5hbWU6IHN0cmluZywgZmllbGQ6IE1pZ3JhdGlvbnMuRmllbGRUeXBlKSB7XG4gICAgaWYgKGZpZWxkLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgIG5ld0xvY2FsU2NoZW1hLmFkZFJlbGF0aW9uKGZpZWxkTmFtZSwgZmllbGQudGFyZ2V0Q2xhc3MpO1xuICAgIH0gZWxzZSBpZiAoZmllbGQudHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICBuZXdMb2NhbFNjaGVtYS5hZGRQb2ludGVyKGZpZWxkTmFtZSwgZmllbGQudGFyZ2V0Q2xhc3MsIGZpZWxkKTtcbiAgICB9IGVsc2Uge1xuICAgICAgbmV3TG9jYWxTY2hlbWEuYWRkRmllbGQoZmllbGROYW1lLCBmaWVsZC50eXBlLCBmaWVsZCk7XG4gICAgfVxuICB9XG59XG4iXX0=