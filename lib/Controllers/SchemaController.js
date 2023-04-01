"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.VolatileClassesSchemas = exports.SchemaController = void 0;
exports.buildMergedSchemaObject = buildMergedSchemaObject;
exports.classNameIsValid = classNameIsValid;
exports.defaultColumns = exports.default = exports.convertSchemaToAdapterSchema = void 0;
exports.fieldNameIsValid = fieldNameIsValid;
exports.invalidClassNameMessage = invalidClassNameMessage;
exports.systemClasses = exports.requiredColumns = exports.load = void 0;
var _StorageAdapter = require("../Adapters/Storage/StorageAdapter");
var _SchemaCache = _interopRequireDefault(require("../Adapters/Cache/SchemaCache"));
var _DatabaseController = _interopRequireDefault(require("./DatabaseController"));
var _Config = _interopRequireDefault(require("../Config"));
var _deepcopy = _interopRequireDefault(require("deepcopy"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
function _extends() { _extends = Object.assign ? Object.assign.bind() : function (target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i]; for (var key in source) { if (Object.prototype.hasOwnProperty.call(source, key)) { target[key] = source[key]; } } } return target; }; return _extends.apply(this, arguments); }
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

// fields required for read or write operations on their respective classes.
exports.defaultColumns = defaultColumns;
const requiredColumns = Object.freeze({
  read: {
    _User: ['username']
  },
  write: {
    _Product: ['productIdentifier', 'icon', 'order', 'title', 'subtitle'],
    _Role: ['name', 'ACL']
  }
});
exports.requiredColumns = requiredColumns;
const invalidColumns = ['length'];
const systemClasses = Object.freeze(['_User', '_Installation', '_Role', '_Session', '_Product', '_PushStatus', '_JobStatus', '_JobSchedule', '_Audience', '_Idempotency']);
exports.systemClasses = systemClasses;
const volatileClasses = Object.freeze(['_JobStatus', '_PushStatus', '_Hooks', '_GlobalConfig', '_GraphQLConfig', '_JobSchedule', '_Audience', '_Idempotency']);

// Anything that start with role
const roleRegex = /^role:.*/;
// Anything that starts with userField (allowed for protected fields only)
const protectedFieldsPointerRegex = /^userField:.*/;
// * permission
const publicRegex = /^\*$/;
const authenticatedRegex = /^authenticated$/;
const requiresAuthenticationRegex = /^requiresAuthentication$/;
const clpPointerRegex = /^pointerFields$/;

// regex for validating entities in protectedFields object
const protectedFieldsRegex = Object.freeze([protectedFieldsPointerRegex, publicRegex, authenticatedRegex, roleRegex]);

// clp regex
const clpFieldsRegex = Object.freeze([clpPointerRegex, publicRegex, requiresAuthenticationRegex, roleRegex]);
function validatePermissionKey(key, userIdRegExp) {
  let matchesSome = false;
  for (const regEx of clpFieldsRegex) {
    if (key.match(regEx) !== null) {
      matchesSome = true;
      break;
    }
  }

  // userId depends on startup options so it's dynamic
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
  }

  // userId regex depends on launch options so it's dynamic
  const valid = matchesSome || key.match(userIdRegExp) !== null;
  if (!valid) {
    throw new Parse.Error(Parse.Error.INVALID_JSON, `'${key}' is not a valid key for class level permissions`);
  }
}
const CLPValidKeys = Object.freeze(['find', 'count', 'get', 'create', 'update', 'delete', 'addField', 'readUserFields', 'writeUserFields', 'protectedFields']);

// validation before setting class-level permissions on collection
function validateCLP(perms, fields, userIdRegExp) {
  if (!perms) {
    return;
  }
  for (const operationKey in perms) {
    if (CLPValidKeys.indexOf(operationKey) == -1) {
      throw new Parse.Error(Parse.Error.INVALID_JSON, `${operationKey} is not a valid operation for class level permissions`);
    }
    const operation = perms[operationKey];
    // proceed with next operationKey

    // throws when root fields are of wrong type
    validateCLPjson(operation, operationKey);
    if (operationKey === 'readUserFields' || operationKey === 'writeUserFields') {
      // validate grouped pointer permissions
      // must be an array with field names
      for (const fieldName of operation) {
        validatePointerPermission(fieldName, fields, operationKey);
      }
      // readUserFields and writerUserFields do not have nesdted fields
      // proceed with next operationKey
      continue;
    }

    // validate protected fields
    if (operationKey === 'protectedFields') {
      for (const entity in operation) {
        // throws on unexpected key
        validateProtectedFieldsKey(entity, userIdRegExp);
        const protectedFields = operation[entity];
        if (!Array.isArray(protectedFields)) {
          throw new Parse.Error(Parse.Error.INVALID_JSON, `'${protectedFields}' is not a valid value for protectedFields[${entity}] - expected an array.`);
        }

        // if the field is in form of array
        for (const field of protectedFields) {
          // do not alloow to protect default fields
          if (defaultColumns._Default[field]) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `Default field '${field}' can not be protected`);
          }
          // field should exist on collection
          if (!Object.prototype.hasOwnProperty.call(fields, field)) {
            throw new Parse.Error(Parse.Error.INVALID_JSON, `Field '${field}' in protectedFields:${entity} does not exist`);
          }
        }
      }
      // proceed with next operationKey
      continue;
    }

    // validate other fields
    // Entity can be:
    // "*" - Public,
    // "requiresAuthentication" - authenticated users,
    // "objectId" - _User id,
    // "role:rolename",
    // "pointerFields" - array of field names containing pointers to users
    for (const entity in operation) {
      // throws on unexpected key
      validatePermissionKey(entity, userIdRegExp);

      // entity can be either:
      // "pointerFields": string[]
      if (entity === 'pointerFields') {
        const pointerFields = operation[entity];
        if (Array.isArray(pointerFields)) {
          for (const pointerField of pointerFields) {
            validatePointerPermission(pointerField, fields, operation);
          }
        } else {
          throw new Parse.Error(Parse.Error.INVALID_JSON, `'${pointerFields}' is not a valid value for ${operationKey}[${entity}] - expected an array.`);
        }
        // proceed with next entity key
        continue;
      }

      // or [entity]: boolean
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
  return (
    // Be one of _User, _Installation, _Role, _Session OR
    systemClasses.indexOf(className) > -1 ||
    // Be a join table OR
    joinClassRegex.test(className) ||
    // Include only alpha-numeric and underscores, and not start with an underscore or number
    fieldNameIsValid(className, className)
  );
}

// Valid fields must be alpha-numeric, and not start with an underscore or number
// must not be a reserved key
function fieldNameIsValid(fieldName, className) {
  if (className && className !== '_Hooks') {
    if (fieldName === 'className') {
      return false;
    }
  }
  return classAndFieldRegex.test(fieldName) && !invalidColumns.includes(fieldName);
}

// Checks that it's not trying to clobber one of the default fields of the class.
function fieldNameIsValidForClass(fieldName, className) {
  if (!fieldNameIsValid(fieldName, className)) {
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
const validNonRelationOrPointerTypes = ['Number', 'String', 'Boolean', 'Date', 'Object', 'Array', 'GeoPoint', 'File', 'Bytes', 'Polygon'];
// Returns an error suitable for throwing if the type is invalid
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
const convertAdapterSchemaToParseSchema = _ref => {
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
    });

    // Inject the in-memory classes
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
};

// Stores the entire schema of the app in a weird hybrid format somewhere between
// the mongo format and the Parse format. Soon, this will all be Parse format.
class SchemaController {
  constructor(databaseAdapter) {
    this._dbAdapter = databaseAdapter;
    this.schemaData = new SchemaData(_SchemaCache.default.all(), this.protectedFields);
    this.protectedFields = _Config.default.get(Parse.applicationId).protectedFields;
    const customIds = _Config.default.get(Parse.applicationId).allowCustomObjectId;
    const customIdRegEx = /^.{1,}$/u; // 1+ chars
    const autoIdRegEx = /^[a-zA-Z0-9]{1,}$/;
    this.userIdRegEx = customIds ? customIdRegEx : autoIdRegEx;
    this._dbAdapter.watch(() => {
      this.reloadData({
        clearCache: true
      });
    });
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
    const cached = _SchemaCache.default.all();
    if (cached && cached.length) {
      return Promise.resolve(cached);
    }
    return this.setAllClasses();
  }
  setAllClasses() {
    return this._dbAdapter.getAllClasses().then(allSchemas => allSchemas.map(injectDefaultSchema)).then(allSchemas => {
      _SchemaCache.default.put(allSchemas);
      return allSchemas;
    });
  }
  getOneSchema(className, allowVolatileClasses = false, options = {
    clearCache: false
  }) {
    if (options.clearCache) {
      _SchemaCache.default.clear();
    }
    if (allowVolatileClasses && volatileClasses.indexOf(className) > -1) {
      const data = this.schemaData[className];
      return Promise.resolve({
        className,
        fields: data.fields,
        classLevelPermissions: data.classLevelPermissions,
        indexes: data.indexes
      });
    }
    const cached = _SchemaCache.default.get(className);
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
  }

  // Create a new class that includes the three default fields.
  // ACL is an implicit column that does not get an entry in the
  // _SCHEMAS database. Returns a promise that resolves with the
  // created schema, in mongo format.
  // on success, and rejects with an error on fail. Ensure you
  // have authorization (master key, or client class creation
  // enabled) before calling this function.
  async addClassIfNotExists(className, fields = {}, classLevelPermissions, indexes = {}) {
    var validationError = this.validateNewClass(className, fields, classLevelPermissions);
    if (validationError) {
      if (validationError instanceof Parse.Error) {
        return Promise.reject(validationError);
      } else if (validationError.code && validationError.error) {
        return Promise.reject(new Parse.Error(validationError.code, validationError.error));
      }
      return Promise.reject(validationError);
    }
    try {
      const adapterSchema = await this._dbAdapter.createClass(className, convertSchemaToAdapterSchema({
        fields,
        classLevelPermissions,
        indexes,
        className
      }));
      // TODO: Remove by updating schema cache directly
      await this.reloadData({
        clearCache: true
      });
      const parseSchema = convertAdapterSchemaToParseSchema(adapterSchema);
      return parseSchema;
    } catch (error) {
      if (error && error.code === Parse.Error.DUPLICATE_VALUE) {
        throw new Parse.Error(Parse.Error.INVALID_CLASS_NAME, `Class ${className} already exists.`);
      } else {
        throw error;
      }
    }
  }
  updateClass(className, submittedFields, classLevelPermissions, indexes, database) {
    return this.getOneSchema(className).then(schema => {
      const existingFields = schema.fields;
      Object.keys(submittedFields).forEach(name => {
        const field = submittedFields[name];
        if (existingFields[name] && existingFields[name].type !== field.type && field.__op !== 'Delete') {
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
      }

      // Finally we have checked to make sure the request is valid and we can start deleting fields.
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
      }))
      //TODO: Move this logic into the database adapter
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
  }

  // Returns a promise that resolves successfully to the new schema
  // object or fails with a reason.
  enforceClassExists(className) {
    if (this.schemaData[className]) {
      return Promise.resolve(this);
    }
    // We don't have this class. Update the schema
    return (
      // The schema update succeeded. Reload the schema
      this.addClassIfNotExists(className).catch(() => {
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
      })
    );
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
        if (!fieldNameIsValid(fieldName, className)) {
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
  }

  // Sets the Class-level permissions for a given className, which must exist.
  async setPermissions(className, perms, newSchema) {
    if (typeof perms === 'undefined') {
      return Promise.resolve();
    }
    validateCLP(perms, newSchema, this.userIdRegEx);
    await this._dbAdapter.setClassLevelPermissions(className, perms);
    const cached = _SchemaCache.default.get(className);
    if (cached) {
      cached.classLevelPermissions = perms;
    }
  }

  // Returns a promise that resolves successfully to the new schema
  // object if the provided className-fieldName-type tuple is valid.
  // The className must already be validated.
  // If 'freeze' is true, refuse to update the schema for this field.
  enforceFieldExists(className, fieldName, type, isValidation) {
    if (fieldName.indexOf('.') > 0) {
      // subdocument key (x.y) => ok if x is of type 'object'
      fieldName = fieldName.split('.')[0];
      type = 'Object';
    }
    if (!fieldNameIsValid(fieldName, className)) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Invalid field name: ${fieldName}.`);
    }

    // If someone tries to create a new field with null/undefined as the value, return;
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
      // If type options do not change
      // we can safely return
      if (isValidation || JSON.stringify(expectedType) === JSON.stringify(type)) {
        return undefined;
      }
      // Field options are may be changed
      // ensure to have an update to date schema field
      return this._dbAdapter.updateFieldOptions(className, fieldName, type);
    }
    return this._dbAdapter.addFieldIfNotExists(className, fieldName, type).catch(error => {
      if (error.code == Parse.Error.INCORRECT_TYPE) {
        // Make sure that we throw errors when it is appropriate to do so.
        throw error;
      }
      // The update failed. This can be okay - it might have been a race
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
  }

  // maintain compatibility
  deleteField(fieldName, className, database) {
    return this.deleteFields([fieldName], className, database);
  }

  // Delete fields, and remove that data from all objects. This is intended
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
      if (!fieldNameIsValid(fieldName, className)) {
        throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `invalid field name: ${fieldName}`);
      }
      //Don't allow deleting the default fields.
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
    }).then(() => {
      _SchemaCache.default.clear();
    });
  }

  // Validates an object provided in REST format.
  // Returns a promise that resolves to the new schema if this object is
  // valid.
  async validateObject(className, object, query) {
    let geocount = 0;
    const schema = await this.enforceClassExists(className);
    const promises = [];
    for (const fieldName in object) {
      if (object[fieldName] && getType(object[fieldName]) === 'GeoPoint') {
        geocount++;
      }
      if (geocount > 1) {
        return Promise.reject(new Parse.Error(Parse.Error.INCORRECT_TYPE, 'there can only be one geopoint field in a class'));
      }
    }
    for (const fieldName in object) {
      if (object[fieldName] === undefined) {
        continue;
      }
      const expected = getType(object[fieldName]);
      if (!expected) {
        continue;
      }
      if (fieldName === 'ACL') {
        // Every object has ACL implicitly.
        continue;
      }
      promises.push(schema.enforceFieldExists(className, fieldName, expected, true));
    }
    const results = await Promise.all(promises);
    const enforceFields = results.filter(result => !!result);
    if (enforceFields.length !== 0) {
      // TODO: Remove by updating schema cache directly
      await this.reloadData({
        clearCache: true
      });
    }
    this.ensureFields(enforceFields);
    const promise = Promise.resolve(schema);
    return thenValidateRequiredColumns(promise, className, object, query);
  }

  // Validates that all the properties are set for the object
  validateRequiredColumns(className, object, query) {
    const columns = requiredColumns.write[className];
    if (!columns || columns.length == 0) {
      return Promise.resolve(this);
    }
    const missingColumns = columns.filter(function (column) {
      if (query && query.objectId) {
        if (object[column] && typeof object[column] === 'object') {
          // Trying to delete a required column
          return object[column].__op == 'Delete';
        }
        // Not trying to do anything there
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
  }

  // Tests that the class level permission let pass the operation for a given aclGroup
  static testPermissions(classPermissions, aclGroup, operation) {
    if (!classPermissions || !classPermissions[operation]) {
      return true;
    }
    const perms = classPermissions[operation];
    if (perms['*']) {
      return true;
    }
    // Check permissions against the aclGroup provided (array of userId/roles)
    if (aclGroup.some(acl => {
      return perms[acl] === true;
    })) {
      return true;
    }
    return false;
  }

  // Validates an operation passes class-level-permissions set in the schema
  static validatePermission(classPermissions, className, aclGroup, operation, action) {
    if (SchemaController.testPermissions(classPermissions, aclGroup, operation)) {
      return Promise.resolve();
    }
    if (!classPermissions || !classPermissions[operation]) {
      return true;
    }
    const perms = classPermissions[operation];
    // If only for authenticated users
    // make sure we have an aclGroup
    if (perms['requiresAuthentication']) {
      // If aclGroup has * (public)
      if (!aclGroup || aclGroup.length == 0) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Permission denied, user needs to be authenticated.');
      } else if (aclGroup.indexOf('*') > -1 && aclGroup.length == 1) {
        throw new Parse.Error(Parse.Error.OBJECT_NOT_FOUND, 'Permission denied, user needs to be authenticated.');
      }
      // requiresAuthentication passed, just move forward
      // probably would be wise at some point to rename to 'authenticatedUser'
      return Promise.resolve();
    }

    // No matching CLP, let's check the Pointer permissions
    // And handle those later
    const permissionField = ['get', 'find', 'count'].indexOf(operation) > -1 ? 'readUserFields' : 'writeUserFields';

    // Reject create when write lockdown
    if (permissionField == 'writeUserFields' && operation == 'create') {
      throw new Parse.Error(Parse.Error.OPERATION_FORBIDDEN, `Permission denied for action ${operation} on class ${className}.`);
    }

    // Process the readUserFields later
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
  }

  // Validates an operation passes class-level-permissions set in the schema
  validatePermission(className, aclGroup, operation, action) {
    return SchemaController.validatePermission(this.getClassLevelPermissions(className), className, aclGroup, operation, action);
  }
  getClassLevelPermissions(className) {
    return this.schemaData[className] && this.schemaData[className].classLevelPermissions;
  }

  // Returns the expected type for a className+key combination
  // or undefined if the schema is not set
  getExpectedType(className, fieldName) {
    if (this.schemaData[className]) {
      const expectedType = this.schemaData[className].fields[fieldName];
      return expectedType === 'map' ? 'Object' : expectedType;
    }
    return undefined;
  }

  // Checks if a given class is in the schema.
  hasClass(className) {
    if (this.schemaData[className]) {
      return Promise.resolve(true);
    }
    return this.reloadData().then(() => !!this.schemaData[className]);
  }
}

// Returns a promise for a new Schema.
exports.SchemaController = exports.default = SchemaController;
const load = (dbAdapter, options) => {
  const schema = new SchemaController(dbAdapter);
  return schema.reloadData(options).then(() => schema);
};

// Builds a new schema (in schema API response format) out of an
// existing mongo schema + a schemas API put request. This response
// does not include the default fields, as it is intended to be passed
// to mongoSchemaFromFieldsAndClassName. No validation is done here, it
// is done in mongoSchemaFromFieldsAndClassName.
exports.load = load;
function buildMergedSchemaObject(existingFields, putRequest) {
  const newSchema = {};
  // -disable-next
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
}

// Given a schema promise, construct another schema promise that
// validates this field once the schema loads.
function thenValidateRequiredColumns(schemaPromise, className, object, query) {
  return schemaPromise.then(schema => {
    return schema.validateRequiredColumns(className, object, query);
  });
}

// Gets the type from a REST API formatted object, where 'type' is
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
}

// This gets the type for non-JSON types like pointers and files, but
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJQYXJzZSIsInJlcXVpcmUiLCJkZWZhdWx0Q29sdW1ucyIsIk9iamVjdCIsImZyZWV6ZSIsIl9EZWZhdWx0Iiwib2JqZWN0SWQiLCJ0eXBlIiwiY3JlYXRlZEF0IiwidXBkYXRlZEF0IiwiQUNMIiwiX1VzZXIiLCJ1c2VybmFtZSIsInBhc3N3b3JkIiwiZW1haWwiLCJlbWFpbFZlcmlmaWVkIiwiYXV0aERhdGEiLCJfSW5zdGFsbGF0aW9uIiwiaW5zdGFsbGF0aW9uSWQiLCJkZXZpY2VUb2tlbiIsImNoYW5uZWxzIiwiZGV2aWNlVHlwZSIsInB1c2hUeXBlIiwiR0NNU2VuZGVySWQiLCJ0aW1lWm9uZSIsImxvY2FsZUlkZW50aWZpZXIiLCJiYWRnZSIsImFwcFZlcnNpb24iLCJhcHBOYW1lIiwiYXBwSWRlbnRpZmllciIsInBhcnNlVmVyc2lvbiIsIl9Sb2xlIiwibmFtZSIsInVzZXJzIiwidGFyZ2V0Q2xhc3MiLCJyb2xlcyIsIl9TZXNzaW9uIiwidXNlciIsInNlc3Npb25Ub2tlbiIsImV4cGlyZXNBdCIsImNyZWF0ZWRXaXRoIiwiX1Byb2R1Y3QiLCJwcm9kdWN0SWRlbnRpZmllciIsImRvd25sb2FkIiwiZG93bmxvYWROYW1lIiwiaWNvbiIsIm9yZGVyIiwidGl0bGUiLCJzdWJ0aXRsZSIsIl9QdXNoU3RhdHVzIiwicHVzaFRpbWUiLCJzb3VyY2UiLCJxdWVyeSIsInBheWxvYWQiLCJleHBpcnkiLCJleHBpcmF0aW9uX2ludGVydmFsIiwic3RhdHVzIiwibnVtU2VudCIsIm51bUZhaWxlZCIsInB1c2hIYXNoIiwiZXJyb3JNZXNzYWdlIiwic2VudFBlclR5cGUiLCJmYWlsZWRQZXJUeXBlIiwic2VudFBlclVUQ09mZnNldCIsImZhaWxlZFBlclVUQ09mZnNldCIsImNvdW50IiwiX0pvYlN0YXR1cyIsImpvYk5hbWUiLCJtZXNzYWdlIiwicGFyYW1zIiwiZmluaXNoZWRBdCIsIl9Kb2JTY2hlZHVsZSIsImRlc2NyaXB0aW9uIiwic3RhcnRBZnRlciIsImRheXNPZldlZWsiLCJ0aW1lT2ZEYXkiLCJsYXN0UnVuIiwicmVwZWF0TWludXRlcyIsIl9Ib29rcyIsImZ1bmN0aW9uTmFtZSIsImNsYXNzTmFtZSIsInRyaWdnZXJOYW1lIiwidXJsIiwiX0dsb2JhbENvbmZpZyIsIm1hc3RlcktleU9ubHkiLCJfR3JhcGhRTENvbmZpZyIsImNvbmZpZyIsIl9BdWRpZW5jZSIsImxhc3RVc2VkIiwidGltZXNVc2VkIiwiX0lkZW1wb3RlbmN5IiwicmVxSWQiLCJleHBpcmUiLCJyZXF1aXJlZENvbHVtbnMiLCJyZWFkIiwid3JpdGUiLCJpbnZhbGlkQ29sdW1ucyIsInN5c3RlbUNsYXNzZXMiLCJ2b2xhdGlsZUNsYXNzZXMiLCJyb2xlUmVnZXgiLCJwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUmVnZXgiLCJwdWJsaWNSZWdleCIsImF1dGhlbnRpY2F0ZWRSZWdleCIsInJlcXVpcmVzQXV0aGVudGljYXRpb25SZWdleCIsImNscFBvaW50ZXJSZWdleCIsInByb3RlY3RlZEZpZWxkc1JlZ2V4IiwiY2xwRmllbGRzUmVnZXgiLCJ2YWxpZGF0ZVBlcm1pc3Npb25LZXkiLCJrZXkiLCJ1c2VySWRSZWdFeHAiLCJtYXRjaGVzU29tZSIsInJlZ0V4IiwibWF0Y2giLCJ2YWxpZCIsIkVycm9yIiwiSU5WQUxJRF9KU09OIiwidmFsaWRhdGVQcm90ZWN0ZWRGaWVsZHNLZXkiLCJDTFBWYWxpZEtleXMiLCJ2YWxpZGF0ZUNMUCIsInBlcm1zIiwiZmllbGRzIiwib3BlcmF0aW9uS2V5IiwiaW5kZXhPZiIsIm9wZXJhdGlvbiIsInZhbGlkYXRlQ0xQanNvbiIsImZpZWxkTmFtZSIsInZhbGlkYXRlUG9pbnRlclBlcm1pc3Npb24iLCJlbnRpdHkiLCJwcm90ZWN0ZWRGaWVsZHMiLCJBcnJheSIsImlzQXJyYXkiLCJmaWVsZCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsInBvaW50ZXJGaWVsZHMiLCJwb2ludGVyRmllbGQiLCJwZXJtaXQiLCJqb2luQ2xhc3NSZWdleCIsImNsYXNzQW5kRmllbGRSZWdleCIsImNsYXNzTmFtZUlzVmFsaWQiLCJ0ZXN0IiwiZmllbGROYW1lSXNWYWxpZCIsImluY2x1ZGVzIiwiZmllbGROYW1lSXNWYWxpZEZvckNsYXNzIiwiaW52YWxpZENsYXNzTmFtZU1lc3NhZ2UiLCJpbnZhbGlkSnNvbkVycm9yIiwidmFsaWROb25SZWxhdGlvbk9yUG9pbnRlclR5cGVzIiwiZmllbGRUeXBlSXNJbnZhbGlkIiwiSU5WQUxJRF9DTEFTU19OQU1FIiwidW5kZWZpbmVkIiwiSU5DT1JSRUNUX1RZUEUiLCJjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hIiwic2NoZW1hIiwiaW5qZWN0RGVmYXVsdFNjaGVtYSIsIl9ycGVybSIsIl93cGVybSIsIl9oYXNoZWRfcGFzc3dvcmQiLCJjb252ZXJ0QWRhcHRlclNjaGVtYVRvUGFyc2VTY2hlbWEiLCJpbmRleGVzIiwia2V5cyIsImxlbmd0aCIsIlNjaGVtYURhdGEiLCJjb25zdHJ1Y3RvciIsImFsbFNjaGVtYXMiLCJfX2RhdGEiLCJfX3Byb3RlY3RlZEZpZWxkcyIsImZvckVhY2giLCJkZWZpbmVQcm9wZXJ0eSIsImdldCIsImRhdGEiLCJjbGFzc0xldmVsUGVybWlzc2lvbnMiLCJkZWVwY29weSIsImNsYXNzUHJvdGVjdGVkRmllbGRzIiwidW5xIiwiU2V0IiwiZnJvbSIsImRlZmF1bHRTY2hlbWEiLCJfSG9va3NTY2hlbWEiLCJfR2xvYmFsQ29uZmlnU2NoZW1hIiwiX0dyYXBoUUxDb25maWdTY2hlbWEiLCJfUHVzaFN0YXR1c1NjaGVtYSIsIl9Kb2JTdGF0dXNTY2hlbWEiLCJfSm9iU2NoZWR1bGVTY2hlbWEiLCJfQXVkaWVuY2VTY2hlbWEiLCJfSWRlbXBvdGVuY3lTY2hlbWEiLCJWb2xhdGlsZUNsYXNzZXNTY2hlbWFzIiwiZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUiLCJkYlR5cGUiLCJvYmplY3RUeXBlIiwidHlwZVRvU3RyaW5nIiwiU2NoZW1hQ29udHJvbGxlciIsImRhdGFiYXNlQWRhcHRlciIsIl9kYkFkYXB0ZXIiLCJzY2hlbWFEYXRhIiwiU2NoZW1hQ2FjaGUiLCJhbGwiLCJDb25maWciLCJhcHBsaWNhdGlvbklkIiwiY3VzdG9tSWRzIiwiYWxsb3dDdXN0b21PYmplY3RJZCIsImN1c3RvbUlkUmVnRXgiLCJhdXRvSWRSZWdFeCIsInVzZXJJZFJlZ0V4Iiwid2F0Y2giLCJyZWxvYWREYXRhIiwiY2xlYXJDYWNoZSIsIm9wdGlvbnMiLCJyZWxvYWREYXRhUHJvbWlzZSIsImdldEFsbENsYXNzZXMiLCJ0aGVuIiwiZXJyIiwic2V0QWxsQ2xhc3NlcyIsImNhY2hlZCIsIlByb21pc2UiLCJyZXNvbHZlIiwibWFwIiwicHV0IiwiZ2V0T25lU2NoZW1hIiwiYWxsb3dWb2xhdGlsZUNsYXNzZXMiLCJjbGVhciIsIm9uZVNjaGVtYSIsImZpbmQiLCJyZWplY3QiLCJhZGRDbGFzc0lmTm90RXhpc3RzIiwidmFsaWRhdGlvbkVycm9yIiwidmFsaWRhdGVOZXdDbGFzcyIsImNvZGUiLCJlcnJvciIsImFkYXB0ZXJTY2hlbWEiLCJjcmVhdGVDbGFzcyIsInBhcnNlU2NoZW1hIiwiRFVQTElDQVRFX1ZBTFVFIiwidXBkYXRlQ2xhc3MiLCJzdWJtaXR0ZWRGaWVsZHMiLCJkYXRhYmFzZSIsImV4aXN0aW5nRmllbGRzIiwiX19vcCIsIm5ld1NjaGVtYSIsImJ1aWxkTWVyZ2VkU2NoZW1hT2JqZWN0IiwiZGVmYXVsdEZpZWxkcyIsImZ1bGxOZXdTY2hlbWEiLCJhc3NpZ24iLCJ2YWxpZGF0ZVNjaGVtYURhdGEiLCJkZWxldGVkRmllbGRzIiwiaW5zZXJ0ZWRGaWVsZHMiLCJwdXNoIiwiZGVsZXRlUHJvbWlzZSIsImRlbGV0ZUZpZWxkcyIsImVuZm9yY2VGaWVsZHMiLCJwcm9taXNlcyIsImVuZm9yY2VGaWVsZEV4aXN0cyIsInJlc3VsdHMiLCJmaWx0ZXIiLCJyZXN1bHQiLCJzZXRQZXJtaXNzaW9ucyIsInNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0IiwiZW5zdXJlRmllbGRzIiwicmVsb2FkZWRTY2hlbWEiLCJjYXRjaCIsImVuZm9yY2VDbGFzc0V4aXN0cyIsImV4aXN0aW5nRmllbGROYW1lcyIsIklOVkFMSURfS0VZX05BTUUiLCJmaWVsZFR5cGUiLCJkZWZhdWx0VmFsdWUiLCJkZWZhdWx0VmFsdWVUeXBlIiwiZ2V0VHlwZSIsInJlcXVpcmVkIiwiZ2VvUG9pbnRzIiwic2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaXNWYWxpZGF0aW9uIiwic3BsaXQiLCJleHBlY3RlZFR5cGUiLCJnZXRFeHBlY3RlZFR5cGUiLCJKU09OIiwic3RyaW5naWZ5IiwidXBkYXRlRmllbGRPcHRpb25zIiwiYWRkRmllbGRJZk5vdEV4aXN0cyIsImkiLCJkZWxldGVGaWVsZCIsImZpZWxkTmFtZXMiLCJzY2hlbWFGaWVsZHMiLCJhZGFwdGVyIiwiZGVsZXRlQ2xhc3MiLCJ2YWxpZGF0ZU9iamVjdCIsIm9iamVjdCIsImdlb2NvdW50IiwiZXhwZWN0ZWQiLCJwcm9taXNlIiwidGhlblZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zIiwidmFsaWRhdGVSZXF1aXJlZENvbHVtbnMiLCJjb2x1bW5zIiwibWlzc2luZ0NvbHVtbnMiLCJjb2x1bW4iLCJ0ZXN0UGVybWlzc2lvbnNGb3JDbGFzc05hbWUiLCJhY2xHcm91cCIsInRlc3RQZXJtaXNzaW9ucyIsImdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyIsImNsYXNzUGVybWlzc2lvbnMiLCJzb21lIiwiYWNsIiwidmFsaWRhdGVQZXJtaXNzaW9uIiwiYWN0aW9uIiwiT0JKRUNUX05PVF9GT1VORCIsInBlcm1pc3Npb25GaWVsZCIsIk9QRVJBVElPTl9GT1JCSURERU4iLCJoYXNDbGFzcyIsImxvYWQiLCJkYkFkYXB0ZXIiLCJwdXRSZXF1ZXN0Iiwic3lzU2NoZW1hRmllbGQiLCJfaWQiLCJvbGRGaWVsZCIsImZpZWxkSXNEZWxldGVkIiwibmV3RmllbGQiLCJzY2hlbWFQcm9taXNlIiwib2JqIiwiZ2V0T2JqZWN0VHlwZSIsIl9fdHlwZSIsImlzbyIsImxhdGl0dWRlIiwibG9uZ2l0dWRlIiwiYmFzZTY0IiwiY29vcmRpbmF0ZXMiLCJvYmplY3RzIiwib3BzIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL0NvbnRyb2xsZXJzL1NjaGVtYUNvbnRyb2xsZXIuanMiXSwic291cmNlc0NvbnRlbnQiOlsiLy8gQGZsb3dcbi8vIFRoaXMgY2xhc3MgaGFuZGxlcyBzY2hlbWEgdmFsaWRhdGlvbiwgcGVyc2lzdGVuY2UsIGFuZCBtb2RpZmljYXRpb24uXG4vL1xuLy8gRWFjaCBpbmRpdmlkdWFsIFNjaGVtYSBvYmplY3Qgc2hvdWxkIGJlIGltbXV0YWJsZS4gVGhlIGhlbHBlcnMgdG9cbi8vIGRvIHRoaW5ncyB3aXRoIHRoZSBTY2hlbWEganVzdCByZXR1cm4gYSBuZXcgc2NoZW1hIHdoZW4gdGhlIHNjaGVtYVxuLy8gaXMgY2hhbmdlZC5cbi8vXG4vLyBUaGUgY2Fub25pY2FsIHBsYWNlIHRvIHN0b3JlIHRoaXMgU2NoZW1hIGlzIGluIHRoZSBkYXRhYmFzZSBpdHNlbGYsXG4vLyBpbiBhIF9TQ0hFTUEgY29sbGVjdGlvbi4gVGhpcyBpcyBub3QgdGhlIHJpZ2h0IHdheSB0byBkbyBpdCBmb3IgYW5cbi8vIG9wZW4gc291cmNlIGZyYW1ld29yaywgYnV0IGl0J3MgYmFja3dhcmQgY29tcGF0aWJsZSwgc28gd2UncmVcbi8vIGtlZXBpbmcgaXQgdGhpcyB3YXkgZm9yIG5vdy5cbi8vXG4vLyBJbiBBUEktaGFuZGxpbmcgY29kZSwgeW91IHNob3VsZCBvbmx5IHVzZSB0aGUgU2NoZW1hIGNsYXNzIHZpYSB0aGVcbi8vIERhdGFiYXNlQ29udHJvbGxlci4gVGhpcyB3aWxsIGxldCB1cyByZXBsYWNlIHRoZSBzY2hlbWEgbG9naWMgZm9yXG4vLyBkaWZmZXJlbnQgZGF0YWJhc2VzLlxuLy8gVE9ETzogaGlkZSBhbGwgc2NoZW1hIGxvZ2ljIGluc2lkZSB0aGUgZGF0YWJhc2UgYWRhcHRlci5cbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuY29uc3QgUGFyc2UgPSByZXF1aXJlKCdwYXJzZS9ub2RlJykuUGFyc2U7XG5pbXBvcnQgeyBTdG9yYWdlQWRhcHRlciB9IGZyb20gJy4uL0FkYXB0ZXJzL1N0b3JhZ2UvU3RvcmFnZUFkYXB0ZXInO1xuaW1wb3J0IFNjaGVtYUNhY2hlIGZyb20gJy4uL0FkYXB0ZXJzL0NhY2hlL1NjaGVtYUNhY2hlJztcbmltcG9ydCBEYXRhYmFzZUNvbnRyb2xsZXIgZnJvbSAnLi9EYXRhYmFzZUNvbnRyb2xsZXInO1xuaW1wb3J0IENvbmZpZyBmcm9tICcuLi9Db25maWcnO1xuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5pbXBvcnQgZGVlcGNvcHkgZnJvbSAnZGVlcGNvcHknO1xuaW1wb3J0IHR5cGUge1xuICBTY2hlbWEsXG4gIFNjaGVtYUZpZWxkcyxcbiAgQ2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICBTY2hlbWFGaWVsZCxcbiAgTG9hZFNjaGVtYU9wdGlvbnMsXG59IGZyb20gJy4vdHlwZXMnO1xuXG5jb25zdCBkZWZhdWx0Q29sdW1uczogeyBbc3RyaW5nXTogU2NoZW1hRmllbGRzIH0gPSBPYmplY3QuZnJlZXplKHtcbiAgLy8gQ29udGFpbiB0aGUgZGVmYXVsdCBjb2x1bW5zIGZvciBldmVyeSBwYXJzZSBvYmplY3QgdHlwZSAoZXhjZXB0IF9Kb2luIGNvbGxlY3Rpb24pXG4gIF9EZWZhdWx0OiB7XG4gICAgb2JqZWN0SWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBjcmVhdGVkQXQ6IHsgdHlwZTogJ0RhdGUnIH0sXG4gICAgdXBkYXRlZEF0OiB7IHR5cGU6ICdEYXRlJyB9LFxuICAgIEFDTDogeyB0eXBlOiAnQUNMJyB9LFxuICB9LFxuICAvLyBUaGUgYWRkaXRpb25hbCBkZWZhdWx0IGNvbHVtbnMgZm9yIHRoZSBfVXNlciBjb2xsZWN0aW9uIChpbiBhZGRpdGlvbiB0byBEZWZhdWx0Q29scylcbiAgX1VzZXI6IHtcbiAgICB1c2VybmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhc3N3b3JkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZW1haWw6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBlbWFpbFZlcmlmaWVkOiB7IHR5cGU6ICdCb29sZWFuJyB9LFxuICAgIGF1dGhEYXRhOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gIH0sXG4gIC8vIFRoZSBhZGRpdGlvbmFsIGRlZmF1bHQgY29sdW1ucyBmb3IgdGhlIF9JbnN0YWxsYXRpb24gY29sbGVjdGlvbiAoaW4gYWRkaXRpb24gdG8gRGVmYXVsdENvbHMpXG4gIF9JbnN0YWxsYXRpb246IHtcbiAgICBpbnN0YWxsYXRpb25JZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGRldmljZVRva2VuOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgY2hhbm5lbHM6IHsgdHlwZTogJ0FycmF5JyB9LFxuICAgIGRldmljZVR5cGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwdXNoVHlwZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIEdDTVNlbmRlcklkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgdGltZVpvbmU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBsb2NhbGVJZGVudGlmaWVyOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgYmFkZ2U6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICBhcHBWZXJzaW9uOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgYXBwTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGFwcElkZW50aWZpZXI6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwYXJzZVZlcnNpb246IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgfSxcbiAgLy8gVGhlIGFkZGl0aW9uYWwgZGVmYXVsdCBjb2x1bW5zIGZvciB0aGUgX1JvbGUgY29sbGVjdGlvbiAoaW4gYWRkaXRpb24gdG8gRGVmYXVsdENvbHMpXG4gIF9Sb2xlOiB7XG4gICAgbmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHVzZXJzOiB7IHR5cGU6ICdSZWxhdGlvbicsIHRhcmdldENsYXNzOiAnX1VzZXInIH0sXG4gICAgcm9sZXM6IHsgdHlwZTogJ1JlbGF0aW9uJywgdGFyZ2V0Q2xhc3M6ICdfUm9sZScgfSxcbiAgfSxcbiAgLy8gVGhlIGFkZGl0aW9uYWwgZGVmYXVsdCBjb2x1bW5zIGZvciB0aGUgX1Nlc3Npb24gY29sbGVjdGlvbiAoaW4gYWRkaXRpb24gdG8gRGVmYXVsdENvbHMpXG4gIF9TZXNzaW9uOiB7XG4gICAgdXNlcjogeyB0eXBlOiAnUG9pbnRlcicsIHRhcmdldENsYXNzOiAnX1VzZXInIH0sXG4gICAgaW5zdGFsbGF0aW9uSWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzZXNzaW9uVG9rZW46IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBleHBpcmVzQXQ6IHsgdHlwZTogJ0RhdGUnIH0sXG4gICAgY3JlYXRlZFdpdGg6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgfSxcbiAgX1Byb2R1Y3Q6IHtcbiAgICBwcm9kdWN0SWRlbnRpZmllcjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGRvd25sb2FkOiB7IHR5cGU6ICdGaWxlJyB9LFxuICAgIGRvd25sb2FkTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGljb246IHsgdHlwZTogJ0ZpbGUnIH0sXG4gICAgb3JkZXI6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICB0aXRsZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHN1YnRpdGxlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gIH0sXG4gIF9QdXNoU3RhdHVzOiB7XG4gICAgcHVzaFRpbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzb3VyY2U6IHsgdHlwZTogJ1N0cmluZycgfSwgLy8gcmVzdCBvciB3ZWJ1aVxuICAgIHF1ZXJ5OiB7IHR5cGU6ICdTdHJpbmcnIH0sIC8vIHRoZSBzdHJpbmdpZmllZCBKU09OIHF1ZXJ5XG4gICAgcGF5bG9hZDogeyB0eXBlOiAnU3RyaW5nJyB9LCAvLyB0aGUgc3RyaW5naWZpZWQgSlNPTiBwYXlsb2FkLFxuICAgIHRpdGxlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZXhwaXJ5OiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgZXhwaXJhdGlvbl9pbnRlcnZhbDogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIHN0YXR1czogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIG51bVNlbnQ6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICBudW1GYWlsZWQ6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICBwdXNoSGFzaDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGVycm9yTWVzc2FnZTogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIHNlbnRQZXJUeXBlOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgZmFpbGVkUGVyVHlwZTogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIHNlbnRQZXJVVENPZmZzZXQ6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBmYWlsZWRQZXJVVENPZmZzZXQ6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBjb3VudDogeyB0eXBlOiAnTnVtYmVyJyB9LCAvLyB0cmFja3MgIyBvZiBiYXRjaGVzIHF1ZXVlZCBhbmQgcGVuZGluZ1xuICB9LFxuICBfSm9iU3RhdHVzOiB7XG4gICAgam9iTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHNvdXJjZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHN0YXR1czogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIG1lc3NhZ2U6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwYXJhbXM6IHsgdHlwZTogJ09iamVjdCcgfSwgLy8gcGFyYW1zIHJlY2VpdmVkIHdoZW4gY2FsbGluZyB0aGUgam9iXG4gICAgZmluaXNoZWRBdDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgfSxcbiAgX0pvYlNjaGVkdWxlOiB7XG4gICAgam9iTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGRlc2NyaXB0aW9uOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFyYW1zOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc3RhcnRBZnRlcjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGRheXNPZldlZWs6IHsgdHlwZTogJ0FycmF5JyB9LFxuICAgIHRpbWVPZkRheTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGxhc3RSdW46IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICByZXBlYXRNaW51dGVzOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gIH0sXG4gIF9Ib29rczoge1xuICAgIGZ1bmN0aW9uTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGNsYXNzTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHRyaWdnZXJOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgdXJsOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gIH0sXG4gIF9HbG9iYWxDb25maWc6IHtcbiAgICBvYmplY3RJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhcmFtczogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIG1hc3RlcktleU9ubHk6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgfSxcbiAgX0dyYXBoUUxDb25maWc6IHtcbiAgICBvYmplY3RJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGNvbmZpZzogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICB9LFxuICBfQXVkaWVuY2U6IHtcbiAgICBvYmplY3RJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIG5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBxdWVyeTogeyB0eXBlOiAnU3RyaW5nJyB9LCAvL3N0b3JpbmcgcXVlcnkgYXMgSlNPTiBzdHJpbmcgdG8gcHJldmVudCBcIk5lc3RlZCBrZXlzIHNob3VsZCBub3QgY29udGFpbiB0aGUgJyQnIG9yICcuJyBjaGFyYWN0ZXJzXCIgZXJyb3JcbiAgICBsYXN0VXNlZDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgICB0aW1lc1VzZWQ6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgfSxcbiAgX0lkZW1wb3RlbmN5OiB7XG4gICAgcmVxSWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBleHBpcmU6IHsgdHlwZTogJ0RhdGUnIH0sXG4gIH0sXG59KTtcblxuLy8gZmllbGRzIHJlcXVpcmVkIGZvciByZWFkIG9yIHdyaXRlIG9wZXJhdGlvbnMgb24gdGhlaXIgcmVzcGVjdGl2ZSBjbGFzc2VzLlxuY29uc3QgcmVxdWlyZWRDb2x1bW5zID0gT2JqZWN0LmZyZWV6ZSh7XG4gIHJlYWQ6IHtcbiAgICBfVXNlcjogWyd1c2VybmFtZSddLFxuICB9LFxuICB3cml0ZToge1xuICAgIF9Qcm9kdWN0OiBbJ3Byb2R1Y3RJZGVudGlmaWVyJywgJ2ljb24nLCAnb3JkZXInLCAndGl0bGUnLCAnc3VidGl0bGUnXSxcbiAgICBfUm9sZTogWyduYW1lJywgJ0FDTCddLFxuICB9LFxufSk7XG5cbmNvbnN0IGludmFsaWRDb2x1bW5zID0gWydsZW5ndGgnXTtcblxuY29uc3Qgc3lzdGVtQ2xhc3NlcyA9IE9iamVjdC5mcmVlemUoW1xuICAnX1VzZXInLFxuICAnX0luc3RhbGxhdGlvbicsXG4gICdfUm9sZScsXG4gICdfU2Vzc2lvbicsXG4gICdfUHJvZHVjdCcsXG4gICdfUHVzaFN0YXR1cycsXG4gICdfSm9iU3RhdHVzJyxcbiAgJ19Kb2JTY2hlZHVsZScsXG4gICdfQXVkaWVuY2UnLFxuICAnX0lkZW1wb3RlbmN5Jyxcbl0pO1xuXG5jb25zdCB2b2xhdGlsZUNsYXNzZXMgPSBPYmplY3QuZnJlZXplKFtcbiAgJ19Kb2JTdGF0dXMnLFxuICAnX1B1c2hTdGF0dXMnLFxuICAnX0hvb2tzJyxcbiAgJ19HbG9iYWxDb25maWcnLFxuICAnX0dyYXBoUUxDb25maWcnLFxuICAnX0pvYlNjaGVkdWxlJyxcbiAgJ19BdWRpZW5jZScsXG4gICdfSWRlbXBvdGVuY3knLFxuXSk7XG5cbi8vIEFueXRoaW5nIHRoYXQgc3RhcnQgd2l0aCByb2xlXG5jb25zdCByb2xlUmVnZXggPSAvXnJvbGU6LiovO1xuLy8gQW55dGhpbmcgdGhhdCBzdGFydHMgd2l0aCB1c2VyRmllbGQgKGFsbG93ZWQgZm9yIHByb3RlY3RlZCBmaWVsZHMgb25seSlcbmNvbnN0IHByb3RlY3RlZEZpZWxkc1BvaW50ZXJSZWdleCA9IC9edXNlckZpZWxkOi4qLztcbi8vICogcGVybWlzc2lvblxuY29uc3QgcHVibGljUmVnZXggPSAvXlxcKiQvO1xuXG5jb25zdCBhdXRoZW50aWNhdGVkUmVnZXggPSAvXmF1dGhlbnRpY2F0ZWQkLztcblxuY29uc3QgcmVxdWlyZXNBdXRoZW50aWNhdGlvblJlZ2V4ID0gL15yZXF1aXJlc0F1dGhlbnRpY2F0aW9uJC87XG5cbmNvbnN0IGNscFBvaW50ZXJSZWdleCA9IC9ecG9pbnRlckZpZWxkcyQvO1xuXG4vLyByZWdleCBmb3IgdmFsaWRhdGluZyBlbnRpdGllcyBpbiBwcm90ZWN0ZWRGaWVsZHMgb2JqZWN0XG5jb25zdCBwcm90ZWN0ZWRGaWVsZHNSZWdleCA9IE9iamVjdC5mcmVlemUoW1xuICBwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUmVnZXgsXG4gIHB1YmxpY1JlZ2V4LFxuICBhdXRoZW50aWNhdGVkUmVnZXgsXG4gIHJvbGVSZWdleCxcbl0pO1xuXG4vLyBjbHAgcmVnZXhcbmNvbnN0IGNscEZpZWxkc1JlZ2V4ID0gT2JqZWN0LmZyZWV6ZShbXG4gIGNscFBvaW50ZXJSZWdleCxcbiAgcHVibGljUmVnZXgsXG4gIHJlcXVpcmVzQXV0aGVudGljYXRpb25SZWdleCxcbiAgcm9sZVJlZ2V4LFxuXSk7XG5cbmZ1bmN0aW9uIHZhbGlkYXRlUGVybWlzc2lvbktleShrZXksIHVzZXJJZFJlZ0V4cCkge1xuICBsZXQgbWF0Y2hlc1NvbWUgPSBmYWxzZTtcbiAgZm9yIChjb25zdCByZWdFeCBvZiBjbHBGaWVsZHNSZWdleCkge1xuICAgIGlmIChrZXkubWF0Y2gocmVnRXgpICE9PSBudWxsKSB7XG4gICAgICBtYXRjaGVzU29tZSA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICAvLyB1c2VySWQgZGVwZW5kcyBvbiBzdGFydHVwIG9wdGlvbnMgc28gaXQncyBkeW5hbWljXG4gIGNvbnN0IHZhbGlkID0gbWF0Y2hlc1NvbWUgfHwga2V5Lm1hdGNoKHVzZXJJZFJlZ0V4cCkgIT09IG51bGw7XG4gIGlmICghdmFsaWQpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICBgJyR7a2V5fScgaXMgbm90IGEgdmFsaWQga2V5IGZvciBjbGFzcyBsZXZlbCBwZXJtaXNzaW9uc2BcbiAgICApO1xuICB9XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlUHJvdGVjdGVkRmllbGRzS2V5KGtleSwgdXNlcklkUmVnRXhwKSB7XG4gIGxldCBtYXRjaGVzU29tZSA9IGZhbHNlO1xuICBmb3IgKGNvbnN0IHJlZ0V4IG9mIHByb3RlY3RlZEZpZWxkc1JlZ2V4KSB7XG4gICAgaWYgKGtleS5tYXRjaChyZWdFeCkgIT09IG51bGwpIHtcbiAgICAgIG1hdGNoZXNTb21lID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIC8vIHVzZXJJZCByZWdleCBkZXBlbmRzIG9uIGxhdW5jaCBvcHRpb25zIHNvIGl0J3MgZHluYW1pY1xuICBjb25zdCB2YWxpZCA9IG1hdGNoZXNTb21lIHx8IGtleS5tYXRjaCh1c2VySWRSZWdFeHApICE9PSBudWxsO1xuICBpZiAoIXZhbGlkKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgYCcke2tleX0nIGlzIG5vdCBhIHZhbGlkIGtleSBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnNgXG4gICAgKTtcbiAgfVxufVxuXG5jb25zdCBDTFBWYWxpZEtleXMgPSBPYmplY3QuZnJlZXplKFtcbiAgJ2ZpbmQnLFxuICAnY291bnQnLFxuICAnZ2V0JyxcbiAgJ2NyZWF0ZScsXG4gICd1cGRhdGUnLFxuICAnZGVsZXRlJyxcbiAgJ2FkZEZpZWxkJyxcbiAgJ3JlYWRVc2VyRmllbGRzJyxcbiAgJ3dyaXRlVXNlckZpZWxkcycsXG4gICdwcm90ZWN0ZWRGaWVsZHMnLFxuXSk7XG5cbi8vIHZhbGlkYXRpb24gYmVmb3JlIHNldHRpbmcgY2xhc3MtbGV2ZWwgcGVybWlzc2lvbnMgb24gY29sbGVjdGlvblxuZnVuY3Rpb24gdmFsaWRhdGVDTFAocGVybXM6IENsYXNzTGV2ZWxQZXJtaXNzaW9ucywgZmllbGRzOiBTY2hlbWFGaWVsZHMsIHVzZXJJZFJlZ0V4cDogUmVnRXhwKSB7XG4gIGlmICghcGVybXMpIHtcbiAgICByZXR1cm47XG4gIH1cbiAgZm9yIChjb25zdCBvcGVyYXRpb25LZXkgaW4gcGVybXMpIHtcbiAgICBpZiAoQ0xQVmFsaWRLZXlzLmluZGV4T2Yob3BlcmF0aW9uS2V5KSA9PSAtMSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgIGAke29wZXJhdGlvbktleX0gaXMgbm90IGEgdmFsaWQgb3BlcmF0aW9uIGZvciBjbGFzcyBsZXZlbCBwZXJtaXNzaW9uc2BcbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3Qgb3BlcmF0aW9uID0gcGVybXNbb3BlcmF0aW9uS2V5XTtcbiAgICAvLyBwcm9jZWVkIHdpdGggbmV4dCBvcGVyYXRpb25LZXlcblxuICAgIC8vIHRocm93cyB3aGVuIHJvb3QgZmllbGRzIGFyZSBvZiB3cm9uZyB0eXBlXG4gICAgdmFsaWRhdGVDTFBqc29uKG9wZXJhdGlvbiwgb3BlcmF0aW9uS2V5KTtcblxuICAgIGlmIChvcGVyYXRpb25LZXkgPT09ICdyZWFkVXNlckZpZWxkcycgfHwgb3BlcmF0aW9uS2V5ID09PSAnd3JpdGVVc2VyRmllbGRzJykge1xuICAgICAgLy8gdmFsaWRhdGUgZ3JvdXBlZCBwb2ludGVyIHBlcm1pc3Npb25zXG4gICAgICAvLyBtdXN0IGJlIGFuIGFycmF5IHdpdGggZmllbGQgbmFtZXNcbiAgICAgIGZvciAoY29uc3QgZmllbGROYW1lIG9mIG9wZXJhdGlvbikge1xuICAgICAgICB2YWxpZGF0ZVBvaW50ZXJQZXJtaXNzaW9uKGZpZWxkTmFtZSwgZmllbGRzLCBvcGVyYXRpb25LZXkpO1xuICAgICAgfVxuICAgICAgLy8gcmVhZFVzZXJGaWVsZHMgYW5kIHdyaXRlclVzZXJGaWVsZHMgZG8gbm90IGhhdmUgbmVzZHRlZCBmaWVsZHNcbiAgICAgIC8vIHByb2NlZWQgd2l0aCBuZXh0IG9wZXJhdGlvbktleVxuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gdmFsaWRhdGUgcHJvdGVjdGVkIGZpZWxkc1xuICAgIGlmIChvcGVyYXRpb25LZXkgPT09ICdwcm90ZWN0ZWRGaWVsZHMnKSB7XG4gICAgICBmb3IgKGNvbnN0IGVudGl0eSBpbiBvcGVyYXRpb24pIHtcbiAgICAgICAgLy8gdGhyb3dzIG9uIHVuZXhwZWN0ZWQga2V5XG4gICAgICAgIHZhbGlkYXRlUHJvdGVjdGVkRmllbGRzS2V5KGVudGl0eSwgdXNlcklkUmVnRXhwKTtcblxuICAgICAgICBjb25zdCBwcm90ZWN0ZWRGaWVsZHMgPSBvcGVyYXRpb25bZW50aXR5XTtcblxuICAgICAgICBpZiAoIUFycmF5LmlzQXJyYXkocHJvdGVjdGVkRmllbGRzKSkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgIGAnJHtwcm90ZWN0ZWRGaWVsZHN9JyBpcyBub3QgYSB2YWxpZCB2YWx1ZSBmb3IgcHJvdGVjdGVkRmllbGRzWyR7ZW50aXR5fV0gLSBleHBlY3RlZCBhbiBhcnJheS5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIGlmIHRoZSBmaWVsZCBpcyBpbiBmb3JtIG9mIGFycmF5XG4gICAgICAgIGZvciAoY29uc3QgZmllbGQgb2YgcHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAgICAgLy8gZG8gbm90IGFsbG9vdyB0byBwcm90ZWN0IGRlZmF1bHQgZmllbGRzXG4gICAgICAgICAgaWYgKGRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0W2ZpZWxkXSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgIGBEZWZhdWx0IGZpZWxkICcke2ZpZWxkfScgY2FuIG5vdCBiZSBwcm90ZWN0ZWRgXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgICAvLyBmaWVsZCBzaG91bGQgZXhpc3Qgb24gY29sbGVjdGlvblxuICAgICAgICAgIGlmICghT2JqZWN0LnByb3RvdHlwZS5oYXNPd25Qcm9wZXJ0eS5jYWxsKGZpZWxkcywgZmllbGQpKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgYEZpZWxkICcke2ZpZWxkfScgaW4gcHJvdGVjdGVkRmllbGRzOiR7ZW50aXR5fSBkb2VzIG5vdCBleGlzdGBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgICAvLyBwcm9jZWVkIHdpdGggbmV4dCBvcGVyYXRpb25LZXlcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIC8vIHZhbGlkYXRlIG90aGVyIGZpZWxkc1xuICAgIC8vIEVudGl0eSBjYW4gYmU6XG4gICAgLy8gXCIqXCIgLSBQdWJsaWMsXG4gICAgLy8gXCJyZXF1aXJlc0F1dGhlbnRpY2F0aW9uXCIgLSBhdXRoZW50aWNhdGVkIHVzZXJzLFxuICAgIC8vIFwib2JqZWN0SWRcIiAtIF9Vc2VyIGlkLFxuICAgIC8vIFwicm9sZTpyb2xlbmFtZVwiLFxuICAgIC8vIFwicG9pbnRlckZpZWxkc1wiIC0gYXJyYXkgb2YgZmllbGQgbmFtZXMgY29udGFpbmluZyBwb2ludGVycyB0byB1c2Vyc1xuICAgIGZvciAoY29uc3QgZW50aXR5IGluIG9wZXJhdGlvbikge1xuICAgICAgLy8gdGhyb3dzIG9uIHVuZXhwZWN0ZWQga2V5XG4gICAgICB2YWxpZGF0ZVBlcm1pc3Npb25LZXkoZW50aXR5LCB1c2VySWRSZWdFeHApO1xuXG4gICAgICAvLyBlbnRpdHkgY2FuIGJlIGVpdGhlcjpcbiAgICAgIC8vIFwicG9pbnRlckZpZWxkc1wiOiBzdHJpbmdbXVxuICAgICAgaWYgKGVudGl0eSA9PT0gJ3BvaW50ZXJGaWVsZHMnKSB7XG4gICAgICAgIGNvbnN0IHBvaW50ZXJGaWVsZHMgPSBvcGVyYXRpb25bZW50aXR5XTtcblxuICAgICAgICBpZiAoQXJyYXkuaXNBcnJheShwb2ludGVyRmllbGRzKSkge1xuICAgICAgICAgIGZvciAoY29uc3QgcG9pbnRlckZpZWxkIG9mIHBvaW50ZXJGaWVsZHMpIHtcbiAgICAgICAgICAgIHZhbGlkYXRlUG9pbnRlclBlcm1pc3Npb24ocG9pbnRlckZpZWxkLCBmaWVsZHMsIG9wZXJhdGlvbik7XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgIGAnJHtwb2ludGVyRmllbGRzfScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yICR7b3BlcmF0aW9uS2V5fVske2VudGl0eX1dIC0gZXhwZWN0ZWQgYW4gYXJyYXkuYFxuICAgICAgICAgICk7XG4gICAgICAgIH1cbiAgICAgICAgLy8gcHJvY2VlZCB3aXRoIG5leHQgZW50aXR5IGtleVxuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cblxuICAgICAgLy8gb3IgW2VudGl0eV06IGJvb2xlYW5cbiAgICAgIGNvbnN0IHBlcm1pdCA9IG9wZXJhdGlvbltlbnRpdHldO1xuXG4gICAgICBpZiAocGVybWl0ICE9PSB0cnVlKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgYCcke3Blcm1pdH0nIGlzIG5vdCBhIHZhbGlkIHZhbHVlIGZvciBjbGFzcyBsZXZlbCBwZXJtaXNzaW9ucyAke29wZXJhdGlvbktleX06JHtlbnRpdHl9OiR7cGVybWl0fWBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVDTFBqc29uKG9wZXJhdGlvbjogYW55LCBvcGVyYXRpb25LZXk6IHN0cmluZykge1xuICBpZiAob3BlcmF0aW9uS2V5ID09PSAncmVhZFVzZXJGaWVsZHMnIHx8IG9wZXJhdGlvbktleSA9PT0gJ3dyaXRlVXNlckZpZWxkcycpIHtcbiAgICBpZiAoIUFycmF5LmlzQXJyYXkob3BlcmF0aW9uKSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgIGAnJHtvcGVyYXRpb259JyBpcyBub3QgYSB2YWxpZCB2YWx1ZSBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnMgJHtvcGVyYXRpb25LZXl9IC0gbXVzdCBiZSBhbiBhcnJheWBcbiAgICAgICk7XG4gICAgfVxuICB9IGVsc2Uge1xuICAgIGlmICh0eXBlb2Ygb3BlcmF0aW9uID09PSAnb2JqZWN0JyAmJiBvcGVyYXRpb24gIT09IG51bGwpIHtcbiAgICAgIC8vIG9rIHRvIHByb2NlZWRcbiAgICAgIHJldHVybjtcbiAgICB9IGVsc2Uge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgIGAnJHtvcGVyYXRpb259JyBpcyBub3QgYSB2YWxpZCB2YWx1ZSBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnMgJHtvcGVyYXRpb25LZXl9IC0gbXVzdCBiZSBhbiBvYmplY3RgXG4gICAgICApO1xuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZVBvaW50ZXJQZXJtaXNzaW9uKGZpZWxkTmFtZTogc3RyaW5nLCBmaWVsZHM6IE9iamVjdCwgb3BlcmF0aW9uOiBzdHJpbmcpIHtcbiAgLy8gVXNlcyBjb2xsZWN0aW9uIHNjaGVtYSB0byBlbnN1cmUgdGhlIGZpZWxkIGlzIG9mIHR5cGU6XG4gIC8vIC0gUG9pbnRlcjxfVXNlcj4gKHBvaW50ZXJzKVxuICAvLyAtIEFycmF5XG4gIC8vXG4gIC8vICAgIEl0J3Mgbm90IHBvc3NpYmxlIHRvIGVuZm9yY2UgdHlwZSBvbiBBcnJheSdzIGl0ZW1zIGluIHNjaGVtYVxuICAvLyAgc28gd2UgYWNjZXB0IGFueSBBcnJheSBmaWVsZCwgYW5kIGxhdGVyIHdoZW4gYXBwbHlpbmcgcGVybWlzc2lvbnNcbiAgLy8gIG9ubHkgaXRlbXMgdGhhdCBhcmUgcG9pbnRlcnMgdG8gX1VzZXIgYXJlIGNvbnNpZGVyZWQuXG4gIGlmIChcbiAgICAhKFxuICAgICAgZmllbGRzW2ZpZWxkTmFtZV0gJiZcbiAgICAgICgoZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PSAnUG9pbnRlcicgJiYgZmllbGRzW2ZpZWxkTmFtZV0udGFyZ2V0Q2xhc3MgPT0gJ19Vc2VyJykgfHxcbiAgICAgICAgZmllbGRzW2ZpZWxkTmFtZV0udHlwZSA9PSAnQXJyYXknKVxuICAgIClcbiAgKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgYCcke2ZpZWxkTmFtZX0nIGlzIG5vdCBhIHZhbGlkIGNvbHVtbiBmb3IgY2xhc3MgbGV2ZWwgcG9pbnRlciBwZXJtaXNzaW9ucyAke29wZXJhdGlvbn1gXG4gICAgKTtcbiAgfVxufVxuXG5jb25zdCBqb2luQ2xhc3NSZWdleCA9IC9eX0pvaW46W0EtWmEtejAtOV9dKzpbQS1aYS16MC05X10rLztcbmNvbnN0IGNsYXNzQW5kRmllbGRSZWdleCA9IC9eW0EtWmEtel1bQS1aYS16MC05X10qJC87XG5mdW5jdGlvbiBjbGFzc05hbWVJc1ZhbGlkKGNsYXNzTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIC8vIFZhbGlkIGNsYXNzZXMgbXVzdDpcbiAgcmV0dXJuIChcbiAgICAvLyBCZSBvbmUgb2YgX1VzZXIsIF9JbnN0YWxsYXRpb24sIF9Sb2xlLCBfU2Vzc2lvbiBPUlxuICAgIHN5c3RlbUNsYXNzZXMuaW5kZXhPZihjbGFzc05hbWUpID4gLTEgfHxcbiAgICAvLyBCZSBhIGpvaW4gdGFibGUgT1JcbiAgICBqb2luQ2xhc3NSZWdleC50ZXN0KGNsYXNzTmFtZSkgfHxcbiAgICAvLyBJbmNsdWRlIG9ubHkgYWxwaGEtbnVtZXJpYyBhbmQgdW5kZXJzY29yZXMsIGFuZCBub3Qgc3RhcnQgd2l0aCBhbiB1bmRlcnNjb3JlIG9yIG51bWJlclxuICAgIGZpZWxkTmFtZUlzVmFsaWQoY2xhc3NOYW1lLCBjbGFzc05hbWUpXG4gICk7XG59XG5cbi8vIFZhbGlkIGZpZWxkcyBtdXN0IGJlIGFscGhhLW51bWVyaWMsIGFuZCBub3Qgc3RhcnQgd2l0aCBhbiB1bmRlcnNjb3JlIG9yIG51bWJlclxuLy8gbXVzdCBub3QgYmUgYSByZXNlcnZlZCBrZXlcbmZ1bmN0aW9uIGZpZWxkTmFtZUlzVmFsaWQoZmllbGROYW1lOiBzdHJpbmcsIGNsYXNzTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGlmIChjbGFzc05hbWUgJiYgY2xhc3NOYW1lICE9PSAnX0hvb2tzJykge1xuICAgIGlmIChmaWVsZE5hbWUgPT09ICdjbGFzc05hbWUnKSB7XG4gICAgICByZXR1cm4gZmFsc2U7XG4gICAgfVxuICB9XG4gIHJldHVybiBjbGFzc0FuZEZpZWxkUmVnZXgudGVzdChmaWVsZE5hbWUpICYmICFpbnZhbGlkQ29sdW1ucy5pbmNsdWRlcyhmaWVsZE5hbWUpO1xufVxuXG4vLyBDaGVja3MgdGhhdCBpdCdzIG5vdCB0cnlpbmcgdG8gY2xvYmJlciBvbmUgb2YgdGhlIGRlZmF1bHQgZmllbGRzIG9mIHRoZSBjbGFzcy5cbmZ1bmN0aW9uIGZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyhmaWVsZE5hbWU6IHN0cmluZywgY2xhc3NOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAoZGVmYXVsdENvbHVtbnMuX0RlZmF1bHRbZmllbGROYW1lXSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICBpZiAoZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXSAmJiBkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdW2ZpZWxkTmFtZV0pIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgcmV0dXJuIHRydWU7XG59XG5cbmZ1bmN0aW9uIGludmFsaWRDbGFzc05hbWVNZXNzYWdlKGNsYXNzTmFtZTogc3RyaW5nKTogc3RyaW5nIHtcbiAgcmV0dXJuIChcbiAgICAnSW52YWxpZCBjbGFzc25hbWU6ICcgK1xuICAgIGNsYXNzTmFtZSArXG4gICAgJywgY2xhc3NuYW1lcyBjYW4gb25seSBoYXZlIGFscGhhbnVtZXJpYyBjaGFyYWN0ZXJzIGFuZCBfLCBhbmQgbXVzdCBzdGFydCB3aXRoIGFuIGFscGhhIGNoYXJhY3RlciAnXG4gICk7XG59XG5cbmNvbnN0IGludmFsaWRKc29uRXJyb3IgPSBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnaW52YWxpZCBKU09OJyk7XG5jb25zdCB2YWxpZE5vblJlbGF0aW9uT3JQb2ludGVyVHlwZXMgPSBbXG4gICdOdW1iZXInLFxuICAnU3RyaW5nJyxcbiAgJ0Jvb2xlYW4nLFxuICAnRGF0ZScsXG4gICdPYmplY3QnLFxuICAnQXJyYXknLFxuICAnR2VvUG9pbnQnLFxuICAnRmlsZScsXG4gICdCeXRlcycsXG4gICdQb2x5Z29uJyxcbl07XG4vLyBSZXR1cm5zIGFuIGVycm9yIHN1aXRhYmxlIGZvciB0aHJvd2luZyBpZiB0aGUgdHlwZSBpcyBpbnZhbGlkXG5jb25zdCBmaWVsZFR5cGVJc0ludmFsaWQgPSAoeyB0eXBlLCB0YXJnZXRDbGFzcyB9KSA9PiB7XG4gIGlmIChbJ1BvaW50ZXInLCAnUmVsYXRpb24nXS5pbmRleE9mKHR5cGUpID49IDApIHtcbiAgICBpZiAoIXRhcmdldENsYXNzKSB7XG4gICAgICByZXR1cm4gbmV3IFBhcnNlLkVycm9yKDEzNSwgYHR5cGUgJHt0eXBlfSBuZWVkcyBhIGNsYXNzIG5hbWVgKTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiB0YXJnZXRDbGFzcyAhPT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiBpbnZhbGlkSnNvbkVycm9yO1xuICAgIH0gZWxzZSBpZiAoIWNsYXNzTmFtZUlzVmFsaWQodGFyZ2V0Q2xhc3MpKSB7XG4gICAgICByZXR1cm4gbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSwgaW52YWxpZENsYXNzTmFtZU1lc3NhZ2UodGFyZ2V0Q2xhc3MpKTtcbiAgICB9IGVsc2Uge1xuICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICB9XG4gIH1cbiAgaWYgKHR5cGVvZiB0eXBlICE9PSAnc3RyaW5nJykge1xuICAgIHJldHVybiBpbnZhbGlkSnNvbkVycm9yO1xuICB9XG4gIGlmICh2YWxpZE5vblJlbGF0aW9uT3JQb2ludGVyVHlwZXMuaW5kZXhPZih0eXBlKSA8IDApIHtcbiAgICByZXR1cm4gbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLCBgaW52YWxpZCBmaWVsZCB0eXBlOiAke3R5cGV9YCk7XG4gIH1cbiAgcmV0dXJuIHVuZGVmaW5lZDtcbn07XG5cbmNvbnN0IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEgPSAoc2NoZW1hOiBhbnkpID0+IHtcbiAgc2NoZW1hID0gaW5qZWN0RGVmYXVsdFNjaGVtYShzY2hlbWEpO1xuICBkZWxldGUgc2NoZW1hLmZpZWxkcy5BQ0w7XG4gIHNjaGVtYS5maWVsZHMuX3JwZXJtID0geyB0eXBlOiAnQXJyYXknIH07XG4gIHNjaGVtYS5maWVsZHMuX3dwZXJtID0geyB0eXBlOiAnQXJyYXknIH07XG5cbiAgaWYgKHNjaGVtYS5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5wYXNzd29yZDtcbiAgICBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQgPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gIH1cblxuICByZXR1cm4gc2NoZW1hO1xufTtcblxuY29uc3QgY29udmVydEFkYXB0ZXJTY2hlbWFUb1BhcnNlU2NoZW1hID0gKHsgLi4uc2NoZW1hIH0pID0+IHtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3JwZXJtO1xuICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fd3Blcm07XG5cbiAgc2NoZW1hLmZpZWxkcy5BQ0wgPSB7IHR5cGU6ICdBQ0wnIH07XG5cbiAgaWYgKHNjaGVtYS5jbGFzc05hbWUgPT09ICdfVXNlcicpIHtcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5hdXRoRGF0YTsgLy9BdXRoIGRhdGEgaXMgaW1wbGljaXRcbiAgICBkZWxldGUgc2NoZW1hLmZpZWxkcy5faGFzaGVkX3Bhc3N3b3JkO1xuICAgIHNjaGVtYS5maWVsZHMucGFzc3dvcmQgPSB7IHR5cGU6ICdTdHJpbmcnIH07XG4gIH1cblxuICBpZiAoc2NoZW1hLmluZGV4ZXMgJiYgT2JqZWN0LmtleXMoc2NoZW1hLmluZGV4ZXMpLmxlbmd0aCA9PT0gMCkge1xuICAgIGRlbGV0ZSBzY2hlbWEuaW5kZXhlcztcbiAgfVxuXG4gIHJldHVybiBzY2hlbWE7XG59O1xuXG5jbGFzcyBTY2hlbWFEYXRhIHtcbiAgX19kYXRhOiBhbnk7XG4gIF9fcHJvdGVjdGVkRmllbGRzOiBhbnk7XG4gIGNvbnN0cnVjdG9yKGFsbFNjaGVtYXMgPSBbXSwgcHJvdGVjdGVkRmllbGRzID0ge30pIHtcbiAgICB0aGlzLl9fZGF0YSA9IHt9O1xuICAgIHRoaXMuX19wcm90ZWN0ZWRGaWVsZHMgPSBwcm90ZWN0ZWRGaWVsZHM7XG4gICAgYWxsU2NoZW1hcy5mb3JFYWNoKHNjaGVtYSA9PiB7XG4gICAgICBpZiAodm9sYXRpbGVDbGFzc2VzLmluY2x1ZGVzKHNjaGVtYS5jbGFzc05hbWUpKSB7XG4gICAgICAgIHJldHVybjtcbiAgICAgIH1cbiAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCBzY2hlbWEuY2xhc3NOYW1lLCB7XG4gICAgICAgIGdldDogKCkgPT4ge1xuICAgICAgICAgIGlmICghdGhpcy5fX2RhdGFbc2NoZW1hLmNsYXNzTmFtZV0pIHtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSB7fTtcbiAgICAgICAgICAgIGRhdGEuZmllbGRzID0gaW5qZWN0RGVmYXVsdFNjaGVtYShzY2hlbWEpLmZpZWxkcztcbiAgICAgICAgICAgIGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zID0gZGVlcGNvcHkoc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyk7XG4gICAgICAgICAgICBkYXRhLmluZGV4ZXMgPSBzY2hlbWEuaW5kZXhlcztcblxuICAgICAgICAgICAgY29uc3QgY2xhc3NQcm90ZWN0ZWRGaWVsZHMgPSB0aGlzLl9fcHJvdGVjdGVkRmllbGRzW3NjaGVtYS5jbGFzc05hbWVdO1xuICAgICAgICAgICAgaWYgKGNsYXNzUHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAgICAgICAgIGZvciAoY29uc3Qga2V5IGluIGNsYXNzUHJvdGVjdGVkRmllbGRzKSB7XG4gICAgICAgICAgICAgICAgY29uc3QgdW5xID0gbmV3IFNldChbXG4gICAgICAgICAgICAgICAgICAuLi4oZGF0YS5jbGFzc0xldmVsUGVybWlzc2lvbnMucHJvdGVjdGVkRmllbGRzW2tleV0gfHwgW10pLFxuICAgICAgICAgICAgICAgICAgLi4uY2xhc3NQcm90ZWN0ZWRGaWVsZHNba2V5XSxcbiAgICAgICAgICAgICAgICBdKTtcbiAgICAgICAgICAgICAgICBkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucy5wcm90ZWN0ZWRGaWVsZHNba2V5XSA9IEFycmF5LmZyb20odW5xKTtcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgfVxuXG4gICAgICAgICAgICB0aGlzLl9fZGF0YVtzY2hlbWEuY2xhc3NOYW1lXSA9IGRhdGE7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLl9fZGF0YVtzY2hlbWEuY2xhc3NOYW1lXTtcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuXG4gICAgLy8gSW5qZWN0IHRoZSBpbi1tZW1vcnkgY2xhc3Nlc1xuICAgIHZvbGF0aWxlQ2xhc3Nlcy5mb3JFYWNoKGNsYXNzTmFtZSA9PiB7XG4gICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgY2xhc3NOYW1lLCB7XG4gICAgICAgIGdldDogKCkgPT4ge1xuICAgICAgICAgIGlmICghdGhpcy5fX2RhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgICAgICAgY29uc3Qgc2NoZW1hID0gaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgZmllbGRzOiB7fSxcbiAgICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IHt9O1xuICAgICAgICAgICAgZGF0YS5maWVsZHMgPSBzY2hlbWEuZmllbGRzO1xuICAgICAgICAgICAgZGF0YS5jbGFzc0xldmVsUGVybWlzc2lvbnMgPSBzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zO1xuICAgICAgICAgICAgZGF0YS5pbmRleGVzID0gc2NoZW1hLmluZGV4ZXM7XG4gICAgICAgICAgICB0aGlzLl9fZGF0YVtjbGFzc05hbWVdID0gZGF0YTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRoaXMuX19kYXRhW2NsYXNzTmFtZV07XG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcbiAgfVxufVxuXG5jb25zdCBpbmplY3REZWZhdWx0U2NoZW1hID0gKHsgY2xhc3NOYW1lLCBmaWVsZHMsIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucywgaW5kZXhlcyB9OiBTY2hlbWEpID0+IHtcbiAgY29uc3QgZGVmYXVsdFNjaGVtYTogU2NoZW1hID0ge1xuICAgIGNsYXNzTmFtZSxcbiAgICBmaWVsZHM6IHtcbiAgICAgIC4uLmRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0LFxuICAgICAgLi4uKGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV0gfHwge30pLFxuICAgICAgLi4uZmllbGRzLFxuICAgIH0sXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICB9O1xuICBpZiAoaW5kZXhlcyAmJiBPYmplY3Qua2V5cyhpbmRleGVzKS5sZW5ndGggIT09IDApIHtcbiAgICBkZWZhdWx0U2NoZW1hLmluZGV4ZXMgPSBpbmRleGVzO1xuICB9XG4gIHJldHVybiBkZWZhdWx0U2NoZW1hO1xufTtcblxuY29uc3QgX0hvb2tzU2NoZW1hID0geyBjbGFzc05hbWU6ICdfSG9va3MnLCBmaWVsZHM6IGRlZmF1bHRDb2x1bW5zLl9Ib29rcyB9O1xuY29uc3QgX0dsb2JhbENvbmZpZ1NjaGVtYSA9IHtcbiAgY2xhc3NOYW1lOiAnX0dsb2JhbENvbmZpZycsXG4gIGZpZWxkczogZGVmYXVsdENvbHVtbnMuX0dsb2JhbENvbmZpZyxcbn07XG5jb25zdCBfR3JhcGhRTENvbmZpZ1NjaGVtYSA9IHtcbiAgY2xhc3NOYW1lOiAnX0dyYXBoUUxDb25maWcnLFxuICBmaWVsZHM6IGRlZmF1bHRDb2x1bW5zLl9HcmFwaFFMQ29uZmlnLFxufTtcbmNvbnN0IF9QdXNoU3RhdHVzU2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX1B1c2hTdGF0dXMnLFxuICAgIGZpZWxkczoge30sXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgfSlcbik7XG5jb25zdCBfSm9iU3RhdHVzU2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX0pvYlN0YXR1cycsXG4gICAgZmllbGRzOiB7fSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IF9Kb2JTY2hlZHVsZVNjaGVtYSA9IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoXG4gIGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgIGNsYXNzTmFtZTogJ19Kb2JTY2hlZHVsZScsXG4gICAgZmllbGRzOiB7fSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IF9BdWRpZW5jZVNjaGVtYSA9IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoXG4gIGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgIGNsYXNzTmFtZTogJ19BdWRpZW5jZScsXG4gICAgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fQXVkaWVuY2UsXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgfSlcbik7XG5jb25zdCBfSWRlbXBvdGVuY3lTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfSWRlbXBvdGVuY3knLFxuICAgIGZpZWxkczogZGVmYXVsdENvbHVtbnMuX0lkZW1wb3RlbmN5LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyA9IFtcbiAgX0hvb2tzU2NoZW1hLFxuICBfSm9iU3RhdHVzU2NoZW1hLFxuICBfSm9iU2NoZWR1bGVTY2hlbWEsXG4gIF9QdXNoU3RhdHVzU2NoZW1hLFxuICBfR2xvYmFsQ29uZmlnU2NoZW1hLFxuICBfR3JhcGhRTENvbmZpZ1NjaGVtYSxcbiAgX0F1ZGllbmNlU2NoZW1hLFxuICBfSWRlbXBvdGVuY3lTY2hlbWEsXG5dO1xuXG5jb25zdCBkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZSA9IChkYlR5cGU6IFNjaGVtYUZpZWxkIHwgc3RyaW5nLCBvYmplY3RUeXBlOiBTY2hlbWFGaWVsZCkgPT4ge1xuICBpZiAoZGJUeXBlLnR5cGUgIT09IG9iamVjdFR5cGUudHlwZSkgcmV0dXJuIGZhbHNlO1xuICBpZiAoZGJUeXBlLnRhcmdldENsYXNzICE9PSBvYmplY3RUeXBlLnRhcmdldENsYXNzKSByZXR1cm4gZmFsc2U7XG4gIGlmIChkYlR5cGUgPT09IG9iamVjdFR5cGUudHlwZSkgcmV0dXJuIHRydWU7XG4gIGlmIChkYlR5cGUudHlwZSA9PT0gb2JqZWN0VHlwZS50eXBlKSByZXR1cm4gdHJ1ZTtcbiAgcmV0dXJuIGZhbHNlO1xufTtcblxuY29uc3QgdHlwZVRvU3RyaW5nID0gKHR5cGU6IFNjaGVtYUZpZWxkIHwgc3RyaW5nKTogc3RyaW5nID0+IHtcbiAgaWYgKHR5cGVvZiB0eXBlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiB0eXBlO1xuICB9XG4gIGlmICh0eXBlLnRhcmdldENsYXNzKSB7XG4gICAgcmV0dXJuIGAke3R5cGUudHlwZX08JHt0eXBlLnRhcmdldENsYXNzfT5gO1xuICB9XG4gIHJldHVybiBgJHt0eXBlLnR5cGV9YDtcbn07XG5cbi8vIFN0b3JlcyB0aGUgZW50aXJlIHNjaGVtYSBvZiB0aGUgYXBwIGluIGEgd2VpcmQgaHlicmlkIGZvcm1hdCBzb21ld2hlcmUgYmV0d2VlblxuLy8gdGhlIG1vbmdvIGZvcm1hdCBhbmQgdGhlIFBhcnNlIGZvcm1hdC4gU29vbiwgdGhpcyB3aWxsIGFsbCBiZSBQYXJzZSBmb3JtYXQuXG5leHBvcnQgZGVmYXVsdCBjbGFzcyBTY2hlbWFDb250cm9sbGVyIHtcbiAgX2RiQWRhcHRlcjogU3RvcmFnZUFkYXB0ZXI7XG4gIHNjaGVtYURhdGE6IHsgW3N0cmluZ106IFNjaGVtYSB9O1xuICByZWxvYWREYXRhUHJvbWlzZTogP1Byb21pc2U8YW55PjtcbiAgcHJvdGVjdGVkRmllbGRzOiBhbnk7XG4gIHVzZXJJZFJlZ0V4OiBSZWdFeHA7XG5cbiAgY29uc3RydWN0b3IoZGF0YWJhc2VBZGFwdGVyOiBTdG9yYWdlQWRhcHRlcikge1xuICAgIHRoaXMuX2RiQWRhcHRlciA9IGRhdGFiYXNlQWRhcHRlcjtcbiAgICB0aGlzLnNjaGVtYURhdGEgPSBuZXcgU2NoZW1hRGF0YShTY2hlbWFDYWNoZS5hbGwoKSwgdGhpcy5wcm90ZWN0ZWRGaWVsZHMpO1xuICAgIHRoaXMucHJvdGVjdGVkRmllbGRzID0gQ29uZmlnLmdldChQYXJzZS5hcHBsaWNhdGlvbklkKS5wcm90ZWN0ZWRGaWVsZHM7XG5cbiAgICBjb25zdCBjdXN0b21JZHMgPSBDb25maWcuZ2V0KFBhcnNlLmFwcGxpY2F0aW9uSWQpLmFsbG93Q3VzdG9tT2JqZWN0SWQ7XG5cbiAgICBjb25zdCBjdXN0b21JZFJlZ0V4ID0gL14uezEsfSQvdTsgLy8gMSsgY2hhcnNcbiAgICBjb25zdCBhdXRvSWRSZWdFeCA9IC9eW2EtekEtWjAtOV17MSx9JC87XG5cbiAgICB0aGlzLnVzZXJJZFJlZ0V4ID0gY3VzdG9tSWRzID8gY3VzdG9tSWRSZWdFeCA6IGF1dG9JZFJlZ0V4O1xuXG4gICAgdGhpcy5fZGJBZGFwdGVyLndhdGNoKCgpID0+IHtcbiAgICAgIHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgfSk7XG4gIH1cblxuICByZWxvYWREYXRhKG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9KTogUHJvbWlzZTxhbnk+IHtcbiAgICBpZiAodGhpcy5yZWxvYWREYXRhUHJvbWlzZSAmJiAhb3B0aW9ucy5jbGVhckNhY2hlKSB7XG4gICAgICByZXR1cm4gdGhpcy5yZWxvYWREYXRhUHJvbWlzZTtcbiAgICB9XG4gICAgdGhpcy5yZWxvYWREYXRhUHJvbWlzZSA9IHRoaXMuZ2V0QWxsQ2xhc3NlcyhvcHRpb25zKVxuICAgICAgLnRoZW4oXG4gICAgICAgIGFsbFNjaGVtYXMgPT4ge1xuICAgICAgICAgIHRoaXMuc2NoZW1hRGF0YSA9IG5ldyBTY2hlbWFEYXRhKGFsbFNjaGVtYXMsIHRoaXMucHJvdGVjdGVkRmllbGRzKTtcbiAgICAgICAgICBkZWxldGUgdGhpcy5yZWxvYWREYXRhUHJvbWlzZTtcbiAgICAgICAgfSxcbiAgICAgICAgZXJyID0+IHtcbiAgICAgICAgICB0aGlzLnNjaGVtYURhdGEgPSBuZXcgU2NoZW1hRGF0YSgpO1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLnJlbG9hZERhdGFQcm9taXNlO1xuICAgICAgICAgIHRocm93IGVycjtcbiAgICAgICAgfVxuICAgICAgKVxuICAgICAgLnRoZW4oKCkgPT4ge30pO1xuICAgIHJldHVybiB0aGlzLnJlbG9hZERhdGFQcm9taXNlO1xuICB9XG5cbiAgZ2V0QWxsQ2xhc3NlcyhvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfSk6IFByb21pc2U8QXJyYXk8U2NoZW1hPj4ge1xuICAgIGlmIChvcHRpb25zLmNsZWFyQ2FjaGUpIHtcbiAgICAgIHJldHVybiB0aGlzLnNldEFsbENsYXNzZXMoKTtcbiAgICB9XG4gICAgY29uc3QgY2FjaGVkID0gU2NoZW1hQ2FjaGUuYWxsKCk7XG4gICAgaWYgKGNhY2hlZCAmJiBjYWNoZWQubGVuZ3RoKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGNhY2hlZCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnNldEFsbENsYXNzZXMoKTtcbiAgfVxuXG4gIHNldEFsbENsYXNzZXMoKTogUHJvbWlzZTxBcnJheTxTY2hlbWE+PiB7XG4gICAgcmV0dXJuIHRoaXMuX2RiQWRhcHRlclxuICAgICAgLmdldEFsbENsYXNzZXMoKVxuICAgICAgLnRoZW4oYWxsU2NoZW1hcyA9PiBhbGxTY2hlbWFzLm1hcChpbmplY3REZWZhdWx0U2NoZW1hKSlcbiAgICAgIC50aGVuKGFsbFNjaGVtYXMgPT4ge1xuICAgICAgICBTY2hlbWFDYWNoZS5wdXQoYWxsU2NoZW1hcyk7XG4gICAgICAgIHJldHVybiBhbGxTY2hlbWFzO1xuICAgICAgfSk7XG4gIH1cblxuICBnZXRPbmVTY2hlbWEoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgYWxsb3dWb2xhdGlsZUNsYXNzZXM6IGJvb2xlYW4gPSBmYWxzZSxcbiAgICBvcHRpb25zOiBMb2FkU2NoZW1hT3B0aW9ucyA9IHsgY2xlYXJDYWNoZTogZmFsc2UgfVxuICApOiBQcm9taXNlPFNjaGVtYT4ge1xuICAgIGlmIChvcHRpb25zLmNsZWFyQ2FjaGUpIHtcbiAgICAgIFNjaGVtYUNhY2hlLmNsZWFyKCk7XG4gICAgfVxuICAgIGlmIChhbGxvd1ZvbGF0aWxlQ2xhc3NlcyAmJiB2b2xhdGlsZUNsYXNzZXMuaW5kZXhPZihjbGFzc05hbWUpID4gLTEpIHtcbiAgICAgIGNvbnN0IGRhdGEgPSB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXTtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoe1xuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIGZpZWxkczogZGF0YS5maWVsZHMsXG4gICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogZGF0YS5jbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgIGluZGV4ZXM6IGRhdGEuaW5kZXhlcyxcbiAgICAgIH0pO1xuICAgIH1cbiAgICBjb25zdCBjYWNoZWQgPSBTY2hlbWFDYWNoZS5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAoY2FjaGVkICYmICFvcHRpb25zLmNsZWFyQ2FjaGUpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoY2FjaGVkKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuc2V0QWxsQ2xhc3NlcygpLnRoZW4oYWxsU2NoZW1hcyA9PiB7XG4gICAgICBjb25zdCBvbmVTY2hlbWEgPSBhbGxTY2hlbWFzLmZpbmQoc2NoZW1hID0+IHNjaGVtYS5jbGFzc05hbWUgPT09IGNsYXNzTmFtZSk7XG4gICAgICBpZiAoIW9uZVNjaGVtYSkge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QodW5kZWZpbmVkKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBvbmVTY2hlbWE7XG4gICAgfSk7XG4gIH1cblxuICAvLyBDcmVhdGUgYSBuZXcgY2xhc3MgdGhhdCBpbmNsdWRlcyB0aGUgdGhyZWUgZGVmYXVsdCBmaWVsZHMuXG4gIC8vIEFDTCBpcyBhbiBpbXBsaWNpdCBjb2x1bW4gdGhhdCBkb2VzIG5vdCBnZXQgYW4gZW50cnkgaW4gdGhlXG4gIC8vIF9TQ0hFTUFTIGRhdGFiYXNlLiBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHdpdGggdGhlXG4gIC8vIGNyZWF0ZWQgc2NoZW1hLCBpbiBtb25nbyBmb3JtYXQuXG4gIC8vIG9uIHN1Y2Nlc3MsIGFuZCByZWplY3RzIHdpdGggYW4gZXJyb3Igb24gZmFpbC4gRW5zdXJlIHlvdVxuICAvLyBoYXZlIGF1dGhvcml6YXRpb24gKG1hc3RlciBrZXksIG9yIGNsaWVudCBjbGFzcyBjcmVhdGlvblxuICAvLyBlbmFibGVkKSBiZWZvcmUgY2FsbGluZyB0aGlzIGZ1bmN0aW9uLlxuICBhc3luYyBhZGRDbGFzc0lmTm90RXhpc3RzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZpZWxkczogU2NoZW1hRmllbGRzID0ge30sXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBhbnksXG4gICAgaW5kZXhlczogYW55ID0ge31cbiAgKTogUHJvbWlzZTx2b2lkIHwgU2NoZW1hPiB7XG4gICAgdmFyIHZhbGlkYXRpb25FcnJvciA9IHRoaXMudmFsaWRhdGVOZXdDbGFzcyhjbGFzc05hbWUsIGZpZWxkcywgY2xhc3NMZXZlbFBlcm1pc3Npb25zKTtcbiAgICBpZiAodmFsaWRhdGlvbkVycm9yKSB7XG4gICAgICBpZiAodmFsaWRhdGlvbkVycm9yIGluc3RhbmNlb2YgUGFyc2UuRXJyb3IpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KHZhbGlkYXRpb25FcnJvcik7XG4gICAgICB9IGVsc2UgaWYgKHZhbGlkYXRpb25FcnJvci5jb2RlICYmIHZhbGlkYXRpb25FcnJvci5lcnJvcikge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QobmV3IFBhcnNlLkVycm9yKHZhbGlkYXRpb25FcnJvci5jb2RlLCB2YWxpZGF0aW9uRXJyb3IuZXJyb3IpKTtcbiAgICAgIH1cbiAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdCh2YWxpZGF0aW9uRXJyb3IpO1xuICAgIH1cbiAgICB0cnkge1xuICAgICAgY29uc3QgYWRhcHRlclNjaGVtYSA9IGF3YWl0IHRoaXMuX2RiQWRhcHRlci5jcmVhdGVDbGFzcyhcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKHtcbiAgICAgICAgICBmaWVsZHMsXG4gICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgIGluZGV4ZXMsXG4gICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICB9KVxuICAgICAgKTtcbiAgICAgIC8vIFRPRE86IFJlbW92ZSBieSB1cGRhdGluZyBzY2hlbWEgY2FjaGUgZGlyZWN0bHlcbiAgICAgIGF3YWl0IHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgICBjb25zdCBwYXJzZVNjaGVtYSA9IGNvbnZlcnRBZGFwdGVyU2NoZW1hVG9QYXJzZVNjaGVtYShhZGFwdGVyU2NoZW1hKTtcbiAgICAgIHJldHVybiBwYXJzZVNjaGVtYTtcbiAgICB9IGNhdGNoIChlcnJvcikge1xuICAgICAgaWYgKGVycm9yICYmIGVycm9yLmNvZGUgPT09IFBhcnNlLkVycm9yLkRVUExJQ0FURV9WQUxVRSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLCBgQ2xhc3MgJHtjbGFzc05hbWV9IGFscmVhZHkgZXhpc3RzLmApO1xuICAgICAgfSBlbHNlIHtcbiAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgdXBkYXRlQ2xhc3MoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgc3VibWl0dGVkRmllbGRzOiBTY2hlbWFGaWVsZHMsXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBhbnksXG4gICAgaW5kZXhlczogYW55LFxuICAgIGRhdGFiYXNlOiBEYXRhYmFzZUNvbnRyb2xsZXJcbiAgKSB7XG4gICAgcmV0dXJuIHRoaXMuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSlcbiAgICAgIC50aGVuKHNjaGVtYSA9PiB7XG4gICAgICAgIGNvbnN0IGV4aXN0aW5nRmllbGRzID0gc2NoZW1hLmZpZWxkcztcbiAgICAgICAgT2JqZWN0LmtleXMoc3VibWl0dGVkRmllbGRzKS5mb3JFYWNoKG5hbWUgPT4ge1xuICAgICAgICAgIGNvbnN0IGZpZWxkID0gc3VibWl0dGVkRmllbGRzW25hbWVdO1xuICAgICAgICAgIGlmIChcbiAgICAgICAgICAgIGV4aXN0aW5nRmllbGRzW25hbWVdICYmXG4gICAgICAgICAgICBleGlzdGluZ0ZpZWxkc1tuYW1lXS50eXBlICE9PSBmaWVsZC50eXBlICYmXG4gICAgICAgICAgICBmaWVsZC5fX29wICE9PSAnRGVsZXRlJ1xuICAgICAgICAgICkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDI1NSwgYEZpZWxkICR7bmFtZX0gZXhpc3RzLCBjYW5ub3QgdXBkYXRlLmApO1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIWV4aXN0aW5nRmllbGRzW25hbWVdICYmIGZpZWxkLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMjU1LCBgRmllbGQgJHtuYW1lfSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGRlbGV0ZS5gKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGRlbGV0ZSBleGlzdGluZ0ZpZWxkcy5fcnBlcm07XG4gICAgICAgIGRlbGV0ZSBleGlzdGluZ0ZpZWxkcy5fd3Blcm07XG4gICAgICAgIGNvbnN0IG5ld1NjaGVtYSA9IGJ1aWxkTWVyZ2VkU2NoZW1hT2JqZWN0KGV4aXN0aW5nRmllbGRzLCBzdWJtaXR0ZWRGaWVsZHMpO1xuICAgICAgICBjb25zdCBkZWZhdWx0RmllbGRzID0gZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXSB8fCBkZWZhdWx0Q29sdW1ucy5fRGVmYXVsdDtcbiAgICAgICAgY29uc3QgZnVsbE5ld1NjaGVtYSA9IE9iamVjdC5hc3NpZ24oe30sIG5ld1NjaGVtYSwgZGVmYXVsdEZpZWxkcyk7XG4gICAgICAgIGNvbnN0IHZhbGlkYXRpb25FcnJvciA9IHRoaXMudmFsaWRhdGVTY2hlbWFEYXRhKFxuICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICBuZXdTY2hlbWEsXG4gICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgIE9iamVjdC5rZXlzKGV4aXN0aW5nRmllbGRzKVxuICAgICAgICApO1xuICAgICAgICBpZiAodmFsaWRhdGlvbkVycm9yKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKHZhbGlkYXRpb25FcnJvci5jb2RlLCB2YWxpZGF0aW9uRXJyb3IuZXJyb3IpO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gRmluYWxseSB3ZSBoYXZlIGNoZWNrZWQgdG8gbWFrZSBzdXJlIHRoZSByZXF1ZXN0IGlzIHZhbGlkIGFuZCB3ZSBjYW4gc3RhcnQgZGVsZXRpbmcgZmllbGRzLlxuICAgICAgICAvLyBEbyBhbGwgZGVsZXRpb25zIGZpcnN0LCB0aGVuIGEgc2luZ2xlIHNhdmUgdG8gX1NDSEVNQSBjb2xsZWN0aW9uIHRvIGhhbmRsZSBhbGwgYWRkaXRpb25zLlxuICAgICAgICBjb25zdCBkZWxldGVkRmllbGRzOiBzdHJpbmdbXSA9IFtdO1xuICAgICAgICBjb25zdCBpbnNlcnRlZEZpZWxkcyA9IFtdO1xuICAgICAgICBPYmplY3Qua2V5cyhzdWJtaXR0ZWRGaWVsZHMpLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICBpZiAoc3VibWl0dGVkRmllbGRzW2ZpZWxkTmFtZV0uX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgICAgIGRlbGV0ZWRGaWVsZHMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICBpbnNlcnRlZEZpZWxkcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBsZXQgZGVsZXRlUHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICBpZiAoZGVsZXRlZEZpZWxkcy5sZW5ndGggPiAwKSB7XG4gICAgICAgICAgZGVsZXRlUHJvbWlzZSA9IHRoaXMuZGVsZXRlRmllbGRzKGRlbGV0ZWRGaWVsZHMsIGNsYXNzTmFtZSwgZGF0YWJhc2UpO1xuICAgICAgICB9XG4gICAgICAgIGxldCBlbmZvcmNlRmllbGRzID0gW107XG4gICAgICAgIHJldHVybiAoXG4gICAgICAgICAgZGVsZXRlUHJvbWlzZSAvLyBEZWxldGUgRXZlcnl0aGluZ1xuICAgICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KSkgLy8gUmVsb2FkIG91ciBTY2hlbWEsIHNvIHdlIGhhdmUgYWxsIHRoZSBuZXcgdmFsdWVzXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIGNvbnN0IHByb21pc2VzID0gaW5zZXJ0ZWRGaWVsZHMubWFwKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICAgICAgY29uc3QgdHlwZSA9IHN1Ym1pdHRlZEZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgICAgICAgIHJldHVybiB0aGlzLmVuZm9yY2VGaWVsZEV4aXN0cyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSk7XG4gICAgICAgICAgICAgIH0pO1xuICAgICAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKHJlc3VsdHMgPT4ge1xuICAgICAgICAgICAgICBlbmZvcmNlRmllbGRzID0gcmVzdWx0cy5maWx0ZXIocmVzdWx0ID0+ICEhcmVzdWx0KTtcbiAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuc2V0UGVybWlzc2lvbnMoY2xhc3NOYW1lLCBjbGFzc0xldmVsUGVybWlzc2lvbnMsIG5ld1NjaGVtYSk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnRoZW4oKCkgPT5cbiAgICAgICAgICAgICAgdGhpcy5fZGJBZGFwdGVyLnNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0KFxuICAgICAgICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICBpbmRleGVzLFxuICAgICAgICAgICAgICAgIHNjaGVtYS5pbmRleGVzLFxuICAgICAgICAgICAgICAgIGZ1bGxOZXdTY2hlbWFcbiAgICAgICAgICAgICAgKVxuICAgICAgICAgICAgKVxuICAgICAgICAgICAgLnRoZW4oKCkgPT4gdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KSlcbiAgICAgICAgICAgIC8vVE9ETzogTW92ZSB0aGlzIGxvZ2ljIGludG8gdGhlIGRhdGFiYXNlIGFkYXB0ZXJcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgdGhpcy5lbnN1cmVGaWVsZHMoZW5mb3JjZUZpZWxkcyk7XG4gICAgICAgICAgICAgIGNvbnN0IHNjaGVtYSA9IHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdO1xuICAgICAgICAgICAgICBjb25zdCByZWxvYWRlZFNjaGVtYTogU2NoZW1hID0ge1xuICAgICAgICAgICAgICAgIGNsYXNzTmFtZTogY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgIGZpZWxkczogc2NoZW1hLmZpZWxkcyxcbiAgICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgICAgIH07XG4gICAgICAgICAgICAgIGlmIChzY2hlbWEuaW5kZXhlcyAmJiBPYmplY3Qua2V5cyhzY2hlbWEuaW5kZXhlcykubGVuZ3RoICE9PSAwKSB7XG4gICAgICAgICAgICAgICAgcmVsb2FkZWRTY2hlbWEuaW5kZXhlcyA9IHNjaGVtYS5pbmRleGVzO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiByZWxvYWRlZFNjaGVtYTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICk7XG4gICAgICB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsXG4gICAgICAgICAgICBgQ2xhc3MgJHtjbGFzc05hbWV9IGRvZXMgbm90IGV4aXN0LmBcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IHRvIHRoZSBuZXcgc2NoZW1hXG4gIC8vIG9iamVjdCBvciBmYWlscyB3aXRoIGEgcmVhc29uLlxuICBlbmZvcmNlQ2xhc3NFeGlzdHMoY2xhc3NOYW1lOiBzdHJpbmcpOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXI+IHtcbiAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcyk7XG4gICAgfVxuICAgIC8vIFdlIGRvbid0IGhhdmUgdGhpcyBjbGFzcy4gVXBkYXRlIHRoZSBzY2hlbWFcbiAgICByZXR1cm4gKFxuICAgICAgLy8gVGhlIHNjaGVtYSB1cGRhdGUgc3VjY2VlZGVkLiBSZWxvYWQgdGhlIHNjaGVtYVxuICAgICAgdGhpcy5hZGRDbGFzc0lmTm90RXhpc3RzKGNsYXNzTmFtZSlcbiAgICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAvLyBUaGUgc2NoZW1hIHVwZGF0ZSBmYWlsZWQuIFRoaXMgY2FuIGJlIG9rYXkgLSBpdCBtaWdodFxuICAgICAgICAgIC8vIGhhdmUgZmFpbGVkIGJlY2F1c2UgdGhlcmUncyBhIHJhY2UgY29uZGl0aW9uIGFuZCBhIGRpZmZlcmVudFxuICAgICAgICAgIC8vIGNsaWVudCBpcyBtYWtpbmcgdGhlIGV4YWN0IHNhbWUgc2NoZW1hIHVwZGF0ZSB0aGF0IHdlIHdhbnQuXG4gICAgICAgICAgLy8gU28ganVzdCByZWxvYWQgdGhlIHNjaGVtYS5cbiAgICAgICAgICByZXR1cm4gdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICAgICAgfSlcbiAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIC8vIEVuc3VyZSB0aGF0IHRoZSBzY2hlbWEgbm93IHZhbGlkYXRlc1xuICAgICAgICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgICAgICAgcmV0dXJuIHRoaXM7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBGYWlsZWQgdG8gYWRkICR7Y2xhc3NOYW1lfWApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSlcbiAgICAgICAgLmNhdGNoKCgpID0+IHtcbiAgICAgICAgICAvLyBUaGUgc2NoZW1hIHN0aWxsIGRvZXNuJ3QgdmFsaWRhdGUuIEdpdmUgdXBcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCAnc2NoZW1hIGNsYXNzIG5hbWUgZG9lcyBub3QgcmV2YWxpZGF0ZScpO1xuICAgICAgICB9KVxuICAgICk7XG4gIH1cblxuICB2YWxpZGF0ZU5ld0NsYXNzKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZHM6IFNjaGVtYUZpZWxkcyA9IHt9LCBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGFueSk6IGFueSB7XG4gICAgaWYgKHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLCBgQ2xhc3MgJHtjbGFzc05hbWV9IGFscmVhZHkgZXhpc3RzLmApO1xuICAgIH1cbiAgICBpZiAoIWNsYXNzTmFtZUlzVmFsaWQoY2xhc3NOYW1lKSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLFxuICAgICAgICBlcnJvcjogaW52YWxpZENsYXNzTmFtZU1lc3NhZ2UoY2xhc3NOYW1lKSxcbiAgICAgIH07XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnZhbGlkYXRlU2NoZW1hRGF0YShjbGFzc05hbWUsIGZpZWxkcywgY2xhc3NMZXZlbFBlcm1pc3Npb25zLCBbXSk7XG4gIH1cblxuICB2YWxpZGF0ZVNjaGVtYURhdGEoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGRzOiBTY2hlbWFGaWVsZHMsXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBDbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgZXhpc3RpbmdGaWVsZE5hbWVzOiBBcnJheTxzdHJpbmc+XG4gICkge1xuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIGZpZWxkcykge1xuICAgICAgaWYgKGV4aXN0aW5nRmllbGROYW1lcy5pbmRleE9mKGZpZWxkTmFtZSkgPCAwKSB7XG4gICAgICAgIGlmICghZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSxcbiAgICAgICAgICAgIGVycm9yOiAnaW52YWxpZCBmaWVsZCBuYW1lOiAnICsgZmllbGROYW1lLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkRm9yQ2xhc3MoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGNvZGU6IDEzNixcbiAgICAgICAgICAgIGVycm9yOiAnZmllbGQgJyArIGZpZWxkTmFtZSArICcgY2Fubm90IGJlIGFkZGVkJyxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGNvbnN0IGZpZWxkVHlwZSA9IGZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICBjb25zdCBlcnJvciA9IGZpZWxkVHlwZUlzSW52YWxpZChmaWVsZFR5cGUpO1xuICAgICAgICBpZiAoZXJyb3IpIHJldHVybiB7IGNvZGU6IGVycm9yLmNvZGUsIGVycm9yOiBlcnJvci5tZXNzYWdlIH07XG4gICAgICAgIGlmIChmaWVsZFR5cGUuZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICBsZXQgZGVmYXVsdFZhbHVlVHlwZSA9IGdldFR5cGUoZmllbGRUeXBlLmRlZmF1bHRWYWx1ZSk7XG4gICAgICAgICAgaWYgKHR5cGVvZiBkZWZhdWx0VmFsdWVUeXBlID09PSAnc3RyaW5nJykge1xuICAgICAgICAgICAgZGVmYXVsdFZhbHVlVHlwZSA9IHsgdHlwZTogZGVmYXVsdFZhbHVlVHlwZSB9O1xuICAgICAgICAgIH0gZWxzZSBpZiAodHlwZW9mIGRlZmF1bHRWYWx1ZVR5cGUgPT09ICdvYmplY3QnICYmIGZpZWxkVHlwZS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICAgICAgZXJyb3I6IGBUaGUgJ2RlZmF1bHQgdmFsdWUnIG9wdGlvbiBpcyBub3QgYXBwbGljYWJsZSBmb3IgJHt0eXBlVG9TdHJpbmcoZmllbGRUeXBlKX1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZShmaWVsZFR5cGUsIGRlZmF1bHRWYWx1ZVR5cGUpKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICAgICAgZXJyb3I6IGBzY2hlbWEgbWlzbWF0Y2ggZm9yICR7Y2xhc3NOYW1lfS4ke2ZpZWxkTmFtZX0gZGVmYXVsdCB2YWx1ZTsgZXhwZWN0ZWQgJHt0eXBlVG9TdHJpbmcoXG4gICAgICAgICAgICAgICAgZmllbGRUeXBlXG4gICAgICAgICAgICAgICl9IGJ1dCBnb3QgJHt0eXBlVG9TdHJpbmcoZGVmYXVsdFZhbHVlVHlwZSl9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICB9IGVsc2UgaWYgKGZpZWxkVHlwZS5yZXF1aXJlZCkge1xuICAgICAgICAgIGlmICh0eXBlb2YgZmllbGRUeXBlID09PSAnb2JqZWN0JyAmJiBmaWVsZFR5cGUudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAgIGVycm9yOiBgVGhlICdyZXF1aXJlZCcgb3B0aW9uIGlzIG5vdCBhcHBsaWNhYmxlIGZvciAke3R5cGVUb1N0cmluZyhmaWVsZFR5cGUpfWAsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV0pIHtcbiAgICAgIGZpZWxkc1tmaWVsZE5hbWVdID0gZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXVtmaWVsZE5hbWVdO1xuICAgIH1cblxuICAgIGNvbnN0IGdlb1BvaW50cyA9IE9iamVjdC5rZXlzKGZpZWxkcykuZmlsdGVyKFxuICAgICAga2V5ID0+IGZpZWxkc1trZXldICYmIGZpZWxkc1trZXldLnR5cGUgPT09ICdHZW9Qb2ludCdcbiAgICApO1xuICAgIGlmIChnZW9Qb2ludHMubGVuZ3RoID4gMSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgIGVycm9yOlxuICAgICAgICAgICdjdXJyZW50bHksIG9ubHkgb25lIEdlb1BvaW50IGZpZWxkIG1heSBleGlzdCBpbiBhbiBvYmplY3QuIEFkZGluZyAnICtcbiAgICAgICAgICBnZW9Qb2ludHNbMV0gK1xuICAgICAgICAgICcgd2hlbiAnICtcbiAgICAgICAgICBnZW9Qb2ludHNbMF0gK1xuICAgICAgICAgICcgYWxyZWFkeSBleGlzdHMuJyxcbiAgICAgIH07XG4gICAgfVxuICAgIHZhbGlkYXRlQ0xQKGNsYXNzTGV2ZWxQZXJtaXNzaW9ucywgZmllbGRzLCB0aGlzLnVzZXJJZFJlZ0V4KTtcbiAgfVxuXG4gIC8vIFNldHMgdGhlIENsYXNzLWxldmVsIHBlcm1pc3Npb25zIGZvciBhIGdpdmVuIGNsYXNzTmFtZSwgd2hpY2ggbXVzdCBleGlzdC5cbiAgYXN5bmMgc2V0UGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcsIHBlcm1zOiBhbnksIG5ld1NjaGVtYTogU2NoZW1hRmllbGRzKSB7XG4gICAgaWYgKHR5cGVvZiBwZXJtcyA9PT0gJ3VuZGVmaW5lZCcpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG4gICAgdmFsaWRhdGVDTFAocGVybXMsIG5ld1NjaGVtYSwgdGhpcy51c2VySWRSZWdFeCk7XG4gICAgYXdhaXQgdGhpcy5fZGJBZGFwdGVyLnNldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUsIHBlcm1zKTtcbiAgICBjb25zdCBjYWNoZWQgPSBTY2hlbWFDYWNoZS5nZXQoY2xhc3NOYW1lKTtcbiAgICBpZiAoY2FjaGVkKSB7XG4gICAgICBjYWNoZWQuY2xhc3NMZXZlbFBlcm1pc3Npb25zID0gcGVybXM7XG4gICAgfVxuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgdG8gdGhlIG5ldyBzY2hlbWFcbiAgLy8gb2JqZWN0IGlmIHRoZSBwcm92aWRlZCBjbGFzc05hbWUtZmllbGROYW1lLXR5cGUgdHVwbGUgaXMgdmFsaWQuXG4gIC8vIFRoZSBjbGFzc05hbWUgbXVzdCBhbHJlYWR5IGJlIHZhbGlkYXRlZC5cbiAgLy8gSWYgJ2ZyZWV6ZScgaXMgdHJ1ZSwgcmVmdXNlIHRvIHVwZGF0ZSB0aGUgc2NoZW1hIGZvciB0aGlzIGZpZWxkLlxuICBlbmZvcmNlRmllbGRFeGlzdHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGROYW1lOiBzdHJpbmcsXG4gICAgdHlwZTogc3RyaW5nIHwgU2NoZW1hRmllbGQsXG4gICAgaXNWYWxpZGF0aW9uPzogYm9vbGVhblxuICApIHtcbiAgICBpZiAoZmllbGROYW1lLmluZGV4T2YoJy4nKSA+IDApIHtcbiAgICAgIC8vIHN1YmRvY3VtZW50IGtleSAoeC55KSA9PiBvayBpZiB4IGlzIG9mIHR5cGUgJ29iamVjdCdcbiAgICAgIGZpZWxkTmFtZSA9IGZpZWxkTmFtZS5zcGxpdCgnLicpWzBdO1xuICAgICAgdHlwZSA9ICdPYmplY3QnO1xuICAgIH1cbiAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWQoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYEludmFsaWQgZmllbGQgbmFtZTogJHtmaWVsZE5hbWV9LmApO1xuICAgIH1cblxuICAgIC8vIElmIHNvbWVvbmUgdHJpZXMgdG8gY3JlYXRlIGEgbmV3IGZpZWxkIHdpdGggbnVsbC91bmRlZmluZWQgYXMgdGhlIHZhbHVlLCByZXR1cm47XG4gICAgaWYgKCF0eXBlKSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cblxuICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHRoaXMuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwgZmllbGROYW1lKTtcbiAgICBpZiAodHlwZW9mIHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICB0eXBlID0gKHsgdHlwZSB9OiBTY2hlbWFGaWVsZCk7XG4gICAgfVxuXG4gICAgaWYgKHR5cGUuZGVmYXVsdFZhbHVlICE9PSB1bmRlZmluZWQpIHtcbiAgICAgIGxldCBkZWZhdWx0VmFsdWVUeXBlID0gZ2V0VHlwZSh0eXBlLmRlZmF1bHRWYWx1ZSk7XG4gICAgICBpZiAodHlwZW9mIGRlZmF1bHRWYWx1ZVR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIGRlZmF1bHRWYWx1ZVR5cGUgPSB7IHR5cGU6IGRlZmF1bHRWYWx1ZVR5cGUgfTtcbiAgICAgIH1cbiAgICAgIGlmICghZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUodHlwZSwgZGVmYXVsdFZhbHVlVHlwZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgIGBzY2hlbWEgbWlzbWF0Y2ggZm9yICR7Y2xhc3NOYW1lfS4ke2ZpZWxkTmFtZX0gZGVmYXVsdCB2YWx1ZTsgZXhwZWN0ZWQgJHt0eXBlVG9TdHJpbmcoXG4gICAgICAgICAgICB0eXBlXG4gICAgICAgICAgKX0gYnV0IGdvdCAke3R5cGVUb1N0cmluZyhkZWZhdWx0VmFsdWVUeXBlKX1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgaWYgKGV4cGVjdGVkVHlwZSkge1xuICAgICAgaWYgKCFkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZShleHBlY3RlZFR5cGUsIHR5cGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICBgc2NoZW1hIG1pc21hdGNoIGZvciAke2NsYXNzTmFtZX0uJHtmaWVsZE5hbWV9OyBleHBlY3RlZCAke3R5cGVUb1N0cmluZyhcbiAgICAgICAgICAgIGV4cGVjdGVkVHlwZVxuICAgICAgICAgICl9IGJ1dCBnb3QgJHt0eXBlVG9TdHJpbmcodHlwZSl9YFxuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gSWYgdHlwZSBvcHRpb25zIGRvIG5vdCBjaGFuZ2VcbiAgICAgIC8vIHdlIGNhbiBzYWZlbHkgcmV0dXJuXG4gICAgICBpZiAoaXNWYWxpZGF0aW9uIHx8IEpTT04uc3RyaW5naWZ5KGV4cGVjdGVkVHlwZSkgPT09IEpTT04uc3RyaW5naWZ5KHR5cGUpKSB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgICAvLyBGaWVsZCBvcHRpb25zIGFyZSBtYXkgYmUgY2hhbmdlZFxuICAgICAgLy8gZW5zdXJlIHRvIGhhdmUgYW4gdXBkYXRlIHRvIGRhdGUgc2NoZW1hIGZpZWxkXG4gICAgICByZXR1cm4gdGhpcy5fZGJBZGFwdGVyLnVwZGF0ZUZpZWxkT3B0aW9ucyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSk7XG4gICAgfVxuXG4gICAgcmV0dXJuIHRoaXMuX2RiQWRhcHRlclxuICAgICAgLmFkZEZpZWxkSWZOb3RFeGlzdHMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IuY29kZSA9PSBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSkge1xuICAgICAgICAgIC8vIE1ha2Ugc3VyZSB0aGF0IHdlIHRocm93IGVycm9ycyB3aGVuIGl0IGlzIGFwcHJvcHJpYXRlIHRvIGRvIHNvLlxuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICAgIC8vIFRoZSB1cGRhdGUgZmFpbGVkLiBUaGlzIGNhbiBiZSBva2F5IC0gaXQgbWlnaHQgaGF2ZSBiZWVuIGEgcmFjZVxuICAgICAgICAvLyBjb25kaXRpb24gd2hlcmUgYW5vdGhlciBjbGllbnQgdXBkYXRlZCB0aGUgc2NoZW1hIGluIHRoZSBzYW1lXG4gICAgICAgIC8vIHdheSB0aGF0IHdlIHdhbnRlZCB0by4gU28sIGp1c3QgcmVsb2FkIHRoZSBzY2hlbWFcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfSlcbiAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgZmllbGROYW1lLFxuICAgICAgICAgIHR5cGUsXG4gICAgICAgIH07XG4gICAgICB9KTtcbiAgfVxuXG4gIGVuc3VyZUZpZWxkcyhmaWVsZHM6IGFueSkge1xuICAgIGZvciAobGV0IGkgPSAwOyBpIDwgZmllbGRzLmxlbmd0aDsgaSArPSAxKSB7XG4gICAgICBjb25zdCB7IGNsYXNzTmFtZSwgZmllbGROYW1lIH0gPSBmaWVsZHNbaV07XG4gICAgICBsZXQgeyB0eXBlIH0gPSBmaWVsZHNbaV07XG4gICAgICBjb25zdCBleHBlY3RlZFR5cGUgPSB0aGlzLmdldEV4cGVjdGVkVHlwZShjbGFzc05hbWUsIGZpZWxkTmFtZSk7XG4gICAgICBpZiAodHlwZW9mIHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgIHR5cGUgPSB7IHR5cGU6IHR5cGUgfTtcbiAgICAgIH1cbiAgICAgIGlmICghZXhwZWN0ZWRUeXBlIHx8ICFkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZShleHBlY3RlZFR5cGUsIHR5cGUpKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sIGBDb3VsZCBub3QgYWRkIGZpZWxkICR7ZmllbGROYW1lfWApO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIC8vIG1haW50YWluIGNvbXBhdGliaWxpdHlcbiAgZGVsZXRlRmllbGQoZmllbGROYW1lOiBzdHJpbmcsIGNsYXNzTmFtZTogc3RyaW5nLCBkYXRhYmFzZTogRGF0YWJhc2VDb250cm9sbGVyKSB7XG4gICAgcmV0dXJuIHRoaXMuZGVsZXRlRmllbGRzKFtmaWVsZE5hbWVdLCBjbGFzc05hbWUsIGRhdGFiYXNlKTtcbiAgfVxuXG4gIC8vIERlbGV0ZSBmaWVsZHMsIGFuZCByZW1vdmUgdGhhdCBkYXRhIGZyb20gYWxsIG9iamVjdHMuIFRoaXMgaXMgaW50ZW5kZWRcbiAgLy8gdG8gcmVtb3ZlIHVudXNlZCBmaWVsZHMsIGlmIG90aGVyIHdyaXRlcnMgYXJlIHdyaXRpbmcgb2JqZWN0cyB0aGF0IGluY2x1ZGVcbiAgLy8gdGhpcyBmaWVsZCwgdGhlIGZpZWxkIG1heSByZWFwcGVhci4gUmV0dXJucyBhIFByb21pc2UgdGhhdCByZXNvbHZlcyB3aXRoXG4gIC8vIG5vIG9iamVjdCBvbiBzdWNjZXNzLCBvciByZWplY3RzIHdpdGggeyBjb2RlLCBlcnJvciB9IG9uIGZhaWx1cmUuXG4gIC8vIFBhc3NpbmcgdGhlIGRhdGFiYXNlIGFuZCBwcmVmaXggaXMgbmVjZXNzYXJ5IGluIG9yZGVyIHRvIGRyb3AgcmVsYXRpb24gY29sbGVjdGlvbnNcbiAgLy8gYW5kIHJlbW92ZSBmaWVsZHMgZnJvbSBvYmplY3RzLiBJZGVhbGx5IHRoZSBkYXRhYmFzZSB3b3VsZCBiZWxvbmcgdG9cbiAgLy8gYSBkYXRhYmFzZSBhZGFwdGVyIGFuZCB0aGlzIGZ1bmN0aW9uIHdvdWxkIGNsb3NlIG92ZXIgaXQgb3IgYWNjZXNzIGl0IHZpYSBtZW1iZXIuXG4gIGRlbGV0ZUZpZWxkcyhmaWVsZE5hbWVzOiBBcnJheTxzdHJpbmc+LCBjbGFzc05hbWU6IHN0cmluZywgZGF0YWJhc2U6IERhdGFiYXNlQ29udHJvbGxlcikge1xuICAgIGlmICghY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWUpKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLCBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZShjbGFzc05hbWUpKTtcbiAgICB9XG5cbiAgICBmaWVsZE5hbWVzLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgIGlmICghZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsIGBpbnZhbGlkIGZpZWxkIG5hbWU6ICR7ZmllbGROYW1lfWApO1xuICAgICAgfVxuICAgICAgLy9Eb24ndCBhbGxvdyBkZWxldGluZyB0aGUgZGVmYXVsdCBmaWVsZHMuXG4gICAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyhmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDEzNiwgYGZpZWxkICR7ZmllbGROYW1lfSBjYW5ub3QgYmUgY2hhbmdlZGApO1xuICAgICAgfVxuICAgIH0pO1xuXG4gICAgcmV0dXJuIHRoaXMuZ2V0T25lU2NoZW1hKGNsYXNzTmFtZSwgZmFsc2UsIHsgY2xlYXJDYWNoZTogdHJ1ZSB9KVxuICAgICAgLmNhdGNoKGVycm9yID0+IHtcbiAgICAgICAgaWYgKGVycm9yID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsXG4gICAgICAgICAgICBgQ2xhc3MgJHtjbGFzc05hbWV9IGRvZXMgbm90IGV4aXN0LmBcbiAgICAgICAgICApO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHRocm93IGVycm9yO1xuICAgICAgICB9XG4gICAgICB9KVxuICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgZmllbGROYW1lcy5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgaWYgKCFzY2hlbWEuZmllbGRzW2ZpZWxkTmFtZV0pIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigyNTUsIGBGaWVsZCAke2ZpZWxkTmFtZX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBkZWxldGUuYCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBjb25zdCBzY2hlbWFGaWVsZHMgPSB7IC4uLnNjaGVtYS5maWVsZHMgfTtcbiAgICAgICAgcmV0dXJuIGRhdGFiYXNlLmFkYXB0ZXIuZGVsZXRlRmllbGRzKGNsYXNzTmFtZSwgc2NoZW1hLCBmaWVsZE5hbWVzKS50aGVuKCgpID0+IHtcbiAgICAgICAgICByZXR1cm4gUHJvbWlzZS5hbGwoXG4gICAgICAgICAgICBmaWVsZE5hbWVzLm1hcChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBmaWVsZCA9IHNjaGVtYUZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgICAgICAgICBpZiAoZmllbGQgJiYgZmllbGQudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAgICAgICAgIC8vRm9yIHJlbGF0aW9ucywgZHJvcCB0aGUgX0pvaW4gdGFibGVcbiAgICAgICAgICAgICAgICByZXR1cm4gZGF0YWJhc2UuYWRhcHRlci5kZWxldGVDbGFzcyhgX0pvaW46JHtmaWVsZE5hbWV9OiR7Y2xhc3NOYW1lfWApO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgKTtcbiAgICAgICAgfSk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICBTY2hlbWFDYWNoZS5jbGVhcigpO1xuICAgICAgfSk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZXMgYW4gb2JqZWN0IHByb3ZpZGVkIGluIFJFU1QgZm9ybWF0LlxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHRvIHRoZSBuZXcgc2NoZW1hIGlmIHRoaXMgb2JqZWN0IGlzXG4gIC8vIHZhbGlkLlxuICBhc3luYyB2YWxpZGF0ZU9iamVjdChjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0OiBhbnksIHF1ZXJ5OiBhbnkpIHtcbiAgICBsZXQgZ2VvY291bnQgPSAwO1xuICAgIGNvbnN0IHNjaGVtYSA9IGF3YWl0IHRoaXMuZW5mb3JjZUNsYXNzRXhpc3RzKGNsYXNzTmFtZSk7XG4gICAgY29uc3QgcHJvbWlzZXMgPSBbXTtcblxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIG9iamVjdCkge1xuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdICYmIGdldFR5cGUob2JqZWN0W2ZpZWxkTmFtZV0pID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIGdlb2NvdW50Kys7XG4gICAgICB9XG4gICAgICBpZiAoZ2VvY291bnQgPiAxKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICAgICd0aGVyZSBjYW4gb25seSBiZSBvbmUgZ2VvcG9pbnQgZmllbGQgaW4gYSBjbGFzcydcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIG9iamVjdCkge1xuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBleHBlY3RlZCA9IGdldFR5cGUob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgaWYgKCFleHBlY3RlZCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZE5hbWUgPT09ICdBQ0wnKSB7XG4gICAgICAgIC8vIEV2ZXJ5IG9iamVjdCBoYXMgQUNMIGltcGxpY2l0bHkuXG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgcHJvbWlzZXMucHVzaChzY2hlbWEuZW5mb3JjZUZpZWxkRXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCBleHBlY3RlZCwgdHJ1ZSkpO1xuICAgIH1cbiAgICBjb25zdCByZXN1bHRzID0gYXdhaXQgUHJvbWlzZS5hbGwocHJvbWlzZXMpO1xuICAgIGNvbnN0IGVuZm9yY2VGaWVsZHMgPSByZXN1bHRzLmZpbHRlcihyZXN1bHQgPT4gISFyZXN1bHQpO1xuXG4gICAgaWYgKGVuZm9yY2VGaWVsZHMubGVuZ3RoICE9PSAwKSB7XG4gICAgICAvLyBUT0RPOiBSZW1vdmUgYnkgdXBkYXRpbmcgc2NoZW1hIGNhY2hlIGRpcmVjdGx5XG4gICAgICBhd2FpdCB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgIH1cbiAgICB0aGlzLmVuc3VyZUZpZWxkcyhlbmZvcmNlRmllbGRzKTtcblxuICAgIGNvbnN0IHByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoc2NoZW1hKTtcbiAgICByZXR1cm4gdGhlblZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zKHByb21pc2UsIGNsYXNzTmFtZSwgb2JqZWN0LCBxdWVyeSk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZXMgdGhhdCBhbGwgdGhlIHByb3BlcnRpZXMgYXJlIHNldCBmb3IgdGhlIG9iamVjdFxuICB2YWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyhjbGFzc05hbWU6IHN0cmluZywgb2JqZWN0OiBhbnksIHF1ZXJ5OiBhbnkpIHtcbiAgICBjb25zdCBjb2x1bW5zID0gcmVxdWlyZWRDb2x1bW5zLndyaXRlW2NsYXNzTmFtZV07XG4gICAgaWYgKCFjb2x1bW5zIHx8IGNvbHVtbnMubGVuZ3RoID09IDApIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcyk7XG4gICAgfVxuXG4gICAgY29uc3QgbWlzc2luZ0NvbHVtbnMgPSBjb2x1bW5zLmZpbHRlcihmdW5jdGlvbiAoY29sdW1uKSB7XG4gICAgICBpZiAocXVlcnkgJiYgcXVlcnkub2JqZWN0SWQpIHtcbiAgICAgICAgaWYgKG9iamVjdFtjb2x1bW5dICYmIHR5cGVvZiBvYmplY3RbY29sdW1uXSA9PT0gJ29iamVjdCcpIHtcbiAgICAgICAgICAvLyBUcnlpbmcgdG8gZGVsZXRlIGEgcmVxdWlyZWQgY29sdW1uXG4gICAgICAgICAgcmV0dXJuIG9iamVjdFtjb2x1bW5dLl9fb3AgPT0gJ0RlbGV0ZSc7XG4gICAgICAgIH1cbiAgICAgICAgLy8gTm90IHRyeWluZyB0byBkbyBhbnl0aGluZyB0aGVyZVxuICAgICAgICByZXR1cm4gZmFsc2U7XG4gICAgICB9XG4gICAgICByZXR1cm4gIW9iamVjdFtjb2x1bW5dO1xuICAgIH0pO1xuXG4gICAgaWYgKG1pc3NpbmdDb2x1bW5zLmxlbmd0aCA+IDApIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSwgbWlzc2luZ0NvbHVtbnNbMF0gKyAnIGlzIHJlcXVpcmVkLicpO1xuICAgIH1cbiAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMpO1xuICB9XG5cbiAgdGVzdFBlcm1pc3Npb25zRm9yQ2xhc3NOYW1lKGNsYXNzTmFtZTogc3RyaW5nLCBhY2xHcm91cDogc3RyaW5nW10sIG9wZXJhdGlvbjogc3RyaW5nKSB7XG4gICAgcmV0dXJuIFNjaGVtYUNvbnRyb2xsZXIudGVzdFBlcm1pc3Npb25zKFxuICAgICAgdGhpcy5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKSxcbiAgICAgIGFjbEdyb3VwLFxuICAgICAgb3BlcmF0aW9uXG4gICAgKTtcbiAgfVxuXG4gIC8vIFRlc3RzIHRoYXQgdGhlIGNsYXNzIGxldmVsIHBlcm1pc3Npb24gbGV0IHBhc3MgdGhlIG9wZXJhdGlvbiBmb3IgYSBnaXZlbiBhY2xHcm91cFxuICBzdGF0aWMgdGVzdFBlcm1pc3Npb25zKGNsYXNzUGVybWlzc2lvbnM6ID9hbnksIGFjbEdyb3VwOiBzdHJpbmdbXSwgb3BlcmF0aW9uOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgICBpZiAoIWNsYXNzUGVybWlzc2lvbnMgfHwgIWNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGNvbnN0IHBlcm1zID0gY2xhc3NQZXJtaXNzaW9uc1tvcGVyYXRpb25dO1xuICAgIGlmIChwZXJtc1snKiddKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgLy8gQ2hlY2sgcGVybWlzc2lvbnMgYWdhaW5zdCB0aGUgYWNsR3JvdXAgcHJvdmlkZWQgKGFycmF5IG9mIHVzZXJJZC9yb2xlcylcbiAgICBpZiAoXG4gICAgICBhY2xHcm91cC5zb21lKGFjbCA9PiB7XG4gICAgICAgIHJldHVybiBwZXJtc1thY2xdID09PSB0cnVlO1xuICAgICAgfSlcbiAgICApIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cblxuICAvLyBWYWxpZGF0ZXMgYW4gb3BlcmF0aW9uIHBhc3NlcyBjbGFzcy1sZXZlbC1wZXJtaXNzaW9ucyBzZXQgaW4gdGhlIHNjaGVtYVxuICBzdGF0aWMgdmFsaWRhdGVQZXJtaXNzaW9uKFxuICAgIGNsYXNzUGVybWlzc2lvbnM6ID9hbnksXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgYWNsR3JvdXA6IHN0cmluZ1tdLFxuICAgIG9wZXJhdGlvbjogc3RyaW5nLFxuICAgIGFjdGlvbj86IHN0cmluZ1xuICApIHtcbiAgICBpZiAoU2NoZW1hQ29udHJvbGxlci50ZXN0UGVybWlzc2lvbnMoY2xhc3NQZXJtaXNzaW9ucywgYWNsR3JvdXAsIG9wZXJhdGlvbikpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG5cbiAgICBpZiAoIWNsYXNzUGVybWlzc2lvbnMgfHwgIWNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIGNvbnN0IHBlcm1zID0gY2xhc3NQZXJtaXNzaW9uc1tvcGVyYXRpb25dO1xuICAgIC8vIElmIG9ubHkgZm9yIGF1dGhlbnRpY2F0ZWQgdXNlcnNcbiAgICAvLyBtYWtlIHN1cmUgd2UgaGF2ZSBhbiBhY2xHcm91cFxuICAgIGlmIChwZXJtc1sncmVxdWlyZXNBdXRoZW50aWNhdGlvbiddKSB7XG4gICAgICAvLyBJZiBhY2xHcm91cCBoYXMgKiAocHVibGljKVxuICAgICAgaWYgKCFhY2xHcm91cCB8fCBhY2xHcm91cC5sZW5ndGggPT0gMCkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAnUGVybWlzc2lvbiBkZW5pZWQsIHVzZXIgbmVlZHMgdG8gYmUgYXV0aGVudGljYXRlZC4nXG4gICAgICAgICk7XG4gICAgICB9IGVsc2UgaWYgKGFjbEdyb3VwLmluZGV4T2YoJyonKSA+IC0xICYmIGFjbEdyb3VwLmxlbmd0aCA9PSAxKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICdQZXJtaXNzaW9uIGRlbmllZCwgdXNlciBuZWVkcyB0byBiZSBhdXRoZW50aWNhdGVkLidcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICAgIC8vIHJlcXVpcmVzQXV0aGVudGljYXRpb24gcGFzc2VkLCBqdXN0IG1vdmUgZm9yd2FyZFxuICAgICAgLy8gcHJvYmFibHkgd291bGQgYmUgd2lzZSBhdCBzb21lIHBvaW50IHRvIHJlbmFtZSB0byAnYXV0aGVudGljYXRlZFVzZXInXG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuXG4gICAgLy8gTm8gbWF0Y2hpbmcgQ0xQLCBsZXQncyBjaGVjayB0aGUgUG9pbnRlciBwZXJtaXNzaW9uc1xuICAgIC8vIEFuZCBoYW5kbGUgdGhvc2UgbGF0ZXJcbiAgICBjb25zdCBwZXJtaXNzaW9uRmllbGQgPVxuICAgICAgWydnZXQnLCAnZmluZCcsICdjb3VudCddLmluZGV4T2Yob3BlcmF0aW9uKSA+IC0xID8gJ3JlYWRVc2VyRmllbGRzJyA6ICd3cml0ZVVzZXJGaWVsZHMnO1xuXG4gICAgLy8gUmVqZWN0IGNyZWF0ZSB3aGVuIHdyaXRlIGxvY2tkb3duXG4gICAgaWYgKHBlcm1pc3Npb25GaWVsZCA9PSAnd3JpdGVVc2VyRmllbGRzJyAmJiBvcGVyYXRpb24gPT0gJ2NyZWF0ZScpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgICAgYFBlcm1pc3Npb24gZGVuaWVkIGZvciBhY3Rpb24gJHtvcGVyYXRpb259IG9uIGNsYXNzICR7Y2xhc3NOYW1lfS5gXG4gICAgICApO1xuICAgIH1cblxuICAgIC8vIFByb2Nlc3MgdGhlIHJlYWRVc2VyRmllbGRzIGxhdGVyXG4gICAgaWYgKFxuICAgICAgQXJyYXkuaXNBcnJheShjbGFzc1Blcm1pc3Npb25zW3Blcm1pc3Npb25GaWVsZF0pICYmXG4gICAgICBjbGFzc1Blcm1pc3Npb25zW3Blcm1pc3Npb25GaWVsZF0ubGVuZ3RoID4gMFxuICAgICkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cblxuICAgIGNvbnN0IHBvaW50ZXJGaWVsZHMgPSBjbGFzc1Blcm1pc3Npb25zW29wZXJhdGlvbl0ucG9pbnRlckZpZWxkcztcbiAgICBpZiAoQXJyYXkuaXNBcnJheShwb2ludGVyRmllbGRzKSAmJiBwb2ludGVyRmllbGRzLmxlbmd0aCA+IDApIHtcbiAgICAgIC8vIGFueSBvcCBleGNlcHQgJ2FkZEZpZWxkIGFzIHBhcnQgb2YgY3JlYXRlJyBpcyBvay5cbiAgICAgIGlmIChvcGVyYXRpb24gIT09ICdhZGRGaWVsZCcgfHwgYWN0aW9uID09PSAndXBkYXRlJykge1xuICAgICAgICAvLyBXZSBjYW4gYWxsb3cgYWRkaW5nIGZpZWxkIG9uIHVwZGF0ZSBmbG93IG9ubHkuXG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgYFBlcm1pc3Npb24gZGVuaWVkIGZvciBhY3Rpb24gJHtvcGVyYXRpb259IG9uIGNsYXNzICR7Y2xhc3NOYW1lfS5gXG4gICAgKTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlcyBhbiBvcGVyYXRpb24gcGFzc2VzIGNsYXNzLWxldmVsLXBlcm1pc3Npb25zIHNldCBpbiB0aGUgc2NoZW1hXG4gIHZhbGlkYXRlUGVybWlzc2lvbihjbGFzc05hbWU6IHN0cmluZywgYWNsR3JvdXA6IHN0cmluZ1tdLCBvcGVyYXRpb246IHN0cmluZywgYWN0aW9uPzogc3RyaW5nKSB7XG4gICAgcmV0dXJuIFNjaGVtYUNvbnRyb2xsZXIudmFsaWRhdGVQZXJtaXNzaW9uKFxuICAgICAgdGhpcy5nZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lKSxcbiAgICAgIGNsYXNzTmFtZSxcbiAgICAgIGFjbEdyb3VwLFxuICAgICAgb3BlcmF0aW9uLFxuICAgICAgYWN0aW9uXG4gICAgKTtcbiAgfVxuXG4gIGdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWU6IHN0cmluZyk6IGFueSB7XG4gICAgcmV0dXJuIHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdICYmIHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgfVxuXG4gIC8vIFJldHVybnMgdGhlIGV4cGVjdGVkIHR5cGUgZm9yIGEgY2xhc3NOYW1lK2tleSBjb21iaW5hdGlvblxuICAvLyBvciB1bmRlZmluZWQgaWYgdGhlIHNjaGVtYSBpcyBub3Qgc2V0XG4gIGdldEV4cGVjdGVkVHlwZShjbGFzc05hbWU6IHN0cmluZywgZmllbGROYW1lOiBzdHJpbmcpOiA/KFNjaGVtYUZpZWxkIHwgc3RyaW5nKSB7XG4gICAgaWYgKHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICBjb25zdCBleHBlY3RlZFR5cGUgPSB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXS5maWVsZHNbZmllbGROYW1lXTtcbiAgICAgIHJldHVybiBleHBlY3RlZFR5cGUgPT09ICdtYXAnID8gJ09iamVjdCcgOiBleHBlY3RlZFR5cGU7XG4gICAgfVxuICAgIHJldHVybiB1bmRlZmluZWQ7XG4gIH1cblxuICAvLyBDaGVja3MgaWYgYSBnaXZlbiBjbGFzcyBpcyBpbiB0aGUgc2NoZW1hLlxuICBoYXNDbGFzcyhjbGFzc05hbWU6IHN0cmluZykge1xuICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0cnVlKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMucmVsb2FkRGF0YSgpLnRoZW4oKCkgPT4gISF0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSk7XG4gIH1cbn1cblxuLy8gUmV0dXJucyBhIHByb21pc2UgZm9yIGEgbmV3IFNjaGVtYS5cbmNvbnN0IGxvYWQgPSAoZGJBZGFwdGVyOiBTdG9yYWdlQWRhcHRlciwgb3B0aW9uczogYW55KTogUHJvbWlzZTxTY2hlbWFDb250cm9sbGVyPiA9PiB7XG4gIGNvbnN0IHNjaGVtYSA9IG5ldyBTY2hlbWFDb250cm9sbGVyKGRiQWRhcHRlcik7XG4gIHJldHVybiBzY2hlbWEucmVsb2FkRGF0YShvcHRpb25zKS50aGVuKCgpID0+IHNjaGVtYSk7XG59O1xuXG4vLyBCdWlsZHMgYSBuZXcgc2NoZW1hIChpbiBzY2hlbWEgQVBJIHJlc3BvbnNlIGZvcm1hdCkgb3V0IG9mIGFuXG4vLyBleGlzdGluZyBtb25nbyBzY2hlbWEgKyBhIHNjaGVtYXMgQVBJIHB1dCByZXF1ZXN0LiBUaGlzIHJlc3BvbnNlXG4vLyBkb2VzIG5vdCBpbmNsdWRlIHRoZSBkZWZhdWx0IGZpZWxkcywgYXMgaXQgaXMgaW50ZW5kZWQgdG8gYmUgcGFzc2VkXG4vLyB0byBtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWUuIE5vIHZhbGlkYXRpb24gaXMgZG9uZSBoZXJlLCBpdFxuLy8gaXMgZG9uZSBpbiBtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWUuXG5mdW5jdGlvbiBidWlsZE1lcmdlZFNjaGVtYU9iamVjdChleGlzdGluZ0ZpZWxkczogU2NoZW1hRmllbGRzLCBwdXRSZXF1ZXN0OiBhbnkpOiBTY2hlbWFGaWVsZHMge1xuICBjb25zdCBuZXdTY2hlbWEgPSB7fTtcbiAgLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG4gIGNvbnN0IHN5c1NjaGVtYUZpZWxkID1cbiAgICBPYmplY3Qua2V5cyhkZWZhdWx0Q29sdW1ucykuaW5kZXhPZihleGlzdGluZ0ZpZWxkcy5faWQpID09PSAtMVxuICAgICAgPyBbXVxuICAgICAgOiBPYmplY3Qua2V5cyhkZWZhdWx0Q29sdW1uc1tleGlzdGluZ0ZpZWxkcy5faWRdKTtcbiAgZm9yIChjb25zdCBvbGRGaWVsZCBpbiBleGlzdGluZ0ZpZWxkcykge1xuICAgIGlmIChcbiAgICAgIG9sZEZpZWxkICE9PSAnX2lkJyAmJlxuICAgICAgb2xkRmllbGQgIT09ICdBQ0wnICYmXG4gICAgICBvbGRGaWVsZCAhPT0gJ3VwZGF0ZWRBdCcgJiZcbiAgICAgIG9sZEZpZWxkICE9PSAnY3JlYXRlZEF0JyAmJlxuICAgICAgb2xkRmllbGQgIT09ICdvYmplY3RJZCdcbiAgICApIHtcbiAgICAgIGlmIChzeXNTY2hlbWFGaWVsZC5sZW5ndGggPiAwICYmIHN5c1NjaGVtYUZpZWxkLmluZGV4T2Yob2xkRmllbGQpICE9PSAtMSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGZpZWxkSXNEZWxldGVkID0gcHV0UmVxdWVzdFtvbGRGaWVsZF0gJiYgcHV0UmVxdWVzdFtvbGRGaWVsZF0uX19vcCA9PT0gJ0RlbGV0ZSc7XG4gICAgICBpZiAoIWZpZWxkSXNEZWxldGVkKSB7XG4gICAgICAgIG5ld1NjaGVtYVtvbGRGaWVsZF0gPSBleGlzdGluZ0ZpZWxkc1tvbGRGaWVsZF07XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGZvciAoY29uc3QgbmV3RmllbGQgaW4gcHV0UmVxdWVzdCkge1xuICAgIGlmIChuZXdGaWVsZCAhPT0gJ29iamVjdElkJyAmJiBwdXRSZXF1ZXN0W25ld0ZpZWxkXS5fX29wICE9PSAnRGVsZXRlJykge1xuICAgICAgaWYgKHN5c1NjaGVtYUZpZWxkLmxlbmd0aCA+IDAgJiYgc3lzU2NoZW1hRmllbGQuaW5kZXhPZihuZXdGaWVsZCkgIT09IC0xKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgbmV3U2NoZW1hW25ld0ZpZWxkXSA9IHB1dFJlcXVlc3RbbmV3RmllbGRdO1xuICAgIH1cbiAgfVxuICByZXR1cm4gbmV3U2NoZW1hO1xufVxuXG4vLyBHaXZlbiBhIHNjaGVtYSBwcm9taXNlLCBjb25zdHJ1Y3QgYW5vdGhlciBzY2hlbWEgcHJvbWlzZSB0aGF0XG4vLyB2YWxpZGF0ZXMgdGhpcyBmaWVsZCBvbmNlIHRoZSBzY2hlbWEgbG9hZHMuXG5mdW5jdGlvbiB0aGVuVmFsaWRhdGVSZXF1aXJlZENvbHVtbnMoc2NoZW1hUHJvbWlzZSwgY2xhc3NOYW1lLCBvYmplY3QsIHF1ZXJ5KSB7XG4gIHJldHVybiBzY2hlbWFQcm9taXNlLnRoZW4oc2NoZW1hID0+IHtcbiAgICByZXR1cm4gc2NoZW1hLnZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zKGNsYXNzTmFtZSwgb2JqZWN0LCBxdWVyeSk7XG4gIH0pO1xufVxuXG4vLyBHZXRzIHRoZSB0eXBlIGZyb20gYSBSRVNUIEFQSSBmb3JtYXR0ZWQgb2JqZWN0LCB3aGVyZSAndHlwZScgaXNcbi8vIGV4dGVuZGVkIHBhc3QgamF2YXNjcmlwdCB0eXBlcyB0byBpbmNsdWRlIHRoZSByZXN0IG9mIHRoZSBQYXJzZVxuLy8gdHlwZSBzeXN0ZW0uXG4vLyBUaGUgb3V0cHV0IHNob3VsZCBiZSBhIHZhbGlkIHNjaGVtYSB2YWx1ZS5cbi8vIFRPRE86IGVuc3VyZSB0aGF0IHRoaXMgaXMgY29tcGF0aWJsZSB3aXRoIHRoZSBmb3JtYXQgdXNlZCBpbiBPcGVuIERCXG5mdW5jdGlvbiBnZXRUeXBlKG9iajogYW55KTogPyhTY2hlbWFGaWVsZCB8IHN0cmluZykge1xuICBjb25zdCB0eXBlID0gdHlwZW9mIG9iajtcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4gJ0Jvb2xlYW4nO1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICByZXR1cm4gJ1N0cmluZyc7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiAnTnVtYmVyJztcbiAgICBjYXNlICdtYXAnOlxuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICBpZiAoIW9iaikge1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGdldE9iamVjdFR5cGUob2JqKTtcbiAgICBjYXNlICdmdW5jdGlvbic6XG4gICAgY2FzZSAnc3ltYm9sJzpcbiAgICBjYXNlICd1bmRlZmluZWQnOlxuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyAnYmFkIG9iajogJyArIG9iajtcbiAgfVxufVxuXG4vLyBUaGlzIGdldHMgdGhlIHR5cGUgZm9yIG5vbi1KU09OIHR5cGVzIGxpa2UgcG9pbnRlcnMgYW5kIGZpbGVzLCBidXRcbi8vIGFsc28gZ2V0cyB0aGUgYXBwcm9wcmlhdGUgdHlwZSBmb3IgJCBvcGVyYXRvcnMuXG4vLyBSZXR1cm5zIG51bGwgaWYgdGhlIHR5cGUgaXMgdW5rbm93bi5cbmZ1bmN0aW9uIGdldE9iamVjdFR5cGUob2JqKTogPyhTY2hlbWFGaWVsZCB8IHN0cmluZykge1xuICBpZiAob2JqIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICByZXR1cm4gJ0FycmF5JztcbiAgfVxuICBpZiAob2JqLl9fdHlwZSkge1xuICAgIHN3aXRjaCAob2JqLl9fdHlwZSkge1xuICAgICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICAgIGlmIChvYmouY2xhc3NOYW1lKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHR5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgIHRhcmdldENsYXNzOiBvYmouY2xhc3NOYW1lLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdSZWxhdGlvbic6XG4gICAgICAgIGlmIChvYmouY2xhc3NOYW1lKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHR5cGU6ICdSZWxhdGlvbicsXG4gICAgICAgICAgICB0YXJnZXRDbGFzczogb2JqLmNsYXNzTmFtZSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnRmlsZSc6XG4gICAgICAgIGlmIChvYmoubmFtZSkge1xuICAgICAgICAgIHJldHVybiAnRmlsZSc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdEYXRlJzpcbiAgICAgICAgaWYgKG9iai5pc28pIHtcbiAgICAgICAgICByZXR1cm4gJ0RhdGUnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgICBpZiAob2JqLmxhdGl0dWRlICE9IG51bGwgJiYgb2JqLmxvbmdpdHVkZSAhPSBudWxsKSB7XG4gICAgICAgICAgcmV0dXJuICdHZW9Qb2ludCc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdCeXRlcyc6XG4gICAgICAgIGlmIChvYmouYmFzZTY0KSB7XG4gICAgICAgICAgcmV0dXJuICdCeXRlcyc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgICAgaWYgKG9iai5jb29yZGluYXRlcykge1xuICAgICAgICAgIHJldHVybiAnUG9seWdvbic7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSwgJ1RoaXMgaXMgbm90IGEgdmFsaWQgJyArIG9iai5fX3R5cGUpO1xuICB9XG4gIGlmIChvYmpbJyRuZSddKSB7XG4gICAgcmV0dXJuIGdldE9iamVjdFR5cGUob2JqWyckbmUnXSk7XG4gIH1cbiAgaWYgKG9iai5fX29wKSB7XG4gICAgc3dpdGNoIChvYmouX19vcCkge1xuICAgICAgY2FzZSAnSW5jcmVtZW50JzpcbiAgICAgICAgcmV0dXJuICdOdW1iZXInO1xuICAgICAgY2FzZSAnRGVsZXRlJzpcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICBjYXNlICdBZGQnOlxuICAgICAgY2FzZSAnQWRkVW5pcXVlJzpcbiAgICAgIGNhc2UgJ1JlbW92ZSc6XG4gICAgICAgIHJldHVybiAnQXJyYXknO1xuICAgICAgY2FzZSAnQWRkUmVsYXRpb24nOlxuICAgICAgY2FzZSAnUmVtb3ZlUmVsYXRpb24nOlxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHR5cGU6ICdSZWxhdGlvbicsXG4gICAgICAgICAgdGFyZ2V0Q2xhc3M6IG9iai5vYmplY3RzWzBdLmNsYXNzTmFtZSxcbiAgICAgICAgfTtcbiAgICAgIGNhc2UgJ0JhdGNoJzpcbiAgICAgICAgcmV0dXJuIGdldE9iamVjdFR5cGUob2JqLm9wc1swXSk7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyAndW5leHBlY3RlZCBvcDogJyArIG9iai5fX29wO1xuICAgIH1cbiAgfVxuICByZXR1cm4gJ09iamVjdCc7XG59XG5cbmV4cG9ydCB7XG4gIGxvYWQsXG4gIGNsYXNzTmFtZUlzVmFsaWQsXG4gIGZpZWxkTmFtZUlzVmFsaWQsXG4gIGludmFsaWRDbGFzc05hbWVNZXNzYWdlLFxuICBidWlsZE1lcmdlZFNjaGVtYU9iamVjdCxcbiAgc3lzdGVtQ2xhc3NlcyxcbiAgZGVmYXVsdENvbHVtbnMsXG4gIGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEsXG4gIFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMsXG4gIFNjaGVtYUNvbnRyb2xsZXIsXG4gIHJlcXVpcmVkQ29sdW1ucyxcbn07XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7OztBQWtCQTtBQUNBO0FBQ0E7QUFDQTtBQUVBO0FBQWdDO0FBQUE7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUFBO0FBdEJoQztBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU1BLEtBQUssR0FBR0MsT0FBTyxDQUFDLFlBQVksQ0FBQyxDQUFDRCxLQUFLO0FBZXpDLE1BQU1FLGNBQTBDLEdBQUdDLE1BQU0sQ0FBQ0MsTUFBTSxDQUFDO0VBQy9EO0VBQ0FDLFFBQVEsRUFBRTtJQUNSQyxRQUFRLEVBQUU7TUFBRUMsSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUM1QkMsU0FBUyxFQUFFO01BQUVELElBQUksRUFBRTtJQUFPLENBQUM7SUFDM0JFLFNBQVMsRUFBRTtNQUFFRixJQUFJLEVBQUU7SUFBTyxDQUFDO0lBQzNCRyxHQUFHLEVBQUU7TUFBRUgsSUFBSSxFQUFFO0lBQU07RUFDckIsQ0FBQztFQUNEO0VBQ0FJLEtBQUssRUFBRTtJQUNMQyxRQUFRLEVBQUU7TUFBRUwsSUFBSSxFQUFFO0lBQVMsQ0FBQztJQUM1Qk0sUUFBUSxFQUFFO01BQUVOLElBQUksRUFBRTtJQUFTLENBQUM7SUFDNUJPLEtBQUssRUFBRTtNQUFFUCxJQUFJLEVBQUU7SUFBUyxDQUFD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