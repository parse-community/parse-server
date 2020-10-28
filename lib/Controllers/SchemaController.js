"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.classNameIsValid = classNameIsValid;
exports.fieldNameIsValid = fieldNameIsValid;
exports.invalidClassNameMessage = invalidClassNameMessage;
exports.buildMergedSchemaObject = buildMergedSchemaObject;
exports.VolatileClassesSchemas = exports.convertSchemaToAdapterSchema = exports.defaultColumns = exports.systemClasses = exports.load = exports.SchemaController = exports.default = void 0;

var _StorageAdapter = require("../Adapters/Storage/StorageAdapter");

var _DatabaseController = _interopRequireDefault(require("./DatabaseController"));

var _Config = _interopRequireDefault(require("../Config"));

var _deepcopy = _interopRequireDefault(require("deepcopy"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

function _extends() { _extends = Object.assign || function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }

// This class handles schema validation, persistence, and modification.
//
// Each individual Schema object should be immutable. The helpers to
// do things with the Schema just return a new schema when the schema
// is changed.
//
// The canonical place to store this Schema is in the database itself,
// in a _SCHEMA collection. This is not the right way to do it for an
// open source framework, but it's backward compatible, so we're
// keeping it this way for now.
//
// In API-handling code, you should only use the Schema class via the
// DatabaseController. This will let us replace the schema logic for
// different databases.
// TODO: hide all schema logic inside the database adapter.
// -disable-next
const Parse = require('parse/node').Parse;

const defaultColumns = Object.freeze({
  // Contain the default columns for every parse object type (except _Join collection)
  _Default: {
    objectId: {
      type: 'String'
    },
    createdAt: {
      type: 'Date'
    },
    updatedAt: {
      type: 'Date'
    },
    ACL: {
      type: 'ACL'
    }
  },
  // The additional default columns for the _User collection (in addition to DefaultCols)
  _User: {
    username: {
      type: 'String'
    },
    password: {
      type: 'String'
    },
    email: {
      type: 'String'
    },
    emailVerified: {
      type: 'Boolean'
    },
    authData: {
      type: 'Object'
    }
  },
  // The additional default columns for the _Installation collection (in addition to DefaultCols)
  _Installation: {
    installationId: {
      type: 'String'
    },
    deviceToken: {
      type: 'String'
    },
    channels: {
      type: 'Array'
    },
    deviceType: {
      type: 'String'
    },
    pushType: {
      type: 'String'
    },
    GCMSenderId: {
      type: 'String'
    },
    timeZone: {
      type: 'String'
    },
    localeIdentifier: {
      type: 'String'
    },
    badge: {
      type: 'Number'
    },
    appVersion: {
      type: 'String'
    },
    appName: {
      type: 'String'
    },
    appIdentifier: {
      type: 'String'
    },
    parseVersion: {
      type: 'String'
    }
  },
  // The additional default columns for the _Role collection (in addition to DefaultCols)
  _Role: {
    name: {
      type: 'String'
    },
    users: {
      type: 'Relation',
      targetClass: '_User'
    },
    roles: {
      type: 'Relation',
      targetClass: '_Role'
    }
  },
  // The additional default columns for the _Session collection (in addition to DefaultCols)
  _Session: {
    restricted: {
      type: 'Boolean'
    },
    user: {
      type: 'Pointer',
      targetClass: '_User'
    },
    installationId: {
      type: 'String'
    },
    sessionToken: {
      type: 'String'
    },
    expiresAt: {
      type: 'Date'
    },
    createdWith: {
      type: 'Object'
    }
  },
  _Product: {
    productIdentifier: {
      type: 'String'
    },
    download: {
      type: 'File'
    },
    downloadName: {
      type: 'String'
    },
    icon: {
      type: 'File'
    },
    order: {
      type: 'Number'
    },
    title: {
      type: 'String'
    },
    subtitle: {
      type: 'String'
    }
  },
  _PushStatus: {
    pushTime: {
      type: 'String'
    },
    source: {
      type: 'String'
    },
    // rest or webui
    query: {
      type: 'String'
    },
    // the stringified JSON query
    payload: {
      type: 'String'
    },
    // the stringified JSON payload,
    title: {
      type: 'String'
    },
    expiry: {
      type: 'Number'
    },
    expiration_interval: {
      type: 'Number'
    },
    status: {
      type: 'String'
    },
    numSent: {
      type: 'Number'
    },
    numFailed: {
      type: 'Number'
    },
    pushHash: {
      type: 'String'
    },
    errorMessage: {
      type: 'Object'
    },
    sentPerType: {
      type: 'Object'
    },
    failedPerType: {
      type: 'Object'
    },
    sentPerUTCOffset: {
      type: 'Object'
    },
    failedPerUTCOffset: {
      type: 'Object'
    },
    count: {
      type: 'Number'
    } // tracks # of batches queued and pending

  },
  _JobStatus: {
    jobName: {
      type: 'String'
    },
    source: {
      type: 'String'
    },
    status: {
      type: 'String'
    },
    message: {
      type: 'String'
    },
    params: {
      type: 'Object'
    },
    // params received when calling the job
    finishedAt: {
      type: 'Date'
    }
  },
  _JobSchedule: {
    jobName: {
      type: 'String'
    },
    description: {
      type: 'String'
    },
    params: {
      type: 'String'
    },
    startAfter: {
      type: 'String'
    },
    daysOfWeek: {
      type: 'Array'
    },
    timeOfDay: {
      type: 'String'
    },
    lastRun: {
      type: 'Number'
    },
    repeatMinutes: {
      type: 'Number'
    }
  },
  _Hooks: {
    functionName: {
      type: 'String'
    },
    className: {
      type: 'String'
    },
    triggerName: {
      type: 'String'
    },
    url: {
      type: 'String'
    }
  },
  _GlobalConfig: {
    objectId: {
      type: 'String'
    },
    params: {
      type: 'Object'
    },
    masterKeyOnly: {
      type: 'Object'
    }
  },
  _GraphQLConfig: {
    objectId: {
      type: 'String'
    },
    config: {
      type: 'Object'
    }
  },
  _Audience: {
    objectId: {
      type: 'String'
    },
    name: {
      type: 'String'
    },
    query: {
      type: 'String'
    },
    //storing query as JSON string to prevent "Nested keys should not contain the '$' or '.' characters" error
    lastUsed: {
      type: 'Date'
    },
    timesUsed: {
      type: 'Number'
    }
  },
  _Idempotency: {
    reqId: {
      type: 'String'
    },
    expire: {
      type: 'Date'
    }
  }
});
exports.defaultColumns = defaultColumns;
const requiredColumns = Object.freeze({
  _Product: ['productIdentifier', 'icon', 'order', 'title', 'subtitle'],
  _Role: ['name', 'ACL']
});
const systemClasses = Object.freeze(['_User', '_Installation', '_Role', '_Session', '_Product', '_PushStatus', '_JobStatus', '_JobSchedule', '_Audience', '_Idempotency']);
exports.systemClasses = systemClasses;
const volatileClasses = Object.freeze(['_JobStatus', '_PushStatus', '_Hooks', '_GlobalConfig', '_GraphQLConfig', '_JobSchedule', '_Audience', '_Idempotency']); // Anything that start with role

const roleRegex = /^role:.*/; // Anything that starts with userField (allowed for protected fields only)

const protectedFieldsPointerRegex = /^userField:.*/; // * permission

const publicRegex = /^\*$/;
const authenticatedRegex = /^authenticated$/;
const requiresAuthenticationRegex = /^requiresAuthentication$/;
const clpPointerRegex = /^pointerFields$/; // regex for validating entities in protectedFields object

const protectedFieldsRegex = Object.freeze([protectedFieldsPointerRegex, publicRegex, authenticatedRegex, roleRegex]); // clp regex

const clpFieldsRegex = Object.freeze([clpPointerRegex, publicRegex, requiresAuthenticationRegex, roleRegex]);

function validatePermissionKey(key, userIdRegExp) {
  let matchesSome = false;

  for (const regEx of clpFieldsRegex) {
    if (key.match(regEx) !== null) {
      matchesSome = true;
      break;
    }
  } // userId depends on startup options so it's dynamic


  const valid = matchesSome || key.match(userIdRegExp) !== null;

  if (!valid) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `'${key}' is not a valid key for class level permissions`);
  }
}

function validateProtectedFieldsKey(key, userIdRegExp) {
  let matchesSome = false;

  for (const regEx of protectedFieldsRegex) {
    if (key.match(regEx) !== null) {
      matchesSome = true;
      break;
    }
  } // userId regex depends on launch options so it's dynamic


  const valid = matchesSome || key.match(userIdRegExp) !== null;

  if (!valid) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `'${key}' is not a valid key for class level permissions`);
  }
}

const CLPValidKeys = Object.freeze(['find', 'count', 'get', 'create', 'update', 'delete', 'addField', 'readUserFields', 'writeUserFields', 'protectedFields']); // validation before setting class-level permissions on collection

function validateCLP(perms, fields, userIdRegExp) {
  if (!perms) {
    return;
  }

  for (const operationKey in perms) {
    if (CLPValidKeys.indexOf(operationKey) == -1) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `${operationKey} is not a valid operation for class level permissions`);
    }

    const operation = perms[operationKey]; // proceed with next operationKey
    // throws when root fields are of wrong type

    validateCLPjson(operation, operationKey);

    if (operationKey === 'readUserFields' || operationKey === 'writeUserFields') {
      // validate grouped pointer permissions
      // must be an array with field names
      for (const fieldName of operation) {
        validatePointerPermission(fieldName, fields, operationKey);
      } // readUserFields and writerUserFields do not have nesdted fields
      // proceed with next operationKey


      continue;
    } // validate protected fields


    if (operationKey === 'protectedFields') {
      for (const entity in operation) {
        // throws on unexpected key
        validateProtectedFieldsKey(entity, userIdRegExp);
        const protectedFields = operation[entity];

        if (!Array.isArray(protectedFields)) {
          throw new Parse.Error(Parse.Error.INVALID_JSON, `'${protectedFields}' is not a valid value for protectedFields[${entity}] - expected an array.`);
        } // if the field is in form of array


        for (const field of protectedFields) {
          // do not alloow to protect default fields
          if (defaultColumns._Default[field]) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `Default field '${field}' can not be protected`);
          } // field should exist on collection


          if (!Object.prototype.hasOwnProperty.call(fields, field)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `Field '${field}' in protectedFields:${entity} does not exist`);
          }
        }
      } // proceed with next operationKey


      continue;
    } // validate other fields
    // Entity can be:
    // "*" - Public,
    // "requiresAuthentication" - authenticated users,
    // "objectId" - _User id,
    // "role:rolename",
    // "pointerFields" - array of field names containing pointers to users


    for (const entity in operation) {
      // throws on unexpected key
      validatePermissionKey(entity, userIdRegExp); // entity can be either:
      // "pointerFields": string[]

      if (entity === 'pointerFields') {
        const pointerFields = operation[entity];

        if (Array.isArray(pointerFields)) {
          for (const pointerField of pointerFields) {
            validatePointerPermission(pointerField, fields, operation);
          }
        } else {
          throw new Parse.Error(Parse.Error.INVALID_JSON, `'${pointerFields}' is not a valid value for ${operationKey}[${entity}] - expected an array.`);
        } // proceed with next entity key


        continue;
      } // or [entity]: boolean


      const permit = operation[entity];

      if (permit !== true) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, `'${permit}' is not a valid value for class level permissions ${operationKey}:${entity}:${permit}`);
      }
    }
  }
}

function validateCLPjson(operation, operationKey) {
  if (operationKey === 'readUserFields' || operationKey === 'writeUserFields') {
    if (!Array.isArray(operation)) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `'${operation}' is not a valid value for class level permissions ${operationKey} - must be an array`);
    }
  } else {
    if (typeof operation === 'object' && operation !== null) {
      // ok to proceed
      return;
    } else {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `'${operation}' is not a valid value for class level permissions ${operationKey} - must be an object`);
    }
  }
}

function validatePointerPermission(fieldName, fields, operation) {
  // Uses collection schema to ensure the field is of type:
  // - Pointer<_User> (pointers)
  // - Array
  //
  //    It's not possible to enforce type on Array's items in schema
  //  so we accept any Array field, and later when applying permissions
  //  only items that are pointers to _User are considered.
  if (!(fields[fieldName] && (fields[fieldName].type == 'Pointer' && fields[fieldName].targetClass == '_User' || fields[fieldName].type == 'Array'))) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `'${fieldName}' is not a valid column for class level pointer permissions ${operation}`);
  }
}

const joinClassRegex = /^_Join:[A-Za-z0-9_]+:[A-Za-z0-9_]+/;
const classAndFieldRegex = /^[A-Za-z][A-Za-z0-9_]*$/;

function classNameIsValid(className) {
  // Valid classes must:
  return (// Be one of _User, _Installation, _Role, _Session OR
    systemClasses.indexOf(className) > -1 || // Be a join table OR
    joinClassRegex.test(className) || // Include only alpha-numeric and underscores, and not start with an underscore or number
    fieldNameIsValid(className)
  );
} // Valid fields must be alpha-numeric, and not start with an underscore or number


function fieldNameIsValid(fieldName) {
  return classAndFieldRegex.test(fieldName);
} // Checks that it's not trying to clobber one of the default fields of the class.


function fieldNameIsValidForClass(fieldName, className) {
  if (!fieldNameIsValid(fieldName)) {
    return false;
  }

  if (defaultColumns._Default[fieldName]) {
    return false;
  }

  if (defaultColumns[className] && defaultColumns[className][fieldName]) {
    return false;
  }

  return true;
}

function invalidClassNameMessage(className) {
  return 'Invalid classname: ' + className + ', classnames can only have alphanumeric characters and _, and must start with an alpha character ';
}

const invalidJsonError = new Parse.Error(Parse.Error.INVALID_JSON, 'invalid JSON');
const validNonRelationOrPointerTypes = ['Number', 'String', 'Boolean', 'Date', 'Object', 'Array', 'GeoPoint', 'File', 'Bytes', 'Polygon']; // Returns an error suitable for throwing if the type is invalid

const fieldTypeIsInvalid = ({
  type,
  targetClass
}) => {
  if (['Pointer', 'Relation'].indexOf(type) >= 0) {
    if (!targetClass) {
      return new Parse.Error(135, `type ${type} needs a class name`);
    } else if (typeof targetClass !== 'string') {
      return invalidJsonError;
    } else if (!classNameIsValid(targetClass)) {
      return new Parse.Error(Parse.Error.INVALID_CLASS_NAME, invalidClassNameMessage(targetClass));
    } else {
      return undefined;
    }
  }

  if (typeof type !== 'string') {
    return invalidJsonError;
  }

  if (validNonRelationOrPointerTypes.indexOf(type) < 0) {
    return new Parse.Error(Parse.Error.INCORRECT_TYPE, `invalid field type: ${type}`);
  }

  return undefined;
};

const convertSchemaToAdapterSchema = schema => {
  schema = injectDefaultSchema(schema);
  delete schema.fields.ACL;
  schema.fields._rperm = {
    type: 'Array'
  };
  schema.fields._wperm = {
    type: 'Array'
  };

  if (schema.className === '_User') {
    delete schema.fields.password;
    schema.fields._hashed_password = {
      type: 'String'
    };
  }

  return schema;
};

exports.convertSchemaToAdapterSchema = convertSchemaToAdapterSchema;

const convertAdapterSchemaToParseSchema = (_ref) => {
  let schema = _extends({}, _ref);

  delete schema.fields._rperm;
  delete schema.fields._wperm;
  schema.fields.ACL = {
    type: 'ACL'
  };

  if (schema.className === '_User') {
    delete schema.fields.authData; //Auth data is implicit

    delete schema.fields._hashed_password;
    schema.fields.password = {
      type: 'String'
    };
  }

  if (schema.indexes && Object.keys(schema.indexes).length === 0) {
    delete schema.indexes;
  }

  return schema;
};

class SchemaData {
  constructor(allSchemas = [], protectedFields = {}) {
    this.__data = {};
    this.__protectedFields = protectedFields;
    allSchemas.forEach(schema => {
      if (volatileClasses.includes(schema.className)) {
        return;
      }

      Object.defineProperty(this, schema.className, {
        get: () => {
          if (!this.__data[schema.className]) {
            const data = {};
            data.fields = injectDefaultSchema(schema).fields;
            data.classLevelPermissions = (0, _deepcopy.default)(schema.classLevelPermissions);
            data.indexes = schema.indexes;
            const classProtectedFields = this.__protectedFields[schema.className];

            if (classProtectedFields) {
              for (const key in classProtectedFields) {
                const unq = new Set([...(data.classLevelPermissions.protectedFields[key] || []), ...classProtectedFields[key]]);
                data.classLevelPermissions.protectedFields[key] = Array.from(unq);
              }
            }

            this.__data[schema.className] = data;
          }

          return this.__data[schema.className];
        }
      });
    }); // Inject the in-memory classes

    volatileClasses.forEach(className => {
      Object.defineProperty(this, className, {
        get: () => {
          if (!this.__data[className]) {
            const schema = injectDefaultSchema({
              className,
              fields: {},
              classLevelPermissions: {}
            });
            const data = {};
            data.fields = schema.fields;
            data.classLevelPermissions = schema.classLevelPermissions;
            data.indexes = schema.indexes;
            this.__data[className] = data;
          }

          return this.__data[className];
        }
      });
    });
  }

}

const injectDefaultSchema = ({
  className,
  fields,
  classLevelPermissions,
  indexes
}) => {
  const defaultSchema = {
    className,
    fields: _objectSpread(_objectSpread(_objectSpread({}, defaultColumns._Default), defaultColumns[className] || {}), fields),
    classLevelPermissions
  };

  if (indexes && Object.keys(indexes).length !== 0) {
    defaultSchema.indexes = indexes;
  }

  return defaultSchema;
};

const _HooksSchema = {
  className: '_Hooks',
  fields: defaultColumns._Hooks
};
const _GlobalConfigSchema = {
  className: '_GlobalConfig',
  fields: defaultColumns._GlobalConfig
};
const _GraphQLConfigSchema = {
  className: '_GraphQLConfig',
  fields: defaultColumns._GraphQLConfig
};

const _PushStatusSchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: '_PushStatus',
  fields: {},
  classLevelPermissions: {}
}));

const _JobStatusSchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: '_JobStatus',
  fields: {},
  classLevelPermissions: {}
}));

const _JobScheduleSchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: '_JobSchedule',
  fields: {},
  classLevelPermissions: {}
}));

const _AudienceSchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: '_Audience',
  fields: defaultColumns._Audience,
  classLevelPermissions: {}
}));

const _IdempotencySchema = convertSchemaToAdapterSchema(injectDefaultSchema({
  className: '_Idempotency',
  fields: defaultColumns._Idempotency,
  classLevelPermissions: {}
}));

const VolatileClassesSchemas = [_HooksSchema, _JobStatusSchema, _JobScheduleSchema, _PushStatusSchema, _GlobalConfigSchema, _GraphQLConfigSchema, _AudienceSchema, _IdempotencySchema];
exports.VolatileClassesSchemas = VolatileClassesSchemas;

const dbTypeMatchesObjectType = (dbType, objectType) => {
  if (dbType.type !== objectType.type) return false;
  if (dbType.targetClass !== objectType.targetClass) return false;
  if (dbType === objectType.type) return true;
  if (dbType.type === objectType.type) return true;
  return false;
};

const typeToString = type => {
  if (typeof type === 'string') {
    return type;
  }

  if (type.targetClass) {
    return `${type.type}<${type.targetClass}>`;
  }

  return `${type.type}`;
}; // Stores the entire schema of the app in a weird hybrid format somewhere between
// the mongo format and the Parse format. Soon, this will all be Parse format.


class SchemaController {
  constructor(databaseAdapter, schemaCache) {
    this._dbAdapter = databaseAdapter;
    this._cache = schemaCache;
    this.schemaData = new SchemaData();
    this.protectedFields = _Config.default.get(Parse.applicationId).protectedFields;

    const customIds = _Config.default.get(Parse.applicationId).allowCustomObjectId;

    const customIdRegEx = /^.{1,}$/u; // 1+ chars

    const autoIdRegEx = /^[a-zA-Z0-9]{1,}$/;
    this.userIdRegEx = customIds ? customIdRegEx : autoIdRegEx;
  }

  reloadData(options = {
    clearCache: false
  }) {
    if (this.reloadDataPromise && !options.clearCache) {
      return this.reloadDataPromise;
    }

    this.reloadDataPromise = this.getAllClasses(options).then(allSchemas => {
      this.schemaData = new SchemaData(allSchemas, this.protectedFields);
      delete this.reloadDataPromise;
    }, err => {
      this.schemaData = new SchemaData();
      delete this.reloadDataPromise;
      throw err;
    }).then(() => {});
    return this.reloadDataPromise;
  }

  getAllClasses(options = {
    clearCache: false
  }) {
    if (options.clearCache) {
      return this.setAllClasses();
    }

    return this._cache.getAllClasses().then(allClasses => {
      if (allClasses && allClasses.length) {
        return Promise.resolve(allClasses);
      }

      return this.setAllClasses();
    });
  }

  setAllClasses() {
    return this._dbAdapter.getAllClasses().then(allSchemas => allSchemas.map(injectDefaultSchema)).then(allSchemas => {
      /* eslint-disable no-console */
      this._cache.setAllClasses(allSchemas).catch(error => console.error('Error saving schema to cache:', error));
      /* eslint-enable no-console */


      return allSchemas;
    });
  }

  getOneSchema(className, allowVolatileClasses = false, options = {
    clearCache: false
  }) {
    let promise = Promise.resolve();

    if (options.clearCache) {
      promise = this._cache.clear();
    }

    return promise.then(() => {
      if (allowVolatileClasses && volatileClasses.indexOf(className) > -1) {
        const data = this.schemaData[className];
        return Promise.resolve({
          className,
          fields: data.fields,
          classLevelPermissions: data.classLevelPermissions,
          indexes: data.indexes
        });
      }

      return this._cache.getOneSchema(className).then(cached => {
        if (cached && !options.clearCache) {
          return Promise.resolve(cached);
        }

        return this.setAllClasses().then(allSchemas => {
          const oneSchema = allSchemas.find(schema => schema.className === className);

          if (!oneSchema) {
            return Promise.reject(undefined);
          }

          return oneSchema;
        });
      });
    });
  } // Create a new class that includes the three default fields.
  // ACL is an implicit column that does not get an entry in the
  // _SCHEMAS database. Returns a promise that resolves with the
  // created schema, in mongo format.
  // on success, and rejects with an error on fail. Ensure you
  // have authorization (master key, or client class creation
  // enabled) before calling this function.


  addClassIfNotExists(className, fields = {}, classLevelPermissions, indexes = {}) {
    var validationError = this.validateNewClass(className, fields, classLevelPermissions);

    if (validationError) {
      if (validationError instanceof Parse.Error) {
        return Promise.reject(validationError);
      } else if (validationError.code && validationError.error) {
        return Promise.reject(new Parse.Error(validationError.code, validationError.error));
      }

      return Promise.reject(validationError);
    }

    return this._dbAdapter.createClass(className, convertSchemaToAdapterSchema({
      fields,
      classLevelPermissions,
      indexes,
      className
    })).then(convertAdapterSchemaToParseSchema).catch(error => {
      if (error && error.code === Parse.Error.DUPLICATE_VALUE) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} already exists.`);
      } else {
        throw error;
      }
    });
  }

  updateClass(className, submittedFields, classLevelPermissions, indexes, database) {
    return this.getOneSchema(className).then(schema => {
      const existingFields = schema.fields;
      Object.keys(submittedFields).forEach(name => {
        const field = submittedFields[name];

        if (existingFields[name] && field.__op !== 'Delete') {
          throw new Parse.Error(255, `Field ${name} exists, cannot update.`);
        }

        if (!existingFields[name] && field.__op === 'Delete') {
          throw new Parse.Error(255, `Field ${name} does not exist, cannot delete.`);
        }
      });
      delete existingFields._rperm;
      delete existingFields._wperm;
      const newSchema = buildMergedSchemaObject(existingFields, submittedFields);
      const defaultFields = defaultColumns[className] || defaultColumns._Default;
      const fullNewSchema = Object.assign({}, newSchema, defaultFields);
      const validationError = this.validateSchemaData(className, newSchema, classLevelPermissions, Object.keys(existingFields));

      if (validationError) {
        throw new Parse.Error(validationError.code, validationError.error);
      } // Finally we have checked to make sure the request is valid and we can start deleting fields.
      // Do all deletions first, then a single save to _SCHEMA collection to handle all additions.


      const deletedFields = [];
      const insertedFields = [];
      Object.keys(submittedFields).forEach(fieldName => {
        if (submittedFields[fieldName].__op === 'Delete') {
          deletedFields.push(fieldName);
        } else {
          insertedFields.push(fieldName);
        }
      });
      let deletePromise = Promise.resolve();

      if (deletedFields.length > 0) {
        deletePromise = this.deleteFields(deletedFields, className, database);
      }

      let enforceFields = [];
      return deletePromise // Delete Everything
      .then(() => this.reloadData({
        clearCache: true
      })) // Reload our Schema, so we have all the new values
      .then(() => {
        const promises = insertedFields.map(fieldName => {
          const type = submittedFields[fieldName];
          return this.enforceFieldExists(className, fieldName, type);
        });
        return Promise.all(promises);
      }).then(results => {
        enforceFields = results.filter(result => !!result);
        return this.setPermissions(className, classLevelPermissions, newSchema);
      }).then(() => this._dbAdapter.setIndexesWithSchemaFormat(className, indexes, schema.indexes, fullNewSchema)).then(() => this.reloadData({
        clearCache: true
      })) //TODO: Move this logic into the database adapter
      .then(() => {
        this.ensureFields(enforceFields);
        const schema = this.schemaData[className];
        const reloadedSchema = {
          className: className,
          fields: schema.fields,
          classLevelPermissions: schema.classLevelPermissions
        };

        if (schema.indexes && Object.keys(schema.indexes).length !== 0) {
          reloadedSchema.indexes = schema.indexes;
        }

        return reloadedSchema;
      });
    }).catch(error => {
      if (error === undefined) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} does not exist.`);
      } else {
        throw error;
      }
    });
  } // Returns a promise that resolves successfully to the new schema
  // object or fails with a reason.


  enforceClassExists(className) {
    if (this.schemaData[className]) {
      return Promise.resolve(this);
    } // We don't have this class. Update the schema


    return this.addClassIfNotExists(className) // The schema update succeeded. Reload the schema
    .then(() => this.reloadData({
      clearCache: true
    })).catch(() => {
      // The schema update failed. This can be okay - it might
      // have failed because there's a race condition and a different
      // client is making the exact same schema update that we want.
      // So just reload the schema.
      return this.reloadData({
        clearCache: true
      });
    }).then(() => {
      // Ensure that the schema now validates
      if (this.schemaData[className]) {
        return this;
      } else {
        throw new Parse.Error(Parse.Error.INVALID_JSON, `Failed to add ${className}`);
      }
    }).catch(() => {
      // The schema still doesn't validate. Give up
      throw new Parse.Error(Parse.Error.INVALID_JSON, 'schema class name does not revalidate');
    });
  }

  validateNewClass(className, fields = {}, classLevelPermissions) {
    if (this.schemaData[className]) {
      throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} already exists.`);
    }

    if (!classNameIsValid(className)) {
      return {
        code: Parse.Error.INVALID_CLASS_NAME,
        error: invalidClassNameMessage(className)
      };
    }

    return this.validateSchemaData(className, fields, classLevelPermissions, []);
  }

  validateSchemaData(className, fields, classLevelPermissions, existingFieldNames) {
    for (const fieldName in fields) {
      if (existingFieldNames.indexOf(fieldName) < 0) {
        if (!fieldNameIsValid(fieldName)) {
          return {
            code: Parse.Error.INVALID_KEY_NAME,
            error: 'invalid field name: ' + fieldName
          };
        }

        if (!fieldNameIsValidForClass(fieldName, className)) {
          return {
            code: 136,
            error: 'field ' + fieldName + ' cannot be added'
          };
        }

        const fieldType = fields[fieldName];
        const error = fieldTypeIsInvalid(fieldType);
        if (error) return {
          code: error.code,
          error: error.message
        };

        if (fieldType.defaultValue !== undefined) {
          let defaultValueType = getType(fieldType.defaultValue);

          if (typeof defaultValueType === 'string') {
            defaultValueType = {
              type: defaultValueType
            };
          } else if (typeof defaultValueType === 'object' && fieldType.type === 'Relation') {
            return {
              code: Parse.Error.INCORRECT_TYPE,
              error: `The 'default value' option is not applicable for ${typeToString(fieldType)}`
            };
          }

          if (!dbTypeMatchesObjectType(fieldType, defaultValueType)) {
            return {
              code: Parse.Error.INCORRECT_TYPE,
              error: `schema mismatch for ${className}.${fieldName} default value; expected ${typeToString(fieldType)} but got ${typeToString(defaultValueType)}`
            };
          }
        } else if (fieldType.required) {
          if (typeof fieldType === 'object' && fieldType.type === 'Relation') {
            return {
              code: Parse.Error.INCORRECT_TYPE,
              error: `The 'required' option is not applicable for ${typeToString(fieldType)}`
            };
          }
        }
      }
    }

    for (const fieldName in defaultColumns[className]) {
      fields[fieldName] = defaultColumns[className][fieldName];
    }

    const geoPoints = Object.keys(fields).filter(key => fields[key] && fields[key].type === 'GeoPoint');

    if (geoPoints.length > 1) {
      return {
        code: Parse.Error.INCORRECT_TYPE,
        error: 'currently, only one GeoPoint field may exist in an object. Adding ' + geoPoints[1] + ' when ' + geoPoints[0] + ' already exists.'
      };
    }

    validateCLP(classLevelPermissions, fields, this.userIdRegEx);
  } // Sets the Class-level permissions for a given className, which must exist.


  setPermissions(className, perms, newSchema) {
    if (typeof perms === 'undefined') {
      return Promise.resolve();
    }

    validateCLP(perms, newSchema, this.userIdRegEx);
    return this._dbAdapter.setClassLevelPermissions(className, perms);
  } // Returns a promise that resolves successfully to the new schema
  // object if the provided className-fieldName-type tuple is valid.
  // The className must already be validated.
  // If 'freeze' is true, refuse to update the schema for this field.


  enforceFieldExists(className, fieldName, type) {
    if (fieldName.indexOf('.') > 0) {
      // subdocument key (x.y) => ok if x is of type 'object'
      fieldName = fieldName.split('.')[0];
      type = 'Object';
    }

    if (!fieldNameIsValid(fieldName)) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Invalid field name: ${fieldName}.`);
    } // If someone tries to create a new field with null/undefined as the value, return;


    if (!type) {
      return undefined;
    }

    const expectedType = this.getExpectedType(className, fieldName);

    if (typeof type === 'string') {
      type = {
        type
      };
    }

    if (type.defaultValue !== undefined) {
      let defaultValueType = getType(type.defaultValue);

      if (typeof defaultValueType === 'string') {
        defaultValueType = {
          type: defaultValueType
        };
      }

      if (!dbTypeMatchesObjectType(type, defaultValueType)) {
        throw new Parse.Error(Parse.Error.INCORRECT_TYPE, `schema mismatch for ${className}.${fieldName} default value; expected ${typeToString(type)} but got ${typeToString(defaultValueType)}`);
      }
    }

    if (expectedType) {
      if (!dbTypeMatchesObjectType(expectedType, type)) {
        throw new Parse.Error(Parse.Error.INCORRECT_TYPE, `schema mismatch for ${className}.${fieldName}; expected ${typeToString(expectedType)} but got ${typeToString(type)}`);
      }

      return undefined;
    }

    return this._dbAdapter.addFieldIfNotExists(className, fieldName, type).catch(error => {
      if (error.code == Parse.Error.INCORRECT_TYPE) {
        // Make sure that we throw errors when it is appropriate to do so.
        throw error;
      } // The update failed. This can be okay - it might have been a race
      // condition where another client updated the schema in the same
      // way that we wanted to. So, just reload the schema


      return Promise.resolve();
    }).then(() => {
      return {
        className,
        fieldName,
        type
      };
    });
  }

  ensureFields(fields) {
    for (let i = 0; i < fields.length; i += 1) {
      const {
        className,
        fieldName
      } = fields[i];
      let {
        type
      } = fields[i];
      const expectedType = this.getExpectedType(className, fieldName);

      if (typeof type === 'string') {
        type = {
          type: type
        };
      }

      if (!expectedType || !dbTypeMatchesObjectType(expectedType, type)) {
        throw new Parse.Error(Parse.Error.INVALID_JSON, `Could not add field ${fieldName}`);
      }
    }
  } // maintain compatibility


  deleteField(fieldName, className, database) {
    return this.deleteFields([fieldName], className, database);
  } // Delete fields, and remove that data from all objects. This is intended
  // to remove unused fields, if other writers are writing objects that include
  // this field, the field may reappear. Returns a Promise that resolves with
  // no object on success, or rejects with { code, error } on failure.
  // Passing the database and prefix is necessary in order to drop relation collections
  // and remove fields from objects. Ideally the database would belong to
  // a database adapter and this function would close over it or access it via member.


  deleteFields(fieldNames, className, database) {
    if (!classNameIsValid(className)) {
      throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, invalidClassNameMessage(className));
    }

    fieldNames.forEach(fieldName => {
      if (!fieldNameIsValid(fieldName)) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `invalid field name: ${fieldName}`);
      } //Don't allow deleting the default fields.


      if (!fieldNameIsValidForClass(fieldName, className)) {
        throw new Parse.Error(136, `field ${fieldName} cannot be changed`);
      }
    });
    return this.getOneSchema(className, false, {
      clearCache: true
    }).catch(error => {
      if (error === undefined) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} does not exist.`);
      } else {
        throw error;
      }
    }).then(schema => {
      fieldNames.forEach(fieldName => {
        if (!schema.fields[fieldName]) {
          throw new Parse.Error(255, `Field ${fieldName} does not exist, cannot delete.`);
        }
      });

      const schemaFields = _objectSpread({}, schema.fields);

      return database.adapter.deleteFields(className, schema, fieldNames).then(() => {
        return Promise.all(fieldNames.map(fieldName => {
          const field = schemaFields[fieldName];

          if (field && field.type === 'Relation') {
            //For relations, drop the _Join table
            return database.adapter.deleteClass(`_Join:${fieldName}:${className}`);
          }

          return Promise.resolve();
        }));
      });
    }).then(() => this._cache.clear());
  } // Validates an object provided in REST format.
  // Returns a promise that resolves to the new schema if this object is
  // valid.


  async validateObject(className, object, query) {
    let geocount = 0;
    const schema = await this.enforceClassExists(className);
    const promises = [];

    for (const fieldName in object) {
      if (object[fieldName] === undefined) {
        continue;
      }

      const expected = getType(object[fieldName]);

      if (expected === 'GeoPoint') {
        geocount++;
      }

      if (geocount > 1) {
        // Make sure all field validation operations run before we return.
        // If not - we are continuing to run logic, but already provided response from the server.
        return Promise.reject(new Parse.Error(Parse.Error.INCORRECT_TYPE, 'there can only be one geopoint field in a class'));
      }

      if (!expected) {
        continue;
      }

      if (fieldName === 'ACL') {
        // Every object has ACL implicitly.
        continue;
      }

      promises.push(schema.enforceFieldExists(className, fieldName, expected));
    }

    const results = await Promise.all(promises);
    const enforceFields = results.filter(result => !!result);

    if (enforceFields.length !== 0) {
      await this.reloadData({
        clearCache: true
      });
    }

    this.ensureFields(enforceFields);
    const promise = Promise.resolve(schema);
    return thenValidateRequiredColumns(promise, className, object, query);
  } // Validates that all the properties are set for the object


  validateRequiredColumns(className, object, query) {
    const columns = requiredColumns[className];

    if (!columns || columns.length == 0) {
      return Promise.resolve(this);
    }

    const missingColumns = columns.filter(function (column) {
      if (query && query.objectId) {
        if (object[column] && typeof object[column] === 'object') {
          // Trying to delete a required column
          return object[column].__op == 'Delete';
        } // Not trying to do anything there


        return false;
      }

      return !object[column];
    });

    if (missingColumns.length > 0) {
      throw new Parse.Error(Parse.Error.INCORRECT_TYPE, missingColumns[0] + ' is required.');
    }

    return Promise.resolve(this);
  }

  testPermissionsForClassName(className, aclGroup, operation) {
    return SchemaController.testPermissions(this.getClassLevelPermissions(className), aclGroup, operation);
  } // Tests that the class level permission let pass the operation for a given aclGroup


  static testPermissions(classPermissions, aclGroup, operation) {
    if (!classPermissions || !classPermissions[operation]) {
      return true;
    }

    const perms = classPermissions[operation];

    if (perms['*']) {
      return true;
    } // Check permissions against the aclGroup provided (array of userId/roles)


    if (aclGroup.some(acl => {
      return perms[acl] === true;
    })) {
      return true;
    }

    return false;
  } // Validates an operation passes class-level-permissions set in the schema


  static validatePermission(classPermissions, className, aclGroup, operation, action) {
    if (SchemaController.testPermissions(classPermissions, aclGroup, operation)) {
      return Promise.resolve();
    }

    if (!classPermissions || !classPermissions[operation]) {
      return true;
    }

    const perms = classPermissions[operation]; // If only for authenticated users
    // make sure we have an aclGroup

    if (perms['requiresAuthentication']) {
      // If aclGroup has * (public)
      if (!aclGroup || aclGroup.length == 0) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Permission denied, user needs to be authenticated.');
      } else if (aclGroup.indexOf('*') > -1 && aclGroup.length == 1) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Permission denied, user needs to be authenticated.');
      } // requiresAuthentication passed, just move forward
      // probably would be wise at some point to rename to 'authenticatedUser'


      return Promise.resolve();
    } // No matching CLP, let's check the Pointer permissions
    // And handle those later


    const permissionField = ['get', 'find', 'count'].indexOf(operation) > -1 ? 'readUserFields' : 'writeUserFields'; // Reject create when write lockdown

    if (permissionField == 'writeUserFields' && operation == 'create') {
      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, `Permission denied for action ${operation} on class ${className}.`);
    } // Process the readUserFields later


    if (Array.isArray(classPermissions[permissionField]) && classPermissions[permissionField].length > 0) {
      return Promise.resolve();
    }

    const pointerFields = classPermissions[operation].pointerFields;

    if (Array.isArray(pointerFields) && pointerFields.length > 0) {
      // any op except 'addField as part of create' is ok.
      if (operation !== 'addField' || action === 'update') {
        // We can allow adding field on update flow only.
        return Promise.resolve();
      }
    }

    throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, `Permission denied for action ${operation} on class ${className}.`);
  } // Validates an operation passes class-level-permissions set in the schema


  validatePermission(className, aclGroup, operation, action) {
    return SchemaController.validatePermission(this.getClassLevelPermissions(className), className, aclGroup, operation, action);
  }

  getClassLevelPermissions(className) {
    return this.schemaData[className] && this.schemaData[className].classLevelPermissions;
  } // Returns the expected type for a className+key combination
  // or undefined if the schema is not set


  getExpectedType(className, fieldName) {
    if (this.schemaData[className]) {
      const expectedType = this.schemaData[className].fields[fieldName];
      return expectedType === 'map' ? 'Object' : expectedType;
    }

    return undefined;
  } // Checks if a given class is in the schema.


  hasClass(className) {
    if (this.schemaData[className]) {
      return Promise.resolve(true);
    }

    return this.reloadData().then(() => !!this.schemaData[className]);
  }

} // Returns a promise for a new Schema.


exports.SchemaController = exports.default = SchemaController;

const load = (dbAdapter, schemaCache, options) => {
  const schema = new SchemaController(dbAdapter, schemaCache);
  return schema.reloadData(options).then(() => schema);
}; // Builds a new schema (in schema API response format) out of an
// existing mongo schema + a schemas API put request. This response
// does not include the default fields, as it is intended to be passed
// to mongoSchemaFromFieldsAndClassName. No validation is done here, it
// is done in mongoSchemaFromFieldsAndClassName.


exports.load = load;

function buildMergedSchemaObject(existingFields, putRequest) {
  const newSchema = {}; // -disable-next

  const sysSchemaField = Object.keys(defaultColumns).indexOf(existingFields._id) === -1 ? [] : Object.keys(defaultColumns[existingFields._id]);

  for (const oldField in existingFields) {
    if (oldField !== '_id' && oldField !== 'ACL' && oldField !== 'updatedAt' && oldField !== 'createdAt' && oldField !== 'objectId') {
      if (sysSchemaField.length > 0 && sysSchemaField.indexOf(oldField) !== -1) {
        continue;
      }

      const fieldIsDeleted = putRequest[oldField] && putRequest[oldField].__op === 'Delete';

      if (!fieldIsDeleted) {
        newSchema[oldField] = existingFields[oldField];
      }
    }
  }

  for (const newField in putRequest) {
    if (newField !== 'objectId' && putRequest[newField].__op !== 'Delete') {
      if (sysSchemaField.length > 0 && sysSchemaField.indexOf(newField) !== -1) {
        continue;
      }

      newSchema[newField] = putRequest[newField];
    }
  }

  return newSchema;
} // Given a schema promise, construct another schema promise that
// validates this field once the schema loads.


function thenValidateRequiredColumns(schemaPromise, className, object, query) {
  return schemaPromise.then(schema => {
    return schema.validateRequiredColumns(className, object, query);
  });
} // Gets the type from a REST API formatted object, where 'type' is
// extended past javascript types to include the rest of the Parse
// type system.
// The output should be a valid schema value.
// TODO: ensure that this is compatible with the format used in Open DB


function getType(obj) {
  const type = typeof obj;

  switch (type) {
    case 'boolean':
      return 'Boolean';

    case 'string':
      return 'String';

    case 'number':
      return 'Number';

    case 'map':
    case 'object':
      if (!obj) {
        return undefined;
      }

      return getObjectType(obj);

    case 'function':
    case 'symbol':
    case 'undefined':
    default:
      throw 'bad obj: ' + obj;
  }
} // This gets the type for non-JSON types like pointers and files, but
// also gets the appropriate type for $ operators.
// Returns null if the type is unknown.


function getObjectType(obj) {
  if (obj instanceof Array) {
    return 'Array';
  }

  if (obj.__type) {
    switch (obj.__type) {
      case 'Pointer':
        if (obj.className) {
          return {
            type: 'Pointer',
            targetClass: obj.className
          };
        }

        break;

      case 'Relation':
        if (obj.className) {
          return {
            type: 'Relation',
            targetClass: obj.className
          };
        }

        break;

      case 'File':
        if (obj.name) {
          return 'File';
        }

        break;

      case 'Date':
        if (obj.iso) {
          return 'Date';
        }

        break;

      case 'GeoPoint':
        if (obj.latitude != null && obj.longitude != null) {
          return 'GeoPoint';
        }

        break;

      case 'Bytes':
        if (obj.base64) {
          return 'Bytes';
        }

        break;

      case 'Polygon':
        if (obj.coordinates) {
          return 'Polygon';
        }

        break;
    }

    throw new Parse.Error(Parse.Error.INCORRECT_TYPE, 'This is not a valid ' + obj.__type);
  }

  if (obj['$ne']) {
    return getObjectType(obj['$ne']);
  }

  if (obj.__op) {
    switch (obj.__op) {
      case 'Increment':
        return 'Number';

      case 'Delete':
        return null;

      case 'Add':
      case 'AddUnique':
      case 'Remove':
        return 'Array';

      case 'AddRelation':
      case 'RemoveRelation':
        return {
          type: 'Relation',
          targetClass: obj.objects[0].className
        };

      case 'Batch':
        return getObjectType(obj.ops[0]);

      default:
        throw 'unexpected op: ' + obj.__op;
    }
  }

  return 'Object';
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyLmpzIl0sIm5hbWVzIjpbIlBhcnNlIiwicmVxdWlyZSIsImRlZmF1bHRDb2x1bW5zIiwiT2JqZWN0IiwiZnJlZXplIiwiX0RlZmF1bHQiLCJvYmplY3RJZCIsInR5cGUiLCJjcmVhdGVkQXQiLCJ1cGRhdGVkQXQiLCJBQ0wiLCJfVXNlciIsInVzZXJuYW1lIiwicGFzc3dvcmQiLCJlbWFpbCIsImVtYWlsVmVyaWZpZWQiLCJhdXRoRGF0YSIsIl9JbnN0YWxsYXRpb24iLCJpbnN0YWxsYXRpb25JZCIsImRldmljZVRva2VuIiwiY2hhbm5lbHMiLCJkZXZpY2VUeXBlIiwicHVzaFR5cGUiLCJHQ01TZW5kZXJJZCIsInRpbWVab25lIiwibG9jYWxlSWRlbnRpZmllciIsImJhZGdlIiwiYXBwVmVyc2lvbiIsImFwcE5hbWUiLCJhcHBJZGVudGlmaWVyIiwicGFyc2VWZXJzaW9uIiwiX1JvbGUiLCJuYW1lIiwidXNlcnMiLCJ0YXJnZXRDbGFzcyIsInJvbGVzIiwiX1Nlc3Npb24iLCJyZXN0cmljdGVkIiwidXNlciIsInNlc3Npb25Ub2tlbiIsImV4cGlyZXNBdCIsImNyZWF0ZWRXaXRoIiwiX1Byb2R1Y3QiLCJwcm9kdWN0SWRlbnRpZmllciIsImRvd25sb2FkIiwiZG93bmxvYWROYW1lIiwiaWNvbiIsIm9yZGVyIiwidGl0bGUiLCJzdWJ0aXRsZSIsIl9QdXNoU3RhdHVzIiwicHVzaFRpbWUiLCJzb3VyY2UiLCJxdWVyeSIsInBheWxvYWQiLCJleHBpcnkiLCJleHBpcmF0aW9uX2ludGVydmFsIiwic3RhdHVzIiwibnVtU2VudCIsIm51bUZhaWxlZCIsInB1c2hIYXNoIiwiZXJyb3JNZXNzYWdlIiwic2VudFBlclR5cGUiLCJmYWlsZWRQZXJUeXBlIiwic2VudFBlclVUQ09mZnNldCIsImZhaWxlZFBlclVUQ09mZnNldCIsImNvdW50IiwiX0pvYlN0YXR1cyIsImpvYk5hbWUiLCJtZXNzYWdlIiwicGFyYW1zIiwiZmluaXNoZWRBdCIsIl9Kb2JTY2hlZHVsZSIsImRlc2NyaXB0aW9uIiwic3RhcnRBZnRlciIsImRheXNPZldlZWsiLCJ0aW1lT2ZEYXkiLCJsYXN0UnVuIiwicmVwZWF0TWludXRlcyIsIl9Ib29rcyIsImZ1bmN0aW9uTmFtZSIsImNsYXNzTmFtZSIsInRyaWdnZXJOYW1lIiwidXJsIiwiX0dsb2JhbENvbmZpZyIsIm1hc3RlcktleU9ubHkiLCJfR3JhcGhRTENvbmZpZyIsImNvbmZpZyIsIl9BdWRpZW5jZSIsImxhc3RVc2VkIiwidGltZXNVc2VkIiwiX0lkZW1wb3RlbmN5IiwicmVxSWQiLCJleHBpcmUiLCJyZXF1aXJlZENvbHVtbnMiLCJzeXN0ZW1DbGFzc2VzIiwidm9sYXRpbGVDbGFzc2VzIiwicm9sZVJlZ2V4IiwicHJvdGVjdGVkRmllbGRzUG9pbnRlclJlZ2V4IiwicHVibGljUmVnZXgiLCJhdXRoZW50aWNhdGVkUmVnZXgiLCJyZXF1aXJlc0F1dGhlbnRpY2F0aW9uUmVnZXgiLCJjbHBQb2ludGVyUmVnZXgiLCJwcm90ZWN0ZWRGaWVsZHNSZWdleCIsImNscEZpZWxkc1JlZ2V4IiwidmFsaWRhdGVQZXJtaXNzaW9uS2V5Iiwia2V5IiwidXNlcklkUmVnRXhwIiwibWF0Y2hlc1NvbWUiLCJyZWdFeCIsIm1hdGNoIiwidmFsaWQiLCJFcnJvciIsIklOVkFMSURfSlNPTiIsInZhbGlkYXRlUHJvdGVjdGVkRmllbGRzS2V5IiwiQ0xQVmFsaWRLZXlzIiwidmFsaWRhdGVDTFAiLCJwZXJtcyIsImZpZWxkcyIsIm9wZXJhdGlvbktleSIsImluZGV4T2YiLCJvcGVyYXRpb24iLCJ2YWxpZGF0ZUNMUGpzb24iLCJmaWVsZE5hbWUiLCJ2YWxpZGF0ZVBvaW50ZXJQZXJtaXNzaW9uIiwiZW50aXR5IiwicHJvdGVjdGVkRmllbGRzIiwiQXJyYXkiLCJpc0FycmF5IiwiZmllbGQiLCJwcm90b3R5cGUiLCJoYXNPd25Qcm9wZXJ0eSIsImNhbGwiLCJwb2ludGVyRmllbGRzIiwicG9pbnRlckZpZWxkIiwicGVybWl0Iiwiam9pbkNsYXNzUmVnZXgiLCJjbGFzc0FuZEZpZWxkUmVnZXgiLCJjbGFzc05hbWVJc1ZhbGlkIiwidGVzdCIsImZpZWxkTmFtZUlzVmFsaWQiLCJmaWVsZE5hbWVJc1ZhbGlkRm9yQ2xhc3MiLCJpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZSIsImludmFsaWRKc29uRXJyb3IiLCJ2YWxpZE5vblJlbGF0aW9uT3JQb2ludGVyVHlwZXMiLCJmaWVsZFR5cGVJc0ludmFsaWQiLCJJTlZBTElEX0NMQVNTX05BTUUiLCJ1bmRlZmluZWQiLCJJTkNPUlJFQ1RfVFlQRSIsImNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEiLCJzY2hlbWEiLCJpbmplY3REZWZhdWx0U2NoZW1hIiwiX3JwZXJtIiwiX3dwZXJtIiwiX2hhc2hlZF9wYXNzd29yZCIsImNvbnZlcnRBZGFwdGVyU2NoZW1hVG9QYXJzZVNjaGVtYSIsImluZGV4ZXMiLCJrZXlzIiwibGVuZ3RoIiwiU2NoZW1hRGF0YSIsImNvbnN0cnVjdG9yIiwiYWxsU2NoZW1hcyIsIl9fZGF0YSIsIl9fcHJvdGVjdGVkRmllbGRzIiwiZm9yRWFjaCIsImluY2x1ZGVzIiwiZGVmaW5lUHJvcGVydHkiLCJnZXQiLCJkYXRhIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiY2xhc3NQcm90ZWN0ZWRGaWVsZHMiLCJ1bnEiLCJTZXQiLCJmcm9tIiwiZGVmYXVsdFNjaGVtYSIsIl9Ib29rc1NjaGVtYSIsIl9HbG9iYWxDb25maWdTY2hlbWEiLCJfR3JhcGhRTENvbmZpZ1NjaGVtYSIsIl9QdXNoU3RhdHVzU2NoZW1hIiwiX0pvYlN0YXR1c1NjaGVtYSIsIl9Kb2JTY2hlZHVsZVNjaGVtYSIsIl9BdWRpZW5jZVNjaGVtYSIsIl9JZGVtcG90ZW5jeVNjaGVtYSIsIlZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMiLCJkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZSIsImRiVHlwZSIsIm9iamVjdFR5cGUiLCJ0eXBlVG9TdHJpbmciLCJTY2hlbWFDb250cm9sbGVyIiwiZGF0YWJhc2VBZGFwdGVyIiwic2NoZW1hQ2FjaGUiLCJfZGJBZGFwdGVyIiwiX2NhY2hlIiwic2NoZW1hRGF0YSIsIkNvbmZpZyIsImFwcGxpY2F0aW9uSWQiLCJjdXN0b21JZHMiLCJhbGxvd0N1c3RvbU9iamVjdElkIiwiY3VzdG9tSWRSZWdFeCIsImF1dG9JZFJlZ0V4IiwidXNlcklkUmVnRXgiLCJyZWxvYWREYXRhIiwib3B0aW9ucyIsImNsZWFyQ2FjaGUiLCJyZWxvYWREYXRhUHJvbWlzZSIsImdldEFsbENsYXNzZXMiLCJ0aGVuIiwiZXJyIiwic2V0QWxsQ2xhc3NlcyIsImFsbENsYXNzZXMiLCJQcm9taXNlIiwicmVzb2x2ZSIsIm1hcCIsImNhdGNoIiwiZXJyb3IiLCJjb25zb2xlIiwiZ2V0T25lU2NoZW1hIiwiYWxsb3dWb2xhdGlsZUNsYXNzZXMiLCJwcm9taXNlIiwiY2xlYXIiLCJjYWNoZWQiLCJvbmVTY2hlbWEiLCJmaW5kIiwicmVqZWN0IiwiYWRkQ2xhc3NJZk5vdEV4aXN0cyIsInZhbGlkYXRpb25FcnJvciIsInZhbGlkYXRlTmV3Q2xhc3MiLCJjb2RlIiwiY3JlYXRlQ2xhc3MiLCJEVVBMSUNBVEVfVkFMVUUiLCJ1cGRhdGVDbGFzcyIsInN1Ym1pdHRlZEZpZWxkcyIsImRhdGFiYXNlIiwiZXhpc3RpbmdGaWVsZHMiLCJfX29wIiwibmV3U2NoZW1hIiwiYnVpbGRNZXJnZWRTY2hlbWFPYmplY3QiLCJkZWZhdWx0RmllbGRzIiwiZnVsbE5ld1NjaGVtYSIsImFzc2lnbiIsInZhbGlkYXRlU2NoZW1hRGF0YSIsImRlbGV0ZWRGaWVsZHMiLCJpbnNlcnRlZEZpZWxkcyIsInB1c2giLCJkZWxldGVQcm9taXNlIiwiZGVsZXRlRmllbGRzIiwiZW5mb3JjZUZpZWxkcyIsInByb21pc2VzIiwiZW5mb3JjZUZpZWxkRXhpc3RzIiwiYWxsIiwicmVzdWx0cyIsImZpbHRlciIsInJlc3VsdCIsInNldFBlcm1pc3Npb25zIiwic2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQiLCJlbnN1cmVGaWVsZHMiLCJyZWxvYWRlZFNjaGVtYSIsImVuZm9yY2VDbGFzc0V4aXN0cyIsImV4aXN0aW5nRmllbGROYW1lcyIsIklOVkFMSURfS0VZX05BTUUiLCJmaWVsZFR5cGUiLCJkZWZhdWx0VmFsdWUiLCJkZWZhdWx0VmFsdWVUeXBlIiwiZ2V0VHlwZSIsInJlcXVpcmVkIiwiZ2VvUG9pbnRzIiwic2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwic3BsaXQiLCJleHBlY3RlZFR5cGUiLCJnZXRFeHBlY3RlZFR5cGUiLCJhZGRGaWVsZElmTm90RXhpc3RzIiwiaSIsImRlbGV0ZUZpZWxkIiwiZmllbGROYW1lcyIsInNjaGVtYUZpZWxkcyIsImFkYXB0ZXIiLCJkZWxldGVDbGFzcyIsInZhbGlkYXRlT2JqZWN0Iiwib2JqZWN0IiwiZ2VvY291bnQiLCJleHBlY3RlZCIsInRoZW5WYWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyIsInZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zIiwiY29sdW1ucyIsIm1pc3NpbmdDb2x1bW5zIiwiY29sdW1uIiwidGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lIiwiYWNsR3JvdXAiLCJ0ZXN0UGVybWlzc2lvbnMiLCJnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMiLCJjbGFzc1Blcm1pc3Npb25zIiwic29tZSIsImFjbCIsInZhbGlkYXRlUGVybWlzc2lvbiIsImFjdGlvbiIsIk9CSkVDVF9OT1RfRk9VTkQiLCJwZXJtaXNzaW9uRmllbGQiLCJPUEVSQVRJT05fRk9SQklEREVOIiwiaGFzQ2xhc3MiLCJsb2FkIiwiZGJBZGFwdGVyIiwicHV0UmVxdWVzdCIsInN5c1NjaGVtYUZpZWxkIiwiX2lkIiwib2xkRmllbGQiLCJmaWVsZElzRGVsZXRlZCIsIm5ld0ZpZWxkIiwic2NoZW1hUHJvbWlzZSIsIm9iaiIsImdldE9iamVjdFR5cGUiLCJfX3R5cGUiLCJpc28iLCJsYXRpdHVkZSIsImxvbmdpdHVkZSIsImJhc2U2NCIsImNvb3JkaW5hdGVzIiwib2JqZWN0cyIsIm9wcyJd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NEMseUJBQXlCZ0ssR0FBRyxDQUFDRSxNQUF6RSxDQUFOO0FBQ0Q7O0FBQ0QsTUFBSUYsR0FBRyxDQUFDLEtBQUQsQ0FBUCxFQUFnQjtBQUNkLFdBQU9DLGFBQWEsQ0FBQ0QsR0FBRyxDQUFDLEtBQUQsQ0FBSixDQUFwQjtBQUNEOztBQUNELE1BQUlBLEdBQUcsQ0FBQzFFLElBQVIsRUFBYztBQUNaLFlBQVEwRSxHQUFHLENBQUMxRSxJQUFaO0FBQ0UsV0FBSyxXQUFMO0FBQ0UsZUFBTyxRQUFQOztBQUNGLFdBQUssUUFBTDtBQUNFLGVBQU8sSUFBUDs7QUFDRixXQUFLLEtBQUw7QUFDQSxXQUFLLFdBQUw7QUFDQSxXQUFLLFFBQUw7QUFDRSxlQUFPLE9BQVA7O0FBQ0YsV0FBSyxhQUFMO0FBQ0EsV0FBSyxnQkFBTDtBQUNFLGVBQU87QUFDTG5PLFVBQUFBLElBQUksRUFBRSxVQUREO0FBRUwyQixVQUFBQSxXQUFXLEVBQUVrUixHQUFHLENBQUNRLE9BQUosQ0FBWSxDQUFaLEVBQWUzTztBQUZ2QixTQUFQOztBQUlGLFdBQUssT0FBTDtBQUNFLGVBQU9vTyxhQUFhLENBQUNELEdBQUcsQ0FBQ1MsR0FBSixDQUFRLENBQVIsQ0FBRCxDQUFwQjs7QUFDRjtBQUNFLGNBQU0sb0JBQW9CVCxHQUFHLENBQUMxRSxJQUE5QjtBQWxCSjtBQW9CRDs7QUFDRCxTQUFPLFFBQVA7QUFDRCIsInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG4vLyBUaGlzIGNsYXNzIGhhbmRsZXMgc2NoZW1hIHZhbGlkYXRpb24sIHBlcnNpc3RlbmNlLCBhbmQgbW9kaWZpY2F0aW9uLlxuLy9cbi8vIEVhY2ggaW5kaXZpZHVhbCBTY2hlbWEgb2JqZWN0IHNob3VsZCBiZSBpbW11dGFibGUuIFRoZSBoZWxwZXJzIHRvXG4vLyBkbyB0aGluZ3Mgd2l0aCB0aGUgU2NoZW1hIGp1c3QgcmV0dXJuIGEgbmV3IHNjaGVtYSB3aGVuIHRoZSBzY2hlbWFcbi8vIGlzIGNoYW5nZWQuXG4vL1xuLy8gVGhlIGNhbm9uaWNhbCBwbGFjZSB0byBzdG9yZSB0aGlzIFNjaGVtYSBpcyBpbiB0aGUgZGF0YWJhc2UgaXRzZWxmLFxuLy8gaW4gYSBfU0NIRU1BIGNvbGxlY3Rpb24uIFRoaXMgaXMgbm90IHRoZSByaWdodCB3YXkgdG8gZG8gaXQgZm9yIGFuXG4vLyBvcGVuIHNvdXJjZSBmcmFtZXdvcmssIGJ1dCBpdCdzIGJhY2t3YXJkIGNvbXBhdGlibGUsIHNvIHdlJ3JlXG4vLyBrZWVwaW5nIGl0IHRoaXMgd2F5IGZvciBub3cuXG4vL1xuLy8gSW4gQVBJLWhhbmRsaW5nIGNvZGUsIHlvdSBzaG91bGQgb25seSB1c2UgdGhlIFNjaGVtYSBjbGFzcyB2aWEgdGhlXG4vLyBEYXRhYmFzZUNvbnRyb2xsZXIuIFRoaXMgd2lsbCBsZXQgdXMgcmVwbGFjZSB0aGUgc2NoZW1hIGxvZ2ljIGZvclxuLy8gZGlmZmVyZW50IGRhdGFiYXNlcy5cbi8vIFRPRE86IGhpZGUgYWxsIHNjaGVtYSBsb2dpYyBpbnNpZGUgdGhlIGRhdGFiYXNlIGFkYXB0ZXIuXG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmNvbnN0IFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpLlBhcnNlO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBEYXRhYmFzZUNvbnRyb2xsZXIgZnJvbSAnLi9EYXRhYmFzZUNvbnRyb2xsZXInO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgZGVlcGNvcHkgZnJvbSAnZGVlcGNvcHknO1xuaW1wb3J0IHR5cGUge1xuICBTY2hlbWEsXG4gIFNjaGVtYUZpZWxkcyxcbiAgQ2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICBTY2hlbWFGaWVsZCxcbiAgTG9hZFNjaGVtYU9wdGlvbnMsXG59IGZyb20gJy4vdHlwZXMnO1xuXG5jb25zdCBkZWZhdWx0Q29sdW1uczogeyBbc3RyaW5nXTogU2NoZW1hRmllbGRzIH0gPSBPYmplY3QuZnJlZXplKHtcbiAgLy8gQ29udGFpbiB0aGUgZGVmYXVsdCBjb2x1bW5zIGZvciBldmVyeSBwYXJzZSBvYmplY3QgdHlwZSAoZXhjZXB0IF9Kb2luIGNvbGxlY3Rpb24pXG4gIF9EZWZhdWx0OiB7XG4gICAgb2JqZWN0SWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBjcmVhdGVkQXQ6IHsgdHlwZTogJ0RhdGUnIH0sXG4gICAgdXBkYXRlZEF0OiB7IHR5cGU6ICdEYXRlJyB9LFxuICAgIEFDTDogeyB0eXBlOiAnQUNMJyB9LFxuICB9LFxuICAvLyBUaGUgYWRkaXRpb25hbCBkZWZhdWx0IGNvbHVtbnMgZm9yIHRoZSBfVXNlciBjb2xsZWN0aW9uIChpbiBhZGRpdGlvbiB0byBEZWZhdWx0Q29scylcbiAgX1VzZXI6IHtcbiAgICB1c2VybmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhc3N3b3JkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZW1haWw6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBlbWFpbFZlcmlmaWVkOiB7IHR5cGU6ICdCb29sZWFuJyB9LFxuICAgIGF1dGhEYXRhOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gIH0sXG4gIC8vIFRoZSBhZGRpdGlvbmFsIGRlZmF1bHQgY29sdW1ucyBmb3IgdGhlIF9JbnN0YWxsYXRpb24gY29sbGVjdGlvbiAoaW4gYWRkaXRpb24gdG8gRGVmYXVsdENvbHMpXG4gIF9JbnN0YWxsYXRpb246IHtcbiAgICBpbnN0YWxsYXRpb25JZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGRldmljZVRva2VuOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgY2hhbm5lbHM6IHsgdHlwZTogJ0FycmF5JyB9LFxuICAgIGRldmljZVR5cGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwdXNoVHlwZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIEdDTVNlbmRlcklkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgdGltZVpvbmU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBsb2NhbGVJZGVudGlmaWVyOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgYmFkZ2U6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICBhcHBWZXJzaW9uOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgYXBwTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGFwcElkZW50aWZpZXI6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwYXJzZVZlcnNpb246IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgfSxcbiAgLy8gVGhlIGFkZGl0aW9uYWwgZGVmYXVsdCBjb2x1bW5zIGZvciB0aGUgX1JvbGUgY29sbGVjdGlvbiAoaW4gYWRkaXRpb24gdG8gRGVmYXVsdENvbHMpXG4gIF9Sb2xlOiB7XG4gICAgbmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHVzZXJzOiB7IHR5cGU6ICdSZWxhdGlvbicsIHRhcmdldENsYXNzOiAnX1VzZXInIH0sXG4gICAgcm9sZXM6IHsgdHlwZTogJ1JlbGF0aW9uJywgdGFyZ2V0Q2xhc3M6ICdfUm9sZScgfSxcbiAgfSxcbiAgLy8gVGhlIGFkZGl0aW9uYWwgZGVmYXVsdCBjb2x1bW5zIGZvciB0aGUgX1Nlc3Npb24gY29sbGVjdGlvbiAoaW4gYWRkaXRpb24gdG8gRGVmYXVsdENvbHMpXG4gIF9TZXNzaW9uOiB7XG4gICAgcmVzdHJpY3RlZDogeyB0eXBlOiAnQm9vbGVhbicgfSxcbiAgICB1c2VyOiB7IHR5cGU6ICdQb2ludGVyJywgdGFyZ2V0Q2xhc3M6ICdfVXNlcicgfSxcbiAgICBpbnN0YWxsYXRpb25JZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHNlc3Npb25Ub2tlbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGV4cGlyZXNBdDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgICBjcmVhdGVkV2l0aDogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICB9LFxuICBfUHJvZHVjdDoge1xuICAgIHByb2R1Y3RJZGVudGlmaWVyOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZG93bmxvYWQ6IHsgdHlwZTogJ0ZpbGUnIH0sXG4gICAgZG93bmxvYWROYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgaWNvbjogeyB0eXBlOiAnRmlsZScgfSxcbiAgICBvcmRlcjogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIHRpdGxlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc3VidGl0bGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgfSxcbiAgX1B1c2hTdGF0dXM6IHtcbiAgICBwdXNoVGltZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHNvdXJjZTogeyB0eXBlOiAnU3RyaW5nJyB9LCAvLyByZXN0IG9yIHdlYnVpXG4gICAgcXVlcnk6IHsgdHlwZTogJ1N0cmluZycgfSwgLy8gdGhlIHN0cmluZ2lmaWVkIEpTT04gcXVlcnlcbiAgICBwYXlsb2FkOiB7IHR5cGU6ICdTdHJpbmcnIH0sIC8vIHRoZSBzdHJpbmdpZmllZCBKU09OIHBheWxvYWQsXG4gICAgdGl0bGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBleHBpcnk6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICBleHBpcmF0aW9uX2ludGVydmFsOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgc3RhdHVzOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbnVtU2VudDogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIG51bUZhaWxlZDogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIHB1c2hIYXNoOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZXJyb3JNZXNzYWdlOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgc2VudFBlclR5cGU6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBmYWlsZWRQZXJUeXBlOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgc2VudFBlclVUQ09mZnNldDogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIGZhaWxlZFBlclVUQ09mZnNldDogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIGNvdW50OiB7IHR5cGU6ICdOdW1iZXInIH0sIC8vIHRyYWNrcyAjIG9mIGJhdGNoZXMgcXVldWVkIGFuZCBwZW5kaW5nXG4gIH0sXG4gIF9Kb2JTdGF0dXM6IHtcbiAgICBqb2JOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc291cmNlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc3RhdHVzOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbWVzc2FnZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhcmFtczogeyB0eXBlOiAnT2JqZWN0JyB9LCAvLyBwYXJhbXMgcmVjZWl2ZWQgd2hlbiBjYWxsaW5nIHRoZSBqb2JcbiAgICBmaW5pc2hlZEF0OiB7IHR5cGU6ICdEYXRlJyB9LFxuICB9LFxuICBfSm9iU2NoZWR1bGU6IHtcbiAgICBqb2JOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZGVzY3JpcHRpb246IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwYXJhbXM6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzdGFydEFmdGVyOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZGF5c09mV2VlazogeyB0eXBlOiAnQXJyYXknIH0sXG4gICAgdGltZU9mRGF5OiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbGFzdFJ1bjogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIHJlcGVhdE1pbnV0ZXM6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgfSxcbiAgX0hvb2tzOiB7XG4gICAgZnVuY3Rpb25OYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgY2xhc3NOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgdHJpZ2dlck5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICB1cmw6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgfSxcbiAgX0dsb2JhbENvbmZpZzoge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFyYW1zOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgbWFzdGVyS2V5T25seTogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICB9LFxuICBfR3JhcGhRTENvbmZpZzoge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgY29uZmlnOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gIH0sXG4gIF9BdWRpZW5jZToge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHF1ZXJ5OiB7IHR5cGU6ICdTdHJpbmcnIH0sIC8vc3RvcmluZyBxdWVyeSBhcyBKU09OIHN0cmluZyB0byBwcmV2ZW50IFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIiBlcnJvclxuICAgIGxhc3RVc2VkOiB7IHR5cGU6ICdEYXRlJyB9LFxuICAgIHRpbWVzVXNlZDogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICB9LFxuICBfSWRlbXBvdGVuY3k6IHtcbiAgICByZXFJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGV4cGlyZTogeyB0eXBlOiAnRGF0ZScgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCByZXF1aXJlZENvbHVtbnMgPSBPYmplY3QuZnJlZXplKHtcbiAgX1Byb2R1Y3Q6IFsncHJvZHVjdElkZW50aWZpZXInLCAnaWNvbicsICdvcmRlcicsICd0aXRsZScsICdzdWJ0aXRsZSddLFxuICBfUm9sZTogWyduYW1lJywgJ0FDTCddLFxufSk7XG5cbmNvbnN0IHN5c3RlbUNsYXNzZXMgPSBPYmplY3QuZnJlZXplKFtcbiAgJ19Vc2VyJyxcbiAgJ19JbnN0YWxsYXRpb24nLFxuICAnX1JvbGUnLFxuICAnX1Nlc3Npb24nLFxuICAnX1Byb2R1Y3QnLFxuICAnX1B1c2hTdGF0dXMnLFxuICAnX0pvYlN0YXR1cycsXG4gICdfSm9iU2NoZWR1bGUnLFxuICAnX0F1ZGllbmNlJyxcbiAgJ19JZGVtcG90ZW5jeScsXG5dKTtcblxuY29uc3Qgdm9sYXRpbGVDbGFzc2VzID0gT2JqZWN0LmZyZWV6ZShbXG4gICdfSm9iU3RhdHVzJyxcbiAgJ19QdXNoU3RhdHVzJyxcbiAgJ19Ib29rcycsXG4gICdfR2xvYmFsQ29uZmlnJyxcbiAgJ19HcmFwaFFMQ29uZmlnJyxcbiAgJ19Kb2JTY2hlZHVsZScsXG4gICdfQXVkaWVuY2UnLFxuICAnX0lkZW1wb3RlbmN5Jyxcbl0pO1xuXG4vLyBBbnl0aGluZyB0aGF0IHN0YXJ0IHdpdGggcm9sZVxuY29uc3Qgcm9sZVJlZ2V4ID0gL15yb2xlOi4qLztcbi8vIEFueXRoaW5nIHRoYXQgc3RhcnRzIHdpdGggdXNlckZpZWxkIChhbGxvd2VkIGZvciBwcm90ZWN0ZWQgZmllbGRzIG9ubHkpXG5jb25zdCBwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUmVnZXggPSAvXnVzZXJGaWVsZDouKi87XG4vLyAqIHBlcm1pc3Npb25cbmNvbnN0IHB1YmxpY1JlZ2V4ID0gL15cXCokLztcblxuY29uc3QgYXV0aGVudGljYXRlZFJlZ2V4ID0gL15hdXRoZW50aWNhdGVkJC87XG5cbmNvbnN0IHJlcXVpcmVzQXV0aGVudGljYXRpb25SZWdleCA9IC9ecmVxdWlyZXNBdXRoZW50aWNhdGlvbiQvO1xuXG5jb25zdCBjbHBQb2ludGVyUmVnZXggPSAvXnBvaW50ZXJGaWVsZHMkLztcblxuLy8gcmVnZXggZm9yIHZhbGlkYXRpbmcgZW50aXRpZXMgaW4gcHJvdGVjdGVkRmllbGRzIG9iamVjdFxuY29uc3QgcHJvdGVjdGVkRmllbGRzUmVnZXggPSBPYmplY3QuZnJlZXplKFtcbiAgcHJvdGVjdGVkRmllbGRzUG9pbnRlclJlZ2V4LFxuICBwdWJsaWNSZWdleCxcbiAgYXV0aGVudGljYXRlZFJlZ2V4LFxuICByb2xlUmVnZXgsXG5dKTtcblxuLy8gY2xwIHJlZ2V4XG5jb25zdCBjbHBGaWVsZHNSZWdleCA9IE9iamVjdC5mcmVlemUoW1xuICBjbHBQb2ludGVyUmVnZXgsXG4gIHB1YmxpY1JlZ2V4LFxuICByZXF1aXJlc0F1dGhlbnRpY2F0aW9uUmVnZXgsXG4gIHJvbGVSZWdleCxcbl0pO1xuXG5mdW5jdGlvbiB2YWxpZGF0ZVBlcm1pc3Npb25LZXkoa2V5LCB1c2VySWRSZWdFeHApIHtcbiAgbGV0IG1hdGNoZXNTb21lID0gZmFsc2U7XG4gIGZvciAoY29uc3QgcmVnRXggb2YgY2xwRmllbGRzUmVnZXgpIHtcbiAgICBpZiAoa2V5Lm1hdGNoKHJlZ0V4KSAhPT0gbnVsbCkge1xuICAgICAgbWF0Y2hlc1NvbWUgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgLy8gdXNlcklkIGRlcGVuZHMgb24gc3RhcnR1cCBvcHRpb25zIHNvIGl0J3MgZHluYW1pY1xuICBjb25zdCB2YWxpZCA9IG1hdGNoZXNTb21lIHx8IGtleS5tYXRjaCh1c2VySWRSZWdFeHApICE9PSBudWxsO1xuICBpZiAoIXZhbGlkKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgYCcke2tleX0nIGlzIG5vdCBhIHZhbGlkIGtleSBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnNgXG4gICAgKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZVByb3RlY3RlZEZpZWxkc0tleShrZXksIHVzZXJJZFJlZ0V4cCkge1xuICBsZXQgbWF0Y2hlc1NvbWUgPSBmYWxzZTtcbiAgZm9yIChjb25zdCByZWdFeCBvZiBwcm90ZWN0ZWRGaWVsZHNSZWdleCkge1xuICAgIGlmIChrZXkubWF0Y2gocmVnRXgpICE9PSBudWxsKSB7XG4gICAgICBtYXRjaGVzU29tZSA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICAvLyB1c2VySWQgcmVnZXggZGVwZW5kcyBvbiBsYXVuY2ggb3B0aW9ucyBzbyBpdCdzIGR5bmFtaWNcbiAgY29uc3QgdmFsaWQgPSBtYXRjaGVzU29tZSB8fCBrZXkubWF0Y2godXNlcklkUmVnRXhwKSAhPT0gbnVsbDtcbiAgaWYgKCF2YWxpZCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgIGAnJHtrZXl9JyBpcyBub3QgYSB2YWxpZCBrZXkgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zYFxuICAgICk7XG4gIH1cbn1cblxuY29uc3QgQ0xQVmFsaWRLZXlzID0gT2JqZWN0LmZyZWV6ZShbXG4gICdmaW5kJyxcbiAgJ2NvdW50JyxcbiAgJ2dldCcsXG4gICdjcmVhdGUnLFxuICAndXBkYXRlJyxcbiAgJ2RlbGV0ZScsXG4gICdhZGRGaWVsZCcsXG4gICdyZWFkVXNlckZpZWxkcycsXG4gICd3cml0ZVVzZXJGaWVsZHMnLFxuICAncHJvdGVjdGVkRmllbGRzJyxcbl0pO1xuXG4vLyB2YWxpZGF0aW9uIGJlZm9yZSBzZXR0aW5nIGNsYXNzLWxldmVsIHBlcm1pc3Npb25zIG9uIGNvbGxlY3Rpb25cbmZ1bmN0aW9uIHZhbGlkYXRlQ0xQKHBlcm1zOiBDbGFzc0xldmVsUGVybWlzc2lvbnMsIGZpZWxkczogU2NoZW1hRmllbGRzLCB1c2VySWRSZWdFeHA6IFJlZ0V4cCkge1xuICBpZiAoIXBlcm1zKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGZvciAoY29uc3Qgb3BlcmF0aW9uS2V5IGluIHBlcm1zKSB7XG4gICAgaWYgKENMUFZhbGlkS2V5cy5pbmRleE9mKG9wZXJhdGlvbktleSkgPT0gLTEpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICBgJHtvcGVyYXRpb25LZXl9IGlzIG5vdCBhIHZhbGlkIG9wZXJhdGlvbiBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnNgXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IG9wZXJhdGlvbiA9IHBlcm1zW29wZXJhdGlvbktleV07XG4gICAgLy8gcHJvY2VlZCB3aXRoIG5leHQgb3BlcmF0aW9uS2V5XG5cbiAgICAvLyB0aHJvd3Mgd2hlbiByb290IGZpZWxkcyBhcmUgb2Ygd3JvbmcgdHlwZVxuICAgIHZhbGlkYXRlQ0xQanNvbihvcGVyYXRpb24sIG9wZXJhdGlvbktleSk7XG5cbiAgICBpZiAob3BlcmF0aW9uS2V5ID09PSAncmVhZFVzZXJGaWVsZHMnIHx8IG9wZXJhdGlvbktleSA9PT0gJ3dyaXRlVXNlckZpZWxkcycpIHtcbiAgICAgIC8vIHZhbGlkYXRlIGdyb3VwZWQgcG9pbnRlciBwZXJtaXNzaW9uc1xuICAgICAgLy8gbXVzdCBiZSBhbiBhcnJheSB3aXRoIGZpZWxkIG5hbWVzXG4gICAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBvZiBvcGVyYXRpb24pIHtcbiAgICAgICAgdmFsaWRhdGVQb2ludGVyUGVybWlzc2lvbihmaWVsZE5hbWUsIGZpZWxkcywgb3BlcmF0aW9uS2V5KTtcbiAgICAgIH1cbiAgICAgIC8vIHJlYWRVc2VyRmllbGRzIGFuZCB3cml0ZXJVc2VyRmllbGRzIGRvIG5vdCBoYXZlIG5lc2R0ZWQgZmllbGRzXG4gICAgICAvLyBwcm9jZWVkIHdpdGggbmV4dCBvcGVyYXRpb25LZXlcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIC8vIHZhbGlkYXRlIHByb3RlY3RlZCBmaWVsZHNcbiAgICBpZiAob3BlcmF0aW9uS2V5ID09PSAncHJvdGVjdGVkRmllbGRzJykge1xuICAgICAgZm9yIChjb25zdCBlbnRpdHkgaW4gb3BlcmF0aW9uKSB7XG4gICAgICAgIC8vIHRocm93cyBvbiB1bmV4cGVjdGVkIGtleVxuICAgICAgICB2YWxpZGF0ZVByb3RlY3RlZEZpZWxkc0tleShlbnRpdHksIHVzZXJJZFJlZ0V4cCk7XG5cbiAgICAgICAgY29uc3QgcHJvdGVjdGVkRmllbGRzID0gb3BlcmF0aW9uW2VudGl0eV07XG5cbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHByb3RlY3RlZEZpZWxkcykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgJyR7cHJvdGVjdGVkRmllbGRzfScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yIHByb3RlY3RlZEZpZWxkc1ske2VudGl0eX1dIC0gZXhwZWN0ZWQgYW4gYXJyYXkuYFxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBpZiB0aGUgZmllbGQgaXMgaW4gZm9ybSBvZiBhcnJheVxuICAgICAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIHByb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgIC8vIGRvIG5vdCBhbGxvb3cgdG8gcHJvdGVjdCBkZWZhdWx0IGZpZWxkc1xuICAgICAgICAgIGlmIChkZWZhdWx0Q29sdW1ucy5fRGVmYXVsdFtmaWVsZF0pIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICBgRGVmYXVsdCBmaWVsZCAnJHtmaWVsZH0nIGNhbiBub3QgYmUgcHJvdGVjdGVkYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gZmllbGQgc2hvdWxkIGV4aXN0IG9uIGNvbGxlY3Rpb25cbiAgICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChmaWVsZHMsIGZpZWxkKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgIGBGaWVsZCAnJHtmaWVsZH0nIGluIHByb3RlY3RlZEZpZWxkczoke2VudGl0eX0gZG9lcyBub3QgZXhpc3RgXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gcHJvY2VlZCB3aXRoIG5leHQgb3BlcmF0aW9uS2V5XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyB2YWxpZGF0ZSBvdGhlciBmaWVsZHNcbiAgICAvLyBFbnRpdHkgY2FuIGJlOlxuICAgIC8vIFwiKlwiIC0gUHVibGljLFxuICAgIC8vIFwicmVxdWlyZXNBdXRoZW50aWNhdGlvblwiIC0gYXV0aGVudGljYXRlZCB1c2VycyxcbiAgICAvLyBcIm9iamVjdElkXCIgLSBfVXNlciBpZCxcbiAgICAvLyBcInJvbGU6cm9sZW5hbWVcIixcbiAgICAvLyBcInBvaW50ZXJGaWVsZHNcIiAtIGFycmF5IG9mIGZpZWxkIG5hbWVzIGNvbnRhaW5pbmcgcG9pbnRlcnMgdG8gdXNlcnNcbiAgICBmb3IgKGNvbnN0IGVudGl0eSBpbiBvcGVyYXRpb24pIHtcbiAgICAgIC8vIHRocm93cyBvbiB1bmV4cGVjdGVkIGtleVxuICAgICAgdmFsaWRhdGVQZXJtaXNzaW9uS2V5KGVudGl0eSwgdXNlcklkUmVnRXhwKTtcblxuICAgICAgLy8gZW50aXR5IGNhbiBiZSBlaXRoZXI6XG4gICAgICAvLyBcInBvaW50ZXJGaWVsZHNcIjogc3RyaW5nW11cbiAgICAgIGlmIChlbnRpdHkgPT09ICdwb2ludGVyRmllbGRzJykge1xuICAgICAgICBjb25zdCBwb2ludGVyRmllbGRzID0gb3BlcmF0aW9uW2VudGl0eV07XG5cbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocG9pbnRlckZpZWxkcykpIHtcbiAgICAgICAgICBmb3IgKGNvbnN0IHBvaW50ZXJGaWVsZCBvZiBwb2ludGVyRmllbGRzKSB7XG4gICAgICAgICAgICB2YWxpZGF0ZVBvaW50ZXJQZXJtaXNzaW9uKHBvaW50ZXJGaWVsZCwgZmllbGRzLCBvcGVyYXRpb24pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgJyR7cG9pbnRlckZpZWxkc30nIGlzIG5vdCBhIHZhbGlkIHZhbHVlIGZvciAke29wZXJhdGlvbktleX1bJHtlbnRpdHl9XSAtIGV4cGVjdGVkIGFuIGFycmF5LmBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIC8vIHByb2NlZWQgd2l0aCBuZXh0IGVudGl0eSBrZXlcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vIG9yIFtlbnRpdHldOiBib29sZWFuXG4gICAgICBjb25zdCBwZXJtaXQgPSBvcGVyYXRpb25bZW50aXR5XTtcblxuICAgICAgaWYgKHBlcm1pdCAhPT0gdHJ1ZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGAnJHtwZXJtaXR9JyBpcyBub3QgYSB2YWxpZCB2YWx1ZSBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnMgJHtvcGVyYXRpb25LZXl9OiR7ZW50aXR5fToke3Blcm1pdH1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlQ0xQanNvbihvcGVyYXRpb246IGFueSwgb3BlcmF0aW9uS2V5OiBzdHJpbmcpIHtcbiAgaWYgKG9wZXJhdGlvbktleSA9PT0gJ3JlYWRVc2VyRmllbGRzJyB8fCBvcGVyYXRpb25LZXkgPT09ICd3cml0ZVVzZXJGaWVsZHMnKSB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KG9wZXJhdGlvbikpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICBgJyR7b3BlcmF0aW9ufScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zICR7b3BlcmF0aW9uS2V5fSAtIG11c3QgYmUgYW4gYXJyYXlgXG4gICAgICApO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAodHlwZW9mIG9wZXJhdGlvbiA9PT0gJ29iamVjdCcgJiYgb3BlcmF0aW9uICE9PSBudWxsKSB7XG4gICAgICAvLyBvayB0byBwcm9jZWVkXG4gICAgICByZXR1cm47XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICBgJyR7b3BlcmF0aW9ufScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zICR7b3BlcmF0aW9uS2V5fSAtIG11c3QgYmUgYW4gb2JqZWN0YFxuICAgICAgKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVQb2ludGVyUGVybWlzc2lvbihmaWVsZE5hbWU6IHN0cmluZywgZmllbGRzOiBPYmplY3QsIG9wZXJhdGlvbjogc3RyaW5nKSB7XG4gIC8vIFVzZXMgY29sbGVjdGlvbiBzY2hlbWEgdG8gZW5zdXJlIHRoZSBmaWVsZCBpcyBvZiB0eXBlOlxuICAvLyAtIFBvaW50ZXI8X1VzZXI+IChwb2ludGVycylcbiAgLy8gLSBBcnJheVxuICAvL1xuICAvLyAgICBJdCdzIG5vdCBwb3NzaWJsZSB0byBlbmZvcmNlIHR5cGUgb24gQXJyYXkncyBpdGVtcyBpbiBzY2hlbWFcbiAgLy8gIHNvIHdlIGFjY2VwdCBhbnkgQXJyYXkgZmllbGQsIGFuZCBsYXRlciB3aGVuIGFwcGx5aW5nIHBlcm1pc3Npb25zXG4gIC8vICBvbmx5IGl0ZW1zIHRoYXQgYXJlIHBvaW50ZXJzIHRvIF9Vc2VyIGFyZSBjb25zaWRlcmVkLlxuICBpZiAoXG4gICAgIShcbiAgICAgIGZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgICAoKGZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT0gJ1BvaW50ZXInICYmIGZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzID09ICdfVXNlcicpIHx8XG4gICAgICAgIGZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT0gJ0FycmF5JylcbiAgICApXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgIGAnJHtmaWVsZE5hbWV9JyBpcyBub3QgYSB2YWxpZCBjb2x1bW4gZm9yIGNsYXNzIGxldmVsIHBvaW50ZXIgcGVybWlzc2lvbnMgJHtvcGVyYXRpb259YFxuICAgICk7XG4gIH1cbn1cblxuY29uc3Qgam9pbkNsYXNzUmVnZXggPSAvXl9Kb2luOltBLVphLXowLTlfXSs6W0EtWmEtejAtOV9dKy87XG5jb25zdCBjbGFzc0FuZEZpZWxkUmVnZXggPSAvXltBLVphLXpdW0EtWmEtejAtOV9dKiQvO1xuZnVuY3Rpb24gY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAvLyBWYWxpZCBjbGFzc2VzIG11c3Q6XG4gIHJldHVybiAoXG4gICAgLy8gQmUgb25lIG9mIF9Vc2VyLCBfSW5zdGFsbGF0aW9uLCBfUm9sZSwgX1Nlc3Npb24gT1JcbiAgICBzeXN0ZW1DbGFzc2VzLmluZGV4T2YoY2xhc3NOYW1lKSA+IC0xIHx8XG4gICAgLy8gQmUgYSBqb2luIHRhYmxlIE9SXG4gICAgam9pbkNsYXNzUmVnZXgudGVzdChjbGFzc05hbWUpIHx8XG4gICAgLy8gSW5jbHVkZSBvbmx5IGFscGhhLW51bWVyaWMgYW5kIHVuZGVyc2NvcmVzLCBhbmQgbm90IHN0YXJ0IHdpdGggYW4gdW5kZXJzY29yZSBvciBudW1iZXJcbiAgICBmaWVsZE5hbWVJc1ZhbGlkKGNsYXNzTmFtZSlcbiAgKTtcbn1cblxuLy8gVmFsaWQgZmllbGRzIG11c3QgYmUgYWxwaGEtbnVtZXJpYywgYW5kIG5vdCBzdGFydCB3aXRoIGFuIHVuZGVyc2NvcmUgb3IgbnVtYmVyXG5mdW5jdGlvbiBmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIHJldHVybiBjbGFzc0FuZEZpZWxkUmVnZXgudGVzdChmaWVsZE5hbWUpO1xufVxuXG4vLyBDaGVja3MgdGhhdCBpdCdzIG5vdCB0cnlpbmcgdG8gY2xvYmJlciBvbmUgb2YgdGhlIGRlZmF1bHQgZmllbGRzIG9mIHRoZSBjbGFzcy5cbmZ1bmN0aW9uIGZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyhmaWVsZE5hbWU6IHN0cmluZywgY2xhc3NOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZSkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0W2ZpZWxkTmFtZV0pIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV0gJiYgZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXVtmaWVsZE5hbWVdKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZShjbGFzc05hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiAoXG4gICAgJ0ludmFsaWQgY2xhc3NuYW1lOiAnICtcbiAgICBjbGFzc05hbWUgK1xuICAgICcsIGNsYXNzbmFtZXMgY2FuIG9ubHkgaGF2ZSBhbHBoYW51bWVyaWMgY2hhcmFjdGVycyBhbmQgXywgYW5kIG11c3Qgc3RhcnQgd2l0aCBhbiBhbHBoYSBjaGFyYWN0ZXIgJ1xuICApO1xufVxuXG5jb25zdCBpbnZhbGlkSnNvbkVycm9yID0gbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2ludmFsaWQgSlNPTicpO1xuY29uc3QgdmFsaWROb25SZWxhdGlvbk9yUG9pbnRlclR5cGVzID0gW1xuICAnTnVtYmVyJyxcbiAgJ1N0cmluZycsXG4gICdCb29sZWFuJyxcbiAgJ0RhdGUnLFxuICAnT2JqZWN0JyxcbiAgJ0FycmF5JyxcbiAgJ0dlb1BvaW50JyxcbiAgJ0ZpbGUnLFxuICAnQnl0ZXMnLFxuICAnUG9seWdvbicsXG5dO1xuLy8gUmV0dXJucyBhbiBlcnJvciBzdWl0YWJsZSBmb3IgdGhyb3dpbmcgaWYgdGhlIHR5cGUgaXMgaW52YWxpZFxuY29uc3QgZmllbGRUeXBlSXNJbnZhbGlkID0gKHsgdHlwZSwgdGFyZ2V0Q2xhc3MgfSkgPT4ge1xuICBpZiAoWydQb2ludGVyJywgJ1JlbGF0aW9uJ10uaW5kZXhPZih0eXBlKSA+PSAwKSB7XG4gICAgaWYgKCF0YXJnZXRDbGFzcykge1xuICAgICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcigxMzUsIGB0eXBlICR7dHlwZX0gbmVlZHMgYSBjbGFzcyBuYW1lYCk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgdGFyZ2V0Q2xhc3MgIT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gaW52YWxpZEpzb25FcnJvcjtcbiAgICB9IGVsc2UgaWYgKCFjbGFzc05hbWVJc1ZhbGlkKHRhcmdldENsYXNzKSkge1xuICAgICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsIGludmFsaWRDbGFzc05hbWVNZXNzYWdlKHRhcmdldENsYXNzKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICB9XG4gIGlmICh0eXBlb2YgdHlwZSAhPT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gaW52YWxpZEpzb25FcnJvcjtcbiAgfVxuICBpZiAodmFsaWROb25SZWxhdGlvbk9yUG9pbnRlclR5cGVzLmluZGV4T2YodHlwZSkgPCAwKSB7XG4gICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSwgYGludmFsaWQgZmllbGQgdHlwZTogJHt0eXBlfWApO1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59O1xuXG5jb25zdCBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hID0gKHNjaGVtYTogYW55KSA9PiB7XG4gIHNjaGVtYSA9IGluamVjdERlZmF1bHRTY2hlbWEoc2NoZW1hKTtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuQUNMO1xuICBzY2hlbWEuZmllbGRzLl9ycGVybSA9IHsgdHlwZTogJ0FycmF5JyB9O1xuICBzY2hlbWEuZmllbGRzLl93cGVybSA9IHsgdHlwZTogJ0FycmF5JyB9O1xuXG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMucGFzc3dvcmQ7XG4gICAgc2NoZW1hLmZpZWxkcy5faGFzaGVkX3Bhc3N3b3JkID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICB9XG5cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNvbnN0IGNvbnZlcnRBZGFwdGVyU2NoZW1hVG9QYXJzZVNjaGVtYSA9ICh7IC4uLnNjaGVtYSB9KSA9PiB7XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9ycGVybTtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3dwZXJtO1xuXG4gIHNjaGVtYS5maWVsZHMuQUNMID0geyB0eXBlOiAnQUNMJyB9O1xuXG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuYXV0aERhdGE7IC8vQXV0aCBkYXRhIGlzIGltcGxpY2l0XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZDtcbiAgICBzY2hlbWEuZmllbGRzLnBhc3N3b3JkID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICB9XG5cbiAgaWYgKHNjaGVtYS5pbmRleGVzICYmIE9iamVjdC5rZXlzKHNjaGVtYS5pbmRleGVzKS5sZW5ndGggPT09IDApIHtcbiAgICBkZWxldGUgc2NoZW1hLmluZGV4ZXM7XG4gIH1cblxuICByZXR1cm4gc2NoZW1hO1xufTtcblxuY2xhc3MgU2NoZW1hRGF0YSB7XG4gIF9fZGF0YTogYW55O1xuICBfX3Byb3RlY3RlZEZpZWxkczogYW55O1xuICBjb25zdHJ1Y3RvcihhbGxTY2hlbWFzID0gW10sIHByb3RlY3RlZEZpZWxkcyA9IHt9KSB7XG4gICAgdGhpcy5fX2RhdGEgPSB7fTtcbiAgICB0aGlzLl9fcHJvdGVjdGVkRmllbGRzID0gcHJvdGVjdGVkRmllbGRzO1xuICAgIGFsbFNjaGVtYXMuZm9yRWFjaChzY2hlbWEgPT4ge1xuICAgICAgaWYgKHZvbGF0aWxlQ2xhc3Nlcy5pbmNsdWRlcyhzY2hlbWEuY2xhc3NOYW1lKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgc2NoZW1hLmNsYXNzTmFtZSwge1xuICAgICAgICBnZXQ6ICgpID0+IHtcbiAgICAgICAgICBpZiAoIXRoaXMuX19kYXRhW3NjaGVtYS5jbGFzc05hbWVdKSB7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0ge307XG4gICAgICAgICAgICBkYXRhLmZpZWxkcyA9IGluamVjdERlZmF1bHRTY2hlbWEoc2NoZW1hKS5maWVsZHM7XG4gICAgICAgICAgICBkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IGRlZXBjb3B5KHNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMpO1xuICAgICAgICAgICAgZGF0YS5pbmRleGVzID0gc2NoZW1hLmluZGV4ZXM7XG5cbiAgICAgICAgICAgIGNvbnN0IGNsYXNzUHJvdGVjdGVkRmllbGRzID0gdGhpcy5fX3Byb3RlY3RlZEZpZWxkc1tzY2hlbWEuY2xhc3NOYW1lXTtcbiAgICAgICAgICAgIGlmIChjbGFzc1Byb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBjbGFzc1Byb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHVucSA9IG5ldyBTZXQoW1xuICAgICAgICAgICAgICAgICAgLi4uKGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLnByb3RlY3RlZEZpZWxkc1trZXldIHx8IFtdKSxcbiAgICAgICAgICAgICAgICAgIC4uLmNsYXNzUHJvdGVjdGVkRmllbGRzW2tleV0sXG4gICAgICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICAgICAgZGF0YS5jbGFzc0xldmVsUGVybWlzc2lvbnMucHJvdGVjdGVkRmllbGRzW2tleV0gPSBBcnJheS5mcm9tKHVucSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5fX2RhdGFbc2NoZW1hLmNsYXNzTmFtZV0gPSBkYXRhO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdGhpcy5fX2RhdGFbc2NoZW1hLmNsYXNzTmFtZV07XG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIC8vIEluamVjdCB0aGUgaW4tbWVtb3J5IGNsYXNzZXNcbiAgICB2b2xhdGlsZUNsYXNzZXMuZm9yRWFjaChjbGFzc05hbWUgPT4ge1xuICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIGNsYXNzTmFtZSwge1xuICAgICAgICBnZXQ6ICgpID0+IHtcbiAgICAgICAgICBpZiAoIXRoaXMuX19kYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgICAgICAgIGNvbnN0IHNjaGVtYSA9IGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGZpZWxkczoge30sXG4gICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSB7fTtcbiAgICAgICAgICAgIGRhdGEuZmllbGRzID0gc2NoZW1hLmZpZWxkcztcbiAgICAgICAgICAgIGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zID0gc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICAgICAgICAgIGRhdGEuaW5kZXhlcyA9IHNjaGVtYS5pbmRleGVzO1xuICAgICAgICAgICAgdGhpcy5fX2RhdGFbY2xhc3NOYW1lXSA9IGRhdGE7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLl9fZGF0YVtjbGFzc05hbWVdO1xuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cbn1cblxuY29uc3QgaW5qZWN0RGVmYXVsdFNjaGVtYSA9ICh7IGNsYXNzTmFtZSwgZmllbGRzLCBjbGFzc0xldmVsUGVybWlzc2lvbnMsIGluZGV4ZXMgfTogU2NoZW1hKSA9PiB7XG4gIGNvbnN0IGRlZmF1bHRTY2hlbWE6IFNjaGVtYSA9IHtcbiAgICBjbGFzc05hbWUsXG4gICAgZmllbGRzOiB7XG4gICAgICAuLi5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgIC4uLihkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdIHx8IHt9KSxcbiAgICAgIC4uLmZpZWxkcyxcbiAgICB9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgfTtcbiAgaWYgKGluZGV4ZXMgJiYgT2JqZWN0LmtleXMoaW5kZXhlcykubGVuZ3RoICE9PSAwKSB7XG4gICAgZGVmYXVsdFNjaGVtYS5pbmRleGVzID0gaW5kZXhlcztcbiAgfVxuICByZXR1cm4gZGVmYXVsdFNjaGVtYTtcbn07XG5cbmNvbnN0IF9Ib29rc1NjaGVtYSA9IHsgY2xhc3NOYW1lOiAnX0hvb2tzJywgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fSG9va3MgfTtcbmNvbnN0IF9HbG9iYWxDb25maWdTY2hlbWEgPSB7XG4gIGNsYXNzTmFtZTogJ19HbG9iYWxDb25maWcnLFxuICBmaWVsZHM6IGRlZmF1bHRDb2x1bW5zLl9HbG9iYWxDb25maWcsXG59O1xuY29uc3QgX0dyYXBoUUxDb25maWdTY2hlbWEgPSB7XG4gIGNsYXNzTmFtZTogJ19HcmFwaFFMQ29uZmlnJyxcbiAgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fR3JhcGhRTENvbmZpZyxcbn07XG5jb25zdCBfUHVzaFN0YXR1c1NjaGVtYSA9IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoXG4gIGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgIGNsYXNzTmFtZTogJ19QdXNoU3RhdHVzJyxcbiAgICBmaWVsZHM6IHt9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgX0pvYlN0YXR1c1NjaGVtYSA9IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoXG4gIGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgIGNsYXNzTmFtZTogJ19Kb2JTdGF0dXMnLFxuICAgIGZpZWxkczoge30sXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgfSlcbik7XG5jb25zdCBfSm9iU2NoZWR1bGVTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfSm9iU2NoZWR1bGUnLFxuICAgIGZpZWxkczoge30sXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgfSlcbik7XG5jb25zdCBfQXVkaWVuY2VTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfQXVkaWVuY2UnLFxuICAgIGZpZWxkczogZGVmYXVsdENvbHVtbnMuX0F1ZGllbmNlLFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgX0lkZW1wb3RlbmN5U2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX0lkZW1wb3RlbmN5JyxcbiAgICBmaWVsZHM6IGRlZmF1bHRDb2x1bW5zLl9JZGVtcG90ZW5jeSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMgPSBbXG4gIF9Ib29rc1NjaGVtYSxcbiAgX0pvYlN0YXR1c1NjaGVtYSxcbiAgX0pvYlNjaGVkdWxlU2NoZW1hLFxuICBfUHVzaFN0YXR1c1NjaGVtYSxcbiAgX0dsb2JhbENvbmZpZ1NjaGVtYSxcbiAgX0dyYXBoUUxDb25maWdTY2hlbWEsXG4gIF9BdWRpZW5jZVNjaGVtYSxcbiAgX0lkZW1wb3RlbmN5U2NoZW1hLFxuXTtcblxuY29uc3QgZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUgPSAoZGJUeXBlOiBTY2hlbWFGaWVsZCB8IHN0cmluZywgb2JqZWN0VHlwZTogU2NoZW1hRmllbGQpID0+IHtcbiAgaWYgKGRiVHlwZS50eXBlICE9PSBvYmplY3RUeXBlLnR5cGUpIHJldHVybiBmYWxzZTtcbiAgaWYgKGRiVHlwZS50YXJnZXRDbGFzcyAhPT0gb2JqZWN0VHlwZS50YXJnZXRDbGFzcykgcmV0dXJuIGZhbHNlO1xuICBpZiAoZGJUeXBlID09PSBvYmplY3RUeXBlLnR5cGUpIHJldHVybiB0cnVlO1xuICBpZiAoZGJUeXBlLnR5cGUgPT09IG9iamVjdFR5cGUudHlwZSkgcmV0dXJuIHRydWU7XG4gIHJldHVybiBmYWxzZTtcbn07XG5cbmNvbnN0IHR5cGVUb1N0cmluZyA9ICh0eXBlOiBTY2hlbWFGaWVsZCB8IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGlmICh0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gdHlwZTtcbiAgfVxuICBpZiAodHlwZS50YXJnZXRDbGFzcykge1xuICAgIHJldHVybiBgJHt0eXBlLnR5cGV9PCR7dHlwZS50YXJnZXRDbGFzc30+YDtcbiAgfVxuICByZXR1cm4gYCR7dHlwZS50eXBlfWA7XG59O1xuXG4vLyBTdG9yZXMgdGhlIGVudGlyZSBzY2hlbWEgb2YgdGhlIGFwcCBpbiBhIHdlaXJkIGh5YnJpZCBmb3JtYXQgc29tZXdoZXJlIGJldHdlZW5cbi8vIHRoZSBtb25nbyBmb3JtYXQgYW5kIHRoZSBQYXJzZSBmb3JtYXQuIFNvb24sIHRoaXMgd2lsbCBhbGwgYmUgUGFyc2UgZm9ybWF0LlxuZXhwb3J0IGRlZmF1bHQgY2xhc3MgU2NoZW1hQ29udHJvbGxlciB7XG4gIF9kYkFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyO1xuICBzY2hlbWFEYXRhOiB7IFtzdHJpbmddOiBTY2hlbWEgfTtcbiAgX2NhY2hlOiBhbnk7XG4gIHJlbG9hZERhdGFQcm9taXNlOiA/UHJvbWlzZTxhbnk+O1xuICBwcm90ZWN0ZWRGaWVsZHM6IGFueTtcbiAgdXNlcklkUmVnRXg6IFJlZ0V4cDtcblxuICBjb25zdHJ1Y3RvcihkYXRhYmFzZUFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyLCBzY2hlbWFDYWNoZTogYW55KSB7XG4gICAgdGhpcy5fZGJBZGFwdGVyID0gZGF0YWJhc2VBZGFwdGVyO1xuICAgIHRoaXMuX2NhY2hlID0gc2NoZW1hQ2FjaGU7XG4gICAgdGhpcy5zY2hlbWFEYXRhID0gbmV3IFNjaGVtYURhdGEoKTtcbiAgICB0aGlzLnByb3RlY3RlZEZpZWxkcyA9IENvbmZpZy5nZXQoUGFyc2UuYXBwbGljYXRpb25JZCkucHJvdGVjdGVkRmllbGRzO1xuXG4gICAgY29uc3QgY3VzdG9tSWRzID0gQ29uZmlnLmdldChQYXJzZS5hcHBsaWNhdGlvbklkKS5hbGxvd0N1c3RvbU9iamVjdElkO1xuXG4gICAgY29uc3QgY3VzdG9tSWRSZWdFeCA9IC9eLnsxLH0kL3U7IC8vIDErIGNoYXJzXG4gICAgY29uc3QgYXV0b0lkUmVnRXggPSAvXlthLXpBLVowLTldezEsfSQvO1xuXG4gICAgdGhpcy51c2VySWRSZWdFeCA9IGN1c3RvbUlkcyA/IGN1c3RvbUlkUmVnRXggOiBhdXRvSWRSZWdFeDtcbiAgfVxuXG4gIHJlbG9hZERhdGEob3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH0pOiBQcm9taXNlPGFueT4ge1xuICAgIGlmICh0aGlzLnJlbG9hZERhdGFQcm9taXNlICYmICFvcHRpb25zLmNsZWFyQ2FjaGUpIHtcbiAgICAgIHJldHVybiB0aGlzLnJlbG9hZERhdGFQcm9taXNlO1xuICAgIH1cbiAgICB0aGlzLnJlbG9hZERhdGFQcm9taXNlID0gdGhpcy5nZXRBbGxDbGFzc2VzKG9wdGlvbnMpXG4gICAgICAudGhlbihcbiAgICAgICAgYWxsU2NoZW1hcyA9PiB7XG4gICAgICAgICAgdGhpcy5zY2hlbWFEYXRhID0gbmV3IFNjaGVtYURhdGEoYWxsU2NoZW1hcywgdGhpcy5wcm90ZWN0ZWRGaWVsZHMpO1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLnJlbG9hZERhdGFQcm9taXNlO1xuICAgICAgICB9LFxuICAgICAgICBlcnIgPT4ge1xuICAgICAgICAgIHRoaXMuc2NoZW1hRGF0YSA9IG5ldyBTY2hlbWFEYXRhKCk7XG4gICAgICAgICAgZGVsZXRlIHRoaXMucmVsb2FkRGF0YVByb21pc2U7XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICApXG4gICAgICAudGhlbigoKSA9PiB7fSk7XG4gICAgcmV0dXJuIHRoaXMucmVsb2FkRGF0YVByb21pc2U7XG4gIH1cblxuICBnZXRBbGxDbGFzc2VzKG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9KTogUHJvbWlzZTxBcnJheTxTY2hlbWE+PiB7XG4gICAgaWYgKG9wdGlvbnMuY2xlYXJDYWNoZSkge1xuICAgICAgcmV0dXJuIHRoaXMuc2V0QWxsQ2xhc3NlcygpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5fY2FjaGUuZ2V0QWxsQ2xhc3NlcygpLnRoZW4oYWxsQ2xhc3NlcyA9PiB7XG4gICAgICBpZiAoYWxsQ2xhc3NlcyAmJiBhbGxDbGFzc2VzLmxlbmd0aCkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGFsbENsYXNzZXMpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRoaXMuc2V0QWxsQ2xhc3NlcygpO1xuICAgIH0pO1xuICB9XG5cbiAgc2V0QWxsQ2xhc3NlcygpOiBQcm9taXNlPEFycmF5PFNjaGVtYT4+IHtcbiAgICByZXR1cm4gdGhpcy5fZGJBZGFwdGVyXG4gICAgICAuZ2V0QWxsQ2xhc3NlcygpXG4gICAgICAudGhlbihhbGxTY2hlbWFzID0+IGFsbFNjaGVtYXMubWFwKGluamVjdERlZmF1bHRTY2hlbWEpKVxuICAgICAgLnRoZW4oYWxsU2NoZW1hcyA9PiB7XG4gICAgICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLWNvbnNvbGUgKi9cbiAgICAgICAgdGhpcy5fY2FjaGVcbiAgICAgICAgICAuc2V0QWxsQ2xhc3NlcyhhbGxTY2hlbWFzKVxuICAgICAgICAgIC5jYXRjaChlcnJvciA9PiBjb25zb2xlLmVycm9yKCdFcnJvciBzYXZpbmcgc2NoZW1hIHRvIGNhY2hlOicsIGVycm9yKSk7XG4gICAgICAgIC8qIGVzbGludC1lbmFibGUgbm8tY29uc29sZSAqL1xuICAgICAgICByZXR1cm4gYWxsU2NoZW1hcztcbiAgICAgIH0pO1xuICB9XG5cbiAgZ2V0T25lU2NoZW1hKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGFsbG93Vm9sYXRpbGVDbGFzc2VzOiBib29sZWFuID0gZmFsc2UsXG4gICAgb3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH1cbiAgKTogUHJvbWlzZTxTY2hlbWE+IHtcbiAgICBsZXQgcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgIGlmIChvcHRpb25zLmNsZWFyQ2FjaGUpIHtcbiAgICAgIHByb21pc2UgPSB0aGlzLl9jYWNoZS5jbGVhcigpO1xuICAgIH1cbiAgICByZXR1cm4gcHJvbWlzZS50aGVuKCgpID0+IHtcbiAgICAgIGlmIChhbGxvd1ZvbGF0aWxlQ2xhc3NlcyAmJiB2b2xhdGlsZUNsYXNzZXMuaW5kZXhPZihjbGFzc05hbWUpID4gLTEpIHtcbiAgICAgICAgY29uc3QgZGF0YSA9IHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdO1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgZmllbGRzOiBkYXRhLmZpZWxkcyxcbiAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgIGluZGV4ZXM6IGRhdGEuaW5kZXhlcyxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gdGhpcy5fY2FjaGUuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSkudGhlbihjYWNoZWQgPT4ge1xuICAgICAgICBpZiAoY2FjaGVkICYmICFvcHRpb25zLmNsZWFyQ2FjaGUpIHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGNhY2hlZCk7XG4gICAgICAgIH1cbiAgICAgICAgcmV0dXJuIHRoaXMuc2V0QWxsQ2xhc3NlcygpLnRoZW4oYWxsU2NoZW1hcyA9PiB7XG4gICAgICAgICAgY29uc3Qgb25lU2NoZW1hID0gYWxsU2NoZW1hcy5maW5kKHNjaGVtYSA9PiBzY2hlbWEuY2xhc3NOYW1lID09PSBjbGFzc05hbWUpO1xuICAgICAgICAgIGlmICghb25lU2NoZW1hKSB7XG4gICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QodW5kZWZpbmVkKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIG9uZVNjaGVtYTtcbiAgICAgICAgfSk7XG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIG5ldyBjbGFzcyB0aGF0IGluY2x1ZGVzIHRoZSB0aHJlZSBkZWZhdWx0IGZpZWxkcy5cbiAgLy8gQUNMIGlzIGFuIGltcGxpY2l0IGNvbHVtbiB0aGF0IGRvZXMgbm90IGdldCBhbiBlbnRyeSBpbiB0aGVcbiAgLy8gX1NDSEVNQVMgZGF0YWJhc2UuIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2l0aCB0aGVcbiAgLy8gY3JlYXRlZCBzY2hlbWEsIGluIG1vbmdvIGZvcm1hdC5cbiAgLy8gb24gc3VjY2VzcywgYW5kIHJlamVjdHMgd2l0aCBhbiBlcnJvciBvbiBmYWlsLiBFbnN1cmUgeW91XG4gIC8vIGhhdmUgYXV0aG9yaXphdGlvbiAobWFzdGVyIGtleSwgb3IgY2xpZW50IGNsYXNzIGNyZWF0aW9uXG4gIC8vIGVuYWJsZWQpIGJlZm9yZSBjYWxsaW5nIHRoaXMgZnVuY3Rpb24uXG4gIGFkZENsYXNzSWZOb3RFeGlzdHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGRzOiBTY2hlbWFGaWVsZHMgPSB7fSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGFueSxcbiAgICBpbmRleGVzOiBhbnkgPSB7fVxuICApOiBQcm9taXNlPHZvaWQgfCBTY2hlbWE+IHtcbiAgICB2YXIgdmFsaWRhdGlvbkVycm9yID0gdGhpcy52YWxpZGF0ZU5ld0NsYXNzKGNsYXNzTmFtZSwgZmllbGRzLCBjbGFzc0xldmVsUGVybWlzc2lvbnMpO1xuICAgIGlmICh2YWxpZGF0aW9uRXJyb3IpIHtcbiAgICAgIGlmICh2YWxpZGF0aW9uRXJyb3IgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QodmFsaWRhdGlvbkVycm9yKTtcbiAgICAgIH0gZWxzZSBpZiAodmFsaWRhdGlvbkVycm9yLmNvZGUgJiYgdmFsaWRhdGlvbkVycm9yLmVycm9yKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgUGFyc2UuRXJyb3IodmFsaWRhdGlvbkVycm9yLmNvZGUsIHZhbGlkYXRpb25FcnJvci5lcnJvcikpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KHZhbGlkYXRpb25FcnJvcik7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuX2RiQWRhcHRlclxuICAgICAgLmNyZWF0ZUNsYXNzKFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoe1xuICAgICAgICAgIGZpZWxkcyxcbiAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgaW5kZXhlcyxcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIH0pXG4gICAgICApXG4gICAgICAudGhlbihjb252ZXJ0QWRhcHRlclNjaGVtYVRvUGFyc2VTY2hlbWEpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLFxuICAgICAgICAgICAgYENsYXNzICR7Y2xhc3NOYW1lfSBhbHJlYWR5IGV4aXN0cy5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICB1cGRhdGVDbGFzcyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzdWJtaXR0ZWRGaWVsZHM6IFNjaGVtYUZpZWxkcyxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGFueSxcbiAgICBpbmRleGVzOiBhbnksXG4gICAgZGF0YWJhc2U6IERhdGFiYXNlQ29udHJvbGxlclxuICApIHtcbiAgICByZXR1cm4gdGhpcy5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmdGaWVsZHMgPSBzY2hlbWEuZmllbGRzO1xuICAgICAgICBPYmplY3Qua2V5cyhzdWJtaXR0ZWRGaWVsZHMpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICAgICAgY29uc3QgZmllbGQgPSBzdWJtaXR0ZWRGaWVsZHNbbmFtZV07XG4gICAgICAgICAgaWYgKGV4aXN0aW5nRmllbGRzW25hbWVdICYmIGZpZWxkLl9fb3AgIT09ICdEZWxldGUnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMjU1LCBgRmllbGQgJHtuYW1lfSBleGlzdHMsIGNhbm5vdCB1cGRhdGUuYCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghZXhpc3RpbmdGaWVsZHNbbmFtZV0gJiYgZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigyNTUsIGBGaWVsZCAke25hbWV9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgZGVsZXRlLmApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgZGVsZXRlIGV4aXN0aW5nRmllbGRzLl9ycGVybTtcbiAgICAgICAgZGVsZXRlIGV4aXN0aW5nRmllbGRzLl93cGVybTtcbiAgICAgICAgY29uc3QgbmV3U2NoZW1hID0gYnVpbGRNZXJnZWRTY2hlbWFPYmplY3QoZXhpc3RpbmdGaWVsZHMsIHN1Ym1pdHRlZEZpZWxkcyk7XG4gICAgICAgIGNvbnN0IGRlZmF1bHRGaWVsZHMgPSBkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdIHx8IGRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0O1xuICAgICAgICBjb25zdCBmdWxsTmV3U2NoZW1hID0gT2JqZWN0LmFzc2lnbih7fSwgbmV3U2NoZW1hLCBkZWZhdWx0RmllbGRzKTtcbiAgICAgICAgY29uc3QgdmFsaWRhdGlvbkVycm9yID0gdGhpcy52YWxpZGF0ZVNjaGVtYURhdGEoXG4gICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgIG5ld1NjaGVtYSxcbiAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgT2JqZWN0LmtleXMoZXhpc3RpbmdGaWVsZHMpXG4gICAgICAgICk7XG4gICAgICAgIGlmICh2YWxpZGF0aW9uRXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IodmFsaWRhdGlvbkVycm9yLmNvZGUsIHZhbGlkYXRpb25FcnJvci5lcnJvcik7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBGaW5hbGx5IHdlIGhhdmUgY2hlY2tlZCB0byBtYWtlIHN1cmUgdGhlIHJlcXVlc3QgaXMgdmFsaWQgYW5kIHdlIGNhbiBzdGFydCBkZWxldGluZyBmaWVsZHMuXG4gICAgICAgIC8vIERvIGFsbCBkZWxldGlvbnMgZmlyc3QsIHRoZW4gYSBzaW5nbGUgc2F2ZSB0byBfU0NIRU1BIGNvbGxlY3Rpb24gdG8gaGFuZGxlIGFsbCBhZGRpdGlvbnMuXG4gICAgICAgIGNvbnN0IGRlbGV0ZWRGaWVsZHM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGNvbnN0IGluc2VydGVkRmllbGRzID0gW107XG4gICAgICAgIE9iamVjdC5rZXlzKHN1Ym1pdHRlZEZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgIGlmIChzdWJtaXR0ZWRGaWVsZHNbZmllbGROYW1lXS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICAgICAgZGVsZXRlZEZpZWxkcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGluc2VydGVkRmllbGRzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGxldCBkZWxldGVQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIGlmIChkZWxldGVkRmllbGRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBkZWxldGVQcm9taXNlID0gdGhpcy5kZWxldGVGaWVsZHMoZGVsZXRlZEZpZWxkcywgY2xhc3NOYW1lLCBkYXRhYmFzZSk7XG4gICAgICAgIH1cbiAgICAgICAgbGV0IGVuZm9yY2VGaWVsZHMgPSBbXTtcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICBkZWxldGVQcm9taXNlIC8vIERlbGV0ZSBFdmVyeXRoaW5nXG4gICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pKSAvLyBSZWxvYWQgb3VyIFNjaGVtYSwgc28gd2UgaGF2ZSBhbGwgdGhlIG5ldyB2YWx1ZXNcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgcHJvbWlzZXMgPSBpbnNlcnRlZEZpZWxkcy5tYXAoZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB0eXBlID0gc3VibWl0dGVkRmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuZW5mb3JjZUZpZWxkRXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICAgIGVuZm9yY2VGaWVsZHMgPSByZXN1bHRzLmZpbHRlcihyZXN1bHQgPT4gISFyZXN1bHQpO1xuICAgICAgICAgICAgICByZXR1cm4gdGhpcy5zZXRQZXJtaXNzaW9ucyhjbGFzc05hbWUsIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucywgbmV3U2NoZW1hKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbigoKSA9PlxuICAgICAgICAgICAgICB0aGlzLl9kYkFkYXB0ZXIuc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoXG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgIGluZGV4ZXMsXG4gICAgICAgICAgICAgICAgc2NoZW1hLmluZGV4ZXMsXG4gICAgICAgICAgICAgICAgZnVsbE5ld1NjaGVtYVxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApXG4gICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pKVxuICAgICAgICAgICAgLy9UT0RPOiBNb3ZlIHRoaXMgbG9naWMgaW50byB0aGUgZGF0YWJhc2UgYWRhcHRlclxuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICB0aGlzLmVuc3VyZUZpZWxkcyhlbmZvcmNlRmllbGRzKTtcbiAgICAgICAgICAgICAgY29uc3Qgc2NoZW1hID0gdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV07XG4gICAgICAgICAgICAgIGNvbnN0IHJlbG9hZGVkU2NoZW1hOiBTY2hlbWEgPSB7XG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgZmllbGRzOiBzY2hlbWEuZmllbGRzLFxuICAgICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgaWYgKHNjaGVtYS5pbmRleGVzICYmIE9iamVjdC5rZXlzKHNjaGVtYS5pbmRleGVzKS5sZW5ndGggIT09IDApIHtcbiAgICAgICAgICAgICAgICByZWxvYWRlZFNjaGVtYS5pbmRleGVzID0gc2NoZW1hLmluZGV4ZXM7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIHJlbG9hZGVkU2NoZW1hO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSxcbiAgICAgICAgICAgIGBDbGFzcyAke2NsYXNzTmFtZX0gZG9lcyBub3QgZXhpc3QuYFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgdG8gdGhlIG5ldyBzY2hlbWFcbiAgLy8gb2JqZWN0IG9yIGZhaWxzIHdpdGggYSByZWFzb24uXG4gIGVuZm9yY2VDbGFzc0V4aXN0cyhjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlcj4ge1xuICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzKTtcbiAgICB9XG4gICAgLy8gV2UgZG9uJ3QgaGF2ZSB0aGlzIGNsYXNzLiBVcGRhdGUgdGhlIHNjaGVtYVxuICAgIHJldHVybiAoXG4gICAgICB0aGlzLmFkZENsYXNzSWZOb3RFeGlzdHMoY2xhc3NOYW1lKVxuICAgICAgICAvLyBUaGUgc2NoZW1hIHVwZGF0ZSBzdWNjZWVkZWQuIFJlbG9hZCB0aGUgc2NoZW1hXG4gICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSkpXG4gICAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgLy8gVGhlIHNjaGVtYSB1cGRhdGUgZmFpbGVkLiBUaGlzIGNhbiBiZSBva2F5IC0gaXQgbWlnaHRcbiAgICAgICAgICAvLyBoYXZlIGZhaWxlZCBiZWNhdXNlIHRoZXJlJ3MgYSByYWNlIGNvbmRpdGlvbiBhbmQgYSBkaWZmZXJlbnRcbiAgICAgICAgICAvLyBjbGllbnQgaXMgbWFraW5nIHRoZSBleGFjdCBzYW1lIHNjaGVtYSB1cGRhdGUgdGhhdCB3ZSB3YW50LlxuICAgICAgICAgIC8vIFNvIGp1c3QgcmVsb2FkIHRoZSBzY2hlbWEuXG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAvLyBFbnN1cmUgdGhhdCB0aGUgc2NoZW1hIG5vdyB2YWxpZGF0ZXNcbiAgICAgICAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgRmFpbGVkIHRvIGFkZCAke2NsYXNzTmFtZX1gKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgLy8gVGhlIHNjaGVtYSBzdGlsbCBkb2Vzbid0IHZhbGlkYXRlLiBHaXZlIHVwXG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ3NjaGVtYSBjbGFzcyBuYW1lIGRvZXMgbm90IHJldmFsaWRhdGUnKTtcbiAgICAgICAgfSlcbiAgICApO1xuICB9XG5cbiAgdmFsaWRhdGVOZXdDbGFzcyhjbGFzc05hbWU6IHN0cmluZywgZmllbGRzOiBTY2hlbWFGaWVsZHMgPSB7fSwgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBhbnkpOiBhbnkge1xuICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSwgYENsYXNzICR7Y2xhc3NOYW1lfSBhbHJlYWR5IGV4aXN0cy5gKTtcbiAgICB9XG4gICAgaWYgKCFjbGFzc05hbWVJc1ZhbGlkKGNsYXNzTmFtZSkpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSxcbiAgICAgICAgZXJyb3I6IGludmFsaWRDbGFzc05hbWVNZXNzYWdlKGNsYXNzTmFtZSksXG4gICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy52YWxpZGF0ZVNjaGVtYURhdGEoY2xhc3NOYW1lLCBmaWVsZHMsIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucywgW10pO1xuICB9XG5cbiAgdmFsaWRhdGVTY2hlbWFEYXRhKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZpZWxkczogU2NoZW1hRmllbGRzLFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogQ2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgIGV4aXN0aW5nRmllbGROYW1lczogQXJyYXk8c3RyaW5nPlxuICApIHtcbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBmaWVsZHMpIHtcbiAgICAgIGlmIChleGlzdGluZ0ZpZWxkTmFtZXMuaW5kZXhPZihmaWVsZE5hbWUpIDwgMCkge1xuICAgICAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWQoZmllbGROYW1lKSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgZXJyb3I6ICdpbnZhbGlkIGZpZWxkIG5hbWU6ICcgKyBmaWVsZE5hbWUsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyhmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgY29kZTogMTM2LFxuICAgICAgICAgICAgZXJyb3I6ICdmaWVsZCAnICsgZmllbGROYW1lICsgJyBjYW5ub3QgYmUgYWRkZWQnLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZmllbGRUeXBlID0gZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgIGNvbnN0IGVycm9yID0gZmllbGRUeXBlSXNJbnZhbGlkKGZpZWxkVHlwZSk7XG4gICAgICAgIGlmIChlcnJvcikgcmV0dXJuIHsgY29kZTogZXJyb3IuY29kZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfTtcbiAgICAgICAgaWYgKGZpZWxkVHlwZS5kZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGxldCBkZWZhdWx0VmFsdWVUeXBlID0gZ2V0VHlwZShmaWVsZFR5cGUuZGVmYXVsdFZhbHVlKTtcbiAgICAgICAgICBpZiAodHlwZW9mIGRlZmF1bHRWYWx1ZVR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICBkZWZhdWx0VmFsdWVUeXBlID0geyB0eXBlOiBkZWZhdWx0VmFsdWVUeXBlIH07XG4gICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZGVmYXVsdFZhbHVlVHlwZSA9PT0gJ29iamVjdCcgJiYgZmllbGRUeXBlLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgICAgICBlcnJvcjogYFRoZSAnZGVmYXVsdCB2YWx1ZScgb3B0aW9uIGlzIG5vdCBhcHBsaWNhYmxlIGZvciAke3R5cGVUb1N0cmluZyhmaWVsZFR5cGUpfWAsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIWRiVHlwZU1hdGNoZXNPYmplY3RUeXBlKGZpZWxkVHlwZSwgZGVmYXVsdFZhbHVlVHlwZSkpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgICAgICBlcnJvcjogYHNjaGVtYSBtaXNtYXRjaCBmb3IgJHtjbGFzc05hbWV9LiR7ZmllbGROYW1lfSBkZWZhdWx0IHZhbHVlOyBleHBlY3RlZCAke3R5cGVUb1N0cmluZyhcbiAgICAgICAgICAgICAgICBmaWVsZFR5cGVcbiAgICAgICAgICAgICAgKX0gYnV0IGdvdCAke3R5cGVUb1N0cmluZyhkZWZhdWx0VmFsdWVUeXBlKX1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRUeXBlLnJlcXVpcmVkKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBmaWVsZFR5cGUgPT09ICdvYmplY3QnICYmIGZpZWxkVHlwZS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICAgICAgZXJyb3I6IGBUaGUgJ3JlcXVpcmVkJyBvcHRpb24gaXMgbm90IGFwcGxpY2FibGUgZm9yICR7dHlwZVRvU3RyaW5nKGZpZWxkVHlwZSl9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXSkge1xuICAgICAgZmllbGRzW2ZpZWxkTmFtZV0gPSBkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdW2ZpZWxkTmFtZV07XG4gICAgfVxuXG4gICAgY29uc3QgZ2VvUG9pbnRzID0gT2JqZWN0LmtleXMoZmllbGRzKS5maWx0ZXIoXG4gICAgICBrZXkgPT4gZmllbGRzW2tleV0gJiYgZmllbGRzW2tleV0udHlwZSA9PT0gJ0dlb1BvaW50J1xuICAgICk7XG4gICAgaWYgKGdlb1BvaW50cy5sZW5ndGggPiAxKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgZXJyb3I6XG4gICAgICAgICAgJ2N1cnJlbnRseSwgb25seSBvbmUgR2VvUG9pbnQgZmllbGQgbWF5IGV4aXN0IGluIGFuIG9iamVjdC4gQWRkaW5nICcgK1xuICAgICAgICAgIGdlb1BvaW50c1sxXSArXG4gICAgICAgICAgJyB3aGVuICcgK1xuICAgICAgICAgIGdlb1BvaW50c1swXSArXG4gICAgICAgICAgJyBhbHJlYWR5IGV4aXN0cy4nLFxuICAgICAgfTtcbiAgICB9XG4gICAgdmFsaWRhdGVDTFAoY2xhc3NMZXZlbFBlcm1pc3Npb25zLCBmaWVsZHMsIHRoaXMudXNlcklkUmVnRXgpO1xuICB9XG5cbiAgLy8gU2V0cyB0aGUgQ2xhc3MtbGV2ZWwgcGVybWlzc2lvbnMgZm9yIGEgZ2l2ZW4gY2xhc3NOYW1lLCB3aGljaCBtdXN0IGV4aXN0LlxuICBzZXRQZXJtaXNzaW9ucyhjbGFzc05hbWU6IHN0cmluZywgcGVybXM6IGFueSwgbmV3U2NoZW1hOiBTY2hlbWFGaWVsZHMpIHtcbiAgICBpZiAodHlwZW9mIHBlcm1zID09PSAndW5kZWZpbmVkJykge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICB2YWxpZGF0ZUNMUChwZXJtcywgbmV3U2NoZW1hLCB0aGlzLnVzZXJJZFJlZ0V4KTtcbiAgICByZXR1cm4gdGhpcy5fZGJBZGFwdGVyLnNldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUsIHBlcm1zKTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IHRvIHRoZSBuZXcgc2NoZW1hXG4gIC8vIG9iamVjdCBpZiB0aGUgcHJvdmlkZWQgY2xhc3NOYW1lLWZpZWxkTmFtZS10eXBlIHR1cGxlIGlzIHZhbGlkLlxuICAvLyBUaGUgY2xhc3NOYW1lIG11c3QgYWxyZWFkeSBiZSB2YWxpZGF0ZWQuXG4gIC8vIElmICdmcmVlemUnIGlzIHRydWUsIHJlZnVzZSB0byB1cGRhdGUgdGhlIHNjaGVtYSBmb3IgdGhpcyBmaWVsZC5cbiAgZW5mb3JjZUZpZWxkRXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZywgdHlwZTogc3RyaW5nIHwgU2NoZW1hRmllbGQpIHtcbiAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+IDApIHtcbiAgICAgIC8vIHN1YmRvY3VtZW50IGtleSAoeC55KSA9PiBvayBpZiB4IGlzIG9mIHR5cGUgJ29iamVjdCdcbiAgICAgIGZpZWxkTmFtZSA9IGZpZWxkTmFtZS5zcGxpdCgnLicpWzBdO1xuICAgICAgdHlwZSA9ICdPYmplY3QnO1xuICAgIH1cbiAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWQoZmllbGROYW1lKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGBJbnZhbGlkIGZpZWxkIG5hbWU6ICR7ZmllbGROYW1lfS5gKTtcbiAgICB9XG5cbiAgICAvLyBJZiBzb21lb25lIHRyaWVzIHRvIGNyZWF0ZSBhIG5ldyBmaWVsZCB3aXRoIG51bGwvdW5kZWZpbmVkIGFzIHRoZSB2YWx1ZSwgcmV0dXJuO1xuICAgIGlmICghdHlwZSkge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG5cbiAgICBjb25zdCBleHBlY3RlZFR5cGUgPSB0aGlzLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGZpZWxkTmFtZSk7XG4gICAgaWYgKHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJykge1xuICAgICAgdHlwZSA9ICh7IHR5cGUgfTogU2NoZW1hRmllbGQpO1xuICAgIH1cblxuICAgIGlmICh0eXBlLmRlZmF1bHRWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICBsZXQgZGVmYXVsdFZhbHVlVHlwZSA9IGdldFR5cGUodHlwZS5kZWZhdWx0VmFsdWUpO1xuICAgICAgaWYgKHR5cGVvZiBkZWZhdWx0VmFsdWVUeXBlID09PSAnc3RyaW5nJykge1xuICAgICAgICBkZWZhdWx0VmFsdWVUeXBlID0geyB0eXBlOiBkZWZhdWx0VmFsdWVUeXBlIH07XG4gICAgICB9XG4gICAgICBpZiAoIWRiVHlwZU1hdGNoZXNPYmplY3RUeXBlKHR5cGUsIGRlZmF1bHRWYWx1ZVR5cGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICBgc2NoZW1hIG1pc21hdGNoIGZvciAke2NsYXNzTmFtZX0uJHtmaWVsZE5hbWV9IGRlZmF1bHQgdmFsdWU7IGV4cGVjdGVkICR7dHlwZVRvU3RyaW5nKFxuICAgICAgICAgICAgdHlwZVxuICAgICAgICAgICl9IGJ1dCBnb3QgJHt0eXBlVG9TdHJpbmcoZGVmYXVsdFZhbHVlVHlwZSl9YFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cblxuICAgIGlmIChleHBlY3RlZFR5cGUpIHtcbiAgICAgIGlmICghZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUoZXhwZWN0ZWRUeXBlLCB0eXBlKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgYHNjaGVtYSBtaXNtYXRjaCBmb3IgJHtjbGFzc05hbWV9LiR7ZmllbGROYW1lfTsgZXhwZWN0ZWQgJHt0eXBlVG9TdHJpbmcoXG4gICAgICAgICAgICBleHBlY3RlZFR5cGVcbiAgICAgICAgICApfSBidXQgZ290ICR7dHlwZVRvU3RyaW5nKHR5cGUpfWBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuX2RiQWRhcHRlclxuICAgICAgLmFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PSBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSkge1xuICAgICAgICAgIC8vIE1ha2Ugc3VyZSB0aGF0IHdlIHRocm93IGVycm9ycyB3aGVuIGl0IGlzIGFwcHJvcHJpYXRlIHRvIGRvIHNvLlxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIC8vIFRoZSB1cGRhdGUgZmFpbGVkLiBUaGlzIGNhbiBiZSBva2F5IC0gaXQgbWlnaHQgaGF2ZSBiZWVuIGEgcmFjZVxuICAgICAgICAvLyBjb25kaXRpb24gd2hlcmUgYW5vdGhlciBjbGllbnQgdXBkYXRlZCB0aGUgc2NoZW1hIGluIHRoZSBzYW1lXG4gICAgICAgIC8vIHdheSB0aGF0IHdlIHdhbnRlZCB0by4gU28sIGp1c3QgcmVsb2FkIHRoZSBzY2hlbWFcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgZmllbGROYW1lLFxuICAgICAgICAgIHR5cGUsXG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgfVxuXG4gIGVuc3VyZUZpZWxkcyhmaWVsZHM6IGFueSkge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZmllbGRzLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICBjb25zdCB7IGNsYXNzTmFtZSwgZmllbGROYW1lIH0gPSBmaWVsZHNbaV07XG4gICAgICBsZXQgeyB0eXBlIH0gPSBmaWVsZHNbaV07XG4gICAgICBjb25zdCBleHBlY3RlZFR5cGUgPSB0aGlzLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGZpZWxkTmFtZSk7XG4gICAgICBpZiAodHlwZW9mIHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHR5cGUgPSB7IHR5cGU6IHR5cGUgfTtcbiAgICAgIH1cbiAgICAgIGlmICghZXhwZWN0ZWRUeXBlIHx8ICFkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZShleHBlY3RlZFR5cGUsIHR5cGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBDb3VsZCBub3QgYWRkIGZpZWxkICR7ZmllbGROYW1lfWApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIG1haW50YWluIGNvbXBhdGliaWxpdHlcbiAgZGVsZXRlRmllbGQoZmllbGROYW1lOiBzdHJpbmcsIGNsYXNzTmFtZTogc3RyaW5nLCBkYXRhYmFzZTogRGF0YWJhc2VDb250cm9sbGVyKSB7XG4gICAgcmV0dXJuIHRoaXMuZGVsZXRlRmllbGRzKFtmaWVsZE5hbWVdLCBjbGFzc05hbWUsIGRhdGFiYXNlKTtcbiAgfVxuXG4gIC8vIERlbGV0ZSBmaWVsZHMsIGFuZCByZW1vdmUgdGhhdCBkYXRhIGZyb20gYWxsIG9iamVjdHMuIFRoaXMgaXMgaW50ZW5kZWRcbiAgLy8gdG8gcmVtb3ZlIHVudXNlZCBmaWVsZHMsIGlmIG90aGVyIHdyaXRlcnMgYXJlIHdyaXRpbmcgb2JqZWN0cyB0aGF0IGluY2x1ZGVcbiAgLy8gdGhpcyBmaWVsZCwgdGhlIGZpZWxkIG1heSByZWFwcGVhci4gUmV0dXJucyBhIFByb21pc2UgdGhhdCByZXNvbHZlcyB3aXRoXG4gIC8vIG5vIG9iamVjdCBvbiBzdWNjZXNzLCBvciByZWplY3RzIHdpdGggeyBjb2RlLCBlcnJvciB9IG9uIGZhaWx1cmUuXG4gIC8vIFBhc3NpbmcgdGhlIGRhdGFiYXNlIGFuZCBwcmVmaXggaXMgbmVjZXNzYXJ5IGluIG9yZGVyIHRvIGRyb3AgcmVsYXRpb24gY29sbGVjdGlvbnNcbiAgLy8gYW5kIHJlbW92ZSBmaWVsZHMgZnJvbSBvYmplY3RzLiBJZGVhbGx5IHRoZSBkYXRhYmFzZSB3b3VsZCBiZWxvbmcgdG9cbiAgLy8gYSBkYXRhYmFzZSBhZGFwdGVyIGFuZCB0aGlzIGZ1bmN0aW9uIHdvdWxkIGNsb3NlIG92ZXIgaXQgb3IgYWNjZXNzIGl0IHZpYSBtZW1iZXIuXG4gIGRlbGV0ZUZpZWxkcyhmaWVsZE5hbWVzOiBBcnJheTxzdHJpbmc+LCBjbGFzc05hbWU6IHN0cmluZywgZGF0YWJhc2U6IERhdGFiYXNlQ29udHJvbGxlcikge1xuICAgIGlmICghY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLCBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZShjbGFzc05hbWUpKTtcbiAgICB9XG5cbiAgICBmaWVsZE5hbWVzLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmICghZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBgaW52YWxpZCBmaWVsZCBuYW1lOiAke2ZpZWxkTmFtZX1gKTtcbiAgICAgIH1cbiAgICAgIC8vRG9uJ3QgYWxsb3cgZGVsZXRpbmcgdGhlIGRlZmF1bHQgZmllbGRzLlxuICAgICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkRm9yQ2xhc3MoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigxMzYsIGBmaWVsZCAke2ZpZWxkTmFtZX0gY2Fubm90IGJlIGNoYW5nZWRgKTtcbiAgICAgIH1cbiAgICB9KTtcblxuICAgIHJldHVybiB0aGlzLmdldE9uZVNjaGVtYShjbGFzc05hbWUsIGZhbHNlLCB7IGNsZWFyQ2FjaGU6IHRydWUgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLFxuICAgICAgICAgICAgYENsYXNzICR7Y2xhc3NOYW1lfSBkb2VzIG5vdCBleGlzdC5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfSlcbiAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgIGZpZWxkTmFtZXMuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgIGlmICghc2NoZW1hLmZpZWxkc1tmaWVsZE5hbWVdKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMjU1LCBgRmllbGQgJHtmaWVsZE5hbWV9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgZGVsZXRlLmApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgY29uc3Qgc2NoZW1hRmllbGRzID0geyAuLi5zY2hlbWEuZmllbGRzIH07XG4gICAgICAgIHJldHVybiBkYXRhYmFzZS5hZGFwdGVyLmRlbGV0ZUZpZWxkcyhjbGFzc05hbWUsIHNjaGVtYSwgZmllbGROYW1lcykudGhlbigoKSA9PiB7XG4gICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKFxuICAgICAgICAgICAgZmllbGROYW1lcy5tYXAoZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgZmllbGQgPSBzY2hlbWFGaWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICAgICAgaWYgKGZpZWxkICYmIGZpZWxkLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgICAgICAgICAvL0ZvciByZWxhdGlvbnMsIGRyb3AgdGhlIF9Kb2luIHRhYmxlXG4gICAgICAgICAgICAgICAgcmV0dXJuIGRhdGFiYXNlLmFkYXB0ZXIuZGVsZXRlQ2xhc3MoYF9Kb2luOiR7ZmllbGROYW1lfToke2NsYXNzTmFtZX1gKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICk7XG4gICAgICAgIH0pO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHRoaXMuX2NhY2hlLmNsZWFyKCkpO1xuICB9XG5cbiAgLy8gVmFsaWRhdGVzIGFuIG9iamVjdCBwcm92aWRlZCBpbiBSRVNUIGZvcm1hdC5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB0byB0aGUgbmV3IHNjaGVtYSBpZiB0aGlzIG9iamVjdCBpc1xuICAvLyB2YWxpZC5cbiAgYXN5bmMgdmFsaWRhdGVPYmplY3QoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdDogYW55LCBxdWVyeTogYW55KSB7XG4gICAgbGV0IGdlb2NvdW50ID0gMDtcbiAgICBjb25zdCBzY2hlbWEgPSBhd2FpdCB0aGlzLmVuZm9yY2VDbGFzc0V4aXN0cyhjbGFzc05hbWUpO1xuICAgIGNvbnN0IHByb21pc2VzID0gW107XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBvYmplY3QpIHtcbiAgICAgIGlmIChvYmplY3RbZmllbGROYW1lXSA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgZXhwZWN0ZWQgPSBnZXRUeXBlKG9iamVjdFtmaWVsZE5hbWVdKTtcbiAgICAgIGlmIChleHBlY3RlZCA9PT0gJ0dlb1BvaW50Jykge1xuICAgICAgICBnZW9jb3VudCsrO1xuICAgICAgfVxuICAgICAgaWYgKGdlb2NvdW50ID4gMSkge1xuICAgICAgICAvLyBNYWtlIHN1cmUgYWxsIGZpZWxkIHZhbGlkYXRpb24gb3BlcmF0aW9ucyBydW4gYmVmb3JlIHdlIHJldHVybi5cbiAgICAgICAgLy8gSWYgbm90IC0gd2UgYXJlIGNvbnRpbnVpbmcgdG8gcnVuIGxvZ2ljLCBidXQgYWxyZWFkeSBwcm92aWRlZCByZXNwb25zZSBmcm9tIHRoZSBzZXJ2ZXIuXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICAgICd0aGVyZSBjYW4gb25seSBiZSBvbmUgZ2VvcG9pbnQgZmllbGQgaW4gYSBjbGFzcydcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICBpZiAoIWV4cGVjdGVkKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKGZpZWxkTmFtZSA9PT0gJ0FDTCcpIHtcbiAgICAgICAgLy8gRXZlcnkgb2JqZWN0IGhhcyBBQ0wgaW1wbGljaXRseS5cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBwcm9taXNlcy5wdXNoKHNjaGVtYS5lbmZvcmNlRmllbGRFeGlzdHMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIGV4cGVjdGVkKSk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgY29uc3QgZW5mb3JjZUZpZWxkcyA9IHJlc3VsdHMuZmlsdGVyKHJlc3VsdCA9PiAhIXJlc3VsdCk7XG5cbiAgICBpZiAoZW5mb3JjZUZpZWxkcy5sZW5ndGggIT09IDApIHtcbiAgICAgIGF3YWl0IHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgfVxuICAgIHRoaXMuZW5zdXJlRmllbGRzKGVuZm9yY2VGaWVsZHMpO1xuXG4gICAgY29uc3QgcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShzY2hlbWEpO1xuICAgIHJldHVybiB0aGVuVmFsaWRhdGVSZXF1aXJlZENvbHVtbnMocHJvbWlzZSwgY2xhc3NOYW1lLCBvYmplY3QsIHF1ZXJ5KTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlcyB0aGF0IGFsbCB0aGUgcHJvcGVydGllcyBhcmUgc2V0IGZvciB0aGUgb2JqZWN0XG4gIHZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zKGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3Q6IGFueSwgcXVlcnk6IGFueSkge1xuICAgIGNvbnN0IGNvbHVtbnMgPSByZXF1aXJlZENvbHVtbnNbY2xhc3NOYW1lXTtcbiAgICBpZiAoIWNvbHVtbnMgfHwgY29sdW1ucy5sZW5ndGggPT0gMCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzKTtcbiAgICB9XG5cbiAgICBjb25zdCBtaXNzaW5nQ29sdW1ucyA9IGNvbHVtbnMuZmlsdGVyKGZ1bmN0aW9uIChjb2x1bW4pIHtcbiAgICAgIGlmIChxdWVyeSAmJiBxdWVyeS5vYmplY3RJZCkge1xuICAgICAgICBpZiAob2JqZWN0W2NvbHVtbl0gJiYgdHlwZW9mIG9iamVjdFtjb2x1bW5dID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgIC8vIFRyeWluZyB0byBkZWxldGUgYSByZXF1aXJlZCBjb2x1bW5cbiAgICAgICAgICByZXR1cm4gb2JqZWN0W2NvbHVtbl0uX19vcCA9PSAnRGVsZXRlJztcbiAgICAgICAgfVxuICAgICAgICAvLyBOb3QgdHJ5aW5nIHRvIGRvIGFueXRoaW5nIHRoZXJlXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiAhb2JqZWN0W2NvbHVtbl07XG4gICAgfSk7XG5cbiAgICBpZiAobWlzc2luZ0NvbHVtbnMubGVuZ3RoID4gMCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLCBtaXNzaW5nQ29sdW1uc1swXSArICcgaXMgcmVxdWlyZWQuJyk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcyk7XG4gIH1cblxuICB0ZXN0UGVybWlzc2lvbnNGb3JDbGFzc05hbWUoY2xhc3NOYW1lOiBzdHJpbmcsIGFjbEdyb3VwOiBzdHJpbmdbXSwgb3BlcmF0aW9uOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gU2NoZW1hQ29udHJvbGxlci50ZXN0UGVybWlzc2lvbnMoXG4gICAgICB0aGlzLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpLFxuICAgICAgYWNsR3JvdXAsXG4gICAgICBvcGVyYXRpb25cbiAgICApO1xuICB9XG5cbiAgLy8gVGVzdHMgdGhhdCB0aGUgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbiBsZXQgcGFzcyB0aGUgb3BlcmF0aW9uIGZvciBhIGdpdmVuIGFjbEdyb3VwXG4gIHN0YXRpYyB0ZXN0UGVybWlzc2lvbnMoY2xhc3NQZXJtaXNzaW9uczogP2FueSwgYWNsR3JvdXA6IHN0cmluZ1tdLCBvcGVyYXRpb246IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIGlmICghY2xhc3NQZXJtaXNzaW9ucyB8fCAhY2xhc3NQZXJtaXNzaW9uc1tvcGVyYXRpb25dKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3QgcGVybXMgPSBjbGFzc1Blcm1pc3Npb25zW29wZXJhdGlvbl07XG4gICAgaWYgKHBlcm1zWycqJ10pIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICAvLyBDaGVjayBwZXJtaXNzaW9ucyBhZ2FpbnN0IHRoZSBhY2xHcm91cCBwcm92aWRlZCAoYXJyYXkgb2YgdXNlcklkL3JvbGVzKVxuICAgIGlmIChcbiAgICAgIGFjbEdyb3VwLnNvbWUoYWNsID0+IHtcbiAgICAgICAgcmV0dXJuIHBlcm1zW2FjbF0gPT09IHRydWU7XG4gICAgICB9KVxuICAgICkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlcyBhbiBvcGVyYXRpb24gcGFzc2VzIGNsYXNzLWxldmVsLXBlcm1pc3Npb25zIHNldCBpbiB0aGUgc2NoZW1hXG4gIHN0YXRpYyB2YWxpZGF0ZVBlcm1pc3Npb24oXG4gICAgY2xhc3NQZXJtaXNzaW9uczogP2FueSxcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBhY2xHcm91cDogc3RyaW5nW10sXG4gICAgb3BlcmF0aW9uOiBzdHJpbmcsXG4gICAgYWN0aW9uPzogc3RyaW5nXG4gICkge1xuICAgIGlmIChTY2hlbWFDb250cm9sbGVyLnRlc3RQZXJtaXNzaW9ucyhjbGFzc1Blcm1pc3Npb25zLCBhY2xHcm91cCwgb3BlcmF0aW9uKSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cblxuICAgIGlmICghY2xhc3NQZXJtaXNzaW9ucyB8fCAhY2xhc3NQZXJtaXNzaW9uc1tvcGVyYXRpb25dKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3QgcGVybXMgPSBjbGFzc1Blcm1pc3Npb25zW29wZXJhdGlvbl07XG4gICAgLy8gSWYgb25seSBmb3IgYXV0aGVudGljYXRlZCB1c2Vyc1xuICAgIC8vIG1ha2Ugc3VyZSB3ZSBoYXZlIGFuIGFjbEdyb3VwXG4gICAgaWYgKHBlcm1zWydyZXF1aXJlc0F1dGhlbnRpY2F0aW9uJ10pIHtcbiAgICAgIC8vIElmIGFjbEdyb3VwIGhhcyAqIChwdWJsaWMpXG4gICAgICBpZiAoIWFjbEdyb3VwIHx8IGFjbEdyb3VwLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICdQZXJtaXNzaW9uIGRlbmllZCwgdXNlciBuZWVkcyB0byBiZSBhdXRoZW50aWNhdGVkLidcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoYWNsR3JvdXAuaW5kZXhPZignKicpID4gLTEgJiYgYWNsR3JvdXAubGVuZ3RoID09IDEpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgJ1Blcm1pc3Npb24gZGVuaWVkLCB1c2VyIG5lZWRzIHRvIGJlIGF1dGhlbnRpY2F0ZWQuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gcmVxdWlyZXNBdXRoZW50aWNhdGlvbiBwYXNzZWQsIGp1c3QgbW92ZSBmb3J3YXJkXG4gICAgICAvLyBwcm9iYWJseSB3b3VsZCBiZSB3aXNlIGF0IHNvbWUgcG9pbnQgdG8gcmVuYW1lIHRvICdhdXRoZW50aWNhdGVkVXNlcidcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG5cbiAgICAvLyBObyBtYXRjaGluZyBDTFAsIGxldCdzIGNoZWNrIHRoZSBQb2ludGVyIHBlcm1pc3Npb25zXG4gICAgLy8gQW5kIGhhbmRsZSB0aG9zZSBsYXRlclxuICAgIGNvbnN0IHBlcm1pc3Npb25GaWVsZCA9XG4gICAgICBbJ2dldCcsICdmaW5kJywgJ2NvdW50J10uaW5kZXhPZihvcGVyYXRpb24pID4gLTEgPyAncmVhZFVzZXJGaWVsZHMnIDogJ3dyaXRlVXNlckZpZWxkcyc7XG5cbiAgICAvLyBSZWplY3QgY3JlYXRlIHdoZW4gd3JpdGUgbG9ja2Rvd25cbiAgICBpZiAocGVybWlzc2lvbkZpZWxkID09ICd3cml0ZVVzZXJGaWVsZHMnICYmIG9wZXJhdGlvbiA9PSAnY3JlYXRlJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICBgUGVybWlzc2lvbiBkZW5pZWQgZm9yIGFjdGlvbiAke29wZXJhdGlvbn0gb24gY2xhc3MgJHtjbGFzc05hbWV9LmBcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gUHJvY2VzcyB0aGUgcmVhZFVzZXJGaWVsZHMgbGF0ZXJcbiAgICBpZiAoXG4gICAgICBBcnJheS5pc0FycmF5KGNsYXNzUGVybWlzc2lvbnNbcGVybWlzc2lvbkZpZWxkXSkgJiZcbiAgICAgIGNsYXNzUGVybWlzc2lvbnNbcGVybWlzc2lvbkZpZWxkXS5sZW5ndGggPiAwXG4gICAgKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuXG4gICAgY29uc3QgcG9pbnRlckZpZWxkcyA9IGNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXS5wb2ludGVyRmllbGRzO1xuICAgIGlmIChBcnJheS5pc0FycmF5KHBvaW50ZXJGaWVsZHMpICYmIHBvaW50ZXJGaWVsZHMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gYW55IG9wIGV4Y2VwdCAnYWRkRmllbGQgYXMgcGFydCBvZiBjcmVhdGUnIGlzIG9rLlxuICAgICAgaWYgKG9wZXJhdGlvbiAhPT0gJ2FkZEZpZWxkJyB8fCBhY3Rpb24gPT09ICd1cGRhdGUnKSB7XG4gICAgICAgIC8vIFdlIGNhbiBhbGxvdyBhZGRpbmcgZmllbGQgb24gdXBkYXRlIGZsb3cgb25seS5cbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICBgUGVybWlzc2lvbiBkZW5pZWQgZm9yIGFjdGlvbiAke29wZXJhdGlvbn0gb24gY2xhc3MgJHtjbGFzc05hbWV9LmBcbiAgICApO1xuICB9XG5cbiAgLy8gVmFsaWRhdGVzIGFuIG9wZXJhdGlvbiBwYXNzZXMgY2xhc3MtbGV2ZWwtcGVybWlzc2lvbnMgc2V0IGluIHRoZSBzY2hlbWFcbiAgdmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZTogc3RyaW5nLCBhY2xHcm91cDogc3RyaW5nW10sIG9wZXJhdGlvbjogc3RyaW5nLCBhY3Rpb24/OiBzdHJpbmcpIHtcbiAgICByZXR1cm4gU2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oXG4gICAgICB0aGlzLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgYWNsR3JvdXAsXG4gICAgICBvcGVyYXRpb24sXG4gICAgICBhY3Rpb25cbiAgICApO1xuICB9XG5cbiAgZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZTogc3RyaW5nKTogYW55IHtcbiAgICByZXR1cm4gdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0gJiYgdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0uY2xhc3NMZXZlbFBlcm1pc3Npb25zO1xuICB9XG5cbiAgLy8gUmV0dXJucyB0aGUgZXhwZWN0ZWQgdHlwZSBmb3IgYSBjbGFzc05hbWUra2V5IGNvbWJpbmF0aW9uXG4gIC8vIG9yIHVuZGVmaW5lZCBpZiB0aGUgc2NoZW1hIGlzIG5vdCBzZXRcbiAgZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZyk6ID8oU2NoZW1hRmllbGQgfCBzdHJpbmcpIHtcbiAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgcmV0dXJuIGV4cGVjdGVkVHlwZSA9PT0gJ21hcCcgPyAnT2JqZWN0JyA6IGV4cGVjdGVkVHlwZTtcbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuXG4gIC8vIENoZWNrcyBpZiBhIGdpdmVuIGNsYXNzIGlzIGluIHRoZSBzY2hlbWEuXG4gIGhhc0NsYXNzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgaWYgKHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5yZWxvYWREYXRhKCkudGhlbigoKSA9PiAhIXRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKTtcbiAgfVxufVxuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBuZXcgU2NoZW1hLlxuY29uc3QgbG9hZCA9IChcbiAgZGJBZGFwdGVyOiBTdG9yYWdlQWRhcHRlcixcbiAgc2NoZW1hQ2FjaGU6IGFueSxcbiAgb3B0aW9uczogYW55XG4pOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXI+ID0+IHtcbiAgY29uc3Qgc2NoZW1hID0gbmV3IFNjaGVtYUNvbnRyb2xsZXIoZGJBZGFwdGVyLCBzY2hlbWFDYWNoZSk7XG4gIHJldHVybiBzY2hlbWEucmVsb2FkRGF0YShvcHRpb25zKS50aGVuKCgpID0+IHNjaGVtYSk7XG59O1xuXG4vLyBCdWlsZHMgYSBuZXcgc2NoZW1hIChpbiBzY2hlbWEgQVBJIHJlc3BvbnNlIGZvcm1hdCkgb3V0IG9mIGFuXG4vLyBleGlzdGluZyBtb25nbyBzY2hlbWEgKyBhIHNjaGVtYXMgQVBJIHB1dCByZXF1ZXN0LiBUaGlzIHJlc3BvbnNlXG4vLyBkb2VzIG5vdCBpbmNsdWRlIHRoZSBkZWZhdWx0IGZpZWxkcywgYXMgaXQgaXMgaW50ZW5kZWQgdG8gYmUgcGFzc2VkXG4vLyB0byBtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWUuIE5vIHZhbGlkYXRpb24gaXMgZG9uZSBoZXJlLCBpdFxuLy8gaXMgZG9uZSBpbiBtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWUuXG5mdW5jdGlvbiBidWlsZE1lcmdlZFNjaGVtYU9iamVjdChleGlzdGluZ0ZpZWxkczogU2NoZW1hRmllbGRzLCBwdXRSZXF1ZXN0OiBhbnkpOiBTY2hlbWFGaWVsZHMge1xuICBjb25zdCBuZXdTY2hlbWEgPSB7fTtcbiAgLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG4gIGNvbnN0IHN5c1NjaGVtYUZpZWxkID1cbiAgICBPYmplY3Qua2V5cyhkZWZhdWx0Q29sdW1ucykuaW5kZXhPZihleGlzdGluZ0ZpZWxkcy5faWQpID09PSAtMVxuICAgICAgPyBbXVxuICAgICAgOiBPYmplY3Qua2V5cyhkZWZhdWx0Q29sdW1uc1tleGlzdGluZ0ZpZWxkcy5faWRdKTtcbiAgZm9yIChjb25zdCBvbGRGaWVsZCBpbiBleGlzdGluZ0ZpZWxkcykge1xuICAgIGlmIChcbiAgICAgIG9sZEZpZWxkICE9PSAnX2lkJyAmJlxuICAgICAgb2xkRmllbGQgIT09ICdBQ0wnICYmXG4gICAgICBvbGRGaWVsZCAhPT0gJ3VwZGF0ZWRBdCcgJiZcbiAgICAgIG9sZEZpZWxkICE9PSAnY3JlYXRlZEF0JyAmJlxuICAgICAgb2xkRmllbGQgIT09ICdvYmplY3RJZCdcbiAgICApIHtcbiAgICAgIGlmIChzeXNTY2hlbWFGaWVsZC5sZW5ndGggPiAwICYmIHN5c1NjaGVtYUZpZWxkLmluZGV4T2Yob2xkRmllbGQpICE9PSAtMSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGZpZWxkSXNEZWxldGVkID0gcHV0UmVxdWVzdFtvbGRGaWVsZF0gJiYgcHV0UmVxdWVzdFtvbGRGaWVsZF0uX19vcCA9PT0gJ0RlbGV0ZSc7XG4gICAgICBpZiAoIWZpZWxkSXNEZWxldGVkKSB7XG4gICAgICAgIG5ld1NjaGVtYVtvbGRGaWVsZF0gPSBleGlzdGluZ0ZpZWxkc1tvbGRGaWVsZF07XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGZvciAoY29uc3QgbmV3RmllbGQgaW4gcHV0UmVxdWVzdCkge1xuICAgIGlmIChuZXdGaWVsZCAhPT0gJ29iamVjdElkJyAmJiBwdXRSZXF1ZXN0W25ld0ZpZWxkXS5fX29wICE9PSAnRGVsZXRlJykge1xuICAgICAgaWYgKHN5c1NjaGVtYUZpZWxkLmxlbmd0aCA+IDAgJiYgc3lzU2NoZW1hRmllbGQuaW5kZXhPZihuZXdGaWVsZCkgIT09IC0xKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgbmV3U2NoZW1hW25ld0ZpZWxkXSA9IHB1dFJlcXVlc3RbbmV3RmllbGRdO1xuICAgIH1cbiAgfVxuICByZXR1cm4gbmV3U2NoZW1hO1xufVxuXG4vLyBHaXZlbiBhIHNjaGVtYSBwcm9taXNlLCBjb25zdHJ1Y3QgYW5vdGhlciBzY2hlbWEgcHJvbWlzZSB0aGF0XG4vLyB2YWxpZGF0ZXMgdGhpcyBmaWVsZCBvbmNlIHRoZSBzY2hlbWEgbG9hZHMuXG5mdW5jdGlvbiB0aGVuVmFsaWRhdGVSZXF1aXJlZENvbHVtbnMoc2NoZW1hUHJvbWlzZSwgY2xhc3NOYW1lLCBvYmplY3QsIHF1ZXJ5KSB7XG4gIHJldHVybiBzY2hlbWFQcm9taXNlLnRoZW4oc2NoZW1hID0+IHtcbiAgICByZXR1cm4gc2NoZW1hLnZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zKGNsYXNzTmFtZSwgb2JqZWN0LCBxdWVyeSk7XG4gIH0pO1xufVxuXG4vLyBHZXRzIHRoZSB0eXBlIGZyb20gYSBSRVNUIEFQSSBmb3JtYXR0ZWQgb2JqZWN0LCB3aGVyZSAndHlwZScgaXNcbi8vIGV4dGVuZGVkIHBhc3QgamF2YXNjcmlwdCB0eXBlcyB0byBpbmNsdWRlIHRoZSByZXN0IG9mIHRoZSBQYXJzZVxuLy8gdHlwZSBzeXN0ZW0uXG4vLyBUaGUgb3V0cHV0IHNob3VsZCBiZSBhIHZhbGlkIHNjaGVtYSB2YWx1ZS5cbi8vIFRPRE86IGVuc3VyZSB0aGF0IHRoaXMgaXMgY29tcGF0aWJsZSB3aXRoIHRoZSBmb3JtYXQgdXNlZCBpbiBPcGVuIERCXG5mdW5jdGlvbiBnZXRUeXBlKG9iajogYW55KTogPyhTY2hlbWFGaWVsZCB8IHN0cmluZykge1xuICBjb25zdCB0eXBlID0gdHlwZW9mIG9iajtcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4gJ0Jvb2xlYW4nO1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICByZXR1cm4gJ1N0cmluZyc7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiAnTnVtYmVyJztcbiAgICBjYXNlICdtYXAnOlxuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICBpZiAoIW9iaikge1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGdldE9iamVjdFR5cGUob2JqKTtcbiAgICBjYXNlICdmdW5jdGlvbic6XG4gICAgY2FzZSAnc3ltYm9sJzpcbiAgICBjYXNlICd1bmRlZmluZWQnOlxuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyAnYmFkIG9iajogJyArIG9iajtcbiAgfVxufVxuXG4vLyBUaGlzIGdldHMgdGhlIHR5cGUgZm9yIG5vbi1KU09OIHR5cGVzIGxpa2UgcG9pbnRlcnMgYW5kIGZpbGVzLCBidXRcbi8vIGFsc28gZ2V0cyB0aGUgYXBwcm9wcmlhdGUgdHlwZSBmb3IgJCBvcGVyYXRvcnMuXG4vLyBSZXR1cm5zIG51bGwgaWYgdGhlIHR5cGUgaXMgdW5rbm93bi5cbmZ1bmN0aW9uIGdldE9iamVjdFR5cGUob2JqKTogPyhTY2hlbWFGaWVsZCB8IHN0cmluZykge1xuICBpZiAob2JqIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICByZXR1cm4gJ0FycmF5JztcbiAgfVxuICBpZiAob2JqLl9fdHlwZSkge1xuICAgIHN3aXRjaCAob2JqLl9fdHlwZSkge1xuICAgICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICAgIGlmIChvYmouY2xhc3NOYW1lKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHR5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgIHRhcmdldENsYXNzOiBvYmouY2xhc3NOYW1lLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdSZWxhdGlvbic6XG4gICAgICAgIGlmIChvYmouY2xhc3NOYW1lKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHR5cGU6ICdSZWxhdGlvbicsXG4gICAgICAgICAgICB0YXJnZXRDbGFzczogb2JqLmNsYXNzTmFtZSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnRmlsZSc6XG4gICAgICAgIGlmIChvYmoubmFtZSkge1xuICAgICAgICAgIHJldHVybiAnRmlsZSc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdEYXRlJzpcbiAgICAgICAgaWYgKG9iai5pc28pIHtcbiAgICAgICAgICByZXR1cm4gJ0RhdGUnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgICBpZiAob2JqLmxhdGl0dWRlICE9IG51bGwgJiYgb2JqLmxvbmdpdHVkZSAhPSBudWxsKSB7XG4gICAgICAgICAgcmV0dXJuICdHZW9Qb2ludCc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdCeXRlcyc6XG4gICAgICAgIGlmIChvYmouYmFzZTY0KSB7XG4gICAgICAgICAgcmV0dXJuICdCeXRlcyc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgICAgaWYgKG9iai5jb29yZGluYXRlcykge1xuICAgICAgICAgIHJldHVybiAnUG9seWdvbic7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSwgJ1RoaXMgaXMgbm90IGEgdmFsaWQgJyArIG9iai5fX3R5cGUpO1xuICB9XG4gIGlmIChvYmpbJyRuZSddKSB7XG4gICAgcmV0dXJuIGdldE9iamVjdFR5cGUob2JqWyckbmUnXSk7XG4gIH1cbiAgaWYgKG9iai5fX29wKSB7XG4gICAgc3dpdGNoIChvYmouX19vcCkge1xuICAgICAgY2FzZSAnSW5jcmVtZW50JzpcbiAgICAgICAgcmV0dXJuICdOdW1iZXInO1xuICAgICAgY2FzZSAnRGVsZXRlJzpcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICBjYXNlICdBZGQnOlxuICAgICAgY2FzZSAnQWRkVW5pcXVlJzpcbiAgICAgIGNhc2UgJ1JlbW92ZSc6XG4gICAgICAgIHJldHVybiAnQXJyYXknO1xuICAgICAgY2FzZSAnQWRkUmVsYXRpb24nOlxuICAgICAgY2FzZSAnUmVtb3ZlUmVsYXRpb24nOlxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHR5cGU6ICdSZWxhdGlvbicsXG4gICAgICAgICAgdGFyZ2V0Q2xhc3M6IG9iai5vYmplY3RzWzBdLmNsYXNzTmFtZSxcbiAgICAgICAgfTtcbiAgICAgIGNhc2UgJ0JhdGNoJzpcbiAgICAgICAgcmV0dXJuIGdldE9iamVjdFR5cGUob2JqLm9wc1swXSk7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyAndW5leHBlY3RlZCBvcDogJyArIG9iai5fX29wO1xuICAgIH1cbiAgfVxuICByZXR1cm4gJ09iamVjdCc7XG59XG5cbmV4cG9ydCB7XG4gIGxvYWQsXG4gIGNsYXNzTmFtZUlzVmFsaWQsXG4gIGZpZWxkTmFtZUlzVmFsaWQsXG4gIGludmFsaWRDbGFzc05hbWVNZXNzYWdlLFxuICBidWlsZE1lcmdlZFNjaGVtYU9iamVjdCxcbiAgc3lzdGVtQ2xhc3NlcyxcbiAgZGVmYXVsdENvbHVtbnMsXG4gIGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEsXG4gIFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMsXG4gIFNjaGVtYUNvbnRyb2xsZXIsXG59O1xuIl19