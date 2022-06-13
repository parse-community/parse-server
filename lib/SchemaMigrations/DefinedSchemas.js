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
    let indexes = ['_id_'];

    if (className === '_User') {
      indexes = [...indexes, 'case_insensitive_username', 'case_insensitive_email', 'username_1', 'email_1'];
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9TY2hlbWFNaWdyYXRpb25zL0RlZmluZWRTY2hlbWFzLmpzIl0sIm5hbWVzIjpbIlBhcnNlIiwicmVxdWlyZSIsIkRlZmluZWRTY2hlbWFzIiwiY29uc3RydWN0b3IiLCJzY2hlbWFPcHRpb25zIiwiY29uZmlnIiwibG9jYWxTY2hlbWFzIiwiQ29uZmlnIiwiZ2V0IiwiYXBwSWQiLCJkZWZpbml0aW9ucyIsIkFycmF5IiwiaXNBcnJheSIsInJldHJpZXMiLCJtYXhSZXRyaWVzIiwic2F2ZVNjaGVtYVRvREIiLCJzY2hlbWEiLCJwYXlsb2FkIiwiY2xhc3NOYW1lIiwiZmllbGRzIiwiX2ZpZWxkcyIsImluZGV4ZXMiLCJfaW5kZXhlcyIsImNsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsIl9jbHAiLCJyZXNldFNjaGVtYU9wcyIsInVwZGF0ZVNjaGVtYVRvREIiLCJleGVjdXRlIiwibG9nZ2VyIiwiaW5mbyIsImJlZm9yZU1pZ3JhdGlvbiIsIlByb21pc2UiLCJyZXNvbHZlIiwiZXhlY3V0ZU1pZ3JhdGlvbnMiLCJhZnRlck1pZ3JhdGlvbiIsImUiLCJlcnJvciIsInByb2Nlc3MiLCJlbnYiLCJOT0RFX0VOViIsImV4aXQiLCJ0aW1lb3V0Iiwic2V0VGltZW91dCIsImNyZWF0ZURlbGV0ZVNlc3Npb24iLCJhbGxDbG91ZFNjaGVtYXMiLCJTY2hlbWEiLCJhbGwiLCJjbGVhclRpbWVvdXQiLCJtYXAiLCJsb2NhbFNjaGVtYSIsInNhdmVPclVwZGF0ZSIsImNoZWNrRm9yTWlzc2luZ1NjaGVtYXMiLCJlbmZvcmNlQ0xQRm9yTm9uUHJvdmlkZWRDbGFzcyIsIndhaXQiLCJzdHJpY3QiLCJjbG91ZFNjaGVtYXMiLCJzIiwibWlzc2luZ1NjaGVtYXMiLCJmaWx0ZXIiLCJjIiwiaW5jbHVkZXMiLCJzeXN0ZW1DbGFzc2VzIiwiU2V0Iiwic2l6ZSIsImxlbmd0aCIsImpvaW4iLCJ3YXJuIiwidGltZSIsIm5vblByb3ZpZGVkQ2xhc3NlcyIsImNsb3VkU2NoZW1hIiwic29tZSIsInBhcnNlU2NoZW1hIiwiaGFuZGxlQ0xQIiwic2Vzc2lvbiIsIlNlc3Npb24iLCJzYXZlIiwidXNlTWFzdGVyS2V5IiwiZGVzdHJveSIsImZpbmQiLCJzYyIsInVwZGF0ZVNjaGVtYSIsInNhdmVTY2hlbWEiLCJuZXdMb2NhbFNjaGVtYSIsIk9iamVjdCIsImtleXMiLCJmaWVsZE5hbWUiLCJpc1Byb3RlY3RlZEZpZWxkcyIsImZvckVhY2giLCJmaWVsZCIsImhhbmRsZUZpZWxkcyIsImluZGV4TmFtZSIsImlzUHJvdGVjdGVkSW5kZXgiLCJhZGRJbmRleCIsImZpZWxkc1RvRGVsZXRlIiwiZmllbGRzVG9SZWNyZWF0ZSIsImZpZWxkc1dpdGhDaGFuZ2VkUGFyYW1zIiwicHVzaCIsImxvY2FsRmllbGQiLCJwYXJhbXNBcmVFcXVhbHMiLCJ0eXBlIiwidGFyZ2V0Q2xhc3MiLCJmcm9tIiwidG8iLCJkZWxldGVFeHRyYUZpZWxkcyIsImRlbGV0ZUZpZWxkIiwicmVjcmVhdGVNb2RpZmllZEZpZWxkcyIsImZpZWxkSW5mbyIsImluZGV4ZXNUb0FkZCIsImRlbGV0ZUluZGV4IiwiaW5kZXgiLCJkZWJ1ZyIsIm8iLCJjbHAiLCJhZGRGaWVsZCIsInNldENMUCIsImRlZmF1bHRDb2x1bW5zIiwiX0RlZmF1bHQiLCJpbmRleE9mIiwib2JqQSIsIm9iakIiLCJrZXlzQSIsImtleXNCIiwiZXZlcnkiLCJrIiwiYWRkUmVsYXRpb24iLCJhZGRQb2ludGVyIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBR0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7O0FBQ0E7Ozs7Ozs7Ozs7Ozs7O0FBUEE7QUFDQSxNQUFNQSxLQUFLLEdBQUdDLE9BQU8sQ0FBQyxZQUFELENBQXJCOztBQVFPLE1BQU1DLGNBQU4sQ0FBcUI7QUFRMUJDLEVBQUFBLFdBQVcsQ0FBQ0MsYUFBRCxFQUEwQ0MsTUFBMUMsRUFBc0U7QUFDL0UsU0FBS0MsWUFBTCxHQUFvQixFQUFwQjtBQUNBLFNBQUtELE1BQUwsR0FBY0UsZ0JBQU9D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S0FBZSxHQUFHdEMsTUFBTSxDQUFDQyxJQUFQLENBQVltQyxJQUFaLENBQXhCLENBRjJELENBSTNEOztBQUNBLFFBQUlDLEtBQUssQ0FBQ3hELE1BQU4sS0FBaUJ5RCxLQUFLLENBQUN6RCxNQUEzQixFQUFtQyxPQUFPLEtBQVA7QUFDbkMsV0FBT3dELEtBQUssQ0FBQ0UsS0FBTixDQUFZQyxDQUFDLElBQUlMLElBQUksQ0FBQ0ssQ0FBRCxDQUFKLEtBQVlKLElBQUksQ0FBQ0ksQ0FBRCxDQUFqQyxDQUFQO0FBQ0Q7O0FBRURsQyxFQUFBQSxZQUFZLENBQUNQLGNBQUQsRUFBK0JHLFNBQS9CLEVBQWtERyxLQUFsRCxFQUErRTtBQUN6RixRQUFJQSxLQUFLLENBQUNXLElBQU4sS0FBZSxVQUFuQixFQUErQjtBQUM3QmpCLE1BQUFBLGNBQWMsQ0FBQzBDLFdBQWYsQ0FBMkJ2QyxTQUEzQixFQUFzQ0csS0FBSyxDQUFDWSxXQUE1QztBQUNELEtBRkQsTUFFTyxJQUFJWixLQUFLLENBQUNXLElBQU4sS0FBZSxTQUFuQixFQUE4QjtBQUNuQ2pCLE1BQUFBLGNBQWMsQ0FBQzJDLFVBQWYsQ0FBMEJ4QyxTQUExQixFQUFxQ0csS0FBSyxDQUFDWSxXQUEzQyxFQUF3RFosS0FBeEQ7QUFDRCxLQUZNLE1BRUE7QUFDTE4sTUFBQUEsY0FBYyxDQUFDK0IsUUFBZixDQUF3QjVCLFNBQXhCLEVBQW1DRyxLQUFLLENBQUNXLElBQXpDLEVBQStDWCxLQUEvQztBQUNEO0FBQ0Y7O0FBdGF5QiIsInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG4vLyBAZmxvdy1kaXNhYmxlLW5leHQgQ2Fubm90IHJlc29sdmUgbW9kdWxlIGBwYXJzZS9ub2RlYC5cbmNvbnN0IFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcbmltcG9ydCB7IGludGVybmFsQ3JlYXRlU2NoZW1hLCBpbnRlcm5hbFVwZGF0ZVNjaGVtYSB9IGZyb20gJy4uL1JvdXRlcnMvU2NoZW1hc1JvdXRlcic7XG5pbXBvcnQgeyBkZWZhdWx0Q29sdW1ucywgc3lzdGVtQ2xhc3NlcyB9IGZyb20gJy4uL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXInO1xuaW1wb3J0IHsgUGFyc2VTZXJ2ZXJPcHRpb25zIH0gZnJvbSAnLi4vT3B0aW9ucyc7XG5pbXBvcnQgKiBhcyBNaWdyYXRpb25zIGZyb20gJy4vTWlncmF0aW9ucyc7XG5cbmV4cG9ydCBjbGFzcyBEZWZpbmVkU2NoZW1hcyB7XG4gIGNvbmZpZzogUGFyc2VTZXJ2ZXJPcHRpb25zO1xuICBzY2hlbWFPcHRpb25zOiBNaWdyYXRpb25zLlNjaGVtYU9wdGlvbnM7XG4gIGxvY2FsU2NoZW1hczogTWlncmF0aW9ucy5KU09OU2NoZW1hW107XG4gIHJldHJpZXM6IG51bWJlcjtcbiAgbWF4UmV0cmllczogbnVtYmVyO1xuICBhbGxDbG91ZFNjaGVtYXM6IFBhcnNlLlNjaGVtYVtdO1xuXG4gIGNvbnN0cnVjdG9yKHNjaGVtYU9wdGlvbnM6IE1pZ3JhdGlvbnMuU2NoZW1hT3B0aW9ucywgY29uZmlnOiBQYXJzZVNlcnZlck9wdGlvbnMpIHtcbiAgICB0aGlzLmxvY2FsU2NoZW1hcyA9IFtdO1xuICAgIHRoaXMuY29uZmlnID0gQ29uZmlnLmdldChjb25maWcuYXBwSWQpO1xuICAgIHRoaXMuc2NoZW1hT3B0aW9ucyA9IHNjaGVtYU9wdGlvbnM7XG4gICAgaWYgKHNjaGVtYU9wdGlvbnMgJiYgc2NoZW1hT3B0aW9ucy5kZWZpbml0aW9ucykge1xuICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHNjaGVtYU9wdGlvbnMuZGVmaW5pdGlvbnMpKSB7XG4gICAgICAgIHRocm93IGBcInNjaGVtYS5kZWZpbml0aW9uc1wiIG11c3QgYmUgYW4gYXJyYXkgb2Ygc2NoZW1hc2A7XG4gICAgICB9XG5cbiAgICAgIHRoaXMubG9jYWxTY2hlbWFzID0gc2NoZW1hT3B0aW9ucy5kZWZpbml0aW9ucztcbiAgICB9XG5cbiAgICB0aGlzLnJldHJpZXMgPSAwO1xuICAgIHRoaXMubWF4UmV0cmllcyA9IDM7XG4gIH1cblxuICBhc3luYyBzYXZlU2NoZW1hVG9EQihzY2hlbWE6IFBhcnNlLlNjaGVtYSk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IHBheWxvYWQgPSB7XG4gICAgICBjbGFzc05hbWU6IHNjaGVtYS5jbGFzc05hbWUsXG4gICAgICBmaWVsZHM6IHNjaGVtYS5fZmllbGRzLFxuICAgICAgaW5kZXhlczogc2NoZW1hLl9pbmRleGVzLFxuICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBzY2hlbWEuX2NscCxcbiAgICB9O1xuICAgIGF3YWl0IGludGVybmFsQ3JlYXRlU2NoZW1hKHNjaGVtYS5jbGFzc05hbWUsIHBheWxvYWQsIHRoaXMuY29uZmlnKTtcbiAgICB0aGlzLnJlc2V0U2NoZW1hT3BzKHNjaGVtYSk7XG4gIH1cblxuICByZXNldFNjaGVtYU9wcyhzY2hlbWE6IFBhcnNlLlNjaGVtYSkge1xuICAgIC8vIFJlc2V0IG9wcyBsaWtlIFNES1xuICAgIHNjaGVtYS5fZmllbGRzID0ge307XG4gICAgc2NoZW1hLl9pbmRleGVzID0ge307XG4gIH1cblxuICAvLyBTaW11bGF0ZSB1cGRhdGUgbGlrZSB0aGUgU0RLXG4gIC8vIFdlIGNhbm5vdCB1c2UgU0RLIHNpbmNlIHJvdXRlcyBhcmUgZGlzYWJsZWRcbiAgYXN5bmMgdXBkYXRlU2NoZW1hVG9EQihzY2hlbWE6IFBhcnNlLlNjaGVtYSkge1xuICAgIGNvbnN0IHBheWxvYWQgPSB7XG4gICAgICBjbGFzc05hbWU6IHNjaGVtYS5jbGFzc05hbWUsXG4gICAgICBmaWVsZHM6IHNjaGVtYS5fZmllbGRzLFxuICAgICAgaW5kZXhlczogc2NoZW1hLl9pbmRleGVzLFxuICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBzY2hlbWEuX2NscCxcbiAgICB9O1xuICAgIGF3YWl0IGludGVybmFsVXBkYXRlU2NoZW1hKHNjaGVtYS5jbGFzc05hbWUsIHBheWxvYWQsIHRoaXMuY29uZmlnKTtcbiAgICB0aGlzLnJlc2V0U2NoZW1hT3BzKHNjaGVtYSk7XG4gIH1cblxuICBhc3luYyBleGVjdXRlKCkge1xuICAgIHRyeSB7XG4gICAgICBsb2dnZXIuaW5mbygnUnVubmluZyBNaWdyYXRpb25zJyk7XG4gICAgICBpZiAodGhpcy5zY2hlbWFPcHRpb25zICYmIHRoaXMuc2NoZW1hT3B0aW9ucy5iZWZvcmVNaWdyYXRpb24pIHtcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHRoaXMuc2NoZW1hT3B0aW9ucy5iZWZvcmVNaWdyYXRpb24oKSk7XG4gICAgICB9XG5cbiAgICAgIGF3YWl0IHRoaXMuZXhlY3V0ZU1pZ3JhdGlvbnMoKTtcblxuICAgICAgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucyAmJiB0aGlzLnNjaGVtYU9wdGlvbnMuYWZ0ZXJNaWdyYXRpb24pIHtcbiAgICAgICAgYXdhaXQgUHJvbWlzZS5yZXNvbHZlKHRoaXMuc2NoZW1hT3B0aW9ucy5hZnRlck1pZ3JhdGlvbigpKTtcbiAgICAgIH1cblxuICAgICAgbG9nZ2VyLmluZm8oJ1J1bm5pbmcgTWlncmF0aW9ucyBDb21wbGV0ZWQnKTtcbiAgICB9IGNhdGNoIChlKSB7XG4gICAgICBsb2dnZXIuZXJyb3IoYEZhaWxlZCB0byBydW4gbWlncmF0aW9uczogJHtlfWApO1xuICAgICAgaWYgKHByb2Nlc3MuZW52Lk5PREVfRU5WID09PSAncHJvZHVjdGlvbicpIHByb2Nlc3MuZXhpdCgxKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBleGVjdXRlTWlncmF0aW9ucygpIHtcbiAgICBsZXQgdGltZW91dCA9IG51bGw7XG4gICAgdHJ5IHtcbiAgICAgIC8vIFNldCB1cCBhIHRpbWUgb3V0IGluIHByb2R1Y3Rpb25cbiAgICAgIC8vIGlmIHdlIGZhaWwgdG8gZ2V0IHNjaGVtYVxuICAgICAgLy8gcG0yIG9yIEs4cyBhbmQgbWFueSBvdGhlciBwcm9jZXNzIG1hbmFnZXJzIHdpbGwgdHJ5IHRvIHJlc3RhcnQgdGhlIHByb2Nlc3NcbiAgICAgIC8vIGFmdGVyIHRoZSBleGl0XG4gICAgICBpZiAocHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09ICdwcm9kdWN0aW9uJykge1xuICAgICAgICB0aW1lb3V0ID0gc2V0VGltZW91dCgoKSA9PiB7XG4gICAgICAgICAgbG9nZ2VyLmVycm9yKCdUaW1lb3V0IG9jY3VycmVkIGR1cmluZyBleGVjdXRpb24gb2YgbWlncmF0aW9ucy4gRXhpdGluZy4uLicpO1xuICAgICAgICAgIHByb2Nlc3MuZXhpdCgxKTtcbiAgICAgICAgfSwgMjAwMDApO1xuICAgICAgfVxuXG4gICAgICAvLyBIYWNrIHRvIGZvcmNlIHNlc3Npb24gc2NoZW1hIHRvIGJlIGNyZWF0ZWRcbiAgICAgIGF3YWl0IHRoaXMuY3JlYXRlRGVsZXRlU2Vzc2lvbigpO1xuICAgICAgdGhpcy5hbGxDbG91ZFNjaGVtYXMgPSBhd2FpdCBQYXJzZS5TY2hlbWEuYWxsKCk7XG4gICAgICBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICBhd2FpdCBQcm9taXNlLmFsbCh0aGlzLmxvY2FsU2NoZW1hcy5tYXAoYXN5bmMgbG9jYWxTY2hlbWEgPT4gdGhpcy5zYXZlT3JVcGRhdGUobG9jYWxTY2hlbWEpKSk7XG5cbiAgICAgIHRoaXMuY2hlY2tGb3JNaXNzaW5nU2NoZW1hcygpO1xuICAgICAgYXdhaXQgdGhpcy5lbmZvcmNlQ0xQRm9yTm9uUHJvdmlkZWRDbGFzcygpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmICh0aW1lb3V0KSBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICBpZiAodGhpcy5yZXRyaWVzIDwgdGhpcy5tYXhSZXRyaWVzKSB7XG4gICAgICAgIHRoaXMucmV0cmllcysrO1xuICAgICAgICAvLyBmaXJzdCByZXRyeSAxc2VjLCAyc2VjLCAzc2VjIHRvdGFsIDZzZWMgcmV0cnkgc2VxdWVuY2VcbiAgICAgICAgLy8gcmV0cnkgd2lsbCBvbmx5IGhhcHBlbiBpbiBjYXNlIG9mIGRlcGxveWluZyBtdWx0aSBwYXJzZSBzZXJ2ZXIgaW5zdGFuY2VcbiAgICAgICAgLy8gYXQgdGhlIHNhbWUgdGltZS4gTW9kZXJuIHN5c3RlbXMgbGlrZSBrOCBhdm9pZCB0aGlzIGJ5IGRvaW5nIHJvbGxpbmcgdXBkYXRlc1xuICAgICAgICBhd2FpdCB0aGlzLndhaXQoMTAwMCAqIHRoaXMucmV0cmllcyk7XG4gICAgICAgIGF3YWl0IHRoaXMuZXhlY3V0ZU1pZ3JhdGlvbnMoKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIGxvZ2dlci5lcnJvcihgRmFpbGVkIHRvIHJ1biBtaWdyYXRpb25zOiAke2V9YCk7XG4gICAgICAgIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ3Byb2R1Y3Rpb24nKSBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgY2hlY2tGb3JNaXNzaW5nU2NoZW1hcygpIHtcbiAgICBpZiAodGhpcy5zY2hlbWFPcHRpb25zLnN0cmljdCAhPT0gdHJ1ZSkge1xuICAgICAgcmV0dXJuO1xuICAgIH1cblxuICAgIGNvbnN0IGNsb3VkU2NoZW1hcyA9IHRoaXMuYWxsQ2xvdWRTY2hlbWFzLm1hcChzID0+IHMuY2xhc3NOYW1lKTtcbiAgICBjb25zdCBsb2NhbFNjaGVtYXMgPSB0aGlzLmxvY2FsU2NoZW1hcy5tYXAocyA9PiBzLmNsYXNzTmFtZSk7XG4gICAgY29uc3QgbWlzc2luZ1NjaGVtYXMgPSBjbG91ZFNjaGVtYXMuZmlsdGVyKFxuICAgICAgYyA9PiAhbG9jYWxTY2hlbWFzLmluY2x1ZGVzKGMpICYmICFzeXN0ZW1DbGFzc2VzLmluY2x1ZGVzKGMpXG4gICAgKTtcblxuICAgIGlmIChuZXcgU2V0KGxvY2FsU2NoZW1hcykuc2l6ZSAhPT0gbG9jYWxTY2hlbWFzLmxlbmd0aCkge1xuICAgICAgbG9nZ2VyLmVycm9yKFxuICAgICAgICBgVGhlIGxpc3Qgb2Ygc2NoZW1hcyBwcm92aWRlZCBjb250YWlucyBkdXBsaWNhdGVkIFwiY2xhc3NOYW1lXCIgIFwiJHtsb2NhbFNjaGVtYXMuam9pbihcbiAgICAgICAgICAnXCIsXCInXG4gICAgICAgICl9XCJgXG4gICAgICApO1xuICAgICAgcHJvY2Vzcy5leGl0KDEpO1xuICAgIH1cblxuICAgIGlmICh0aGlzLnNjaGVtYU9wdGlvbnMuc3RyaWN0ICYmIG1pc3NpbmdTY2hlbWFzLmxlbmd0aCkge1xuICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgIGBUaGUgZm9sbG93aW5nIHNjaGVtYXMgYXJlIGN1cnJlbnRseSBwcmVzZW50IGluIHRoZSBkYXRhYmFzZSwgYnV0IG5vdCBleHBsaWNpdGx5IGRlZmluZWQgaW4gYSBzY2hlbWE6IFwiJHttaXNzaW5nU2NoZW1hcy5qb2luKFxuICAgICAgICAgICdcIiwgXCInXG4gICAgICAgICl9XCJgXG4gICAgICApO1xuICAgIH1cbiAgfVxuXG4gIC8vIFJlcXVpcmVkIGZvciB0ZXN0aW5nIHB1cnBvc2VcbiAgd2FpdCh0aW1lOiBudW1iZXIpIHtcbiAgICByZXR1cm4gbmV3IFByb21pc2U8dm9pZD4ocmVzb2x2ZSA9PiBzZXRUaW1lb3V0KHJlc29sdmUsIHRpbWUpKTtcbiAgfVxuXG4gIGFzeW5jIGVuZm9yY2VDTFBGb3JOb25Qcm92aWRlZENsYXNzKCk6IFByb21pc2U8dm9pZD4ge1xuICAgIGNvbnN0IG5vblByb3ZpZGVkQ2xhc3NlcyA9IHRoaXMuYWxsQ2xvdWRTY2hlbWFzLmZpbHRlcihcbiAgICAgIGNsb3VkU2NoZW1hID0+XG4gICAgICAgICF0aGlzLmxvY2FsU2NoZW1hcy5zb21lKGxvY2FsU2NoZW1hID0+IGxvY2FsU2NoZW1hLmNsYXNzTmFtZSA9PT0gY2xvdWRTY2hlbWEuY2xhc3NOYW1lKVxuICAgICk7XG4gICAgYXdhaXQgUHJvbWlzZS5hbGwoXG4gICAgICBub25Qcm92aWRlZENsYXNzZXMubWFwKGFzeW5jIHNjaGVtYSA9PiB7XG4gICAgICAgIGNvbnN0IHBhcnNlU2NoZW1hID0gbmV3IFBhcnNlLlNjaGVtYShzY2hlbWEuY2xhc3NOYW1lKTtcbiAgICAgICAgdGhpcy5oYW5kbGVDTFAoc2NoZW1hLCBwYXJzZVNjaGVtYSk7XG4gICAgICAgIGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hVG9EQihwYXJzZVNjaGVtYSk7XG4gICAgICB9KVxuICAgICk7XG4gIH1cblxuICAvLyBDcmVhdGUgYSBmYWtlIHNlc3Npb24gc2luY2UgUGFyc2UgZG8gbm90IGNyZWF0ZSB0aGUgX1Nlc3Npb24gdW50aWxcbiAgLy8gYSBzZXNzaW9uIGlzIGNyZWF0ZWRcbiAgYXN5bmMgY3JlYXRlRGVsZXRlU2Vzc2lvbigpIHtcbiAgICBjb25zdCBzZXNzaW9uID0gbmV3IFBhcnNlLlNlc3Npb24oKTtcbiAgICBhd2FpdCBzZXNzaW9uLnNhdmUobnVsbCwgeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gICAgYXdhaXQgc2Vzc2lvbi5kZXN0cm95KHsgdXNlTWFzdGVyS2V5OiB0cnVlIH0pO1xuICB9XG5cbiAgYXN5bmMgc2F2ZU9yVXBkYXRlKGxvY2FsU2NoZW1hOiBNaWdyYXRpb25zLkpTT05TY2hlbWEpIHtcbiAgICBjb25zdCBjbG91ZFNjaGVtYSA9IHRoaXMuYWxsQ2xvdWRTY2hlbWFzLmZpbmQoc2MgPT4gc2MuY2xhc3NOYW1lID09PSBsb2NhbFNjaGVtYS5jbGFzc05hbWUpO1xuICAgIGlmIChjbG91ZFNjaGVtYSkge1xuICAgICAgdHJ5IHtcbiAgICAgICAgYXdhaXQgdGhpcy51cGRhdGVTY2hlbWEobG9jYWxTY2hlbWEsIGNsb3VkU2NoZW1hKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgdGhyb3cgYEVycm9yIGR1cmluZyB1cGRhdGUgb2Ygc2NoZW1hIGZvciB0eXBlICR7Y2xvdWRTY2hlbWEuY2xhc3NOYW1lfTogJHtlfWA7XG4gICAgICB9XG4gICAgfSBlbHNlIHtcbiAgICAgIHRyeSB7XG4gICAgICAgIGF3YWl0IHRoaXMuc2F2ZVNjaGVtYShsb2NhbFNjaGVtYSk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIHRocm93IGBFcnJvciB3aGlsZSBzYXZpbmcgU2NoZW1hIGZvciB0eXBlICR7bG9jYWxTY2hlbWEuY2xhc3NOYW1lfTogJHtlfWA7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgYXN5bmMgc2F2ZVNjaGVtYShsb2NhbFNjaGVtYTogTWlncmF0aW9ucy5KU09OU2NoZW1hKSB7XG4gICAgY29uc3QgbmV3TG9jYWxTY2hlbWEgPSBuZXcgUGFyc2UuU2NoZW1hKGxvY2FsU2NoZW1hLmNsYXNzTmFtZSk7XG4gICAgaWYgKGxvY2FsU2NoZW1hLmZpZWxkcykge1xuICAgICAgLy8gSGFuZGxlIGZpZWxkc1xuICAgICAgT2JqZWN0LmtleXMobG9jYWxTY2hlbWEuZmllbGRzKVxuICAgICAgICAuZmlsdGVyKGZpZWxkTmFtZSA9PiAhdGhpcy5pc1Byb3RlY3RlZEZpZWxkcyhsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGZpZWxkTmFtZSkpXG4gICAgICAgIC5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgaWYgKGxvY2FsU2NoZW1hLmZpZWxkcykge1xuICAgICAgICAgICAgY29uc3QgZmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICAgIHRoaXMuaGFuZGxlRmllbGRzKG5ld0xvY2FsU2NoZW1hLCBmaWVsZE5hbWUsIGZpZWxkKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICAvLyBIYW5kbGUgaW5kZXhlc1xuICAgIGlmIChsb2NhbFNjaGVtYS5pbmRleGVzKSB7XG4gICAgICBPYmplY3Qua2V5cyhsb2NhbFNjaGVtYS5pbmRleGVzKS5mb3JFYWNoKGluZGV4TmFtZSA9PiB7XG4gICAgICAgIGlmIChsb2NhbFNjaGVtYS5pbmRleGVzICYmICF0aGlzLmlzUHJvdGVjdGVkSW5kZXgobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBpbmRleE5hbWUpKSB7XG4gICAgICAgICAgbmV3TG9jYWxTY2hlbWEuYWRkSW5kZXgoaW5kZXhOYW1lLCBsb2NhbFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0pO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICB0aGlzLmhhbmRsZUNMUChsb2NhbFNjaGVtYSwgbmV3TG9jYWxTY2hlbWEpO1xuXG4gICAgcmV0dXJuIGF3YWl0IHRoaXMuc2F2ZVNjaGVtYVRvREIobmV3TG9jYWxTY2hlbWEpO1xuICB9XG5cbiAgYXN5bmMgdXBkYXRlU2NoZW1hKGxvY2FsU2NoZW1hOiBNaWdyYXRpb25zLkpTT05TY2hlbWEsIGNsb3VkU2NoZW1hOiBQYXJzZS5TY2hlbWEpIHtcbiAgICBjb25zdCBuZXdMb2NhbFNjaGVtYSA9IG5ldyBQYXJzZS5TY2hlbWEobG9jYWxTY2hlbWEuY2xhc3NOYW1lKTtcblxuICAgIC8vIEhhbmRsZSBmaWVsZHNcbiAgICAvLyBDaGVjayBhZGRpdGlvblxuICAgIGlmIChsb2NhbFNjaGVtYS5maWVsZHMpIHtcbiAgICAgIE9iamVjdC5rZXlzKGxvY2FsU2NoZW1hLmZpZWxkcylcbiAgICAgICAgLmZpbHRlcihmaWVsZE5hbWUgPT4gIXRoaXMuaXNQcm90ZWN0ZWRGaWVsZHMobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBmaWVsZE5hbWUpKVxuICAgICAgICAuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgIC8vIEBmbG93LWRpc2FibGUtbmV4dFxuICAgICAgICAgIGNvbnN0IGZpZWxkID0gbG9jYWxTY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgaWYgKCFjbG91ZFNjaGVtYS5maWVsZHNbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdGhpcy5oYW5kbGVGaWVsZHMobmV3TG9jYWxTY2hlbWEsIGZpZWxkTmFtZSwgZmllbGQpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgZmllbGRzVG9EZWxldGU6IHN0cmluZ1tdID0gW107XG4gICAgY29uc3QgZmllbGRzVG9SZWNyZWF0ZToge1xuICAgICAgZmllbGROYW1lOiBzdHJpbmcsXG4gICAgICBmcm9tOiB7IHR5cGU6IHN0cmluZywgdGFyZ2V0Q2xhc3M/OiBzdHJpbmcgfSxcbiAgICAgIHRvOiB7IHR5cGU6IHN0cmluZywgdGFyZ2V0Q2xhc3M/OiBzdHJpbmcgfSxcbiAgICB9W10gPSBbXTtcbiAgICBjb25zdCBmaWVsZHNXaXRoQ2hhbmdlZFBhcmFtczogc3RyaW5nW10gPSBbXTtcblxuICAgIC8vIENoZWNrIGRlbGV0aW9uXG4gICAgT2JqZWN0LmtleXMoY2xvdWRTY2hlbWEuZmllbGRzKVxuICAgICAgLmZpbHRlcihmaWVsZE5hbWUgPT4gIXRoaXMuaXNQcm90ZWN0ZWRGaWVsZHMobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBmaWVsZE5hbWUpKVxuICAgICAgLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgY29uc3QgZmllbGQgPSBjbG91ZFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgaWYgKCFsb2NhbFNjaGVtYS5maWVsZHMgfHwgIWxvY2FsU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgZmllbGRzVG9EZWxldGUucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGxvY2FsRmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgLy8gQ2hlY2sgaWYgZmllbGQgaGFzIGEgY2hhbmdlZCB0eXBlXG4gICAgICAgIGlmIChcbiAgICAgICAgICAhdGhpcy5wYXJhbXNBcmVFcXVhbHMoXG4gICAgICAgICAgICB7IHR5cGU6IGZpZWxkLnR5cGUsIHRhcmdldENsYXNzOiBmaWVsZC50YXJnZXRDbGFzcyB9LFxuICAgICAgICAgICAgeyB0eXBlOiBsb2NhbEZpZWxkLnR5cGUsIHRhcmdldENsYXNzOiBsb2NhbEZpZWxkLnRhcmdldENsYXNzIH1cbiAgICAgICAgICApXG4gICAgICAgICkge1xuICAgICAgICAgIGZpZWxkc1RvUmVjcmVhdGUucHVzaCh7XG4gICAgICAgICAgICBmaWVsZE5hbWUsXG4gICAgICAgICAgICBmcm9tOiB7IHR5cGU6IGZpZWxkLnR5cGUsIHRhcmdldENsYXNzOiBmaWVsZC50YXJnZXRDbGFzcyB9LFxuICAgICAgICAgICAgdG86IHsgdHlwZTogbG9jYWxGaWVsZC50eXBlLCB0YXJnZXRDbGFzczogbG9jYWxGaWVsZC50YXJnZXRDbGFzcyB9LFxuICAgICAgICAgIH0pO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIENoZWNrIGlmIHNvbWV0aGluZyBjaGFuZ2VkIG90aGVyIHRoYW4gdGhlIHR5cGUgKGxpa2UgcmVxdWlyZWQsIGRlZmF1bHRWYWx1ZSlcbiAgICAgICAgaWYgKCF0aGlzLnBhcmFtc0FyZUVxdWFscyhmaWVsZCwgbG9jYWxGaWVsZCkpIHtcbiAgICAgICAgICBmaWVsZHNXaXRoQ2hhbmdlZFBhcmFtcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuXG4gICAgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucy5kZWxldGVFeHRyYUZpZWxkcyA9PT0gdHJ1ZSkge1xuICAgICAgZmllbGRzVG9EZWxldGUuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICBuZXdMb2NhbFNjaGVtYS5kZWxldGVGaWVsZChmaWVsZE5hbWUpO1xuICAgICAgfSk7XG5cbiAgICAgIC8vIERlbGV0ZSBmaWVsZHMgZnJvbSB0aGUgc2NoZW1hIHRoZW4gYXBwbHkgY2hhbmdlc1xuICAgICAgYXdhaXQgdGhpcy51cGRhdGVTY2hlbWFUb0RCKG5ld0xvY2FsU2NoZW1hKTtcbiAgICB9IGVsc2UgaWYgKHRoaXMuc2NoZW1hT3B0aW9ucy5zdHJpY3QgPT09IHRydWUgJiYgZmllbGRzVG9EZWxldGUubGVuZ3RoKSB7XG4gICAgICBsb2dnZXIud2FybihcbiAgICAgICAgYFRoZSBmb2xsb3dpbmcgZmllbGRzIGV4aXN0IGluIHRoZSBkYXRhYmFzZSBmb3IgXCIke1xuICAgICAgICAgIGxvY2FsU2NoZW1hLmNsYXNzTmFtZVxuICAgICAgICB9XCIsIGJ1dCBhcmUgbWlzc2luZyBpbiB0aGUgc2NoZW1hIDogXCIke2ZpZWxkc1RvRGVsZXRlLmpvaW4oJ1wiICxcIicpfVwiYFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBpZiAodGhpcy5zY2hlbWFPcHRpb25zLnJlY3JlYXRlTW9kaWZpZWRGaWVsZHMgPT09IHRydWUpIHtcbiAgICAgIGZpZWxkc1RvUmVjcmVhdGUuZm9yRWFjaChmaWVsZCA9PiB7XG4gICAgICAgIG5ld0xvY2FsU2NoZW1hLmRlbGV0ZUZpZWxkKGZpZWxkLmZpZWxkTmFtZSk7XG4gICAgICB9KTtcblxuICAgICAgLy8gRGVsZXRlIGZpZWxkcyBmcm9tIHRoZSBzY2hlbWEgdGhlbiBhcHBseSBjaGFuZ2VzXG4gICAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYVRvREIobmV3TG9jYWxTY2hlbWEpO1xuXG4gICAgICBmaWVsZHNUb1JlY3JlYXRlLmZvckVhY2goZmllbGRJbmZvID0+IHtcbiAgICAgICAgaWYgKGxvY2FsU2NoZW1hLmZpZWxkcykge1xuICAgICAgICAgIGNvbnN0IGZpZWxkID0gbG9jYWxTY2hlbWEuZmllbGRzW2ZpZWxkSW5mby5maWVsZE5hbWVdO1xuICAgICAgICAgIHRoaXMuaGFuZGxlRmllbGRzKG5ld0xvY2FsU2NoZW1hLCBmaWVsZEluZm8uZmllbGROYW1lLCBmaWVsZCk7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH0gZWxzZSBpZiAodGhpcy5zY2hlbWFPcHRpb25zLnN0cmljdCA9PT0gdHJ1ZSAmJiBmaWVsZHNUb1JlY3JlYXRlLmxlbmd0aCkge1xuICAgICAgZmllbGRzVG9SZWNyZWF0ZS5mb3JFYWNoKGZpZWxkID0+IHtcbiAgICAgICAgY29uc3QgZnJvbSA9XG4gICAgICAgICAgZmllbGQuZnJvbS50eXBlICsgKGZpZWxkLmZyb20udGFyZ2V0Q2xhc3MgPyBgICgke2ZpZWxkLmZyb20udGFyZ2V0Q2xhc3N9KWAgOiAnJyk7XG4gICAgICAgIGNvbnN0IHRvID0gZmllbGQudG8udHlwZSArIChmaWVsZC50by50YXJnZXRDbGFzcyA/IGAgKCR7ZmllbGQudG8udGFyZ2V0Q2xhc3N9KWAgOiAnJyk7XG5cbiAgICAgICAgbG9nZ2VyLndhcm4oXG4gICAgICAgICAgYFRoZSBmaWVsZCBcIiR7ZmllbGQuZmllbGROYW1lfVwiIHR5cGUgZGlmZmVyIGJldHdlZW4gdGhlIHNjaGVtYSBhbmQgdGhlIGRhdGFiYXNlIGZvciBcIiR7bG9jYWxTY2hlbWEuY2xhc3NOYW1lfVwiOyBTY2hlbWEgaXMgZGVmaW5lZCBhcyBcIiR7dG99XCIgYW5kIGN1cnJlbnQgZGF0YWJhc2UgdHlwZSBpcyBcIiR7ZnJvbX1cImBcbiAgICAgICAgKTtcbiAgICAgIH0pO1xuICAgIH1cblxuICAgIGZpZWxkc1dpdGhDaGFuZ2VkUGFyYW1zLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmIChsb2NhbFNjaGVtYS5maWVsZHMpIHtcbiAgICAgICAgY29uc3QgZmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgdGhpcy5oYW5kbGVGaWVsZHMobmV3TG9jYWxTY2hlbWEsIGZpZWxkTmFtZSwgZmllbGQpO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgLy8gSGFuZGxlIEluZGV4ZXNcbiAgICAvLyBDaGVjayBhZGRpdGlvblxuICAgIGlmIChsb2NhbFNjaGVtYS5pbmRleGVzKSB7XG4gICAgICBPYmplY3Qua2V5cyhsb2NhbFNjaGVtYS5pbmRleGVzKS5mb3JFYWNoKGluZGV4TmFtZSA9PiB7XG4gICAgICAgIGlmIChcbiAgICAgICAgICAoIWNsb3VkU2NoZW1hLmluZGV4ZXMgfHwgIWNsb3VkU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSkgJiZcbiAgICAgICAgICAhdGhpcy5pc1Byb3RlY3RlZEluZGV4KGxvY2FsU2NoZW1hLmNsYXNzTmFtZSwgaW5kZXhOYW1lKVxuICAgICAgICApIHtcbiAgICAgICAgICBpZiAobG9jYWxTY2hlbWEuaW5kZXhlcykge1xuICAgICAgICAgICAgbmV3TG9jYWxTY2hlbWEuYWRkSW5kZXgoaW5kZXhOYW1lLCBsb2NhbFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgaW5kZXhlc1RvQWRkID0gW107XG5cbiAgICAvLyBDaGVjayBkZWxldGlvblxuICAgIGlmIChjbG91ZFNjaGVtYS5pbmRleGVzKSB7XG4gICAgICBPYmplY3Qua2V5cyhjbG91ZFNjaGVtYS5pbmRleGVzKS5mb3JFYWNoKGluZGV4TmFtZSA9PiB7XG4gICAgICAgIGlmICghdGhpcy5pc1Byb3RlY3RlZEluZGV4KGxvY2FsU2NoZW1hLmNsYXNzTmFtZSwgaW5kZXhOYW1lKSkge1xuICAgICAgICAgIGlmICghbG9jYWxTY2hlbWEuaW5kZXhlcyB8fCAhbG9jYWxTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdKSB7XG4gICAgICAgICAgICBuZXdMb2NhbFNjaGVtYS5kZWxldGVJbmRleChpbmRleE5hbWUpO1xuICAgICAgICAgIH0gZWxzZSBpZiAoXG4gICAgICAgICAgICAhdGhpcy5wYXJhbXNBcmVFcXVhbHMobG9jYWxTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdLCBjbG91ZFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0pXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICBuZXdMb2NhbFNjaGVtYS5kZWxldGVJbmRleChpbmRleE5hbWUpO1xuICAgICAgICAgICAgaWYgKGxvY2FsU2NoZW1hLmluZGV4ZXMpIHtcbiAgICAgICAgICAgICAgaW5kZXhlc1RvQWRkLnB1c2goe1xuICAgICAgICAgICAgICAgIGluZGV4TmFtZSxcbiAgICAgICAgICAgICAgICBpbmRleDogbG9jYWxTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdLFxuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIH1cbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICAgIH1cblxuICAgIHRoaXMuaGFuZGxlQ0xQKGxvY2FsU2NoZW1hLCBuZXdMb2NhbFNjaGVtYSwgY2xvdWRTY2hlbWEpO1xuICAgIC8vIEFwcGx5IGNoYW5nZXNcbiAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYVRvREIobmV3TG9jYWxTY2hlbWEpO1xuICAgIC8vIEFwcGx5IG5ldy9jaGFuZ2VkIGluZGV4ZXNcbiAgICBpZiAoaW5kZXhlc1RvQWRkLmxlbmd0aCkge1xuICAgICAgbG9nZ2VyLmRlYnVnKFxuICAgICAgICBgVXBkYXRpbmcgaW5kZXhlcyBmb3IgXCIke25ld0xvY2FsU2NoZW1hLmNsYXNzTmFtZX1cIiA6ICAke2luZGV4ZXNUb0FkZC5qb2luKCcgLCcpfWBcbiAgICAgICk7XG4gICAgICBpbmRleGVzVG9BZGQuZm9yRWFjaChvID0+IG5ld0xvY2FsU2NoZW1hLmFkZEluZGV4KG8uaW5kZXhOYW1lLCBvLmluZGV4KSk7XG4gICAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYVRvREIobmV3TG9jYWxTY2hlbWEpO1xuICAgIH1cbiAgfVxuXG4gIGhhbmRsZUNMUChcbiAgICBsb2NhbFNjaGVtYTogTWlncmF0aW9ucy5KU09OU2NoZW1hLFxuICAgIG5ld0xvY2FsU2NoZW1hOiBQYXJzZS5TY2hlbWEsXG4gICAgY2xvdWRTY2hlbWE6IFBhcnNlLlNjaGVtYVxuICApIHtcbiAgICBpZiAoIWxvY2FsU2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyAmJiAhY2xvdWRTY2hlbWEpIHtcbiAgICAgIGxvZ2dlci53YXJuKGBjbGFzc0xldmVsUGVybWlzc2lvbnMgbm90IHByb3ZpZGVkIGZvciAke2xvY2FsU2NoZW1hLmNsYXNzTmFtZX0uYCk7XG4gICAgfVxuICAgIC8vIFVzZSBzcHJlYWQgdG8gYXZvaWQgcmVhZCBvbmx5IGlzc3VlIChlbmNvdW50ZXJlZCBieSBNb3Vtb3VscyB1c2luZyBkaXJlY3RBY2Nlc3MpXG4gICAgY29uc3QgY2xwID0gKHsgLi4ubG9jYWxTY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zIH0gfHwge306IFBhcnNlLkNMUC5QZXJtaXNzaW9uc01hcCk7XG4gICAgLy8gVG8gYXZvaWQgaW5jb25zaXN0ZW5jeSB3ZSBuZWVkIHRvIHJlbW92ZSBhbGwgcmlnaHRzIG9uIGFkZEZpZWxkXG4gICAgY2xwLmFkZEZpZWxkID0ge307XG4gICAgbmV3TG9jYWxTY2hlbWEuc2V0Q0xQKGNscCk7XG4gIH1cblxuICBpc1Byb3RlY3RlZEZpZWxkcyhjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gKFxuICAgICAgISFkZWZhdWx0Q29sdW1ucy5fRGVmYXVsdFtmaWVsZE5hbWVdIHx8XG4gICAgICAhIShkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdICYmIGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV1bZmllbGROYW1lXSlcbiAgICApO1xuICB9XG5cbiAgaXNQcm90ZWN0ZWRJbmRleChjbGFzc05hbWU6IHN0cmluZywgaW5kZXhOYW1lOiBzdHJpbmcpIHtcbiAgICBsZXQgaW5kZXhlcyA9IFsnX2lkXyddO1xuICAgIGlmIChjbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICAgIGluZGV4ZXMgPSBbXG4gICAgICAgIC4uLmluZGV4ZXMsXG4gICAgICAgICdjYXNlX2luc2Vuc2l0aXZlX3VzZXJuYW1lJyxcbiAgICAgICAgJ2Nhc2VfaW5zZW5zaXRpdmVfZW1haWwnLFxuICAgICAgICAndXNlcm5hbWVfMScsXG4gICAgICAgICdlbWFpbF8xJyxcbiAgICAgIF07XG4gICAgfVxuXG4gICAgcmV0dXJuIGluZGV4ZXMuaW5kZXhPZihpbmRleE5hbWUpICE9PSAtMTtcbiAgfVxuXG4gIHBhcmFtc0FyZUVxdWFsczxUOiB7IFtrZXk6IHN0cmluZ106IGFueSB9PihvYmpBOiBULCBvYmpCOiBUKSB7XG4gICAgY29uc3Qga2V5c0E6IHN0cmluZ1tdID0gT2JqZWN0LmtleXMob2JqQSk7XG4gICAgY29uc3Qga2V5c0I6IHN0cmluZ1tdID0gT2JqZWN0LmtleXMob2JqQik7XG5cbiAgICAvLyBDaGVjayBrZXkgbmFtZVxuICAgIGlmIChrZXlzQS5sZW5ndGggIT09IGtleXNCLmxlbmd0aCkgcmV0dXJuIGZhbHNlO1xuICAgIHJldHVybiBrZXlzQS5ldmVyeShrID0+IG9iakFba10gPT09IG9iakJba10pO1xuICB9XG5cbiAgaGFuZGxlRmllbGRzKG5ld0xvY2FsU2NoZW1hOiBQYXJzZS5TY2hlbWEsIGZpZWxkTmFtZTogc3RyaW5nLCBmaWVsZDogTWlncmF0aW9ucy5GaWVsZFR5cGUpIHtcbiAgICBpZiAoZmllbGQudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgbmV3TG9jYWxTY2hlbWEuYWRkUmVsYXRpb24oZmllbGROYW1lLCBmaWVsZC50YXJnZXRDbGFzcyk7XG4gICAgfSBlbHNlIGlmIChmaWVsZC50eXBlID09PSAnUG9pbnRlcicpIHtcbiAgICAgIG5ld0xvY2FsU2NoZW1hLmFkZFBvaW50ZXIoZmllbGROYW1lLCBmaWVsZC50YXJnZXRDbGFzcywgZmllbGQpO1xuICAgIH0gZWxzZSB7XG4gICAgICBuZXdMb2NhbFNjaGVtYS5hZGRGaWVsZChmaWVsZE5hbWUsIGZpZWxkLnR5cGUsIGZpZWxkKTtcbiAgICB9XG4gIH1cbn1cbiJdfQ==