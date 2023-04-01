"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.serializeDateIso = exports.parseValue = exports.parseStringValue = exports.parseObjectFields = exports.parseListValues = exports.parseIntValue = exports.parseFloatValue = exports.parseFileValue = exports.parseDateIsoValue = exports.parseBooleanValue = exports.options = exports.notInQueryKey = exports.notIn = exports.notEqualTo = exports.matchesRegex = exports.loadArrayResult = exports.load = exports.lessThanOrEqualTo = exports.lessThan = exports.inQueryKey = exports.inOp = exports.greaterThanOrEqualTo = exports.greaterThan = exports.exists = exports.equalTo = exports.WITHIN_INPUT = exports.WHERE_ATT = exports.USER_ACL_INPUT = exports.USER_ACL = exports.UPDATE_RESULT_FIELDS = exports.UPDATED_AT_ATT = exports.TypeValidationError = exports.TEXT_INPUT = exports.SUBQUERY_READ_PREFERENCE_ATT = exports.SUBQUERY_INPUT = exports.STRING_WHERE_INPUT = exports.SKIP_ATT = exports.SESSION_TOKEN_ATT = exports.SELECT_INPUT = exports.SEARCH_INPUT = exports.ROLE_ACL_INPUT = exports.ROLE_ACL = exports.READ_PREFERENCE_ATT = exports.READ_PREFERENCE = exports.READ_OPTIONS_INPUT = exports.READ_OPTIONS_ATT = exports.PUBLIC_ACL_INPUT = exports.PUBLIC_ACL = exports.POLYGON_WHERE_INPUT = exports.POLYGON_INPUT = exports.POLYGON = exports.PARSE_OBJECT_FIELDS = exports.PARSE_OBJECT = exports.OBJECT_WHERE_INPUT = exports.OBJECT_ID_ATT = exports.OBJECT_ID = exports.OBJECT = exports.NUMBER_WHERE_INPUT = exports.LIMIT_ATT = exports.KEY_VALUE_INPUT = exports.INPUT_FIELDS = exports.INCLUDE_READ_PREFERENCE_ATT = exports.ID_WHERE_INPUT = exports.GraphQLUpload = exports.GLOBAL_OR_OBJECT_ID_ATT = exports.GEO_WITHIN_INPUT = exports.GEO_POINT_WHERE_INPUT = exports.GEO_POINT_INPUT = exports.GEO_POINT_FIELDS = exports.GEO_POINT = exports.GEO_INTERSECTS_INPUT = exports.FILE_WHERE_INPUT = exports.FILE_INPUT = exports.FILE_INFO = exports.FILE = exports.ELEMENT = exports.DATE_WHERE_INPUT = exports.DATE = exports.CREATE_RESULT_FIELDS = exports.CREATED_AT_ATT = exports.COUNT_ATT = exports.CLASS_NAME_ATT = exports.CENTER_SPHERE_INPUT = exports.BYTES_WHERE_INPUT = exports.BYTES = exports.BOX_INPUT = exports.BOOLEAN_WHERE_INPUT = exports.ARRAY_WHERE_INPUT = exports.ARRAY_RESULT = exports.ANY = exports.ACL_INPUT = exports.ACL = void 0;
var _graphql = require("graphql");
var _graphqlRelay = require("graphql-relay");
function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); enumerableOnly && (symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; })), keys.push.apply(keys, symbols); } return keys; }
function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = null != arguments[i] ? arguments[i] : {}; i % 2 ? ownKeys(Object(source), !0).forEach(function (key) { _defineProperty(target, key, source[key]); }) : Object.getOwnPropertyDescriptors ? Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)) : ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } return target; }
function _defineProperty(obj, key, value) { key = _toPropertyKey(key); if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }
function _toPropertyKey(arg) { var key = _toPrimitive(arg, "string"); return typeof key === "symbol" ? key : String(key); }
function _toPrimitive(input, hint) { if (typeof input !== "object" || input === null) return input; var prim = input[Symbol.toPrimitive]; if (prim !== undefined) { var res = prim.call(input, hint || "default"); if (typeof res !== "object") return res; throw new TypeError("@@toPrimitive must return a primitive value."); } return (hint === "string" ? String : Number)(input); }
class TypeValidationError extends Error {
  constructor(value, type) {
    super(`${value} is not a valid ${type}`);
  }
}
exports.TypeValidationError = TypeValidationError;
const parseStringValue = value => {
  if (typeof value === 'string') {
    return value;
  }
  throw new TypeValidationError(value, 'String');
};
exports.parseStringValue = parseStringValue;
const parseIntValue = value => {
  if (typeof value === 'string') {
    const int = Number(value);
    if (Number.isInteger(int)) {
      return int;
    }
  }
  throw new TypeValidationError(value, 'Int');
};
exports.parseIntValue = parseIntValue;
const parseFloatValue = value => {
  if (typeof value === 'string') {
    const float = Number(value);
    if (!isNaN(float)) {
      return float;
    }
  }
  throw new TypeValidationError(value, 'Float');
};
exports.parseFloatValue = parseFloatValue;
const parseBooleanValue = value => {
  if (typeof value === 'boolean') {
    return value;
  }
  throw new TypeValidationError(value, 'Boolean');
};
exports.parseBooleanValue = parseBooleanValue;
const parseValue = value => {
  switch (value.kind) {
    case _graphql.Kind.STRING:
      return parseStringValue(value.value);
    case _graphql.Kind.INT:
      return parseIntValue(value.value);
    case _graphql.Kind.FLOAT:
      return parseFloatValue(value.value);
    case _graphql.Kind.BOOLEAN:
      return parseBooleanValue(value.value);
    case _graphql.Kind.LIST:
      return parseListValues(value.values);
    case _graphql.Kind.OBJECT:
      return parseObjectFields(value.fields);
    default:
      return value.value;
  }
};
exports.parseValue = parseValue;
const parseListValues = values => {
  if (Array.isArray(values)) {
    return values.map(value => parseValue(value));
  }
  throw new TypeValidationError(values, 'List');
};
exports.parseListValues = parseListValues;
const parseObjectFields = fields => {
  if (Array.isArray(fields)) {
    return fields.reduce((object, field) => _objectSpread(_objectSpread({}, object), {}, {
      [field.name.value]: parseValue(field.value)
    }), {});
  }
  throw new TypeValidationError(fields, 'Object');
};
exports.parseObjectFields = parseObjectFields;
const ANY = new _graphql.GraphQLScalarType({
  name: 'Any',
  description: 'The Any scalar type is used in operations and types that involve any type of value.',
  parseValue: value => value,
  serialize: value => value,
  parseLiteral: ast => parseValue(ast)
});
exports.ANY = ANY;
const OBJECT = new _graphql.GraphQLScalarType({
  name: 'Object',
  description: 'The Object scalar type is used in operations and types that involve objects.',
  parseValue(value) {
    if (typeof value === 'object') {
      return value;
    }
    throw new TypeValidationError(value, 'Object');
  },
  serialize(value) {
    if (typeof value === 'object') {
      return value;
    }
    throw new TypeValidationError(value, 'Object');
  },
  parseLiteral(ast) {
    if (ast.kind === _graphql.Kind.OBJECT) {
      return parseObjectFields(ast.fields);
    }
    throw new TypeValidationError(ast.kind, 'Object');
  }
});
exports.OBJECT = OBJECT;
const parseDateIsoValue = value => {
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!isNaN(date)) {
      return date;
    }
  } else if (value instanceof Date) {
    return value;
  }
  throw new TypeValidationError(value, 'Date');
};
exports.parseDateIsoValue = parseDateIsoValue;
const serializeDateIso = value => {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  throw new TypeValidationError(value, 'Date');
};
exports.serializeDateIso = serializeDateIso;
const parseDateIsoLiteral = ast => {
  if (ast.kind === _graphql.Kind.STRING) {
    return parseDateIsoValue(ast.value);
  }
  throw new TypeValidationError(ast.kind, 'Date');
};
const DATE = new _graphql.GraphQLScalarType({
  name: 'Date',
  description: 'The Date scalar type is used in operations and types that involve dates.',
  parseValue(value) {
    if (typeof value === 'string' || value instanceof Date) {
      return {
        __type: 'Date',
        iso: parseDateIsoValue(value)
      };
    } else if (typeof value === 'object' && value.__type === 'Date' && value.iso) {
      return {
        __type: value.__type,
        iso: parseDateIsoValue(value.iso)
      };
    }
    throw new TypeValidationError(value, 'Date');
  },
  serialize(value) {
    if (typeof value === 'string' || value instanceof Date) {
      return serializeDateIso(value);
    } else if (typeof value === 'object' && value.__type === 'Date' && value.iso) {
      return serializeDateIso(value.iso);
    }
    throw new TypeValidationError(value, 'Date');
  },
  parseLiteral(ast) {
    if (ast.kind === _graphql.Kind.STRING) {
      return {
        __type: 'Date',
        iso: parseDateIsoLiteral(ast)
      };
    } else if (ast.kind === _graphql.Kind.OBJECT) {
      const __type = ast.fields.find(field => field.name.value === '__type');
      const iso = ast.fields.find(field => field.name.value === 'iso');
      if (__type && __type.value && __type.value.value === 'Date' && iso) {
        return {
          __type: __type.value.value,
          iso: parseDateIsoLiteral(iso.value)
        };
      }
    }
    throw new TypeValidationError(ast.kind, 'Date');
  }
});
exports.DATE = DATE;
const GraphQLUpload = new _graphql.GraphQLScalarType({
  name: 'Upload',
  description: 'The Upload scalar type represents a file upload.'
});
exports.GraphQLUpload = GraphQLUpload;
const BYTES = new _graphql.GraphQLScalarType({
  name: 'Bytes',
  description: 'The Bytes scalar type is used in operations and types that involve base 64 binary data.',
  parseValue(value) {
    if (typeof value === 'string') {
      return {
        __type: 'Bytes',
        base64: value
      };
    } else if (typeof value === 'object' && value.__type === 'Bytes' && typeof value.base64 === 'string') {
      return value;
    }
    throw new TypeValidationError(value, 'Bytes');
  },
  serialize(value) {
    if (typeof value === 'string') {
      return value;
    } else if (typeof value === 'object' && value.__type === 'Bytes' && typeof value.base64 === 'string') {
      return value.base64;
    }
    throw new TypeValidationError(value, 'Bytes');
  },
  parseLiteral(ast) {
    if (ast.kind === _graphql.Kind.STRING) {
      return {
        __type: 'Bytes',
        base64: ast.value
      };
    } else if (ast.kind === _graphql.Kind.OBJECT) {
      const __type = ast.fields.find(field => field.name.value === '__type');
      const base64 = ast.fields.find(field => field.name.value === 'base64');
      if (__type && __type.value && __type.value.value === 'Bytes' && base64 && base64.value && typeof base64.value.value === 'string') {
        return {
          __type: __type.value.value,
          base64: base64.value.value
        };
      }
    }
    throw new TypeValidationError(ast.kind, 'Bytes');
  }
});
exports.BYTES = BYTES;
const parseFileValue = value => {
  if (typeof value === 'string') {
    return {
      __type: 'File',
      name: value
    };
  } else if (typeof value === 'object' && value.__type === 'File' && typeof value.name === 'string' && (value.url === undefined || typeof value.url === 'string')) {
    return value;
  }
  throw new TypeValidationError(value, 'File');
};
exports.parseFileValue = parseFileValue;
const FILE = new _graphql.GraphQLScalarType({
  name: 'File',
  description: 'The File scalar type is used in operations and types that involve files.',
  parseValue: parseFileValue,
  serialize: value => {
    if (typeof value === 'string') {
      return value;
    } else if (typeof value === 'object' && value.__type === 'File' && typeof value.name === 'string' && (value.url === undefined || typeof value.url === 'string')) {
      return value.name;
    }
    throw new TypeValidationError(value, 'File');
  },
  parseLiteral(ast) {
    if (ast.kind === _graphql.Kind.STRING) {
      return parseFileValue(ast.value);
    } else if (ast.kind === _graphql.Kind.OBJECT) {
      const __type = ast.fields.find(field => field.name.value === '__type');
      const name = ast.fields.find(field => field.name.value === 'name');
      const url = ast.fields.find(field => field.name.value === 'url');
      if (__type && __type.value && name && name.value) {
        return parseFileValue({
          __type: __type.value.value,
          name: name.value.value,
          url: url && url.value ? url.value.value : undefined
        });
      }
    }
    throw new TypeValidationError(ast.kind, 'File');
  }
});
exports.FILE = FILE;
const FILE_INFO = new _graphql.GraphQLObjectType({
  name: 'FileInfo',
  description: 'The FileInfo object type is used to return the information about files.',
  fields: {
    name: {
      description: 'This is the file name.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
    },
    url: {
      description: 'This is the url in which the file can be downloaded.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
    }
  }
});
exports.FILE_INFO = FILE_INFO;
const FILE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'FileInput',
  description: 'If this field is set to null the file will be unlinked (the file will not be deleted on cloud storage).',
  fields: {
    file: {
      description: 'A File Scalar can be an url or a FileInfo object.',
      type: FILE
    },
    upload: {
      description: 'Use this field if you want to create a new file.',
      type: GraphQLUpload
    }
  }
});
exports.FILE_INPUT = FILE_INPUT;
const GEO_POINT_FIELDS = {
  latitude: {
    description: 'This is the latitude.',
    type: new _graphql.GraphQLNonNull(_graphql.GraphQLFloat)
  },
  longitude: {
    description: 'This is the longitude.',
    type: new _graphql.GraphQLNonNull(_graphql.GraphQLFloat)
  }
};
exports.GEO_POINT_FIELDS = GEO_POINT_FIELDS;
const GEO_POINT_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'GeoPointInput',
  description: 'The GeoPointInput type is used in operations that involve inputting fields of type geo point.',
  fields: GEO_POINT_FIELDS
});
exports.GEO_POINT_INPUT = GEO_POINT_INPUT;
const GEO_POINT = new _graphql.GraphQLObjectType({
  name: 'GeoPoint',
  description: 'The GeoPoint object type is used to return the information about geo point fields.',
  fields: GEO_POINT_FIELDS
});
exports.GEO_POINT = GEO_POINT;
const POLYGON_INPUT = new _graphql.GraphQLList(new _graphql.GraphQLNonNull(GEO_POINT_INPUT));
exports.POLYGON_INPUT = POLYGON_INPUT;
const POLYGON = new _graphql.GraphQLList(new _graphql.GraphQLNonNull(GEO_POINT));
exports.POLYGON = POLYGON;
const USER_ACL_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'UserACLInput',
  description: 'Allow to manage users in ACL.',
  fields: {
    userId: {
      description: 'ID of the targetted User.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLID)
    },
    read: {
      description: 'Allow the user to read the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    },
    write: {
      description: 'Allow the user to write on the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    }
  }
});
exports.USER_ACL_INPUT = USER_ACL_INPUT;
const ROLE_ACL_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'RoleACLInput',
  description: 'Allow to manage roles in ACL.',
  fields: {
    roleName: {
      description: 'Name of the targetted Role.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
    },
    read: {
      description: 'Allow users who are members of the role to read the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    },
    write: {
      description: 'Allow users who are members of the role to write on the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    }
  }
});
exports.ROLE_ACL_INPUT = ROLE_ACL_INPUT;
const PUBLIC_ACL_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'PublicACLInput',
  description: 'Allow to manage public rights.',
  fields: {
    read: {
      description: 'Allow anyone to read the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    },
    write: {
      description: 'Allow anyone to write on the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    }
  }
});
exports.PUBLIC_ACL_INPUT = PUBLIC_ACL_INPUT;
const ACL_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'ACLInput',
  description: 'Allow to manage access rights. If not provided object will be publicly readable and writable',
  fields: {
    users: {
      description: 'Access control list for users.',
      type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(USER_ACL_INPUT))
    },
    roles: {
      description: 'Access control list for roles.',
      type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(ROLE_ACL_INPUT))
    },
    public: {
      description: 'Public access control list.',
      type: PUBLIC_ACL_INPUT
    }
  }
});
exports.ACL_INPUT = ACL_INPUT;
const USER_ACL = new _graphql.GraphQLObjectType({
  name: 'UserACL',
  description: 'Allow to manage users in ACL. If read and write are null the users have read and write rights.',
  fields: {
    userId: {
      description: 'ID of the targetted User.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLID)
    },
    read: {
      description: 'Allow the user to read the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    },
    write: {
      description: 'Allow the user to write on the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    }
  }
});
exports.USER_ACL = USER_ACL;
const ROLE_ACL = new _graphql.GraphQLObjectType({
  name: 'RoleACL',
  description: 'Allow to manage roles in ACL. If read and write are null the role have read and write rights.',
  fields: {
    roleName: {
      description: 'Name of the targetted Role.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLID)
    },
    read: {
      description: 'Allow users who are members of the role to read the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    },
    write: {
      description: 'Allow users who are members of the role to write on the current object.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLBoolean)
    }
  }
});
exports.ROLE_ACL = ROLE_ACL;
const PUBLIC_ACL = new _graphql.GraphQLObjectType({
  name: 'PublicACL',
  description: 'Allow to manage public rights.',
  fields: {
    read: {
      description: 'Allow anyone to read the current object.',
      type: _graphql.GraphQLBoolean
    },
    write: {
      description: 'Allow anyone to write on the current object.',
      type: _graphql.GraphQLBoolean
    }
  }
});
exports.PUBLIC_ACL = PUBLIC_ACL;
const ACL = new _graphql.GraphQLObjectType({
  name: 'ACL',
  description: 'Current access control list of the current object.',
  fields: {
    users: {
      description: 'Access control list for users.',
      type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(USER_ACL)),
      resolve(p) {
        const users = [];
        Object.keys(p).forEach(rule => {
          if (rule !== '*' && rule.indexOf('role:') !== 0) {
            users.push({
              userId: (0, _graphqlRelay.toGlobalId)('_User', rule),
              read: p[rule].read ? true : false,
              write: p[rule].write ? true : false
            });
          }
        });
        return users.length ? users : null;
      }
    },
    roles: {
      description: 'Access control list for roles.',
      type: new _graphql.GraphQLList(new _graphql.GraphQLNonNull(ROLE_ACL)),
      resolve(p) {
        const roles = [];
        Object.keys(p).forEach(rule => {
          if (rule.indexOf('role:') === 0) {
            roles.push({
              roleName: rule.replace('role:', ''),
              read: p[rule].read ? true : false,
              write: p[rule].write ? true : false
            });
          }
        });
        return roles.length ? roles : null;
      }
    },
    public: {
      description: 'Public access control list.',
      type: PUBLIC_ACL,
      resolve(p) {
        /* eslint-disable */
        return p['*'] ? {
          read: p['*'].read ? true : false,
          write: p['*'].write ? true : false
        } : null;
      }
    }
  }
});
exports.ACL = ACL;
const OBJECT_ID = new _graphql.GraphQLNonNull(_graphql.GraphQLID);
exports.OBJECT_ID = OBJECT_ID;
const CLASS_NAME_ATT = {
  description: 'This is the class name of the object.',
  type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
};
exports.CLASS_NAME_ATT = CLASS_NAME_ATT;
const GLOBAL_OR_OBJECT_ID_ATT = {
  description: 'This is the object id. You can use either the global or the object id.',
  type: OBJECT_ID
};
exports.GLOBAL_OR_OBJECT_ID_ATT = GLOBAL_OR_OBJECT_ID_ATT;
const OBJECT_ID_ATT = {
  description: 'This is the object id.',
  type: OBJECT_ID
};
exports.OBJECT_ID_ATT = OBJECT_ID_ATT;
const CREATED_AT_ATT = {
  description: 'This is the date in which the object was created.',
  type: new _graphql.GraphQLNonNull(DATE)
};
exports.CREATED_AT_ATT = CREATED_AT_ATT;
const UPDATED_AT_ATT = {
  description: 'This is the date in which the object was las updated.',
  type: new _graphql.GraphQLNonNull(DATE)
};
exports.UPDATED_AT_ATT = UPDATED_AT_ATT;
const INPUT_FIELDS = {
  ACL: {
    type: ACL
  }
};
exports.INPUT_FIELDS = INPUT_FIELDS;
const CREATE_RESULT_FIELDS = {
  objectId: OBJECT_ID_ATT,
  createdAt: CREATED_AT_ATT
};
exports.CREATE_RESULT_FIELDS = CREATE_RESULT_FIELDS;
const UPDATE_RESULT_FIELDS = {
  updatedAt: UPDATED_AT_ATT
};
exports.UPDATE_RESULT_FIELDS = UPDATE_RESULT_FIELDS;
const PARSE_OBJECT_FIELDS = _objectSpread(_objectSpread(_objectSpread(_objectSpread({}, CREATE_RESULT_FIELDS), UPDATE_RESULT_FIELDS), INPUT_FIELDS), {}, {
  ACL: {
    type: new _graphql.GraphQLNonNull(ACL),
    resolve: ({
      ACL
    }) => ACL ? ACL : {
      '*': {
        read: true,
        write: true
      }
    }
  }
});
exports.PARSE_OBJECT_FIELDS = PARSE_OBJECT_FIELDS;
const PARSE_OBJECT = new _graphql.GraphQLInterfaceType({
  name: 'ParseObject',
  description: 'The ParseObject interface type is used as a base type for the auto generated object types.',
  fields: PARSE_OBJECT_FIELDS
});
exports.PARSE_OBJECT = PARSE_OBJECT;
const SESSION_TOKEN_ATT = {
  description: 'The current user session token.',
  type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
};
exports.SESSION_TOKEN_ATT = SESSION_TOKEN_ATT;
const READ_PREFERENCE = new _graphql.GraphQLEnumType({
  name: 'ReadPreference',
  description: 'The ReadPreference enum type is used in queries in order to select in which database replica the operation must run.',
  values: {
    PRIMARY: {
      value: 'PRIMARY'
    },
    PRIMARY_PREFERRED: {
      value: 'PRIMARY_PREFERRED'
    },
    SECONDARY: {
      value: 'SECONDARY'
    },
    SECONDARY_PREFERRED: {
      value: 'SECONDARY_PREFERRED'
    },
    NEAREST: {
      value: 'NEAREST'
    }
  }
});
exports.READ_PREFERENCE = READ_PREFERENCE;
const READ_PREFERENCE_ATT = {
  description: 'The read preference for the main query to be executed.',
  type: READ_PREFERENCE
};
exports.READ_PREFERENCE_ATT = READ_PREFERENCE_ATT;
const INCLUDE_READ_PREFERENCE_ATT = {
  description: 'The read preference for the queries to be executed to include fields.',
  type: READ_PREFERENCE
};
exports.INCLUDE_READ_PREFERENCE_ATT = INCLUDE_READ_PREFERENCE_ATT;
const SUBQUERY_READ_PREFERENCE_ATT = {
  description: 'The read preference for the subqueries that may be required.',
  type: READ_PREFERENCE
};
exports.SUBQUERY_READ_PREFERENCE_ATT = SUBQUERY_READ_PREFERENCE_ATT;
const READ_OPTIONS_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'ReadOptionsInput',
  description: 'The ReadOptionsInputt type is used in queries in order to set the read preferences.',
  fields: {
    readPreference: READ_PREFERENCE_ATT,
    includeReadPreference: INCLUDE_READ_PREFERENCE_ATT,
    subqueryReadPreference: SUBQUERY_READ_PREFERENCE_ATT
  }
});
exports.READ_OPTIONS_INPUT = READ_OPTIONS_INPUT;
const READ_OPTIONS_ATT = {
  description: 'The read options for the query to be executed.',
  type: READ_OPTIONS_INPUT
};
exports.READ_OPTIONS_ATT = READ_OPTIONS_ATT;
const WHERE_ATT = {
  description: 'These are the conditions that the objects need to match in order to be found',
  type: OBJECT
};
exports.WHERE_ATT = WHERE_ATT;
const SKIP_ATT = {
  description: 'This is the number of objects that must be skipped to return.',
  type: _graphql.GraphQLInt
};
exports.SKIP_ATT = SKIP_ATT;
const LIMIT_ATT = {
  description: 'This is the limit number of objects that must be returned.',
  type: _graphql.GraphQLInt
};
exports.LIMIT_ATT = LIMIT_ATT;
const COUNT_ATT = {
  description: 'This is the total matched objecs count that is returned when the count flag is set.',
  type: new _graphql.GraphQLNonNull(_graphql.GraphQLInt)
};
exports.COUNT_ATT = COUNT_ATT;
const SEARCH_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'SearchInput',
  description: 'The SearchInput type is used to specifiy a search operation on a full text search.',
  fields: {
    term: {
      description: 'This is the term to be searched.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
    },
    language: {
      description: 'This is the language to tetermine the list of stop words and the rules for tokenizer.',
      type: _graphql.GraphQLString
    },
    caseSensitive: {
      description: 'This is the flag to enable or disable case sensitive search.',
      type: _graphql.GraphQLBoolean
    },
    diacriticSensitive: {
      description: 'This is the flag to enable or disable diacritic sensitive search.',
      type: _graphql.GraphQLBoolean
    }
  }
});
exports.SEARCH_INPUT = SEARCH_INPUT;
const TEXT_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'TextInput',
  description: 'The TextInput type is used to specify a text operation on a constraint.',
  fields: {
    search: {
      description: 'This is the search to be executed.',
      type: new _graphql.GraphQLNonNull(SEARCH_INPUT)
    }
  }
});
exports.TEXT_INPUT = TEXT_INPUT;
const BOX_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'BoxInput',
  description: 'The BoxInput type is used to specifiy a box operation on a within geo query.',
  fields: {
    bottomLeft: {
      description: 'This is the bottom left coordinates of the box.',
      type: new _graphql.GraphQLNonNull(GEO_POINT_INPUT)
    },
    upperRight: {
      description: 'This is the upper right coordinates of the box.',
      type: new _graphql.GraphQLNonNull(GEO_POINT_INPUT)
    }
  }
});
exports.BOX_INPUT = BOX_INPUT;
const WITHIN_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'WithinInput',
  description: 'The WithinInput type is used to specify a within operation on a constraint.',
  fields: {
    box: {
      description: 'This is the box to be specified.',
      type: new _graphql.GraphQLNonNull(BOX_INPUT)
    }
  }
});
exports.WITHIN_INPUT = WITHIN_INPUT;
const CENTER_SPHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'CenterSphereInput',
  description: 'The CenterSphereInput type is used to specifiy a centerSphere operation on a geoWithin query.',
  fields: {
    center: {
      description: 'This is the center of the sphere.',
      type: new _graphql.GraphQLNonNull(GEO_POINT_INPUT)
    },
    distance: {
      description: 'This is the radius of the sphere.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLFloat)
    }
  }
});
exports.CENTER_SPHERE_INPUT = CENTER_SPHERE_INPUT;
const GEO_WITHIN_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'GeoWithinInput',
  description: 'The GeoWithinInput type is used to specify a geoWithin operation on a constraint.',
  fields: {
    polygon: {
      description: 'This is the polygon to be specified.',
      type: POLYGON_INPUT
    },
    centerSphere: {
      description: 'This is the sphere to be specified.',
      type: CENTER_SPHERE_INPUT
    }
  }
});
exports.GEO_WITHIN_INPUT = GEO_WITHIN_INPUT;
const GEO_INTERSECTS_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'GeoIntersectsInput',
  description: 'The GeoIntersectsInput type is used to specify a geoIntersects operation on a constraint.',
  fields: {
    point: {
      description: 'This is the point to be specified.',
      type: GEO_POINT_INPUT
    }
  }
});
exports.GEO_INTERSECTS_INPUT = GEO_INTERSECTS_INPUT;
const equalTo = type => ({
  description: 'This is the equalTo operator to specify a constraint to select the objects where the value of a field equals to a specified value.',
  type
});
exports.equalTo = equalTo;
const notEqualTo = type => ({
  description: 'This is the notEqualTo operator to specify a constraint to select the objects where the value of a field do not equal to a specified value.',
  type
});
exports.notEqualTo = notEqualTo;
const lessThan = type => ({
  description: 'This is the lessThan operator to specify a constraint to select the objects where the value of a field is less than a specified value.',
  type
});
exports.lessThan = lessThan;
const lessThanOrEqualTo = type => ({
  description: 'This is the lessThanOrEqualTo operator to specify a constraint to select the objects where the value of a field is less than or equal to a specified value.',
  type
});
exports.lessThanOrEqualTo = lessThanOrEqualTo;
const greaterThan = type => ({
  description: 'This is the greaterThan operator to specify a constraint to select the objects where the value of a field is greater than a specified value.',
  type
});
exports.greaterThan = greaterThan;
const greaterThanOrEqualTo = type => ({
  description: 'This is the greaterThanOrEqualTo operator to specify a constraint to select the objects where the value of a field is greater than or equal to a specified value.',
  type
});
exports.greaterThanOrEqualTo = greaterThanOrEqualTo;
const inOp = type => ({
  description: 'This is the in operator to specify a constraint to select the objects where the value of a field equals any value in the specified array.',
  type: new _graphql.GraphQLList(type)
});
exports.inOp = inOp;
const notIn = type => ({
  description: 'This is the notIn operator to specify a constraint to select the objects where the value of a field do not equal any value in the specified array.',
  type: new _graphql.GraphQLList(type)
});
exports.notIn = notIn;
const exists = {
  description: 'This is the exists operator to specify a constraint to select the objects where a field exists (or do not exist).',
  type: _graphql.GraphQLBoolean
};
exports.exists = exists;
const matchesRegex = {
  description: 'This is the matchesRegex operator to specify a constraint to select the objects where the value of a field matches a specified regular expression.',
  type: _graphql.GraphQLString
};
exports.matchesRegex = matchesRegex;
const options = {
  description: 'This is the options operator to specify optional flags (such as "i" and "m") to be added to a matchesRegex operation in the same set of constraints.',
  type: _graphql.GraphQLString
};
exports.options = options;
const SUBQUERY_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'SubqueryInput',
  description: 'The SubqueryInput type is used to specify a sub query to another class.',
  fields: {
    className: CLASS_NAME_ATT,
    where: Object.assign({}, WHERE_ATT, {
      type: new _graphql.GraphQLNonNull(WHERE_ATT.type)
    })
  }
});
exports.SUBQUERY_INPUT = SUBQUERY_INPUT;
const SELECT_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'SelectInput',
  description: 'The SelectInput type is used to specify an inQueryKey or a notInQueryKey operation on a constraint.',
  fields: {
    query: {
      description: 'This is the subquery to be executed.',
      type: new _graphql.GraphQLNonNull(SUBQUERY_INPUT)
    },
    key: {
      description: 'This is the key in the result of the subquery that must match (not match) the field.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
    }
  }
});
exports.SELECT_INPUT = SELECT_INPUT;
const inQueryKey = {
  description: 'This is the inQueryKey operator to specify a constraint to select the objects where a field equals to a key in the result of a different query.',
  type: SELECT_INPUT
};
exports.inQueryKey = inQueryKey;
const notInQueryKey = {
  description: 'This is the notInQueryKey operator to specify a constraint to select the objects where a field do not equal to a key in the result of a different query.',
  type: SELECT_INPUT
};
exports.notInQueryKey = notInQueryKey;
const ID_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'IdWhereInput',
  description: 'The IdWhereInput input type is used in operations that involve filtering objects by an id.',
  fields: {
    equalTo: equalTo(_graphql.GraphQLID),
    notEqualTo: notEqualTo(_graphql.GraphQLID),
    lessThan: lessThan(_graphql.GraphQLID),
    lessThanOrEqualTo: lessThanOrEqualTo(_graphql.GraphQLID),
    greaterThan: greaterThan(_graphql.GraphQLID),
    greaterThanOrEqualTo: greaterThanOrEqualTo(_graphql.GraphQLID),
    in: inOp(_graphql.GraphQLID),
    notIn: notIn(_graphql.GraphQLID),
    exists,
    inQueryKey,
    notInQueryKey
  }
});
exports.ID_WHERE_INPUT = ID_WHERE_INPUT;
const STRING_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'StringWhereInput',
  description: 'The StringWhereInput input type is used in operations that involve filtering objects by a field of type String.',
  fields: {
    equalTo: equalTo(_graphql.GraphQLString),
    notEqualTo: notEqualTo(_graphql.GraphQLString),
    lessThan: lessThan(_graphql.GraphQLString),
    lessThanOrEqualTo: lessThanOrEqualTo(_graphql.GraphQLString),
    greaterThan: greaterThan(_graphql.GraphQLString),
    greaterThanOrEqualTo: greaterThanOrEqualTo(_graphql.GraphQLString),
    in: inOp(_graphql.GraphQLString),
    notIn: notIn(_graphql.GraphQLString),
    exists,
    matchesRegex,
    options,
    text: {
      description: 'This is the $text operator to specify a full text search constraint.',
      type: TEXT_INPUT
    },
    inQueryKey,
    notInQueryKey
  }
});
exports.STRING_WHERE_INPUT = STRING_WHERE_INPUT;
const NUMBER_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'NumberWhereInput',
  description: 'The NumberWhereInput input type is used in operations that involve filtering objects by a field of type Number.',
  fields: {
    equalTo: equalTo(_graphql.GraphQLFloat),
    notEqualTo: notEqualTo(_graphql.GraphQLFloat),
    lessThan: lessThan(_graphql.GraphQLFloat),
    lessThanOrEqualTo: lessThanOrEqualTo(_graphql.GraphQLFloat),
    greaterThan: greaterThan(_graphql.GraphQLFloat),
    greaterThanOrEqualTo: greaterThanOrEqualTo(_graphql.GraphQLFloat),
    in: inOp(_graphql.GraphQLFloat),
    notIn: notIn(_graphql.GraphQLFloat),
    exists,
    inQueryKey,
    notInQueryKey
  }
});
exports.NUMBER_WHERE_INPUT = NUMBER_WHERE_INPUT;
const BOOLEAN_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'BooleanWhereInput',
  description: 'The BooleanWhereInput input type is used in operations that involve filtering objects by a field of type Boolean.',
  fields: {
    equalTo: equalTo(_graphql.GraphQLBoolean),
    notEqualTo: notEqualTo(_graphql.GraphQLBoolean),
    exists,
    inQueryKey,
    notInQueryKey
  }
});
exports.BOOLEAN_WHERE_INPUT = BOOLEAN_WHERE_INPUT;
const ARRAY_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'ArrayWhereInput',
  description: 'The ArrayWhereInput input type is used in operations that involve filtering objects by a field of type Array.',
  fields: {
    equalTo: equalTo(ANY),
    notEqualTo: notEqualTo(ANY),
    lessThan: lessThan(ANY),
    lessThanOrEqualTo: lessThanOrEqualTo(ANY),
    greaterThan: greaterThan(ANY),
    greaterThanOrEqualTo: greaterThanOrEqualTo(ANY),
    in: inOp(ANY),
    notIn: notIn(ANY),
    exists,
    containedBy: {
      description: 'This is the containedBy operator to specify a constraint to select the objects where the values of an array field is contained by another specified array.',
      type: new _graphql.GraphQLList(ANY)
    },
    contains: {
      description: 'This is the contains operator to specify a constraint to select the objects where the values of an array field contain all elements of another specified array.',
      type: new _graphql.GraphQLList(ANY)
    },
    inQueryKey,
    notInQueryKey
  }
});
exports.ARRAY_WHERE_INPUT = ARRAY_WHERE_INPUT;
const KEY_VALUE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'KeyValueInput',
  description: 'An entry from an object, i.e., a pair of key and value.',
  fields: {
    key: {
      description: 'The key used to retrieve the value of this entry.',
      type: new _graphql.GraphQLNonNull(_graphql.GraphQLString)
    },
    value: {
      description: 'The value of the entry. Could be any type of scalar data.',
      type: new _graphql.GraphQLNonNull(ANY)
    }
  }
});
exports.KEY_VALUE_INPUT = KEY_VALUE_INPUT;
const OBJECT_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'ObjectWhereInput',
  description: 'The ObjectWhereInput input type is used in operations that involve filtering result by a field of type Object.',
  fields: {
    equalTo: equalTo(KEY_VALUE_INPUT),
    notEqualTo: notEqualTo(KEY_VALUE_INPUT),
    in: inOp(KEY_VALUE_INPUT),
    notIn: notIn(KEY_VALUE_INPUT),
    lessThan: lessThan(KEY_VALUE_INPUT),
    lessThanOrEqualTo: lessThanOrEqualTo(KEY_VALUE_INPUT),
    greaterThan: greaterThan(KEY_VALUE_INPUT),
    greaterThanOrEqualTo: greaterThanOrEqualTo(KEY_VALUE_INPUT),
    exists,
    inQueryKey,
    notInQueryKey
  }
});
exports.OBJECT_WHERE_INPUT = OBJECT_WHERE_INPUT;
const DATE_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'DateWhereInput',
  description: 'The DateWhereInput input type is used in operations that involve filtering objects by a field of type Date.',
  fields: {
    equalTo: equalTo(DATE),
    notEqualTo: notEqualTo(DATE),
    lessThan: lessThan(DATE),
    lessThanOrEqualTo: lessThanOrEqualTo(DATE),
    greaterThan: greaterThan(DATE),
    greaterThanOrEqualTo: greaterThanOrEqualTo(DATE),
    in: inOp(DATE),
    notIn: notIn(DATE),
    exists,
    inQueryKey,
    notInQueryKey
  }
});
exports.DATE_WHERE_INPUT = DATE_WHERE_INPUT;
const BYTES_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'BytesWhereInput',
  description: 'The BytesWhereInput input type is used in operations that involve filtering objects by a field of type Bytes.',
  fields: {
    equalTo: equalTo(BYTES),
    notEqualTo: notEqualTo(BYTES),
    lessThan: lessThan(BYTES),
    lessThanOrEqualTo: lessThanOrEqualTo(BYTES),
    greaterThan: greaterThan(BYTES),
    greaterThanOrEqualTo: greaterThanOrEqualTo(BYTES),
    in: inOp(BYTES),
    notIn: notIn(BYTES),
    exists,
    inQueryKey,
    notInQueryKey
  }
});
exports.BYTES_WHERE_INPUT = BYTES_WHERE_INPUT;
const FILE_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'FileWhereInput',
  description: 'The FileWhereInput input type is used in operations that involve filtering objects by a field of type File.',
  fields: {
    equalTo: equalTo(FILE),
    notEqualTo: notEqualTo(FILE),
    lessThan: lessThan(FILE),
    lessThanOrEqualTo: lessThanOrEqualTo(FILE),
    greaterThan: greaterThan(FILE),
    greaterThanOrEqualTo: greaterThanOrEqualTo(FILE),
    in: inOp(FILE),
    notIn: notIn(FILE),
    exists,
    matchesRegex,
    options,
    inQueryKey,
    notInQueryKey
  }
});
exports.FILE_WHERE_INPUT = FILE_WHERE_INPUT;
const GEO_POINT_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'GeoPointWhereInput',
  description: 'The GeoPointWhereInput input type is used in operations that involve filtering objects by a field of type GeoPoint.',
  fields: {
    exists,
    nearSphere: {
      description: 'This is the nearSphere operator to specify a constraint to select the objects where the values of a geo point field is near to another geo point.',
      type: GEO_POINT_INPUT
    },
    maxDistance: {
      description: 'This is the maxDistance operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in radians) from the geo point specified in the $nearSphere operator.',
      type: _graphql.GraphQLFloat
    },
    maxDistanceInRadians: {
      description: 'This is the maxDistanceInRadians operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in radians) from the geo point specified in the $nearSphere operator.',
      type: _graphql.GraphQLFloat
    },
    maxDistanceInMiles: {
      description: 'This is the maxDistanceInMiles operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in miles) from the geo point specified in the $nearSphere operator.',
      type: _graphql.GraphQLFloat
    },
    maxDistanceInKilometers: {
      description: 'This is the maxDistanceInKilometers operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in kilometers) from the geo point specified in the $nearSphere operator.',
      type: _graphql.GraphQLFloat
    },
    within: {
      description: 'This is the within operator to specify a constraint to select the objects where the values of a geo point field is within a specified box.',
      type: WITHIN_INPUT
    },
    geoWithin: {
      description: 'This is the geoWithin operator to specify a constraint to select the objects where the values of a geo point field is within a specified polygon or sphere.',
      type: GEO_WITHIN_INPUT
    }
  }
});
exports.GEO_POINT_WHERE_INPUT = GEO_POINT_WHERE_INPUT;
const POLYGON_WHERE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'PolygonWhereInput',
  description: 'The PolygonWhereInput input type is used in operations that involve filtering objects by a field of type Polygon.',
  fields: {
    exists,
    geoIntersects: {
      description: 'This is the geoIntersects operator to specify a constraint to select the objects where the values of a polygon field intersect a specified point.',
      type: GEO_INTERSECTS_INPUT
    }
  }
});
exports.POLYGON_WHERE_INPUT = POLYGON_WHERE_INPUT;
const ELEMENT = new _graphql.GraphQLObjectType({
  name: 'Element',
  description: "The Element object type is used to return array items' value.",
  fields: {
    value: {
      description: 'Return the value of the element in the array',
      type: new _graphql.GraphQLNonNull(ANY)
    }
  }
});

// Default static union type, we update types and resolveType function later
exports.ELEMENT = ELEMENT;
let ARRAY_RESULT;
exports.ARRAY_RESULT = ARRAY_RESULT;
const loadArrayResult = (parseGraphQLSchema, parseClassesArray) => {
  const classTypes = parseClassesArray.filter(parseClass => parseGraphQLSchema.parseClassTypes[parseClass.className].classGraphQLOutputType ? true : false).map(parseClass => parseGraphQLSchema.parseClassTypes[parseClass.className].classGraphQLOutputType);
  exports.ARRAY_RESULT = ARRAY_RESULT = new _graphql.GraphQLUnionType({
    name: 'ArrayResult',
    description: 'Use Inline Fragment on Array to get results: https://graphql.org/learn/queries/#inline-fragments',
    types: () => [ELEMENT, ...classTypes],
    resolveType: value => {
      if (value.__type === 'Object' && value.className && value.objectId) {
        if (parseGraphQLSchema.parseClassTypes[value.className]) {
          return parseGraphQLSchema.parseClassTypes[value.className].classGraphQLOutputType.name;
        } else {
          return ELEMENT.name;
        }
      } else {
        return ELEMENT.name;
      }
    }
  });
  parseGraphQLSchema.graphQLTypes.push(ARRAY_RESULT);
};
exports.loadArrayResult = loadArrayResult;
const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLType(GraphQLUpload, true);
  parseGraphQLSchema.addGraphQLType(ANY, true);
  parseGraphQLSchema.addGraphQLType(OBJECT, true);
  parseGraphQLSchema.addGraphQLType(DATE, true);
  parseGraphQLSchema.addGraphQLType(BYTES, true);
  parseGraphQLSchema.addGraphQLType(FILE, true);
  parseGraphQLSchema.addGraphQLType(FILE_INFO, true);
  parseGraphQLSchema.addGraphQLType(FILE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(GEO_POINT_INPUT, true);
  parseGraphQLSchema.addGraphQLType(GEO_POINT, true);
  parseGraphQLSchema.addGraphQLType(PARSE_OBJECT, true);
  parseGraphQLSchema.addGraphQLType(READ_PREFERENCE, true);
  parseGraphQLSchema.addGraphQLType(READ_OPTIONS_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SEARCH_INPUT, true);
  parseGraphQLSchema.addGraphQLType(TEXT_INPUT, true);
  parseGraphQLSchema.addGraphQLType(BOX_INPUT, true);
  parseGraphQLSchema.addGraphQLType(WITHIN_INPUT, true);
  parseGraphQLSchema.addGraphQLType(CENTER_SPHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(GEO_WITHIN_INPUT, true);
  parseGraphQLSchema.addGraphQLType(GEO_INTERSECTS_INPUT, true);
  parseGraphQLSchema.addGraphQLType(ID_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(STRING_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(NUMBER_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(BOOLEAN_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(ARRAY_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(KEY_VALUE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(OBJECT_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(DATE_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(BYTES_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(FILE_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(GEO_POINT_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(POLYGON_WHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(ELEMENT, true);
  parseGraphQLSchema.addGraphQLType(ACL_INPUT, true);
  parseGraphQLSchema.addGraphQLType(USER_ACL_INPUT, true);
  parseGraphQLSchema.addGraphQLType(ROLE_ACL_INPUT, true);
  parseGraphQLSchema.addGraphQLType(PUBLIC_ACL_INPUT, true);
  parseGraphQLSchema.addGraphQLType(ACL, true);
  parseGraphQLSchema.addGraphQLType(USER_ACL, true);
  parseGraphQLSchema.addGraphQLType(ROLE_ACL, true);
  parseGraphQLSchema.addGraphQLType(PUBLIC_ACL, true);
  parseGraphQLSchema.addGraphQLType(SUBQUERY_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SELECT_INPUT, true);
};
exports.load = load;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfZ3JhcGhxbCIsInJlcXVpcmUiLCJfZ3JhcGhxbFJlbGF5Iiwib3duS2V5cyIsIm9iamVjdCIsImVudW1lcmFibGVPbmx5Iiwia2V5cyIsIk9iamVjdCIsImdldE93blByb3BlcnR5U3ltYm9scyIsInN5bWJvbHMiLCJmaWx0ZXIiLCJzeW0iLCJnZXRPd25Qcm9wZXJ0eURlc2NyaXB0b3IiLCJlbnVtZXJhYmxlIiwicHVzaCIsImFwcGx5IiwiX29iamVjdFNwcmVhZCIsInRhcmdldCIsImkiLCJhcmd1bWVudHMiLCJsZW5ndGgiLCJzb3VyY2UiLCJmb3JFYWNoIiwia2V5IiwiX2RlZmluZVByb3BlcnR5IiwiZ2V0T3duUHJvcGVydHlEZXNjcmlwdG9ycyIsImRlZmluZVByb3BlcnRpZXMiLCJkZWZpbmVQcm9wZXJ0eSIsIm9iaiIsInZhbHVlIiwiX3RvUHJvcGVydHlLZXkiLCJjb25maWd1cmFibGUiLCJ3cml0YWJsZSIsImFyZyIsIl90b1ByaW1pdGl2ZSIsIlN0cmluZyIsImlucHV0IiwiaGludCIsInByaW0iLCJTeW1ib2wiLCJ0b1ByaW1pdGl2ZSIsInVuZGVmaW5lZCIsInJlcyIsImNhbGwiLCJUeXBlRXJyb3IiLCJOdW1iZXIiLCJUeXBlVmFsaWRhdGlvbkVycm9yIiwiRXJyb3IiLCJjb25zdHJ1Y3RvciIsInR5cGUiLCJleHBvcnRzIiwicGFyc2VTdHJpbmdWYWx1ZSIsInBhcnNlSW50VmFsdWUiLCJpbnQiLCJpc0ludGVnZXIiLCJwYXJzZUZsb2F0VmFsdWUiLCJmbG9hdCIsImlzTmFOIiwicGFyc2VCb29sZWFuVmFsdWUiLCJwYXJzZVZhbHVlIiwia2luZCIsIktpbmQiLCJTVFJJTkciLCJJTlQiLCJGTE9BVCIsIkJPT0xFQU4iLCJMSVNUIiwicGFyc2VMaXN0VmFsdWVzIiwidmFsdWVzIiwiT0JKRUNUIiwicGFyc2VPYmplY3RGaWVsZHMiLCJmaWVsZHMiLCJBcnJheSIsImlzQXJyYXkiLCJtYXAiLCJyZWR1Y2UiLCJmaWVsZCIsIm5hbWUiLCJBTlkiLCJHcmFwaFFMU2NhbGFyVHlwZSIsImRlc2NyaXB0aW9uIiwic2VyaWFsaXplIiwicGFyc2VMaXRlcmFsIiwiYXN0IiwicGFyc2VEYXRlSXNvVmFsdWUiLCJkYXRlIiwiRGF0ZSIsInNlcmlhbGl6ZURhdGVJc28iLCJ0b0lTT1N0cmluZyIsInBhcnNlRGF0ZUlzb0xpdGVyYWwiLCJEQVRFIiwiX190eXBlIiwiaXNvIiwiZmluZCIsIkdyYXBoUUxVcGxvYWQiLCJCWVRFUyIsImJhc2U2NCIsInBhcnNlRmlsZVZhbHVlIiwidXJsIiwiRklMRSIsIkZJTEVfSU5GTyIsIkdyYXBoUUxPYmplY3RUeXBlIiwiR3JhcGhRTE5vbk51bGwiLCJHcmFwaFFMU3RyaW5nIiwiRklMRV9JTlBVVCIsIkdyYXBoUUxJbnB1dE9iamVjdFR5cGUiLCJmaWxlIiwidXBsb2FkIiwiR0VPX1BPSU5UX0ZJRUxEUyIsImxhdGl0dWRlIiwiR3JhcGhRTEZsb2F0IiwibG9uZ2l0dWRlIiwiR0VPX1BPSU5UX0lOUFVUIiwiR0VPX1BPSU5UIiwiUE9MWUdPTl9JTlBVVCIsIkdyYXBoUUxMaXN0IiwiUE9MWUdPTiIsIlVTRVJfQUNMX0lOUFVUIiwidXNlcklkIiwiR3JhcGhRTElEIiwicmVhZCIsIkdyYXBoUUxCb29sZWFuIiwid3JpdGUiLCJST0xFX0FDTF9JTlBVVCIsInJvbGVOYW1lIiwiUFVCTElDX0FDTF9JTlBVVCIsIkFDTF9JTlBVVCIsInVzZXJzIiwicm9sZXMiLCJwdWJsaWMiLCJVU0VSX0FDTCIsIlJPTEVfQUNMIiwiUFVCTElDX0FDTCIsIkFDTCIsInJlc29sdmUiLCJwIiwicnVsZSIsImluZGV4T2YiLCJ0b0dsb2JhbElkIiwicmVwbGFjZSIsIk9CSkVDVF9JRCIsIkNMQVNTX05BTUVfQVRUIiwiR0xPQkFMX09SX09CSkVDVF9JRF9BVFQiLCJPQkpFQ1RfSURfQVRUIiwiQ1JFQVRFRF9BVF9BVFQiLCJVUERBVEVEX0FUX0FUVCIsIklOUFVUX0ZJRUxEUyIsIkNSRUFURV9SRVNVTFRfRklFTERTIiwib2JqZWN0SWQiLCJjcmVhdGVkQXQiLCJVUERBVEVfUkVTVUxUX0ZJRUxEUyIsInVwZGF0ZWRBdCIsIlBBUlNFX09CSkVDVF9GSUVMRFMiLCJQQVJTRV9PQkpFQ1QiLCJHcmFwaFFMSW50ZXJmYWNlVHlwZSIsIlNFU1NJT05fVE9LRU5fQVRUIiwiUkVBRF9QUkVGRVJFTkNFIiwiR3JhcGhRTEVudW1UeXBlIiwiUFJJTUFSWSIsIlBSSU1BUllfUFJFRkVSUkVEIiwiU0VDT05EQVJZIiwiU0VDT05EQVJZX1BSRUZFUlJFRCIsIk5FQVJFU1QiLCJSRUFEX1BSRUZFUkVOQ0VfQVRUIiwiSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRUIiwiU1VCUVVFUllfUkVBRF9QUkVGRVJFTkNFX0FUVCIsIlJFQURfT1BUSU9OU19JTlBVVCIsInJlYWRQcmVmZXJlbmNlIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsIlJFQURfT1BUSU9OU19BVFQiLCJXSEVSRV9BVFQiLCJTS0lQX0FUVCIsIkdyYXBoUUxJbnQiLCJMSU1JVF9BVFQiLCJDT1VOVF9BVFQiLCJTRUFSQ0hfSU5QVVQiLCJ0ZXJtIiwibGFuZ3VhZ2UiLCJjYXNlU2Vuc2l0aXZlIiwiZGlhY3JpdGljU2Vuc2l0aXZlIiwiVEVYVF9JTlBVVCIsInNlYXJjaCIsIkJPWF9JTlBVVCIsImJvdHRvbUxlZnQiLCJ1cHBlclJpZ2h0IiwiV0lUSElOX0lOUFVUIiwiYm94IiwiQ0VOVEVSX1NQSEVSRV9JTlBVVCIsImNlbnRlciIsImRpc3RhbmNlIiwiR0VPX1dJVEhJTl9JTlBVVCIsInBvbHlnb24iLCJjZW50ZXJTcGhlcmUiLCJHRU9fSU5URVJTRUNUU19JTlBVVCIsInBvaW50IiwiZXF1YWxUbyIsIm5vdEVxdWFsVG8iLCJsZXNzVGhhbiIsImxlc3NUaGFuT3JFcXVhbFRvIiwiZ3JlYXRlclRoYW4iLCJncmVhdGVyVGhhbk9yRXF1YWxUbyIsImluT3AiLCJub3RJbiIsImV4aXN0cyIsIm1hdGNoZXNSZWdleCIsIm9wdGlvbnMiLCJTVUJRVUVSWV9JTlBVVCIsImNsYXNzTmFtZSIsIndoZXJlIiwiYXNzaWduIiwiU0VMRUNUX0lOUFVUIiwicXVlcnkiLCJpblF1ZXJ5S2V5Iiwibm90SW5RdWVyeUtleSIsIklEX1dIRVJFX0lOUFVUIiwiaW4iLCJTVFJJTkdfV0hFUkVfSU5QVVQiLCJ0ZXh0IiwiTlVNQkVSX1dIRVJFX0lOUFVUIiwiQk9PTEVBTl9XSEVSRV9JTlBVVCIsIkFSUkFZX1dIRVJFX0lOUFVUIiwiY29udGFpbmVkQnkiLCJjb250YWlucyIsIktFWV9WQUxVRV9JTlBVVCIsIk9CSkVDVF9XSEVSRV9JTlBVVCIsIkRBVEVfV0hFUkVfSU5QVVQiLCJCWVRFU19XSEVSRV9JTlBVVCIsIkZJTEVfV0hFUkVfSU5QVVQiLCJHRU9fUE9JTlRfV0hFUkVfSU5QVVQiLCJuZWFyU3BoZXJlIiwibWF4RGlzdGFuY2UiLCJtYXhEaXN0YW5jZUluUmFkaWFucyIsIm1heERpc3RhbmNlSW5NaWxlcyIsIm1heERpc3RhbmNlSW5LaWxvbWV0ZXJzIiwid2l0aGluIiwiZ2VvV2l0aGluIiwiUE9MWUdPTl9XSEVSRV9JTlBVVCIsImdlb0ludGVyc2VjdHMiLCJFTEVNRU5UIiwiQVJSQVlfUkVTVUxUIiwibG9hZEFycmF5UmVzdWx0IiwicGFyc2VHcmFwaFFMU2NoZW1hIiwicGFyc2VDbGFzc2VzQXJyYXkiLCJjbGFzc1R5cGVzIiwicGFyc2VDbGFzcyIsInBhcnNlQ2xhc3NUeXBlcyIsImNsYXNzR3JhcGhRTE91dHB1dFR5cGUiLCJHcmFwaFFMVW5pb25UeXBlIiwidHlwZXMiLCJyZXNvbHZlVHlwZSIsImdyYXBoUUxUeXBlcyIsImxvYWQiLCJhZGRHcmFwaFFMVHlwZSJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcy5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuICBLaW5kLFxuICBHcmFwaFFMTm9uTnVsbCxcbiAgR3JhcGhRTFNjYWxhclR5cGUsXG4gIEdyYXBoUUxJRCxcbiAgR3JhcGhRTFN0cmluZyxcbiAgR3JhcGhRTE9iamVjdFR5cGUsXG4gIEdyYXBoUUxJbnRlcmZhY2VUeXBlLFxuICBHcmFwaFFMRW51bVR5cGUsXG4gIEdyYXBoUUxJbnQsXG4gIEdyYXBoUUxGbG9hdCxcbiAgR3JhcGhRTExpc3QsXG4gIEdyYXBoUUxJbnB1dE9iamVjdFR5cGUsXG4gIEdyYXBoUUxCb29sZWFuLFxuICBHcmFwaFFMVW5pb25UeXBlLFxufSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IHRvR2xvYmFsSWQgfSBmcm9tICdncmFwaHFsLXJlbGF5JztcblxuY2xhc3MgVHlwZVZhbGlkYXRpb25FcnJvciBleHRlbmRzIEVycm9yIHtcbiAgY29uc3RydWN0b3IodmFsdWUsIHR5cGUpIHtcbiAgICBzdXBlcihgJHt2YWx1ZX0gaXMgbm90IGEgdmFsaWQgJHt0eXBlfWApO1xuICB9XG59XG5cbmNvbnN0IHBhcnNlU3RyaW5nVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdTdHJpbmcnKTtcbn07XG5cbmNvbnN0IHBhcnNlSW50VmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgY29uc3QgaW50ID0gTnVtYmVyKHZhbHVlKTtcbiAgICBpZiAoTnVtYmVyLmlzSW50ZWdlcihpbnQpKSB7XG4gICAgICByZXR1cm4gaW50O1xuICAgIH1cbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnSW50Jyk7XG59O1xuXG5jb25zdCBwYXJzZUZsb2F0VmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgY29uc3QgZmxvYXQgPSBOdW1iZXIodmFsdWUpO1xuICAgIGlmICghaXNOYU4oZmxvYXQpKSB7XG4gICAgICByZXR1cm4gZmxvYXQ7XG4gICAgfVxuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdGbG9hdCcpO1xufTtcblxuY29uc3QgcGFyc2VCb29sZWFuVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnQm9vbGVhbicpO1xufTtcblxuY29uc3QgcGFyc2VWYWx1ZSA9IHZhbHVlID0+IHtcbiAgc3dpdGNoICh2YWx1ZS5raW5kKSB7XG4gICAgY2FzZSBLaW5kLlNUUklORzpcbiAgICAgIHJldHVybiBwYXJzZVN0cmluZ1ZhbHVlKHZhbHVlLnZhbHVlKTtcblxuICAgIGNhc2UgS2luZC5JTlQ6XG4gICAgICByZXR1cm4gcGFyc2VJbnRWYWx1ZSh2YWx1ZS52YWx1ZSk7XG5cbiAgICBjYXNlIEtpbmQuRkxPQVQ6XG4gICAgICByZXR1cm4gcGFyc2VGbG9hdFZhbHVlKHZhbHVlLnZhbHVlKTtcblxuICAgIGNhc2UgS2luZC5CT09MRUFOOlxuICAgICAgcmV0dXJuIHBhcnNlQm9vbGVhblZhbHVlKHZhbHVlLnZhbHVlKTtcblxuICAgIGNhc2UgS2luZC5MSVNUOlxuICAgICAgcmV0dXJuIHBhcnNlTGlzdFZhbHVlcyh2YWx1ZS52YWx1ZXMpO1xuXG4gICAgY2FzZSBLaW5kLk9CSkVDVDpcbiAgICAgIHJldHVybiBwYXJzZU9iamVjdEZpZWxkcyh2YWx1ZS5maWVsZHMpO1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB2YWx1ZS52YWx1ZTtcbiAgfVxufTtcblxuY29uc3QgcGFyc2VMaXN0VmFsdWVzID0gdmFsdWVzID0+IHtcbiAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWVzKSkge1xuICAgIHJldHVybiB2YWx1ZXMubWFwKHZhbHVlID0+IHBhcnNlVmFsdWUodmFsdWUpKTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlcywgJ0xpc3QnKTtcbn07XG5cbmNvbnN0IHBhcnNlT2JqZWN0RmllbGRzID0gZmllbGRzID0+IHtcbiAgaWYgKEFycmF5LmlzQXJyYXkoZmllbGRzKSkge1xuICAgIHJldHVybiBmaWVsZHMucmVkdWNlKFxuICAgICAgKG9iamVjdCwgZmllbGQpID0+ICh7XG4gICAgICAgIC4uLm9iamVjdCxcbiAgICAgICAgW2ZpZWxkLm5hbWUudmFsdWVdOiBwYXJzZVZhbHVlKGZpZWxkLnZhbHVlKSxcbiAgICAgIH0pLFxuICAgICAge31cbiAgICApO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IoZmllbGRzLCAnT2JqZWN0Jyk7XG59O1xuXG5jb25zdCBBTlkgPSBuZXcgR3JhcGhRTFNjYWxhclR5cGUoe1xuICBuYW1lOiAnQW55JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBBbnkgc2NhbGFyIHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIGFuZCB0eXBlcyB0aGF0IGludm9sdmUgYW55IHR5cGUgb2YgdmFsdWUuJyxcbiAgcGFyc2VWYWx1ZTogdmFsdWUgPT4gdmFsdWUsXG4gIHNlcmlhbGl6ZTogdmFsdWUgPT4gdmFsdWUsXG4gIHBhcnNlTGl0ZXJhbDogYXN0ID0+IHBhcnNlVmFsdWUoYXN0KSxcbn0pO1xuXG5jb25zdCBPQkpFQ1QgPSBuZXcgR3JhcGhRTFNjYWxhclR5cGUoe1xuICBuYW1lOiAnT2JqZWN0JyxcbiAgZGVzY3JpcHRpb246ICdUaGUgT2JqZWN0IHNjYWxhciB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyBhbmQgdHlwZXMgdGhhdCBpbnZvbHZlIG9iamVjdHMuJyxcbiAgcGFyc2VWYWx1ZSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdPYmplY3QnKTtcbiAgfSxcbiAgc2VyaWFsaXplKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ09iamVjdCcpO1xuICB9LFxuICBwYXJzZUxpdGVyYWwoYXN0KSB7XG4gICAgaWYgKGFzdC5raW5kID09PSBLaW5kLk9CSkVDVCkge1xuICAgICAgcmV0dXJuIHBhcnNlT2JqZWN0RmllbGRzKGFzdC5maWVsZHMpO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnT2JqZWN0Jyk7XG4gIH0sXG59KTtcblxuY29uc3QgcGFyc2VEYXRlSXNvVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKHZhbHVlKTtcbiAgICBpZiAoIWlzTmFOKGRhdGUpKSB7XG4gICAgICByZXR1cm4gZGF0ZTtcbiAgICB9XG4gIH0gZWxzZSBpZiAodmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdEYXRlJyk7XG59O1xuXG5jb25zdCBzZXJpYWxpemVEYXRlSXNvID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuICBpZiAodmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgcmV0dXJuIHZhbHVlLnRvSVNPU3RyaW5nKCk7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0RhdGUnKTtcbn07XG5cbmNvbnN0IHBhcnNlRGF0ZUlzb0xpdGVyYWwgPSBhc3QgPT4ge1xuICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgcmV0dXJuIHBhcnNlRGF0ZUlzb1ZhbHVlKGFzdC52YWx1ZSk7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcihhc3Qua2luZCwgJ0RhdGUnKTtcbn07XG5cbmNvbnN0IERBVEUgPSBuZXcgR3JhcGhRTFNjYWxhclR5cGUoe1xuICBuYW1lOiAnRGF0ZScsXG4gIGRlc2NyaXB0aW9uOiAnVGhlIERhdGUgc2NhbGFyIHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIGFuZCB0eXBlcyB0aGF0IGludm9sdmUgZGF0ZXMuJyxcbiAgcGFyc2VWYWx1ZSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnIHx8IHZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnRGF0ZScsXG4gICAgICAgIGlzbzogcGFyc2VEYXRlSXNvVmFsdWUodmFsdWUpLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiYgdmFsdWUuX190eXBlID09PSAnRGF0ZScgJiYgdmFsdWUuaXNvKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6IHZhbHVlLl9fdHlwZSxcbiAgICAgICAgaXNvOiBwYXJzZURhdGVJc29WYWx1ZSh2YWx1ZS5pc28pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0RhdGUnKTtcbiAgfSxcbiAgc2VyaWFsaXplKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgfHwgdmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICByZXR1cm4gc2VyaWFsaXplRGF0ZUlzbyh2YWx1ZSk7XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnICYmIHZhbHVlLmlzbykge1xuICAgICAgcmV0dXJuIHNlcmlhbGl6ZURhdGVJc28odmFsdWUuaXNvKTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0RhdGUnKTtcbiAgfSxcbiAgcGFyc2VMaXRlcmFsKGFzdCkge1xuICAgIGlmIChhc3Qua2luZCA9PT0gS2luZC5TVFJJTkcpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IHBhcnNlRGF0ZUlzb0xpdGVyYWwoYXN0KSxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChhc3Qua2luZCA9PT0gS2luZC5PQkpFQ1QpIHtcbiAgICAgIGNvbnN0IF9fdHlwZSA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnX190eXBlJyk7XG4gICAgICBjb25zdCBpc28gPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ2lzbycpO1xuICAgICAgaWYgKF9fdHlwZSAmJiBfX3R5cGUudmFsdWUgJiYgX190eXBlLnZhbHVlLnZhbHVlID09PSAnRGF0ZScgJiYgaXNvKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgX190eXBlOiBfX3R5cGUudmFsdWUudmFsdWUsXG4gICAgICAgICAgaXNvOiBwYXJzZURhdGVJc29MaXRlcmFsKGlzby52YWx1ZSksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IoYXN0LmtpbmQsICdEYXRlJyk7XG4gIH0sXG59KTtcblxuY29uc3QgR3JhcGhRTFVwbG9hZCA9IG5ldyBHcmFwaFFMU2NhbGFyVHlwZSh7XG4gIG5hbWU6ICdVcGxvYWQnLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBVcGxvYWQgc2NhbGFyIHR5cGUgcmVwcmVzZW50cyBhIGZpbGUgdXBsb2FkLicsXG59KTtcblxuY29uc3QgQllURVMgPSBuZXcgR3JhcGhRTFNjYWxhclR5cGUoe1xuICBuYW1lOiAnQnl0ZXMnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEJ5dGVzIHNjYWxhciB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyBhbmQgdHlwZXMgdGhhdCBpbnZvbHZlIGJhc2UgNjQgYmluYXJ5IGRhdGEuJyxcbiAgcGFyc2VWYWx1ZSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdCeXRlcycsXG4gICAgICAgIGJhc2U2NDogdmFsdWUsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICB2YWx1ZS5fX3R5cGUgPT09ICdCeXRlcycgJiZcbiAgICAgIHR5cGVvZiB2YWx1ZS5iYXNlNjQgPT09ICdzdHJpbmcnXG4gICAgKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdCeXRlcycpO1xuICB9LFxuICBzZXJpYWxpemUodmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICB2YWx1ZS5fX3R5cGUgPT09ICdCeXRlcycgJiZcbiAgICAgIHR5cGVvZiB2YWx1ZS5iYXNlNjQgPT09ICdzdHJpbmcnXG4gICAgKSB7XG4gICAgICByZXR1cm4gdmFsdWUuYmFzZTY0O1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnQnl0ZXMnKTtcbiAgfSxcbiAgcGFyc2VMaXRlcmFsKGFzdCkge1xuICAgIGlmIChhc3Qua2luZCA9PT0gS2luZC5TVFJJTkcpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ0J5dGVzJyxcbiAgICAgICAgYmFzZTY0OiBhc3QudmFsdWUsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoYXN0LmtpbmQgPT09IEtpbmQuT0JKRUNUKSB7XG4gICAgICBjb25zdCBfX3R5cGUgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ19fdHlwZScpO1xuICAgICAgY29uc3QgYmFzZTY0ID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdiYXNlNjQnKTtcbiAgICAgIGlmIChcbiAgICAgICAgX190eXBlICYmXG4gICAgICAgIF9fdHlwZS52YWx1ZSAmJlxuICAgICAgICBfX3R5cGUudmFsdWUudmFsdWUgPT09ICdCeXRlcycgJiZcbiAgICAgICAgYmFzZTY0ICYmXG4gICAgICAgIGJhc2U2NC52YWx1ZSAmJlxuICAgICAgICB0eXBlb2YgYmFzZTY0LnZhbHVlLnZhbHVlID09PSAnc3RyaW5nJ1xuICAgICAgKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgX190eXBlOiBfX3R5cGUudmFsdWUudmFsdWUsXG4gICAgICAgICAgYmFzZTY0OiBiYXNlNjQudmFsdWUudmFsdWUsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IoYXN0LmtpbmQsICdCeXRlcycpO1xuICB9LFxufSk7XG5cbmNvbnN0IHBhcnNlRmlsZVZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiB7XG4gICAgICBfX3R5cGU6ICdGaWxlJyxcbiAgICAgIG5hbWU6IHZhbHVlLFxuICAgIH07XG4gIH0gZWxzZSBpZiAoXG4gICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgIHZhbHVlLl9fdHlwZSA9PT0gJ0ZpbGUnICYmXG4gICAgdHlwZW9mIHZhbHVlLm5hbWUgPT09ICdzdHJpbmcnICYmXG4gICAgKHZhbHVlLnVybCA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiB2YWx1ZS51cmwgPT09ICdzdHJpbmcnKVxuICApIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0ZpbGUnKTtcbn07XG5cbmNvbnN0IEZJTEUgPSBuZXcgR3JhcGhRTFNjYWxhclR5cGUoe1xuICBuYW1lOiAnRmlsZScsXG4gIGRlc2NyaXB0aW9uOiAnVGhlIEZpbGUgc2NhbGFyIHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIGFuZCB0eXBlcyB0aGF0IGludm9sdmUgZmlsZXMuJyxcbiAgcGFyc2VWYWx1ZTogcGFyc2VGaWxlVmFsdWUsXG4gIHNlcmlhbGl6ZTogdmFsdWUgPT4ge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHZhbHVlLl9fdHlwZSA9PT0gJ0ZpbGUnICYmXG4gICAgICB0eXBlb2YgdmFsdWUubmFtZSA9PT0gJ3N0cmluZycgJiZcbiAgICAgICh2YWx1ZS51cmwgPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgdmFsdWUudXJsID09PSAnc3RyaW5nJylcbiAgICApIHtcbiAgICAgIHJldHVybiB2YWx1ZS5uYW1lO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRmlsZScpO1xuICB9LFxuICBwYXJzZUxpdGVyYWwoYXN0KSB7XG4gICAgaWYgKGFzdC5raW5kID09PSBLaW5kLlNUUklORykge1xuICAgICAgcmV0dXJuIHBhcnNlRmlsZVZhbHVlKGFzdC52YWx1ZSk7XG4gICAgfSBlbHNlIGlmIChhc3Qua2luZCA9PT0gS2luZC5PQkpFQ1QpIHtcbiAgICAgIGNvbnN0IF9fdHlwZSA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnX190eXBlJyk7XG4gICAgICBjb25zdCBuYW1lID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICduYW1lJyk7XG4gICAgICBjb25zdCB1cmwgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ3VybCcpO1xuICAgICAgaWYgKF9fdHlwZSAmJiBfX3R5cGUudmFsdWUgJiYgbmFtZSAmJiBuYW1lLnZhbHVlKSB7XG4gICAgICAgIHJldHVybiBwYXJzZUZpbGVWYWx1ZSh7XG4gICAgICAgICAgX190eXBlOiBfX3R5cGUudmFsdWUudmFsdWUsXG4gICAgICAgICAgbmFtZTogbmFtZS52YWx1ZS52YWx1ZSxcbiAgICAgICAgICB1cmw6IHVybCAmJiB1cmwudmFsdWUgPyB1cmwudmFsdWUudmFsdWUgOiB1bmRlZmluZWQsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnRmlsZScpO1xuICB9LFxufSk7XG5cbmNvbnN0IEZJTEVfSU5GTyA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdGaWxlSW5mbycsXG4gIGRlc2NyaXB0aW9uOiAnVGhlIEZpbGVJbmZvIG9iamVjdCB0eXBlIGlzIHVzZWQgdG8gcmV0dXJuIHRoZSBpbmZvcm1hdGlvbiBhYm91dCBmaWxlcy4nLFxuICBmaWVsZHM6IHtcbiAgICBuYW1lOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGZpbGUgbmFtZS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgIH0sXG4gICAgdXJsOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHVybCBpbiB3aGljaCB0aGUgZmlsZSBjYW4gYmUgZG93bmxvYWRlZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgRklMRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0ZpbGVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdJZiB0aGlzIGZpZWxkIGlzIHNldCB0byBudWxsIHRoZSBmaWxlIHdpbGwgYmUgdW5saW5rZWQgKHRoZSBmaWxlIHdpbGwgbm90IGJlIGRlbGV0ZWQgb24gY2xvdWQgc3RvcmFnZSkuJyxcbiAgZmllbGRzOiB7XG4gICAgZmlsZToge1xuICAgICAgZGVzY3JpcHRpb246ICdBIEZpbGUgU2NhbGFyIGNhbiBiZSBhbiB1cmwgb3IgYSBGaWxlSW5mbyBvYmplY3QuJyxcbiAgICAgIHR5cGU6IEZJTEUsXG4gICAgfSxcbiAgICB1cGxvYWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVXNlIHRoaXMgZmllbGQgaWYgeW91IHdhbnQgdG8gY3JlYXRlIGEgbmV3IGZpbGUuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxVcGxvYWQsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBHRU9fUE9JTlRfRklFTERTID0ge1xuICBsYXRpdHVkZToge1xuICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbGF0aXR1ZGUuJyxcbiAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEZsb2F0KSxcbiAgfSxcbiAgbG9uZ2l0dWRlOiB7XG4gICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBsb25naXR1ZGUuJyxcbiAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEZsb2F0KSxcbiAgfSxcbn07XG5cbmNvbnN0IEdFT19QT0lOVF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0dlb1BvaW50SW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEdlb1BvaW50SW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGlucHV0dGluZyBmaWVsZHMgb2YgdHlwZSBnZW8gcG9pbnQuJyxcbiAgZmllbGRzOiBHRU9fUE9JTlRfRklFTERTLFxufSk7XG5cbmNvbnN0IEdFT19QT0lOVCA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdHZW9Qb2ludCcsXG4gIGRlc2NyaXB0aW9uOiAnVGhlIEdlb1BvaW50IG9iamVjdCB0eXBlIGlzIHVzZWQgdG8gcmV0dXJuIHRoZSBpbmZvcm1hdGlvbiBhYm91dCBnZW8gcG9pbnQgZmllbGRzLicsXG4gIGZpZWxkczogR0VPX1BPSU5UX0ZJRUxEUyxcbn0pO1xuXG5jb25zdCBQT0xZR09OX0lOUFVUID0gbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChHRU9fUE9JTlRfSU5QVVQpKTtcblxuY29uc3QgUE9MWUdPTiA9IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoR0VPX1BPSU5UKSk7XG5cbmNvbnN0IFVTRVJfQUNMX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnVXNlckFDTElucHV0JyxcbiAgZGVzY3JpcHRpb246ICdBbGxvdyB0byBtYW5hZ2UgdXNlcnMgaW4gQUNMLicsXG4gIGZpZWxkczoge1xuICAgIHVzZXJJZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdJRCBvZiB0aGUgdGFyZ2V0dGVkIFVzZXIuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMSUQpLFxuICAgIH0sXG4gICAgcmVhZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyB0aGUgdXNlciB0byByZWFkIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICAgIHdyaXRlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IHRoZSB1c2VyIHRvIHdyaXRlIG9uIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFJPTEVfQUNMX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnUm9sZUFDTElucHV0JyxcbiAgZGVzY3JpcHRpb246ICdBbGxvdyB0byBtYW5hZ2Ugcm9sZXMgaW4gQUNMLicsXG4gIGZpZWxkczoge1xuICAgIHJvbGVOYW1lOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIHRhcmdldHRlZCBSb2xlLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgICByZWFkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IHVzZXJzIHdobyBhcmUgbWVtYmVycyBvZiB0aGUgcm9sZSB0byByZWFkIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICAgIHdyaXRlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IHVzZXJzIHdobyBhcmUgbWVtYmVycyBvZiB0aGUgcm9sZSB0byB3cml0ZSBvbiB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBQVUJMSUNfQUNMX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnUHVibGljQUNMSW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ0FsbG93IHRvIG1hbmFnZSBwdWJsaWMgcmlnaHRzLicsXG4gIGZpZWxkczoge1xuICAgIHJlYWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgYW55b25lIHRvIHJlYWQgdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gICAgd3JpdGU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgYW55b25lIHRvIHdyaXRlIG9uIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IEFDTF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0FDTElucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ0FsbG93IHRvIG1hbmFnZSBhY2Nlc3MgcmlnaHRzLiBJZiBub3QgcHJvdmlkZWQgb2JqZWN0IHdpbGwgYmUgcHVibGljbHkgcmVhZGFibGUgYW5kIHdyaXRhYmxlJyxcbiAgZmllbGRzOiB7XG4gICAgdXNlcnM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWNjZXNzIGNvbnRyb2wgbGlzdCBmb3IgdXNlcnMuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoVVNFUl9BQ0xfSU5QVVQpKSxcbiAgICB9LFxuICAgIHJvbGVzOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FjY2VzcyBjb250cm9sIGxpc3QgZm9yIHJvbGVzLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKFJPTEVfQUNMX0lOUFVUKSksXG4gICAgfSxcbiAgICBwdWJsaWM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnUHVibGljIGFjY2VzcyBjb250cm9sIGxpc3QuJyxcbiAgICAgIHR5cGU6IFBVQkxJQ19BQ0xfSU5QVVQsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBVU0VSX0FDTCA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdVc2VyQUNMJyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ0FsbG93IHRvIG1hbmFnZSB1c2VycyBpbiBBQ0wuIElmIHJlYWQgYW5kIHdyaXRlIGFyZSBudWxsIHRoZSB1c2VycyBoYXZlIHJlYWQgYW5kIHdyaXRlIHJpZ2h0cy4nLFxuICBmaWVsZHM6IHtcbiAgICB1c2VySWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnSUQgb2YgdGhlIHRhcmdldHRlZCBVc2VyLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTElEKSxcbiAgICB9LFxuICAgIHJlYWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgdGhlIHVzZXIgdG8gcmVhZCB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgICB3cml0ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyB0aGUgdXNlciB0byB3cml0ZSBvbiB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBST0xFX0FDTCA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdSb2xlQUNMJyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ0FsbG93IHRvIG1hbmFnZSByb2xlcyBpbiBBQ0wuIElmIHJlYWQgYW5kIHdyaXRlIGFyZSBudWxsIHRoZSByb2xlIGhhdmUgcmVhZCBhbmQgd3JpdGUgcmlnaHRzLicsXG4gIGZpZWxkczoge1xuICAgIHJvbGVOYW1lOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ05hbWUgb2YgdGhlIHRhcmdldHRlZCBSb2xlLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTElEKSxcbiAgICB9LFxuICAgIHJlYWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgdXNlcnMgd2hvIGFyZSBtZW1iZXJzIG9mIHRoZSByb2xlIHRvIHJlYWQgdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gICAgd3JpdGU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgdXNlcnMgd2hvIGFyZSBtZW1iZXJzIG9mIHRoZSByb2xlIHRvIHdyaXRlIG9uIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFBVQkxJQ19BQ0wgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnUHVibGljQUNMJyxcbiAgZGVzY3JpcHRpb246ICdBbGxvdyB0byBtYW5hZ2UgcHVibGljIHJpZ2h0cy4nLFxuICBmaWVsZHM6IHtcbiAgICByZWFkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IGFueW9uZSB0byByZWFkIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogR3JhcGhRTEJvb2xlYW4sXG4gICAgfSxcbiAgICB3cml0ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyBhbnlvbmUgdG8gd3JpdGUgb24gdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBHcmFwaFFMQm9vbGVhbixcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IEFDTCA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdBQ0wnLFxuICBkZXNjcmlwdGlvbjogJ0N1cnJlbnQgYWNjZXNzIGNvbnRyb2wgbGlzdCBvZiB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgZmllbGRzOiB7XG4gICAgdXNlcnM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWNjZXNzIGNvbnRyb2wgbGlzdCBmb3IgdXNlcnMuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoVVNFUl9BQ0wpKSxcbiAgICAgIHJlc29sdmUocCkge1xuICAgICAgICBjb25zdCB1c2VycyA9IFtdO1xuICAgICAgICBPYmplY3Qua2V5cyhwKS5mb3JFYWNoKHJ1bGUgPT4ge1xuICAgICAgICAgIGlmIChydWxlICE9PSAnKicgJiYgcnVsZS5pbmRleE9mKCdyb2xlOicpICE9PSAwKSB7XG4gICAgICAgICAgICB1c2Vycy5wdXNoKHtcbiAgICAgICAgICAgICAgdXNlcklkOiB0b0dsb2JhbElkKCdfVXNlcicsIHJ1bGUpLFxuICAgICAgICAgICAgICByZWFkOiBwW3J1bGVdLnJlYWQgPyB0cnVlIDogZmFsc2UsXG4gICAgICAgICAgICAgIHdyaXRlOiBwW3J1bGVdLndyaXRlID8gdHJ1ZSA6IGZhbHNlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHVzZXJzLmxlbmd0aCA/IHVzZXJzIDogbnVsbDtcbiAgICAgIH0sXG4gICAgfSxcbiAgICByb2xlczoge1xuICAgICAgZGVzY3JpcHRpb246ICdBY2Nlc3MgY29udHJvbCBsaXN0IGZvciByb2xlcy4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChST0xFX0FDTCkpLFxuICAgICAgcmVzb2x2ZShwKSB7XG4gICAgICAgIGNvbnN0IHJvbGVzID0gW107XG4gICAgICAgIE9iamVjdC5rZXlzKHApLmZvckVhY2gocnVsZSA9PiB7XG4gICAgICAgICAgaWYgKHJ1bGUuaW5kZXhPZigncm9sZTonKSA9PT0gMCkge1xuICAgICAgICAgICAgcm9sZXMucHVzaCh7XG4gICAgICAgICAgICAgIHJvbGVOYW1lOiBydWxlLnJlcGxhY2UoJ3JvbGU6JywgJycpLFxuICAgICAgICAgICAgICByZWFkOiBwW3J1bGVdLnJlYWQgPyB0cnVlIDogZmFsc2UsXG4gICAgICAgICAgICAgIHdyaXRlOiBwW3J1bGVdLndyaXRlID8gdHJ1ZSA6IGZhbHNlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHJvbGVzLmxlbmd0aCA/IHJvbGVzIDogbnVsbDtcbiAgICAgIH0sXG4gICAgfSxcbiAgICBwdWJsaWM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnUHVibGljIGFjY2VzcyBjb250cm9sIGxpc3QuJyxcbiAgICAgIHR5cGU6IFBVQkxJQ19BQ0wsXG4gICAgICByZXNvbHZlKHApIHtcbiAgICAgICAgLyogZXNsaW50LWRpc2FibGUgKi9cbiAgICAgICAgcmV0dXJuIHBbJyonXVxuICAgICAgICAgID8ge1xuICAgICAgICAgICAgICByZWFkOiBwWycqJ10ucmVhZCA/IHRydWUgOiBmYWxzZSxcbiAgICAgICAgICAgICAgd3JpdGU6IHBbJyonXS53cml0ZSA/IHRydWUgOiBmYWxzZSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICA6IG51bGw7XG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgT0JKRUNUX0lEID0gbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxJRCk7XG5cbmNvbnN0IENMQVNTX05BTUVfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGNsYXNzIG5hbWUgb2YgdGhlIG9iamVjdC4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG59O1xuXG5jb25zdCBHTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBvYmplY3QgaWQuIFlvdSBjYW4gdXNlIGVpdGhlciB0aGUgZ2xvYmFsIG9yIHRoZSBvYmplY3QgaWQuJyxcbiAgdHlwZTogT0JKRUNUX0lELFxufTtcblxuY29uc3QgT0JKRUNUX0lEX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBvYmplY3QgaWQuJyxcbiAgdHlwZTogT0JKRUNUX0lELFxufTtcblxuY29uc3QgQ1JFQVRFRF9BVF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZGF0ZSBpbiB3aGljaCB0aGUgb2JqZWN0IHdhcyBjcmVhdGVkLicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChEQVRFKSxcbn07XG5cbmNvbnN0IFVQREFURURfQVRfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGRhdGUgaW4gd2hpY2ggdGhlIG9iamVjdCB3YXMgbGFzIHVwZGF0ZWQuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKERBVEUpLFxufTtcblxuY29uc3QgSU5QVVRfRklFTERTID0ge1xuICBBQ0w6IHtcbiAgICB0eXBlOiBBQ0wsXG4gIH0sXG59O1xuXG5jb25zdCBDUkVBVEVfUkVTVUxUX0ZJRUxEUyA9IHtcbiAgb2JqZWN0SWQ6IE9CSkVDVF9JRF9BVFQsXG4gIGNyZWF0ZWRBdDogQ1JFQVRFRF9BVF9BVFQsXG59O1xuXG5jb25zdCBVUERBVEVfUkVTVUxUX0ZJRUxEUyA9IHtcbiAgdXBkYXRlZEF0OiBVUERBVEVEX0FUX0FUVCxcbn07XG5cbmNvbnN0IFBBUlNFX09CSkVDVF9GSUVMRFMgPSB7XG4gIC4uLkNSRUFURV9SRVNVTFRfRklFTERTLFxuICAuLi5VUERBVEVfUkVTVUxUX0ZJRUxEUyxcbiAgLi4uSU5QVVRfRklFTERTLFxuICBBQ0w6IHtcbiAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoQUNMKSxcbiAgICByZXNvbHZlOiAoeyBBQ0wgfSkgPT4gKEFDTCA/IEFDTCA6IHsgJyonOiB7IHJlYWQ6IHRydWUsIHdyaXRlOiB0cnVlIH0gfSksXG4gIH0sXG59O1xuXG5jb25zdCBQQVJTRV9PQkpFQ1QgPSBuZXcgR3JhcGhRTEludGVyZmFjZVR5cGUoe1xuICBuYW1lOiAnUGFyc2VPYmplY3QnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFBhcnNlT2JqZWN0IGludGVyZmFjZSB0eXBlIGlzIHVzZWQgYXMgYSBiYXNlIHR5cGUgZm9yIHRoZSBhdXRvIGdlbmVyYXRlZCBvYmplY3QgdHlwZXMuJyxcbiAgZmllbGRzOiBQQVJTRV9PQkpFQ1RfRklFTERTLFxufSk7XG5cbmNvbnN0IFNFU1NJT05fVE9LRU5fQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoZSBjdXJyZW50IHVzZXIgc2Vzc2lvbiB0b2tlbi4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG59O1xuXG5jb25zdCBSRUFEX1BSRUZFUkVOQ0UgPSBuZXcgR3JhcGhRTEVudW1UeXBlKHtcbiAgbmFtZTogJ1JlYWRQcmVmZXJlbmNlJyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBSZWFkUHJlZmVyZW5jZSBlbnVtIHR5cGUgaXMgdXNlZCBpbiBxdWVyaWVzIGluIG9yZGVyIHRvIHNlbGVjdCBpbiB3aGljaCBkYXRhYmFzZSByZXBsaWNhIHRoZSBvcGVyYXRpb24gbXVzdCBydW4uJyxcbiAgdmFsdWVzOiB7XG4gICAgUFJJTUFSWTogeyB2YWx1ZTogJ1BSSU1BUlknIH0sXG4gICAgUFJJTUFSWV9QUkVGRVJSRUQ6IHsgdmFsdWU6ICdQUklNQVJZX1BSRUZFUlJFRCcgfSxcbiAgICBTRUNPTkRBUlk6IHsgdmFsdWU6ICdTRUNPTkRBUlknIH0sXG4gICAgU0VDT05EQVJZX1BSRUZFUlJFRDogeyB2YWx1ZTogJ1NFQ09OREFSWV9QUkVGRVJSRUQnIH0sXG4gICAgTkVBUkVTVDogeyB2YWx1ZTogJ05FQVJFU1QnIH0sXG4gIH0sXG59KTtcblxuY29uc3QgUkVBRF9QUkVGRVJFTkNFX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGUgcmVhZCBwcmVmZXJlbmNlIGZvciB0aGUgbWFpbiBxdWVyeSB0byBiZSBleGVjdXRlZC4nLFxuICB0eXBlOiBSRUFEX1BSRUZFUkVOQ0UsXG59O1xuXG5jb25zdCBJTkNMVURFX1JFQURfUFJFRkVSRU5DRV9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhlIHJlYWQgcHJlZmVyZW5jZSBmb3IgdGhlIHF1ZXJpZXMgdG8gYmUgZXhlY3V0ZWQgdG8gaW5jbHVkZSBmaWVsZHMuJyxcbiAgdHlwZTogUkVBRF9QUkVGRVJFTkNFLFxufTtcblxuY29uc3QgU1VCUVVFUllfUkVBRF9QUkVGRVJFTkNFX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGUgcmVhZCBwcmVmZXJlbmNlIGZvciB0aGUgc3VicXVlcmllcyB0aGF0IG1heSBiZSByZXF1aXJlZC4nLFxuICB0eXBlOiBSRUFEX1BSRUZFUkVOQ0UsXG59O1xuXG5jb25zdCBSRUFEX09QVElPTlNfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdSZWFkT3B0aW9uc0lucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBSZWFkT3B0aW9uc0lucHV0dCB0eXBlIGlzIHVzZWQgaW4gcXVlcmllcyBpbiBvcmRlciB0byBzZXQgdGhlIHJlYWQgcHJlZmVyZW5jZXMuJyxcbiAgZmllbGRzOiB7XG4gICAgcmVhZFByZWZlcmVuY2U6IFJFQURfUFJFRkVSRU5DRV9BVFQsXG4gICAgaW5jbHVkZVJlYWRQcmVmZXJlbmNlOiBJTkNMVURFX1JFQURfUFJFRkVSRU5DRV9BVFQsXG4gICAgc3VicXVlcnlSZWFkUHJlZmVyZW5jZTogU1VCUVVFUllfUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgfSxcbn0pO1xuXG5jb25zdCBSRUFEX09QVElPTlNfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoZSByZWFkIG9wdGlvbnMgZm9yIHRoZSBxdWVyeSB0byBiZSBleGVjdXRlZC4nLFxuICB0eXBlOiBSRUFEX09QVElPTlNfSU5QVVQsXG59O1xuXG5jb25zdCBXSEVSRV9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhlc2UgYXJlIHRoZSBjb25kaXRpb25zIHRoYXQgdGhlIG9iamVjdHMgbmVlZCB0byBtYXRjaCBpbiBvcmRlciB0byBiZSBmb3VuZCcsXG4gIHR5cGU6IE9CSkVDVCxcbn07XG5cbmNvbnN0IFNLSVBfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG51bWJlciBvZiBvYmplY3RzIHRoYXQgbXVzdCBiZSBza2lwcGVkIHRvIHJldHVybi4nLFxuICB0eXBlOiBHcmFwaFFMSW50LFxufTtcblxuY29uc3QgTElNSVRfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGxpbWl0IG51bWJlciBvZiBvYmplY3RzIHRoYXQgbXVzdCBiZSByZXR1cm5lZC4nLFxuICB0eXBlOiBHcmFwaFFMSW50LFxufTtcblxuY29uc3QgQ09VTlRfQVRUID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgdG90YWwgbWF0Y2hlZCBvYmplY3MgY291bnQgdGhhdCBpcyByZXR1cm5lZCB3aGVuIHRoZSBjb3VudCBmbGFnIGlzIHNldC4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEludCksXG59O1xuXG5jb25zdCBTRUFSQ0hfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdTZWFyY2hJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnVGhlIFNlYXJjaElucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZpeSBhIHNlYXJjaCBvcGVyYXRpb24gb24gYSBmdWxsIHRleHQgc2VhcmNoLicsXG4gIGZpZWxkczoge1xuICAgIHRlcm06IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdGVybSB0byBiZSBzZWFyY2hlZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgIH0sXG4gICAgbGFuZ3VhZ2U6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgbGFuZ3VhZ2UgdG8gdGV0ZXJtaW5lIHRoZSBsaXN0IG9mIHN0b3Agd29yZHMgYW5kIHRoZSBydWxlcyBmb3IgdG9rZW5pemVyLicsXG4gICAgICB0eXBlOiBHcmFwaFFMU3RyaW5nLFxuICAgIH0sXG4gICAgY2FzZVNlbnNpdGl2ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBmbGFnIHRvIGVuYWJsZSBvciBkaXNhYmxlIGNhc2Ugc2Vuc2l0aXZlIHNlYXJjaC4nLFxuICAgICAgdHlwZTogR3JhcGhRTEJvb2xlYW4sXG4gICAgfSxcbiAgICBkaWFjcml0aWNTZW5zaXRpdmU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZmxhZyB0byBlbmFibGUgb3IgZGlzYWJsZSBkaWFjcml0aWMgc2Vuc2l0aXZlIHNlYXJjaC4nLFxuICAgICAgdHlwZTogR3JhcGhRTEJvb2xlYW4sXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBURVhUX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnVGV4dElucHV0JyxcbiAgZGVzY3JpcHRpb246ICdUaGUgVGV4dElucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGEgdGV4dCBvcGVyYXRpb24gb24gYSBjb25zdHJhaW50LicsXG4gIGZpZWxkczoge1xuICAgIHNlYXJjaDoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBzZWFyY2ggdG8gYmUgZXhlY3V0ZWQuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChTRUFSQ0hfSU5QVVQpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgQk9YX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnQm94SW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBCb3hJbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmaXkgYSBib3ggb3BlcmF0aW9uIG9uIGEgd2l0aGluIGdlbyBxdWVyeS4nLFxuICBmaWVsZHM6IHtcbiAgICBib3R0b21MZWZ0OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGJvdHRvbSBsZWZ0IGNvb3JkaW5hdGVzIG9mIHRoZSBib3guJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHRU9fUE9JTlRfSU5QVVQpLFxuICAgIH0sXG4gICAgdXBwZXJSaWdodDoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB1cHBlciByaWdodCBjb29yZGluYXRlcyBvZiB0aGUgYm94LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR0VPX1BPSU5UX0lOUFVUKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFdJVEhJTl9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1dpdGhpbklucHV0JyxcbiAgZGVzY3JpcHRpb246ICdUaGUgV2l0aGluSW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYSB3aXRoaW4gb3BlcmF0aW9uIG9uIGEgY29uc3RyYWludC4nLFxuICBmaWVsZHM6IHtcbiAgICBib3g6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgYm94IHRvIGJlIHNwZWNpZmllZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEJPWF9JTlBVVCksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBDRU5URVJfU1BIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnQ2VudGVyU3BoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIENlbnRlclNwaGVyZUlucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZpeSBhIGNlbnRlclNwaGVyZSBvcGVyYXRpb24gb24gYSBnZW9XaXRoaW4gcXVlcnkuJyxcbiAgZmllbGRzOiB7XG4gICAgY2VudGVyOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGNlbnRlciBvZiB0aGUgc3BoZXJlLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR0VPX1BPSU5UX0lOUFVUKSxcbiAgICB9LFxuICAgIGRpc3RhbmNlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHJhZGl1cyBvZiB0aGUgc3BoZXJlLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEZsb2F0KSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IEdFT19XSVRISU5fSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdHZW9XaXRoaW5JbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnVGhlIEdlb1dpdGhpbklucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGEgZ2VvV2l0aGluIG9wZXJhdGlvbiBvbiBhIGNvbnN0cmFpbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgcG9seWdvbjoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBwb2x5Z29uIHRvIGJlIHNwZWNpZmllZC4nLFxuICAgICAgdHlwZTogUE9MWUdPTl9JTlBVVCxcbiAgICB9LFxuICAgIGNlbnRlclNwaGVyZToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBzcGhlcmUgdG8gYmUgc3BlY2lmaWVkLicsXG4gICAgICB0eXBlOiBDRU5URVJfU1BIRVJFX0lOUFVULFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgR0VPX0lOVEVSU0VDVFNfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdHZW9JbnRlcnNlY3RzSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEdlb0ludGVyc2VjdHNJbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmeSBhIGdlb0ludGVyc2VjdHMgb3BlcmF0aW9uIG9uIGEgY29uc3RyYWludC4nLFxuICBmaWVsZHM6IHtcbiAgICBwb2ludDoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBwb2ludCB0byBiZSBzcGVjaWZpZWQuJyxcbiAgICAgIHR5cGU6IEdFT19QT0lOVF9JTlBVVCxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IGVxdWFsVG8gPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBlcXVhbFRvIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBlcXVhbHMgdG8gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBub3RFcXVhbFRvID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgbm90RXF1YWxUbyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgZG8gbm90IGVxdWFsIHRvIGEgc3BlY2lmaWVkIHZhbHVlLicsXG4gIHR5cGUsXG59KTtcblxuY29uc3QgbGVzc1RoYW4gPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBsZXNzVGhhbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgaXMgbGVzcyB0aGFuIGEgc3BlY2lmaWVkIHZhbHVlLicsXG4gIHR5cGUsXG59KTtcblxuY29uc3QgbGVzc1RoYW5PckVxdWFsVG8gPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBsZXNzVGhhbk9yRXF1YWxUbyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgaXMgbGVzcyB0aGFuIG9yIGVxdWFsIHRvIGEgc3BlY2lmaWVkIHZhbHVlLicsXG4gIHR5cGUsXG59KTtcblxuY29uc3QgZ3JlYXRlclRoYW4gPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBncmVhdGVyVGhhbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgaXMgZ3JlYXRlciB0aGFuIGEgc3BlY2lmaWVkIHZhbHVlLicsXG4gIHR5cGUsXG59KTtcblxuY29uc3QgZ3JlYXRlclRoYW5PckVxdWFsVG8gPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBncmVhdGVyVGhhbk9yRXF1YWxUbyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgaXMgZ3JlYXRlciB0aGFuIG9yIGVxdWFsIHRvIGEgc3BlY2lmaWVkIHZhbHVlLicsXG4gIHR5cGUsXG59KTtcblxuY29uc3QgaW5PcCA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGluIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBlcXVhbHMgYW55IHZhbHVlIGluIHRoZSBzcGVjaWZpZWQgYXJyYXkuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KHR5cGUpLFxufSk7XG5cbmNvbnN0IG5vdEluID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgbm90SW4gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGRvIG5vdCBlcXVhbCBhbnkgdmFsdWUgaW4gdGhlIHNwZWNpZmllZCBhcnJheS4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTExpc3QodHlwZSksXG59KTtcblxuY29uc3QgZXhpc3RzID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgZXhpc3RzIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSBhIGZpZWxkIGV4aXN0cyAob3IgZG8gbm90IGV4aXN0KS4nLFxuICB0eXBlOiBHcmFwaFFMQm9vbGVhbixcbn07XG5cbmNvbnN0IG1hdGNoZXNSZWdleCA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIG1hdGNoZXNSZWdleCBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgbWF0Y2hlcyBhIHNwZWNpZmllZCByZWd1bGFyIGV4cHJlc3Npb24uJyxcbiAgdHlwZTogR3JhcGhRTFN0cmluZyxcbn07XG5cbmNvbnN0IG9wdGlvbnMgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBvcHRpb25zIG9wZXJhdG9yIHRvIHNwZWNpZnkgb3B0aW9uYWwgZmxhZ3MgKHN1Y2ggYXMgXCJpXCIgYW5kIFwibVwiKSB0byBiZSBhZGRlZCB0byBhIG1hdGNoZXNSZWdleCBvcGVyYXRpb24gaW4gdGhlIHNhbWUgc2V0IG9mIGNvbnN0cmFpbnRzLicsXG4gIHR5cGU6IEdyYXBoUUxTdHJpbmcsXG59O1xuXG5jb25zdCBTVUJRVUVSWV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1N1YnF1ZXJ5SW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBTdWJxdWVyeUlucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGEgc3ViIHF1ZXJ5IHRvIGFub3RoZXIgY2xhc3MuJyxcbiAgZmllbGRzOiB7XG4gICAgY2xhc3NOYW1lOiBDTEFTU19OQU1FX0FUVCxcbiAgICB3aGVyZTogT2JqZWN0LmFzc2lnbih7fSwgV0hFUkVfQVRULCB7XG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoV0hFUkVfQVRULnR5cGUpLFxuICAgIH0pLFxuICB9LFxufSk7XG5cbmNvbnN0IFNFTEVDVF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1NlbGVjdElucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBTZWxlY3RJbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmeSBhbiBpblF1ZXJ5S2V5IG9yIGEgbm90SW5RdWVyeUtleSBvcGVyYXRpb24gb24gYSBjb25zdHJhaW50LicsXG4gIGZpZWxkczoge1xuICAgIHF1ZXJ5OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHN1YnF1ZXJ5IHRvIGJlIGV4ZWN1dGVkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoU1VCUVVFUllfSU5QVVQpLFxuICAgIH0sXG4gICAga2V5OiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGtleSBpbiB0aGUgcmVzdWx0IG9mIHRoZSBzdWJxdWVyeSB0aGF0IG11c3QgbWF0Y2ggKG5vdCBtYXRjaCkgdGhlIGZpZWxkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBpblF1ZXJ5S2V5ID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgaW5RdWVyeUtleSBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgYSBmaWVsZCBlcXVhbHMgdG8gYSBrZXkgaW4gdGhlIHJlc3VsdCBvZiBhIGRpZmZlcmVudCBxdWVyeS4nLFxuICB0eXBlOiBTRUxFQ1RfSU5QVVQsXG59O1xuXG5jb25zdCBub3RJblF1ZXJ5S2V5ID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgbm90SW5RdWVyeUtleSBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgYSBmaWVsZCBkbyBub3QgZXF1YWwgdG8gYSBrZXkgaW4gdGhlIHJlc3VsdCBvZiBhIGRpZmZlcmVudCBxdWVyeS4nLFxuICB0eXBlOiBTRUxFQ1RfSU5QVVQsXG59O1xuXG5jb25zdCBJRF9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0lkV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgSWRXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhbiBpZC4nLFxuICBmaWVsZHM6IHtcbiAgICBlcXVhbFRvOiBlcXVhbFRvKEdyYXBoUUxJRCksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhHcmFwaFFMSUQpLFxuICAgIGxlc3NUaGFuOiBsZXNzVGhhbihHcmFwaFFMSUQpLFxuICAgIGxlc3NUaGFuT3JFcXVhbFRvOiBsZXNzVGhhbk9yRXF1YWxUbyhHcmFwaFFMSUQpLFxuICAgIGdyZWF0ZXJUaGFuOiBncmVhdGVyVGhhbihHcmFwaFFMSUQpLFxuICAgIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiBncmVhdGVyVGhhbk9yRXF1YWxUbyhHcmFwaFFMSUQpLFxuICAgIGluOiBpbk9wKEdyYXBoUUxJRCksXG4gICAgbm90SW46IG5vdEluKEdyYXBoUUxJRCksXG4gICAgZXhpc3RzLFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBTVFJJTkdfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdTdHJpbmdXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBTdHJpbmdXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgU3RyaW5nLicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oR3JhcGhRTFN0cmluZyksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhHcmFwaFFMU3RyaW5nKSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oR3JhcGhRTFN0cmluZyksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKEdyYXBoUUxTdHJpbmcpLFxuICAgIGdyZWF0ZXJUaGFuOiBncmVhdGVyVGhhbihHcmFwaFFMU3RyaW5nKSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oR3JhcGhRTFN0cmluZyksXG4gICAgaW46IGluT3AoR3JhcGhRTFN0cmluZyksXG4gICAgbm90SW46IG5vdEluKEdyYXBoUUxTdHJpbmcpLFxuICAgIGV4aXN0cyxcbiAgICBtYXRjaGVzUmVnZXgsXG4gICAgb3B0aW9ucyxcbiAgICB0ZXh0OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlICR0ZXh0IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBmdWxsIHRleHQgc2VhcmNoIGNvbnN0cmFpbnQuJyxcbiAgICAgIHR5cGU6IFRFWFRfSU5QVVQsXG4gICAgfSxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgTlVNQkVSX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnTnVtYmVyV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgTnVtYmVyV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIE51bWJlci4nLFxuICBmaWVsZHM6IHtcbiAgICBlcXVhbFRvOiBlcXVhbFRvKEdyYXBoUUxGbG9hdCksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhHcmFwaFFMRmxvYXQpLFxuICAgIGxlc3NUaGFuOiBsZXNzVGhhbihHcmFwaFFMRmxvYXQpLFxuICAgIGxlc3NUaGFuT3JFcXVhbFRvOiBsZXNzVGhhbk9yRXF1YWxUbyhHcmFwaFFMRmxvYXQpLFxuICAgIGdyZWF0ZXJUaGFuOiBncmVhdGVyVGhhbihHcmFwaFFMRmxvYXQpLFxuICAgIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiBncmVhdGVyVGhhbk9yRXF1YWxUbyhHcmFwaFFMRmxvYXQpLFxuICAgIGluOiBpbk9wKEdyYXBoUUxGbG9hdCksXG4gICAgbm90SW46IG5vdEluKEdyYXBoUUxGbG9hdCksXG4gICAgZXhpc3RzLFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBCT09MRUFOX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnQm9vbGVhbldoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEJvb2xlYW5XaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgQm9vbGVhbi4nLFxuICBmaWVsZHM6IHtcbiAgICBlcXVhbFRvOiBlcXVhbFRvKEdyYXBoUUxCb29sZWFuKSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKEdyYXBoUUxCb29sZWFuKSxcbiAgICBleGlzdHMsXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IEFSUkFZX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnQXJyYXlXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBBcnJheVdoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBBcnJheS4nLFxuICBmaWVsZHM6IHtcbiAgICBlcXVhbFRvOiBlcXVhbFRvKEFOWSksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhBTlkpLFxuICAgIGxlc3NUaGFuOiBsZXNzVGhhbihBTlkpLFxuICAgIGxlc3NUaGFuT3JFcXVhbFRvOiBsZXNzVGhhbk9yRXF1YWxUbyhBTlkpLFxuICAgIGdyZWF0ZXJUaGFuOiBncmVhdGVyVGhhbihBTlkpLFxuICAgIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiBncmVhdGVyVGhhbk9yRXF1YWxUbyhBTlkpLFxuICAgIGluOiBpbk9wKEFOWSksXG4gICAgbm90SW46IG5vdEluKEFOWSksXG4gICAgZXhpc3RzLFxuICAgIGNvbnRhaW5lZEJ5OiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGNvbnRhaW5lZEJ5IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGFuIGFycmF5IGZpZWxkIGlzIGNvbnRhaW5lZCBieSBhbm90aGVyIHNwZWNpZmllZCBhcnJheS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KEFOWSksXG4gICAgfSxcbiAgICBjb250YWluczoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBjb250YWlucyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhbiBhcnJheSBmaWVsZCBjb250YWluIGFsbCBlbGVtZW50cyBvZiBhbm90aGVyIHNwZWNpZmllZCBhcnJheS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KEFOWSksXG4gICAgfSxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgS0VZX1ZBTFVFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnS2V5VmFsdWVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnQW4gZW50cnkgZnJvbSBhbiBvYmplY3QsIGkuZS4sIGEgcGFpciBvZiBrZXkgYW5kIHZhbHVlLicsXG4gIGZpZWxkczoge1xuICAgIGtleToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGUga2V5IHVzZWQgdG8gcmV0cmlldmUgdGhlIHZhbHVlIG9mIHRoaXMgZW50cnkuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICB9LFxuICAgIHZhbHVlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSB2YWx1ZSBvZiB0aGUgZW50cnkuIENvdWxkIGJlIGFueSB0eXBlIG9mIHNjYWxhciBkYXRhLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoQU5ZKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IE9CSkVDVF9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ09iamVjdFdoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIE9iamVjdFdoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyByZXN1bHQgYnkgYSBmaWVsZCBvZiB0eXBlIE9iamVjdC4nLFxuICBmaWVsZHM6IHtcbiAgICBlcXVhbFRvOiBlcXVhbFRvKEtFWV9WQUxVRV9JTlBVVCksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhLRVlfVkFMVUVfSU5QVVQpLFxuICAgIGluOiBpbk9wKEtFWV9WQUxVRV9JTlBVVCksXG4gICAgbm90SW46IG5vdEluKEtFWV9WQUxVRV9JTlBVVCksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKEtFWV9WQUxVRV9JTlBVVCksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKEtFWV9WQUxVRV9JTlBVVCksXG4gICAgZ3JlYXRlclRoYW46IGdyZWF0ZXJUaGFuKEtFWV9WQUxVRV9JTlBVVCksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKEtFWV9WQUxVRV9JTlBVVCksXG4gICAgZXhpc3RzLFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBEQVRFX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnRGF0ZVdoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIERhdGVXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgRGF0ZS4nLFxuICBmaWVsZHM6IHtcbiAgICBlcXVhbFRvOiBlcXVhbFRvKERBVEUpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oREFURSksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKERBVEUpLFxuICAgIGxlc3NUaGFuT3JFcXVhbFRvOiBsZXNzVGhhbk9yRXF1YWxUbyhEQVRFKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oREFURSksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKERBVEUpLFxuICAgIGluOiBpbk9wKERBVEUpLFxuICAgIG5vdEluOiBub3RJbihEQVRFKSxcbiAgICBleGlzdHMsXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IEJZVEVTX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnQnl0ZXNXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBCeXRlc1doZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBCeXRlcy4nLFxuICBmaWVsZHM6IHtcbiAgICBlcXVhbFRvOiBlcXVhbFRvKEJZVEVTKSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKEJZVEVTKSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oQllURVMpLFxuICAgIGxlc3NUaGFuT3JFcXVhbFRvOiBsZXNzVGhhbk9yRXF1YWxUbyhCWVRFUyksXG4gICAgZ3JlYXRlclRoYW46IGdyZWF0ZXJUaGFuKEJZVEVTKSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oQllURVMpLFxuICAgIGluOiBpbk9wKEJZVEVTKSxcbiAgICBub3RJbjogbm90SW4oQllURVMpLFxuICAgIGV4aXN0cyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgRklMRV9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0ZpbGVXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBGaWxlV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIEZpbGUuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhGSUxFKSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKEZJTEUpLFxuICAgIGxlc3NUaGFuOiBsZXNzVGhhbihGSUxFKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oRklMRSksXG4gICAgZ3JlYXRlclRoYW46IGdyZWF0ZXJUaGFuKEZJTEUpLFxuICAgIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiBncmVhdGVyVGhhbk9yRXF1YWxUbyhGSUxFKSxcbiAgICBpbjogaW5PcChGSUxFKSxcbiAgICBub3RJbjogbm90SW4oRklMRSksXG4gICAgZXhpc3RzLFxuICAgIG1hdGNoZXNSZWdleCxcbiAgICBvcHRpb25zLFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBHRU9fUE9JTlRfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdHZW9Qb2ludFdoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEdlb1BvaW50V2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIEdlb1BvaW50LicsXG4gIGZpZWxkczoge1xuICAgIGV4aXN0cyxcbiAgICBuZWFyU3BoZXJlOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIG5lYXJTcGhlcmUgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBnZW8gcG9pbnQgZmllbGQgaXMgbmVhciB0byBhbm90aGVyIGdlbyBwb2ludC4nLFxuICAgICAgdHlwZTogR0VPX1BPSU5UX0lOUFVULFxuICAgIH0sXG4gICAgbWF4RGlzdGFuY2U6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgbWF4RGlzdGFuY2Ugb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBnZW8gcG9pbnQgZmllbGQgaXMgYXQgYSBtYXggZGlzdGFuY2UgKGluIHJhZGlhbnMpIGZyb20gdGhlIGdlbyBwb2ludCBzcGVjaWZpZWQgaW4gdGhlICRuZWFyU3BoZXJlIG9wZXJhdG9yLicsXG4gICAgICB0eXBlOiBHcmFwaFFMRmxvYXQsXG4gICAgfSxcbiAgICBtYXhEaXN0YW5jZUluUmFkaWFuczoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBtYXhEaXN0YW5jZUluUmFkaWFucyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyBhdCBhIG1heCBkaXN0YW5jZSAoaW4gcmFkaWFucykgZnJvbSB0aGUgZ2VvIHBvaW50IHNwZWNpZmllZCBpbiB0aGUgJG5lYXJTcGhlcmUgb3BlcmF0b3IuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxGbG9hdCxcbiAgICB9LFxuICAgIG1heERpc3RhbmNlSW5NaWxlczoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBtYXhEaXN0YW5jZUluTWlsZXMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBnZW8gcG9pbnQgZmllbGQgaXMgYXQgYSBtYXggZGlzdGFuY2UgKGluIG1pbGVzKSBmcm9tIHRoZSBnZW8gcG9pbnQgc3BlY2lmaWVkIGluIHRoZSAkbmVhclNwaGVyZSBvcGVyYXRvci4nLFxuICAgICAgdHlwZTogR3JhcGhRTEZsb2F0LFxuICAgIH0sXG4gICAgbWF4RGlzdGFuY2VJbktpbG9tZXRlcnM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgbWF4RGlzdGFuY2VJbktpbG9tZXRlcnMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBnZW8gcG9pbnQgZmllbGQgaXMgYXQgYSBtYXggZGlzdGFuY2UgKGluIGtpbG9tZXRlcnMpIGZyb20gdGhlIGdlbyBwb2ludCBzcGVjaWZpZWQgaW4gdGhlICRuZWFyU3BoZXJlIG9wZXJhdG9yLicsXG4gICAgICB0eXBlOiBHcmFwaFFMRmxvYXQsXG4gICAgfSxcbiAgICB3aXRoaW46IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgd2l0aGluIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIHdpdGhpbiBhIHNwZWNpZmllZCBib3guJyxcbiAgICAgIHR5cGU6IFdJVEhJTl9JTlBVVCxcbiAgICB9LFxuICAgIGdlb1dpdGhpbjoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBnZW9XaXRoaW4gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBnZW8gcG9pbnQgZmllbGQgaXMgd2l0aGluIGEgc3BlY2lmaWVkIHBvbHlnb24gb3Igc3BoZXJlLicsXG4gICAgICB0eXBlOiBHRU9fV0lUSElOX0lOUFVULFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgUE9MWUdPTl9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1BvbHlnb25XaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBQb2x5Z29uV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIFBvbHlnb24uJyxcbiAgZmllbGRzOiB7XG4gICAgZXhpc3RzLFxuICAgIGdlb0ludGVyc2VjdHM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgZ2VvSW50ZXJzZWN0cyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIHBvbHlnb24gZmllbGQgaW50ZXJzZWN0IGEgc3BlY2lmaWVkIHBvaW50LicsXG4gICAgICB0eXBlOiBHRU9fSU5URVJTRUNUU19JTlBVVCxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IEVMRU1FTlQgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnRWxlbWVudCcsXG4gIGRlc2NyaXB0aW9uOiBcIlRoZSBFbGVtZW50IG9iamVjdCB0eXBlIGlzIHVzZWQgdG8gcmV0dXJuIGFycmF5IGl0ZW1zJyB2YWx1ZS5cIixcbiAgZmllbGRzOiB7XG4gICAgdmFsdWU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnUmV0dXJuIHRoZSB2YWx1ZSBvZiB0aGUgZWxlbWVudCBpbiB0aGUgYXJyYXknLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEFOWSksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG4vLyBEZWZhdWx0IHN0YXRpYyB1bmlvbiB0eXBlLCB3ZSB1cGRhdGUgdHlwZXMgYW5kIHJlc29sdmVUeXBlIGZ1bmN0aW9uIGxhdGVyXG5sZXQgQVJSQVlfUkVTVUxUO1xuXG5jb25zdCBsb2FkQXJyYXlSZXN1bHQgPSAocGFyc2VHcmFwaFFMU2NoZW1hLCBwYXJzZUNsYXNzZXNBcnJheSkgPT4ge1xuICBjb25zdCBjbGFzc1R5cGVzID0gcGFyc2VDbGFzc2VzQXJyYXlcbiAgICAuZmlsdGVyKHBhcnNlQ2xhc3MgPT5cbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbcGFyc2VDbGFzcy5jbGFzc05hbWVdLmNsYXNzR3JhcGhRTE91dHB1dFR5cGUgPyB0cnVlIDogZmFsc2VcbiAgICApXG4gICAgLm1hcChcbiAgICAgIHBhcnNlQ2xhc3MgPT4gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1twYXJzZUNsYXNzLmNsYXNzTmFtZV0uY2xhc3NHcmFwaFFMT3V0cHV0VHlwZVxuICAgICk7XG4gIEFSUkFZX1JFU1VMVCA9IG5ldyBHcmFwaFFMVW5pb25UeXBlKHtcbiAgICBuYW1lOiAnQXJyYXlSZXN1bHQnLFxuICAgIGRlc2NyaXB0aW9uOlxuICAgICAgJ1VzZSBJbmxpbmUgRnJhZ21lbnQgb24gQXJyYXkgdG8gZ2V0IHJlc3VsdHM6IGh0dHBzOi8vZ3JhcGhxbC5vcmcvbGVhcm4vcXVlcmllcy8jaW5saW5lLWZyYWdtZW50cycsXG4gICAgdHlwZXM6ICgpID0+IFtFTEVNRU5ULCAuLi5jbGFzc1R5cGVzXSxcbiAgICByZXNvbHZlVHlwZTogdmFsdWUgPT4ge1xuICAgICAgaWYgKHZhbHVlLl9fdHlwZSA9PT0gJ09iamVjdCcgJiYgdmFsdWUuY2xhc3NOYW1lICYmIHZhbHVlLm9iamVjdElkKSB7XG4gICAgICAgIGlmIChwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW3ZhbHVlLmNsYXNzTmFtZV0pIHtcbiAgICAgICAgICByZXR1cm4gcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1t2YWx1ZS5jbGFzc05hbWVdLmNsYXNzR3JhcGhRTE91dHB1dFR5cGUubmFtZTtcbiAgICAgICAgfSBlbHNlIHtcbiAgICAgICAgICByZXR1cm4gRUxFTUVOVC5uYW1lO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gRUxFTUVOVC5uYW1lO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goQVJSQVlfUkVTVUxUKTtcbn07XG5cbmNvbnN0IGxvYWQgPSBwYXJzZUdyYXBoUUxTY2hlbWEgPT4ge1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR3JhcGhRTFVwbG9hZCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShBTlksIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoT0JKRUNULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKERBVEUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQllURVMsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoRklMRSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShGSUxFX0lORk8sIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoRklMRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShHRU9fUE9JTlRfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR0VPX1BPSU5ULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFBBUlNFX09CSkVDVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShSRUFEX1BSRUZFUkVOQ0UsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUkVBRF9PUFRJT05TX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFNFQVJDSF9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShURVhUX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEJPWF9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShXSVRISU5fSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQ0VOVEVSX1NQSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShHRU9fV0lUSElOX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEdFT19JTlRFUlNFQ1RTX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKElEX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFNUUklOR19XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShOVU1CRVJfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQk9PTEVBTl9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShBUlJBWV9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShLRVlfVkFMVUVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoT0JKRUNUX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKERBVEVfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQllURVNfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoRklMRV9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShHRU9fUE9JTlRfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUE9MWUdPTl9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShFTEVNRU5ULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEFDTF9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShVU0VSX0FDTF9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShST0xFX0FDTF9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShQVUJMSUNfQUNMX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEFDTCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShVU0VSX0FDTCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShST0xFX0FDTCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShQVUJMSUNfQUNMLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFNVQlFVRVJZX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFNFTEVDVF9JTlBVVCwgdHJ1ZSk7XG59O1xuXG5leHBvcnQge1xuICBHcmFwaFFMVXBsb2FkLFxuICBUeXBlVmFsaWRhdGlvbkVycm9yLFxuICBwYXJzZVN0cmluZ1ZhbHVlLFxuICBwYXJzZUludFZhbHVlLFxuICBwYXJzZUZsb2F0VmFsdWUsXG4gIHBhcnNlQm9vbGVhblZhbHVlLFxuICBwYXJzZVZhbHVlLFxuICBwYXJzZUxpc3RWYWx1ZXMsXG4gIHBhcnNlT2JqZWN0RmllbGRzLFxuICBBTlksXG4gIE9CSkVDVCxcbiAgcGFyc2VEYXRlSXNvVmFsdWUsXG4gIHNlcmlhbGl6ZURhdGVJc28sXG4gIERBVEUsXG4gIEJZVEVTLFxuICBwYXJzZUZpbGVWYWx1ZSxcbiAgU1VCUVVFUllfSU5QVVQsXG4gIFNFTEVDVF9JTlBVVCxcbiAgRklMRSxcbiAgRklMRV9JTkZPLFxuICBGSUxFX0lOUFVULFxuICBHRU9fUE9JTlRfRklFTERTLFxuICBHRU9fUE9JTlRfSU5QVVQsXG4gIEdFT19QT0lOVCxcbiAgUE9MWUdPTl9JTlBVVCxcbiAgUE9MWUdPTixcbiAgT0JKRUNUX0lELFxuICBDTEFTU19OQU1FX0FUVCxcbiAgR0xPQkFMX09SX09CSkVDVF9JRF9BVFQsXG4gIE9CSkVDVF9JRF9BVFQsXG4gIFVQREFURURfQVRfQVRULFxuICBDUkVBVEVEX0FUX0FUVCxcbiAgSU5QVVRfRklFTERTLFxuICBDUkVBVEVfUkVTVUxUX0ZJRUxEUyxcbiAgVVBEQVRFX1JFU1VMVF9GSUVMRFMsXG4gIFBBUlNFX09CSkVDVF9GSUVMRFMsXG4gIFBBUlNFX09CSkVDVCxcbiAgU0VTU0lPTl9UT0tFTl9BVFQsXG4gIFJFQURfUFJFRkVSRU5DRSxcbiAgUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRULFxuICBTVUJRVUVSWV9SRUFEX1BSRUZFUkVOQ0VfQVRULFxuICBSRUFEX09QVElPTlNfSU5QVVQsXG4gIFJFQURfT1BUSU9OU19BVFQsXG4gIFdIRVJFX0FUVCxcbiAgU0tJUF9BVFQsXG4gIExJTUlUX0FUVCxcbiAgQ09VTlRfQVRULFxuICBTRUFSQ0hfSU5QVVQsXG4gIFRFWFRfSU5QVVQsXG4gIEJPWF9JTlBVVCxcbiAgV0lUSElOX0lOUFVULFxuICBDRU5URVJfU1BIRVJFX0lOUFVULFxuICBHRU9fV0lUSElOX0lOUFVULFxuICBHRU9fSU5URVJTRUNUU19JTlBVVCxcbiAgZXF1YWxUbyxcbiAgbm90RXF1YWxUbyxcbiAgbGVzc1RoYW4sXG4gIGxlc3NUaGFuT3JFcXVhbFRvLFxuICBncmVhdGVyVGhhbixcbiAgZ3JlYXRlclRoYW5PckVxdWFsVG8sXG4gIGluT3AsXG4gIG5vdEluLFxuICBleGlzdHMsXG4gIG1hdGNoZXNSZWdleCxcbiAgb3B0aW9ucyxcbiAgaW5RdWVyeUtleSxcbiAgbm90SW5RdWVyeUtleSxcbiAgSURfV0hFUkVfSU5QVVQsXG4gIFNUUklOR19XSEVSRV9JTlBVVCxcbiAgTlVNQkVSX1dIRVJFX0lOUFVULFxuICBCT09MRUFOX1dIRVJFX0lOUFVULFxuICBBUlJBWV9XSEVSRV9JTlBVVCxcbiAgS0VZX1ZBTFVFX0lOUFVULFxuICBPQkpFQ1RfV0hFUkVfSU5QVVQsXG4gIERBVEVfV0hFUkVfSU5QVVQsXG4gIEJZVEVTX1dIRVJFX0lOUFVULFxuICBGSUxFX1dIRVJFX0lOUFVULFxuICBHRU9fUE9JTlRfV0hFUkVfSU5QVVQsXG4gIFBPTFlHT05fV0hFUkVfSU5QVVQsXG4gIEFSUkFZX1JFU1VMVCxcbiAgRUxFTUVOVCxcbiAgQUNMX0lOUFVULFxuICBVU0VSX0FDTF9JTlBVVCxcbiAgUk9MRV9BQ0xfSU5QVVQsXG4gIFBVQkxJQ19BQ0xfSU5QVVQsXG4gIEFDTCxcbiAgVVNFUl9BQ0wsXG4gIFJPTEVfQUNMLFxuICBQVUJMSUNfQUNMLFxuICBsb2FkLFxuICBsb2FkQXJyYXlSZXN1bHQsXG59O1xuIl0sIm1hcHBpbmdzIjoiOzs7Ozs7QUFBQSxJQUFBQSxRQUFBLEdBQUFDLE9BQUE7QUFnQkEsSUFBQUMsYUFBQSxHQUFBRCxPQUFBO0FBQTJDLFNBQUFFLFFBQUFDLE1BQUEsRUFBQUMsY0FBQSxRQUFBQyxJQUFBLEdBQUFDLE1BQUEsQ0FBQUQsSUFBQSxDQUFBRixNQUFBLE9BQUFHLE1BQUEsQ0FBQUMscUJBQUEsUUFBQUMsT0FBQSxHQUFBRixNQUFBLENBQUFDLHFCQUFBLENBQUFKLE1BQUEsR0FBQUMsY0FBQSxLQUFBSSxPQUFBLEdBQUFBLE9BQUEsQ0FBQUMsTUFBQSxXQUFBQyxHQUFBLFdBQUFKLE1BQUEsQ0FBQUssd0JBQUEsQ0FBQVIsTUFBQSxFQUFBTyxHQUFBLEVB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