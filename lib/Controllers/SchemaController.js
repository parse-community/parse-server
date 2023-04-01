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

// -disable-next

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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfU3RvcmFnZUFkYXB0ZXIiLCJyZXF1aXJlIiwiX1NjaGVtYUNhY2hlIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9EYXRhYmFzZUNvbnRyb2xsZXIiLCJfQ29uZmlnIiwiX2RlZXBjb3B5Iiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJvd25LZXlzIiwib2JqZWN0IiwiZW51bWVyYWJsZU9ubHkiLCJrZXlzIiwiT2JqZWN0IiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwic3ltYm9scyIsImZpbHRlciIsInN5bSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwidGFyZ2V0IiwiaSIsImFyZ3VtZW50cyIsImxlbmd0aCIsInNvdXJjZSIsImZvckVhY2giLCJrZXkiLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiYXJnIiwiX3RvUHJpbWl0aXZlIiwiU3RyaW5nIiwiaW5wdXQiLCJoaW50IiwicHJpbSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwidW5kZWZpbmVkIiwicmVzIiwiY2FsbCIsIlR5cGVFcnJvciIsIk51bWJlciIsIl9leHRlbmRzIiwiYXNzaWduIiwiYmluZCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiUGFyc2UiLCJkZWZhdWx0Q29sdW1ucyIsImZyZWV6ZSIsIl9EZWZhdWx0Iiwib2JqZWN0SWQiLCJ0eXBlIiwiY3JlYXRlZEF0IiwidXBkYXRlZEF0IiwiQUNMIiwiX1VzZXIiLCJ1c2VybmFtZSIsInBhc3N3b3JkIiwiZW1haWwiLCJlbWFpbFZlcmlmaWVkIiwiYXV0aERhdGEiLCJfSW5zdGFsbGF0aW9uIiwiaW5zdGFsbGF0aW9uSWQiLCJkZXZpY2VUb2tlbiIsImNoYW5uZWxzIiwiZGV2aWNlVHlwZSIsInB1c2hUeXBlIiwiR0NNU2VuZGVySWQiLCJ0aW1lWm9uZSIsImxvY2FsZUlkZW50aWZpZXIiLCJiYWRnZSIsImFwcFZlcnNpb24iLCJhcHBOYW1lIiwiYXBwSWRlbnRpZmllciIsInBhcnNlVmVyc2lvbiIsIl9Sb2xlIiwibmFtZSIsInVzZXJzIiwidGFyZ2V0Q2xhc3MiLCJyb2xlcyIsIl9TZXNzaW9uIiwidXNlciIsInNlc3Npb25Ub2tlbiIsImV4cGlyZXNBdCIsImNyZWF0ZWRXaXRoIiwiX1Byb2R1Y3QiLCJwcm9kdWN0SWRlbnRpZmllciIsImRvd25sb2FkIiwiZG93bmxvYWROYW1lIiwiaWNvbiIsIm9yZGVyIiwidGl0bGUiLCJzdWJ0aXRsZSIsIl9QdXNoU3RhdHVzIiwicHVzaFRpbWUiLCJxdWVyeSIsInBheWxvYWQiLCJleHBpcnkiLCJleHBpcmF0aW9uX2ludGVydmFsIiwic3RhdHVzIiwibnVtU2VudCIsIm51bUZhaWxlZCIsInB1c2hIYXNoIiwiZXJyb3JNZXNzYWdlIiwic2VudFBlclR5cGUiLCJmYWlsZWRQZXJUeXBlIiwic2VudFBlclVUQ09mZnNldCIsImZhaWxlZFBlclVUQ09mZnNldCIsImNvdW50IiwiX0pvYlN0YXR1cyIsImpvYk5hbWUiLCJtZXNzYWdlIiwicGFyYW1zIiwiZmluaXNoZWRBdCIsIl9Kb2JTY2hlZHVsZSIsImRlc2NyaXB0aW9uIiwic3RhcnRBZnRlciIsImRheXNPZldlZWsiLCJ0aW1lT2ZEYXkiLCJsYXN0UnVuIiwicmVwZWF0TWludXRlcyIsIl9Ib29rcyIsImZ1bmN0aW9uTmFtZSIsImNsYXNzTmFtZSIsInRyaWdnZXJOYW1lIiwidXJsIiwiX0dsb2JhbENvbmZpZyIsIm1hc3RlcktleU9ubHkiLCJfR3JhcGhRTENvbmZpZyIsImNvbmZpZyIsIl9BdWRpZW5jZSIsImxhc3RVc2VkIiwidGltZXNVc2VkIiwiX0lkZW1wb3RlbmN5IiwicmVxSWQiLCJleHBpcmUiLCJleHBvcnRzIiwicmVxdWlyZWRDb2x1bW5zIiwicmVhZCIsIndyaXRlIiwiaW52YWxpZENvbHVtbnMiLCJzeXN0ZW1DbGFzc2VzIiwidm9sYXRpbGVDbGFzc2VzIiwicm9sZVJlZ2V4IiwicHJvdGVjdGVkRmllbGRzUG9pbnRlclJlZ2V4IiwicHVibGljUmVnZXgiLCJhdXRoZW50aWNhdGVkUmVnZXgiLCJyZXF1aXJlc0F1dGhlbnRpY2F0aW9uUmVnZXgiLCJjbHBQb2ludGVyUmVnZXgiLCJwcm90ZWN0ZWRGaWVsZHNSZWdleCIsImNscEZpZWxkc1JlZ2V4IiwidmFsaWRhdGVQZXJtaXNzaW9uS2V5IiwidXNlcklkUmVnRXhwIiwibWF0Y2hlc1NvbWUiLCJyZWdFeCIsIm1hdGNoIiwidmFsaWQiLCJFcnJvciIsIklOVkFMSURfSlNPTiIsInZhbGlkYXRlUHJvdGVjdGVkRmllbGRzS2V5IiwiQ0xQVmFsaWRLZXlzIiwidmFsaWRhdGVDTFAiLCJwZXJtcyIsImZpZWxkcyIsIm9wZXJhdGlvbktleSIsImluZGV4T2YiLCJvcGVyYXRpb24iLCJ2YWxpZGF0ZUNMUGpzb24iLCJmaWVsZE5hbWUiLCJ2YWxpZGF0ZVBvaW50ZXJQZXJtaXNzaW9uIiwiZW50aXR5IiwicHJvdGVjdGVkRmllbGRzIiwiQXJyYXkiLCJpc0FycmF5IiwiZmllbGQiLCJwb2ludGVyRmllbGRzIiwicG9pbnRlckZpZWxkIiwicGVybWl0Iiwiam9pbkNsYXNzUmVnZXgiLCJjbGFzc0FuZEZpZWxkUmVnZXgiLCJjbGFzc05hbWVJc1ZhbGlkIiwidGVzdCIsImZpZWxkTmFtZUlzVmFsaWQiLCJpbmNsdWRlcyIsImZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyIsImludmFsaWRDbGFzc05hbWVNZXNzYWdlIiwiaW52YWxpZEpzb25FcnJvciIsInZhbGlkTm9uUmVsYXRpb25PclBvaW50ZXJUeXBlcyIsImZpZWxkVHlwZUlzSW52YWxpZCIsIklOVkFMSURfQ0xBU1NfTkFNRSIsIklOQ09SUkVDVF9UWVBFIiwiY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSIsInNjaGVtYSIsImluamVjdERlZmF1bHRTY2hlbWEiLCJfcnBlcm0iLCJfd3Blcm0iLCJfaGFzaGVkX3Bhc3N3b3JkIiwiY29udmVydEFkYXB0ZXJTY2hlbWFUb1BhcnNlU2NoZW1hIiwiX3JlZiIsImluZGV4ZXMiLCJTY2hlbWFEYXRhIiwiY29uc3RydWN0b3IiLCJhbGxTY2hlbWFzIiwiX19kYXRhIiwiX19wcm90ZWN0ZWRGaWVsZHMiLCJnZXQiLCJkYXRhIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiZGVlcGNvcHkiLCJjbGFzc1Byb3RlY3RlZEZpZWxkcyIsInVucSIsIlNldCIsImZyb20iLCJkZWZhdWx0U2NoZW1hIiwiX0hvb2tzU2NoZW1hIiwiX0dsb2JhbENvbmZpZ1NjaGVtYSIsIl9HcmFwaFFMQ29uZmlnU2NoZW1hIiwiX1B1c2hTdGF0dXNTY2hlbWEiLCJfSm9iU3RhdHVzU2NoZW1hIiwiX0pvYlNjaGVkdWxlU2NoZW1hIiwiX0F1ZGllbmNlU2NoZW1hIiwiX0lkZW1wb3RlbmN5U2NoZW1hIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsImRiVHlwZU1hdGNoZXNPYmplY3RUeXBlIiwiZGJUeXBlIiwib2JqZWN0VHlwZSIsInR5cGVUb1N0cmluZyIsIlNjaGVtYUNvbnRyb2xsZXIiLCJkYXRhYmFzZUFkYXB0ZXIiLCJfZGJBZGFwdGVyIiwic2NoZW1hRGF0YSIsIlNjaGVtYUNhY2hlIiwiYWxsIiwiQ29uZmlnIiwiYXBwbGljYXRpb25JZCIsImN1c3RvbUlkcyIsImFsbG93Q3VzdG9tT2JqZWN0SWQiLCJjdXN0b21JZFJlZ0V4IiwiYXV0b0lkUmVnRXgiLCJ1c2VySWRSZWdFeCIsIndhdGNoIiwicmVsb2FkRGF0YSIsImNsZWFyQ2FjaGUiLCJvcHRpb25zIiwicmVsb2FkRGF0YVByb21pc2UiLCJnZXRBbGxDbGFzc2VzIiwidGhlbiIsImVyciIsInNldEFsbENsYXNzZXMiLCJjYWNoZWQiLCJQcm9taXNlIiwicmVzb2x2ZSIsIm1hcCIsInB1dCIsImdldE9uZVNjaGVtYSIsImFsbG93Vm9sYXRpbGVDbGFzc2VzIiwiY2xlYXIiLCJvbmVTY2hlbWEiLCJmaW5kIiwicmVqZWN0IiwiYWRkQ2xhc3NJZk5vdEV4aXN0cyIsInZhbGlkYXRpb25FcnJvciIsInZhbGlkYXRlTmV3Q2xhc3MiLCJjb2RlIiwiZXJyb3IiLCJhZGFwdGVyU2NoZW1hIiwiY3JlYXRlQ2xhc3MiLCJwYXJzZVNjaGVtYSIsIkRVUExJQ0FURV9WQUxVRSIsInVwZGF0ZUNsYXNzIiwic3VibWl0dGVkRmllbGRzIiwiZGF0YWJhc2UiLCJleGlzdGluZ0ZpZWxkcyIsIl9fb3AiLCJuZXdTY2hlbWEiLCJidWlsZE1lcmdlZFNjaGVtYU9iamVjdCIsImRlZmF1bHRGaWVsZHMiLCJmdWxsTmV3U2NoZW1hIiwidmFsaWRhdGVTY2hlbWFEYXRhIiwiZGVsZXRlZEZpZWxkcyIsImluc2VydGVkRmllbGRzIiwiZGVsZXRlUHJvbWlzZSIsImRlbGV0ZUZpZWxkcyIsImVuZm9yY2VGaWVsZHMiLCJwcm9taXNlcyIsImVuZm9yY2VGaWVsZEV4aXN0cyIsInJlc3VsdHMiLCJyZXN1bHQiLCJzZXRQZXJtaXNzaW9ucyIsInNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0IiwiZW5zdXJlRmllbGRzIiwicmVsb2FkZWRTY2hlbWEiLCJjYXRjaCIsImVuZm9yY2VDbGFzc0V4aXN0cyIsImV4aXN0aW5nRmllbGROYW1lcyIsIklOVkFMSURfS0VZX05BTUUiLCJmaWVsZFR5cGUiLCJkZWZhdWx0VmFsdWUiLCJkZWZhdWx0VmFsdWVUeXBlIiwiZ2V0VHlwZSIsInJlcXVpcmVkIiwiZ2VvUG9pbnRzIiwic2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaXNWYWxpZGF0aW9uIiwic3BsaXQiLCJleHBlY3RlZFR5cGUiLCJnZXRFeHBlY3RlZFR5cGUiLCJKU09OIiwic3RyaW5naWZ5IiwidXBkYXRlRmllbGRPcHRpb25zIiwiYWRkRmllbGRJZk5vdEV4aXN0cyIsImRlbGV0ZUZpZWxkIiwiZmllbGROYW1lcyIsInNjaGVtYUZpZWxkcyIsImFkYXB0ZXIiLCJkZWxldGVDbGFzcyIsInZhbGlkYXRlT2JqZWN0IiwiZ2VvY291bnQiLCJleHBlY3RlZCIsInByb21pc2UiLCJ0aGVuVmFsaWRhdGVSZXF1aXJlZENvbHVtbnMiLCJ2YWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyIsImNvbHVtbnMiLCJtaXNzaW5nQ29sdW1ucyIsImNvbHVtbiIsInRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZSIsImFjbEdyb3VwIiwidGVzdFBlcm1pc3Npb25zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiY2xhc3NQZXJtaXNzaW9ucyIsInNvbWUiLCJhY2wiLCJ2YWxpZGF0ZVBlcm1pc3Npb24iLCJhY3Rpb24iLCJPQkpFQ1RfTk9UX0ZPVU5EIiwicGVybWlzc2lvbkZpZWxkIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsImhhc0NsYXNzIiwibG9hZCIsImRiQWRhcHRlciIsInB1dFJlcXVlc3QiLCJzeXNTY2hlbWFGaWVsZCIsIl9pZCIsIm9sZEZpZWxkIiwiZmllbGRJc0RlbGV0ZWQiLCJuZXdGaWVsZCIsInNjaGVtYVByb21pc2UiLCJnZXRPYmplY3RUeXBlIiwiX190eXBlIiwiaXNvIiwibGF0aXR1ZGUiLCJsb25naXR1ZGUiLCJiYXNlNjQiLCJjb29yZGluYXRlcyIsIm9iamVjdHMiLCJvcHMiXSwic291cmNlcyI6WyIuLi8uLi9zcmMvQ29udHJvbGxlcnMvU2NoZW1hQ29udHJvbGxlci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyIvLyBAZmxvd1xuLy8gVGhpcyBjbGFzcyBoYW5kbGVzIHNjaGVtYSB2YWxpZGF0aW9uLCBwZXJzaXN0ZW5jZSwgYW5kIG1vZGlmaWNhdGlvbi5cbi8vXG4vLyBFYWNoIGluZGl2aWR1YWwgU2NoZW1hIG9iamVjdCBzaG91bGQgYmUgaW1tdXRhYmxlLiBUaGUgaGVscGVycyB0b1xuLy8gZG8gdGhpbmdzIHdpdGggdGhlIFNjaGVtYSBqdXN0IHJldHVybiBhIG5ldyBzY2hlbWEgd2hlbiB0aGUgc2NoZW1hXG4vLyBpcyBjaGFuZ2VkLlxuLy9cbi8vIFRoZSBjYW5vbmljYWwgcGxhY2UgdG8gc3RvcmUgdGhpcyBTY2hlbWEgaXMgaW4gdGhlIGRhdGFiYXNlIGl0c2VsZixcbi8vIGluIGEgX1NDSEVNQSBjb2xsZWN0aW9uLiBUaGlzIGlzIG5vdCB0aGUgcmlnaHQgd2F5IHRvIGRvIGl0IGZvciBhblxuLy8gb3BlbiBzb3VyY2UgZnJhbWV3b3JrLCBidXQgaXQncyBiYWNrd2FyZCBjb21wYXRpYmxlLCBzbyB3ZSdyZVxuLy8ga2VlcGluZyBpdCB0aGlzIHdheSBmb3Igbm93LlxuLy9cbi8vIEluIEFQSS1oYW5kbGluZyBjb2RlLCB5b3Ugc2hvdWxkIG9ubHkgdXNlIHRoZSBTY2hlbWEgY2xhc3MgdmlhIHRoZVxuLy8gRGF0YWJhc2VDb250cm9sbGVyLiBUaGlzIHdpbGwgbGV0IHVzIHJlcGxhY2UgdGhlIHNjaGVtYSBsb2dpYyBmb3Jcbi8vIGRpZmZlcmVudCBkYXRhYmFzZXMuXG4vLyBUT0RPOiBoaWRlIGFsbCBzY2hlbWEgbG9naWMgaW5zaWRlIHRoZSBkYXRhYmFzZSBhZGFwdGVyLlxuLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG5jb25zdCBQYXJzZSA9IHJlcXVpcmUoJ3BhcnNlL25vZGUnKS5QYXJzZTtcbmltcG9ydCB7IFN0b3JhZ2VBZGFwdGVyIH0gZnJvbSAnLi4vQWRhcHRlcnMvU3RvcmFnZS9TdG9yYWdlQWRhcHRlcic7XG5pbXBvcnQgU2NoZW1hQ2FjaGUgZnJvbSAnLi4vQWRhcHRlcnMvQ2FjaGUvU2NoZW1hQ2FjaGUnO1xuaW1wb3J0IERhdGFiYXNlQ29udHJvbGxlciBmcm9tICcuL0RhdGFiYXNlQ29udHJvbGxlcic7XG5pbXBvcnQgQ29uZmlnIGZyb20gJy4uL0NvbmZpZyc7XG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmltcG9ydCBkZWVwY29weSBmcm9tICdkZWVwY29weSc7XG5pbXBvcnQgdHlwZSB7XG4gIFNjaGVtYSxcbiAgU2NoZW1hRmllbGRzLFxuICBDbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gIFNjaGVtYUZpZWxkLFxuICBMb2FkU2NoZW1hT3B0aW9ucyxcbn0gZnJvbSAnLi90eXBlcyc7XG5cbmNvbnN0IGRlZmF1bHRDb2x1bW5zOiB7IFtzdHJpbmddOiBTY2hlbWFGaWVsZHMgfSA9IE9iamVjdC5mcmVlemUoe1xuICAvLyBDb250YWluIHRoZSBkZWZhdWx0IGNvbHVtbnMgZm9yIGV2ZXJ5IHBhcnNlIG9iamVjdCB0eXBlIChleGNlcHQgX0pvaW4gY29sbGVjdGlvbilcbiAgX0RlZmF1bHQ6IHtcbiAgICBvYmplY3RJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGNyZWF0ZWRBdDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgICB1cGRhdGVkQXQ6IHsgdHlwZTogJ0RhdGUnIH0sXG4gICAgQUNMOiB7IHR5cGU6ICdBQ0wnIH0sXG4gIH0sXG4gIC8vIFRoZSBhZGRpdGlvbmFsIGRlZmF1bHQgY29sdW1ucyBmb3IgdGhlIF9Vc2VyIGNvbGxlY3Rpb24gKGluIGFkZGl0aW9uIHRvIERlZmF1bHRDb2xzKVxuICBfVXNlcjoge1xuICAgIHVzZXJuYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFzc3dvcmQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBlbWFpbDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGVtYWlsVmVyaWZpZWQ6IHsgdHlwZTogJ0Jvb2xlYW4nIH0sXG4gICAgYXV0aERhdGE6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgfSxcbiAgLy8gVGhlIGFkZGl0aW9uYWwgZGVmYXVsdCBjb2x1bW5zIGZvciB0aGUgX0luc3RhbGxhdGlvbiBjb2xsZWN0aW9uIChpbiBhZGRpdGlvbiB0byBEZWZhdWx0Q29scylcbiAgX0luc3RhbGxhdGlvbjoge1xuICAgIGluc3RhbGxhdGlvbklkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZGV2aWNlVG9rZW46IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBjaGFubmVsczogeyB0eXBlOiAnQXJyYXknIH0sXG4gICAgZGV2aWNlVHlwZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHB1c2hUeXBlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgR0NNU2VuZGVySWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICB0aW1lWm9uZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGxvY2FsZUlkZW50aWZpZXI6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBiYWRnZTogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIGFwcFZlcnNpb246IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBhcHBOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgYXBwSWRlbnRpZmllcjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhcnNlVmVyc2lvbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICB9LFxuICAvLyBUaGUgYWRkaXRpb25hbCBkZWZhdWx0IGNvbHVtbnMgZm9yIHRoZSBfUm9sZSBjb2xsZWN0aW9uIChpbiBhZGRpdGlvbiB0byBEZWZhdWx0Q29scylcbiAgX1JvbGU6IHtcbiAgICBuYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgdXNlcnM6IHsgdHlwZTogJ1JlbGF0aW9uJywgdGFyZ2V0Q2xhc3M6ICdfVXNlcicgfSxcbiAgICByb2xlczogeyB0eXBlOiAnUmVsYXRpb24nLCB0YXJnZXRDbGFzczogJ19Sb2xlJyB9LFxuICB9LFxuICAvLyBUaGUgYWRkaXRpb25hbCBkZWZhdWx0IGNvbHVtbnMgZm9yIHRoZSBfU2Vzc2lvbiBjb2xsZWN0aW9uIChpbiBhZGRpdGlvbiB0byBEZWZhdWx0Q29scylcbiAgX1Nlc3Npb246IHtcbiAgICB1c2VyOiB7IHR5cGU6ICdQb2ludGVyJywgdGFyZ2V0Q2xhc3M6ICdfVXNlcicgfSxcbiAgICBpbnN0YWxsYXRpb25JZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHNlc3Npb25Ub2tlbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGV4cGlyZXNBdDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgICBjcmVhdGVkV2l0aDogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICB9LFxuICBfUHJvZHVjdDoge1xuICAgIHByb2R1Y3RJZGVudGlmaWVyOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZG93bmxvYWQ6IHsgdHlwZTogJ0ZpbGUnIH0sXG4gICAgZG93bmxvYWROYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgaWNvbjogeyB0eXBlOiAnRmlsZScgfSxcbiAgICBvcmRlcjogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIHRpdGxlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc3VidGl0bGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgfSxcbiAgX1B1c2hTdGF0dXM6IHtcbiAgICBwdXNoVGltZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHNvdXJjZTogeyB0eXBlOiAnU3RyaW5nJyB9LCAvLyByZXN0IG9yIHdlYnVpXG4gICAgcXVlcnk6IHsgdHlwZTogJ1N0cmluZycgfSwgLy8gdGhlIHN0cmluZ2lmaWVkIEpTT04gcXVlcnlcbiAgICBwYXlsb2FkOiB7IHR5cGU6ICdTdHJpbmcnIH0sIC8vIHRoZSBzdHJpbmdpZmllZCBKU09OIHBheWxvYWQsXG4gICAgdGl0bGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBleHBpcnk6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICBleHBpcmF0aW9uX2ludGVydmFsOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgc3RhdHVzOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbnVtU2VudDogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIG51bUZhaWxlZDogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIHB1c2hIYXNoOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZXJyb3JNZXNzYWdlOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgc2VudFBlclR5cGU6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBmYWlsZWRQZXJUeXBlOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgc2VudFBlclVUQ09mZnNldDogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIGZhaWxlZFBlclVUQ09mZnNldDogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIGNvdW50OiB7IHR5cGU6ICdOdW1iZXInIH0sIC8vIHRyYWNrcyAjIG9mIGJhdGNoZXMgcXVldWVkIGFuZCBwZW5kaW5nXG4gIH0sXG4gIF9Kb2JTdGF0dXM6IHtcbiAgICBqb2JOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc291cmNlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc3RhdHVzOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbWVzc2FnZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhcmFtczogeyB0eXBlOiAnT2JqZWN0JyB9LCAvLyBwYXJhbXMgcmVjZWl2ZWQgd2hlbiBjYWxsaW5nIHRoZSBqb2JcbiAgICBmaW5pc2hlZEF0OiB7IHR5cGU6ICdEYXRlJyB9LFxuICB9LFxuICBfSm9iU2NoZWR1bGU6IHtcbiAgICBqb2JOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZGVzY3JpcHRpb246IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwYXJhbXM6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzdGFydEFmdGVyOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZGF5c09mV2VlazogeyB0eXBlOiAnQXJyYXknIH0sXG4gICAgdGltZU9mRGF5OiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbGFzdFJ1bjogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIHJlcGVhdE1pbnV0ZXM6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgfSxcbiAgX0hvb2tzOiB7XG4gICAgZnVuY3Rpb25OYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgY2xhc3NOYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgdHJpZ2dlck5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICB1cmw6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgfSxcbiAgX0dsb2JhbENvbmZpZzoge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFyYW1zOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgbWFzdGVyS2V5T25seTogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICB9LFxuICBfR3JhcGhRTENvbmZpZzoge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgY29uZmlnOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gIH0sXG4gIF9BdWRpZW5jZToge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHF1ZXJ5OiB7IHR5cGU6ICdTdHJpbmcnIH0sIC8vc3RvcmluZyBxdWVyeSBhcyBKU09OIHN0cmluZyB0byBwcmV2ZW50IFwiTmVzdGVkIGtleXMgc2hvdWxkIG5vdCBjb250YWluIHRoZSAnJCcgb3IgJy4nIGNoYXJhY3RlcnNcIiBlcnJvclxuICAgIGxhc3RVc2VkOiB7IHR5cGU6ICdEYXRlJyB9LFxuICAgIHRpbWVzVXNlZDogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICB9LFxuICBfSWRlbXBvdGVuY3k6IHtcbiAgICByZXFJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGV4cGlyZTogeyB0eXBlOiAnRGF0ZScgfSxcbiAgfSxcbn0pO1xuXG4vLyBmaWVsZHMgcmVxdWlyZWQgZm9yIHJlYWQgb3Igd3JpdGUgb3BlcmF0aW9ucyBvbiB0aGVpciByZXNwZWN0aXZlIGNsYXNzZXMuXG5jb25zdCByZXF1aXJlZENvbHVtbnMgPSBPYmplY3QuZnJlZXplKHtcbiAgcmVhZDoge1xuICAgIF9Vc2VyOiBbJ3VzZXJuYW1lJ10sXG4gIH0sXG4gIHdyaXRlOiB7XG4gICAgX1Byb2R1Y3Q6IFsncHJvZHVjdElkZW50aWZpZXInLCAnaWNvbicsICdvcmRlcicsICd0aXRsZScsICdzdWJ0aXRsZSddLFxuICAgIF9Sb2xlOiBbJ25hbWUnLCAnQUNMJ10sXG4gIH0sXG59KTtcblxuY29uc3QgaW52YWxpZENvbHVtbnMgPSBbJ2xlbmd0aCddO1xuXG5jb25zdCBzeXN0ZW1DbGFzc2VzID0gT2JqZWN0LmZyZWV6ZShbXG4gICdfVXNlcicsXG4gICdfSW5zdGFsbGF0aW9uJyxcbiAgJ19Sb2xlJyxcbiAgJ19TZXNzaW9uJyxcbiAgJ19Qcm9kdWN0JyxcbiAgJ19QdXNoU3RhdHVzJyxcbiAgJ19Kb2JTdGF0dXMnLFxuICAnX0pvYlNjaGVkdWxlJyxcbiAgJ19BdWRpZW5jZScsXG4gICdfSWRlbXBvdGVuY3knLFxuXSk7XG5cbmNvbnN0IHZvbGF0aWxlQ2xhc3NlcyA9IE9iamVjdC5mcmVlemUoW1xuICAnX0pvYlN0YXR1cycsXG4gICdfUHVzaFN0YXR1cycsXG4gICdfSG9va3MnLFxuICAnX0dsb2JhbENvbmZpZycsXG4gICdfR3JhcGhRTENvbmZpZycsXG4gICdfSm9iU2NoZWR1bGUnLFxuICAnX0F1ZGllbmNlJyxcbiAgJ19JZGVtcG90ZW5jeScsXG5dKTtcblxuLy8gQW55dGhpbmcgdGhhdCBzdGFydCB3aXRoIHJvbGVcbmNvbnN0IHJvbGVSZWdleCA9IC9ecm9sZTouKi87XG4vLyBBbnl0aGluZyB0aGF0IHN0YXJ0cyB3aXRoIHVzZXJGaWVsZCAoYWxsb3dlZCBmb3IgcHJvdGVjdGVkIGZpZWxkcyBvbmx5KVxuY29uc3QgcHJvdGVjdGVkRmllbGRzUG9pbnRlclJlZ2V4ID0gL151c2VyRmllbGQ6LiovO1xuLy8gKiBwZXJtaXNzaW9uXG5jb25zdCBwdWJsaWNSZWdleCA9IC9eXFwqJC87XG5cbmNvbnN0IGF1dGhlbnRpY2F0ZWRSZWdleCA9IC9eYXV0aGVudGljYXRlZCQvO1xuXG5jb25zdCByZXF1aXJlc0F1dGhlbnRpY2F0aW9uUmVnZXggPSAvXnJlcXVpcmVzQXV0aGVudGljYXRpb24kLztcblxuY29uc3QgY2xwUG9pbnRlclJlZ2V4ID0gL15wb2ludGVyRmllbGRzJC87XG5cbi8vIHJlZ2V4IGZvciB2YWxpZGF0aW5nIGVudGl0aWVzIGluIHByb3RlY3RlZEZpZWxkcyBvYmplY3RcbmNvbnN0IHByb3RlY3RlZEZpZWxkc1JlZ2V4ID0gT2JqZWN0LmZyZWV6ZShbXG4gIHByb3RlY3RlZEZpZWxkc1BvaW50ZXJSZWdleCxcbiAgcHVibGljUmVnZXgsXG4gIGF1dGhlbnRpY2F0ZWRSZWdleCxcbiAgcm9sZVJlZ2V4LFxuXSk7XG5cbi8vIGNscCByZWdleFxuY29uc3QgY2xwRmllbGRzUmVnZXggPSBPYmplY3QuZnJlZXplKFtcbiAgY2xwUG9pbnRlclJlZ2V4LFxuICBwdWJsaWNSZWdleCxcbiAgcmVxdWlyZXNBdXRoZW50aWNhdGlvblJlZ2V4LFxuICByb2xlUmVnZXgsXG5dKTtcblxuZnVuY3Rpb24gdmFsaWRhdGVQZXJtaXNzaW9uS2V5KGtleSwgdXNlcklkUmVnRXhwKSB7XG4gIGxldCBtYXRjaGVzU29tZSA9IGZhbHNlO1xuICBmb3IgKGNvbnN0IHJlZ0V4IG9mIGNscEZpZWxkc1JlZ2V4KSB7XG4gICAgaWYgKGtleS5tYXRjaChyZWdFeCkgIT09IG51bGwpIHtcbiAgICAgIG1hdGNoZXNTb21lID0gdHJ1ZTtcbiAgICAgIGJyZWFrO1xuICAgIH1cbiAgfVxuXG4gIC8vIHVzZXJJZCBkZXBlbmRzIG9uIHN0YXJ0dXAgb3B0aW9ucyBzbyBpdCdzIGR5bmFtaWNcbiAgY29uc3QgdmFsaWQgPSBtYXRjaGVzU29tZSB8fCBrZXkubWF0Y2godXNlcklkUmVnRXhwKSAhPT0gbnVsbDtcbiAgaWYgKCF2YWxpZCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgIGAnJHtrZXl9JyBpcyBub3QgYSB2YWxpZCBrZXkgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zYFxuICAgICk7XG4gIH1cbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVQcm90ZWN0ZWRGaWVsZHNLZXkoa2V5LCB1c2VySWRSZWdFeHApIHtcbiAgbGV0IG1hdGNoZXNTb21lID0gZmFsc2U7XG4gIGZvciAoY29uc3QgcmVnRXggb2YgcHJvdGVjdGVkRmllbGRzUmVnZXgpIHtcbiAgICBpZiAoa2V5Lm1hdGNoKHJlZ0V4KSAhPT0gbnVsbCkge1xuICAgICAgbWF0Y2hlc1NvbWUgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgLy8gdXNlcklkIHJlZ2V4IGRlcGVuZHMgb24gbGF1bmNoIG9wdGlvbnMgc28gaXQncyBkeW5hbWljXG4gIGNvbnN0IHZhbGlkID0gbWF0Y2hlc1NvbWUgfHwga2V5Lm1hdGNoKHVzZXJJZFJlZ0V4cCkgIT09IG51bGw7XG4gIGlmICghdmFsaWQpIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICBgJyR7a2V5fScgaXMgbm90IGEgdmFsaWQga2V5IGZvciBjbGFzcyBsZXZlbCBwZXJtaXNzaW9uc2BcbiAgICApO1xuICB9XG59XG5cbmNvbnN0IENMUFZhbGlkS2V5cyA9IE9iamVjdC5mcmVlemUoW1xuICAnZmluZCcsXG4gICdjb3VudCcsXG4gICdnZXQnLFxuICAnY3JlYXRlJyxcbiAgJ3VwZGF0ZScsXG4gICdkZWxldGUnLFxuICAnYWRkRmllbGQnLFxuICAncmVhZFVzZXJGaWVsZHMnLFxuICAnd3JpdGVVc2VyRmllbGRzJyxcbiAgJ3Byb3RlY3RlZEZpZWxkcycsXG5dKTtcblxuLy8gdmFsaWRhdGlvbiBiZWZvcmUgc2V0dGluZyBjbGFzcy1sZXZlbCBwZXJtaXNzaW9ucyBvbiBjb2xsZWN0aW9uXG5mdW5jdGlvbiB2YWxpZGF0ZUNMUChwZXJtczogQ2xhc3NMZXZlbFBlcm1pc3Npb25zLCBmaWVsZHM6IFNjaGVtYUZpZWxkcywgdXNlcklkUmVnRXhwOiBSZWdFeHApIHtcbiAgaWYgKCFwZXJtcykge1xuICAgIHJldHVybjtcbiAgfVxuICBmb3IgKGNvbnN0IG9wZXJhdGlvbktleSBpbiBwZXJtcykge1xuICAgIGlmIChDTFBWYWxpZEtleXMuaW5kZXhPZihvcGVyYXRpb25LZXkpID09IC0xKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgYCR7b3BlcmF0aW9uS2V5fSBpcyBub3QgYSB2YWxpZCBvcGVyYXRpb24gZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zYFxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBvcGVyYXRpb24gPSBwZXJtc1tvcGVyYXRpb25LZXldO1xuICAgIC8vIHByb2NlZWQgd2l0aCBuZXh0IG9wZXJhdGlvbktleVxuXG4gICAgLy8gdGhyb3dzIHdoZW4gcm9vdCBmaWVsZHMgYXJlIG9mIHdyb25nIHR5cGVcbiAgICB2YWxpZGF0ZUNMUGpzb24ob3BlcmF0aW9uLCBvcGVyYXRpb25LZXkpO1xuXG4gICAgaWYgKG9wZXJhdGlvbktleSA9PT0gJ3JlYWRVc2VyRmllbGRzJyB8fCBvcGVyYXRpb25LZXkgPT09ICd3cml0ZVVzZXJGaWVsZHMnKSB7XG4gICAgICAvLyB2YWxpZGF0ZSBncm91cGVkIHBvaW50ZXIgcGVybWlzc2lvbnNcbiAgICAgIC8vIG11c3QgYmUgYW4gYXJyYXkgd2l0aCBmaWVsZCBuYW1lc1xuICAgICAgZm9yIChjb25zdCBmaWVsZE5hbWUgb2Ygb3BlcmF0aW9uKSB7XG4gICAgICAgIHZhbGlkYXRlUG9pbnRlclBlcm1pc3Npb24oZmllbGROYW1lLCBmaWVsZHMsIG9wZXJhdGlvbktleSk7XG4gICAgICB9XG4gICAgICAvLyByZWFkVXNlckZpZWxkcyBhbmQgd3JpdGVyVXNlckZpZWxkcyBkbyBub3QgaGF2ZSBuZXNkdGVkIGZpZWxkc1xuICAgICAgLy8gcHJvY2VlZCB3aXRoIG5leHQgb3BlcmF0aW9uS2V5XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyB2YWxpZGF0ZSBwcm90ZWN0ZWQgZmllbGRzXG4gICAgaWYgKG9wZXJhdGlvbktleSA9PT0gJ3Byb3RlY3RlZEZpZWxkcycpIHtcbiAgICAgIGZvciAoY29uc3QgZW50aXR5IGluIG9wZXJhdGlvbikge1xuICAgICAgICAvLyB0aHJvd3Mgb24gdW5leHBlY3RlZCBrZXlcbiAgICAgICAgdmFsaWRhdGVQcm90ZWN0ZWRGaWVsZHNLZXkoZW50aXR5LCB1c2VySWRSZWdFeHApO1xuXG4gICAgICAgIGNvbnN0IHByb3RlY3RlZEZpZWxkcyA9IG9wZXJhdGlvbltlbnRpdHldO1xuXG4gICAgICAgIGlmICghQXJyYXkuaXNBcnJheShwcm90ZWN0ZWRGaWVsZHMpKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgYCcke3Byb3RlY3RlZEZpZWxkc30nIGlzIG5vdCBhIHZhbGlkIHZhbHVlIGZvciBwcm90ZWN0ZWRGaWVsZHNbJHtlbnRpdHl9XSAtIGV4cGVjdGVkIGFuIGFycmF5LmBcbiAgICAgICAgICApO1xuICAgICAgICB9XG5cbiAgICAgICAgLy8gaWYgdGhlIGZpZWxkIGlzIGluIGZvcm0gb2YgYXJyYXlcbiAgICAgICAgZm9yIChjb25zdCBmaWVsZCBvZiBwcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAvLyBkbyBub3QgYWxsb293IHRvIHByb3RlY3QgZGVmYXVsdCBmaWVsZHNcbiAgICAgICAgICBpZiAoZGVmYXVsdENvbHVtbnMuX0RlZmF1bHRbZmllbGRdKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICAgICAgYERlZmF1bHQgZmllbGQgJyR7ZmllbGR9JyBjYW4gbm90IGJlIHByb3RlY3RlZGBcbiAgICAgICAgICAgICk7XG4gICAgICAgICAgfVxuICAgICAgICAgIC8vIGZpZWxkIHNob3VsZCBleGlzdCBvbiBjb2xsZWN0aW9uXG4gICAgICAgICAgaWYgKCFPYmplY3QucHJvdG90eXBlLmhhc093blByb3BlcnR5LmNhbGwoZmllbGRzLCBmaWVsZCkpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICBgRmllbGQgJyR7ZmllbGR9JyBpbiBwcm90ZWN0ZWRGaWVsZHM6JHtlbnRpdHl9IGRvZXMgbm90IGV4aXN0YFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICAgIC8vIHByb2NlZWQgd2l0aCBuZXh0IG9wZXJhdGlvbktleVxuICAgICAgY29udGludWU7XG4gICAgfVxuXG4gICAgLy8gdmFsaWRhdGUgb3RoZXIgZmllbGRzXG4gICAgLy8gRW50aXR5IGNhbiBiZTpcbiAgICAvLyBcIipcIiAtIFB1YmxpYyxcbiAgICAvLyBcInJlcXVpcmVzQXV0aGVudGljYXRpb25cIiAtIGF1dGhlbnRpY2F0ZWQgdXNlcnMsXG4gICAgLy8gXCJvYmplY3RJZFwiIC0gX1VzZXIgaWQsXG4gICAgLy8gXCJyb2xlOnJvbGVuYW1lXCIsXG4gICAgLy8gXCJwb2ludGVyRmllbGRzXCIgLSBhcnJheSBvZiBmaWVsZCBuYW1lcyBjb250YWluaW5nIHBvaW50ZXJzIHRvIHVzZXJzXG4gICAgZm9yIChjb25zdCBlbnRpdHkgaW4gb3BlcmF0aW9uKSB7XG4gICAgICAvLyB0aHJvd3Mgb24gdW5leHBlY3RlZCBrZXlcbiAgICAgIHZhbGlkYXRlUGVybWlzc2lvbktleShlbnRpdHksIHVzZXJJZFJlZ0V4cCk7XG5cbiAgICAgIC8vIGVudGl0eSBjYW4gYmUgZWl0aGVyOlxuICAgICAgLy8gXCJwb2ludGVyRmllbGRzXCI6IHN0cmluZ1tdXG4gICAgICBpZiAoZW50aXR5ID09PSAncG9pbnRlckZpZWxkcycpIHtcbiAgICAgICAgY29uc3QgcG9pbnRlckZpZWxkcyA9IG9wZXJhdGlvbltlbnRpdHldO1xuXG4gICAgICAgIGlmIChBcnJheS5pc0FycmF5KHBvaW50ZXJGaWVsZHMpKSB7XG4gICAgICAgICAgZm9yIChjb25zdCBwb2ludGVyRmllbGQgb2YgcG9pbnRlckZpZWxkcykge1xuICAgICAgICAgICAgdmFsaWRhdGVQb2ludGVyUGVybWlzc2lvbihwb2ludGVyRmllbGQsIGZpZWxkcywgb3BlcmF0aW9uKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgYCcke3BvaW50ZXJGaWVsZHN9JyBpcyBub3QgYSB2YWxpZCB2YWx1ZSBmb3IgJHtvcGVyYXRpb25LZXl9WyR7ZW50aXR5fV0gLSBleHBlY3RlZCBhbiBhcnJheS5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfVxuICAgICAgICAvLyBwcm9jZWVkIHdpdGggbmV4dCBlbnRpdHkga2V5XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuXG4gICAgICAvLyBvciBbZW50aXR5XTogYm9vbGVhblxuICAgICAgY29uc3QgcGVybWl0ID0gb3BlcmF0aW9uW2VudGl0eV07XG5cbiAgICAgIGlmIChwZXJtaXQgIT09IHRydWUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgICBgJyR7cGVybWl0fScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zICR7b3BlcmF0aW9uS2V5fToke2VudGl0eX06JHtwZXJtaXR9YFxuICAgICAgICApO1xuICAgICAgfVxuICAgIH1cbiAgfVxufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZUNMUGpzb24ob3BlcmF0aW9uOiBhbnksIG9wZXJhdGlvbktleTogc3RyaW5nKSB7XG4gIGlmIChvcGVyYXRpb25LZXkgPT09ICdyZWFkVXNlckZpZWxkcycgfHwgb3BlcmF0aW9uS2V5ID09PSAnd3JpdGVVc2VyRmllbGRzJykge1xuICAgIGlmICghQXJyYXkuaXNBcnJheShvcGVyYXRpb24pKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgYCcke29wZXJhdGlvbn0nIGlzIG5vdCBhIHZhbGlkIHZhbHVlIGZvciBjbGFzcyBsZXZlbCBwZXJtaXNzaW9ucyAke29wZXJhdGlvbktleX0gLSBtdXN0IGJlIGFuIGFycmF5YFxuICAgICAgKTtcbiAgICB9XG4gIH0gZWxzZSB7XG4gICAgaWYgKHR5cGVvZiBvcGVyYXRpb24gPT09ICdvYmplY3QnICYmIG9wZXJhdGlvbiAhPT0gbnVsbCkge1xuICAgICAgLy8gb2sgdG8gcHJvY2VlZFxuICAgICAgcmV0dXJuO1xuICAgIH0gZWxzZSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgICAgYCcke29wZXJhdGlvbn0nIGlzIG5vdCBhIHZhbGlkIHZhbHVlIGZvciBjbGFzcyBsZXZlbCBwZXJtaXNzaW9ucyAke29wZXJhdGlvbktleX0gLSBtdXN0IGJlIGFuIG9iamVjdGBcbiAgICAgICk7XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlUG9pbnRlclBlcm1pc3Npb24oZmllbGROYW1lOiBzdHJpbmcsIGZpZWxkczogT2JqZWN0LCBvcGVyYXRpb246IHN0cmluZykge1xuICAvLyBVc2VzIGNvbGxlY3Rpb24gc2NoZW1hIHRvIGVuc3VyZSB0aGUgZmllbGQgaXMgb2YgdHlwZTpcbiAgLy8gLSBQb2ludGVyPF9Vc2VyPiAocG9pbnRlcnMpXG4gIC8vIC0gQXJyYXlcbiAgLy9cbiAgLy8gICAgSXQncyBub3QgcG9zc2libGUgdG8gZW5mb3JjZSB0eXBlIG9uIEFycmF5J3MgaXRlbXMgaW4gc2NoZW1hXG4gIC8vICBzbyB3ZSBhY2NlcHQgYW55IEFycmF5IGZpZWxkLCBhbmQgbGF0ZXIgd2hlbiBhcHBseWluZyBwZXJtaXNzaW9uc1xuICAvLyAgb25seSBpdGVtcyB0aGF0IGFyZSBwb2ludGVycyB0byBfVXNlciBhcmUgY29uc2lkZXJlZC5cbiAgaWYgKFxuICAgICEoXG4gICAgICBmaWVsZHNbZmllbGROYW1lXSAmJlxuICAgICAgKChmaWVsZHNbZmllbGROYW1lXS50eXBlID09ICdQb2ludGVyJyAmJiBmaWVsZHNbZmllbGROYW1lXS50YXJnZXRDbGFzcyA9PSAnX1VzZXInKSB8fFxuICAgICAgICBmaWVsZHNbZmllbGROYW1lXS50eXBlID09ICdBcnJheScpXG4gICAgKVxuICApIHtcbiAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICBgJyR7ZmllbGROYW1lfScgaXMgbm90IGEgdmFsaWQgY29sdW1uIGZvciBjbGFzcyBsZXZlbCBwb2ludGVyIHBlcm1pc3Npb25zICR7b3BlcmF0aW9ufWBcbiAgICApO1xuICB9XG59XG5cbmNvbnN0IGpvaW5DbGFzc1JlZ2V4ID0gL15fSm9pbjpbQS1aYS16MC05X10rOltBLVphLXowLTlfXSsvO1xuY29uc3QgY2xhc3NBbmRGaWVsZFJlZ2V4ID0gL15bQS1aYS16XVtBLVphLXowLTlfXSokLztcbmZ1bmN0aW9uIGNsYXNzTmFtZUlzVmFsaWQoY2xhc3NOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgLy8gVmFsaWQgY2xhc3NlcyBtdXN0OlxuICByZXR1cm4gKFxuICAgIC8vIEJlIG9uZSBvZiBfVXNlciwgX0luc3RhbGxhdGlvbiwgX1JvbGUsIF9TZXNzaW9uIE9SXG4gICAgc3lzdGVtQ2xhc3Nlcy5pbmRleE9mKGNsYXNzTmFtZSkgPiAtMSB8fFxuICAgIC8vIEJlIGEgam9pbiB0YWJsZSBPUlxuICAgIGpvaW5DbGFzc1JlZ2V4LnRlc3QoY2xhc3NOYW1lKSB8fFxuICAgIC8vIEluY2x1ZGUgb25seSBhbHBoYS1udW1lcmljIGFuZCB1bmRlcnNjb3JlcywgYW5kIG5vdCBzdGFydCB3aXRoIGFuIHVuZGVyc2NvcmUgb3IgbnVtYmVyXG4gICAgZmllbGROYW1lSXNWYWxpZChjbGFzc05hbWUsIGNsYXNzTmFtZSlcbiAgKTtcbn1cblxuLy8gVmFsaWQgZmllbGRzIG11c3QgYmUgYWxwaGEtbnVtZXJpYywgYW5kIG5vdCBzdGFydCB3aXRoIGFuIHVuZGVyc2NvcmUgb3IgbnVtYmVyXG4vLyBtdXN0IG5vdCBiZSBhIHJlc2VydmVkIGtleVxuZnVuY3Rpb24gZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWU6IHN0cmluZywgY2xhc3NOYW1lOiBzdHJpbmcpOiBib29sZWFuIHtcbiAgaWYgKGNsYXNzTmFtZSAmJiBjbGFzc05hbWUgIT09ICdfSG9va3MnKSB7XG4gICAgaWYgKGZpZWxkTmFtZSA9PT0gJ2NsYXNzTmFtZScpIHtcbiAgICAgIHJldHVybiBmYWxzZTtcbiAgICB9XG4gIH1cbiAgcmV0dXJuIGNsYXNzQW5kRmllbGRSZWdleC50ZXN0KGZpZWxkTmFtZSkgJiYgIWludmFsaWRDb2x1bW5zLmluY2x1ZGVzKGZpZWxkTmFtZSk7XG59XG5cbi8vIENoZWNrcyB0aGF0IGl0J3Mgbm90IHRyeWluZyB0byBjbG9iYmVyIG9uZSBvZiB0aGUgZGVmYXVsdCBmaWVsZHMgb2YgdGhlIGNsYXNzLlxuZnVuY3Rpb24gZmllbGROYW1lSXNWYWxpZEZvckNsYXNzKGZpZWxkTmFtZTogc3RyaW5nLCBjbGFzc05hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBpZiAoIWZpZWxkTmFtZUlzVmFsaWQoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmIChkZWZhdWx0Q29sdW1ucy5fRGVmYXVsdFtmaWVsZE5hbWVdKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIGlmIChkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdICYmIGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV1bZmllbGROYW1lXSkge1xuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuICByZXR1cm4gdHJ1ZTtcbn1cblxuZnVuY3Rpb24gaW52YWxpZENsYXNzTmFtZU1lc3NhZ2UoY2xhc3NOYW1lOiBzdHJpbmcpOiBzdHJpbmcge1xuICByZXR1cm4gKFxuICAgICdJbnZhbGlkIGNsYXNzbmFtZTogJyArXG4gICAgY2xhc3NOYW1lICtcbiAgICAnLCBjbGFzc25hbWVzIGNhbiBvbmx5IGhhdmUgYWxwaGFudW1lcmljIGNoYXJhY3RlcnMgYW5kIF8sIGFuZCBtdXN0IHN0YXJ0IHdpdGggYW4gYWxwaGEgY2hhcmFjdGVyICdcbiAgKTtcbn1cblxuY29uc3QgaW52YWxpZEpzb25FcnJvciA9IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdpbnZhbGlkIEpTT04nKTtcbmNvbnN0IHZhbGlkTm9uUmVsYXRpb25PclBvaW50ZXJUeXBlcyA9IFtcbiAgJ051bWJlcicsXG4gICdTdHJpbmcnLFxuICAnQm9vbGVhbicsXG4gICdEYXRlJyxcbiAgJ09iamVjdCcsXG4gICdBcnJheScsXG4gICdHZW9Qb2ludCcsXG4gICdGaWxlJyxcbiAgJ0J5dGVzJyxcbiAgJ1BvbHlnb24nLFxuXTtcbi8vIFJldHVybnMgYW4gZXJyb3Igc3VpdGFibGUgZm9yIHRocm93aW5nIGlmIHRoZSB0eXBlIGlzIGludmFsaWRcbmNvbnN0IGZpZWxkVHlwZUlzSW52YWxpZCA9ICh7IHR5cGUsIHRhcmdldENsYXNzIH0pID0+IHtcbiAgaWYgKFsnUG9pbnRlcicsICdSZWxhdGlvbiddLmluZGV4T2YodHlwZSkgPj0gMCkge1xuICAgIGlmICghdGFyZ2V0Q2xhc3MpIHtcbiAgICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoMTM1LCBgdHlwZSAke3R5cGV9IG5lZWRzIGEgY2xhc3MgbmFtZWApO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHRhcmdldENsYXNzICE9PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIGludmFsaWRKc29uRXJyb3I7XG4gICAgfSBlbHNlIGlmICghY2xhc3NOYW1lSXNWYWxpZCh0YXJnZXRDbGFzcykpIHtcbiAgICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLCBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZSh0YXJnZXRDbGFzcykpO1xuICAgIH0gZWxzZSB7XG4gICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgIH1cbiAgfVxuICBpZiAodHlwZW9mIHR5cGUgIT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIGludmFsaWRKc29uRXJyb3I7XG4gIH1cbiAgaWYgKHZhbGlkTm9uUmVsYXRpb25PclBvaW50ZXJUeXBlcy5pbmRleE9mKHR5cGUpIDwgMCkge1xuICAgIHJldHVybiBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsIGBpbnZhbGlkIGZpZWxkIHR5cGU6ICR7dHlwZX1gKTtcbiAgfVxuICByZXR1cm4gdW5kZWZpbmVkO1xufTtcblxuY29uc3QgY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSA9IChzY2hlbWE6IGFueSkgPT4ge1xuICBzY2hlbWEgPSBpbmplY3REZWZhdWx0U2NoZW1hKHNjaGVtYSk7XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLkFDTDtcbiAgc2NoZW1hLmZpZWxkcy5fcnBlcm0gPSB7IHR5cGU6ICdBcnJheScgfTtcbiAgc2NoZW1hLmZpZWxkcy5fd3Blcm0gPSB7IHR5cGU6ICdBcnJheScgfTtcblxuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLnBhc3N3b3JkO1xuICAgIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgfVxuXG4gIHJldHVybiBzY2hlbWE7XG59O1xuXG5jb25zdCBjb252ZXJ0QWRhcHRlclNjaGVtYVRvUGFyc2VTY2hlbWEgPSAoeyAuLi5zY2hlbWEgfSkgPT4ge1xuICBkZWxldGUgc2NoZW1hLmZpZWxkcy5fcnBlcm07XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl93cGVybTtcblxuICBzY2hlbWEuZmllbGRzLkFDTCA9IHsgdHlwZTogJ0FDTCcgfTtcblxuICBpZiAoc2NoZW1hLmNsYXNzTmFtZSA9PT0gJ19Vc2VyJykge1xuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLmF1dGhEYXRhOyAvL0F1dGggZGF0YSBpcyBpbXBsaWNpdFxuICAgIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9oYXNoZWRfcGFzc3dvcmQ7XG4gICAgc2NoZW1hLmZpZWxkcy5wYXNzd29yZCA9IHsgdHlwZTogJ1N0cmluZycgfTtcbiAgfVxuXG4gIGlmIChzY2hlbWEuaW5kZXhlcyAmJiBPYmplY3Qua2V5cyhzY2hlbWEuaW5kZXhlcykubGVuZ3RoID09PSAwKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5pbmRleGVzO1xuICB9XG5cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNsYXNzIFNjaGVtYURhdGEge1xuICBfX2RhdGE6IGFueTtcbiAgX19wcm90ZWN0ZWRGaWVsZHM6IGFueTtcbiAgY29uc3RydWN0b3IoYWxsU2NoZW1hcyA9IFtdLCBwcm90ZWN0ZWRGaWVsZHMgPSB7fSkge1xuICAgIHRoaXMuX19kYXRhID0ge307XG4gICAgdGhpcy5fX3Byb3RlY3RlZEZpZWxkcyA9IHByb3RlY3RlZEZpZWxkcztcbiAgICBhbGxTY2hlbWFzLmZvckVhY2goc2NoZW1hID0+IHtcbiAgICAgIGlmICh2b2xhdGlsZUNsYXNzZXMuaW5jbHVkZXMoc2NoZW1hLmNsYXNzTmFtZSkpIHtcbiAgICAgICAgcmV0dXJuO1xuICAgICAgfVxuICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIHNjaGVtYS5jbGFzc05hbWUsIHtcbiAgICAgICAgZ2V0OiAoKSA9PiB7XG4gICAgICAgICAgaWYgKCF0aGlzLl9fZGF0YVtzY2hlbWEuY2xhc3NOYW1lXSkge1xuICAgICAgICAgICAgY29uc3QgZGF0YSA9IHt9O1xuICAgICAgICAgICAgZGF0YS5maWVsZHMgPSBpbmplY3REZWZhdWx0U2NoZW1hKHNjaGVtYSkuZmllbGRzO1xuICAgICAgICAgICAgZGF0YS5jbGFzc0xldmVsUGVybWlzc2lvbnMgPSBkZWVwY29weShzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zKTtcbiAgICAgICAgICAgIGRhdGEuaW5kZXhlcyA9IHNjaGVtYS5pbmRleGVzO1xuXG4gICAgICAgICAgICBjb25zdCBjbGFzc1Byb3RlY3RlZEZpZWxkcyA9IHRoaXMuX19wcm90ZWN0ZWRGaWVsZHNbc2NoZW1hLmNsYXNzTmFtZV07XG4gICAgICAgICAgICBpZiAoY2xhc3NQcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAgICAgZm9yIChjb25zdCBrZXkgaW4gY2xhc3NQcm90ZWN0ZWRGaWVsZHMpIHtcbiAgICAgICAgICAgICAgICBjb25zdCB1bnEgPSBuZXcgU2V0KFtcbiAgICAgICAgICAgICAgICAgIC4uLihkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucy5wcm90ZWN0ZWRGaWVsZHNba2V5XSB8fCBbXSksXG4gICAgICAgICAgICAgICAgICAuLi5jbGFzc1Byb3RlY3RlZEZpZWxkc1trZXldLFxuICAgICAgICAgICAgICAgIF0pO1xuICAgICAgICAgICAgICAgIGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLnByb3RlY3RlZEZpZWxkc1trZXldID0gQXJyYXkuZnJvbSh1bnEpO1xuICAgICAgICAgICAgICB9XG4gICAgICAgICAgICB9XG5cbiAgICAgICAgICAgIHRoaXMuX19kYXRhW3NjaGVtYS5jbGFzc05hbWVdID0gZGF0YTtcbiAgICAgICAgICB9XG4gICAgICAgICAgcmV0dXJuIHRoaXMuX19kYXRhW3NjaGVtYS5jbGFzc05hbWVdO1xuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG5cbiAgICAvLyBJbmplY3QgdGhlIGluLW1lbW9yeSBjbGFzc2VzXG4gICAgdm9sYXRpbGVDbGFzc2VzLmZvckVhY2goY2xhc3NOYW1lID0+IHtcbiAgICAgIE9iamVjdC5kZWZpbmVQcm9wZXJ0eSh0aGlzLCBjbGFzc05hbWUsIHtcbiAgICAgICAgZ2V0OiAoKSA9PiB7XG4gICAgICAgICAgaWYgKCF0aGlzLl9fZGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICAgICAgICBjb25zdCBzY2hlbWEgPSBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICBmaWVsZHM6IHt9LFxuICAgICAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0ge307XG4gICAgICAgICAgICBkYXRhLmZpZWxkcyA9IHNjaGVtYS5maWVsZHM7XG4gICAgICAgICAgICBkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IHNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gICAgICAgICAgICBkYXRhLmluZGV4ZXMgPSBzY2hlbWEuaW5kZXhlcztcbiAgICAgICAgICAgIHRoaXMuX19kYXRhW2NsYXNzTmFtZV0gPSBkYXRhO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdGhpcy5fX2RhdGFbY2xhc3NOYW1lXTtcbiAgICAgICAgfSxcbiAgICAgIH0pO1xuICAgIH0pO1xuICB9XG59XG5cbmNvbnN0IGluamVjdERlZmF1bHRTY2hlbWEgPSAoeyBjbGFzc05hbWUsIGZpZWxkcywgY2xhc3NMZXZlbFBlcm1pc3Npb25zLCBpbmRleGVzIH06IFNjaGVtYSkgPT4ge1xuICBjb25zdCBkZWZhdWx0U2NoZW1hOiBTY2hlbWEgPSB7XG4gICAgY2xhc3NOYW1lLFxuICAgIGZpZWxkczoge1xuICAgICAgLi4uZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQsXG4gICAgICAuLi4oZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXSB8fCB7fSksXG4gICAgICAuLi5maWVsZHMsXG4gICAgfSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gIH07XG4gIGlmIChpbmRleGVzICYmIE9iamVjdC5rZXlzKGluZGV4ZXMpLmxlbmd0aCAhPT0gMCkge1xuICAgIGRlZmF1bHRTY2hlbWEuaW5kZXhlcyA9IGluZGV4ZXM7XG4gIH1cbiAgcmV0dXJuIGRlZmF1bHRTY2hlbWE7XG59O1xuXG5jb25zdCBfSG9va3NTY2hlbWEgPSB7IGNsYXNzTmFtZTogJ19Ib29rcycsIGZpZWxkczogZGVmYXVsdENvbHVtbnMuX0hvb2tzIH07XG5jb25zdCBfR2xvYmFsQ29uZmlnU2NoZW1hID0ge1xuICBjbGFzc05hbWU6ICdfR2xvYmFsQ29uZmlnJyxcbiAgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fR2xvYmFsQ29uZmlnLFxufTtcbmNvbnN0IF9HcmFwaFFMQ29uZmlnU2NoZW1hID0ge1xuICBjbGFzc05hbWU6ICdfR3JhcGhRTENvbmZpZycsXG4gIGZpZWxkczogZGVmYXVsdENvbHVtbnMuX0dyYXBoUUxDb25maWcsXG59O1xuY29uc3QgX1B1c2hTdGF0dXNTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfUHVzaFN0YXR1cycsXG4gICAgZmllbGRzOiB7fSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IF9Kb2JTdGF0dXNTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfSm9iU3RhdHVzJyxcbiAgICBmaWVsZHM6IHt9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgX0pvYlNjaGVkdWxlU2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX0pvYlNjaGVkdWxlJyxcbiAgICBmaWVsZHM6IHt9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgX0F1ZGllbmNlU2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX0F1ZGllbmNlJyxcbiAgICBmaWVsZHM6IGRlZmF1bHRDb2x1bW5zLl9BdWRpZW5jZSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IF9JZGVtcG90ZW5jeVNjaGVtYSA9IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoXG4gIGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgIGNsYXNzTmFtZTogJ19JZGVtcG90ZW5jeScsXG4gICAgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fSWRlbXBvdGVuY3ksXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgfSlcbik7XG5jb25zdCBWb2xhdGlsZUNsYXNzZXNTY2hlbWFzID0gW1xuICBfSG9va3NTY2hlbWEsXG4gIF9Kb2JTdGF0dXNTY2hlbWEsXG4gIF9Kb2JTY2hlZHVsZVNjaGVtYSxcbiAgX1B1c2hTdGF0dXNTY2hlbWEsXG4gIF9HbG9iYWxDb25maWdTY2hlbWEsXG4gIF9HcmFwaFFMQ29uZmlnU2NoZW1hLFxuICBfQXVkaWVuY2VTY2hlbWEsXG4gIF9JZGVtcG90ZW5jeVNjaGVtYSxcbl07XG5cbmNvbnN0IGRiVHlwZU1hdGNoZXNPYmplY3RUeXBlID0gKGRiVHlwZTogU2NoZW1hRmllbGQgfCBzdHJpbmcsIG9iamVjdFR5cGU6IFNjaGVtYUZpZWxkKSA9PiB7XG4gIGlmIChkYlR5cGUudHlwZSAhPT0gb2JqZWN0VHlwZS50eXBlKSByZXR1cm4gZmFsc2U7XG4gIGlmIChkYlR5cGUudGFyZ2V0Q2xhc3MgIT09IG9iamVjdFR5cGUudGFyZ2V0Q2xhc3MpIHJldHVybiBmYWxzZTtcbiAgaWYgKGRiVHlwZSA9PT0gb2JqZWN0VHlwZS50eXBlKSByZXR1cm4gdHJ1ZTtcbiAgaWYgKGRiVHlwZS50eXBlID09PSBvYmplY3RUeXBlLnR5cGUpIHJldHVybiB0cnVlO1xuICByZXR1cm4gZmFsc2U7XG59O1xuXG5jb25zdCB0eXBlVG9TdHJpbmcgPSAodHlwZTogU2NoZW1hRmllbGQgfCBzdHJpbmcpOiBzdHJpbmcgPT4ge1xuICBpZiAodHlwZW9mIHR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHR5cGU7XG4gIH1cbiAgaWYgKHR5cGUudGFyZ2V0Q2xhc3MpIHtcbiAgICByZXR1cm4gYCR7dHlwZS50eXBlfTwke3R5cGUudGFyZ2V0Q2xhc3N9PmA7XG4gIH1cbiAgcmV0dXJuIGAke3R5cGUudHlwZX1gO1xufTtcblxuLy8gU3RvcmVzIHRoZSBlbnRpcmUgc2NoZW1hIG9mIHRoZSBhcHAgaW4gYSB3ZWlyZCBoeWJyaWQgZm9ybWF0IHNvbWV3aGVyZSBiZXR3ZWVuXG4vLyB0aGUgbW9uZ28gZm9ybWF0IGFuZCB0aGUgUGFyc2UgZm9ybWF0LiBTb29uLCB0aGlzIHdpbGwgYWxsIGJlIFBhcnNlIGZvcm1hdC5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFNjaGVtYUNvbnRyb2xsZXIge1xuICBfZGJBZGFwdGVyOiBTdG9yYWdlQWRhcHRlcjtcbiAgc2NoZW1hRGF0YTogeyBbc3RyaW5nXTogU2NoZW1hIH07XG4gIHJlbG9hZERhdGFQcm9taXNlOiA/UHJvbWlzZTxhbnk+O1xuICBwcm90ZWN0ZWRGaWVsZHM6IGFueTtcbiAgdXNlcklkUmVnRXg6IFJlZ0V4cDtcblxuICBjb25zdHJ1Y3RvcihkYXRhYmFzZUFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyKSB7XG4gICAgdGhpcy5fZGJBZGFwdGVyID0gZGF0YWJhc2VBZGFwdGVyO1xuICAgIHRoaXMuc2NoZW1hRGF0YSA9IG5ldyBTY2hlbWFEYXRhKFNjaGVtYUNhY2hlLmFsbCgpLCB0aGlzLnByb3RlY3RlZEZpZWxkcyk7XG4gICAgdGhpcy5wcm90ZWN0ZWRGaWVsZHMgPSBDb25maWcuZ2V0KFBhcnNlLmFwcGxpY2F0aW9uSWQpLnByb3RlY3RlZEZpZWxkcztcblxuICAgIGNvbnN0IGN1c3RvbUlkcyA9IENvbmZpZy5nZXQoUGFyc2UuYXBwbGljYXRpb25JZCkuYWxsb3dDdXN0b21PYmplY3RJZDtcblxuICAgIGNvbnN0IGN1c3RvbUlkUmVnRXggPSAvXi57MSx9JC91OyAvLyAxKyBjaGFyc1xuICAgIGNvbnN0IGF1dG9JZFJlZ0V4ID0gL15bYS16QS1aMC05XXsxLH0kLztcblxuICAgIHRoaXMudXNlcklkUmVnRXggPSBjdXN0b21JZHMgPyBjdXN0b21JZFJlZ0V4IDogYXV0b0lkUmVnRXg7XG5cbiAgICB0aGlzLl9kYkFkYXB0ZXIud2F0Y2goKCkgPT4ge1xuICAgICAgdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIHJlbG9hZERhdGEob3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH0pOiBQcm9taXNlPGFueT4ge1xuICAgIGlmICh0aGlzLnJlbG9hZERhdGFQcm9taXNlICYmICFvcHRpb25zLmNsZWFyQ2FjaGUpIHtcbiAgICAgIHJldHVybiB0aGlzLnJlbG9hZERhdGFQcm9taXNlO1xuICAgIH1cbiAgICB0aGlzLnJlbG9hZERhdGFQcm9taXNlID0gdGhpcy5nZXRBbGxDbGFzc2VzKG9wdGlvbnMpXG4gICAgICAudGhlbihcbiAgICAgICAgYWxsU2NoZW1hcyA9PiB7XG4gICAgICAgICAgdGhpcy5zY2hlbWFEYXRhID0gbmV3IFNjaGVtYURhdGEoYWxsU2NoZW1hcywgdGhpcy5wcm90ZWN0ZWRGaWVsZHMpO1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLnJlbG9hZERhdGFQcm9taXNlO1xuICAgICAgICB9LFxuICAgICAgICBlcnIgPT4ge1xuICAgICAgICAgIHRoaXMuc2NoZW1hRGF0YSA9IG5ldyBTY2hlbWFEYXRhKCk7XG4gICAgICAgICAgZGVsZXRlIHRoaXMucmVsb2FkRGF0YVByb21pc2U7XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICApXG4gICAgICAudGhlbigoKSA9PiB7fSk7XG4gICAgcmV0dXJuIHRoaXMucmVsb2FkRGF0YVByb21pc2U7XG4gIH1cblxuICBnZXRBbGxDbGFzc2VzKG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9KTogUHJvbWlzZTxBcnJheTxTY2hlbWE+PiB7XG4gICAgaWYgKG9wdGlvbnMuY2xlYXJDYWNoZSkge1xuICAgICAgcmV0dXJuIHRoaXMuc2V0QWxsQ2xhc3NlcygpO1xuICAgIH1cbiAgICBjb25zdCBjYWNoZWQgPSBTY2hlbWFDYWNoZS5hbGwoKTtcbiAgICBpZiAoY2FjaGVkICYmIGNhY2hlZC5sZW5ndGgpIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoY2FjaGVkKTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMuc2V0QWxsQ2xhc3NlcygpO1xuICB9XG5cbiAgc2V0QWxsQ2xhc3NlcygpOiBQcm9taXNlPEFycmF5PFNjaGVtYT4+IHtcbiAgICByZXR1cm4gdGhpcy5fZGJBZGFwdGVyXG4gICAgICAuZ2V0QWxsQ2xhc3NlcygpXG4gICAgICAudGhlbihhbGxTY2hlbWFzID0+IGFsbFNjaGVtYXMubWFwKGluamVjdERlZmF1bHRTY2hlbWEpKVxuICAgICAgLnRoZW4oYWxsU2NoZW1hcyA9PiB7XG4gICAgICAgIFNjaGVtYUNhY2hlLnB1dChhbGxTY2hlbWFzKTtcbiAgICAgICAgcmV0dXJuIGFsbFNjaGVtYXM7XG4gICAgICB9KTtcbiAgfVxuXG4gIGdldE9uZVNjaGVtYShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBhbGxvd1ZvbGF0aWxlQ2xhc3NlczogYm9vbGVhbiA9IGZhbHNlLFxuICAgIG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9XG4gICk6IFByb21pc2U8U2NoZW1hPiB7XG4gICAgaWYgKG9wdGlvbnMuY2xlYXJDYWNoZSkge1xuICAgICAgU2NoZW1hQ2FjaGUuY2xlYXIoKTtcbiAgICB9XG4gICAgaWYgKGFsbG93Vm9sYXRpbGVDbGFzc2VzICYmIHZvbGF0aWxlQ2xhc3Nlcy5pbmRleE9mKGNsYXNzTmFtZSkgPiAtMSkge1xuICAgICAgY29uc3QgZGF0YSA9IHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdO1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh7XG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgZmllbGRzOiBkYXRhLmZpZWxkcyxcbiAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgaW5kZXhlczogZGF0YS5pbmRleGVzLFxuICAgICAgfSk7XG4gICAgfVxuICAgIGNvbnN0IGNhY2hlZCA9IFNjaGVtYUNhY2hlLmdldChjbGFzc05hbWUpO1xuICAgIGlmIChjYWNoZWQgJiYgIW9wdGlvbnMuY2xlYXJDYWNoZSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShjYWNoZWQpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5zZXRBbGxDbGFzc2VzKCkudGhlbihhbGxTY2hlbWFzID0+IHtcbiAgICAgIGNvbnN0IG9uZVNjaGVtYSA9IGFsbFNjaGVtYXMuZmluZChzY2hlbWEgPT4gc2NoZW1hLmNsYXNzTmFtZSA9PT0gY2xhc3NOYW1lKTtcbiAgICAgIGlmICghb25lU2NoZW1hKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdCh1bmRlZmluZWQpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIG9uZVNjaGVtYTtcbiAgICB9KTtcbiAgfVxuXG4gIC8vIENyZWF0ZSBhIG5ldyBjbGFzcyB0aGF0IGluY2x1ZGVzIHRoZSB0aHJlZSBkZWZhdWx0IGZpZWxkcy5cbiAgLy8gQUNMIGlzIGFuIGltcGxpY2l0IGNvbHVtbiB0aGF0IGRvZXMgbm90IGdldCBhbiBlbnRyeSBpbiB0aGVcbiAgLy8gX1NDSEVNQVMgZGF0YWJhc2UuIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgd2l0aCB0aGVcbiAgLy8gY3JlYXRlZCBzY2hlbWEsIGluIG1vbmdvIGZvcm1hdC5cbiAgLy8gb24gc3VjY2VzcywgYW5kIHJlamVjdHMgd2l0aCBhbiBlcnJvciBvbiBmYWlsLiBFbnN1cmUgeW91XG4gIC8vIGhhdmUgYXV0aG9yaXphdGlvbiAobWFzdGVyIGtleSwgb3IgY2xpZW50IGNsYXNzIGNyZWF0aW9uXG4gIC8vIGVuYWJsZWQpIGJlZm9yZSBjYWxsaW5nIHRoaXMgZnVuY3Rpb24uXG4gIGFzeW5jIGFkZENsYXNzSWZOb3RFeGlzdHMoXG4gICAgY2xhc3NOYW1lOiBzdHJpbmcsXG4gICAgZmllbGRzOiBTY2hlbWFGaWVsZHMgPSB7fSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGFueSxcbiAgICBpbmRleGVzOiBhbnkgPSB7fVxuICApOiBQcm9taXNlPHZvaWQgfCBTY2hlbWE+IHtcbiAgICB2YXIgdmFsaWRhdGlvbkVycm9yID0gdGhpcy52YWxpZGF0ZU5ld0NsYXNzKGNsYXNzTmFtZSwgZmllbGRzLCBjbGFzc0xldmVsUGVybWlzc2lvbnMpO1xuICAgIGlmICh2YWxpZGF0aW9uRXJyb3IpIHtcbiAgICAgIGlmICh2YWxpZGF0aW9uRXJyb3IgaW5zdGFuY2VvZiBQYXJzZS5FcnJvcikge1xuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QodmFsaWRhdGlvbkVycm9yKTtcbiAgICAgIH0gZWxzZSBpZiAodmFsaWRhdGlvbkVycm9yLmNvZGUgJiYgdmFsaWRhdGlvbkVycm9yLmVycm9yKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChuZXcgUGFyc2UuRXJyb3IodmFsaWRhdGlvbkVycm9yLmNvZGUsIHZhbGlkYXRpb25FcnJvci5lcnJvcikpO1xuICAgICAgfVxuICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KHZhbGlkYXRpb25FcnJvcik7XG4gICAgfVxuICAgIHRyeSB7XG4gICAgICBjb25zdCBhZGFwdGVyU2NoZW1hID0gYXdhaXQgdGhpcy5fZGJBZGFwdGVyLmNyZWF0ZUNsYXNzKFxuICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoe1xuICAgICAgICAgIGZpZWxkcyxcbiAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgaW5kZXhlcyxcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgIH0pXG4gICAgICApO1xuICAgICAgLy8gVE9ETzogUmVtb3ZlIGJ5IHVwZGF0aW5nIHNjaGVtYSBjYWNoZSBkaXJlY3RseVxuICAgICAgYXdhaXQgdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICAgIGNvbnN0IHBhcnNlU2NoZW1hID0gY29udmVydEFkYXB0ZXJTY2hlbWFUb1BhcnNlU2NoZW1hKGFkYXB0ZXJTY2hlbWEpO1xuICAgICAgcmV0dXJuIHBhcnNlU2NoZW1hO1xuICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICBpZiAoZXJyb3IgJiYgZXJyb3IuY29kZSA9PT0gUGFyc2UuRXJyb3IuRFVQTElDQVRFX1ZBTFVFKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsIGBDbGFzcyAke2NsYXNzTmFtZX0gYWxyZWFkeSBleGlzdHMuYCk7XG4gICAgICB9IGVsc2Uge1xuICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgIH1cbiAgICB9XG4gIH1cblxuICB1cGRhdGVDbGFzcyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBzdWJtaXR0ZWRGaWVsZHM6IFNjaGVtYUZpZWxkcyxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGFueSxcbiAgICBpbmRleGVzOiBhbnksXG4gICAgZGF0YWJhc2U6IERhdGFiYXNlQ29udHJvbGxlclxuICApIHtcbiAgICByZXR1cm4gdGhpcy5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lKVxuICAgICAgLnRoZW4oc2NoZW1hID0+IHtcbiAgICAgICAgY29uc3QgZXhpc3RpbmdGaWVsZHMgPSBzY2hlbWEuZmllbGRzO1xuICAgICAgICBPYmplY3Qua2V5cyhzdWJtaXR0ZWRGaWVsZHMpLmZvckVhY2gobmFtZSA9PiB7XG4gICAgICAgICAgY29uc3QgZmllbGQgPSBzdWJtaXR0ZWRGaWVsZHNbbmFtZV07XG4gICAgICAgICAgaWYgKFxuICAgICAgICAgICAgZXhpc3RpbmdGaWVsZHNbbmFtZV0gJiZcbiAgICAgICAgICAgIGV4aXN0aW5nRmllbGRzW25hbWVdLnR5cGUgIT09IGZpZWxkLnR5cGUgJiZcbiAgICAgICAgICAgIGZpZWxkLl9fb3AgIT09ICdEZWxldGUnXG4gICAgICAgICAgKSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMjU1LCBgRmllbGQgJHtuYW1lfSBleGlzdHMsIGNhbm5vdCB1cGRhdGUuYCk7XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghZXhpc3RpbmdGaWVsZHNbbmFtZV0gJiYgZmllbGQuX19vcCA9PT0gJ0RlbGV0ZScpIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigyNTUsIGBGaWVsZCAke25hbWV9IGRvZXMgbm90IGV4aXN0LCBjYW5ub3QgZGVsZXRlLmApO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgZGVsZXRlIGV4aXN0aW5nRmllbGRzLl9ycGVybTtcbiAgICAgICAgZGVsZXRlIGV4aXN0aW5nRmllbGRzLl93cGVybTtcbiAgICAgICAgY29uc3QgbmV3U2NoZW1hID0gYnVpbGRNZXJnZWRTY2hlbWFPYmplY3QoZXhpc3RpbmdGaWVsZHMsIHN1Ym1pdHRlZEZpZWxkcyk7XG4gICAgICAgIGNvbnN0IGRlZmF1bHRGaWVsZHMgPSBkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdIHx8IGRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0O1xuICAgICAgICBjb25zdCBmdWxsTmV3U2NoZW1hID0gT2JqZWN0LmFzc2lnbih7fSwgbmV3U2NoZW1hLCBkZWZhdWx0RmllbGRzKTtcbiAgICAgICAgY29uc3QgdmFsaWRhdGlvbkVycm9yID0gdGhpcy52YWxpZGF0ZVNjaGVtYURhdGEoXG4gICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgIG5ld1NjaGVtYSxcbiAgICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnMsXG4gICAgICAgICAgT2JqZWN0LmtleXMoZXhpc3RpbmdGaWVsZHMpXG4gICAgICAgICk7XG4gICAgICAgIGlmICh2YWxpZGF0aW9uRXJyb3IpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IodmFsaWRhdGlvbkVycm9yLmNvZGUsIHZhbGlkYXRpb25FcnJvci5lcnJvcik7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBGaW5hbGx5IHdlIGhhdmUgY2hlY2tlZCB0byBtYWtlIHN1cmUgdGhlIHJlcXVlc3QgaXMgdmFsaWQgYW5kIHdlIGNhbiBzdGFydCBkZWxldGluZyBmaWVsZHMuXG4gICAgICAgIC8vIERvIGFsbCBkZWxldGlvbnMgZmlyc3QsIHRoZW4gYSBzaW5nbGUgc2F2ZSB0byBfU0NIRU1BIGNvbGxlY3Rpb24gdG8gaGFuZGxlIGFsbCBhZGRpdGlvbnMuXG4gICAgICAgIGNvbnN0IGRlbGV0ZWRGaWVsZHM6IHN0cmluZ1tdID0gW107XG4gICAgICAgIGNvbnN0IGluc2VydGVkRmllbGRzID0gW107XG4gICAgICAgIE9iamVjdC5rZXlzKHN1Ym1pdHRlZEZpZWxkcykuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgIGlmIChzdWJtaXR0ZWRGaWVsZHNbZmllbGROYW1lXS5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICAgICAgZGVsZXRlZEZpZWxkcy5wdXNoKGZpZWxkTmFtZSk7XG4gICAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICAgIGluc2VydGVkRmllbGRzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGxldCBkZWxldGVQcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICAgIGlmIChkZWxldGVkRmllbGRzLmxlbmd0aCA+IDApIHtcbiAgICAgICAgICBkZWxldGVQcm9taXNlID0gdGhpcy5kZWxldGVGaWVsZHMoZGVsZXRlZEZpZWxkcywgY2xhc3NOYW1lLCBkYXRhYmFzZSk7XG4gICAgICAgIH1cbiAgICAgICAgbGV0IGVuZm9yY2VGaWVsZHMgPSBbXTtcbiAgICAgICAgcmV0dXJuIChcbiAgICAgICAgICBkZWxldGVQcm9taXNlIC8vIERlbGV0ZSBFdmVyeXRoaW5nXG4gICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pKSAvLyBSZWxvYWQgb3VyIFNjaGVtYSwgc28gd2UgaGF2ZSBhbGwgdGhlIG5ldyB2YWx1ZXNcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAgICAgY29uc3QgcHJvbWlzZXMgPSBpbnNlcnRlZEZpZWxkcy5tYXAoZmllbGROYW1lID0+IHtcbiAgICAgICAgICAgICAgICBjb25zdCB0eXBlID0gc3VibWl0dGVkRmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgICAgICAgcmV0dXJuIHRoaXMuZW5mb3JjZUZpZWxkRXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKTtcbiAgICAgICAgICAgICAgfSk7XG4gICAgICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgICAgICAgICB9KVxuICAgICAgICAgICAgLnRoZW4ocmVzdWx0cyA9PiB7XG4gICAgICAgICAgICAgIGVuZm9yY2VGaWVsZHMgPSByZXN1bHRzLmZpbHRlcihyZXN1bHQgPT4gISFyZXN1bHQpO1xuICAgICAgICAgICAgICByZXR1cm4gdGhpcy5zZXRQZXJtaXNzaW9ucyhjbGFzc05hbWUsIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucywgbmV3U2NoZW1hKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbigoKSA9PlxuICAgICAgICAgICAgICB0aGlzLl9kYkFkYXB0ZXIuc2V0SW5kZXhlc1dpdGhTY2hlbWFGb3JtYXQoXG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICAgICAgICAgIGluZGV4ZXMsXG4gICAgICAgICAgICAgICAgc2NoZW1hLmluZGV4ZXMsXG4gICAgICAgICAgICAgICAgZnVsbE5ld1NjaGVtYVxuICAgICAgICAgICAgICApXG4gICAgICAgICAgICApXG4gICAgICAgICAgICAudGhlbigoKSA9PiB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pKVxuICAgICAgICAgICAgLy9UT0RPOiBNb3ZlIHRoaXMgbG9naWMgaW50byB0aGUgZGF0YWJhc2UgYWRhcHRlclxuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICB0aGlzLmVuc3VyZUZpZWxkcyhlbmZvcmNlRmllbGRzKTtcbiAgICAgICAgICAgICAgY29uc3Qgc2NoZW1hID0gdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV07XG4gICAgICAgICAgICAgIGNvbnN0IHJlbG9hZGVkU2NoZW1hOiBTY2hlbWEgPSB7XG4gICAgICAgICAgICAgICAgY2xhc3NOYW1lOiBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgZmllbGRzOiBzY2hlbWEuZmllbGRzLFxuICAgICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICAgICAgfTtcbiAgICAgICAgICAgICAgaWYgKHNjaGVtYS5pbmRleGVzICYmIE9iamVjdC5rZXlzKHNjaGVtYS5pbmRleGVzKS5sZW5ndGggIT09IDApIHtcbiAgICAgICAgICAgICAgICByZWxvYWRlZFNjaGVtYS5pbmRleGVzID0gc2NoZW1hLmluZGV4ZXM7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIHJlbG9hZGVkU2NoZW1hO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgKTtcbiAgICAgIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSxcbiAgICAgICAgICAgIGBDbGFzcyAke2NsYXNzTmFtZX0gZG9lcyBub3QgZXhpc3QuYFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pO1xuICB9XG5cbiAgLy8gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyBzdWNjZXNzZnVsbHkgdG8gdGhlIG5ldyBzY2hlbWFcbiAgLy8gb2JqZWN0IG9yIGZhaWxzIHdpdGggYSByZWFzb24uXG4gIGVuZm9yY2VDbGFzc0V4aXN0cyhjbGFzc05hbWU6IHN0cmluZyk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlcj4ge1xuICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzKTtcbiAgICB9XG4gICAgLy8gV2UgZG9uJ3QgaGF2ZSB0aGlzIGNsYXNzLiBVcGRhdGUgdGhlIHNjaGVtYVxuICAgIHJldHVybiAoXG4gICAgICAvLyBUaGUgc2NoZW1hIHVwZGF0ZSBzdWNjZWVkZWQuIFJlbG9hZCB0aGUgc2NoZW1hXG4gICAgICB0aGlzLmFkZENsYXNzSWZOb3RFeGlzdHMoY2xhc3NOYW1lKVxuICAgICAgICAuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgIC8vIFRoZSBzY2hlbWEgdXBkYXRlIGZhaWxlZC4gVGhpcyBjYW4gYmUgb2theSAtIGl0IG1pZ2h0XG4gICAgICAgICAgLy8gaGF2ZSBmYWlsZWQgYmVjYXVzZSB0aGVyZSdzIGEgcmFjZSBjb25kaXRpb24gYW5kIGEgZGlmZmVyZW50XG4gICAgICAgICAgLy8gY2xpZW50IGlzIG1ha2luZyB0aGUgZXhhY3Qgc2FtZSBzY2hlbWEgdXBkYXRlIHRoYXQgd2Ugd2FudC5cbiAgICAgICAgICAvLyBTbyBqdXN0IHJlbG9hZCB0aGUgc2NoZW1hLlxuICAgICAgICAgIHJldHVybiB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgICAgICB9KVxuICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgLy8gRW5zdXJlIHRoYXQgdGhlIHNjaGVtYSBub3cgdmFsaWRhdGVzXG4gICAgICAgICAgaWYgKHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICAgICAgICByZXR1cm4gdGhpcztcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYEZhaWxlZCB0byBhZGQgJHtjbGFzc05hbWV9YCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KVxuICAgICAgICAuY2F0Y2goKCkgPT4ge1xuICAgICAgICAgIC8vIFRoZSBzY2hlbWEgc3RpbGwgZG9lc24ndCB2YWxpZGF0ZS4gR2l2ZSB1cFxuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sICdzY2hlbWEgY2xhc3MgbmFtZSBkb2VzIG5vdCByZXZhbGlkYXRlJyk7XG4gICAgICAgIH0pXG4gICAgKTtcbiAgfVxuXG4gIHZhbGlkYXRlTmV3Q2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkczogU2NoZW1hRmllbGRzID0ge30sIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogYW55KTogYW55IHtcbiAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsIGBDbGFzcyAke2NsYXNzTmFtZX0gYWxyZWFkeSBleGlzdHMuYCk7XG4gICAgfVxuICAgIGlmICghY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWUpKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsXG4gICAgICAgIGVycm9yOiBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZShjbGFzc05hbWUpLFxuICAgICAgfTtcbiAgICB9XG4gICAgcmV0dXJuIHRoaXMudmFsaWRhdGVTY2hlbWFEYXRhKGNsYXNzTmFtZSwgZmllbGRzLCBjbGFzc0xldmVsUGVybWlzc2lvbnMsIFtdKTtcbiAgfVxuXG4gIHZhbGlkYXRlU2NoZW1hRGF0YShcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZHM6IFNjaGVtYUZpZWxkcyxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IENsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICBleGlzdGluZ0ZpZWxkTmFtZXM6IEFycmF5PHN0cmluZz5cbiAgKSB7XG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gZmllbGRzKSB7XG4gICAgICBpZiAoZXhpc3RpbmdGaWVsZE5hbWVzLmluZGV4T2YoZmllbGROYW1lKSA8IDApIHtcbiAgICAgICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLFxuICAgICAgICAgICAgZXJyb3I6ICdpbnZhbGlkIGZpZWxkIG5hbWU6ICcgKyBmaWVsZE5hbWUsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyhmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgY29kZTogMTM2LFxuICAgICAgICAgICAgZXJyb3I6ICdmaWVsZCAnICsgZmllbGROYW1lICsgJyBjYW5ub3QgYmUgYWRkZWQnLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgY29uc3QgZmllbGRUeXBlID0gZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgIGNvbnN0IGVycm9yID0gZmllbGRUeXBlSXNJbnZhbGlkKGZpZWxkVHlwZSk7XG4gICAgICAgIGlmIChlcnJvcikgcmV0dXJuIHsgY29kZTogZXJyb3IuY29kZSwgZXJyb3I6IGVycm9yLm1lc3NhZ2UgfTtcbiAgICAgICAgaWYgKGZpZWxkVHlwZS5kZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIGxldCBkZWZhdWx0VmFsdWVUeXBlID0gZ2V0VHlwZShmaWVsZFR5cGUuZGVmYXVsdFZhbHVlKTtcbiAgICAgICAgICBpZiAodHlwZW9mIGRlZmF1bHRWYWx1ZVR5cGUgPT09ICdzdHJpbmcnKSB7XG4gICAgICAgICAgICBkZWZhdWx0VmFsdWVUeXBlID0geyB0eXBlOiBkZWZhdWx0VmFsdWVUeXBlIH07XG4gICAgICAgICAgfSBlbHNlIGlmICh0eXBlb2YgZGVmYXVsdFZhbHVlVHlwZSA9PT0gJ29iamVjdCcgJiYgZmllbGRUeXBlLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgICAgICBlcnJvcjogYFRoZSAnZGVmYXVsdCB2YWx1ZScgb3B0aW9uIGlzIG5vdCBhcHBsaWNhYmxlIGZvciAke3R5cGVUb1N0cmluZyhmaWVsZFR5cGUpfWAsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH1cbiAgICAgICAgICBpZiAoIWRiVHlwZU1hdGNoZXNPYmplY3RUeXBlKGZpZWxkVHlwZSwgZGVmYXVsdFZhbHVlVHlwZSkpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgICAgICBlcnJvcjogYHNjaGVtYSBtaXNtYXRjaCBmb3IgJHtjbGFzc05hbWV9LiR7ZmllbGROYW1lfSBkZWZhdWx0IHZhbHVlOyBleHBlY3RlZCAke3R5cGVUb1N0cmluZyhcbiAgICAgICAgICAgICAgICBmaWVsZFR5cGVcbiAgICAgICAgICAgICAgKX0gYnV0IGdvdCAke3R5cGVUb1N0cmluZyhkZWZhdWx0VmFsdWVUeXBlKX1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgIH0gZWxzZSBpZiAoZmllbGRUeXBlLnJlcXVpcmVkKSB7XG4gICAgICAgICAgaWYgKHR5cGVvZiBmaWVsZFR5cGUgPT09ICdvYmplY3QnICYmIGZpZWxkVHlwZS50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICAgICAgZXJyb3I6IGBUaGUgJ3JlcXVpcmVkJyBvcHRpb24gaXMgbm90IGFwcGxpY2FibGUgZm9yICR7dHlwZVRvU3RyaW5nKGZpZWxkVHlwZSl9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXSkge1xuICAgICAgZmllbGRzW2ZpZWxkTmFtZV0gPSBkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdW2ZpZWxkTmFtZV07XG4gICAgfVxuXG4gICAgY29uc3QgZ2VvUG9pbnRzID0gT2JqZWN0LmtleXMoZmllbGRzKS5maWx0ZXIoXG4gICAgICBrZXkgPT4gZmllbGRzW2tleV0gJiYgZmllbGRzW2tleV0udHlwZSA9PT0gJ0dlb1BvaW50J1xuICAgICk7XG4gICAgaWYgKGdlb1BvaW50cy5sZW5ndGggPiAxKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBjb2RlOiBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgZXJyb3I6XG4gICAgICAgICAgJ2N1cnJlbnRseSwgb25seSBvbmUgR2VvUG9pbnQgZmllbGQgbWF5IGV4aXN0IGluIGFuIG9iamVjdC4gQWRkaW5nICcgK1xuICAgICAgICAgIGdlb1BvaW50c1sxXSArXG4gICAgICAgICAgJyB3aGVuICcgK1xuICAgICAgICAgIGdlb1BvaW50c1swXSArXG4gICAgICAgICAgJyBhbHJlYWR5IGV4aXN0cy4nLFxuICAgICAgfTtcbiAgICB9XG4gICAgdmFsaWRhdGVDTFAoY2xhc3NMZXZlbFBlcm1pc3Npb25zLCBmaWVsZHMsIHRoaXMudXNlcklkUmVnRXgpO1xuICB9XG5cbiAgLy8gU2V0cyB0aGUgQ2xhc3MtbGV2ZWwgcGVybWlzc2lvbnMgZm9yIGEgZ2l2ZW4gY2xhc3NOYW1lLCB3aGljaCBtdXN0IGV4aXN0LlxuICBhc3luYyBzZXRQZXJtaXNzaW9ucyhjbGFzc05hbWU6IHN0cmluZywgcGVybXM6IGFueSwgbmV3U2NoZW1hOiBTY2hlbWFGaWVsZHMpIHtcbiAgICBpZiAodHlwZW9mIHBlcm1zID09PSAndW5kZWZpbmVkJykge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cbiAgICB2YWxpZGF0ZUNMUChwZXJtcywgbmV3U2NoZW1hLCB0aGlzLnVzZXJJZFJlZ0V4KTtcbiAgICBhd2FpdCB0aGlzLl9kYkFkYXB0ZXIuc2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSwgcGVybXMpO1xuICAgIGNvbnN0IGNhY2hlZCA9IFNjaGVtYUNhY2hlLmdldChjbGFzc05hbWUpO1xuICAgIGlmIChjYWNoZWQpIHtcbiAgICAgIGNhY2hlZC5jbGFzc0xldmVsUGVybWlzc2lvbnMgPSBwZXJtcztcbiAgICB9XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSB0byB0aGUgbmV3IHNjaGVtYVxuICAvLyBvYmplY3QgaWYgdGhlIHByb3ZpZGVkIGNsYXNzTmFtZS1maWVsZE5hbWUtdHlwZSB0dXBsZSBpcyB2YWxpZC5cbiAgLy8gVGhlIGNsYXNzTmFtZSBtdXN0IGFscmVhZHkgYmUgdmFsaWRhdGVkLlxuICAvLyBJZiAnZnJlZXplJyBpcyB0cnVlLCByZWZ1c2UgdG8gdXBkYXRlIHRoZSBzY2hlbWEgZm9yIHRoaXMgZmllbGQuXG4gIGVuZm9yY2VGaWVsZEV4aXN0cyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZE5hbWU6IHN0cmluZyxcbiAgICB0eXBlOiBzdHJpbmcgfCBTY2hlbWFGaWVsZCxcbiAgICBpc1ZhbGlkYXRpb24/OiBib29sZWFuXG4gICkge1xuICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID4gMCkge1xuICAgICAgLy8gc3ViZG9jdW1lbnQga2V5ICh4LnkpID0+IG9rIGlmIHggaXMgb2YgdHlwZSAnb2JqZWN0J1xuICAgICAgZmllbGROYW1lID0gZmllbGROYW1lLnNwbGl0KCcuJylbMF07XG4gICAgICB0eXBlID0gJ09iamVjdCc7XG4gICAgfVxuICAgIGlmICghZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBgSW52YWxpZCBmaWVsZCBuYW1lOiAke2ZpZWxkTmFtZX0uYCk7XG4gICAgfVxuXG4gICAgLy8gSWYgc29tZW9uZSB0cmllcyB0byBjcmVhdGUgYSBuZXcgZmllbGQgd2l0aCBudWxsL3VuZGVmaW5lZCBhcyB0aGUgdmFsdWUsIHJldHVybjtcbiAgICBpZiAoIXR5cGUpIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgY29uc3QgZXhwZWN0ZWRUeXBlID0gdGhpcy5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBmaWVsZE5hbWUpO1xuICAgIGlmICh0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHR5cGUgPSAoeyB0eXBlIH06IFNjaGVtYUZpZWxkKTtcbiAgICB9XG5cbiAgICBpZiAodHlwZS5kZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgbGV0IGRlZmF1bHRWYWx1ZVR5cGUgPSBnZXRUeXBlKHR5cGUuZGVmYXVsdFZhbHVlKTtcbiAgICAgIGlmICh0eXBlb2YgZGVmYXVsdFZhbHVlVHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgZGVmYXVsdFZhbHVlVHlwZSA9IHsgdHlwZTogZGVmYXVsdFZhbHVlVHlwZSB9O1xuICAgICAgfVxuICAgICAgaWYgKCFkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZSh0eXBlLCBkZWZhdWx0VmFsdWVUeXBlKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgYHNjaGVtYSBtaXNtYXRjaCBmb3IgJHtjbGFzc05hbWV9LiR7ZmllbGROYW1lfSBkZWZhdWx0IHZhbHVlOyBleHBlY3RlZCAke3R5cGVUb1N0cmluZyhcbiAgICAgICAgICAgIHR5cGVcbiAgICAgICAgICApfSBidXQgZ290ICR7dHlwZVRvU3RyaW5nKGRlZmF1bHRWYWx1ZVR5cGUpfWBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZXhwZWN0ZWRUeXBlKSB7XG4gICAgICBpZiAoIWRiVHlwZU1hdGNoZXNPYmplY3RUeXBlKGV4cGVjdGVkVHlwZSwgdHlwZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgIGBzY2hlbWEgbWlzbWF0Y2ggZm9yICR7Y2xhc3NOYW1lfS4ke2ZpZWxkTmFtZX07IGV4cGVjdGVkICR7dHlwZVRvU3RyaW5nKFxuICAgICAgICAgICAgZXhwZWN0ZWRUeXBlXG4gICAgICAgICAgKX0gYnV0IGdvdCAke3R5cGVUb1N0cmluZyh0eXBlKX1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyBJZiB0eXBlIG9wdGlvbnMgZG8gbm90IGNoYW5nZVxuICAgICAgLy8gd2UgY2FuIHNhZmVseSByZXR1cm5cbiAgICAgIGlmIChpc1ZhbGlkYXRpb24gfHwgSlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWRUeXBlKSA9PT0gSlNPTi5zdHJpbmdpZnkodHlwZSkpIHtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICAgIC8vIEZpZWxkIG9wdGlvbnMgYXJlIG1heSBiZSBjaGFuZ2VkXG4gICAgICAvLyBlbnN1cmUgdG8gaGF2ZSBhbiB1cGRhdGUgdG8gZGF0ZSBzY2hlbWEgZmllbGRcbiAgICAgIHJldHVybiB0aGlzLl9kYkFkYXB0ZXIudXBkYXRlRmllbGRPcHRpb25zKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5fZGJBZGFwdGVyXG4gICAgICAuYWRkRmllbGRJZk5vdEV4aXN0cyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFKSB7XG4gICAgICAgICAgLy8gTWFrZSBzdXJlIHRoYXQgd2UgdGhyb3cgZXJyb3JzIHdoZW4gaXQgaXMgYXBwcm9wcmlhdGUgdG8gZG8gc28uXG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgLy8gVGhlIHVwZGF0ZSBmYWlsZWQuIFRoaXMgY2FuIGJlIG9rYXkgLSBpdCBtaWdodCBoYXZlIGJlZW4gYSByYWNlXG4gICAgICAgIC8vIGNvbmRpdGlvbiB3aGVyZSBhbm90aGVyIGNsaWVudCB1cGRhdGVkIHRoZSBzY2hlbWEgaW4gdGhlIHNhbWVcbiAgICAgICAgLy8gd2F5IHRoYXQgd2Ugd2FudGVkIHRvLiBTbywganVzdCByZWxvYWQgdGhlIHNjaGVtYVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICBmaWVsZE5hbWUsXG4gICAgICAgICAgdHlwZSxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICB9XG5cbiAgZW5zdXJlRmllbGRzKGZpZWxkczogYW55KSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaWVsZHMubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgIGNvbnN0IHsgY2xhc3NOYW1lLCBmaWVsZE5hbWUgfSA9IGZpZWxkc1tpXTtcbiAgICAgIGxldCB7IHR5cGUgfSA9IGZpZWxkc1tpXTtcbiAgICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHRoaXMuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwgZmllbGROYW1lKTtcbiAgICAgIGlmICh0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgdHlwZSA9IHsgdHlwZTogdHlwZSB9O1xuICAgICAgfVxuICAgICAgaWYgKCFleHBlY3RlZFR5cGUgfHwgIWRiVHlwZU1hdGNoZXNPYmplY3RUeXBlKGV4cGVjdGVkVHlwZSwgdHlwZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYENvdWxkIG5vdCBhZGQgZmllbGQgJHtmaWVsZE5hbWV9YCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gbWFpbnRhaW4gY29tcGF0aWJpbGl0eVxuICBkZWxldGVGaWVsZChmaWVsZE5hbWU6IHN0cmluZywgY2xhc3NOYW1lOiBzdHJpbmcsIGRhdGFiYXNlOiBEYXRhYmFzZUNvbnRyb2xsZXIpIHtcbiAgICByZXR1cm4gdGhpcy5kZWxldGVGaWVsZHMoW2ZpZWxkTmFtZV0sIGNsYXNzTmFtZSwgZGF0YWJhc2UpO1xuICB9XG5cbiAgLy8gRGVsZXRlIGZpZWxkcywgYW5kIHJlbW92ZSB0aGF0IGRhdGEgZnJvbSBhbGwgb2JqZWN0cy4gVGhpcyBpcyBpbnRlbmRlZFxuICAvLyB0byByZW1vdmUgdW51c2VkIGZpZWxkcywgaWYgb3RoZXIgd3JpdGVycyBhcmUgd3JpdGluZyBvYmplY3RzIHRoYXQgaW5jbHVkZVxuICAvLyB0aGlzIGZpZWxkLCB0aGUgZmllbGQgbWF5IHJlYXBwZWFyLiBSZXR1cm5zIGEgUHJvbWlzZSB0aGF0IHJlc29sdmVzIHdpdGhcbiAgLy8gbm8gb2JqZWN0IG9uIHN1Y2Nlc3MsIG9yIHJlamVjdHMgd2l0aCB7IGNvZGUsIGVycm9yIH0gb24gZmFpbHVyZS5cbiAgLy8gUGFzc2luZyB0aGUgZGF0YWJhc2UgYW5kIHByZWZpeCBpcyBuZWNlc3NhcnkgaW4gb3JkZXIgdG8gZHJvcCByZWxhdGlvbiBjb2xsZWN0aW9uc1xuICAvLyBhbmQgcmVtb3ZlIGZpZWxkcyBmcm9tIG9iamVjdHMuIElkZWFsbHkgdGhlIGRhdGFiYXNlIHdvdWxkIGJlbG9uZyB0b1xuICAvLyBhIGRhdGFiYXNlIGFkYXB0ZXIgYW5kIHRoaXMgZnVuY3Rpb24gd291bGQgY2xvc2Ugb3ZlciBpdCBvciBhY2Nlc3MgaXQgdmlhIG1lbWJlci5cbiAgZGVsZXRlRmllbGRzKGZpZWxkTmFtZXM6IEFycmF5PHN0cmluZz4sIGNsYXNzTmFtZTogc3RyaW5nLCBkYXRhYmFzZTogRGF0YWJhc2VDb250cm9sbGVyKSB7XG4gICAgaWYgKCFjbGFzc05hbWVJc1ZhbGlkKGNsYXNzTmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsIGludmFsaWRDbGFzc05hbWVNZXNzYWdlKGNsYXNzTmFtZSkpO1xuICAgIH1cblxuICAgIGZpZWxkTmFtZXMuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYGludmFsaWQgZmllbGQgbmFtZTogJHtmaWVsZE5hbWV9YCk7XG4gICAgICB9XG4gICAgICAvL0Rvbid0IGFsbG93IGRlbGV0aW5nIHRoZSBkZWZhdWx0IGZpZWxkcy5cbiAgICAgIGlmICghZmllbGROYW1lSXNWYWxpZEZvckNsYXNzKGZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTM2LCBgZmllbGQgJHtmaWVsZE5hbWV9IGNhbm5vdCBiZSBjaGFuZ2VkYCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gdGhpcy5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCBmYWxzZSwgeyBjbGVhckNhY2hlOiB0cnVlIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSxcbiAgICAgICAgICAgIGBDbGFzcyAke2NsYXNzTmFtZX0gZG9lcyBub3QgZXhpc3QuYFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICBmaWVsZE5hbWVzLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICBpZiAoIXNjaGVtYS5maWVsZHNbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDI1NSwgYEZpZWxkICR7ZmllbGROYW1lfSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGRlbGV0ZS5gKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHNjaGVtYUZpZWxkcyA9IHsgLi4uc2NoZW1hLmZpZWxkcyB9O1xuICAgICAgICByZXR1cm4gZGF0YWJhc2UuYWRhcHRlci5kZWxldGVGaWVsZHMoY2xhc3NOYW1lLCBzY2hlbWEsIGZpZWxkTmFtZXMpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgICAgIGZpZWxkTmFtZXMubWFwKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICAgIGNvbnN0IGZpZWxkID0gc2NoZW1hRmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgICAgIGlmIChmaWVsZCAmJiBmaWVsZC50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgICAgICAgICAgLy9Gb3IgcmVsYXRpb25zLCBkcm9wIHRoZSBfSm9pbiB0YWJsZVxuICAgICAgICAgICAgICAgIHJldHVybiBkYXRhYmFzZS5hZGFwdGVyLmRlbGV0ZUNsYXNzKGBfSm9pbjoke2ZpZWxkTmFtZX06JHtjbGFzc05hbWV9YCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICApO1xuICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIFNjaGVtYUNhY2hlLmNsZWFyKCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlcyBhbiBvYmplY3QgcHJvdmlkZWQgaW4gUkVTVCBmb3JtYXQuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gdGhlIG5ldyBzY2hlbWEgaWYgdGhpcyBvYmplY3QgaXNcbiAgLy8gdmFsaWQuXG4gIGFzeW5jIHZhbGlkYXRlT2JqZWN0KGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3Q6IGFueSwgcXVlcnk6IGFueSkge1xuICAgIGxldCBnZW9jb3VudCA9IDA7XG4gICAgY29uc3Qgc2NoZW1hID0gYXdhaXQgdGhpcy5lbmZvcmNlQ2xhc3NFeGlzdHMoY2xhc3NOYW1lKTtcbiAgICBjb25zdCBwcm9taXNlcyA9IFtdO1xuXG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gb2JqZWN0KSB7XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gJiYgZ2V0VHlwZShvYmplY3RbZmllbGROYW1lXSkgPT09ICdHZW9Qb2ludCcpIHtcbiAgICAgICAgZ2VvY291bnQrKztcbiAgICAgIH1cbiAgICAgIGlmIChnZW9jb3VudCA+IDEpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KFxuICAgICAgICAgIG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgICAgJ3RoZXJlIGNhbiBvbmx5IGJlIG9uZSBnZW9wb2ludCBmaWVsZCBpbiBhIGNsYXNzJ1xuICAgICAgICAgIClcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG4gICAgZm9yIChjb25zdCBmaWVsZE5hbWUgaW4gb2JqZWN0KSB7XG4gICAgICBpZiAob2JqZWN0W2ZpZWxkTmFtZV0gPT09IHVuZGVmaW5lZCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGV4cGVjdGVkID0gZ2V0VHlwZShvYmplY3RbZmllbGROYW1lXSk7XG4gICAgICBpZiAoIWV4cGVjdGVkKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgaWYgKGZpZWxkTmFtZSA9PT0gJ0FDTCcpIHtcbiAgICAgICAgLy8gRXZlcnkgb2JqZWN0IGhhcyBBQ0wgaW1wbGljaXRseS5cbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBwcm9taXNlcy5wdXNoKHNjaGVtYS5lbmZvcmNlRmllbGRFeGlzdHMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIGV4cGVjdGVkLCB0cnVlKSk7XG4gICAgfVxuICAgIGNvbnN0IHJlc3VsdHMgPSBhd2FpdCBQcm9taXNlLmFsbChwcm9taXNlcyk7XG4gICAgY29uc3QgZW5mb3JjZUZpZWxkcyA9IHJlc3VsdHMuZmlsdGVyKHJlc3VsdCA9PiAhIXJlc3VsdCk7XG5cbiAgICBpZiAoZW5mb3JjZUZpZWxkcy5sZW5ndGggIT09IDApIHtcbiAgICAgIC8vIFRPRE86IFJlbW92ZSBieSB1cGRhdGluZyBzY2hlbWEgY2FjaGUgZGlyZWN0bHlcbiAgICAgIGF3YWl0IHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgfVxuICAgIHRoaXMuZW5zdXJlRmllbGRzKGVuZm9yY2VGaWVsZHMpO1xuXG4gICAgY29uc3QgcHJvbWlzZSA9IFByb21pc2UucmVzb2x2ZShzY2hlbWEpO1xuICAgIHJldHVybiB0aGVuVmFsaWRhdGVSZXF1aXJlZENvbHVtbnMocHJvbWlzZSwgY2xhc3NOYW1lLCBvYmplY3QsIHF1ZXJ5KTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlcyB0aGF0IGFsbCB0aGUgcHJvcGVydGllcyBhcmUgc2V0IGZvciB0aGUgb2JqZWN0XG4gIHZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zKGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3Q6IGFueSwgcXVlcnk6IGFueSkge1xuICAgIGNvbnN0IGNvbHVtbnMgPSByZXF1aXJlZENvbHVtbnMud3JpdGVbY2xhc3NOYW1lXTtcbiAgICBpZiAoIWNvbHVtbnMgfHwgY29sdW1ucy5sZW5ndGggPT0gMCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzKTtcbiAgICB9XG5cbiAgICBjb25zdCBtaXNzaW5nQ29sdW1ucyA9IGNvbHVtbnMuZmlsdGVyKGZ1bmN0aW9uIChjb2x1bW4pIHtcbiAgICAgIGlmIChxdWVyeSAmJiBxdWVyeS5vYmplY3RJZCkge1xuICAgICAgICBpZiAob2JqZWN0W2NvbHVtbl0gJiYgdHlwZW9mIG9iamVjdFtjb2x1bW5dID09PSAnb2JqZWN0Jykge1xuICAgICAgICAgIC8vIFRyeWluZyB0byBkZWxldGUgYSByZXF1aXJlZCBjb2x1bW5cbiAgICAgICAgICByZXR1cm4gb2JqZWN0W2NvbHVtbl0uX19vcCA9PSAnRGVsZXRlJztcbiAgICAgICAgfVxuICAgICAgICAvLyBOb3QgdHJ5aW5nIHRvIGRvIGFueXRoaW5nIHRoZXJlXG4gICAgICAgIHJldHVybiBmYWxzZTtcbiAgICAgIH1cbiAgICAgIHJldHVybiAhb2JqZWN0W2NvbHVtbl07XG4gICAgfSk7XG5cbiAgICBpZiAobWlzc2luZ0NvbHVtbnMubGVuZ3RoID4gMCkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLCBtaXNzaW5nQ29sdW1uc1swXSArICcgaXMgcmVxdWlyZWQuJyk7XG4gICAgfVxuICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodGhpcyk7XG4gIH1cblxuICB0ZXN0UGVybWlzc2lvbnNGb3JDbGFzc05hbWUoY2xhc3NOYW1lOiBzdHJpbmcsIGFjbEdyb3VwOiBzdHJpbmdbXSwgb3BlcmF0aW9uOiBzdHJpbmcpIHtcbiAgICByZXR1cm4gU2NoZW1hQ29udHJvbGxlci50ZXN0UGVybWlzc2lvbnMoXG4gICAgICB0aGlzLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpLFxuICAgICAgYWNsR3JvdXAsXG4gICAgICBvcGVyYXRpb25cbiAgICApO1xuICB9XG5cbiAgLy8gVGVzdHMgdGhhdCB0aGUgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbiBsZXQgcGFzcyB0aGUgb3BlcmF0aW9uIGZvciBhIGdpdmVuIGFjbEdyb3VwXG4gIHN0YXRpYyB0ZXN0UGVybWlzc2lvbnMoY2xhc3NQZXJtaXNzaW9uczogP2FueSwgYWNsR3JvdXA6IHN0cmluZ1tdLCBvcGVyYXRpb246IHN0cmluZyk6IGJvb2xlYW4ge1xuICAgIGlmICghY2xhc3NQZXJtaXNzaW9ucyB8fCAhY2xhc3NQZXJtaXNzaW9uc1tvcGVyYXRpb25dKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3QgcGVybXMgPSBjbGFzc1Blcm1pc3Npb25zW29wZXJhdGlvbl07XG4gICAgaWYgKHBlcm1zWycqJ10pIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICAvLyBDaGVjayBwZXJtaXNzaW9ucyBhZ2FpbnN0IHRoZSBhY2xHcm91cCBwcm92aWRlZCAoYXJyYXkgb2YgdXNlcklkL3JvbGVzKVxuICAgIGlmIChcbiAgICAgIGFjbEdyb3VwLnNvbWUoYWNsID0+IHtcbiAgICAgICAgcmV0dXJuIHBlcm1zW2FjbF0gPT09IHRydWU7XG4gICAgICB9KVxuICAgICkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIHJldHVybiBmYWxzZTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlcyBhbiBvcGVyYXRpb24gcGFzc2VzIGNsYXNzLWxldmVsLXBlcm1pc3Npb25zIHNldCBpbiB0aGUgc2NoZW1hXG4gIHN0YXRpYyB2YWxpZGF0ZVBlcm1pc3Npb24oXG4gICAgY2xhc3NQZXJtaXNzaW9uczogP2FueSxcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBhY2xHcm91cDogc3RyaW5nW10sXG4gICAgb3BlcmF0aW9uOiBzdHJpbmcsXG4gICAgYWN0aW9uPzogc3RyaW5nXG4gICkge1xuICAgIGlmIChTY2hlbWFDb250cm9sbGVyLnRlc3RQZXJtaXNzaW9ucyhjbGFzc1Blcm1pc3Npb25zLCBhY2xHcm91cCwgb3BlcmF0aW9uKSkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cblxuICAgIGlmICghY2xhc3NQZXJtaXNzaW9ucyB8fCAhY2xhc3NQZXJtaXNzaW9uc1tvcGVyYXRpb25dKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgY29uc3QgcGVybXMgPSBjbGFzc1Blcm1pc3Npb25zW29wZXJhdGlvbl07XG4gICAgLy8gSWYgb25seSBmb3IgYXV0aGVudGljYXRlZCB1c2Vyc1xuICAgIC8vIG1ha2Ugc3VyZSB3ZSBoYXZlIGFuIGFjbEdyb3VwXG4gICAgaWYgKHBlcm1zWydyZXF1aXJlc0F1dGhlbnRpY2F0aW9uJ10pIHtcbiAgICAgIC8vIElmIGFjbEdyb3VwIGhhcyAqIChwdWJsaWMpXG4gICAgICBpZiAoIWFjbEdyb3VwIHx8IGFjbEdyb3VwLmxlbmd0aCA9PSAwKSB7XG4gICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICBQYXJzZS5FcnJvci5PQkpFQ1RfTk9UX0ZPVU5ELFxuICAgICAgICAgICdQZXJtaXNzaW9uIGRlbmllZCwgdXNlciBuZWVkcyB0byBiZSBhdXRoZW50aWNhdGVkLidcbiAgICAgICAgKTtcbiAgICAgIH0gZWxzZSBpZiAoYWNsR3JvdXAuaW5kZXhPZignKicpID4gLTEgJiYgYWNsR3JvdXAubGVuZ3RoID09IDEpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgJ1Blcm1pc3Npb24gZGVuaWVkLCB1c2VyIG5lZWRzIHRvIGJlIGF1dGhlbnRpY2F0ZWQuJ1xuICAgICAgICApO1xuICAgICAgfVxuICAgICAgLy8gcmVxdWlyZXNBdXRoZW50aWNhdGlvbiBwYXNzZWQsIGp1c3QgbW92ZSBmb3J3YXJkXG4gICAgICAvLyBwcm9iYWJseSB3b3VsZCBiZSB3aXNlIGF0IHNvbWUgcG9pbnQgdG8gcmVuYW1lIHRvICdhdXRoZW50aWNhdGVkVXNlcidcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG5cbiAgICAvLyBObyBtYXRjaGluZyBDTFAsIGxldCdzIGNoZWNrIHRoZSBQb2ludGVyIHBlcm1pc3Npb25zXG4gICAgLy8gQW5kIGhhbmRsZSB0aG9zZSBsYXRlclxuICAgIGNvbnN0IHBlcm1pc3Npb25GaWVsZCA9XG4gICAgICBbJ2dldCcsICdmaW5kJywgJ2NvdW50J10uaW5kZXhPZihvcGVyYXRpb24pID4gLTEgPyAncmVhZFVzZXJGaWVsZHMnIDogJ3dyaXRlVXNlckZpZWxkcyc7XG5cbiAgICAvLyBSZWplY3QgY3JlYXRlIHdoZW4gd3JpdGUgbG9ja2Rvd25cbiAgICBpZiAocGVybWlzc2lvbkZpZWxkID09ICd3cml0ZVVzZXJGaWVsZHMnICYmIG9wZXJhdGlvbiA9PSAnY3JlYXRlJykge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICBQYXJzZS5FcnJvci5PUEVSQVRJT05fRk9SQklEREVOLFxuICAgICAgICBgUGVybWlzc2lvbiBkZW5pZWQgZm9yIGFjdGlvbiAke29wZXJhdGlvbn0gb24gY2xhc3MgJHtjbGFzc05hbWV9LmBcbiAgICAgICk7XG4gICAgfVxuXG4gICAgLy8gUHJvY2VzcyB0aGUgcmVhZFVzZXJGaWVsZHMgbGF0ZXJcbiAgICBpZiAoXG4gICAgICBBcnJheS5pc0FycmF5KGNsYXNzUGVybWlzc2lvbnNbcGVybWlzc2lvbkZpZWxkXSkgJiZcbiAgICAgIGNsYXNzUGVybWlzc2lvbnNbcGVybWlzc2lvbkZpZWxkXS5sZW5ndGggPiAwXG4gICAgKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuXG4gICAgY29uc3QgcG9pbnRlckZpZWxkcyA9IGNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXS5wb2ludGVyRmllbGRzO1xuICAgIGlmIChBcnJheS5pc0FycmF5KHBvaW50ZXJGaWVsZHMpICYmIHBvaW50ZXJGaWVsZHMubGVuZ3RoID4gMCkge1xuICAgICAgLy8gYW55IG9wIGV4Y2VwdCAnYWRkRmllbGQgYXMgcGFydCBvZiBjcmVhdGUnIGlzIG9rLlxuICAgICAgaWYgKG9wZXJhdGlvbiAhPT0gJ2FkZEZpZWxkJyB8fCBhY3Rpb24gPT09ICd1cGRhdGUnKSB7XG4gICAgICAgIC8vIFdlIGNhbiBhbGxvdyBhZGRpbmcgZmllbGQgb24gdXBkYXRlIGZsb3cgb25seS5cbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICBgUGVybWlzc2lvbiBkZW5pZWQgZm9yIGFjdGlvbiAke29wZXJhdGlvbn0gb24gY2xhc3MgJHtjbGFzc05hbWV9LmBcbiAgICApO1xuICB9XG5cbiAgLy8gVmFsaWRhdGVzIGFuIG9wZXJhdGlvbiBwYXNzZXMgY2xhc3MtbGV2ZWwtcGVybWlzc2lvbnMgc2V0IGluIHRoZSBzY2hlbWFcbiAgdmFsaWRhdGVQZXJtaXNzaW9uKGNsYXNzTmFtZTogc3RyaW5nLCBhY2xHcm91cDogc3RyaW5nW10sIG9wZXJhdGlvbjogc3RyaW5nLCBhY3Rpb24/OiBzdHJpbmcpIHtcbiAgICByZXR1cm4gU2NoZW1hQ29udHJvbGxlci52YWxpZGF0ZVBlcm1pc3Npb24oXG4gICAgICB0aGlzLmdldENsYXNzTGV2ZWxQZXJtaXNzaW9ucyhjbGFzc05hbWUpLFxuICAgICAgY2xhc3NOYW1lLFxuICAgICAgYWNsR3JvdXAsXG4gICAgICBvcGVyYXRpb24sXG4gICAgICBhY3Rpb25cbiAgICApO1xuICB9XG5cbiAgZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZTogc3RyaW5nKTogYW55IHtcbiAgICByZXR1cm4gdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0gJiYgdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0uY2xhc3NMZXZlbFBlcm1pc3Npb25zO1xuICB9XG5cbiAgLy8gUmV0dXJucyB0aGUgZXhwZWN0ZWQgdHlwZSBmb3IgYSBjbGFzc05hbWUra2V5IGNvbWJpbmF0aW9uXG4gIC8vIG9yIHVuZGVmaW5lZCBpZiB0aGUgc2NoZW1hIGlzIG5vdCBzZXRcbiAgZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZTogc3RyaW5nLCBmaWVsZE5hbWU6IHN0cmluZyk6ID8oU2NoZW1hRmllbGQgfCBzdHJpbmcpIHtcbiAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdLmZpZWxkc1tmaWVsZE5hbWVdO1xuICAgICAgcmV0dXJuIGV4cGVjdGVkVHlwZSA9PT0gJ21hcCcgPyAnT2JqZWN0JyA6IGV4cGVjdGVkVHlwZTtcbiAgICB9XG4gICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgfVxuXG4gIC8vIENoZWNrcyBpZiBhIGdpdmVuIGNsYXNzIGlzIGluIHRoZSBzY2hlbWEuXG4gIGhhc0NsYXNzKGNsYXNzTmFtZTogc3RyaW5nKSB7XG4gICAgaWYgKHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRydWUpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5yZWxvYWREYXRhKCkudGhlbigoKSA9PiAhIXRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKTtcbiAgfVxufVxuXG4vLyBSZXR1cm5zIGEgcHJvbWlzZSBmb3IgYSBuZXcgU2NoZW1hLlxuY29uc3QgbG9hZCA9IChkYkFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyLCBvcHRpb25zOiBhbnkpOiBQcm9taXNlPFNjaGVtYUNvbnRyb2xsZXI+ID0+IHtcbiAgY29uc3Qgc2NoZW1hID0gbmV3IFNjaGVtYUNvbnRyb2xsZXIoZGJBZGFwdGVyKTtcbiAgcmV0dXJuIHNjaGVtYS5yZWxvYWREYXRhKG9wdGlvbnMpLnRoZW4oKCkgPT4gc2NoZW1hKTtcbn07XG5cbi8vIEJ1aWxkcyBhIG5ldyBzY2hlbWEgKGluIHNjaGVtYSBBUEkgcmVzcG9uc2UgZm9ybWF0KSBvdXQgb2YgYW5cbi8vIGV4aXN0aW5nIG1vbmdvIHNjaGVtYSArIGEgc2NoZW1hcyBBUEkgcHV0IHJlcXVlc3QuIFRoaXMgcmVzcG9uc2Vcbi8vIGRvZXMgbm90IGluY2x1ZGUgdGhlIGRlZmF1bHQgZmllbGRzLCBhcyBpdCBpcyBpbnRlbmRlZCB0byBiZSBwYXNzZWRcbi8vIHRvIG1vbmdvU2NoZW1hRnJvbUZpZWxkc0FuZENsYXNzTmFtZS4gTm8gdmFsaWRhdGlvbiBpcyBkb25lIGhlcmUsIGl0XG4vLyBpcyBkb25lIGluIG1vbmdvU2NoZW1hRnJvbUZpZWxkc0FuZENsYXNzTmFtZS5cbmZ1bmN0aW9uIGJ1aWxkTWVyZ2VkU2NoZW1hT2JqZWN0KGV4aXN0aW5nRmllbGRzOiBTY2hlbWFGaWVsZHMsIHB1dFJlcXVlc3Q6IGFueSk6IFNjaGVtYUZpZWxkcyB7XG4gIGNvbnN0IG5ld1NjaGVtYSA9IHt9O1xuICAvLyBAZmxvdy1kaXNhYmxlLW5leHRcbiAgY29uc3Qgc3lzU2NoZW1hRmllbGQgPVxuICAgIE9iamVjdC5rZXlzKGRlZmF1bHRDb2x1bW5zKS5pbmRleE9mKGV4aXN0aW5nRmllbGRzLl9pZCkgPT09IC0xXG4gICAgICA/IFtdXG4gICAgICA6IE9iamVjdC5rZXlzKGRlZmF1bHRDb2x1bW5zW2V4aXN0aW5nRmllbGRzLl9pZF0pO1xuICBmb3IgKGNvbnN0IG9sZEZpZWxkIGluIGV4aXN0aW5nRmllbGRzKSB7XG4gICAgaWYgKFxuICAgICAgb2xkRmllbGQgIT09ICdfaWQnICYmXG4gICAgICBvbGRGaWVsZCAhPT0gJ0FDTCcgJiZcbiAgICAgIG9sZEZpZWxkICE9PSAndXBkYXRlZEF0JyAmJlxuICAgICAgb2xkRmllbGQgIT09ICdjcmVhdGVkQXQnICYmXG4gICAgICBvbGRGaWVsZCAhPT0gJ29iamVjdElkJ1xuICAgICkge1xuICAgICAgaWYgKHN5c1NjaGVtYUZpZWxkLmxlbmd0aCA+IDAgJiYgc3lzU2NoZW1hRmllbGQuaW5kZXhPZihvbGRGaWVsZCkgIT09IC0xKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgY29uc3QgZmllbGRJc0RlbGV0ZWQgPSBwdXRSZXF1ZXN0W29sZEZpZWxkXSAmJiBwdXRSZXF1ZXN0W29sZEZpZWxkXS5fX29wID09PSAnRGVsZXRlJztcbiAgICAgIGlmICghZmllbGRJc0RlbGV0ZWQpIHtcbiAgICAgICAgbmV3U2NoZW1hW29sZEZpZWxkXSA9IGV4aXN0aW5nRmllbGRzW29sZEZpZWxkXTtcbiAgICAgIH1cbiAgICB9XG4gIH1cbiAgZm9yIChjb25zdCBuZXdGaWVsZCBpbiBwdXRSZXF1ZXN0KSB7XG4gICAgaWYgKG5ld0ZpZWxkICE9PSAnb2JqZWN0SWQnICYmIHB1dFJlcXVlc3RbbmV3RmllbGRdLl9fb3AgIT09ICdEZWxldGUnKSB7XG4gICAgICBpZiAoc3lzU2NoZW1hRmllbGQubGVuZ3RoID4gMCAmJiBzeXNTY2hlbWFGaWVsZC5pbmRleE9mKG5ld0ZpZWxkKSAhPT0gLTEpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBuZXdTY2hlbWFbbmV3RmllbGRdID0gcHV0UmVxdWVzdFtuZXdGaWVsZF07XG4gICAgfVxuICB9XG4gIHJldHVybiBuZXdTY2hlbWE7XG59XG5cbi8vIEdpdmVuIGEgc2NoZW1hIHByb21pc2UsIGNvbnN0cnVjdCBhbm90aGVyIHNjaGVtYSBwcm9taXNlIHRoYXRcbi8vIHZhbGlkYXRlcyB0aGlzIGZpZWxkIG9uY2UgdGhlIHNjaGVtYSBsb2Fkcy5cbmZ1bmN0aW9uIHRoZW5WYWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyhzY2hlbWFQcm9taXNlLCBjbGFzc05hbWUsIG9iamVjdCwgcXVlcnkpIHtcbiAgcmV0dXJuIHNjaGVtYVByb21pc2UudGhlbihzY2hlbWEgPT4ge1xuICAgIHJldHVybiBzY2hlbWEudmFsaWRhdGVSZXF1aXJlZENvbHVtbnMoY2xhc3NOYW1lLCBvYmplY3QsIHF1ZXJ5KTtcbiAgfSk7XG59XG5cbi8vIEdldHMgdGhlIHR5cGUgZnJvbSBhIFJFU1QgQVBJIGZvcm1hdHRlZCBvYmplY3QsIHdoZXJlICd0eXBlJyBpc1xuLy8gZXh0ZW5kZWQgcGFzdCBqYXZhc2NyaXB0IHR5cGVzIHRvIGluY2x1ZGUgdGhlIHJlc3Qgb2YgdGhlIFBhcnNlXG4vLyB0eXBlIHN5c3RlbS5cbi8vIFRoZSBvdXRwdXQgc2hvdWxkIGJlIGEgdmFsaWQgc2NoZW1hIHZhbHVlLlxuLy8gVE9ETzogZW5zdXJlIHRoYXQgdGhpcyBpcyBjb21wYXRpYmxlIHdpdGggdGhlIGZvcm1hdCB1c2VkIGluIE9wZW4gREJcbmZ1bmN0aW9uIGdldFR5cGUob2JqOiBhbnkpOiA/KFNjaGVtYUZpZWxkIHwgc3RyaW5nKSB7XG4gIGNvbnN0IHR5cGUgPSB0eXBlb2Ygb2JqO1xuICBzd2l0Y2ggKHR5cGUpIHtcbiAgICBjYXNlICdib29sZWFuJzpcbiAgICAgIHJldHVybiAnQm9vbGVhbic7XG4gICAgY2FzZSAnc3RyaW5nJzpcbiAgICAgIHJldHVybiAnU3RyaW5nJztcbiAgICBjYXNlICdudW1iZXInOlxuICAgICAgcmV0dXJuICdOdW1iZXInO1xuICAgIGNhc2UgJ21hcCc6XG4gICAgY2FzZSAnb2JqZWN0JzpcbiAgICAgIGlmICghb2JqKSB7XG4gICAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgICB9XG4gICAgICByZXR1cm4gZ2V0T2JqZWN0VHlwZShvYmopO1xuICAgIGNhc2UgJ2Z1bmN0aW9uJzpcbiAgICBjYXNlICdzeW1ib2wnOlxuICAgIGNhc2UgJ3VuZGVmaW5lZCc6XG4gICAgZGVmYXVsdDpcbiAgICAgIHRocm93ICdiYWQgb2JqOiAnICsgb2JqO1xuICB9XG59XG5cbi8vIFRoaXMgZ2V0cyB0aGUgdHlwZSBmb3Igbm9uLUpTT04gdHlwZXMgbGlrZSBwb2ludGVycyBhbmQgZmlsZXMsIGJ1dFxuLy8gYWxzbyBnZXRzIHRoZSBhcHByb3ByaWF0ZSB0eXBlIGZvciAkIG9wZXJhdG9ycy5cbi8vIFJldHVybnMgbnVsbCBpZiB0aGUgdHlwZSBpcyB1bmtub3duLlxuZnVuY3Rpb24gZ2V0T2JqZWN0VHlwZShvYmopOiA/KFNjaGVtYUZpZWxkIHwgc3RyaW5nKSB7XG4gIGlmIChvYmogaW5zdGFuY2VvZiBBcnJheSkge1xuICAgIHJldHVybiAnQXJyYXknO1xuICB9XG4gIGlmIChvYmouX190eXBlKSB7XG4gICAgc3dpdGNoIChvYmouX190eXBlKSB7XG4gICAgICBjYXNlICdQb2ludGVyJzpcbiAgICAgICAgaWYgKG9iai5jbGFzc05hbWUpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdHlwZTogJ1BvaW50ZXInLFxuICAgICAgICAgICAgdGFyZ2V0Q2xhc3M6IG9iai5jbGFzc05hbWUsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ1JlbGF0aW9uJzpcbiAgICAgICAgaWYgKG9iai5jbGFzc05hbWUpIHtcbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgdHlwZTogJ1JlbGF0aW9uJyxcbiAgICAgICAgICAgIHRhcmdldENsYXNzOiBvYmouY2xhc3NOYW1lLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdGaWxlJzpcbiAgICAgICAgaWYgKG9iai5uYW1lKSB7XG4gICAgICAgICAgcmV0dXJuICdGaWxlJztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ0RhdGUnOlxuICAgICAgICBpZiAob2JqLmlzbykge1xuICAgICAgICAgIHJldHVybiAnRGF0ZSc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdHZW9Qb2ludCc6XG4gICAgICAgIGlmIChvYmoubGF0aXR1ZGUgIT0gbnVsbCAmJiBvYmoubG9uZ2l0dWRlICE9IG51bGwpIHtcbiAgICAgICAgICByZXR1cm4gJ0dlb1BvaW50JztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ0J5dGVzJzpcbiAgICAgICAgaWYgKG9iai5iYXNlNjQpIHtcbiAgICAgICAgICByZXR1cm4gJ0J5dGVzJztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICAgIGNhc2UgJ1BvbHlnb24nOlxuICAgICAgICBpZiAob2JqLmNvb3JkaW5hdGVzKSB7XG4gICAgICAgICAgcmV0dXJuICdQb2x5Z29uJztcbiAgICAgICAgfVxuICAgICAgICBicmVhaztcbiAgICB9XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLCAnVGhpcyBpcyBub3QgYSB2YWxpZCAnICsgb2JqLl9fdHlwZSk7XG4gIH1cbiAgaWYgKG9ialsnJG5lJ10pIHtcbiAgICByZXR1cm4gZ2V0T2JqZWN0VHlwZShvYmpbJyRuZSddKTtcbiAgfVxuICBpZiAob2JqLl9fb3ApIHtcbiAgICBzd2l0Y2ggKG9iai5fX29wKSB7XG4gICAgICBjYXNlICdJbmNyZW1lbnQnOlxuICAgICAgICByZXR1cm4gJ051bWJlcic7XG4gICAgICBjYXNlICdEZWxldGUnOlxuICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgIGNhc2UgJ0FkZCc6XG4gICAgICBjYXNlICdBZGRVbmlxdWUnOlxuICAgICAgY2FzZSAnUmVtb3ZlJzpcbiAgICAgICAgcmV0dXJuICdBcnJheSc7XG4gICAgICBjYXNlICdBZGRSZWxhdGlvbic6XG4gICAgICBjYXNlICdSZW1vdmVSZWxhdGlvbic6XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgdHlwZTogJ1JlbGF0aW9uJyxcbiAgICAgICAgICB0YXJnZXRDbGFzczogb2JqLm9iamVjdHNbMF0uY2xhc3NOYW1lLFxuICAgICAgICB9O1xuICAgICAgY2FzZSAnQmF0Y2gnOlxuICAgICAgICByZXR1cm4gZ2V0T2JqZWN0VHlwZShvYmoub3BzWzBdKTtcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHRocm93ICd1bmV4cGVjdGVkIG9wOiAnICsgb2JqLl9fb3A7XG4gICAgfVxuICB9XG4gIHJldHVybiAnT2JqZWN0Jztcbn1cblxuZXhwb3J0IHtcbiAgbG9hZCxcbiAgY2xhc3NOYW1lSXNWYWxpZCxcbiAgZmllbGROYW1lSXNWYWxpZCxcbiAgaW52YWxpZENsYXNzTmFtZU1lc3NhZ2UsXG4gIGJ1aWxkTWVyZ2VkU2NoZW1hT2JqZWN0LFxuICBzeXN0ZW1DbGFzc2VzLFxuICBkZWZhdWx0Q29sdW1ucyxcbiAgY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSxcbiAgVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyxcbiAgU2NoZW1hQ29udHJvbGxlcixcbiAgcmVxdWlyZWRDb2x1bW5zLFxufTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7O0FBa0JBLElBQUFBLGVBQUEsR0FBQUMsT0FBQTtBQUNBLElBQUFDLFlBQUEsR0FBQUMsc0JBQUEsQ0FB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