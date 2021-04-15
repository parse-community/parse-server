"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.DefinedSchemas = void 0;

var _node = _interopRequireDefault(require("parse/node"));

var _logger = require("./logger");

var _Config = _interopRequireDefault(require("./Config"));

var _SchemasRouter = require("./Routers/SchemasRouter");

var _SchemaController = require("./Controllers/SchemaController");

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _objectWithoutProperties(source, excluded) { if (source == null) return {}; var target = _objectWithoutPropertiesLoose(source, excluded); var key, i; if (Object.getOwnPropertySymbols) { var sourceSymbolKeys = Object.getOwnPropertySymbols(source); for (i = 0; i < sourceSymbolKeys.length; i++) { key = sourceSymbolKeys[i]; if (excluded.indexOf(key) >= 0) continue; if (!Object.prototype.propertyIsEnumerable.call(source, key)) continue; target[key] = source[key]; } } return target; }

function _objectWithoutPropertiesLoose(source, excluded) { if (source == null) return {}; var target = {}; var sourceKeys = Object.keys(source); var key, i; for (i = 0; i < sourceKeys.length; i++) { key = sourceKeys[i]; if (excluded.indexOf(key) >= 0) continue; target[key] = source[key]; } return target; }

class DefinedSchemas {
  constructor(localSchemas, config) {
    this.config = _Config.default.get(config.appId);
    this.localSchemas = localSchemas;
    this.retries = 0;
    this.maxRetries = 3;
  } // Simulate save like the SDK
  // We cannot use SDK since routes are disabled


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

  async resetSchemaOps(schema) {
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
    let timeout;

    try {
      // Set up a time out in production
      // if we fail to get schema
      // pm2 or K8s and many other process managers will try to restart the process
      // after the exit
      timeout = setTimeout(() => {
        if (process.env.NODE_ENV === 'production') process.exit(1);
      }, 20000); // Hack to force session schema to be created

      await this.createDeleteSession();
      this.allCloudSchemas = await _node.default.Schema.all();
      clearTimeout(timeout);
      await Promise.all(this.localSchemas.map(async localSchema => this.saveOrUpdate(localSchema)));
      await this.enforceCLPForNonProvidedClass();
    } catch (e) {
      if (timeout) clearTimeout(timeout);

      if (this.retries < this.maxRetries) {
        this.retries++; // first retry 1sec, 2sec, 3sec total 6sec retry sequence
        // retry will only happen in case of deploying multi parse server instance
        // at the same time
        // modern systems like k8 avoid this by doing rolling updates

        await this.wait(1000 * this.retries);
        await this.execute();
      } else {
        _logger.logger.error(e);

        if (process.env.NODE_ENV === 'production') process.exit(1);
      }
    }
  } // Required for testing purpose


  async wait(time) {
    await new Promise(resolve => setTimeout(resolve, time));
  }

  async enforceCLPForNonProvidedClass() {
    const nonProvidedClasses = this.allCloudSchemas.filter(cloudSchema => !this.localSchemas.some(localSchema => localSchema.className === cloudSchema.className));
    await Promise.all(nonProvidedClasses.map(async schema => {
      const parseSchema = new _node.default.Schema(schema.className);
      this.handleCLP(schema, parseSchema);
      await this.updateSchemaToDB(parseSchema);
    }));
  } // Create a fake session since Parse do not create the _Session until
  // a session is created


  async createDeleteSession() {
    const session = new _node.default.Session();
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
      await this.updateSchema(localSchema, cloudSchema);
    } else {
      await this.saveSchema(localSchema);
    }
  }

  async saveSchema(localSchema) {
    const newLocalSchema = new _node.default.Schema(localSchema.className);

    if (localSchema.fields) {
      // Handle fields
      Object.keys(localSchema.fields).filter(fieldName => !this.isProtectedFields(localSchema.className, fieldName)).forEach(fieldName => {
        const _localSchema$fields$f = localSchema.fields[fieldName],
              {
          type
        } = _localSchema$fields$f,
              others = _objectWithoutProperties(_localSchema$fields$f, ["type"]);

        this.handleFields(newLocalSchema, fieldName, type, others);
      });
    } // Handle indexes


    if (localSchema.indexes) {
      Object.keys(localSchema.indexes).forEach(indexName => {
        if (!this.isProtectedIndex(localSchema.className, indexName)) {
          newLocalSchema.addIndex(indexName, localSchema.indexes[indexName]);
        }
      });
    }

    this.handleCLP(localSchema, newLocalSchema);
    return this.saveSchemaToDB(newLocalSchema);
  }

  async updateSchema(localSchema, cloudSchema) {
    const newLocalSchema = new _node.default.Schema(localSchema.className); // Handle fields
    // Check addition

    if (localSchema.fields) {
      Object.keys(localSchema.fields).filter(fieldName => !this.isProtectedFields(localSchema.className, fieldName)).forEach(fieldName => {
        const _localSchema$fields$f2 = localSchema.fields[fieldName],
              {
          type
        } = _localSchema$fields$f2,
              others = _objectWithoutProperties(_localSchema$fields$f2, ["type"]);

        if (!cloudSchema.fields[fieldName]) this.handleFields(newLocalSchema, fieldName, type, others);
      });
    }

    const fieldsToDelete = [];
    const fieldsToRecreate = [];
    const fieldsWithChangedParams = []; // Check deletion

    Object.keys(cloudSchema.fields).filter(fieldName => !this.isProtectedFields(localSchema.className, fieldName)).forEach(async fieldName => {
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
        fieldsToRecreate.push(fieldName);
        fieldsToDelete.push(fieldName);
        return;
      } // Check if something changed other than the type (like required, defaultValue)


      if (!this.paramsAreEquals(field, localField)) {
        fieldsWithChangedParams.push(fieldName);
      }
    });
    fieldsToDelete.forEach(fieldName => {
      newLocalSchema.deleteField(fieldName);
    }); // Delete fields from the schema then apply changes

    await this.updateSchemaToDB(newLocalSchema);
    fieldsToRecreate.forEach(fieldName => {
      const _localSchema$fields$f3 = localSchema.fields[fieldName],
            {
        type
      } = _localSchema$fields$f3,
            others = _objectWithoutProperties(_localSchema$fields$f3, ["type"]);

      this.handleFields(newLocalSchema, fieldName, type, others);
    });
    fieldsWithChangedParams.forEach(fieldName => {
      const _localSchema$fields$f4 = localSchema.fields[fieldName],
            {
        type
      } = _localSchema$fields$f4,
            others = _objectWithoutProperties(_localSchema$fields$f4, ["type"]);

      this.handleFields(newLocalSchema, fieldName, type, others);
    }); // Handle Indexes
    // Check addition

    if (localSchema.indexes) {
      Object.keys(localSchema.indexes).forEach(indexName => {
        if ((!cloudSchema.indexes || !cloudSchema.indexes[indexName]) && !this.isProtectedIndex(localSchema.className, indexName)) newLocalSchema.addIndex(indexName, localSchema.indexes[indexName]);
      });
    }

    const indexesToAdd = []; // Check deletion

    if (cloudSchema.indexes) {
      Object.keys(cloudSchema.indexes).forEach(async indexName => {
        if (!this.isProtectedIndex(localSchema.className, indexName)) {
          if (!localSchema.indexes || !localSchema.indexes[indexName]) {
            newLocalSchema.deleteIndex(indexName);
          } else if (!this.paramsAreEquals(localSchema.indexes[indexName], cloudSchema.indexes[indexName])) {
            newLocalSchema.deleteIndex(indexName);
            indexesToAdd.push({
              indexName,
              index: localSchema.indexes[indexName]
            });
          }
        }
      });
    }

    this.handleCLP(localSchema, newLocalSchema, cloudSchema); // Apply changes

    await this.updateSchemaToDB(newLocalSchema); // Apply new/changed indexes

    if (indexesToAdd.length) {
      indexesToAdd.forEach(o => newLocalSchema.addIndex(o.indexName, o.index));
      await this.updateSchemaToDB(newLocalSchema);
    }
  }

  handleCLP(localSchema, newLocalSchema, cloudSchema) {
    if (!localSchema.classLevelPermissions && !cloudSchema) {
      _logger.logger.warn(`classLevelPermissions not provided for ${localSchema.className}.`);
    } // Use spread to avoid read only issue (encountered by Moumouls using directAccess)


    const clp = _objectSpread({}, localSchema.classLevelPermissions) || {};
    const cloudCLP = cloudSchema && cloudSchema.classLevelPermissions || {}; // Try to inject default CLPs

    const CLPKeys = ['find', 'count', 'get', 'create', 'update', 'delete', 'addField'];
    CLPKeys.forEach(key => {
      if (!clp[key]) {
        clp[key] = cloudCLP[key] || {
          '*': true
        };
      }
    }); // To avoid inconsistency we need to remove all rights on addField

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

  paramsAreEquals(indexA, indexB) {
    const keysIndexA = Object.keys(indexA);
    const keysIndexB = Object.keys(indexB); // Check key name

    if (keysIndexA.length !== keysIndexB.length) return false;
    return keysIndexA.every(k => indexA[k] === indexB[k]);
  }

  handleFields(newLocalSchema, fieldName, type, others) {
    if (type === 'Relation') {
      newLocalSchema.addRelation(fieldName, others.targetClass);
    } else if (type === 'Pointer') {
      const {
        targetClass
      } = others,
            others2 = _objectWithoutProperties(others, ["targetClass"]);

      newLocalSchema.addPointer(fieldName, targetClass, others2);
    } else {
      newLocalSchema.addField(fieldName, type, others);
    }
  }

}

exports.DefinedSchemas = DefinedSchemas;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uL3NyYy9EZWZpbmVkU2NoZW1hcy5qcyJdLCJuYW1lcyI6WyJEZWZpbmVkU2NoZW1hcyIsImNvbnN0cnVjdG9yIiwibG9jYWxTY2hlbWFzIiwiY29uZmlnIiwiQ29uZmlnIiwiZ2V0IiwiYXBwSWQiLCJyZXRyaWVzIiwibWF4UmV0cmllcyIsInNhdmVTY2hlbWFUb0RCIiwic2NoZW1hIiwicGF5bG9hZCIsImNsYXNzTmFtZSIsImZpZWxkcyIsIl9maWVsZHMiLCJpbmRleGVzIiwiX2luZGV4ZXMiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJfY2xwIiwicmVzZXRTY2hlbWFPcHMiLCJ1cGRhdGVTY2hlbWFUb0RCIiwiZXhlY3V0ZSIsInRpbWVvdXQiLCJzZXRUaW1lb3V0IiwicHJvY2VzcyIsImVudiIsIk5PREVfRU5WIiwiZXhpdCIsImNyZWF0ZURlbGV0ZVNlc3Npb24iLCJhbGxDbG91ZFNjaGVtYXMiLCJQYXJzZSIsIlNjaGVtYSIsImFsbCIsImNsZWFyVGltZW91dCIsIlByb21pc2UiLCJtYXAiLCJsb2NhbFNjaGVtYSIsInNhdmVPclVwZGF0ZSIsImVuZm9yY2VDTFBGb3JOb25Qcm92aWRlZENsYXNzIiwiZSIsIndhaXQiLCJsb2dnZXIiLCJlcnJvciIsInRpbWUiLCJyZXNvbHZlIiwibm9uUHJvdmlkZWRDbGFzc2VzIiwiZmlsdGVyIiwiY2xvdWRTY2hlbWEiLCJzb21lIiwicGFyc2VTY2hlbWEiLCJoYW5kbGVDTFAiLCJzZXNzaW9uIiwiU2Vzc2lvbiIsInNhdmUiLCJ1c2VNYXN0ZXJLZXkiLCJkZXN0cm95IiwiZmluZCIsInNjIiwidXBkYXRlU2NoZW1hIiwic2F2ZVNjaGVtYSIsIm5ld0xvY2FsU2NoZW1hIiwiT2JqZWN0Iiwia2V5cyIsImZpZWxkTmFtZSIsImlzUHJvdGVjdGVkRmllbGRzIiwiZm9yRWFjaCIsInR5cGUiLCJvdGhlcnMiLCJoYW5kbGVGaWVsZHMiLCJpbmRleE5hbWUiLCJpc1Byb3RlY3RlZEluZGV4IiwiYWRkSW5kZXgiLCJmaWVsZHNUb0RlbGV0ZSIsImZpZWxkc1RvUmVjcmVhdGUiLCJmaWVsZHNXaXRoQ2hhbmdlZFBhcmFtcyIsImZpZWxkIiwicHVzaCIsImxvY2FsRmllbGQiLCJwYXJhbXNBcmVFcXVhbHMiLCJ0YXJnZXRDbGFzcyIsImRlbGV0ZUZpZWxkIiwiaW5kZXhlc1RvQWRkIiwiZGVsZXRlSW5kZXgiLCJpbmRleCIsImxlbmd0aCIsIm8iLCJ3YXJuIiwiY2xwIiwiY2xvdWRDTFAiLCJDTFBLZXlzIiwia2V5IiwiYWRkRmllbGQiLCJzZXRDTFAiLCJkZWZhdWx0Q29sdW1ucyIsIl9EZWZhdWx0IiwiaW5kZXhPZiIsImluZGV4QSIsImluZGV4QiIsImtleXNJbmRleEEiLCJrZXlzSW5kZXhCIiwiZXZlcnkiLCJrIiwiYWRkUmVsYXRpb24iLCJvdGhlcnMyIiwiYWRkUG9pbnRlciJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOztBQUNBOztBQUNBOztBQUNBOztBQUNBOzs7Ozs7Ozs7Ozs7OztBQUVPLE1BQU1BLGNBQU4sQ0FBcUI7QUFDMUJDLEVBQUFBLFdBQVcsQ0FBQ0MsWUFBRCxFQUFlQyxNQUFmLEVBQXVCO0FBQ2hDLFNBQUtBLE1BQUwsR0FBY0MsZ0JBQU9DLEdBQVAsQ0FBV0YsTUFBTSxDQUFDRyxLQUFsQixDQUFkO0FBQ0EsU0FBS0osWUFBTCxHQUFvQkEsWUFBcEI7QUFDQSxTQUFLSyxPQUFMLEdBQWUsQ0FBZjtBQUNBLFNBQUtDLFVBQUwsR0FBa0IsQ0FBbEI7QUFDRCxHQU55QixDQVExQjtBQUNBOzs7QUFDb0IsUUFBZEMsY0FBYyxDQUFDQyxNQUFELEVBQVM7QUFDM0IsVUFBTUMsT0FBTyxHQUFHO0FBQ2RDLE1BQUFBLFNBQVMsRUFBRUYsTUFBTSxDQUFDRSxTQURKO0FBRWRDLE1BQUFBLE1BQU0sRUFBRUgsTUFBTSxDQUFDSSxPQUZEO0FBR2RDLE1BQUFBLE9BQU8sRUFBRUwsTUFBTSxDQUFDTSxRQUhGO0FBSWRDLE1BQUFBLHFCQUFxQixFQUFFUCxNQUFNLENBQUNRO0FBSmhCLEtBQWhCO0FB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Q0FQLE1BQUFBLGNBQWMsQ0FBQzRDLFVBQWYsQ0FBMEJ6QyxTQUExQixFQUFxQ2dCLFdBQXJDLEVBQWtEd0IsT0FBbEQ7QUFDRCxLQUhNLE1BR0E7QUFDTDNDLE1BQUFBLGNBQWMsQ0FBQytCLFFBQWYsQ0FBd0I1QixTQUF4QixFQUFtQ0csSUFBbkMsRUFBeUNDLE1BQXpDO0FBQ0Q7QUFDRjs7QUE1U3lCIiwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IFBhcnNlIGZyb20gJ3BhcnNlL25vZGUnO1xuaW1wb3J0IHsgbG9nZ2VyIH0gZnJvbSAnLi9sb2dnZXInO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuL0NvbmZpZyc7XG5pbXBvcnQgeyBpbnRlcm5hbENyZWF0ZVNjaGVtYSwgaW50ZXJuYWxVcGRhdGVTY2hlbWEgfSBmcm9tICcuL1JvdXRlcnMvU2NoZW1hc1JvdXRlcic7XG5pbXBvcnQgeyBkZWZhdWx0Q29sdW1ucyB9IGZyb20gJy4vQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlcic7XG5cbmV4cG9ydCBjbGFzcyBEZWZpbmVkU2NoZW1hcyB7XG4gIGNvbnN0cnVjdG9yKGxvY2FsU2NoZW1hcywgY29uZmlnKSB7XG4gICAgdGhpcy5jb25maWcgPSBDb25maWcuZ2V0KGNvbmZpZy5hcHBJZCk7XG4gICAgdGhpcy5sb2NhbFNjaGVtYXMgPSBsb2NhbFNjaGVtYXM7XG4gICAgdGhpcy5yZXRyaWVzID0gMDtcbiAgICB0aGlzLm1heFJldHJpZXMgPSAzO1xuICB9XG5cbiAgLy8gU2ltdWxhdGUgc2F2ZSBsaWtlIHRoZSBTREtcbiAgLy8gV2UgY2Fubm90IHVzZSBTREsgc2luY2Ugcm91dGVzIGFyZSBkaXNhYmxlZFxuICBhc3luYyBzYXZlU2NoZW1hVG9EQihzY2hlbWEpIHtcbiAgICBjb25zdCBwYXlsb2FkID0ge1xuICAgICAgY2xhc3NOYW1lOiBzY2hlbWEuY2xhc3NOYW1lLFxuICAgICAgZmllbGRzOiBzY2hlbWEuX2ZpZWxkcyxcbiAgICAgIGluZGV4ZXM6IHNjaGVtYS5faW5kZXhlcyxcbiAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogc2NoZW1hLl9jbHAsXG4gICAgfTtcbiAgICBhd2FpdCBpbnRlcm5hbENyZWF0ZVNjaGVtYShzY2hlbWEuY2xhc3NOYW1lLCBwYXlsb2FkLCB0aGlzLmNvbmZpZyk7XG4gICAgdGhpcy5yZXNldFNjaGVtYU9wcyhzY2hlbWEpO1xuICB9XG5cbiAgYXN5bmMgcmVzZXRTY2hlbWFPcHMoc2NoZW1hKSB7XG4gICAgLy8gUmVzZXQgb3BzIGxpa2UgU0RLXG4gICAgc2NoZW1hLl9maWVsZHMgPSB7fTtcbiAgICBzY2hlbWEuX2luZGV4ZXMgPSB7fTtcbiAgfVxuXG4gIC8vIFNpbXVsYXRlIHVwZGF0ZSBsaWtlIHRoZSBTREtcbiAgLy8gV2UgY2Fubm90IHVzZSBTREsgc2luY2Ugcm91dGVzIGFyZSBkaXNhYmxlZFxuICBhc3luYyB1cGRhdGVTY2hlbWFUb0RCKHNjaGVtYSkge1xuICAgIGNvbnN0IHBheWxvYWQgPSB7XG4gICAgICBjbGFzc05hbWU6IHNjaGVtYS5jbGFzc05hbWUsXG4gICAgICBmaWVsZHM6IHNjaGVtYS5fZmllbGRzLFxuICAgICAgaW5kZXhlczogc2NoZW1hLl9pbmRleGVzLFxuICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBzY2hlbWEuX2NscCxcbiAgICB9O1xuICAgIGF3YWl0IGludGVybmFsVXBkYXRlU2NoZW1hKHNjaGVtYS5jbGFzc05hbWUsIHBheWxvYWQsIHRoaXMuY29uZmlnKTtcbiAgICB0aGlzLnJlc2V0U2NoZW1hT3BzKHNjaGVtYSk7XG4gIH1cblxuICBhc3luYyBleGVjdXRlKCkge1xuICAgIGxldCB0aW1lb3V0O1xuICAgIHRyeSB7XG4gICAgICAvLyBTZXQgdXAgYSB0aW1lIG91dCBpbiBwcm9kdWN0aW9uXG4gICAgICAvLyBpZiB3ZSBmYWlsIHRvIGdldCBzY2hlbWFcbiAgICAgIC8vIHBtMiBvciBLOHMgYW5kIG1hbnkgb3RoZXIgcHJvY2VzcyBtYW5hZ2VycyB3aWxsIHRyeSB0byByZXN0YXJ0IHRoZSBwcm9jZXNzXG4gICAgICAvLyBhZnRlciB0aGUgZXhpdFxuICAgICAgdGltZW91dCA9IHNldFRpbWVvdXQoKCkgPT4ge1xuICAgICAgICBpZiAocHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09ICdwcm9kdWN0aW9uJykgcHJvY2Vzcy5leGl0KDEpO1xuICAgICAgfSwgMjAwMDApO1xuICAgICAgLy8gSGFjayB0byBmb3JjZSBzZXNzaW9uIHNjaGVtYSB0byBiZSBjcmVhdGVkXG4gICAgICBhd2FpdCB0aGlzLmNyZWF0ZURlbGV0ZVNlc3Npb24oKTtcbiAgICAgIHRoaXMuYWxsQ2xvdWRTY2hlbWFzID0gYXdhaXQgUGFyc2UuU2NoZW1hLmFsbCgpO1xuICAgICAgY2xlYXJUaW1lb3V0KHRpbWVvdXQpO1xuICAgICAgYXdhaXQgUHJvbWlzZS5hbGwodGhpcy5sb2NhbFNjaGVtYXMubWFwKGFzeW5jIGxvY2FsU2NoZW1hID0+IHRoaXMuc2F2ZU9yVXBkYXRlKGxvY2FsU2NoZW1hKSkpO1xuICAgICAgYXdhaXQgdGhpcy5lbmZvcmNlQ0xQRm9yTm9uUHJvdmlkZWRDbGFzcygpO1xuICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgIGlmICh0aW1lb3V0KSBjbGVhclRpbWVvdXQodGltZW91dCk7XG4gICAgICBpZiAodGhpcy5yZXRyaWVzIDwgdGhpcy5tYXhSZXRyaWVzKSB7XG4gICAgICAgIHRoaXMucmV0cmllcysrO1xuICAgICAgICAvLyBmaXJzdCByZXRyeSAxc2VjLCAyc2VjLCAzc2VjIHRvdGFsIDZzZWMgcmV0cnkgc2VxdWVuY2VcbiAgICAgICAgLy8gcmV0cnkgd2lsbCBvbmx5IGhhcHBlbiBpbiBjYXNlIG9mIGRlcGxveWluZyBtdWx0aSBwYXJzZSBzZXJ2ZXIgaW5zdGFuY2VcbiAgICAgICAgLy8gYXQgdGhlIHNhbWUgdGltZVxuICAgICAgICAvLyBtb2Rlcm4gc3lzdGVtcyBsaWtlIGs4IGF2b2lkIHRoaXMgYnkgZG9pbmcgcm9sbGluZyB1cGRhdGVzXG4gICAgICAgIGF3YWl0IHRoaXMud2FpdCgxMDAwICogdGhpcy5yZXRyaWVzKTtcbiAgICAgICAgYXdhaXQgdGhpcy5leGVjdXRlKCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICBsb2dnZXIuZXJyb3IoZSk7XG4gICAgICAgIGlmIChwcm9jZXNzLmVudi5OT0RFX0VOViA9PT0gJ3Byb2R1Y3Rpb24nKSBwcm9jZXNzLmV4aXQoMSk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gUmVxdWlyZWQgZm9yIHRlc3RpbmcgcHVycG9zZVxuICBhc3luYyB3YWl0KHRpbWUpIHtcbiAgICBhd2FpdCBuZXcgUHJvbWlzZShyZXNvbHZlID0+IHNldFRpbWVvdXQocmVzb2x2ZSwgdGltZSkpO1xuICB9XG5cbiAgYXN5bmMgZW5mb3JjZUNMUEZvck5vblByb3ZpZGVkQ2xhc3MoKSB7XG4gICAgY29uc3Qgbm9uUHJvdmlkZWRDbGFzc2VzID0gdGhpcy5hbGxDbG91ZFNjaGVtYXMuZmlsdGVyKFxuICAgICAgY2xvdWRTY2hlbWEgPT5cbiAgICAgICAgIXRoaXMubG9jYWxTY2hlbWFzLnNvbWUobG9jYWxTY2hlbWEgPT4gbG9jYWxTY2hlbWEuY2xhc3NOYW1lID09PSBjbG91ZFNjaGVtYS5jbGFzc05hbWUpXG4gICAgKTtcbiAgICBhd2FpdCBQcm9taXNlLmFsbChcbiAgICAgIG5vblByb3ZpZGVkQ2xhc3Nlcy5tYXAoYXN5bmMgc2NoZW1hID0+IHtcbiAgICAgICAgY29uc3QgcGFyc2VTY2hlbWEgPSBuZXcgUGFyc2UuU2NoZW1hKHNjaGVtYS5jbGFzc05hbWUpO1xuICAgICAgICB0aGlzLmhhbmRsZUNMUChzY2hlbWEsIHBhcnNlU2NoZW1hKTtcbiAgICAgICAgYXdhaXQgdGhpcy51cGRhdGVTY2hlbWFUb0RCKHBhcnNlU2NoZW1hKTtcbiAgICAgIH0pXG4gICAgKTtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIGZha2Ugc2Vzc2lvbiBzaW5jZSBQYXJzZSBkbyBub3QgY3JlYXRlIHRoZSBfU2Vzc2lvbiB1bnRpbFxuICAvLyBhIHNlc3Npb24gaXMgY3JlYXRlZFxuICBhc3luYyBjcmVhdGVEZWxldGVTZXNzaW9uKCkge1xuICAgIGNvbnN0IHNlc3Npb24gPSBuZXcgUGFyc2UuU2Vzc2lvbigpO1xuICAgIGF3YWl0IHNlc3Npb24uc2F2ZShudWxsLCB7IHVzZU1hc3RlcktleTogdHJ1ZSB9KTtcbiAgICBhd2FpdCBzZXNzaW9uLmRlc3Ryb3koeyB1c2VNYXN0ZXJLZXk6IHRydWUgfSk7XG4gIH1cblxuICBhc3luYyBzYXZlT3JVcGRhdGUobG9jYWxTY2hlbWEpIHtcbiAgICBjb25zdCBjbG91ZFNjaGVtYSA9IHRoaXMuYWxsQ2xvdWRTY2hlbWFzLmZpbmQoc2MgPT4gc2MuY2xhc3NOYW1lID09PSBsb2NhbFNjaGVtYS5jbGFzc05hbWUpO1xuICAgIGlmIChjbG91ZFNjaGVtYSkge1xuICAgICAgYXdhaXQgdGhpcy51cGRhdGVTY2hlbWEobG9jYWxTY2hlbWEsIGNsb3VkU2NoZW1hKTtcbiAgICB9IGVsc2Uge1xuICAgICAgYXdhaXQgdGhpcy5zYXZlU2NoZW1hKGxvY2FsU2NoZW1hKTtcbiAgICB9XG4gIH1cblxuICBhc3luYyBzYXZlU2NoZW1hKGxvY2FsU2NoZW1hKSB7XG4gICAgY29uc3QgbmV3TG9jYWxTY2hlbWEgPSBuZXcgUGFyc2UuU2NoZW1hKGxvY2FsU2NoZW1hLmNsYXNzTmFtZSk7XG4gICAgaWYgKGxvY2FsU2NoZW1hLmZpZWxkcykge1xuICAgICAgLy8gSGFuZGxlIGZpZWxkc1xuICAgICAgT2JqZWN0LmtleXMobG9jYWxTY2hlbWEuZmllbGRzKVxuICAgICAgICAuZmlsdGVyKGZpZWxkTmFtZSA9PiAhdGhpcy5pc1Byb3RlY3RlZEZpZWxkcyhsb2NhbFNjaGVtYS5jbGFzc05hbWUsIGZpZWxkTmFtZSkpXG4gICAgICAgIC5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgY29uc3QgeyB0eXBlLCAuLi5vdGhlcnMgfSA9IGxvY2FsU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgIHRoaXMuaGFuZGxlRmllbGRzKG5ld0xvY2FsU2NoZW1hLCBmaWVsZE5hbWUsIHR5cGUsIG90aGVycyk7XG4gICAgICAgIH0pO1xuICAgIH1cbiAgICAvLyBIYW5kbGUgaW5kZXhlc1xuICAgIGlmIChsb2NhbFNjaGVtYS5pbmRleGVzKSB7XG4gICAgICBPYmplY3Qua2V5cyhsb2NhbFNjaGVtYS5pbmRleGVzKS5mb3JFYWNoKGluZGV4TmFtZSA9PiB7XG4gICAgICAgIGlmICghdGhpcy5pc1Byb3RlY3RlZEluZGV4KGxvY2FsU2NoZW1hLmNsYXNzTmFtZSwgaW5kZXhOYW1lKSkge1xuICAgICAgICAgIG5ld0xvY2FsU2NoZW1hLmFkZEluZGV4KGluZGV4TmFtZSwgbG9jYWxTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdKTtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgdGhpcy5oYW5kbGVDTFAobG9jYWxTY2hlbWEsIG5ld0xvY2FsU2NoZW1hKTtcblxuICAgIHJldHVybiB0aGlzLnNhdmVTY2hlbWFUb0RCKG5ld0xvY2FsU2NoZW1hKTtcbiAgfVxuXG4gIGFzeW5jIHVwZGF0ZVNjaGVtYShsb2NhbFNjaGVtYSwgY2xvdWRTY2hlbWEpIHtcbiAgICBjb25zdCBuZXdMb2NhbFNjaGVtYSA9IG5ldyBQYXJzZS5TY2hlbWEobG9jYWxTY2hlbWEuY2xhc3NOYW1lKTtcblxuICAgIC8vIEhhbmRsZSBmaWVsZHNcbiAgICAvLyBDaGVjayBhZGRpdGlvblxuICAgIGlmIChsb2NhbFNjaGVtYS5maWVsZHMpIHtcbiAgICAgIE9iamVjdC5rZXlzKGxvY2FsU2NoZW1hLmZpZWxkcylcbiAgICAgICAgLmZpbHRlcihmaWVsZE5hbWUgPT4gIXRoaXMuaXNQcm90ZWN0ZWRGaWVsZHMobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBmaWVsZE5hbWUpKVxuICAgICAgICAuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgIGNvbnN0IHsgdHlwZSwgLi4ub3RoZXJzIH0gPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICBpZiAoIWNsb3VkU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKVxuICAgICAgICAgICAgdGhpcy5oYW5kbGVGaWVsZHMobmV3TG9jYWxTY2hlbWEsIGZpZWxkTmFtZSwgdHlwZSwgb3RoZXJzKTtcbiAgICAgICAgfSk7XG4gICAgfVxuXG4gICAgY29uc3QgZmllbGRzVG9EZWxldGUgPSBbXTtcbiAgICBjb25zdCBmaWVsZHNUb1JlY3JlYXRlID0gW107XG4gICAgY29uc3QgZmllbGRzV2l0aENoYW5nZWRQYXJhbXMgPSBbXTtcblxuICAgIC8vIENoZWNrIGRlbGV0aW9uXG4gICAgT2JqZWN0LmtleXMoY2xvdWRTY2hlbWEuZmllbGRzKVxuICAgICAgLmZpbHRlcihmaWVsZE5hbWUgPT4gIXRoaXMuaXNQcm90ZWN0ZWRGaWVsZHMobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBmaWVsZE5hbWUpKVxuICAgICAgLmZvckVhY2goYXN5bmMgZmllbGROYW1lID0+IHtcbiAgICAgICAgY29uc3QgZmllbGQgPSBjbG91ZFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgaWYgKCFsb2NhbFNjaGVtYS5maWVsZHMgfHwgIWxvY2FsU2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgZmllbGRzVG9EZWxldGUucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIHJldHVybjtcbiAgICAgICAgfVxuXG4gICAgICAgIGNvbnN0IGxvY2FsRmllbGQgPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgLy8gQ2hlY2sgaWYgZmllbGQgaGFzIGEgY2hhbmdlZCB0eXBlXG4gICAgICAgIGlmIChcbiAgICAgICAgICAhdGhpcy5wYXJhbXNBcmVFcXVhbHMoXG4gICAgICAgICAgICB7IHR5cGU6IGZpZWxkLnR5cGUsIHRhcmdldENsYXNzOiBmaWVsZC50YXJnZXRDbGFzcyB9LFxuICAgICAgICAgICAgeyB0eXBlOiBsb2NhbEZpZWxkLnR5cGUsIHRhcmdldENsYXNzOiBsb2NhbEZpZWxkLnRhcmdldENsYXNzIH1cbiAgICAgICAgICApXG4gICAgICAgICkge1xuICAgICAgICAgIGZpZWxkc1RvUmVjcmVhdGUucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIGZpZWxkc1RvRGVsZXRlLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICByZXR1cm47XG4gICAgICAgIH1cblxuICAgICAgICAvLyBDaGVjayBpZiBzb21ldGhpbmcgY2hhbmdlZCBvdGhlciB0aGFuIHRoZSB0eXBlIChsaWtlIHJlcXVpcmVkLCBkZWZhdWx0VmFsdWUpXG4gICAgICAgIGlmICghdGhpcy5wYXJhbXNBcmVFcXVhbHMoZmllbGQsIGxvY2FsRmllbGQpKSB7XG4gICAgICAgICAgZmllbGRzV2l0aENoYW5nZWRQYXJhbXMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICB9XG4gICAgICB9KTtcblxuICAgIGZpZWxkc1RvRGVsZXRlLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIG5ld0xvY2FsU2NoZW1hLmRlbGV0ZUZpZWxkKGZpZWxkTmFtZSk7XG4gICAgfSk7XG5cbiAgICAvLyBEZWxldGUgZmllbGRzIGZyb20gdGhlIHNjaGVtYSB0aGVuIGFwcGx5IGNoYW5nZXNcbiAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYVRvREIobmV3TG9jYWxTY2hlbWEpO1xuXG4gICAgZmllbGRzVG9SZWNyZWF0ZS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICBjb25zdCB7IHR5cGUsIC4uLm90aGVycyB9ID0gbG9jYWxTY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICB0aGlzLmhhbmRsZUZpZWxkcyhuZXdMb2NhbFNjaGVtYSwgZmllbGROYW1lLCB0eXBlLCBvdGhlcnMpO1xuICAgIH0pO1xuICAgIGZpZWxkc1dpdGhDaGFuZ2VkUGFyYW1zLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGNvbnN0IHsgdHlwZSwgLi4ub3RoZXJzIH0gPSBsb2NhbFNjaGVtYS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgIHRoaXMuaGFuZGxlRmllbGRzKG5ld0xvY2FsU2NoZW1hLCBmaWVsZE5hbWUsIHR5cGUsIG90aGVycyk7XG4gICAgfSk7XG5cbiAgICAvLyBIYW5kbGUgSW5kZXhlc1xuICAgIC8vIENoZWNrIGFkZGl0aW9uXG4gICAgaWYgKGxvY2FsU2NoZW1hLmluZGV4ZXMpIHtcbiAgICAgIE9iamVjdC5rZXlzKGxvY2FsU2NoZW1hLmluZGV4ZXMpLmZvckVhY2goaW5kZXhOYW1lID0+IHtcbiAgICAgICAgaWYgKFxuICAgICAgICAgICghY2xvdWRTY2hlbWEuaW5kZXhlcyB8fCAhY2xvdWRTY2hlbWEuaW5kZXhlc1tpbmRleE5hbWVdKSAmJlxuICAgICAgICAgICF0aGlzLmlzUHJvdGVjdGVkSW5kZXgobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBpbmRleE5hbWUpXG4gICAgICAgIClcbiAgICAgICAgICBuZXdMb2NhbFNjaGVtYS5hZGRJbmRleChpbmRleE5hbWUsIGxvY2FsU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSk7XG4gICAgICB9KTtcbiAgICB9XG5cbiAgICBjb25zdCBpbmRleGVzVG9BZGQgPSBbXTtcblxuICAgIC8vIENoZWNrIGRlbGV0aW9uXG4gICAgaWYgKGNsb3VkU2NoZW1hLmluZGV4ZXMpIHtcbiAgICAgIE9iamVjdC5rZXlzKGNsb3VkU2NoZW1hLmluZGV4ZXMpLmZvckVhY2goYXN5bmMgaW5kZXhOYW1lID0+IHtcbiAgICAgICAgaWYgKCF0aGlzLmlzUHJvdGVjdGVkSW5kZXgobG9jYWxTY2hlbWEuY2xhc3NOYW1lLCBpbmRleE5hbWUpKSB7XG4gICAgICAgICAgaWYgKCFsb2NhbFNjaGVtYS5pbmRleGVzIHx8ICFsb2NhbFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0pIHtcbiAgICAgICAgICAgIG5ld0xvY2FsU2NoZW1hLmRlbGV0ZUluZGV4KGluZGV4TmFtZSk7XG4gICAgICAgICAgfSBlbHNlIGlmIChcbiAgICAgICAgICAgICF0aGlzLnBhcmFtc0FyZUVxdWFscyhsb2NhbFNjaGVtYS5pbmRleGVzW2luZGV4TmFtZV0sIGNsb3VkU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSlcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIG5ld0xvY2FsU2NoZW1hLmRlbGV0ZUluZGV4KGluZGV4TmFtZSk7XG4gICAgICAgICAgICBpbmRleGVzVG9BZGQucHVzaCh7XG4gICAgICAgICAgICAgIGluZGV4TmFtZSxcbiAgICAgICAgICAgICAgaW5kZXg6IGxvY2FsU2NoZW1hLmluZGV4ZXNbaW5kZXhOYW1lXSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfSk7XG4gICAgfVxuXG4gICAgdGhpcy5oYW5kbGVDTFAobG9jYWxTY2hlbWEsIG5ld0xvY2FsU2NoZW1hLCBjbG91ZFNjaGVtYSk7XG4gICAgLy8gQXBwbHkgY2hhbmdlc1xuICAgIGF3YWl0IHRoaXMudXBkYXRlU2NoZW1hVG9EQihuZXdMb2NhbFNjaGVtYSk7XG4gICAgLy8gQXBwbHkgbmV3L2NoYW5nZWQgaW5kZXhlc1xuICAgIGlmIChpbmRleGVzVG9BZGQubGVuZ3RoKSB7XG4gICAgICBpbmRleGVzVG9BZGQuZm9yRWFjaChvID0+IG5ld0xvY2FsU2NoZW1hLmFkZEluZGV4KG8uaW5kZXhOYW1lLCBvLmluZGV4KSk7XG4gICAgICBhd2FpdCB0aGlzLnVwZGF0ZVNjaGVtYVRvREIobmV3TG9jYWxTY2hlbWEpO1xuICAgIH1cbiAgfVxuXG4gIGhhbmRsZUNMUChsb2NhbFNjaGVtYSwgbmV3TG9jYWxTY2hlbWEsIGNsb3VkU2NoZW1hKSB7XG4gICAgaWYgKCFsb2NhbFNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMgJiYgIWNsb3VkU2NoZW1hKSB7XG4gICAgICBsb2dnZXIud2FybihgY2xhc3NMZXZlbFBlcm1pc3Npb25zIG5vdCBwcm92aWRlZCBmb3IgJHtsb2NhbFNjaGVtYS5jbGFzc05hbWV9LmApO1xuICAgIH1cbiAgICAvLyBVc2Ugc3ByZWFkIHRvIGF2b2lkIHJlYWQgb25seSBpc3N1ZSAoZW5jb3VudGVyZWQgYnkgTW91bW91bHMgdXNpbmcgZGlyZWN0QWNjZXNzKVxuICAgIGNvbnN0IGNscCA9IHsgLi4ubG9jYWxTY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zIH0gfHwge307XG4gICAgY29uc3QgY2xvdWRDTFAgPSAoY2xvdWRTY2hlbWEgJiYgY2xvdWRTY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zKSB8fCB7fTtcbiAgICAvLyBUcnkgdG8gaW5qZWN0IGRlZmF1bHQgQ0xQc1xuICAgIGNvbnN0IENMUEtleXMgPSBbJ2ZpbmQnLCAnY291bnQnLCAnZ2V0JywgJ2NyZWF0ZScsICd1cGRhdGUnLCAnZGVsZXRlJywgJ2FkZEZpZWxkJ107XG4gICAgQ0xQS2V5cy5mb3JFYWNoKGtleSA9PiB7XG4gICAgICBpZiAoIWNscFtrZXldKSB7XG4gICAgICAgIGNscFtrZXldID0gY2xvdWRDTFBba2V5XSB8fCB7ICcqJzogdHJ1ZSB9O1xuICAgICAgfVxuICAgIH0pO1xuICAgIC8vIFRvIGF2b2lkIGluY29uc2lzdGVuY3kgd2UgbmVlZCB0byByZW1vdmUgYWxsIHJpZ2h0cyBvbiBhZGRGaWVsZFxuICAgIGNscC5hZGRGaWVsZCA9IHt9O1xuICAgIG5ld0xvY2FsU2NoZW1hLnNldENMUChjbHApO1xuICB9XG5cbiAgaXNQcm90ZWN0ZWRGaWVsZHMoY2xhc3NOYW1lLCBmaWVsZE5hbWUpIHtcbiAgICByZXR1cm4gKFxuICAgICAgISFkZWZhdWx0Q29sdW1ucy5fRGVmYXVsdFtmaWVsZE5hbWVdIHx8XG4gICAgICAhIShkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdICYmIGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV1bZmllbGROYW1lXSlcbiAgICApO1xuICB9XG5cbiAgaXNQcm90ZWN0ZWRJbmRleChjbGFzc05hbWUsIGluZGV4TmFtZSkge1xuICAgIGxldCBpbmRleGVzID0gWydfaWRfJ107XG4gICAgaWYgKGNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgICAgaW5kZXhlcyA9IFtcbiAgICAgICAgLi4uaW5kZXhlcyxcbiAgICAgICAgJ2Nhc2VfaW5zZW5zaXRpdmVfdXNlcm5hbWUnLFxuICAgICAgICAnY2FzZV9pbnNlbnNpdGl2ZV9lbWFpbCcsXG4gICAgICAgICd1c2VybmFtZV8xJyxcbiAgICAgICAgJ2VtYWlsXzEnLFxuICAgICAgXTtcbiAgICB9XG5cbiAgICByZXR1cm4gaW5kZXhlcy5pbmRleE9mKGluZGV4TmFtZSkgIT09IC0xO1xuICB9XG5cbiAgcGFyYW1zQXJlRXF1YWxzKGluZGV4QSwgaW5kZXhCKSB7XG4gICAgY29uc3Qga2V5c0luZGV4QSA9IE9iamVjdC5rZXlzKGluZGV4QSk7XG4gICAgY29uc3Qga2V5c0luZGV4QiA9IE9iamVjdC5rZXlzKGluZGV4Qik7XG5cbiAgICAvLyBDaGVjayBrZXkgbmFtZVxuICAgIGlmIChrZXlzSW5kZXhBLmxlbmd0aCAhPT0ga2V5c0luZGV4Qi5sZW5ndGgpIHJldHVybiBmYWxzZTtcbiAgICByZXR1cm4ga2V5c0luZGV4QS5ldmVyeShrID0+IGluZGV4QVtrXSA9PT0gaW5kZXhCW2tdKTtcbiAgfVxuXG4gIGhhbmRsZUZpZWxkcyhuZXdMb2NhbFNjaGVtYSwgZmllbGROYW1lLCB0eXBlLCBvdGhlcnMpIHtcbiAgICBpZiAodHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgbmV3TG9jYWxTY2hlbWEuYWRkUmVsYXRpb24oZmllbGROYW1lLCBvdGhlcnMudGFyZ2V0Q2xhc3MpO1xuICAgIH0gZWxzZSBpZiAodHlwZSA9PT0gJ1BvaW50ZXInKSB7XG4gICAgICBjb25zdCB7IHRhcmdldENsYXNzLCAuLi5vdGhlcnMyIH0gPSBvdGhlcnM7XG4gICAgICBuZXdMb2NhbFNjaGVtYS5hZGRQb2ludGVyKGZpZWxkTmFtZSwgdGFyZ2V0Q2xhc3MsIG90aGVyczIpO1xuICAgIH0gZWxzZSB7XG4gICAgICBuZXdMb2NhbFNjaGVtYS5hZGRGaWVsZChmaWVsZE5hbWUsIHR5cGUsIG90aGVycyk7XG4gICAgfVxuICB9XG59XG4iXX0=