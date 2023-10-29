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
const ttl = {
  date: Date.now(),
  duration: undefined
};

// Stores the entire schema of the app in a weird hybrid format somewhere between
// the mongo format and the Parse format. Soon, this will all be Parse format.
class SchemaController {
  constructor(databaseAdapter) {
    this._dbAdapter = databaseAdapter;
    const config = _Config.default.get(Parse.applicationId);
    this.schemaData = new SchemaData(_SchemaCache.default.all(), this.protectedFields);
    this.protectedFields = config.protectedFields;
    const customIds = config.allowCustomObjectId;
    const customIdRegEx = /^.{1,}$/u; // 1+ chars
    const autoIdRegEx = /^[a-zA-Z0-9]{1,}$/;
    this.userIdRegEx = customIds ? customIdRegEx : autoIdRegEx;
    this._dbAdapter.watch(() => {
      this.reloadData({
        clearCache: true
      });
    });
  }
  async reloadDataIfNeeded() {
    if (this._dbAdapter.enableSchemaHooks) {
      return;
    }
    const {
      date,
      duration
    } = ttl || {};
    if (!duration) {
      return;
    }
    const now = Date.now();
    if (now - date > duration) {
      ttl.date = now;
      await this.reloadData({
        clearCache: true
      });
    }
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
  async getAllClasses(options = {
    clearCache: false
  }) {
    if (options.clearCache) {
      return this.setAllClasses();
    }
    await this.reloadDataIfNeeded();
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
  enforceFieldExists(className, fieldName, type, isValidation, maintenance) {
    if (fieldName.indexOf('.') > 0) {
      // subdocument key (x.y) => ok if x is of type 'object'
      fieldName = fieldName.split('.')[0];
      type = 'Object';
    }
    let fieldNameToValidate = `${fieldName}`;
    if (maintenance && fieldNameToValidate.charAt(0) === '_') {
      fieldNameToValidate = fieldNameToValidate.substring(1);
    }
    if (!fieldNameIsValid(fieldNameToValidate, className)) {
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
  async validateObject(className, object, query, maintenance) {
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
      promises.push(schema.enforceFieldExists(className, fieldName, expected, true, maintenance));
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
  ttl.duration = dbAdapter.schemaCacheTtl;
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfU3RvcmFnZUFkYXB0ZXIiLCJyZXF1aXJlIiwiX1NjaGVtYUNhY2hlIiwiX2ludGVyb3BSZXF1aXJlRGVmYXVsdCIsIl9EYXRhYmFzZUNvbnRyb2xsZXIiLCJfQ29uZmlnIiwiX2RlZXBjb3B5Iiwib2JqIiwiX19lc01vZHVsZSIsImRlZmF1bHQiLCJvd25LZXlzIiwib2JqZWN0IiwiZW51bWVyYWJsZU9ubHkiLCJrZXlzIiwiT2JqZWN0IiwiZ2V0T3duUHJvcGVydHlTeW1ib2xzIiwic3ltYm9scyIsImZpbHRlciIsInN5bSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImVudW1lcmFibGUiLCJwdXNoIiwiYXBwbHkiLCJfb2JqZWN0U3ByZWFkIiwidGFyZ2V0IiwiaSIsImFyZ3VtZW50cyIsImxlbmd0aCIsInNvdXJjZSIsImZvckVhY2giLCJrZXkiLCJfZGVmaW5lUHJvcGVydHkiLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3JzIiwiZGVmaW5lUHJvcGVydGllcyIsImRlZmluZVByb3BlcnR5IiwidmFsdWUiLCJfdG9Qcm9wZXJ0eUtleSIsImNvbmZpZ3VyYWJsZSIsIndyaXRhYmxlIiwiYXJnIiwiX3RvUHJpbWl0aXZlIiwiU3RyaW5nIiwiaW5wdXQiLCJoaW50IiwicHJpbSIsIlN5bWJvbCIsInRvUHJpbWl0aXZlIiwidW5kZWZpbmVkIiwicmVzIiwiY2FsbCIsIlR5cGVFcnJvciIsIk51bWJlciIsIl9leHRlbmRzIiwiYXNzaWduIiwiYmluZCIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiUGFyc2UiLCJkZWZhdWx0Q29sdW1ucyIsImZyZWV6ZSIsIl9EZWZhdWx0Iiwib2JqZWN0SWQiLCJ0eXBlIiwiY3JlYXRlZEF0IiwidXBkYXRlZEF0IiwiQUNMIiwiX1VzZXIiLCJ1c2VybmFtZSIsInBhc3N3b3JkIiwiZW1haWwiLCJlbWFpbFZlcmlmaWVkIiwiYXV0aERhdGEiLCJfSW5zdGFsbGF0aW9uIiwiaW5zdGFsbGF0aW9uSWQiLCJkZXZpY2VUb2tlbiIsImNoYW5uZWxzIiwiZGV2aWNlVHlwZSIsInB1c2hUeXBlIiwiR0NNU2VuZGVySWQiLCJ0aW1lWm9uZSIsImxvY2FsZUlkZW50aWZpZXIiLCJiYWRnZSIsImFwcFZlcnNpb24iLCJhcHBOYW1lIiwiYXBwSWRlbnRpZmllciIsInBhcnNlVmVyc2lvbiIsIl9Sb2xlIiwibmFtZSIsInVzZXJzIiwidGFyZ2V0Q2xhc3MiLCJyb2xlcyIsIl9TZXNzaW9uIiwidXNlciIsInNlc3Npb25Ub2tlbiIsImV4cGlyZXNBdCIsImNyZWF0ZWRXaXRoIiwiX1Byb2R1Y3QiLCJwcm9kdWN0SWRlbnRpZmllciIsImRvd25sb2FkIiwiZG93bmxvYWROYW1lIiwiaWNvbiIsIm9yZGVyIiwidGl0bGUiLCJzdWJ0aXRsZSIsIl9QdXNoU3RhdHVzIiwicHVzaFRpbWUiLCJxdWVyeSIsInBheWxvYWQiLCJleHBpcnkiLCJleHBpcmF0aW9uX2ludGVydmFsIiwic3RhdHVzIiwibnVtU2VudCIsIm51bUZhaWxlZCIsInB1c2hIYXNoIiwiZXJyb3JNZXNzYWdlIiwic2VudFBlclR5cGUiLCJmYWlsZWRQZXJUeXBlIiwic2VudFBlclVUQ09mZnNldCIsImZhaWxlZFBlclVUQ09mZnNldCIsImNvdW50IiwiX0pvYlN0YXR1cyIsImpvYk5hbWUiLCJtZXNzYWdlIiwicGFyYW1zIiwiZmluaXNoZWRBdCIsIl9Kb2JTY2hlZHVsZSIsImRlc2NyaXB0aW9uIiwic3RhcnRBZnRlciIsImRheXNPZldlZWsiLCJ0aW1lT2ZEYXkiLCJsYXN0UnVuIiwicmVwZWF0TWludXRlcyIsIl9Ib29rcyIsImZ1bmN0aW9uTmFtZSIsImNsYXNzTmFtZSIsInRyaWdnZXJOYW1lIiwidXJsIiwiX0dsb2JhbENvbmZpZyIsIm1hc3RlcktleU9ubHkiLCJfR3JhcGhRTENvbmZpZyIsImNvbmZpZyIsIl9BdWRpZW5jZSIsImxhc3RVc2VkIiwidGltZXNVc2VkIiwiX0lkZW1wb3RlbmN5IiwicmVxSWQiLCJleHBpcmUiLCJleHBvcnRzIiwicmVxdWlyZWRDb2x1bW5zIiwicmVhZCIsIndyaXRlIiwiaW52YWxpZENvbHVtbnMiLCJzeXN0ZW1DbGFzc2VzIiwidm9sYXRpbGVDbGFzc2VzIiwicm9sZVJlZ2V4IiwicHJvdGVjdGVkRmllbGRzUG9pbnRlclJlZ2V4IiwicHVibGljUmVnZXgiLCJhdXRoZW50aWNhdGVkUmVnZXgiLCJyZXF1aXJlc0F1dGhlbnRpY2F0aW9uUmVnZXgiLCJjbHBQb2ludGVyUmVnZXgiLCJwcm90ZWN0ZWRGaWVsZHNSZWdleCIsImNscEZpZWxkc1JlZ2V4IiwidmFsaWRhdGVQZXJtaXNzaW9uS2V5IiwidXNlcklkUmVnRXhwIiwibWF0Y2hlc1NvbWUiLCJyZWdFeCIsIm1hdGNoIiwidmFsaWQiLCJFcnJvciIsIklOVkFMSURfSlNPTiIsInZhbGlkYXRlUHJvdGVjdGVkRmllbGRzS2V5IiwiQ0xQVmFsaWRLZXlzIiwidmFsaWRhdGVDTFAiLCJwZXJtcyIsImZpZWxkcyIsIm9wZXJhdGlvbktleSIsImluZGV4T2YiLCJvcGVyYXRpb24iLCJ2YWxpZGF0ZUNMUGpzb24iLCJmaWVsZE5hbWUiLCJ2YWxpZGF0ZVBvaW50ZXJQZXJtaXNzaW9uIiwiZW50aXR5IiwicHJvdGVjdGVkRmllbGRzIiwiQXJyYXkiLCJpc0FycmF5IiwiZmllbGQiLCJwb2ludGVyRmllbGRzIiwicG9pbnRlckZpZWxkIiwicGVybWl0Iiwiam9pbkNsYXNzUmVnZXgiLCJjbGFzc0FuZEZpZWxkUmVnZXgiLCJjbGFzc05hbWVJc1ZhbGlkIiwidGVzdCIsImZpZWxkTmFtZUlzVmFsaWQiLCJpbmNsdWRlcyIsImZpZWxkTmFtZUlzVmFsaWRGb3JDbGFzcyIsImludmFsaWRDbGFzc05hbWVNZXNzYWdlIiwiaW52YWxpZEpzb25FcnJvciIsInZhbGlkTm9uUmVsYXRpb25PclBvaW50ZXJUeXBlcyIsImZpZWxkVHlwZUlzSW52YWxpZCIsIklOVkFMSURfQ0xBU1NfTkFNRSIsIklOQ09SUkVDVF9UWVBFIiwiY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSIsInNjaGVtYSIsImluamVjdERlZmF1bHRTY2hlbWEiLCJfcnBlcm0iLCJfd3Blcm0iLCJfaGFzaGVkX3Bhc3N3b3JkIiwiY29udmVydEFkYXB0ZXJTY2hlbWFUb1BhcnNlU2NoZW1hIiwiX3JlZiIsImluZGV4ZXMiLCJTY2hlbWFEYXRhIiwiY29uc3RydWN0b3IiLCJhbGxTY2hlbWFzIiwiX19kYXRhIiwiX19wcm90ZWN0ZWRGaWVsZHMiLCJnZXQiLCJkYXRhIiwiY2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiZGVlcGNvcHkiLCJjbGFzc1Byb3RlY3RlZEZpZWxkcyIsInVucSIsIlNldCIsImZyb20iLCJkZWZhdWx0U2NoZW1hIiwiX0hvb2tzU2NoZW1hIiwiX0dsb2JhbENvbmZpZ1NjaGVtYSIsIl9HcmFwaFFMQ29uZmlnU2NoZW1hIiwiX1B1c2hTdGF0dXNTY2hlbWEiLCJfSm9iU3RhdHVzU2NoZW1hIiwiX0pvYlNjaGVkdWxlU2NoZW1hIiwiX0F1ZGllbmNlU2NoZW1hIiwiX0lkZW1wb3RlbmN5U2NoZW1hIiwiVm9sYXRpbGVDbGFzc2VzU2NoZW1hcyIsImRiVHlwZU1hdGNoZXNPYmplY3RUeXBlIiwiZGJUeXBlIiwib2JqZWN0VHlwZSIsInR5cGVUb1N0cmluZyIsInR0bCIsImRhdGUiLCJEYXRlIiwibm93IiwiZHVyYXRpb24iLCJTY2hlbWFDb250cm9sbGVyIiwiZGF0YWJhc2VBZGFwdGVyIiwiX2RiQWRhcHRlciIsIkNvbmZpZyIsImFwcGxpY2F0aW9uSWQiLCJzY2hlbWFEYXRhIiwiU2NoZW1hQ2FjaGUiLCJhbGwiLCJjdXN0b21JZHMiLCJhbGxvd0N1c3RvbU9iamVjdElkIiwiY3VzdG9tSWRSZWdFeCIsImF1dG9JZFJlZ0V4IiwidXNlcklkUmVnRXgiLCJ3YXRjaCIsInJlbG9hZERhdGEiLCJjbGVhckNhY2hlIiwicmVsb2FkRGF0YUlmTmVlZGVkIiwiZW5hYmxlU2NoZW1hSG9va3MiLCJvcHRpb25zIiwicmVsb2FkRGF0YVByb21pc2UiLCJnZXRBbGxDbGFzc2VzIiwidGhlbiIsImVyciIsInNldEFsbENsYXNzZXMiLCJjYWNoZWQiLCJQcm9taXNlIiwicmVzb2x2ZSIsIm1hcCIsInB1dCIsImdldE9uZVNjaGVtYSIsImFsbG93Vm9sYXRpbGVDbGFzc2VzIiwiY2xlYXIiLCJvbmVTY2hlbWEiLCJmaW5kIiwicmVqZWN0IiwiYWRkQ2xhc3NJZk5vdEV4aXN0cyIsInZhbGlkYXRpb25FcnJvciIsInZhbGlkYXRlTmV3Q2xhc3MiLCJjb2RlIiwiZXJyb3IiLCJhZGFwdGVyU2NoZW1hIiwiY3JlYXRlQ2xhc3MiLCJwYXJzZVNjaGVtYSIsIkRVUExJQ0FURV9WQUxVRSIsInVwZGF0ZUNsYXNzIiwic3VibWl0dGVkRmllbGRzIiwiZGF0YWJhc2UiLCJleGlzdGluZ0ZpZWxkcyIsIl9fb3AiLCJuZXdTY2hlbWEiLCJidWlsZE1lcmdlZFNjaGVtYU9iamVjdCIsImRlZmF1bHRGaWVsZHMiLCJmdWxsTmV3U2NoZW1hIiwidmFsaWRhdGVTY2hlbWFEYXRhIiwiZGVsZXRlZEZpZWxkcyIsImluc2VydGVkRmllbGRzIiwiZGVsZXRlUHJvbWlzZSIsImRlbGV0ZUZpZWxkcyIsImVuZm9yY2VGaWVsZHMiLCJwcm9taXNlcyIsImVuZm9yY2VGaWVsZEV4aXN0cyIsInJlc3VsdHMiLCJyZXN1bHQiLCJzZXRQZXJtaXNzaW9ucyIsInNldEluZGV4ZXNXaXRoU2NoZW1hRm9ybWF0IiwiZW5zdXJlRmllbGRzIiwicmVsb2FkZWRTY2hlbWEiLCJjYXRjaCIsImVuZm9yY2VDbGFzc0V4aXN0cyIsImV4aXN0aW5nRmllbGROYW1lcyIsIklOVkFMSURfS0VZX05BTUUiLCJmaWVsZFR5cGUiLCJkZWZhdWx0VmFsdWUiLCJkZWZhdWx0VmFsdWVUeXBlIiwiZ2V0VHlwZSIsInJlcXVpcmVkIiwiZ2VvUG9pbnRzIiwic2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiaXNWYWxpZGF0aW9uIiwibWFpbnRlbmFuY2UiLCJzcGxpdCIsImZpZWxkTmFtZVRvVmFsaWRhdGUiLCJjaGFyQXQiLCJzdWJzdHJpbmciLCJleHBlY3RlZFR5cGUiLCJnZXRFeHBlY3RlZFR5cGUiLCJKU09OIiwic3RyaW5naWZ5IiwidXBkYXRlRmllbGRPcHRpb25zIiwiYWRkRmllbGRJZk5vdEV4aXN0cyIsImRlbGV0ZUZpZWxkIiwiZmllbGROYW1lcyIsInNjaGVtYUZpZWxkcyIsImFkYXB0ZXIiLCJkZWxldGVDbGFzcyIsInZhbGlkYXRlT2JqZWN0IiwiZ2VvY291bnQiLCJleHBlY3RlZCIsInByb21pc2UiLCJ0aGVuVmFsaWRhdGVSZXF1aXJlZENvbHVtbnMiLCJ2YWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyIsImNvbHVtbnMiLCJtaXNzaW5nQ29sdW1ucyIsImNvbHVtbiIsInRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZSIsImFjbEdyb3VwIiwidGVzdFBlcm1pc3Npb25zIiwiZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zIiwiY2xhc3NQZXJtaXNzaW9ucyIsInNvbWUiLCJhY2wiLCJ2YWxpZGF0ZVBlcm1pc3Npb24iLCJhY3Rpb24iLCJPQkpFQ1RfTk9UX0ZPVU5EIiwicGVybWlzc2lvbkZpZWxkIiwiT1BFUkFUSU9OX0ZPUkJJRERFTiIsImhhc0NsYXNzIiwibG9hZCIsImRiQWRhcHRlciIsInNjaGVtYUNhY2hlVHRsIiwicHV0UmVxdWVzdCIsInN5c1NjaGVtYUZpZWxkIiwiX2lkIiwib2xkRmllbGQiLCJmaWVsZElzRGVsZXRlZCIsIm5ld0ZpZWxkIiwic2NoZW1hUHJvbWlzZSIsImdldE9iamVjdFR5cGUiLCJfX3R5cGUiLCJpc28iLCJsYXRpdHVkZSIsImxvbmdpdHVkZSIsImJhc2U2NCIsImNvb3JkaW5hdGVzIiwib2JqZWN0cyIsIm9wcyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9Db250cm9sbGVycy9TY2hlbWFDb250cm9sbGVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbIi8vIEBmbG93XG4vLyBUaGlzIGNsYXNzIGhhbmRsZXMgc2NoZW1hIHZhbGlkYXRpb24sIHBlcnNpc3RlbmNlLCBhbmQgbW9kaWZpY2F0aW9uLlxuLy9cbi8vIEVhY2ggaW5kaXZpZHVhbCBTY2hlbWEgb2JqZWN0IHNob3VsZCBiZSBpbW11dGFibGUuIFRoZSBoZWxwZXJzIHRvXG4vLyBkbyB0aGluZ3Mgd2l0aCB0aGUgU2NoZW1hIGp1c3QgcmV0dXJuIGEgbmV3IHNjaGVtYSB3aGVuIHRoZSBzY2hlbWFcbi8vIGlzIGNoYW5nZWQuXG4vL1xuLy8gVGhlIGNhbm9uaWNhbCBwbGFjZSB0byBzdG9yZSB0aGlzIFNjaGVtYSBpcyBpbiB0aGUgZGF0YWJhc2UgaXRzZWxmLFxuLy8gaW4gYSBfU0NIRU1BIGNvbGxlY3Rpb24uIFRoaXMgaXMgbm90IHRoZSByaWdodCB3YXkgdG8gZG8gaXQgZm9yIGFuXG4vLyBvcGVuIHNvdXJjZSBmcmFtZXdvcmssIGJ1dCBpdCdzIGJhY2t3YXJkIGNvbXBhdGlibGUsIHNvIHdlJ3JlXG4vLyBrZWVwaW5nIGl0IHRoaXMgd2F5IGZvciBub3cuXG4vL1xuLy8gSW4gQVBJLWhhbmRsaW5nIGNvZGUsIHlvdSBzaG91bGQgb25seSB1c2UgdGhlIFNjaGVtYSBjbGFzcyB2aWEgdGhlXG4vLyBEYXRhYmFzZUNvbnRyb2xsZXIuIFRoaXMgd2lsbCBsZXQgdXMgcmVwbGFjZSB0aGUgc2NoZW1hIGxvZ2ljIGZvclxuLy8gZGlmZmVyZW50IGRhdGFiYXNlcy5cbi8vIFRPRE86IGhpZGUgYWxsIHNjaGVtYSBsb2dpYyBpbnNpZGUgdGhlIGRhdGFiYXNlIGFkYXB0ZXIuXG4vLyBAZmxvdy1kaXNhYmxlLW5leHRcbmNvbnN0IFBhcnNlID0gcmVxdWlyZSgncGFyc2Uvbm9kZScpLlBhcnNlO1xuaW1wb3J0IHsgU3RvcmFnZUFkYXB0ZXIgfSBmcm9tICcuLi9BZGFwdGVycy9TdG9yYWdlL1N0b3JhZ2VBZGFwdGVyJztcbmltcG9ydCBTY2hlbWFDYWNoZSBmcm9tICcuLi9BZGFwdGVycy9DYWNoZS9TY2hlbWFDYWNoZSc7XG5pbXBvcnQgRGF0YWJhc2VDb250cm9sbGVyIGZyb20gJy4vRGF0YWJhc2VDb250cm9sbGVyJztcbmltcG9ydCBDb25maWcgZnJvbSAnLi4vQ29uZmlnJztcbi8vIEBmbG93LWRpc2FibGUtbmV4dFxuaW1wb3J0IGRlZXBjb3B5IGZyb20gJ2RlZXBjb3B5JztcbmltcG9ydCB0eXBlIHtcbiAgU2NoZW1hLFxuICBTY2hlbWFGaWVsZHMsXG4gIENsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgU2NoZW1hRmllbGQsXG4gIExvYWRTY2hlbWFPcHRpb25zLFxufSBmcm9tICcuL3R5cGVzJztcblxuY29uc3QgZGVmYXVsdENvbHVtbnM6IHsgW3N0cmluZ106IFNjaGVtYUZpZWxkcyB9ID0gT2JqZWN0LmZyZWV6ZSh7XG4gIC8vIENvbnRhaW4gdGhlIGRlZmF1bHQgY29sdW1ucyBmb3IgZXZlcnkgcGFyc2Ugb2JqZWN0IHR5cGUgKGV4Y2VwdCBfSm9pbiBjb2xsZWN0aW9uKVxuICBfRGVmYXVsdDoge1xuICAgIG9iamVjdElkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgY3JlYXRlZEF0OiB7IHR5cGU6ICdEYXRlJyB9LFxuICAgIHVwZGF0ZWRBdDogeyB0eXBlOiAnRGF0ZScgfSxcbiAgICBBQ0w6IHsgdHlwZTogJ0FDTCcgfSxcbiAgfSxcbiAgLy8gVGhlIGFkZGl0aW9uYWwgZGVmYXVsdCBjb2x1bW5zIGZvciB0aGUgX1VzZXIgY29sbGVjdGlvbiAoaW4gYWRkaXRpb24gdG8gRGVmYXVsdENvbHMpXG4gIF9Vc2VyOiB7XG4gICAgdXNlcm5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwYXNzd29yZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGVtYWlsOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZW1haWxWZXJpZmllZDogeyB0eXBlOiAnQm9vbGVhbicgfSxcbiAgICBhdXRoRGF0YTogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICB9LFxuICAvLyBUaGUgYWRkaXRpb25hbCBkZWZhdWx0IGNvbHVtbnMgZm9yIHRoZSBfSW5zdGFsbGF0aW9uIGNvbGxlY3Rpb24gKGluIGFkZGl0aW9uIHRvIERlZmF1bHRDb2xzKVxuICBfSW5zdGFsbGF0aW9uOiB7XG4gICAgaW5zdGFsbGF0aW9uSWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBkZXZpY2VUb2tlbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGNoYW5uZWxzOiB7IHR5cGU6ICdBcnJheScgfSxcbiAgICBkZXZpY2VUeXBlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcHVzaFR5cGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBHQ01TZW5kZXJJZDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHRpbWVab25lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgbG9jYWxlSWRlbnRpZmllcjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGJhZGdlOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgYXBwVmVyc2lvbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGFwcE5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBhcHBJZGVudGlmaWVyOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFyc2VWZXJzaW9uOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gIH0sXG4gIC8vIFRoZSBhZGRpdGlvbmFsIGRlZmF1bHQgY29sdW1ucyBmb3IgdGhlIF9Sb2xlIGNvbGxlY3Rpb24gKGluIGFkZGl0aW9uIHRvIERlZmF1bHRDb2xzKVxuICBfUm9sZToge1xuICAgIG5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICB1c2VyczogeyB0eXBlOiAnUmVsYXRpb24nLCB0YXJnZXRDbGFzczogJ19Vc2VyJyB9LFxuICAgIHJvbGVzOiB7IHR5cGU6ICdSZWxhdGlvbicsIHRhcmdldENsYXNzOiAnX1JvbGUnIH0sXG4gIH0sXG4gIC8vIFRoZSBhZGRpdGlvbmFsIGRlZmF1bHQgY29sdW1ucyBmb3IgdGhlIF9TZXNzaW9uIGNvbGxlY3Rpb24gKGluIGFkZGl0aW9uIHRvIERlZmF1bHRDb2xzKVxuICBfU2Vzc2lvbjoge1xuICAgIHVzZXI6IHsgdHlwZTogJ1BvaW50ZXInLCB0YXJnZXRDbGFzczogJ19Vc2VyJyB9LFxuICAgIGluc3RhbGxhdGlvbklkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc2Vzc2lvblRva2VuOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZXhwaXJlc0F0OiB7IHR5cGU6ICdEYXRlJyB9LFxuICAgIGNyZWF0ZWRXaXRoOiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gIH0sXG4gIF9Qcm9kdWN0OiB7XG4gICAgcHJvZHVjdElkZW50aWZpZXI6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBkb3dubG9hZDogeyB0eXBlOiAnRmlsZScgfSxcbiAgICBkb3dubG9hZE5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBpY29uOiB7IHR5cGU6ICdGaWxlJyB9LFxuICAgIG9yZGVyOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgdGl0bGU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzdWJ0aXRsZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICB9LFxuICBfUHVzaFN0YXR1czoge1xuICAgIHB1c2hUaW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgc291cmNlOiB7IHR5cGU6ICdTdHJpbmcnIH0sIC8vIHJlc3Qgb3Igd2VidWlcbiAgICBxdWVyeTogeyB0eXBlOiAnU3RyaW5nJyB9LCAvLyB0aGUgc3RyaW5naWZpZWQgSlNPTiBxdWVyeVxuICAgIHBheWxvYWQ6IHsgdHlwZTogJ1N0cmluZycgfSwgLy8gdGhlIHN0cmluZ2lmaWVkIEpTT04gcGF5bG9hZCxcbiAgICB0aXRsZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIGV4cGlyeTogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICAgIGV4cGlyYXRpb25faW50ZXJ2YWw6IHsgdHlwZTogJ051bWJlcicgfSxcbiAgICBzdGF0dXM6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBudW1TZW50OiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgbnVtRmFpbGVkOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgcHVzaEhhc2g6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBlcnJvck1lc3NhZ2U6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBzZW50UGVyVHlwZTogeyB0eXBlOiAnT2JqZWN0JyB9LFxuICAgIGZhaWxlZFBlclR5cGU6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBzZW50UGVyVVRDT2Zmc2V0OiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgZmFpbGVkUGVyVVRDT2Zmc2V0OiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gICAgY291bnQ6IHsgdHlwZTogJ051bWJlcicgfSwgLy8gdHJhY2tzICMgb2YgYmF0Y2hlcyBxdWV1ZWQgYW5kIHBlbmRpbmdcbiAgfSxcbiAgX0pvYlN0YXR1czoge1xuICAgIGpvYk5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzb3VyY2U6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBzdGF0dXM6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBtZXNzYWdlOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcGFyYW1zOiB7IHR5cGU6ICdPYmplY3QnIH0sIC8vIHBhcmFtcyByZWNlaXZlZCB3aGVuIGNhbGxpbmcgdGhlIGpvYlxuICAgIGZpbmlzaGVkQXQ6IHsgdHlwZTogJ0RhdGUnIH0sXG4gIH0sXG4gIF9Kb2JTY2hlZHVsZToge1xuICAgIGpvYk5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBkZXNjcmlwdGlvbjogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHBhcmFtczogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHN0YXJ0QWZ0ZXI6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBkYXlzT2ZXZWVrOiB7IHR5cGU6ICdBcnJheScgfSxcbiAgICB0aW1lT2ZEYXk6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBsYXN0UnVuOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gICAgcmVwZWF0TWludXRlczogeyB0eXBlOiAnTnVtYmVyJyB9LFxuICB9LFxuICBfSG9va3M6IHtcbiAgICBmdW5jdGlvbk5hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBjbGFzc05hbWU6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICB0cmlnZ2VyTmFtZTogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICAgIHVybDogeyB0eXBlOiAnU3RyaW5nJyB9LFxuICB9LFxuICBfR2xvYmFsQ29uZmlnOiB7XG4gICAgb2JqZWN0SWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBwYXJhbXM6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgICBtYXN0ZXJLZXlPbmx5OiB7IHR5cGU6ICdPYmplY3QnIH0sXG4gIH0sXG4gIF9HcmFwaFFMQ29uZmlnOiB7XG4gICAgb2JqZWN0SWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBjb25maWc6IHsgdHlwZTogJ09iamVjdCcgfSxcbiAgfSxcbiAgX0F1ZGllbmNlOiB7XG4gICAgb2JqZWN0SWQ6IHsgdHlwZTogJ1N0cmluZycgfSxcbiAgICBuYW1lOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgcXVlcnk6IHsgdHlwZTogJ1N0cmluZycgfSwgLy9zdG9yaW5nIHF1ZXJ5IGFzIEpTT04gc3RyaW5nIHRvIHByZXZlbnQgXCJOZXN0ZWQga2V5cyBzaG91bGQgbm90IGNvbnRhaW4gdGhlICckJyBvciAnLicgY2hhcmFjdGVyc1wiIGVycm9yXG4gICAgbGFzdFVzZWQ6IHsgdHlwZTogJ0RhdGUnIH0sXG4gICAgdGltZXNVc2VkOiB7IHR5cGU6ICdOdW1iZXInIH0sXG4gIH0sXG4gIF9JZGVtcG90ZW5jeToge1xuICAgIHJlcUlkOiB7IHR5cGU6ICdTdHJpbmcnIH0sXG4gICAgZXhwaXJlOiB7IHR5cGU6ICdEYXRlJyB9LFxuICB9LFxufSk7XG5cbi8vIGZpZWxkcyByZXF1aXJlZCBmb3IgcmVhZCBvciB3cml0ZSBvcGVyYXRpb25zIG9uIHRoZWlyIHJlc3BlY3RpdmUgY2xhc3Nlcy5cbmNvbnN0IHJlcXVpcmVkQ29sdW1ucyA9IE9iamVjdC5mcmVlemUoe1xuICByZWFkOiB7XG4gICAgX1VzZXI6IFsndXNlcm5hbWUnXSxcbiAgfSxcbiAgd3JpdGU6IHtcbiAgICBfUHJvZHVjdDogWydwcm9kdWN0SWRlbnRpZmllcicsICdpY29uJywgJ29yZGVyJywgJ3RpdGxlJywgJ3N1YnRpdGxlJ10sXG4gICAgX1JvbGU6IFsnbmFtZScsICdBQ0wnXSxcbiAgfSxcbn0pO1xuXG5jb25zdCBpbnZhbGlkQ29sdW1ucyA9IFsnbGVuZ3RoJ107XG5cbmNvbnN0IHN5c3RlbUNsYXNzZXMgPSBPYmplY3QuZnJlZXplKFtcbiAgJ19Vc2VyJyxcbiAgJ19JbnN0YWxsYXRpb24nLFxuICAnX1JvbGUnLFxuICAnX1Nlc3Npb24nLFxuICAnX1Byb2R1Y3QnLFxuICAnX1B1c2hTdGF0dXMnLFxuICAnX0pvYlN0YXR1cycsXG4gICdfSm9iU2NoZWR1bGUnLFxuICAnX0F1ZGllbmNlJyxcbiAgJ19JZGVtcG90ZW5jeScsXG5dKTtcblxuY29uc3Qgdm9sYXRpbGVDbGFzc2VzID0gT2JqZWN0LmZyZWV6ZShbXG4gICdfSm9iU3RhdHVzJyxcbiAgJ19QdXNoU3RhdHVzJyxcbiAgJ19Ib29rcycsXG4gICdfR2xvYmFsQ29uZmlnJyxcbiAgJ19HcmFwaFFMQ29uZmlnJyxcbiAgJ19Kb2JTY2hlZHVsZScsXG4gICdfQXVkaWVuY2UnLFxuICAnX0lkZW1wb3RlbmN5Jyxcbl0pO1xuXG4vLyBBbnl0aGluZyB0aGF0IHN0YXJ0IHdpdGggcm9sZVxuY29uc3Qgcm9sZVJlZ2V4ID0gL15yb2xlOi4qLztcbi8vIEFueXRoaW5nIHRoYXQgc3RhcnRzIHdpdGggdXNlckZpZWxkIChhbGxvd2VkIGZvciBwcm90ZWN0ZWQgZmllbGRzIG9ubHkpXG5jb25zdCBwcm90ZWN0ZWRGaWVsZHNQb2ludGVyUmVnZXggPSAvXnVzZXJGaWVsZDouKi87XG4vLyAqIHBlcm1pc3Npb25cbmNvbnN0IHB1YmxpY1JlZ2V4ID0gL15cXCokLztcblxuY29uc3QgYXV0aGVudGljYXRlZFJlZ2V4ID0gL15hdXRoZW50aWNhdGVkJC87XG5cbmNvbnN0IHJlcXVpcmVzQXV0aGVudGljYXRpb25SZWdleCA9IC9ecmVxdWlyZXNBdXRoZW50aWNhdGlvbiQvO1xuXG5jb25zdCBjbHBQb2ludGVyUmVnZXggPSAvXnBvaW50ZXJGaWVsZHMkLztcblxuLy8gcmVnZXggZm9yIHZhbGlkYXRpbmcgZW50aXRpZXMgaW4gcHJvdGVjdGVkRmllbGRzIG9iamVjdFxuY29uc3QgcHJvdGVjdGVkRmllbGRzUmVnZXggPSBPYmplY3QuZnJlZXplKFtcbiAgcHJvdGVjdGVkRmllbGRzUG9pbnRlclJlZ2V4LFxuICBwdWJsaWNSZWdleCxcbiAgYXV0aGVudGljYXRlZFJlZ2V4LFxuICByb2xlUmVnZXgsXG5dKTtcblxuLy8gY2xwIHJlZ2V4XG5jb25zdCBjbHBGaWVsZHNSZWdleCA9IE9iamVjdC5mcmVlemUoW1xuICBjbHBQb2ludGVyUmVnZXgsXG4gIHB1YmxpY1JlZ2V4LFxuICByZXF1aXJlc0F1dGhlbnRpY2F0aW9uUmVnZXgsXG4gIHJvbGVSZWdleCxcbl0pO1xuXG5mdW5jdGlvbiB2YWxpZGF0ZVBlcm1pc3Npb25LZXkoa2V5LCB1c2VySWRSZWdFeHApIHtcbiAgbGV0IG1hdGNoZXNTb21lID0gZmFsc2U7XG4gIGZvciAoY29uc3QgcmVnRXggb2YgY2xwRmllbGRzUmVnZXgpIHtcbiAgICBpZiAoa2V5Lm1hdGNoKHJlZ0V4KSAhPT0gbnVsbCkge1xuICAgICAgbWF0Y2hlc1NvbWUgPSB0cnVlO1xuICAgICAgYnJlYWs7XG4gICAgfVxuICB9XG5cbiAgLy8gdXNlcklkIGRlcGVuZHMgb24gc3RhcnR1cCBvcHRpb25zIHNvIGl0J3MgZHluYW1pY1xuICBjb25zdCB2YWxpZCA9IG1hdGNoZXNTb21lIHx8IGtleS5tYXRjaCh1c2VySWRSZWdFeHApICE9PSBudWxsO1xuICBpZiAoIXZhbGlkKSB7XG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgYCcke2tleX0nIGlzIG5vdCBhIHZhbGlkIGtleSBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnNgXG4gICAgKTtcbiAgfVxufVxuXG5mdW5jdGlvbiB2YWxpZGF0ZVByb3RlY3RlZEZpZWxkc0tleShrZXksIHVzZXJJZFJlZ0V4cCkge1xuICBsZXQgbWF0Y2hlc1NvbWUgPSBmYWxzZTtcbiAgZm9yIChjb25zdCByZWdFeCBvZiBwcm90ZWN0ZWRGaWVsZHNSZWdleCkge1xuICAgIGlmIChrZXkubWF0Y2gocmVnRXgpICE9PSBudWxsKSB7XG4gICAgICBtYXRjaGVzU29tZSA9IHRydWU7XG4gICAgICBicmVhaztcbiAgICB9XG4gIH1cblxuICAvLyB1c2VySWQgcmVnZXggZGVwZW5kcyBvbiBsYXVuY2ggb3B0aW9ucyBzbyBpdCdzIGR5bmFtaWNcbiAgY29uc3QgdmFsaWQgPSBtYXRjaGVzU29tZSB8fCBrZXkubWF0Y2godXNlcklkUmVnRXhwKSAhPT0gbnVsbDtcbiAgaWYgKCF2YWxpZCkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgIGAnJHtrZXl9JyBpcyBub3QgYSB2YWxpZCBrZXkgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zYFxuICAgICk7XG4gIH1cbn1cblxuY29uc3QgQ0xQVmFsaWRLZXlzID0gT2JqZWN0LmZyZWV6ZShbXG4gICdmaW5kJyxcbiAgJ2NvdW50JyxcbiAgJ2dldCcsXG4gICdjcmVhdGUnLFxuICAndXBkYXRlJyxcbiAgJ2RlbGV0ZScsXG4gICdhZGRGaWVsZCcsXG4gICdyZWFkVXNlckZpZWxkcycsXG4gICd3cml0ZVVzZXJGaWVsZHMnLFxuICAncHJvdGVjdGVkRmllbGRzJyxcbl0pO1xuXG4vLyB2YWxpZGF0aW9uIGJlZm9yZSBzZXR0aW5nIGNsYXNzLWxldmVsIHBlcm1pc3Npb25zIG9uIGNvbGxlY3Rpb25cbmZ1bmN0aW9uIHZhbGlkYXRlQ0xQKHBlcm1zOiBDbGFzc0xldmVsUGVybWlzc2lvbnMsIGZpZWxkczogU2NoZW1hRmllbGRzLCB1c2VySWRSZWdFeHA6IFJlZ0V4cCkge1xuICBpZiAoIXBlcm1zKSB7XG4gICAgcmV0dXJuO1xuICB9XG4gIGZvciAoY29uc3Qgb3BlcmF0aW9uS2V5IGluIHBlcm1zKSB7XG4gICAgaWYgKENMUFZhbGlkS2V5cy5pbmRleE9mKG9wZXJhdGlvbktleSkgPT0gLTEpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICBgJHtvcGVyYXRpb25LZXl9IGlzIG5vdCBhIHZhbGlkIG9wZXJhdGlvbiBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnNgXG4gICAgICApO1xuICAgIH1cblxuICAgIGNvbnN0IG9wZXJhdGlvbiA9IHBlcm1zW29wZXJhdGlvbktleV07XG4gICAgLy8gcHJvY2VlZCB3aXRoIG5leHQgb3BlcmF0aW9uS2V5XG5cbiAgICAvLyB0aHJvd3Mgd2hlbiByb290IGZpZWxkcyBhcmUgb2Ygd3JvbmcgdHlwZVxuICAgIHZhbGlkYXRlQ0xQanNvbihvcGVyYXRpb24sIG9wZXJhdGlvbktleSk7XG5cbiAgICBpZiAob3BlcmF0aW9uS2V5ID09PSAncmVhZFVzZXJGaWVsZHMnIHx8IG9wZXJhdGlvbktleSA9PT0gJ3dyaXRlVXNlckZpZWxkcycpIHtcbiAgICAgIC8vIHZhbGlkYXRlIGdyb3VwZWQgcG9pbnRlciBwZXJtaXNzaW9uc1xuICAgICAgLy8gbXVzdCBiZSBhbiBhcnJheSB3aXRoIGZpZWxkIG5hbWVzXG4gICAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBvZiBvcGVyYXRpb24pIHtcbiAgICAgICAgdmFsaWRhdGVQb2ludGVyUGVybWlzc2lvbihmaWVsZE5hbWUsIGZpZWxkcywgb3BlcmF0aW9uS2V5KTtcbiAgICAgIH1cbiAgICAgIC8vIHJlYWRVc2VyRmllbGRzIGFuZCB3cml0ZXJVc2VyRmllbGRzIGRvIG5vdCBoYXZlIG5lc2R0ZWQgZmllbGRzXG4gICAgICAvLyBwcm9jZWVkIHdpdGggbmV4dCBvcGVyYXRpb25LZXlcbiAgICAgIGNvbnRpbnVlO1xuICAgIH1cblxuICAgIC8vIHZhbGlkYXRlIHByb3RlY3RlZCBmaWVsZHNcbiAgICBpZiAob3BlcmF0aW9uS2V5ID09PSAncHJvdGVjdGVkRmllbGRzJykge1xuICAgICAgZm9yIChjb25zdCBlbnRpdHkgaW4gb3BlcmF0aW9uKSB7XG4gICAgICAgIC8vIHRocm93cyBvbiB1bmV4cGVjdGVkIGtleVxuICAgICAgICB2YWxpZGF0ZVByb3RlY3RlZEZpZWxkc0tleShlbnRpdHksIHVzZXJJZFJlZ0V4cCk7XG5cbiAgICAgICAgY29uc3QgcHJvdGVjdGVkRmllbGRzID0gb3BlcmF0aW9uW2VudGl0eV07XG5cbiAgICAgICAgaWYgKCFBcnJheS5pc0FycmF5KHByb3RlY3RlZEZpZWxkcykpIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgJyR7cHJvdGVjdGVkRmllbGRzfScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yIHByb3RlY3RlZEZpZWxkc1ske2VudGl0eX1dIC0gZXhwZWN0ZWQgYW4gYXJyYXkuYFxuICAgICAgICAgICk7XG4gICAgICAgIH1cblxuICAgICAgICAvLyBpZiB0aGUgZmllbGQgaXMgaW4gZm9ybSBvZiBhcnJheVxuICAgICAgICBmb3IgKGNvbnN0IGZpZWxkIG9mIHByb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgIC8vIGRvIG5vdCBhbGxvb3cgdG8gcHJvdGVjdCBkZWZhdWx0IGZpZWxkc1xuICAgICAgICAgIGlmIChkZWZhdWx0Q29sdW1ucy5fRGVmYXVsdFtmaWVsZF0pIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgICAgICBgRGVmYXVsdCBmaWVsZCAnJHtmaWVsZH0nIGNhbiBub3QgYmUgcHJvdGVjdGVkYFxuICAgICAgICAgICAgKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgLy8gZmllbGQgc2hvdWxkIGV4aXN0IG9uIGNvbGxlY3Rpb25cbiAgICAgICAgICBpZiAoIU9iamVjdC5wcm90b3R5cGUuaGFzT3duUHJvcGVydHkuY2FsbChmaWVsZHMsIGZpZWxkKSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICAgIGBGaWVsZCAnJHtmaWVsZH0nIGluIHByb3RlY3RlZEZpZWxkczoke2VudGl0eX0gZG9lcyBub3QgZXhpc3RgXG4gICAgICAgICAgICApO1xuICAgICAgICAgIH1cbiAgICAgICAgfVxuICAgICAgfVxuICAgICAgLy8gcHJvY2VlZCB3aXRoIG5leHQgb3BlcmF0aW9uS2V5XG4gICAgICBjb250aW51ZTtcbiAgICB9XG5cbiAgICAvLyB2YWxpZGF0ZSBvdGhlciBmaWVsZHNcbiAgICAvLyBFbnRpdHkgY2FuIGJlOlxuICAgIC8vIFwiKlwiIC0gUHVibGljLFxuICAgIC8vIFwicmVxdWlyZXNBdXRoZW50aWNhdGlvblwiIC0gYXV0aGVudGljYXRlZCB1c2VycyxcbiAgICAvLyBcIm9iamVjdElkXCIgLSBfVXNlciBpZCxcbiAgICAvLyBcInJvbGU6cm9sZW5hbWVcIixcbiAgICAvLyBcInBvaW50ZXJGaWVsZHNcIiAtIGFycmF5IG9mIGZpZWxkIG5hbWVzIGNvbnRhaW5pbmcgcG9pbnRlcnMgdG8gdXNlcnNcbiAgICBmb3IgKGNvbnN0IGVudGl0eSBpbiBvcGVyYXRpb24pIHtcbiAgICAgIC8vIHRocm93cyBvbiB1bmV4cGVjdGVkIGtleVxuICAgICAgdmFsaWRhdGVQZXJtaXNzaW9uS2V5KGVudGl0eSwgdXNlcklkUmVnRXhwKTtcblxuICAgICAgLy8gZW50aXR5IGNhbiBiZSBlaXRoZXI6XG4gICAgICAvLyBcInBvaW50ZXJGaWVsZHNcIjogc3RyaW5nW11cbiAgICAgIGlmIChlbnRpdHkgPT09ICdwb2ludGVyRmllbGRzJykge1xuICAgICAgICBjb25zdCBwb2ludGVyRmllbGRzID0gb3BlcmF0aW9uW2VudGl0eV07XG5cbiAgICAgICAgaWYgKEFycmF5LmlzQXJyYXkocG9pbnRlckZpZWxkcykpIHtcbiAgICAgICAgICBmb3IgKGNvbnN0IHBvaW50ZXJGaWVsZCBvZiBwb2ludGVyRmllbGRzKSB7XG4gICAgICAgICAgICB2YWxpZGF0ZVBvaW50ZXJQZXJtaXNzaW9uKHBvaW50ZXJGaWVsZCwgZmllbGRzLCBvcGVyYXRpb24pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTlZBTElEX0pTT04sXG4gICAgICAgICAgICBgJyR7cG9pbnRlckZpZWxkc30nIGlzIG5vdCBhIHZhbGlkIHZhbHVlIGZvciAke29wZXJhdGlvbktleX1bJHtlbnRpdHl9XSAtIGV4cGVjdGVkIGFuIGFycmF5LmBcbiAgICAgICAgICApO1xuICAgICAgICB9XG4gICAgICAgIC8vIHByb2NlZWQgd2l0aCBuZXh0IGVudGl0eSBrZXlcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG5cbiAgICAgIC8vIG9yIFtlbnRpdHldOiBib29sZWFuXG4gICAgICBjb25zdCBwZXJtaXQgPSBvcGVyYXRpb25bZW50aXR5XTtcblxuICAgICAgaWYgKHBlcm1pdCAhPT0gdHJ1ZSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICAgIGAnJHtwZXJtaXR9JyBpcyBub3QgYSB2YWxpZCB2YWx1ZSBmb3IgY2xhc3MgbGV2ZWwgcGVybWlzc2lvbnMgJHtvcGVyYXRpb25LZXl9OiR7ZW50aXR5fToke3Blcm1pdH1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICB9XG59XG5cbmZ1bmN0aW9uIHZhbGlkYXRlQ0xQanNvbihvcGVyYXRpb246IGFueSwgb3BlcmF0aW9uS2V5OiBzdHJpbmcpIHtcbiAgaWYgKG9wZXJhdGlvbktleSA9PT0gJ3JlYWRVc2VyRmllbGRzJyB8fCBvcGVyYXRpb25LZXkgPT09ICd3cml0ZVVzZXJGaWVsZHMnKSB7XG4gICAgaWYgKCFBcnJheS5pc0FycmF5KG9wZXJhdGlvbikpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICBgJyR7b3BlcmF0aW9ufScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zICR7b3BlcmF0aW9uS2V5fSAtIG11c3QgYmUgYW4gYXJyYXlgXG4gICAgICApO1xuICAgIH1cbiAgfSBlbHNlIHtcbiAgICBpZiAodHlwZW9mIG9wZXJhdGlvbiA9PT0gJ29iamVjdCcgJiYgb3BlcmF0aW9uICE9PSBudWxsKSB7XG4gICAgICAvLyBvayB0byBwcm9jZWVkXG4gICAgICByZXR1cm47XG4gICAgfSBlbHNlIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLFxuICAgICAgICBgJyR7b3BlcmF0aW9ufScgaXMgbm90IGEgdmFsaWQgdmFsdWUgZm9yIGNsYXNzIGxldmVsIHBlcm1pc3Npb25zICR7b3BlcmF0aW9uS2V5fSAtIG11c3QgYmUgYW4gb2JqZWN0YFxuICAgICAgKTtcbiAgICB9XG4gIH1cbn1cblxuZnVuY3Rpb24gdmFsaWRhdGVQb2ludGVyUGVybWlzc2lvbihmaWVsZE5hbWU6IHN0cmluZywgZmllbGRzOiBPYmplY3QsIG9wZXJhdGlvbjogc3RyaW5nKSB7XG4gIC8vIFVzZXMgY29sbGVjdGlvbiBzY2hlbWEgdG8gZW5zdXJlIHRoZSBmaWVsZCBpcyBvZiB0eXBlOlxuICAvLyAtIFBvaW50ZXI8X1VzZXI+IChwb2ludGVycylcbiAgLy8gLSBBcnJheVxuICAvL1xuICAvLyAgICBJdCdzIG5vdCBwb3NzaWJsZSB0byBlbmZvcmNlIHR5cGUgb24gQXJyYXkncyBpdGVtcyBpbiBzY2hlbWFcbiAgLy8gIHNvIHdlIGFjY2VwdCBhbnkgQXJyYXkgZmllbGQsIGFuZCBsYXRlciB3aGVuIGFwcGx5aW5nIHBlcm1pc3Npb25zXG4gIC8vICBvbmx5IGl0ZW1zIHRoYXQgYXJlIHBvaW50ZXJzIHRvIF9Vc2VyIGFyZSBjb25zaWRlcmVkLlxuICBpZiAoXG4gICAgIShcbiAgICAgIGZpZWxkc1tmaWVsZE5hbWVdICYmXG4gICAgICAoKGZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT0gJ1BvaW50ZXInICYmIGZpZWxkc1tmaWVsZE5hbWVdLnRhcmdldENsYXNzID09ICdfVXNlcicpIHx8XG4gICAgICAgIGZpZWxkc1tmaWVsZE5hbWVdLnR5cGUgPT0gJ0FycmF5JylcbiAgICApXG4gICkge1xuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfSlNPTixcbiAgICAgIGAnJHtmaWVsZE5hbWV9JyBpcyBub3QgYSB2YWxpZCBjb2x1bW4gZm9yIGNsYXNzIGxldmVsIHBvaW50ZXIgcGVybWlzc2lvbnMgJHtvcGVyYXRpb259YFxuICAgICk7XG4gIH1cbn1cblxuY29uc3Qgam9pbkNsYXNzUmVnZXggPSAvXl9Kb2luOltBLVphLXowLTlfXSs6W0EtWmEtejAtOV9dKy87XG5jb25zdCBjbGFzc0FuZEZpZWxkUmVnZXggPSAvXltBLVphLXpdW0EtWmEtejAtOV9dKiQvO1xuZnVuY3Rpb24gY2xhc3NOYW1lSXNWYWxpZChjbGFzc05hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICAvLyBWYWxpZCBjbGFzc2VzIG11c3Q6XG4gIHJldHVybiAoXG4gICAgLy8gQmUgb25lIG9mIF9Vc2VyLCBfSW5zdGFsbGF0aW9uLCBfUm9sZSwgX1Nlc3Npb24gT1JcbiAgICBzeXN0ZW1DbGFzc2VzLmluZGV4T2YoY2xhc3NOYW1lKSA+IC0xIHx8XG4gICAgLy8gQmUgYSBqb2luIHRhYmxlIE9SXG4gICAgam9pbkNsYXNzUmVnZXgudGVzdChjbGFzc05hbWUpIHx8XG4gICAgLy8gSW5jbHVkZSBvbmx5IGFscGhhLW51bWVyaWMgYW5kIHVuZGVyc2NvcmVzLCBhbmQgbm90IHN0YXJ0IHdpdGggYW4gdW5kZXJzY29yZSBvciBudW1iZXJcbiAgICBmaWVsZE5hbWVJc1ZhbGlkKGNsYXNzTmFtZSwgY2xhc3NOYW1lKVxuICApO1xufVxuXG4vLyBWYWxpZCBmaWVsZHMgbXVzdCBiZSBhbHBoYS1udW1lcmljLCBhbmQgbm90IHN0YXJ0IHdpdGggYW4gdW5kZXJzY29yZSBvciBudW1iZXJcbi8vIG11c3Qgbm90IGJlIGEgcmVzZXJ2ZWQga2V5XG5mdW5jdGlvbiBmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZTogc3RyaW5nLCBjbGFzc05hbWU6IHN0cmluZyk6IGJvb2xlYW4ge1xuICBpZiAoY2xhc3NOYW1lICYmIGNsYXNzTmFtZSAhPT0gJ19Ib29rcycpIHtcbiAgICBpZiAoZmllbGROYW1lID09PSAnY2xhc3NOYW1lJykge1xuICAgICAgcmV0dXJuIGZhbHNlO1xuICAgIH1cbiAgfVxuICByZXR1cm4gY2xhc3NBbmRGaWVsZFJlZ2V4LnRlc3QoZmllbGROYW1lKSAmJiAhaW52YWxpZENvbHVtbnMuaW5jbHVkZXMoZmllbGROYW1lKTtcbn1cblxuLy8gQ2hlY2tzIHRoYXQgaXQncyBub3QgdHJ5aW5nIHRvIGNsb2JiZXIgb25lIG9mIHRoZSBkZWZhdWx0IGZpZWxkcyBvZiB0aGUgY2xhc3MuXG5mdW5jdGlvbiBmaWVsZE5hbWVJc1ZhbGlkRm9yQ2xhc3MoZmllbGROYW1lOiBzdHJpbmcsIGNsYXNzTmFtZTogc3RyaW5nKTogYm9vbGVhbiB7XG4gIGlmICghZmllbGROYW1lSXNWYWxpZChmaWVsZE5hbWUsIGNsYXNzTmFtZSkpIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGRlZmF1bHRDb2x1bW5zLl9EZWZhdWx0W2ZpZWxkTmFtZV0pIHtcbiAgICByZXR1cm4gZmFsc2U7XG4gIH1cbiAgaWYgKGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV0gJiYgZGVmYXVsdENvbHVtbnNbY2xhc3NOYW1lXVtmaWVsZE5hbWVdKSB7XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG4gIHJldHVybiB0cnVlO1xufVxuXG5mdW5jdGlvbiBpbnZhbGlkQ2xhc3NOYW1lTWVzc2FnZShjbGFzc05hbWU6IHN0cmluZyk6IHN0cmluZyB7XG4gIHJldHVybiAoXG4gICAgJ0ludmFsaWQgY2xhc3NuYW1lOiAnICtcbiAgICBjbGFzc05hbWUgK1xuICAgICcsIGNsYXNzbmFtZXMgY2FuIG9ubHkgaGF2ZSBhbHBoYW51bWVyaWMgY2hhcmFjdGVycyBhbmQgXywgYW5kIG11c3Qgc3RhcnQgd2l0aCBhbiBhbHBoYSBjaGFyYWN0ZXIgJ1xuICApO1xufVxuXG5jb25zdCBpbnZhbGlkSnNvbkVycm9yID0gbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ2ludmFsaWQgSlNPTicpO1xuY29uc3QgdmFsaWROb25SZWxhdGlvbk9yUG9pbnRlclR5cGVzID0gW1xuICAnTnVtYmVyJyxcbiAgJ1N0cmluZycsXG4gICdCb29sZWFuJyxcbiAgJ0RhdGUnLFxuICAnT2JqZWN0JyxcbiAgJ0FycmF5JyxcbiAgJ0dlb1BvaW50JyxcbiAgJ0ZpbGUnLFxuICAnQnl0ZXMnLFxuICAnUG9seWdvbicsXG5dO1xuLy8gUmV0dXJucyBhbiBlcnJvciBzdWl0YWJsZSBmb3IgdGhyb3dpbmcgaWYgdGhlIHR5cGUgaXMgaW52YWxpZFxuY29uc3QgZmllbGRUeXBlSXNJbnZhbGlkID0gKHsgdHlwZSwgdGFyZ2V0Q2xhc3MgfSkgPT4ge1xuICBpZiAoWydQb2ludGVyJywgJ1JlbGF0aW9uJ10uaW5kZXhPZih0eXBlKSA+PSAwKSB7XG4gICAgaWYgKCF0YXJnZXRDbGFzcykge1xuICAgICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcigxMzUsIGB0eXBlICR7dHlwZX0gbmVlZHMgYSBjbGFzcyBuYW1lYCk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgdGFyZ2V0Q2xhc3MgIT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gaW52YWxpZEpzb25FcnJvcjtcbiAgICB9IGVsc2UgaWYgKCFjbGFzc05hbWVJc1ZhbGlkKHRhcmdldENsYXNzKSkge1xuICAgICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsIGludmFsaWRDbGFzc05hbWVNZXNzYWdlKHRhcmdldENsYXNzKSk7XG4gICAgfSBlbHNlIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuICB9XG4gIGlmICh0eXBlb2YgdHlwZSAhPT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gaW52YWxpZEpzb25FcnJvcjtcbiAgfVxuICBpZiAodmFsaWROb25SZWxhdGlvbk9yUG9pbnRlclR5cGVzLmluZGV4T2YodHlwZSkgPCAwKSB7XG4gICAgcmV0dXJuIG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSwgYGludmFsaWQgZmllbGQgdHlwZTogJHt0eXBlfWApO1xuICB9XG4gIHJldHVybiB1bmRlZmluZWQ7XG59O1xuXG5jb25zdCBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hID0gKHNjaGVtYTogYW55KSA9PiB7XG4gIHNjaGVtYSA9IGluamVjdERlZmF1bHRTY2hlbWEoc2NoZW1hKTtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuQUNMO1xuICBzY2hlbWEuZmllbGRzLl9ycGVybSA9IHsgdHlwZTogJ0FycmF5JyB9O1xuICBzY2hlbWEuZmllbGRzLl93cGVybSA9IHsgdHlwZTogJ0FycmF5JyB9O1xuXG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMucGFzc3dvcmQ7XG4gICAgc2NoZW1hLmZpZWxkcy5faGFzaGVkX3Bhc3N3b3JkID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICB9XG5cbiAgcmV0dXJuIHNjaGVtYTtcbn07XG5cbmNvbnN0IGNvbnZlcnRBZGFwdGVyU2NoZW1hVG9QYXJzZVNjaGVtYSA9ICh7IC4uLnNjaGVtYSB9KSA9PiB7XG4gIGRlbGV0ZSBzY2hlbWEuZmllbGRzLl9ycGVybTtcbiAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX3dwZXJtO1xuXG4gIHNjaGVtYS5maWVsZHMuQUNMID0geyB0eXBlOiAnQUNMJyB9O1xuXG4gIGlmIChzY2hlbWEuY2xhc3NOYW1lID09PSAnX1VzZXInKSB7XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuYXV0aERhdGE7IC8vQXV0aCBkYXRhIGlzIGltcGxpY2l0XG4gICAgZGVsZXRlIHNjaGVtYS5maWVsZHMuX2hhc2hlZF9wYXNzd29yZDtcbiAgICBzY2hlbWEuZmllbGRzLnBhc3N3b3JkID0geyB0eXBlOiAnU3RyaW5nJyB9O1xuICB9XG5cbiAgaWYgKHNjaGVtYS5pbmRleGVzICYmIE9iamVjdC5rZXlzKHNjaGVtYS5pbmRleGVzKS5sZW5ndGggPT09IDApIHtcbiAgICBkZWxldGUgc2NoZW1hLmluZGV4ZXM7XG4gIH1cblxuICByZXR1cm4gc2NoZW1hO1xufTtcblxuY2xhc3MgU2NoZW1hRGF0YSB7XG4gIF9fZGF0YTogYW55O1xuICBfX3Byb3RlY3RlZEZpZWxkczogYW55O1xuICBjb25zdHJ1Y3RvcihhbGxTY2hlbWFzID0gW10sIHByb3RlY3RlZEZpZWxkcyA9IHt9KSB7XG4gICAgdGhpcy5fX2RhdGEgPSB7fTtcbiAgICB0aGlzLl9fcHJvdGVjdGVkRmllbGRzID0gcHJvdGVjdGVkRmllbGRzO1xuICAgIGFsbFNjaGVtYXMuZm9yRWFjaChzY2hlbWEgPT4ge1xuICAgICAgaWYgKHZvbGF0aWxlQ2xhc3Nlcy5pbmNsdWRlcyhzY2hlbWEuY2xhc3NOYW1lKSkge1xuICAgICAgICByZXR1cm47XG4gICAgICB9XG4gICAgICBPYmplY3QuZGVmaW5lUHJvcGVydHkodGhpcywgc2NoZW1hLmNsYXNzTmFtZSwge1xuICAgICAgICBnZXQ6ICgpID0+IHtcbiAgICAgICAgICBpZiAoIXRoaXMuX19kYXRhW3NjaGVtYS5jbGFzc05hbWVdKSB7XG4gICAgICAgICAgICBjb25zdCBkYXRhID0ge307XG4gICAgICAgICAgICBkYXRhLmZpZWxkcyA9IGluamVjdERlZmF1bHRTY2hlbWEoc2NoZW1hKS5maWVsZHM7XG4gICAgICAgICAgICBkYXRhLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IGRlZXBjb3B5KHNjaGVtYS5jbGFzc0xldmVsUGVybWlzc2lvbnMpO1xuICAgICAgICAgICAgZGF0YS5pbmRleGVzID0gc2NoZW1hLmluZGV4ZXM7XG5cbiAgICAgICAgICAgIGNvbnN0IGNsYXNzUHJvdGVjdGVkRmllbGRzID0gdGhpcy5fX3Byb3RlY3RlZEZpZWxkc1tzY2hlbWEuY2xhc3NOYW1lXTtcbiAgICAgICAgICAgIGlmIChjbGFzc1Byb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgICAgICBmb3IgKGNvbnN0IGtleSBpbiBjbGFzc1Byb3RlY3RlZEZpZWxkcykge1xuICAgICAgICAgICAgICAgIGNvbnN0IHVucSA9IG5ldyBTZXQoW1xuICAgICAgICAgICAgICAgICAgLi4uKGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLnByb3RlY3RlZEZpZWxkc1trZXldIHx8IFtdKSxcbiAgICAgICAgICAgICAgICAgIC4uLmNsYXNzUHJvdGVjdGVkRmllbGRzW2tleV0sXG4gICAgICAgICAgICAgICAgXSk7XG4gICAgICAgICAgICAgICAgZGF0YS5jbGFzc0xldmVsUGVybWlzc2lvbnMucHJvdGVjdGVkRmllbGRzW2tleV0gPSBBcnJheS5mcm9tKHVucSk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgIH1cblxuICAgICAgICAgICAgdGhpcy5fX2RhdGFbc2NoZW1hLmNsYXNzTmFtZV0gPSBkYXRhO1xuICAgICAgICAgIH1cbiAgICAgICAgICByZXR1cm4gdGhpcy5fX2RhdGFbc2NoZW1hLmNsYXNzTmFtZV07XG4gICAgICAgIH0sXG4gICAgICB9KTtcbiAgICB9KTtcblxuICAgIC8vIEluamVjdCB0aGUgaW4tbWVtb3J5IGNsYXNzZXNcbiAgICB2b2xhdGlsZUNsYXNzZXMuZm9yRWFjaChjbGFzc05hbWUgPT4ge1xuICAgICAgT2JqZWN0LmRlZmluZVByb3BlcnR5KHRoaXMsIGNsYXNzTmFtZSwge1xuICAgICAgICBnZXQ6ICgpID0+IHtcbiAgICAgICAgICBpZiAoIXRoaXMuX19kYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgICAgICAgIGNvbnN0IHNjaGVtYSA9IGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgIGZpZWxkczoge30sXG4gICAgICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICAgIGNvbnN0IGRhdGEgPSB7fTtcbiAgICAgICAgICAgIGRhdGEuZmllbGRzID0gc2NoZW1hLmZpZWxkcztcbiAgICAgICAgICAgIGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zID0gc2NoZW1hLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucztcbiAgICAgICAgICAgIGRhdGEuaW5kZXhlcyA9IHNjaGVtYS5pbmRleGVzO1xuICAgICAgICAgICAgdGhpcy5fX2RhdGFbY2xhc3NOYW1lXSA9IGRhdGE7XG4gICAgICAgICAgfVxuICAgICAgICAgIHJldHVybiB0aGlzLl9fZGF0YVtjbGFzc05hbWVdO1xuICAgICAgICB9LFxuICAgICAgfSk7XG4gICAgfSk7XG4gIH1cbn1cblxuY29uc3QgaW5qZWN0RGVmYXVsdFNjaGVtYSA9ICh7IGNsYXNzTmFtZSwgZmllbGRzLCBjbGFzc0xldmVsUGVybWlzc2lvbnMsIGluZGV4ZXMgfTogU2NoZW1hKSA9PiB7XG4gIGNvbnN0IGRlZmF1bHRTY2hlbWE6IFNjaGVtYSA9IHtcbiAgICBjbGFzc05hbWUsXG4gICAgZmllbGRzOiB7XG4gICAgICAuLi5kZWZhdWx0Q29sdW1ucy5fRGVmYXVsdCxcbiAgICAgIC4uLihkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdIHx8IHt9KSxcbiAgICAgIC4uLmZpZWxkcyxcbiAgICB9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgfTtcbiAgaWYgKGluZGV4ZXMgJiYgT2JqZWN0LmtleXMoaW5kZXhlcykubGVuZ3RoICE9PSAwKSB7XG4gICAgZGVmYXVsdFNjaGVtYS5pbmRleGVzID0gaW5kZXhlcztcbiAgfVxuICByZXR1cm4gZGVmYXVsdFNjaGVtYTtcbn07XG5cbmNvbnN0IF9Ib29rc1NjaGVtYSA9IHsgY2xhc3NOYW1lOiAnX0hvb2tzJywgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fSG9va3MgfTtcbmNvbnN0IF9HbG9iYWxDb25maWdTY2hlbWEgPSB7XG4gIGNsYXNzTmFtZTogJ19HbG9iYWxDb25maWcnLFxuICBmaWVsZHM6IGRlZmF1bHRDb2x1bW5zLl9HbG9iYWxDb25maWcsXG59O1xuY29uc3QgX0dyYXBoUUxDb25maWdTY2hlbWEgPSB7XG4gIGNsYXNzTmFtZTogJ19HcmFwaFFMQ29uZmlnJyxcbiAgZmllbGRzOiBkZWZhdWx0Q29sdW1ucy5fR3JhcGhRTENvbmZpZyxcbn07XG5jb25zdCBfUHVzaFN0YXR1c1NjaGVtYSA9IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoXG4gIGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgIGNsYXNzTmFtZTogJ19QdXNoU3RhdHVzJyxcbiAgICBmaWVsZHM6IHt9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgX0pvYlN0YXR1c1NjaGVtYSA9IGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEoXG4gIGluamVjdERlZmF1bHRTY2hlbWEoe1xuICAgIGNsYXNzTmFtZTogJ19Kb2JTdGF0dXMnLFxuICAgIGZpZWxkczoge30sXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgfSlcbik7XG5jb25zdCBfSm9iU2NoZWR1bGVTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfSm9iU2NoZWR1bGUnLFxuICAgIGZpZWxkczoge30sXG4gICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiB7fSxcbiAgfSlcbik7XG5jb25zdCBfQXVkaWVuY2VTY2hlbWEgPSBjb252ZXJ0U2NoZW1hVG9BZGFwdGVyU2NoZW1hKFxuICBpbmplY3REZWZhdWx0U2NoZW1hKHtcbiAgICBjbGFzc05hbWU6ICdfQXVkaWVuY2UnLFxuICAgIGZpZWxkczogZGVmYXVsdENvbHVtbnMuX0F1ZGllbmNlLFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczoge30sXG4gIH0pXG4pO1xuY29uc3QgX0lkZW1wb3RlbmN5U2NoZW1hID0gY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYShcbiAgaW5qZWN0RGVmYXVsdFNjaGVtYSh7XG4gICAgY2xhc3NOYW1lOiAnX0lkZW1wb3RlbmN5JyxcbiAgICBmaWVsZHM6IGRlZmF1bHRDb2x1bW5zLl9JZGVtcG90ZW5jeSxcbiAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IHt9LFxuICB9KVxuKTtcbmNvbnN0IFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMgPSBbXG4gIF9Ib29rc1NjaGVtYSxcbiAgX0pvYlN0YXR1c1NjaGVtYSxcbiAgX0pvYlNjaGVkdWxlU2NoZW1hLFxuICBfUHVzaFN0YXR1c1NjaGVtYSxcbiAgX0dsb2JhbENvbmZpZ1NjaGVtYSxcbiAgX0dyYXBoUUxDb25maWdTY2hlbWEsXG4gIF9BdWRpZW5jZVNjaGVtYSxcbiAgX0lkZW1wb3RlbmN5U2NoZW1hLFxuXTtcblxuY29uc3QgZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUgPSAoZGJUeXBlOiBTY2hlbWFGaWVsZCB8IHN0cmluZywgb2JqZWN0VHlwZTogU2NoZW1hRmllbGQpID0+IHtcbiAgaWYgKGRiVHlwZS50eXBlICE9PSBvYmplY3RUeXBlLnR5cGUpIHJldHVybiBmYWxzZTtcbiAgaWYgKGRiVHlwZS50YXJnZXRDbGFzcyAhPT0gb2JqZWN0VHlwZS50YXJnZXRDbGFzcykgcmV0dXJuIGZhbHNlO1xuICBpZiAoZGJUeXBlID09PSBvYmplY3RUeXBlLnR5cGUpIHJldHVybiB0cnVlO1xuICBpZiAoZGJUeXBlLnR5cGUgPT09IG9iamVjdFR5cGUudHlwZSkgcmV0dXJuIHRydWU7XG4gIHJldHVybiBmYWxzZTtcbn07XG5cbmNvbnN0IHR5cGVUb1N0cmluZyA9ICh0eXBlOiBTY2hlbWFGaWVsZCB8IHN0cmluZyk6IHN0cmluZyA9PiB7XG4gIGlmICh0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gdHlwZTtcbiAgfVxuICBpZiAodHlwZS50YXJnZXRDbGFzcykge1xuICAgIHJldHVybiBgJHt0eXBlLnR5cGV9PCR7dHlwZS50YXJnZXRDbGFzc30+YDtcbiAgfVxuICByZXR1cm4gYCR7dHlwZS50eXBlfWA7XG59O1xuY29uc3QgdHRsID0ge1xuICBkYXRlOiBEYXRlLm5vdygpLFxuICBkdXJhdGlvbjogdW5kZWZpbmVkLFxufTtcblxuLy8gU3RvcmVzIHRoZSBlbnRpcmUgc2NoZW1hIG9mIHRoZSBhcHAgaW4gYSB3ZWlyZCBoeWJyaWQgZm9ybWF0IHNvbWV3aGVyZSBiZXR3ZWVuXG4vLyB0aGUgbW9uZ28gZm9ybWF0IGFuZCB0aGUgUGFyc2UgZm9ybWF0LiBTb29uLCB0aGlzIHdpbGwgYWxsIGJlIFBhcnNlIGZvcm1hdC5cbmV4cG9ydCBkZWZhdWx0IGNsYXNzIFNjaGVtYUNvbnRyb2xsZXIge1xuICBfZGJBZGFwdGVyOiBTdG9yYWdlQWRhcHRlcjtcbiAgc2NoZW1hRGF0YTogeyBbc3RyaW5nXTogU2NoZW1hIH07XG4gIHJlbG9hZERhdGFQcm9taXNlOiA/UHJvbWlzZTxhbnk+O1xuICBwcm90ZWN0ZWRGaWVsZHM6IGFueTtcbiAgdXNlcklkUmVnRXg6IFJlZ0V4cDtcblxuICBjb25zdHJ1Y3RvcihkYXRhYmFzZUFkYXB0ZXI6IFN0b3JhZ2VBZGFwdGVyKSB7XG4gICAgdGhpcy5fZGJBZGFwdGVyID0gZGF0YWJhc2VBZGFwdGVyO1xuICAgIGNvbnN0IGNvbmZpZyA9IENvbmZpZy5nZXQoUGFyc2UuYXBwbGljYXRpb25JZCk7XG4gICAgdGhpcy5zY2hlbWFEYXRhID0gbmV3IFNjaGVtYURhdGEoU2NoZW1hQ2FjaGUuYWxsKCksIHRoaXMucHJvdGVjdGVkRmllbGRzKTtcbiAgICB0aGlzLnByb3RlY3RlZEZpZWxkcyA9IGNvbmZpZy5wcm90ZWN0ZWRGaWVsZHM7XG5cbiAgICBjb25zdCBjdXN0b21JZHMgPSBjb25maWcuYWxsb3dDdXN0b21PYmplY3RJZDtcblxuICAgIGNvbnN0IGN1c3RvbUlkUmVnRXggPSAvXi57MSx9JC91OyAvLyAxKyBjaGFyc1xuICAgIGNvbnN0IGF1dG9JZFJlZ0V4ID0gL15bYS16QS1aMC05XXsxLH0kLztcblxuICAgIHRoaXMudXNlcklkUmVnRXggPSBjdXN0b21JZHMgPyBjdXN0b21JZFJlZ0V4IDogYXV0b0lkUmVnRXg7XG5cbiAgICB0aGlzLl9kYkFkYXB0ZXIud2F0Y2goKCkgPT4ge1xuICAgICAgdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICB9KTtcbiAgfVxuXG4gIGFzeW5jIHJlbG9hZERhdGFJZk5lZWRlZCgpIHtcbiAgICBpZiAodGhpcy5fZGJBZGFwdGVyLmVuYWJsZVNjaGVtYUhvb2tzKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IHsgZGF0ZSwgZHVyYXRpb24gfSA9IHR0bCB8fCB7fTtcbiAgICBpZiAoIWR1cmF0aW9uKSB7XG4gICAgICByZXR1cm47XG4gICAgfVxuICAgIGNvbnN0IG5vdyA9IERhdGUubm93KCk7XG4gICAgaWYgKG5vdyAtIGRhdGUgPiBkdXJhdGlvbikge1xuICAgICAgdHRsLmRhdGUgPSBub3c7XG4gICAgICBhd2FpdCB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgIH1cbiAgfVxuXG4gIHJlbG9hZERhdGEob3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH0pOiBQcm9taXNlPGFueT4ge1xuICAgIGlmICh0aGlzLnJlbG9hZERhdGFQcm9taXNlICYmICFvcHRpb25zLmNsZWFyQ2FjaGUpIHtcbiAgICAgIHJldHVybiB0aGlzLnJlbG9hZERhdGFQcm9taXNlO1xuICAgIH1cbiAgICB0aGlzLnJlbG9hZERhdGFQcm9taXNlID0gdGhpcy5nZXRBbGxDbGFzc2VzKG9wdGlvbnMpXG4gICAgICAudGhlbihcbiAgICAgICAgYWxsU2NoZW1hcyA9PiB7XG4gICAgICAgICAgdGhpcy5zY2hlbWFEYXRhID0gbmV3IFNjaGVtYURhdGEoYWxsU2NoZW1hcywgdGhpcy5wcm90ZWN0ZWRGaWVsZHMpO1xuICAgICAgICAgIGRlbGV0ZSB0aGlzLnJlbG9hZERhdGFQcm9taXNlO1xuICAgICAgICB9LFxuICAgICAgICBlcnIgPT4ge1xuICAgICAgICAgIHRoaXMuc2NoZW1hRGF0YSA9IG5ldyBTY2hlbWFEYXRhKCk7XG4gICAgICAgICAgZGVsZXRlIHRoaXMucmVsb2FkRGF0YVByb21pc2U7XG4gICAgICAgICAgdGhyb3cgZXJyO1xuICAgICAgICB9XG4gICAgICApXG4gICAgICAudGhlbigoKSA9PiB7fSk7XG4gICAgcmV0dXJuIHRoaXMucmVsb2FkRGF0YVByb21pc2U7XG4gIH1cblxuICBhc3luYyBnZXRBbGxDbGFzc2VzKG9wdGlvbnM6IExvYWRTY2hlbWFPcHRpb25zID0geyBjbGVhckNhY2hlOiBmYWxzZSB9KTogUHJvbWlzZTxBcnJheTxTY2hlbWE+PiB7XG4gICAgaWYgKG9wdGlvbnMuY2xlYXJDYWNoZSkge1xuICAgICAgcmV0dXJuIHRoaXMuc2V0QWxsQ2xhc3NlcygpO1xuICAgIH1cbiAgICBhd2FpdCB0aGlzLnJlbG9hZERhdGFJZk5lZWRlZCgpO1xuICAgIGNvbnN0IGNhY2hlZCA9IFNjaGVtYUNhY2hlLmFsbCgpO1xuICAgIGlmIChjYWNoZWQgJiYgY2FjaGVkLmxlbmd0aCkge1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZShjYWNoZWQpO1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy5zZXRBbGxDbGFzc2VzKCk7XG4gIH1cblxuICBzZXRBbGxDbGFzc2VzKCk6IFByb21pc2U8QXJyYXk8U2NoZW1hPj4ge1xuICAgIHJldHVybiB0aGlzLl9kYkFkYXB0ZXJcbiAgICAgIC5nZXRBbGxDbGFzc2VzKClcbiAgICAgIC50aGVuKGFsbFNjaGVtYXMgPT4gYWxsU2NoZW1hcy5tYXAoaW5qZWN0RGVmYXVsdFNjaGVtYSkpXG4gICAgICAudGhlbihhbGxTY2hlbWFzID0+IHtcbiAgICAgICAgU2NoZW1hQ2FjaGUucHV0KGFsbFNjaGVtYXMpO1xuICAgICAgICByZXR1cm4gYWxsU2NoZW1hcztcbiAgICAgIH0pO1xuICB9XG5cbiAgZ2V0T25lU2NoZW1hKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGFsbG93Vm9sYXRpbGVDbGFzc2VzOiBib29sZWFuID0gZmFsc2UsXG4gICAgb3B0aW9uczogTG9hZFNjaGVtYU9wdGlvbnMgPSB7IGNsZWFyQ2FjaGU6IGZhbHNlIH1cbiAgKTogUHJvbWlzZTxTY2hlbWE+IHtcbiAgICBpZiAob3B0aW9ucy5jbGVhckNhY2hlKSB7XG4gICAgICBTY2hlbWFDYWNoZS5jbGVhcigpO1xuICAgIH1cbiAgICBpZiAoYWxsb3dWb2xhdGlsZUNsYXNzZXMgJiYgdm9sYXRpbGVDbGFzc2VzLmluZGV4T2YoY2xhc3NOYW1lKSA+IC0xKSB7XG4gICAgICBjb25zdCBkYXRhID0gdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV07XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHtcbiAgICAgICAgY2xhc3NOYW1lLFxuICAgICAgICBmaWVsZHM6IGRhdGEuZmllbGRzLFxuICAgICAgICBjbGFzc0xldmVsUGVybWlzc2lvbnM6IGRhdGEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICBpbmRleGVzOiBkYXRhLmluZGV4ZXMsXG4gICAgICB9KTtcbiAgICB9XG4gICAgY29uc3QgY2FjaGVkID0gU2NoZW1hQ2FjaGUuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKGNhY2hlZCAmJiAhb3B0aW9ucy5jbGVhckNhY2hlKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKGNhY2hlZCk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnNldEFsbENsYXNzZXMoKS50aGVuKGFsbFNjaGVtYXMgPT4ge1xuICAgICAgY29uc3Qgb25lU2NoZW1hID0gYWxsU2NoZW1hcy5maW5kKHNjaGVtYSA9PiBzY2hlbWEuY2xhc3NOYW1lID09PSBjbGFzc05hbWUpO1xuICAgICAgaWYgKCFvbmVTY2hlbWEpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KHVuZGVmaW5lZCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gb25lU2NoZW1hO1xuICAgIH0pO1xuICB9XG5cbiAgLy8gQ3JlYXRlIGEgbmV3IGNsYXNzIHRoYXQgaW5jbHVkZXMgdGhlIHRocmVlIGRlZmF1bHQgZmllbGRzLlxuICAvLyBBQ0wgaXMgYW4gaW1wbGljaXQgY29sdW1uIHRoYXQgZG9lcyBub3QgZ2V0IGFuIGVudHJ5IGluIHRoZVxuICAvLyBfU0NIRU1BUyBkYXRhYmFzZS4gUmV0dXJucyBhIHByb21pc2UgdGhhdCByZXNvbHZlcyB3aXRoIHRoZVxuICAvLyBjcmVhdGVkIHNjaGVtYSwgaW4gbW9uZ28gZm9ybWF0LlxuICAvLyBvbiBzdWNjZXNzLCBhbmQgcmVqZWN0cyB3aXRoIGFuIGVycm9yIG9uIGZhaWwuIEVuc3VyZSB5b3VcbiAgLy8gaGF2ZSBhdXRob3JpemF0aW9uIChtYXN0ZXIga2V5LCBvciBjbGllbnQgY2xhc3MgY3JlYXRpb25cbiAgLy8gZW5hYmxlZCkgYmVmb3JlIGNhbGxpbmcgdGhpcyBmdW5jdGlvbi5cbiAgYXN5bmMgYWRkQ2xhc3NJZk5vdEV4aXN0cyhcbiAgICBjbGFzc05hbWU6IHN0cmluZyxcbiAgICBmaWVsZHM6IFNjaGVtYUZpZWxkcyA9IHt9LFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogYW55LFxuICAgIGluZGV4ZXM6IGFueSA9IHt9XG4gICk6IFByb21pc2U8dm9pZCB8IFNjaGVtYT4ge1xuICAgIHZhciB2YWxpZGF0aW9uRXJyb3IgPSB0aGlzLnZhbGlkYXRlTmV3Q2xhc3MoY2xhc3NOYW1lLCBmaWVsZHMsIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyk7XG4gICAgaWYgKHZhbGlkYXRpb25FcnJvcikge1xuICAgICAgaWYgKHZhbGlkYXRpb25FcnJvciBpbnN0YW5jZW9mIFBhcnNlLkVycm9yKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdCh2YWxpZGF0aW9uRXJyb3IpO1xuICAgICAgfSBlbHNlIGlmICh2YWxpZGF0aW9uRXJyb3IuY29kZSAmJiB2YWxpZGF0aW9uRXJyb3IuZXJyb3IpIHtcbiAgICAgICAgcmV0dXJuIFByb21pc2UucmVqZWN0KG5ldyBQYXJzZS5FcnJvcih2YWxpZGF0aW9uRXJyb3IuY29kZSwgdmFsaWRhdGlvbkVycm9yLmVycm9yKSk7XG4gICAgICB9XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZWplY3QodmFsaWRhdGlvbkVycm9yKTtcbiAgICB9XG4gICAgdHJ5IHtcbiAgICAgIGNvbnN0IGFkYXB0ZXJTY2hlbWEgPSBhd2FpdCB0aGlzLl9kYkFkYXB0ZXIuY3JlYXRlQ2xhc3MoXG4gICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgY29udmVydFNjaGVtYVRvQWRhcHRlclNjaGVtYSh7XG4gICAgICAgICAgZmllbGRzLFxuICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICBpbmRleGVzLFxuICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgfSlcbiAgICAgICk7XG4gICAgICAvLyBUT0RPOiBSZW1vdmUgYnkgdXBkYXRpbmcgc2NoZW1hIGNhY2hlIGRpcmVjdGx5XG4gICAgICBhd2FpdCB0aGlzLnJlbG9hZERhdGEoeyBjbGVhckNhY2hlOiB0cnVlIH0pO1xuICAgICAgY29uc3QgcGFyc2VTY2hlbWEgPSBjb252ZXJ0QWRhcHRlclNjaGVtYVRvUGFyc2VTY2hlbWEoYWRhcHRlclNjaGVtYSk7XG4gICAgICByZXR1cm4gcGFyc2VTY2hlbWE7XG4gICAgfSBjYXRjaCAoZXJyb3IpIHtcbiAgICAgIGlmIChlcnJvciAmJiBlcnJvci5jb2RlID09PSBQYXJzZS5FcnJvci5EVVBMSUNBVEVfVkFMVUUpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSwgYENsYXNzICR7Y2xhc3NOYW1lfSBhbHJlYWR5IGV4aXN0cy5gKTtcbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHRocm93IGVycm9yO1xuICAgICAgfVxuICAgIH1cbiAgfVxuXG4gIHVwZGF0ZUNsYXNzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIHN1Ym1pdHRlZEZpZWxkczogU2NoZW1hRmllbGRzLFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogYW55LFxuICAgIGluZGV4ZXM6IGFueSxcbiAgICBkYXRhYmFzZTogRGF0YWJhc2VDb250cm9sbGVyXG4gICkge1xuICAgIHJldHVybiB0aGlzLmdldE9uZVNjaGVtYShjbGFzc05hbWUpXG4gICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICBjb25zdCBleGlzdGluZ0ZpZWxkcyA9IHNjaGVtYS5maWVsZHM7XG4gICAgICAgIE9iamVjdC5rZXlzKHN1Ym1pdHRlZEZpZWxkcykuZm9yRWFjaChuYW1lID0+IHtcbiAgICAgICAgICBjb25zdCBmaWVsZCA9IHN1Ym1pdHRlZEZpZWxkc1tuYW1lXTtcbiAgICAgICAgICBpZiAoXG4gICAgICAgICAgICBleGlzdGluZ0ZpZWxkc1tuYW1lXSAmJlxuICAgICAgICAgICAgZXhpc3RpbmdGaWVsZHNbbmFtZV0udHlwZSAhPT0gZmllbGQudHlwZSAmJlxuICAgICAgICAgICAgZmllbGQuX19vcCAhPT0gJ0RlbGV0ZSdcbiAgICAgICAgICApIHtcbiAgICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcigyNTUsIGBGaWVsZCAke25hbWV9IGV4aXN0cywgY2Fubm90IHVwZGF0ZS5gKTtcbiAgICAgICAgICB9XG4gICAgICAgICAgaWYgKCFleGlzdGluZ0ZpZWxkc1tuYW1lXSAmJiBmaWVsZC5fX29wID09PSAnRGVsZXRlJykge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDI1NSwgYEZpZWxkICR7bmFtZX0gZG9lcyBub3QgZXhpc3QsIGNhbm5vdCBkZWxldGUuYCk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcblxuICAgICAgICBkZWxldGUgZXhpc3RpbmdGaWVsZHMuX3JwZXJtO1xuICAgICAgICBkZWxldGUgZXhpc3RpbmdGaWVsZHMuX3dwZXJtO1xuICAgICAgICBjb25zdCBuZXdTY2hlbWEgPSBidWlsZE1lcmdlZFNjaGVtYU9iamVjdChleGlzdGluZ0ZpZWxkcywgc3VibWl0dGVkRmllbGRzKTtcbiAgICAgICAgY29uc3QgZGVmYXVsdEZpZWxkcyA9IGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV0gfHwgZGVmYXVsdENvbHVtbnMuX0RlZmF1bHQ7XG4gICAgICAgIGNvbnN0IGZ1bGxOZXdTY2hlbWEgPSBPYmplY3QuYXNzaWduKHt9LCBuZXdTY2hlbWEsIGRlZmF1bHRGaWVsZHMpO1xuICAgICAgICBjb25zdCB2YWxpZGF0aW9uRXJyb3IgPSB0aGlzLnZhbGlkYXRlU2NoZW1hRGF0YShcbiAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgbmV3U2NoZW1hLFxuICAgICAgICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucyxcbiAgICAgICAgICBPYmplY3Qua2V5cyhleGlzdGluZ0ZpZWxkcylcbiAgICAgICAgKTtcbiAgICAgICAgaWYgKHZhbGlkYXRpb25FcnJvcikge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcih2YWxpZGF0aW9uRXJyb3IuY29kZSwgdmFsaWRhdGlvbkVycm9yLmVycm9yKTtcbiAgICAgICAgfVxuXG4gICAgICAgIC8vIEZpbmFsbHkgd2UgaGF2ZSBjaGVja2VkIHRvIG1ha2Ugc3VyZSB0aGUgcmVxdWVzdCBpcyB2YWxpZCBhbmQgd2UgY2FuIHN0YXJ0IGRlbGV0aW5nIGZpZWxkcy5cbiAgICAgICAgLy8gRG8gYWxsIGRlbGV0aW9ucyBmaXJzdCwgdGhlbiBhIHNpbmdsZSBzYXZlIHRvIF9TQ0hFTUEgY29sbGVjdGlvbiB0byBoYW5kbGUgYWxsIGFkZGl0aW9ucy5cbiAgICAgICAgY29uc3QgZGVsZXRlZEZpZWxkczogc3RyaW5nW10gPSBbXTtcbiAgICAgICAgY29uc3QgaW5zZXJ0ZWRGaWVsZHMgPSBbXTtcbiAgICAgICAgT2JqZWN0LmtleXMoc3VibWl0dGVkRmllbGRzKS5mb3JFYWNoKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgaWYgKHN1Ym1pdHRlZEZpZWxkc1tmaWVsZE5hbWVdLl9fb3AgPT09ICdEZWxldGUnKSB7XG4gICAgICAgICAgICBkZWxldGVkRmllbGRzLnB1c2goZmllbGROYW1lKTtcbiAgICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgICAgaW5zZXJ0ZWRGaWVsZHMucHVzaChmaWVsZE5hbWUpO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG5cbiAgICAgICAgbGV0IGRlbGV0ZVByb21pc2UgPSBQcm9taXNlLnJlc29sdmUoKTtcbiAgICAgICAgaWYgKGRlbGV0ZWRGaWVsZHMubGVuZ3RoID4gMCkge1xuICAgICAgICAgIGRlbGV0ZVByb21pc2UgPSB0aGlzLmRlbGV0ZUZpZWxkcyhkZWxldGVkRmllbGRzLCBjbGFzc05hbWUsIGRhdGFiYXNlKTtcbiAgICAgICAgfVxuICAgICAgICBsZXQgZW5mb3JjZUZpZWxkcyA9IFtdO1xuICAgICAgICByZXR1cm4gKFxuICAgICAgICAgIGRlbGV0ZVByb21pc2UgLy8gRGVsZXRlIEV2ZXJ5dGhpbmdcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSkpIC8vIFJlbG9hZCBvdXIgU2NoZW1hLCBzbyB3ZSBoYXZlIGFsbCB0aGUgbmV3IHZhbHVlc1xuICAgICAgICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICAgICAgICBjb25zdCBwcm9taXNlcyA9IGluc2VydGVkRmllbGRzLm1hcChmaWVsZE5hbWUgPT4ge1xuICAgICAgICAgICAgICAgIGNvbnN0IHR5cGUgPSBzdWJtaXR0ZWRGaWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgICAgICAgICByZXR1cm4gdGhpcy5lbmZvcmNlRmllbGRFeGlzdHMoY2xhc3NOYW1lLCBmaWVsZE5hbWUsIHR5cGUpO1xuICAgICAgICAgICAgICB9KTtcbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICAgICAgICAgIH0pXG4gICAgICAgICAgICAudGhlbihyZXN1bHRzID0+IHtcbiAgICAgICAgICAgICAgZW5mb3JjZUZpZWxkcyA9IHJlc3VsdHMuZmlsdGVyKHJlc3VsdCA9PiAhIXJlc3VsdCk7XG4gICAgICAgICAgICAgIHJldHVybiB0aGlzLnNldFBlcm1pc3Npb25zKGNsYXNzTmFtZSwgY2xhc3NMZXZlbFBlcm1pc3Npb25zLCBuZXdTY2hlbWEpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICAgIC50aGVuKCgpID0+XG4gICAgICAgICAgICAgIHRoaXMuX2RiQWRhcHRlci5zZXRJbmRleGVzV2l0aFNjaGVtYUZvcm1hdChcbiAgICAgICAgICAgICAgICBjbGFzc05hbWUsXG4gICAgICAgICAgICAgICAgaW5kZXhlcyxcbiAgICAgICAgICAgICAgICBzY2hlbWEuaW5kZXhlcyxcbiAgICAgICAgICAgICAgICBmdWxsTmV3U2NoZW1hXG4gICAgICAgICAgICAgIClcbiAgICAgICAgICAgIClcbiAgICAgICAgICAgIC50aGVuKCgpID0+IHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSkpXG4gICAgICAgICAgICAvL1RPRE86IE1vdmUgdGhpcyBsb2dpYyBpbnRvIHRoZSBkYXRhYmFzZSBhZGFwdGVyXG4gICAgICAgICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgICAgICAgIHRoaXMuZW5zdXJlRmllbGRzKGVuZm9yY2VGaWVsZHMpO1xuICAgICAgICAgICAgICBjb25zdCBzY2hlbWEgPSB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXTtcbiAgICAgICAgICAgICAgY29uc3QgcmVsb2FkZWRTY2hlbWE6IFNjaGVtYSA9IHtcbiAgICAgICAgICAgICAgICBjbGFzc05hbWU6IGNsYXNzTmFtZSxcbiAgICAgICAgICAgICAgICBmaWVsZHM6IHNjaGVtYS5maWVsZHMsXG4gICAgICAgICAgICAgICAgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBzY2hlbWEuY2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgICAgICAgICAgICB9O1xuICAgICAgICAgICAgICBpZiAoc2NoZW1hLmluZGV4ZXMgJiYgT2JqZWN0LmtleXMoc2NoZW1hLmluZGV4ZXMpLmxlbmd0aCAhPT0gMCkge1xuICAgICAgICAgICAgICAgIHJlbG9hZGVkU2NoZW1hLmluZGV4ZXMgPSBzY2hlbWEuaW5kZXhlcztcbiAgICAgICAgICAgICAgfVxuICAgICAgICAgICAgICByZXR1cm4gcmVsb2FkZWRTY2hlbWE7XG4gICAgICAgICAgICB9KVxuICAgICAgICApO1xuICAgICAgfSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvciA9PT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgICAgUGFyc2UuRXJyb3IuSU5WQUxJRF9DTEFTU19OQU1FLFxuICAgICAgICAgICAgYENsYXNzICR7Y2xhc3NOYW1lfSBkb2VzIG5vdCBleGlzdC5gXG4gICAgICAgICAgKTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICB0aHJvdyBlcnJvcjtcbiAgICAgICAgfVxuICAgICAgfSk7XG4gIH1cblxuICAvLyBSZXR1cm5zIGEgcHJvbWlzZSB0aGF0IHJlc29sdmVzIHN1Y2Nlc3NmdWxseSB0byB0aGUgbmV3IHNjaGVtYVxuICAvLyBvYmplY3Qgb3IgZmFpbHMgd2l0aCBhIHJlYXNvbi5cbiAgZW5mb3JjZUNsYXNzRXhpc3RzKGNsYXNzTmFtZTogc3RyaW5nKTogUHJvbWlzZTxTY2hlbWFDb250cm9sbGVyPiB7XG4gICAgaWYgKHRoaXMuc2NoZW1hRGF0YVtjbGFzc05hbWVdKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMpO1xuICAgIH1cbiAgICAvLyBXZSBkb24ndCBoYXZlIHRoaXMgY2xhc3MuIFVwZGF0ZSB0aGUgc2NoZW1hXG4gICAgcmV0dXJuIChcbiAgICAgIC8vIFRoZSBzY2hlbWEgdXBkYXRlIHN1Y2NlZWRlZC4gUmVsb2FkIHRoZSBzY2hlbWFcbiAgICAgIHRoaXMuYWRkQ2xhc3NJZk5vdEV4aXN0cyhjbGFzc05hbWUpXG4gICAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgLy8gVGhlIHNjaGVtYSB1cGRhdGUgZmFpbGVkLiBUaGlzIGNhbiBiZSBva2F5IC0gaXQgbWlnaHRcbiAgICAgICAgICAvLyBoYXZlIGZhaWxlZCBiZWNhdXNlIHRoZXJlJ3MgYSByYWNlIGNvbmRpdGlvbiBhbmQgYSBkaWZmZXJlbnRcbiAgICAgICAgICAvLyBjbGllbnQgaXMgbWFraW5nIHRoZSBleGFjdCBzYW1lIHNjaGVtYSB1cGRhdGUgdGhhdCB3ZSB3YW50LlxuICAgICAgICAgIC8vIFNvIGp1c3QgcmVsb2FkIHRoZSBzY2hlbWEuXG4gICAgICAgICAgcmV0dXJuIHRoaXMucmVsb2FkRGF0YSh7IGNsZWFyQ2FjaGU6IHRydWUgfSk7XG4gICAgICAgIH0pXG4gICAgICAgIC50aGVuKCgpID0+IHtcbiAgICAgICAgICAvLyBFbnN1cmUgdGhhdCB0aGUgc2NoZW1hIG5vdyB2YWxpZGF0ZXNcbiAgICAgICAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgICAgICAgIHJldHVybiB0aGlzO1xuICAgICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9KU09OLCBgRmFpbGVkIHRvIGFkZCAke2NsYXNzTmFtZX1gKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pXG4gICAgICAgIC5jYXRjaCgoKSA9PiB7XG4gICAgICAgICAgLy8gVGhlIHNjaGVtYSBzdGlsbCBkb2Vzbid0IHZhbGlkYXRlLiBHaXZlIHVwXG4gICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgJ3NjaGVtYSBjbGFzcyBuYW1lIGRvZXMgbm90IHJldmFsaWRhdGUnKTtcbiAgICAgICAgfSlcbiAgICApO1xuICB9XG5cbiAgdmFsaWRhdGVOZXdDbGFzcyhjbGFzc05hbWU6IHN0cmluZywgZmllbGRzOiBTY2hlbWFGaWVsZHMgPSB7fSwgY2xhc3NMZXZlbFBlcm1pc3Npb25zOiBhbnkpOiBhbnkge1xuICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSwgYENsYXNzICR7Y2xhc3NOYW1lfSBhbHJlYWR5IGV4aXN0cy5gKTtcbiAgICB9XG4gICAgaWYgKCFjbGFzc05hbWVJc1ZhbGlkKGNsYXNzTmFtZSkpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSxcbiAgICAgICAgZXJyb3I6IGludmFsaWRDbGFzc05hbWVNZXNzYWdlKGNsYXNzTmFtZSksXG4gICAgICB9O1xuICAgIH1cbiAgICByZXR1cm4gdGhpcy52YWxpZGF0ZVNjaGVtYURhdGEoY2xhc3NOYW1lLCBmaWVsZHMsIGNsYXNzTGV2ZWxQZXJtaXNzaW9ucywgW10pO1xuICB9XG5cbiAgdmFsaWRhdGVTY2hlbWFEYXRhKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZpZWxkczogU2NoZW1hRmllbGRzLFxuICAgIGNsYXNzTGV2ZWxQZXJtaXNzaW9uczogQ2xhc3NMZXZlbFBlcm1pc3Npb25zLFxuICAgIGV4aXN0aW5nRmllbGROYW1lczogQXJyYXk8c3RyaW5nPlxuICApIHtcbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBmaWVsZHMpIHtcbiAgICAgIGlmIChleGlzdGluZ0ZpZWxkTmFtZXMuaW5kZXhPZihmaWVsZE5hbWUpIDwgMCkge1xuICAgICAgICBpZiAoIWZpZWxkTmFtZUlzVmFsaWQoZmllbGROYW1lLCBjbGFzc05hbWUpKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOVkFMSURfS0VZX05BTUUsXG4gICAgICAgICAgICBlcnJvcjogJ2ludmFsaWQgZmllbGQgbmFtZTogJyArIGZpZWxkTmFtZSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGlmICghZmllbGROYW1lSXNWYWxpZEZvckNsYXNzKGZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICBjb2RlOiAxMzYsXG4gICAgICAgICAgICBlcnJvcjogJ2ZpZWxkICcgKyBmaWVsZE5hbWUgKyAnIGNhbm5vdCBiZSBhZGRlZCcsXG4gICAgICAgICAgfTtcbiAgICAgICAgfVxuICAgICAgICBjb25zdCBmaWVsZFR5cGUgPSBmaWVsZHNbZmllbGROYW1lXTtcbiAgICAgICAgY29uc3QgZXJyb3IgPSBmaWVsZFR5cGVJc0ludmFsaWQoZmllbGRUeXBlKTtcbiAgICAgICAgaWYgKGVycm9yKSByZXR1cm4geyBjb2RlOiBlcnJvci5jb2RlLCBlcnJvcjogZXJyb3IubWVzc2FnZSB9O1xuICAgICAgICBpZiAoZmllbGRUeXBlLmRlZmF1bHRWYWx1ZSAhPT0gdW5kZWZpbmVkKSB7XG4gICAgICAgICAgbGV0IGRlZmF1bHRWYWx1ZVR5cGUgPSBnZXRUeXBlKGZpZWxkVHlwZS5kZWZhdWx0VmFsdWUpO1xuICAgICAgICAgIGlmICh0eXBlb2YgZGVmYXVsdFZhbHVlVHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgICAgIGRlZmF1bHRWYWx1ZVR5cGUgPSB7IHR5cGU6IGRlZmF1bHRWYWx1ZVR5cGUgfTtcbiAgICAgICAgICB9IGVsc2UgaWYgKHR5cGVvZiBkZWZhdWx0VmFsdWVUeXBlID09PSAnb2JqZWN0JyAmJiBmaWVsZFR5cGUudHlwZSA9PT0gJ1JlbGF0aW9uJykge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAgIGVycm9yOiBgVGhlICdkZWZhdWx0IHZhbHVlJyBvcHRpb24gaXMgbm90IGFwcGxpY2FibGUgZm9yICR7dHlwZVRvU3RyaW5nKGZpZWxkVHlwZSl9YCxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgfVxuICAgICAgICAgIGlmICghZGJUeXBlTWF0Y2hlc09iamVjdFR5cGUoZmllbGRUeXBlLCBkZWZhdWx0VmFsdWVUeXBlKSkge1xuICAgICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgICAgY29kZTogUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgICAgIGVycm9yOiBgc2NoZW1hIG1pc21hdGNoIGZvciAke2NsYXNzTmFtZX0uJHtmaWVsZE5hbWV9IGRlZmF1bHQgdmFsdWU7IGV4cGVjdGVkICR7dHlwZVRvU3RyaW5nKFxuICAgICAgICAgICAgICAgIGZpZWxkVHlwZVxuICAgICAgICAgICAgICApfSBidXQgZ290ICR7dHlwZVRvU3RyaW5nKGRlZmF1bHRWYWx1ZVR5cGUpfWAsXG4gICAgICAgICAgICB9O1xuICAgICAgICAgIH1cbiAgICAgICAgfSBlbHNlIGlmIChmaWVsZFR5cGUucmVxdWlyZWQpIHtcbiAgICAgICAgICBpZiAodHlwZW9mIGZpZWxkVHlwZSA9PT0gJ29iamVjdCcgJiYgZmllbGRUeXBlLnR5cGUgPT09ICdSZWxhdGlvbicpIHtcbiAgICAgICAgICAgIHJldHVybiB7XG4gICAgICAgICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgICAgICBlcnJvcjogYFRoZSAncmVxdWlyZWQnIG9wdGlvbiBpcyBub3QgYXBwbGljYWJsZSBmb3IgJHt0eXBlVG9TdHJpbmcoZmllbGRUeXBlKX1gLFxuICAgICAgICAgICAgfTtcbiAgICAgICAgICB9XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBmb3IgKGNvbnN0IGZpZWxkTmFtZSBpbiBkZWZhdWx0Q29sdW1uc1tjbGFzc05hbWVdKSB7XG4gICAgICBmaWVsZHNbZmllbGROYW1lXSA9IGRlZmF1bHRDb2x1bW5zW2NsYXNzTmFtZV1bZmllbGROYW1lXTtcbiAgICB9XG5cbiAgICBjb25zdCBnZW9Qb2ludHMgPSBPYmplY3Qua2V5cyhmaWVsZHMpLmZpbHRlcihcbiAgICAgIGtleSA9PiBmaWVsZHNba2V5XSAmJiBmaWVsZHNba2V5XS50eXBlID09PSAnR2VvUG9pbnQnXG4gICAgKTtcbiAgICBpZiAoZ2VvUG9pbnRzLmxlbmd0aCA+IDEpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIGNvZGU6IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICBlcnJvcjpcbiAgICAgICAgICAnY3VycmVudGx5LCBvbmx5IG9uZSBHZW9Qb2ludCBmaWVsZCBtYXkgZXhpc3QgaW4gYW4gb2JqZWN0LiBBZGRpbmcgJyArXG4gICAgICAgICAgZ2VvUG9pbnRzWzFdICtcbiAgICAgICAgICAnIHdoZW4gJyArXG4gICAgICAgICAgZ2VvUG9pbnRzWzBdICtcbiAgICAgICAgICAnIGFscmVhZHkgZXhpc3RzLicsXG4gICAgICB9O1xuICAgIH1cbiAgICB2YWxpZGF0ZUNMUChjbGFzc0xldmVsUGVybWlzc2lvbnMsIGZpZWxkcywgdGhpcy51c2VySWRSZWdFeCk7XG4gIH1cblxuICAvLyBTZXRzIHRoZSBDbGFzcy1sZXZlbCBwZXJtaXNzaW9ucyBmb3IgYSBnaXZlbiBjbGFzc05hbWUsIHdoaWNoIG11c3QgZXhpc3QuXG4gIGFzeW5jIHNldFBlcm1pc3Npb25zKGNsYXNzTmFtZTogc3RyaW5nLCBwZXJtczogYW55LCBuZXdTY2hlbWE6IFNjaGVtYUZpZWxkcykge1xuICAgIGlmICh0eXBlb2YgcGVybXMgPT09ICd1bmRlZmluZWQnKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuICAgIHZhbGlkYXRlQ0xQKHBlcm1zLCBuZXdTY2hlbWEsIHRoaXMudXNlcklkUmVnRXgpO1xuICAgIGF3YWl0IHRoaXMuX2RiQWRhcHRlci5zZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lLCBwZXJtcyk7XG4gICAgY29uc3QgY2FjaGVkID0gU2NoZW1hQ2FjaGUuZ2V0KGNsYXNzTmFtZSk7XG4gICAgaWYgKGNhY2hlZCkge1xuICAgICAgY2FjaGVkLmNsYXNzTGV2ZWxQZXJtaXNzaW9ucyA9IHBlcm1zO1xuICAgIH1cbiAgfVxuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgc3VjY2Vzc2Z1bGx5IHRvIHRoZSBuZXcgc2NoZW1hXG4gIC8vIG9iamVjdCBpZiB0aGUgcHJvdmlkZWQgY2xhc3NOYW1lLWZpZWxkTmFtZS10eXBlIHR1cGxlIGlzIHZhbGlkLlxuICAvLyBUaGUgY2xhc3NOYW1lIG11c3QgYWxyZWFkeSBiZSB2YWxpZGF0ZWQuXG4gIC8vIElmICdmcmVlemUnIGlzIHRydWUsIHJlZnVzZSB0byB1cGRhdGUgdGhlIHNjaGVtYSBmb3IgdGhpcyBmaWVsZC5cbiAgZW5mb3JjZUZpZWxkRXhpc3RzKFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGZpZWxkTmFtZTogc3RyaW5nLFxuICAgIHR5cGU6IHN0cmluZyB8IFNjaGVtYUZpZWxkLFxuICAgIGlzVmFsaWRhdGlvbj86IGJvb2xlYW4sXG4gICAgbWFpbnRlbmFuY2U/OiBib29sZWFuXG4gICkge1xuICAgIGlmIChmaWVsZE5hbWUuaW5kZXhPZignLicpID4gMCkge1xuICAgICAgLy8gc3ViZG9jdW1lbnQga2V5ICh4LnkpID0+IG9rIGlmIHggaXMgb2YgdHlwZSAnb2JqZWN0J1xuICAgICAgZmllbGROYW1lID0gZmllbGROYW1lLnNwbGl0KCcuJylbMF07XG4gICAgICB0eXBlID0gJ09iamVjdCc7XG4gICAgfVxuICAgIGxldCBmaWVsZE5hbWVUb1ZhbGlkYXRlID0gYCR7ZmllbGROYW1lfWA7XG4gICAgaWYgKG1haW50ZW5hbmNlICYmIGZpZWxkTmFtZVRvVmFsaWRhdGUuY2hhckF0KDApID09PSAnXycpIHtcbiAgICAgIGZpZWxkTmFtZVRvVmFsaWRhdGUgPSBmaWVsZE5hbWVUb1ZhbGlkYXRlLnN1YnN0cmluZygxKTtcbiAgICB9XG4gICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZVRvVmFsaWRhdGUsIGNsYXNzTmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0tFWV9OQU1FLCBgSW52YWxpZCBmaWVsZCBuYW1lOiAke2ZpZWxkTmFtZX0uYCk7XG4gICAgfVxuXG4gICAgLy8gSWYgc29tZW9uZSB0cmllcyB0byBjcmVhdGUgYSBuZXcgZmllbGQgd2l0aCBudWxsL3VuZGVmaW5lZCBhcyB0aGUgdmFsdWUsIHJldHVybjtcbiAgICBpZiAoIXR5cGUpIHtcbiAgICAgIHJldHVybiB1bmRlZmluZWQ7XG4gICAgfVxuXG4gICAgY29uc3QgZXhwZWN0ZWRUeXBlID0gdGhpcy5nZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lLCBmaWVsZE5hbWUpO1xuICAgIGlmICh0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHR5cGUgPSAoeyB0eXBlIH06IFNjaGVtYUZpZWxkKTtcbiAgICB9XG5cbiAgICBpZiAodHlwZS5kZWZhdWx0VmFsdWUgIT09IHVuZGVmaW5lZCkge1xuICAgICAgbGV0IGRlZmF1bHRWYWx1ZVR5cGUgPSBnZXRUeXBlKHR5cGUuZGVmYXVsdFZhbHVlKTtcbiAgICAgIGlmICh0eXBlb2YgZGVmYXVsdFZhbHVlVHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgZGVmYXVsdFZhbHVlVHlwZSA9IHsgdHlwZTogZGVmYXVsdFZhbHVlVHlwZSB9O1xuICAgICAgfVxuICAgICAgaWYgKCFkYlR5cGVNYXRjaGVzT2JqZWN0VHlwZSh0eXBlLCBkZWZhdWx0VmFsdWVUeXBlKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsXG4gICAgICAgICAgYHNjaGVtYSBtaXNtYXRjaCBmb3IgJHtjbGFzc05hbWV9LiR7ZmllbGROYW1lfSBkZWZhdWx0IHZhbHVlOyBleHBlY3RlZCAke3R5cGVUb1N0cmluZyhcbiAgICAgICAgICAgIHR5cGVcbiAgICAgICAgICApfSBidXQgZ290ICR7dHlwZVRvU3RyaW5nKGRlZmF1bHRWYWx1ZVR5cGUpfWBcbiAgICAgICAgKTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICBpZiAoZXhwZWN0ZWRUeXBlKSB7XG4gICAgICBpZiAoIWRiVHlwZU1hdGNoZXNPYmplY3RUeXBlKGV4cGVjdGVkVHlwZSwgdHlwZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFLFxuICAgICAgICAgIGBzY2hlbWEgbWlzbWF0Y2ggZm9yICR7Y2xhc3NOYW1lfS4ke2ZpZWxkTmFtZX07IGV4cGVjdGVkICR7dHlwZVRvU3RyaW5nKFxuICAgICAgICAgICAgZXhwZWN0ZWRUeXBlXG4gICAgICAgICAgKX0gYnV0IGdvdCAke3R5cGVUb1N0cmluZyh0eXBlKX1gXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyBJZiB0eXBlIG9wdGlvbnMgZG8gbm90IGNoYW5nZVxuICAgICAgLy8gd2UgY2FuIHNhZmVseSByZXR1cm5cbiAgICAgIGlmIChpc1ZhbGlkYXRpb24gfHwgSlNPTi5zdHJpbmdpZnkoZXhwZWN0ZWRUeXBlKSA9PT0gSlNPTi5zdHJpbmdpZnkodHlwZSkpIHtcbiAgICAgICAgcmV0dXJuIHVuZGVmaW5lZDtcbiAgICAgIH1cbiAgICAgIC8vIEZpZWxkIG9wdGlvbnMgYXJlIG1heSBiZSBjaGFuZ2VkXG4gICAgICAvLyBlbnN1cmUgdG8gaGF2ZSBhbiB1cGRhdGUgdG8gZGF0ZSBzY2hlbWEgZmllbGRcbiAgICAgIHJldHVybiB0aGlzLl9kYkFkYXB0ZXIudXBkYXRlRmllbGRPcHRpb25zKGNsYXNzTmFtZSwgZmllbGROYW1lLCB0eXBlKTtcbiAgICB9XG5cbiAgICByZXR1cm4gdGhpcy5fZGJBZGFwdGVyXG4gICAgICAuYWRkRmllbGRJZk5vdEV4aXN0cyhjbGFzc05hbWUsIGZpZWxkTmFtZSwgdHlwZSlcbiAgICAgIC5jYXRjaChlcnJvciA9PiB7XG4gICAgICAgIGlmIChlcnJvci5jb2RlID09IFBhcnNlLkVycm9yLklOQ09SUkVDVF9UWVBFKSB7XG4gICAgICAgICAgLy8gTWFrZSBzdXJlIHRoYXQgd2UgdGhyb3cgZXJyb3JzIHdoZW4gaXQgaXMgYXBwcm9wcmlhdGUgdG8gZG8gc28uXG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgICAgLy8gVGhlIHVwZGF0ZSBmYWlsZWQuIFRoaXMgY2FuIGJlIG9rYXkgLSBpdCBtaWdodCBoYXZlIGJlZW4gYSByYWNlXG4gICAgICAgIC8vIGNvbmRpdGlvbiB3aGVyZSBhbm90aGVyIGNsaWVudCB1cGRhdGVkIHRoZSBzY2hlbWEgaW4gdGhlIHNhbWVcbiAgICAgICAgLy8gd2F5IHRoYXQgd2Ugd2FudGVkIHRvLiBTbywganVzdCByZWxvYWQgdGhlIHNjaGVtYVxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9KVxuICAgICAgLnRoZW4oKCkgPT4ge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIGNsYXNzTmFtZSxcbiAgICAgICAgICBmaWVsZE5hbWUsXG4gICAgICAgICAgdHlwZSxcbiAgICAgICAgfTtcbiAgICAgIH0pO1xuICB9XG5cbiAgZW5zdXJlRmllbGRzKGZpZWxkczogYW55KSB7XG4gICAgZm9yIChsZXQgaSA9IDA7IGkgPCBmaWVsZHMubGVuZ3RoOyBpICs9IDEpIHtcbiAgICAgIGNvbnN0IHsgY2xhc3NOYW1lLCBmaWVsZE5hbWUgfSA9IGZpZWxkc1tpXTtcbiAgICAgIGxldCB7IHR5cGUgfSA9IGZpZWxkc1tpXTtcbiAgICAgIGNvbnN0IGV4cGVjdGVkVHlwZSA9IHRoaXMuZ2V0RXhwZWN0ZWRUeXBlKGNsYXNzTmFtZSwgZmllbGROYW1lKTtcbiAgICAgIGlmICh0eXBlb2YgdHlwZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgICAgdHlwZSA9IHsgdHlwZTogdHlwZSB9O1xuICAgICAgfVxuICAgICAgaWYgKCFleHBlY3RlZFR5cGUgfHwgIWRiVHlwZU1hdGNoZXNPYmplY3RUeXBlKGV4cGVjdGVkVHlwZSwgdHlwZSkpIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFBhcnNlLkVycm9yLklOVkFMSURfSlNPTiwgYENvdWxkIG5vdCBhZGQgZmllbGQgJHtmaWVsZE5hbWV9YCk7XG4gICAgICB9XG4gICAgfVxuICB9XG5cbiAgLy8gbWFpbnRhaW4gY29tcGF0aWJpbGl0eVxuICBkZWxldGVGaWVsZChmaWVsZE5hbWU6IHN0cmluZywgY2xhc3NOYW1lOiBzdHJpbmcsIGRhdGFiYXNlOiBEYXRhYmFzZUNvbnRyb2xsZXIpIHtcbiAgICByZXR1cm4gdGhpcy5kZWxldGVGaWVsZHMoW2ZpZWxkTmFtZV0sIGNsYXNzTmFtZSwgZGF0YWJhc2UpO1xuICB9XG5cbiAgLy8gRGVsZXRlIGZpZWxkcywgYW5kIHJlbW92ZSB0aGF0IGRhdGEgZnJvbSBhbGwgb2JqZWN0cy4gVGhpcyBpcyBpbnRlbmRlZFxuICAvLyB0byByZW1vdmUgdW51c2VkIGZpZWxkcywgaWYgb3RoZXIgd3JpdGVycyBhcmUgd3JpdGluZyBvYmplY3RzIHRoYXQgaW5jbHVkZVxuICAvLyB0aGlzIGZpZWxkLCB0aGUgZmllbGQgbWF5IHJlYXBwZWFyLiBSZXR1cm5zIGEgUHJvbWlzZSB0aGF0IHJlc29sdmVzIHdpdGhcbiAgLy8gbm8gb2JqZWN0IG9uIHN1Y2Nlc3MsIG9yIHJlamVjdHMgd2l0aCB7IGNvZGUsIGVycm9yIH0gb24gZmFpbHVyZS5cbiAgLy8gUGFzc2luZyB0aGUgZGF0YWJhc2UgYW5kIHByZWZpeCBpcyBuZWNlc3NhcnkgaW4gb3JkZXIgdG8gZHJvcCByZWxhdGlvbiBjb2xsZWN0aW9uc1xuICAvLyBhbmQgcmVtb3ZlIGZpZWxkcyBmcm9tIG9iamVjdHMuIElkZWFsbHkgdGhlIGRhdGFiYXNlIHdvdWxkIGJlbG9uZyB0b1xuICAvLyBhIGRhdGFiYXNlIGFkYXB0ZXIgYW5kIHRoaXMgZnVuY3Rpb24gd291bGQgY2xvc2Ugb3ZlciBpdCBvciBhY2Nlc3MgaXQgdmlhIG1lbWJlci5cbiAgZGVsZXRlRmllbGRzKGZpZWxkTmFtZXM6IEFycmF5PHN0cmluZz4sIGNsYXNzTmFtZTogc3RyaW5nLCBkYXRhYmFzZTogRGF0YWJhc2VDb250cm9sbGVyKSB7XG4gICAgaWYgKCFjbGFzc05hbWVJc1ZhbGlkKGNsYXNzTmFtZSkpIHtcbiAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTlZBTElEX0NMQVNTX05BTUUsIGludmFsaWRDbGFzc05hbWVNZXNzYWdlKGNsYXNzTmFtZSkpO1xuICAgIH1cblxuICAgIGZpZWxkTmFtZXMuZm9yRWFjaChmaWVsZE5hbWUgPT4ge1xuICAgICAgaWYgKCFmaWVsZE5hbWVJc1ZhbGlkKGZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5WQUxJRF9LRVlfTkFNRSwgYGludmFsaWQgZmllbGQgbmFtZTogJHtmaWVsZE5hbWV9YCk7XG4gICAgICB9XG4gICAgICAvL0Rvbid0IGFsbG93IGRlbGV0aW5nIHRoZSBkZWZhdWx0IGZpZWxkcy5cbiAgICAgIGlmICghZmllbGROYW1lSXNWYWxpZEZvckNsYXNzKGZpZWxkTmFtZSwgY2xhc3NOYW1lKSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoMTM2LCBgZmllbGQgJHtmaWVsZE5hbWV9IGNhbm5vdCBiZSBjaGFuZ2VkYCk7XG4gICAgICB9XG4gICAgfSk7XG5cbiAgICByZXR1cm4gdGhpcy5nZXRPbmVTY2hlbWEoY2xhc3NOYW1lLCBmYWxzZSwgeyBjbGVhckNhY2hlOiB0cnVlIH0pXG4gICAgICAuY2F0Y2goZXJyb3IgPT4ge1xuICAgICAgICBpZiAoZXJyb3IgPT09IHVuZGVmaW5lZCkge1xuICAgICAgICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihcbiAgICAgICAgICAgIFBhcnNlLkVycm9yLklOVkFMSURfQ0xBU1NfTkFNRSxcbiAgICAgICAgICAgIGBDbGFzcyAke2NsYXNzTmFtZX0gZG9lcyBub3QgZXhpc3QuYFxuICAgICAgICAgICk7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgdGhyb3cgZXJyb3I7XG4gICAgICAgIH1cbiAgICAgIH0pXG4gICAgICAudGhlbihzY2hlbWEgPT4ge1xuICAgICAgICBmaWVsZE5hbWVzLmZvckVhY2goZmllbGROYW1lID0+IHtcbiAgICAgICAgICBpZiAoIXNjaGVtYS5maWVsZHNbZmllbGROYW1lXSkge1xuICAgICAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKDI1NSwgYEZpZWxkICR7ZmllbGROYW1lfSBkb2VzIG5vdCBleGlzdCwgY2Fubm90IGRlbGV0ZS5gKTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuXG4gICAgICAgIGNvbnN0IHNjaGVtYUZpZWxkcyA9IHsgLi4uc2NoZW1hLmZpZWxkcyB9O1xuICAgICAgICByZXR1cm4gZGF0YWJhc2UuYWRhcHRlci5kZWxldGVGaWVsZHMoY2xhc3NOYW1lLCBzY2hlbWEsIGZpZWxkTmFtZXMpLnRoZW4oKCkgPT4ge1xuICAgICAgICAgIHJldHVybiBQcm9taXNlLmFsbChcbiAgICAgICAgICAgIGZpZWxkTmFtZXMubWFwKGZpZWxkTmFtZSA9PiB7XG4gICAgICAgICAgICAgIGNvbnN0IGZpZWxkID0gc2NoZW1hRmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICAgICAgICAgIGlmIChmaWVsZCAmJiBmaWVsZC50eXBlID09PSAnUmVsYXRpb24nKSB7XG4gICAgICAgICAgICAgICAgLy9Gb3IgcmVsYXRpb25zLCBkcm9wIHRoZSBfSm9pbiB0YWJsZVxuICAgICAgICAgICAgICAgIHJldHVybiBkYXRhYmFzZS5hZGFwdGVyLmRlbGV0ZUNsYXNzKGBfSm9pbjoke2ZpZWxkTmFtZX06JHtjbGFzc05hbWV9YCk7XG4gICAgICAgICAgICAgIH1cbiAgICAgICAgICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgICAgICAgICAgfSlcbiAgICAgICAgICApO1xuICAgICAgICB9KTtcbiAgICAgIH0pXG4gICAgICAudGhlbigoKSA9PiB7XG4gICAgICAgIFNjaGVtYUNhY2hlLmNsZWFyKCk7XG4gICAgICB9KTtcbiAgfVxuXG4gIC8vIFZhbGlkYXRlcyBhbiBvYmplY3QgcHJvdmlkZWQgaW4gUkVTVCBmb3JtYXQuXG4gIC8vIFJldHVybnMgYSBwcm9taXNlIHRoYXQgcmVzb2x2ZXMgdG8gdGhlIG5ldyBzY2hlbWEgaWYgdGhpcyBvYmplY3QgaXNcbiAgLy8gdmFsaWQuXG4gIGFzeW5jIHZhbGlkYXRlT2JqZWN0KGNsYXNzTmFtZTogc3RyaW5nLCBvYmplY3Q6IGFueSwgcXVlcnk6IGFueSwgbWFpbnRlbmFuY2U6IGJvb2xlYW4pIHtcbiAgICBsZXQgZ2VvY291bnQgPSAwO1xuICAgIGNvbnN0IHNjaGVtYSA9IGF3YWl0IHRoaXMuZW5mb3JjZUNsYXNzRXhpc3RzKGNsYXNzTmFtZSk7XG4gICAgY29uc3QgcHJvbWlzZXMgPSBbXTtcblxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIG9iamVjdCkge1xuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdICYmIGdldFR5cGUob2JqZWN0W2ZpZWxkTmFtZV0pID09PSAnR2VvUG9pbnQnKSB7XG4gICAgICAgIGdlb2NvdW50Kys7XG4gICAgICB9XG4gICAgICBpZiAoZ2VvY291bnQgPiAxKSB7XG4gICAgICAgIHJldHVybiBQcm9taXNlLnJlamVjdChcbiAgICAgICAgICBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgICBQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSxcbiAgICAgICAgICAgICd0aGVyZSBjYW4gb25seSBiZSBvbmUgZ2VvcG9pbnQgZmllbGQgaW4gYSBjbGFzcydcbiAgICAgICAgICApXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgfVxuICAgIGZvciAoY29uc3QgZmllbGROYW1lIGluIG9iamVjdCkge1xuICAgICAgaWYgKG9iamVjdFtmaWVsZE5hbWVdID09PSB1bmRlZmluZWQpIHtcbiAgICAgICAgY29udGludWU7XG4gICAgICB9XG4gICAgICBjb25zdCBleHBlY3RlZCA9IGdldFR5cGUob2JqZWN0W2ZpZWxkTmFtZV0pO1xuICAgICAgaWYgKCFleHBlY3RlZCkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGlmIChmaWVsZE5hbWUgPT09ICdBQ0wnKSB7XG4gICAgICAgIC8vIEV2ZXJ5IG9iamVjdCBoYXMgQUNMIGltcGxpY2l0bHkuXG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgcHJvbWlzZXMucHVzaChzY2hlbWEuZW5mb3JjZUZpZWxkRXhpc3RzKGNsYXNzTmFtZSwgZmllbGROYW1lLCBleHBlY3RlZCwgdHJ1ZSwgbWFpbnRlbmFuY2UpKTtcbiAgICB9XG4gICAgY29uc3QgcmVzdWx0cyA9IGF3YWl0IFByb21pc2UuYWxsKHByb21pc2VzKTtcbiAgICBjb25zdCBlbmZvcmNlRmllbGRzID0gcmVzdWx0cy5maWx0ZXIocmVzdWx0ID0+ICEhcmVzdWx0KTtcblxuICAgIGlmIChlbmZvcmNlRmllbGRzLmxlbmd0aCAhPT0gMCkge1xuICAgICAgLy8gVE9ETzogUmVtb3ZlIGJ5IHVwZGF0aW5nIHNjaGVtYSBjYWNoZSBkaXJlY3RseVxuICAgICAgYXdhaXQgdGhpcy5yZWxvYWREYXRhKHsgY2xlYXJDYWNoZTogdHJ1ZSB9KTtcbiAgICB9XG4gICAgdGhpcy5lbnN1cmVGaWVsZHMoZW5mb3JjZUZpZWxkcyk7XG5cbiAgICBjb25zdCBwcm9taXNlID0gUHJvbWlzZS5yZXNvbHZlKHNjaGVtYSk7XG4gICAgcmV0dXJuIHRoZW5WYWxpZGF0ZVJlcXVpcmVkQ29sdW1ucyhwcm9taXNlLCBjbGFzc05hbWUsIG9iamVjdCwgcXVlcnkpO1xuICB9XG5cbiAgLy8gVmFsaWRhdGVzIHRoYXQgYWxsIHRoZSBwcm9wZXJ0aWVzIGFyZSBzZXQgZm9yIHRoZSBvYmplY3RcbiAgdmFsaWRhdGVSZXF1aXJlZENvbHVtbnMoY2xhc3NOYW1lOiBzdHJpbmcsIG9iamVjdDogYW55LCBxdWVyeTogYW55KSB7XG4gICAgY29uc3QgY29sdW1ucyA9IHJlcXVpcmVkQ29sdW1ucy53cml0ZVtjbGFzc05hbWVdO1xuICAgIGlmICghY29sdW1ucyB8fCBjb2x1bW5zLmxlbmd0aCA9PSAwKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKHRoaXMpO1xuICAgIH1cblxuICAgIGNvbnN0IG1pc3NpbmdDb2x1bW5zID0gY29sdW1ucy5maWx0ZXIoZnVuY3Rpb24gKGNvbHVtbikge1xuICAgICAgaWYgKHF1ZXJ5ICYmIHF1ZXJ5Lm9iamVjdElkKSB7XG4gICAgICAgIGlmIChvYmplY3RbY29sdW1uXSAmJiB0eXBlb2Ygb2JqZWN0W2NvbHVtbl0gPT09ICdvYmplY3QnKSB7XG4gICAgICAgICAgLy8gVHJ5aW5nIHRvIGRlbGV0ZSBhIHJlcXVpcmVkIGNvbHVtblxuICAgICAgICAgIHJldHVybiBvYmplY3RbY29sdW1uXS5fX29wID09ICdEZWxldGUnO1xuICAgICAgICB9XG4gICAgICAgIC8vIE5vdCB0cnlpbmcgdG8gZG8gYW55dGhpbmcgdGhlcmVcbiAgICAgICAgcmV0dXJuIGZhbHNlO1xuICAgICAgfVxuICAgICAgcmV0dXJuICFvYmplY3RbY29sdW1uXTtcbiAgICB9KTtcblxuICAgIGlmIChtaXNzaW5nQ29sdW1ucy5sZW5ndGggPiAwKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoUGFyc2UuRXJyb3IuSU5DT1JSRUNUX1RZUEUsIG1pc3NpbmdDb2x1bW5zWzBdICsgJyBpcyByZXF1aXJlZC4nKTtcbiAgICB9XG4gICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSh0aGlzKTtcbiAgfVxuXG4gIHRlc3RQZXJtaXNzaW9uc0ZvckNsYXNzTmFtZShjbGFzc05hbWU6IHN0cmluZywgYWNsR3JvdXA6IHN0cmluZ1tdLCBvcGVyYXRpb246IHN0cmluZykge1xuICAgIHJldHVybiBTY2hlbWFDb250cm9sbGVyLnRlc3RQZXJtaXNzaW9ucyhcbiAgICAgIHRoaXMuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSksXG4gICAgICBhY2xHcm91cCxcbiAgICAgIG9wZXJhdGlvblxuICAgICk7XG4gIH1cblxuICAvLyBUZXN0cyB0aGF0IHRoZSBjbGFzcyBsZXZlbCBwZXJtaXNzaW9uIGxldCBwYXNzIHRoZSBvcGVyYXRpb24gZm9yIGEgZ2l2ZW4gYWNsR3JvdXBcbiAgc3RhdGljIHRlc3RQZXJtaXNzaW9ucyhjbGFzc1Blcm1pc3Npb25zOiA/YW55LCBhY2xHcm91cDogc3RyaW5nW10sIG9wZXJhdGlvbjogc3RyaW5nKTogYm9vbGVhbiB7XG4gICAgaWYgKCFjbGFzc1Blcm1pc3Npb25zIHx8ICFjbGFzc1Blcm1pc3Npb25zW29wZXJhdGlvbl0pIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBjb25zdCBwZXJtcyA9IGNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXTtcbiAgICBpZiAocGVybXNbJyonXSkge1xuICAgICAgcmV0dXJuIHRydWU7XG4gICAgfVxuICAgIC8vIENoZWNrIHBlcm1pc3Npb25zIGFnYWluc3QgdGhlIGFjbEdyb3VwIHByb3ZpZGVkIChhcnJheSBvZiB1c2VySWQvcm9sZXMpXG4gICAgaWYgKFxuICAgICAgYWNsR3JvdXAuc29tZShhY2wgPT4ge1xuICAgICAgICByZXR1cm4gcGVybXNbYWNsXSA9PT0gdHJ1ZTtcbiAgICAgIH0pXG4gICAgKSB7XG4gICAgICByZXR1cm4gdHJ1ZTtcbiAgICB9XG4gICAgcmV0dXJuIGZhbHNlO1xuICB9XG5cbiAgLy8gVmFsaWRhdGVzIGFuIG9wZXJhdGlvbiBwYXNzZXMgY2xhc3MtbGV2ZWwtcGVybWlzc2lvbnMgc2V0IGluIHRoZSBzY2hlbWFcbiAgc3RhdGljIHZhbGlkYXRlUGVybWlzc2lvbihcbiAgICBjbGFzc1Blcm1pc3Npb25zOiA/YW55LFxuICAgIGNsYXNzTmFtZTogc3RyaW5nLFxuICAgIGFjbEdyb3VwOiBzdHJpbmdbXSxcbiAgICBvcGVyYXRpb246IHN0cmluZyxcbiAgICBhY3Rpb24/OiBzdHJpbmdcbiAgKSB7XG4gICAgaWYgKFNjaGVtYUNvbnRyb2xsZXIudGVzdFBlcm1pc3Npb25zKGNsYXNzUGVybWlzc2lvbnMsIGFjbEdyb3VwLCBvcGVyYXRpb24pKSB7XG4gICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgfVxuXG4gICAgaWYgKCFjbGFzc1Blcm1pc3Npb25zIHx8ICFjbGFzc1Blcm1pc3Npb25zW29wZXJhdGlvbl0pIHtcbiAgICAgIHJldHVybiB0cnVlO1xuICAgIH1cbiAgICBjb25zdCBwZXJtcyA9IGNsYXNzUGVybWlzc2lvbnNbb3BlcmF0aW9uXTtcbiAgICAvLyBJZiBvbmx5IGZvciBhdXRoZW50aWNhdGVkIHVzZXJzXG4gICAgLy8gbWFrZSBzdXJlIHdlIGhhdmUgYW4gYWNsR3JvdXBcbiAgICBpZiAocGVybXNbJ3JlcXVpcmVzQXV0aGVudGljYXRpb24nXSkge1xuICAgICAgLy8gSWYgYWNsR3JvdXAgaGFzICogKHB1YmxpYylcbiAgICAgIGlmICghYWNsR3JvdXAgfHwgYWNsR3JvdXAubGVuZ3RoID09IDApIHtcbiAgICAgICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgICAgIFBhcnNlLkVycm9yLk9CSkVDVF9OT1RfRk9VTkQsXG4gICAgICAgICAgJ1Blcm1pc3Npb24gZGVuaWVkLCB1c2VyIG5lZWRzIHRvIGJlIGF1dGhlbnRpY2F0ZWQuJ1xuICAgICAgICApO1xuICAgICAgfSBlbHNlIGlmIChhY2xHcm91cC5pbmRleE9mKCcqJykgPiAtMSAmJiBhY2xHcm91cC5sZW5ndGggPT0gMSkge1xuICAgICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgICAgUGFyc2UuRXJyb3IuT0JKRUNUX05PVF9GT1VORCxcbiAgICAgICAgICAnUGVybWlzc2lvbiBkZW5pZWQsIHVzZXIgbmVlZHMgdG8gYmUgYXV0aGVudGljYXRlZC4nXG4gICAgICAgICk7XG4gICAgICB9XG4gICAgICAvLyByZXF1aXJlc0F1dGhlbnRpY2F0aW9uIHBhc3NlZCwganVzdCBtb3ZlIGZvcndhcmRcbiAgICAgIC8vIHByb2JhYmx5IHdvdWxkIGJlIHdpc2UgYXQgc29tZSBwb2ludCB0byByZW5hbWUgdG8gJ2F1dGhlbnRpY2F0ZWRVc2VyJ1xuICAgICAgcmV0dXJuIFByb21pc2UucmVzb2x2ZSgpO1xuICAgIH1cblxuICAgIC8vIE5vIG1hdGNoaW5nIENMUCwgbGV0J3MgY2hlY2sgdGhlIFBvaW50ZXIgcGVybWlzc2lvbnNcbiAgICAvLyBBbmQgaGFuZGxlIHRob3NlIGxhdGVyXG4gICAgY29uc3QgcGVybWlzc2lvbkZpZWxkID1cbiAgICAgIFsnZ2V0JywgJ2ZpbmQnLCAnY291bnQnXS5pbmRleE9mKG9wZXJhdGlvbikgPiAtMSA/ICdyZWFkVXNlckZpZWxkcycgOiAnd3JpdGVVc2VyRmllbGRzJztcblxuICAgIC8vIFJlamVjdCBjcmVhdGUgd2hlbiB3cml0ZSBsb2NrZG93blxuICAgIGlmIChwZXJtaXNzaW9uRmllbGQgPT0gJ3dyaXRlVXNlckZpZWxkcycgJiYgb3BlcmF0aW9uID09ICdjcmVhdGUnKSB7XG4gICAgICB0aHJvdyBuZXcgUGFyc2UuRXJyb3IoXG4gICAgICAgIFBhcnNlLkVycm9yLk9QRVJBVElPTl9GT1JCSURERU4sXG4gICAgICAgIGBQZXJtaXNzaW9uIGRlbmllZCBmb3IgYWN0aW9uICR7b3BlcmF0aW9ufSBvbiBjbGFzcyAke2NsYXNzTmFtZX0uYFxuICAgICAgKTtcbiAgICB9XG5cbiAgICAvLyBQcm9jZXNzIHRoZSByZWFkVXNlckZpZWxkcyBsYXRlclxuICAgIGlmIChcbiAgICAgIEFycmF5LmlzQXJyYXkoY2xhc3NQZXJtaXNzaW9uc1twZXJtaXNzaW9uRmllbGRdKSAmJlxuICAgICAgY2xhc3NQZXJtaXNzaW9uc1twZXJtaXNzaW9uRmllbGRdLmxlbmd0aCA+IDBcbiAgICApIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUoKTtcbiAgICB9XG5cbiAgICBjb25zdCBwb2ludGVyRmllbGRzID0gY2xhc3NQZXJtaXNzaW9uc1tvcGVyYXRpb25dLnBvaW50ZXJGaWVsZHM7XG4gICAgaWYgKEFycmF5LmlzQXJyYXkocG9pbnRlckZpZWxkcykgJiYgcG9pbnRlckZpZWxkcy5sZW5ndGggPiAwKSB7XG4gICAgICAvLyBhbnkgb3AgZXhjZXB0ICdhZGRGaWVsZCBhcyBwYXJ0IG9mIGNyZWF0ZScgaXMgb2suXG4gICAgICBpZiAob3BlcmF0aW9uICE9PSAnYWRkRmllbGQnIHx8IGFjdGlvbiA9PT0gJ3VwZGF0ZScpIHtcbiAgICAgICAgLy8gV2UgY2FuIGFsbG93IGFkZGluZyBmaWVsZCBvbiB1cGRhdGUgZmxvdyBvbmx5LlxuICAgICAgICByZXR1cm4gUHJvbWlzZS5yZXNvbHZlKCk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFBhcnNlLkVycm9yKFxuICAgICAgUGFyc2UuRXJyb3IuT1BFUkFUSU9OX0ZPUkJJRERFTixcbiAgICAgIGBQZXJtaXNzaW9uIGRlbmllZCBmb3IgYWN0aW9uICR7b3BlcmF0aW9ufSBvbiBjbGFzcyAke2NsYXNzTmFtZX0uYFxuICAgICk7XG4gIH1cblxuICAvLyBWYWxpZGF0ZXMgYW4gb3BlcmF0aW9uIHBhc3NlcyBjbGFzcy1sZXZlbC1wZXJtaXNzaW9ucyBzZXQgaW4gdGhlIHNjaGVtYVxuICB2YWxpZGF0ZVBlcm1pc3Npb24oY2xhc3NOYW1lOiBzdHJpbmcsIGFjbEdyb3VwOiBzdHJpbmdbXSwgb3BlcmF0aW9uOiBzdHJpbmcsIGFjdGlvbj86IHN0cmluZykge1xuICAgIHJldHVybiBTY2hlbWFDb250cm9sbGVyLnZhbGlkYXRlUGVybWlzc2lvbihcbiAgICAgIHRoaXMuZ2V0Q2xhc3NMZXZlbFBlcm1pc3Npb25zKGNsYXNzTmFtZSksXG4gICAgICBjbGFzc05hbWUsXG4gICAgICBhY2xHcm91cCxcbiAgICAgIG9wZXJhdGlvbixcbiAgICAgIGFjdGlvblxuICAgICk7XG4gIH1cblxuICBnZXRDbGFzc0xldmVsUGVybWlzc2lvbnMoY2xhc3NOYW1lOiBzdHJpbmcpOiBhbnkge1xuICAgIHJldHVybiB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSAmJiB0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXS5jbGFzc0xldmVsUGVybWlzc2lvbnM7XG4gIH1cblxuICAvLyBSZXR1cm5zIHRoZSBleHBlY3RlZCB0eXBlIGZvciBhIGNsYXNzTmFtZStrZXkgY29tYmluYXRpb25cbiAgLy8gb3IgdW5kZWZpbmVkIGlmIHRoZSBzY2hlbWEgaXMgbm90IHNldFxuICBnZXRFeHBlY3RlZFR5cGUoY2xhc3NOYW1lOiBzdHJpbmcsIGZpZWxkTmFtZTogc3RyaW5nKTogPyhTY2hlbWFGaWVsZCB8IHN0cmluZykge1xuICAgIGlmICh0aGlzLnNjaGVtYURhdGFbY2xhc3NOYW1lXSkge1xuICAgICAgY29uc3QgZXhwZWN0ZWRUeXBlID0gdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0uZmllbGRzW2ZpZWxkTmFtZV07XG4gICAgICByZXR1cm4gZXhwZWN0ZWRUeXBlID09PSAnbWFwJyA/ICdPYmplY3QnIDogZXhwZWN0ZWRUeXBlO1xuICAgIH1cbiAgICByZXR1cm4gdW5kZWZpbmVkO1xuICB9XG5cbiAgLy8gQ2hlY2tzIGlmIGEgZ2l2ZW4gY2xhc3MgaXMgaW4gdGhlIHNjaGVtYS5cbiAgaGFzQ2xhc3MoY2xhc3NOYW1lOiBzdHJpbmcpIHtcbiAgICBpZiAodGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pIHtcbiAgICAgIHJldHVybiBQcm9taXNlLnJlc29sdmUodHJ1ZSk7XG4gICAgfVxuICAgIHJldHVybiB0aGlzLnJlbG9hZERhdGEoKS50aGVuKCgpID0+ICEhdGhpcy5zY2hlbWFEYXRhW2NsYXNzTmFtZV0pO1xuICB9XG59XG5cbi8vIFJldHVybnMgYSBwcm9taXNlIGZvciBhIG5ldyBTY2hlbWEuXG5jb25zdCBsb2FkID0gKGRiQWRhcHRlcjogU3RvcmFnZUFkYXB0ZXIsIG9wdGlvbnM6IGFueSk6IFByb21pc2U8U2NoZW1hQ29udHJvbGxlcj4gPT4ge1xuICBjb25zdCBzY2hlbWEgPSBuZXcgU2NoZW1hQ29udHJvbGxlcihkYkFkYXB0ZXIpO1xuICB0dGwuZHVyYXRpb24gPSBkYkFkYXB0ZXIuc2NoZW1hQ2FjaGVUdGw7XG4gIHJldHVybiBzY2hlbWEucmVsb2FkRGF0YShvcHRpb25zKS50aGVuKCgpID0+IHNjaGVtYSk7XG59O1xuXG4vLyBCdWlsZHMgYSBuZXcgc2NoZW1hIChpbiBzY2hlbWEgQVBJIHJlc3BvbnNlIGZvcm1hdCkgb3V0IG9mIGFuXG4vLyBleGlzdGluZyBtb25nbyBzY2hlbWEgKyBhIHNjaGVtYXMgQVBJIHB1dCByZXF1ZXN0LiBUaGlzIHJlc3BvbnNlXG4vLyBkb2VzIG5vdCBpbmNsdWRlIHRoZSBkZWZhdWx0IGZpZWxkcywgYXMgaXQgaXMgaW50ZW5kZWQgdG8gYmUgcGFzc2VkXG4vLyB0byBtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWUuIE5vIHZhbGlkYXRpb24gaXMgZG9uZSBoZXJlLCBpdFxuLy8gaXMgZG9uZSBpbiBtb25nb1NjaGVtYUZyb21GaWVsZHNBbmRDbGFzc05hbWUuXG5mdW5jdGlvbiBidWlsZE1lcmdlZFNjaGVtYU9iamVjdChleGlzdGluZ0ZpZWxkczogU2NoZW1hRmllbGRzLCBwdXRSZXF1ZXN0OiBhbnkpOiBTY2hlbWFGaWVsZHMge1xuICBjb25zdCBuZXdTY2hlbWEgPSB7fTtcbiAgLy8gQGZsb3ctZGlzYWJsZS1uZXh0XG4gIGNvbnN0IHN5c1NjaGVtYUZpZWxkID1cbiAgICBPYmplY3Qua2V5cyhkZWZhdWx0Q29sdW1ucykuaW5kZXhPZihleGlzdGluZ0ZpZWxkcy5faWQpID09PSAtMVxuICAgICAgPyBbXVxuICAgICAgOiBPYmplY3Qua2V5cyhkZWZhdWx0Q29sdW1uc1tleGlzdGluZ0ZpZWxkcy5faWRdKTtcbiAgZm9yIChjb25zdCBvbGRGaWVsZCBpbiBleGlzdGluZ0ZpZWxkcykge1xuICAgIGlmIChcbiAgICAgIG9sZEZpZWxkICE9PSAnX2lkJyAmJlxuICAgICAgb2xkRmllbGQgIT09ICdBQ0wnICYmXG4gICAgICBvbGRGaWVsZCAhPT0gJ3VwZGF0ZWRBdCcgJiZcbiAgICAgIG9sZEZpZWxkICE9PSAnY3JlYXRlZEF0JyAmJlxuICAgICAgb2xkRmllbGQgIT09ICdvYmplY3RJZCdcbiAgICApIHtcbiAgICAgIGlmIChzeXNTY2hlbWFGaWVsZC5sZW5ndGggPiAwICYmIHN5c1NjaGVtYUZpZWxkLmluZGV4T2Yob2xkRmllbGQpICE9PSAtMSkge1xuICAgICAgICBjb250aW51ZTtcbiAgICAgIH1cbiAgICAgIGNvbnN0IGZpZWxkSXNEZWxldGVkID0gcHV0UmVxdWVzdFtvbGRGaWVsZF0gJiYgcHV0UmVxdWVzdFtvbGRGaWVsZF0uX19vcCA9PT0gJ0RlbGV0ZSc7XG4gICAgICBpZiAoIWZpZWxkSXNEZWxldGVkKSB7XG4gICAgICAgIG5ld1NjaGVtYVtvbGRGaWVsZF0gPSBleGlzdGluZ0ZpZWxkc1tvbGRGaWVsZF07XG4gICAgICB9XG4gICAgfVxuICB9XG4gIGZvciAoY29uc3QgbmV3RmllbGQgaW4gcHV0UmVxdWVzdCkge1xuICAgIGlmIChuZXdGaWVsZCAhPT0gJ29iamVjdElkJyAmJiBwdXRSZXF1ZXN0W25ld0ZpZWxkXS5fX29wICE9PSAnRGVsZXRlJykge1xuICAgICAgaWYgKHN5c1NjaGVtYUZpZWxkLmxlbmd0aCA+IDAgJiYgc3lzU2NoZW1hRmllbGQuaW5kZXhPZihuZXdGaWVsZCkgIT09IC0xKSB7XG4gICAgICAgIGNvbnRpbnVlO1xuICAgICAgfVxuICAgICAgbmV3U2NoZW1hW25ld0ZpZWxkXSA9IHB1dFJlcXVlc3RbbmV3RmllbGRdO1xuICAgIH1cbiAgfVxuICByZXR1cm4gbmV3U2NoZW1hO1xufVxuXG4vLyBHaXZlbiBhIHNjaGVtYSBwcm9taXNlLCBjb25zdHJ1Y3QgYW5vdGhlciBzY2hlbWEgcHJvbWlzZSB0aGF0XG4vLyB2YWxpZGF0ZXMgdGhpcyBmaWVsZCBvbmNlIHRoZSBzY2hlbWEgbG9hZHMuXG5mdW5jdGlvbiB0aGVuVmFsaWRhdGVSZXF1aXJlZENvbHVtbnMoc2NoZW1hUHJvbWlzZSwgY2xhc3NOYW1lLCBvYmplY3QsIHF1ZXJ5KSB7XG4gIHJldHVybiBzY2hlbWFQcm9taXNlLnRoZW4oc2NoZW1hID0+IHtcbiAgICByZXR1cm4gc2NoZW1hLnZhbGlkYXRlUmVxdWlyZWRDb2x1bW5zKGNsYXNzTmFtZSwgb2JqZWN0LCBxdWVyeSk7XG4gIH0pO1xufVxuXG4vLyBHZXRzIHRoZSB0eXBlIGZyb20gYSBSRVNUIEFQSSBmb3JtYXR0ZWQgb2JqZWN0LCB3aGVyZSAndHlwZScgaXNcbi8vIGV4dGVuZGVkIHBhc3QgamF2YXNjcmlwdCB0eXBlcyB0byBpbmNsdWRlIHRoZSByZXN0IG9mIHRoZSBQYXJzZVxuLy8gdHlwZSBzeXN0ZW0uXG4vLyBUaGUgb3V0cHV0IHNob3VsZCBiZSBhIHZhbGlkIHNjaGVtYSB2YWx1ZS5cbi8vIFRPRE86IGVuc3VyZSB0aGF0IHRoaXMgaXMgY29tcGF0aWJsZSB3aXRoIHRoZSBmb3JtYXQgdXNlZCBpbiBPcGVuIERCXG5mdW5jdGlvbiBnZXRUeXBlKG9iajogYW55KTogPyhTY2hlbWFGaWVsZCB8IHN0cmluZykge1xuICBjb25zdCB0eXBlID0gdHlwZW9mIG9iajtcbiAgc3dpdGNoICh0eXBlKSB7XG4gICAgY2FzZSAnYm9vbGVhbic6XG4gICAgICByZXR1cm4gJ0Jvb2xlYW4nO1xuICAgIGNhc2UgJ3N0cmluZyc6XG4gICAgICByZXR1cm4gJ1N0cmluZyc7XG4gICAgY2FzZSAnbnVtYmVyJzpcbiAgICAgIHJldHVybiAnTnVtYmVyJztcbiAgICBjYXNlICdtYXAnOlxuICAgIGNhc2UgJ29iamVjdCc6XG4gICAgICBpZiAoIW9iaikge1xuICAgICAgICByZXR1cm4gdW5kZWZpbmVkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIGdldE9iamVjdFR5cGUob2JqKTtcbiAgICBjYXNlICdmdW5jdGlvbic6XG4gICAgY2FzZSAnc3ltYm9sJzpcbiAgICBjYXNlICd1bmRlZmluZWQnOlxuICAgIGRlZmF1bHQ6XG4gICAgICB0aHJvdyAnYmFkIG9iajogJyArIG9iajtcbiAgfVxufVxuXG4vLyBUaGlzIGdldHMgdGhlIHR5cGUgZm9yIG5vbi1KU09OIHR5cGVzIGxpa2UgcG9pbnRlcnMgYW5kIGZpbGVzLCBidXRcbi8vIGFsc28gZ2V0cyB0aGUgYXBwcm9wcmlhdGUgdHlwZSBmb3IgJCBvcGVyYXRvcnMuXG4vLyBSZXR1cm5zIG51bGwgaWYgdGhlIHR5cGUgaXMgdW5rbm93bi5cbmZ1bmN0aW9uIGdldE9iamVjdFR5cGUob2JqKTogPyhTY2hlbWFGaWVsZCB8IHN0cmluZykge1xuICBpZiAob2JqIGluc3RhbmNlb2YgQXJyYXkpIHtcbiAgICByZXR1cm4gJ0FycmF5JztcbiAgfVxuICBpZiAob2JqLl9fdHlwZSkge1xuICAgIHN3aXRjaCAob2JqLl9fdHlwZSkge1xuICAgICAgY2FzZSAnUG9pbnRlcic6XG4gICAgICAgIGlmIChvYmouY2xhc3NOYW1lKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHR5cGU6ICdQb2ludGVyJyxcbiAgICAgICAgICAgIHRhcmdldENsYXNzOiBvYmouY2xhc3NOYW1lLFxuICAgICAgICAgIH07XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdSZWxhdGlvbic6XG4gICAgICAgIGlmIChvYmouY2xhc3NOYW1lKSB7XG4gICAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICAgIHR5cGU6ICdSZWxhdGlvbicsXG4gICAgICAgICAgICB0YXJnZXRDbGFzczogb2JqLmNsYXNzTmFtZSxcbiAgICAgICAgICB9O1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnRmlsZSc6XG4gICAgICAgIGlmIChvYmoubmFtZSkge1xuICAgICAgICAgIHJldHVybiAnRmlsZSc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdEYXRlJzpcbiAgICAgICAgaWYgKG9iai5pc28pIHtcbiAgICAgICAgICByZXR1cm4gJ0RhdGUnO1xuICAgICAgICB9XG4gICAgICAgIGJyZWFrO1xuICAgICAgY2FzZSAnR2VvUG9pbnQnOlxuICAgICAgICBpZiAob2JqLmxhdGl0dWRlICE9IG51bGwgJiYgb2JqLmxvbmdpdHVkZSAhPSBudWxsKSB7XG4gICAgICAgICAgcmV0dXJuICdHZW9Qb2ludCc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdCeXRlcyc6XG4gICAgICAgIGlmIChvYmouYmFzZTY0KSB7XG4gICAgICAgICAgcmV0dXJuICdCeXRlcyc7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgICBjYXNlICdQb2x5Z29uJzpcbiAgICAgICAgaWYgKG9iai5jb29yZGluYXRlcykge1xuICAgICAgICAgIHJldHVybiAnUG9seWdvbic7XG4gICAgICAgIH1cbiAgICAgICAgYnJlYWs7XG4gICAgfVxuICAgIHRocm93IG5ldyBQYXJzZS5FcnJvcihQYXJzZS5FcnJvci5JTkNPUlJFQ1RfVFlQRSwgJ1RoaXMgaXMgbm90IGEgdmFsaWQgJyArIG9iai5fX3R5cGUpO1xuICB9XG4gIGlmIChvYmpbJyRuZSddKSB7XG4gICAgcmV0dXJuIGdldE9iamVjdFR5cGUob2JqWyckbmUnXSk7XG4gIH1cbiAgaWYgKG9iai5fX29wKSB7XG4gICAgc3dpdGNoIChvYmouX19vcCkge1xuICAgICAgY2FzZSAnSW5jcmVtZW50JzpcbiAgICAgICAgcmV0dXJuICdOdW1iZXInO1xuICAgICAgY2FzZSAnRGVsZXRlJzpcbiAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICBjYXNlICdBZGQnOlxuICAgICAgY2FzZSAnQWRkVW5pcXVlJzpcbiAgICAgIGNhc2UgJ1JlbW92ZSc6XG4gICAgICAgIHJldHVybiAnQXJyYXknO1xuICAgICAgY2FzZSAnQWRkUmVsYXRpb24nOlxuICAgICAgY2FzZSAnUmVtb3ZlUmVsYXRpb24nOlxuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIHR5cGU6ICdSZWxhdGlvbicsXG4gICAgICAgICAgdGFyZ2V0Q2xhc3M6IG9iai5vYmplY3RzWzBdLmNsYXNzTmFtZSxcbiAgICAgICAgfTtcbiAgICAgIGNhc2UgJ0JhdGNoJzpcbiAgICAgICAgcmV0dXJuIGdldE9iamVjdFR5cGUob2JqLm9wc1swXSk7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICB0aHJvdyAndW5leHBlY3RlZCBvcDogJyArIG9iai5fX29wO1xuICAgIH1cbiAgfVxuICByZXR1cm4gJ09iamVjdCc7XG59XG5cbmV4cG9ydCB7XG4gIGxvYWQsXG4gIGNsYXNzTmFtZUlzVmFsaWQsXG4gIGZpZWxkTmFtZUlzVmFsaWQsXG4gIGludmFsaWRDbGFzc05hbWVNZXNzYWdlLFxuICBidWlsZE1lcmdlZFNjaGVtYU9iamVjdCxcbiAgc3lzdGVtQ2xhc3NlcyxcbiAgZGVmYXVsdENvbHVtbnMsXG4gIGNvbnZlcnRTY2hlbWFUb0FkYXB0ZXJTY2hlbWEsXG4gIFZvbGF0aWxlQ2xhc3Nlc1NjaGVtYXMsXG4gIFNjaGVtYUNvbnRyb2xsZXIsXG4gIHJlcXVpcmVkQ29sdW1ucyxcbn07XG4iXSwibWFwcGluZ3MiOiI7Ozs7Ozs7Ozs7OztBQWtCQSxJQUFBQSxlQUFBLEdBQUFDLE9BQUE7QUFDQSxJQUFBQyxZQUFBLEdBQUFDLHNCQUFBLENB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