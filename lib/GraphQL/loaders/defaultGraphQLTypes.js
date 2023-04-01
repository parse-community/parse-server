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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJUeXBlVmFsaWRhdGlvbkVycm9yIiwiRXJyb3IiLCJjb25zdHJ1Y3RvciIsInZhbHVlIiwidHlwZSIsInBhcnNlU3RyaW5nVmFsdWUiLCJwYXJzZUludFZhbHVlIiwiaW50IiwiTnVtYmVyIiwiaXNJbnRlZ2VyIiwicGFyc2VGbG9hdFZhbHVlIiwiZmxvYXQiLCJpc05hTiIsInBhcnNlQm9vbGVhblZhbHVlIiwicGFyc2VWYWx1ZSIsImtpbmQiLCJLaW5kIiwiU1RSSU5HIiwiSU5UIiwiRkxPQVQiLCJCT09MRUFOIiwiTElTVCIsInBhcnNlTGlzdFZhbHVlcyIsInZhbHVlcyIsIk9CSkVDVCIsInBhcnNlT2JqZWN0RmllbGRzIiwiZmllbGRzIiwiQXJyYXkiLCJpc0FycmF5IiwibWFwIiwicmVkdWNlIiwib2JqZWN0IiwiZmllbGQiLCJuYW1lIiwiQU5ZIiwiR3JhcGhRTFNjYWxhclR5cGUiLCJkZXNjcmlwdGlvbiIsInNlcmlhbGl6ZSIsInBhcnNlTGl0ZXJhbCIsImFzdCIsInBhcnNlRGF0ZUlzb1ZhbHVlIiwiZGF0ZSIsIkRhdGUiLCJzZXJpYWxpemVEYXRlSXNvIiwidG9JU09TdHJpbmciLCJwYXJzZURhdGVJc29MaXRlcmFsIiwiREFURSIsIl9fdHlwZSIsImlzbyIsImZpbmQiLCJHcmFwaFFMVXBsb2FkIiwiQllURVMiLCJiYXNlNjQiLCJwYXJzZUZpbGVWYWx1ZSIsInVybCIsInVuZGVmaW5lZCIsIkZJTEUiLCJGSUxFX0lORk8iLCJHcmFwaFFMT2JqZWN0VHlwZSIsIkdyYXBoUUxOb25OdWxsIiwiR3JhcGhRTFN0cmluZyIsIkZJTEVfSU5QVVQiLCJHcmFwaFFMSW5wdXRPYmplY3RUeXBlIiwiZmlsZSIsInVwbG9hZCIsIkdFT19QT0lOVF9GSUVMRFMiLCJsYXRpdHVkZSIsIkdyYXBoUUxGbG9hdCIsImxvbmdpdHVkZSIsIkdFT19QT0lOVF9JTlBVVCIsIkdFT19QT0lOVCIsIlBPTFlHT05fSU5QVVQiLCJHcmFwaFFMTGlzdCIsIlBPTFlHT04iLCJVU0VSX0FDTF9JTlBVVCIsInVzZXJJZCIsIkdyYXBoUUxJRCIsInJlYWQiLCJHcmFwaFFMQm9vbGVhbiIsIndyaXRlIiwiUk9MRV9BQ0xfSU5QVVQiLCJyb2xlTmFtZSIsIlBVQkxJQ19BQ0xfSU5QVVQiLCJBQ0xfSU5QVVQiLCJ1c2VycyIsInJvbGVzIiwicHVibGljIiwiVVNFUl9BQ0wiLCJST0xFX0FDTCIsIlBVQkxJQ19BQ0wiLCJBQ0wiLCJyZXNvbHZlIiwicCIsIk9iamVjdCIsImtleXMiLCJmb3JFYWNoIiwicnVsZSIsImluZGV4T2YiLCJwdXNoIiwidG9HbG9iYWxJZCIsImxlbmd0aCIsInJlcGxhY2UiLCJPQkpFQ1RfSUQiLCJDTEFTU19OQU1FX0FUVCIsIkdMT0JBTF9PUl9PQkpFQ1RfSURfQVRUIiwiT0JKRUNUX0lEX0FUVCIsIkNSRUFURURfQVRfQVRUIiwiVVBEQVRFRF9BVF9BVFQiLCJJTlBVVF9GSUVMRFMiLCJDUkVBVEVfUkVTVUxUX0ZJRUxEUyIsIm9iamVjdElkIiwiY3JlYXRlZEF0IiwiVVBEQVRFX1JFU1VMVF9GSUVMRFMiLCJ1cGRhdGVkQXQiLCJQQVJTRV9PQkpFQ1RfRklFTERTIiwiUEFSU0VfT0JKRUNUIiwiR3JhcGhRTEludGVyZmFjZVR5cGUiLCJTRVNTSU9OX1RPS0VOX0FUVCIsIlJFQURfUFJFRkVSRU5DRSIsIkdyYXBoUUxFbnVtVHlwZSIsIlBSSU1BUlkiLCJQUklNQVJZX1BSRUZFUlJFRCIsIlNFQ09OREFSWSIsIlNFQ09OREFSWV9QUkVGRVJSRUQiLCJORUFSRVNUIiwiUkVBRF9QUkVGRVJFTkNFX0FUVCIsIklOQ0xVREVfUkVBRF9QUkVGRVJFTkNFX0FUVCIsIlNVQlFVRVJZX1JFQURfUFJFRkVSRU5DRV9BVFQiLCJSRUFEX09QVElPTlNfSU5QVVQiLCJyZWFkUHJlZmVyZW5jZSIsImluY2x1ZGVSZWFkUHJlZmVyZW5jZSIsInN1YnF1ZXJ5UmVhZFByZWZlcmVuY2UiLCJSRUFEX09QVElPTlNfQVRUIiwiV0hFUkVfQVRUIiwiU0tJUF9BVFQiLCJHcmFwaFFMSW50IiwiTElNSVRfQVRUIiwiQ09VTlRfQVRUIiwiU0VBUkNIX0lOUFVUIiwidGVybSIsImxhbmd1YWdlIiwiY2FzZVNlbnNpdGl2ZSIsImRpYWNyaXRpY1NlbnNpdGl2ZSIsIlRFWFRfSU5QVVQiLCJzZWFyY2giLCJCT1hfSU5QVVQiLCJib3R0b21MZWZ0IiwidXBwZXJSaWdodCIsIldJVEhJTl9JTlBVVCIsImJveCIsIkNFTlRFUl9TUEhFUkVfSU5QVVQiLCJjZW50ZXIiLCJkaXN0YW5jZSIsIkdFT19XSVRISU5fSU5QVVQiLCJwb2x5Z29uIiwiY2VudGVyU3BoZXJlIiwiR0VPX0lOVEVSU0VDVFNfSU5QVVQiLCJwb2ludCIsImVxdWFsVG8iLCJub3RFcXVhbFRvIiwibGVzc1RoYW4iLCJsZXNzVGhhbk9yRXF1YWxUbyIsImdyZWF0ZXJUaGFuIiwiZ3JlYXRlclRoYW5PckVxdWFsVG8iLCJpbk9wIiwibm90SW4iLCJleGlzdHMiLCJtYXRjaGVzUmVnZXgiLCJvcHRpb25zIiwiU1VCUVVFUllfSU5QVVQiLCJjbGFzc05hbWUiLCJ3aGVyZSIsImFzc2lnbiIsIlNFTEVDVF9JTlBVVCIsInF1ZXJ5Iiwia2V5IiwiaW5RdWVyeUtleSIsIm5vdEluUXVlcnlLZXkiLCJJRF9XSEVSRV9JTlBVVCIsImluIiwiU1RSSU5HX1dIRVJFX0lOUFVUIiwidGV4dCIsIk5VTUJFUl9XSEVSRV9JTlBVVCIsIkJPT0xFQU5fV0hFUkVfSU5QVVQiLCJBUlJBWV9XSEVSRV9JTlBVVCIsImNvbnRhaW5lZEJ5IiwiY29udGFpbnMiLCJLRVlfVkFMVUVfSU5QVVQiLCJPQkpFQ1RfV0hFUkVfSU5QVVQiLCJEQVRFX1dIRVJFX0lOUFVUIiwiQllURVNfV0hFUkVfSU5QVVQiLCJGSUxFX1dIRVJFX0lOUFVUIiwiR0VPX1BPSU5UX1dIRVJFX0lOUFVUIiwibmVhclNwaGVyZSIsIm1heERpc3RhbmNlIiwibWF4RGlzdGFuY2VJblJhZGlhbnMiLCJtYXhEaXN0YW5jZUluTWlsZXMiLCJtYXhEaXN0YW5jZUluS2lsb21ldGVycyIsIndpdGhpbiIsImdlb1dpdGhpbiIsIlBPTFlHT05fV0hFUkVfSU5QVVQiLCJnZW9JbnRlcnNlY3RzIiwiRUxFTUVOVCIsIkFSUkFZX1JFU1VMVCIsImxvYWRBcnJheVJlc3VsdCIsInBhcnNlR3JhcGhRTFNjaGVtYSIsInBhcnNlQ2xhc3Nlc0FycmF5IiwiY2xhc3NUeXBlcyIsImZpbHRlciIsInBhcnNlQ2xhc3MiLCJwYXJzZUNsYXNzVHlwZXMiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwiR3JhcGhRTFVuaW9uVHlwZSIsInR5cGVzIiwicmVzb2x2ZVR5cGUiLCJncmFwaFFMVHlwZXMiLCJsb2FkIiwiYWRkR3JhcGhRTFR5cGUiXSwic291cmNlcyI6WyIuLi8uLi8uLi9zcmMvR3JhcGhRTC9sb2FkZXJzL2RlZmF1bHRHcmFwaFFMVHlwZXMuanMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHtcbiAgS2luZCxcbiAgR3JhcGhRTE5vbk51bGwsXG4gIEdyYXBoUUxTY2FsYXJUeXBlLFxuICBHcmFwaFFMSUQsXG4gIEdyYXBoUUxTdHJpbmcsXG4gIEdyYXBoUUxPYmplY3RUeXBlLFxuICBHcmFwaFFMSW50ZXJmYWNlVHlwZSxcbiAgR3JhcGhRTEVudW1UeXBlLFxuICBHcmFwaFFMSW50LFxuICBHcmFwaFFMRmxvYXQsXG4gIEdyYXBoUUxMaXN0LFxuICBHcmFwaFFMSW5wdXRPYmplY3RUeXBlLFxuICBHcmFwaFFMQm9vbGVhbixcbiAgR3JhcGhRTFVuaW9uVHlwZSxcbn0gZnJvbSAnZ3JhcGhxbCc7XG5pbXBvcnQgeyB0b0dsb2JhbElkIH0gZnJvbSAnZ3JhcGhxbC1yZWxheSc7XG5cbmNsYXNzIFR5cGVWYWxpZGF0aW9uRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHZhbHVlLCB0eXBlKSB7XG4gICAgc3VwZXIoYCR7dmFsdWV9IGlzIG5vdCBhIHZhbGlkICR7dHlwZX1gKTtcbiAgfVxufVxuXG5jb25zdCBwYXJzZVN0cmluZ1ZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnU3RyaW5nJyk7XG59O1xuXG5jb25zdCBwYXJzZUludFZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIGNvbnN0IGludCA9IE51bWJlcih2YWx1ZSk7XG4gICAgaWYgKE51bWJlci5pc0ludGVnZXIoaW50KSkge1xuICAgICAgcmV0dXJuIGludDtcbiAgICB9XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0ludCcpO1xufTtcblxuY29uc3QgcGFyc2VGbG9hdFZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIGNvbnN0IGZsb2F0ID0gTnVtYmVyKHZhbHVlKTtcbiAgICBpZiAoIWlzTmFOKGZsb2F0KSkge1xuICAgICAgcmV0dXJuIGZsb2F0O1xuICAgIH1cbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRmxvYXQnKTtcbn07XG5cbmNvbnN0IHBhcnNlQm9vbGVhblZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0Jvb2xlYW4nKTtcbn07XG5cbmNvbnN0IHBhcnNlVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIHN3aXRjaCAodmFsdWUua2luZCkge1xuICAgIGNhc2UgS2luZC5TVFJJTkc6XG4gICAgICByZXR1cm4gcGFyc2VTdHJpbmdWYWx1ZSh2YWx1ZS52YWx1ZSk7XG5cbiAgICBjYXNlIEtpbmQuSU5UOlxuICAgICAgcmV0dXJuIHBhcnNlSW50VmFsdWUodmFsdWUudmFsdWUpO1xuXG4gICAgY2FzZSBLaW5kLkZMT0FUOlxuICAgICAgcmV0dXJuIHBhcnNlRmxvYXRWYWx1ZSh2YWx1ZS52YWx1ZSk7XG5cbiAgICBjYXNlIEtpbmQuQk9PTEVBTjpcbiAgICAgIHJldHVybiBwYXJzZUJvb2xlYW5WYWx1ZSh2YWx1ZS52YWx1ZSk7XG5cbiAgICBjYXNlIEtpbmQuTElTVDpcbiAgICAgIHJldHVybiBwYXJzZUxpc3RWYWx1ZXModmFsdWUudmFsdWVzKTtcblxuICAgIGNhc2UgS2luZC5PQkpFQ1Q6XG4gICAgICByZXR1cm4gcGFyc2VPYmplY3RGaWVsZHModmFsdWUuZmllbGRzKTtcblxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gdmFsdWUudmFsdWU7XG4gIH1cbn07XG5cbmNvbnN0IHBhcnNlTGlzdFZhbHVlcyA9IHZhbHVlcyA9PiB7XG4gIGlmIChBcnJheS5pc0FycmF5KHZhbHVlcykpIHtcbiAgICByZXR1cm4gdmFsdWVzLm1hcCh2YWx1ZSA9PiBwYXJzZVZhbHVlKHZhbHVlKSk7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZXMsICdMaXN0Jyk7XG59O1xuXG5jb25zdCBwYXJzZU9iamVjdEZpZWxkcyA9IGZpZWxkcyA9PiB7XG4gIGlmIChBcnJheS5pc0FycmF5KGZpZWxkcykpIHtcbiAgICByZXR1cm4gZmllbGRzLnJlZHVjZShcbiAgICAgIChvYmplY3QsIGZpZWxkKSA9PiAoe1xuICAgICAgICAuLi5vYmplY3QsXG4gICAgICAgIFtmaWVsZC5uYW1lLnZhbHVlXTogcGFyc2VWYWx1ZShmaWVsZC52YWx1ZSksXG4gICAgICB9KSxcbiAgICAgIHt9XG4gICAgKTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGZpZWxkcywgJ09iamVjdCcpO1xufTtcblxuY29uc3QgQU5ZID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ0FueScsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQW55IHNjYWxhciB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyBhbmQgdHlwZXMgdGhhdCBpbnZvbHZlIGFueSB0eXBlIG9mIHZhbHVlLicsXG4gIHBhcnNlVmFsdWU6IHZhbHVlID0+IHZhbHVlLFxuICBzZXJpYWxpemU6IHZhbHVlID0+IHZhbHVlLFxuICBwYXJzZUxpdGVyYWw6IGFzdCA9PiBwYXJzZVZhbHVlKGFzdCksXG59KTtcblxuY29uc3QgT0JKRUNUID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ09iamVjdCcsXG4gIGRlc2NyaXB0aW9uOiAnVGhlIE9iamVjdCBzY2FsYXIgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgYW5kIHR5cGVzIHRoYXQgaW52b2x2ZSBvYmplY3RzLicsXG4gIHBhcnNlVmFsdWUodmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnT2JqZWN0Jyk7XG4gIH0sXG4gIHNlcmlhbGl6ZSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdPYmplY3QnKTtcbiAgfSxcbiAgcGFyc2VMaXRlcmFsKGFzdCkge1xuICAgIGlmIChhc3Qua2luZCA9PT0gS2luZC5PQkpFQ1QpIHtcbiAgICAgIHJldHVybiBwYXJzZU9iamVjdEZpZWxkcyhhc3QuZmllbGRzKTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcihhc3Qua2luZCwgJ09iamVjdCcpO1xuICB9LFxufSk7XG5cbmNvbnN0IHBhcnNlRGF0ZUlzb1ZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIGNvbnN0IGRhdGUgPSBuZXcgRGF0ZSh2YWx1ZSk7XG4gICAgaWYgKCFpc05hTihkYXRlKSkge1xuICAgICAgcmV0dXJuIGRhdGU7XG4gICAgfVxuICB9IGVsc2UgaWYgKHZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRGF0ZScpO1xufTtcblxuY29uc3Qgc2VyaWFsaXplRGF0ZUlzbyA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cbiAgaWYgKHZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgIHJldHVybiB2YWx1ZS50b0lTT1N0cmluZygpO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdEYXRlJyk7XG59O1xuXG5jb25zdCBwYXJzZURhdGVJc29MaXRlcmFsID0gYXN0ID0+IHtcbiAgaWYgKGFzdC5raW5kID09PSBLaW5kLlNUUklORykge1xuICAgIHJldHVybiBwYXJzZURhdGVJc29WYWx1ZShhc3QudmFsdWUpO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IoYXN0LmtpbmQsICdEYXRlJyk7XG59O1xuXG5jb25zdCBEQVRFID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ0RhdGUnLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBEYXRlIHNjYWxhciB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyBhbmQgdHlwZXMgdGhhdCBpbnZvbHZlIGRhdGVzLicsXG4gIHBhcnNlVmFsdWUodmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyB8fCB2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IHBhcnNlRGF0ZUlzb1ZhbHVlKHZhbHVlKSxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmIHZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnICYmIHZhbHVlLmlzbykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiB2YWx1ZS5fX3R5cGUsXG4gICAgICAgIGlzbzogcGFyc2VEYXRlSXNvVmFsdWUodmFsdWUuaXNvKSxcbiAgICAgIH07XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdEYXRlJyk7XG4gIH0sXG4gIHNlcmlhbGl6ZSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnIHx8IHZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgICAgcmV0dXJuIHNlcmlhbGl6ZURhdGVJc28odmFsdWUpO1xuICAgIH0gZWxzZSBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJiB2YWx1ZS5fX3R5cGUgPT09ICdEYXRlJyAmJiB2YWx1ZS5pc28pIHtcbiAgICAgIHJldHVybiBzZXJpYWxpemVEYXRlSXNvKHZhbHVlLmlzbyk7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdEYXRlJyk7XG4gIH0sXG4gIHBhcnNlTGl0ZXJhbChhc3QpIHtcbiAgICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBwYXJzZURhdGVJc29MaXRlcmFsKGFzdCksXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoYXN0LmtpbmQgPT09IEtpbmQuT0JKRUNUKSB7XG4gICAgICBjb25zdCBfX3R5cGUgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ19fdHlwZScpO1xuICAgICAgY29uc3QgaXNvID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdpc28nKTtcbiAgICAgIGlmIChfX3R5cGUgJiYgX190eXBlLnZhbHVlICYmIF9fdHlwZS52YWx1ZS52YWx1ZSA9PT0gJ0RhdGUnICYmIGlzbykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIF9fdHlwZTogX190eXBlLnZhbHVlLnZhbHVlLFxuICAgICAgICAgIGlzbzogcGFyc2VEYXRlSXNvTGl0ZXJhbChpc28udmFsdWUpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnRGF0ZScpO1xuICB9LFxufSk7XG5cbmNvbnN0IEdyYXBoUUxVcGxvYWQgPSBuZXcgR3JhcGhRTFNjYWxhclR5cGUoe1xuICBuYW1lOiAnVXBsb2FkJyxcbiAgZGVzY3JpcHRpb246ICdUaGUgVXBsb2FkIHNjYWxhciB0eXBlIHJlcHJlc2VudHMgYSBmaWxlIHVwbG9hZC4nLFxufSk7XG5cbmNvbnN0IEJZVEVTID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ0J5dGVzJyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBCeXRlcyBzY2FsYXIgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgYW5kIHR5cGVzIHRoYXQgaW52b2x2ZSBiYXNlIDY0IGJpbmFyeSBkYXRhLicsXG4gIHBhcnNlVmFsdWUodmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnQnl0ZXMnLFxuICAgICAgICBiYXNlNjQ6IHZhbHVlLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgdmFsdWUuX190eXBlID09PSAnQnl0ZXMnICYmXG4gICAgICB0eXBlb2YgdmFsdWUuYmFzZTY0ID09PSAnc3RyaW5nJ1xuICAgICkge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnQnl0ZXMnKTtcbiAgfSxcbiAgc2VyaWFsaXplKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgdmFsdWUuX190eXBlID09PSAnQnl0ZXMnICYmXG4gICAgICB0eXBlb2YgdmFsdWUuYmFzZTY0ID09PSAnc3RyaW5nJ1xuICAgICkge1xuICAgICAgcmV0dXJuIHZhbHVlLmJhc2U2NDtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0J5dGVzJyk7XG4gIH0sXG4gIHBhcnNlTGl0ZXJhbChhc3QpIHtcbiAgICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdCeXRlcycsXG4gICAgICAgIGJhc2U2NDogYXN0LnZhbHVlLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKGFzdC5raW5kID09PSBLaW5kLk9CSkVDVCkge1xuICAgICAgY29uc3QgX190eXBlID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdfX3R5cGUnKTtcbiAgICAgIGNvbnN0IGJhc2U2NCA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnYmFzZTY0Jyk7XG4gICAgICBpZiAoXG4gICAgICAgIF9fdHlwZSAmJlxuICAgICAgICBfX3R5cGUudmFsdWUgJiZcbiAgICAgICAgX190eXBlLnZhbHVlLnZhbHVlID09PSAnQnl0ZXMnICYmXG4gICAgICAgIGJhc2U2NCAmJlxuICAgICAgICBiYXNlNjQudmFsdWUgJiZcbiAgICAgICAgdHlwZW9mIGJhc2U2NC52YWx1ZS52YWx1ZSA9PT0gJ3N0cmluZydcbiAgICAgICkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIF9fdHlwZTogX190eXBlLnZhbHVlLnZhbHVlLFxuICAgICAgICAgIGJhc2U2NDogYmFzZTY0LnZhbHVlLnZhbHVlLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnQnl0ZXMnKTtcbiAgfSxcbn0pO1xuXG5jb25zdCBwYXJzZUZpbGVWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4ge1xuICAgICAgX190eXBlOiAnRmlsZScsXG4gICAgICBuYW1lOiB2YWx1ZSxcbiAgICB9O1xuICB9IGVsc2UgaWYgKFxuICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICB2YWx1ZS5fX3R5cGUgPT09ICdGaWxlJyAmJlxuICAgIHR5cGVvZiB2YWx1ZS5uYW1lID09PSAnc3RyaW5nJyAmJlxuICAgICh2YWx1ZS51cmwgPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgdmFsdWUudXJsID09PSAnc3RyaW5nJylcbiAgKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdGaWxlJyk7XG59O1xuXG5jb25zdCBGSUxFID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ0ZpbGUnLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBGaWxlIHNjYWxhciB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyBhbmQgdHlwZXMgdGhhdCBpbnZvbHZlIGZpbGVzLicsXG4gIHBhcnNlVmFsdWU6IHBhcnNlRmlsZVZhbHVlLFxuICBzZXJpYWxpemU6IHZhbHVlID0+IHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICB2YWx1ZS5fX3R5cGUgPT09ICdGaWxlJyAmJlxuICAgICAgdHlwZW9mIHZhbHVlLm5hbWUgPT09ICdzdHJpbmcnICYmXG4gICAgICAodmFsdWUudXJsID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIHZhbHVlLnVybCA9PT0gJ3N0cmluZycpXG4gICAgKSB7XG4gICAgICByZXR1cm4gdmFsdWUubmFtZTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0ZpbGUnKTtcbiAgfSxcbiAgcGFyc2VMaXRlcmFsKGFzdCkge1xuICAgIGlmIChhc3Qua2luZCA9PT0gS2luZC5TVFJJTkcpIHtcbiAgICAgIHJldHVybiBwYXJzZUZpbGVWYWx1ZShhc3QudmFsdWUpO1xuICAgIH0gZWxzZSBpZiAoYXN0LmtpbmQgPT09IEtpbmQuT0JKRUNUKSB7XG4gICAgICBjb25zdCBfX3R5cGUgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ19fdHlwZScpO1xuICAgICAgY29uc3QgbmFtZSA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnbmFtZScpO1xuICAgICAgY29uc3QgdXJsID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICd1cmwnKTtcbiAgICAgIGlmIChfX3R5cGUgJiYgX190eXBlLnZhbHVlICYmIG5hbWUgJiYgbmFtZS52YWx1ZSkge1xuICAgICAgICByZXR1cm4gcGFyc2VGaWxlVmFsdWUoe1xuICAgICAgICAgIF9fdHlwZTogX190eXBlLnZhbHVlLnZhbHVlLFxuICAgICAgICAgIG5hbWU6IG5hbWUudmFsdWUudmFsdWUsXG4gICAgICAgICAgdXJsOiB1cmwgJiYgdXJsLnZhbHVlID8gdXJsLnZhbHVlLnZhbHVlIDogdW5kZWZpbmVkLFxuICAgICAgICB9KTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcihhc3Qua2luZCwgJ0ZpbGUnKTtcbiAgfSxcbn0pO1xuXG5jb25zdCBGSUxFX0lORk8gPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnRmlsZUluZm8nLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBGaWxlSW5mbyBvYmplY3QgdHlwZSBpcyB1c2VkIHRvIHJldHVybiB0aGUgaW5mb3JtYXRpb24gYWJvdXQgZmlsZXMuJyxcbiAgZmllbGRzOiB7XG4gICAgbmFtZToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBmaWxlIG5hbWUuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICB9LFxuICAgIHVybDoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB1cmwgaW4gd2hpY2ggdGhlIGZpbGUgY2FuIGJlIGRvd25sb2FkZWQuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IEZJTEVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdGaWxlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnSWYgdGhpcyBmaWVsZCBpcyBzZXQgdG8gbnVsbCB0aGUgZmlsZSB3aWxsIGJlIHVubGlua2VkICh0aGUgZmlsZSB3aWxsIG5vdCBiZSBkZWxldGVkIG9uIGNsb3VkIHN0b3JhZ2UpLicsXG4gIGZpZWxkczoge1xuICAgIGZpbGU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQSBGaWxlIFNjYWxhciBjYW4gYmUgYW4gdXJsIG9yIGEgRmlsZUluZm8gb2JqZWN0LicsXG4gICAgICB0eXBlOiBGSUxFLFxuICAgIH0sXG4gICAgdXBsb2FkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1VzZSB0aGlzIGZpZWxkIGlmIHlvdSB3YW50IHRvIGNyZWF0ZSBhIG5ldyBmaWxlLicsXG4gICAgICB0eXBlOiBHcmFwaFFMVXBsb2FkLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgR0VPX1BPSU5UX0ZJRUxEUyA9IHtcbiAgbGF0aXR1ZGU6IHtcbiAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGxhdGl0dWRlLicsXG4gICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxGbG9hdCksXG4gIH0sXG4gIGxvbmdpdHVkZToge1xuICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbG9uZ2l0dWRlLicsXG4gICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxGbG9hdCksXG4gIH0sXG59O1xuXG5jb25zdCBHRU9fUE9JTlRfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdHZW9Qb2ludElucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBHZW9Qb2ludElucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBpbnB1dHRpbmcgZmllbGRzIG9mIHR5cGUgZ2VvIHBvaW50LicsXG4gIGZpZWxkczogR0VPX1BPSU5UX0ZJRUxEUyxcbn0pO1xuXG5jb25zdCBHRU9fUE9JTlQgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnR2VvUG9pbnQnLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBHZW9Qb2ludCBvYmplY3QgdHlwZSBpcyB1c2VkIHRvIHJldHVybiB0aGUgaW5mb3JtYXRpb24gYWJvdXQgZ2VvIHBvaW50IGZpZWxkcy4nLFxuICBmaWVsZHM6IEdFT19QT0lOVF9GSUVMRFMsXG59KTtcblxuY29uc3QgUE9MWUdPTl9JTlBVVCA9IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoR0VPX1BPSU5UX0lOUFVUKSk7XG5cbmNvbnN0IFBPTFlHT04gPSBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVCkpO1xuXG5jb25zdCBVU0VSX0FDTF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1VzZXJBQ0xJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnQWxsb3cgdG8gbWFuYWdlIHVzZXJzIGluIEFDTC4nLFxuICBmaWVsZHM6IHtcbiAgICB1c2VySWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnSUQgb2YgdGhlIHRhcmdldHRlZCBVc2VyLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTElEKSxcbiAgICB9LFxuICAgIHJlYWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgdGhlIHVzZXIgdG8gcmVhZCB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgICB3cml0ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyB0aGUgdXNlciB0byB3cml0ZSBvbiB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBST0xFX0FDTF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1JvbGVBQ0xJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnQWxsb3cgdG8gbWFuYWdlIHJvbGVzIGluIEFDTC4nLFxuICBmaWVsZHM6IHtcbiAgICByb2xlTmFtZToge1xuICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSB0YXJnZXR0ZWQgUm9sZS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgIH0sXG4gICAgcmVhZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyB1c2VycyB3aG8gYXJlIG1lbWJlcnMgb2YgdGhlIHJvbGUgdG8gcmVhZCB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgICB3cml0ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyB1c2VycyB3aG8gYXJlIG1lbWJlcnMgb2YgdGhlIHJvbGUgdG8gd3JpdGUgb24gdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgUFVCTElDX0FDTF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1B1YmxpY0FDTElucHV0JyxcbiAgZGVzY3JpcHRpb246ICdBbGxvdyB0byBtYW5hZ2UgcHVibGljIHJpZ2h0cy4nLFxuICBmaWVsZHM6IHtcbiAgICByZWFkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IGFueW9uZSB0byByZWFkIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICAgIHdyaXRlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IGFueW9uZSB0byB3cml0ZSBvbiB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBBQ0xfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdBQ0xJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdBbGxvdyB0byBtYW5hZ2UgYWNjZXNzIHJpZ2h0cy4gSWYgbm90IHByb3ZpZGVkIG9iamVjdCB3aWxsIGJlIHB1YmxpY2x5IHJlYWRhYmxlIGFuZCB3cml0YWJsZScsXG4gIGZpZWxkczoge1xuICAgIHVzZXJzOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FjY2VzcyBjb250cm9sIGxpc3QgZm9yIHVzZXJzLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKFVTRVJfQUNMX0lOUFVUKSksXG4gICAgfSxcbiAgICByb2xlczoge1xuICAgICAgZGVzY3JpcHRpb246ICdBY2Nlc3MgY29udHJvbCBsaXN0IGZvciByb2xlcy4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChST0xFX0FDTF9JTlBVVCkpLFxuICAgIH0sXG4gICAgcHVibGljOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1B1YmxpYyBhY2Nlc3MgY29udHJvbCBsaXN0LicsXG4gICAgICB0eXBlOiBQVUJMSUNfQUNMX0lOUFVULFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgVVNFUl9BQ0wgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnVXNlckFDTCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdBbGxvdyB0byBtYW5hZ2UgdXNlcnMgaW4gQUNMLiBJZiByZWFkIGFuZCB3cml0ZSBhcmUgbnVsbCB0aGUgdXNlcnMgaGF2ZSByZWFkIGFuZCB3cml0ZSByaWdodHMuJyxcbiAgZmllbGRzOiB7XG4gICAgdXNlcklkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0lEIG9mIHRoZSB0YXJnZXR0ZWQgVXNlci4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxJRCksXG4gICAgfSxcbiAgICByZWFkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IHRoZSB1c2VyIHRvIHJlYWQgdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gICAgd3JpdGU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgdGhlIHVzZXIgdG8gd3JpdGUgb24gdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgUk9MRV9BQ0wgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnUm9sZUFDTCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdBbGxvdyB0byBtYW5hZ2Ugcm9sZXMgaW4gQUNMLiBJZiByZWFkIGFuZCB3cml0ZSBhcmUgbnVsbCB0aGUgcm9sZSBoYXZlIHJlYWQgYW5kIHdyaXRlIHJpZ2h0cy4nLFxuICBmaWVsZHM6IHtcbiAgICByb2xlTmFtZToge1xuICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSB0YXJnZXR0ZWQgUm9sZS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxJRCksXG4gICAgfSxcbiAgICByZWFkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IHVzZXJzIHdobyBhcmUgbWVtYmVycyBvZiB0aGUgcm9sZSB0byByZWFkIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICAgIHdyaXRlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IHVzZXJzIHdobyBhcmUgbWVtYmVycyBvZiB0aGUgcm9sZSB0byB3cml0ZSBvbiB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBQVUJMSUNfQUNMID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1B1YmxpY0FDTCcsXG4gIGRlc2NyaXB0aW9uOiAnQWxsb3cgdG8gbWFuYWdlIHB1YmxpYyByaWdodHMuJyxcbiAgZmllbGRzOiB7XG4gICAgcmVhZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyBhbnlvbmUgdG8gcmVhZCB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxCb29sZWFuLFxuICAgIH0sXG4gICAgd3JpdGU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgYW55b25lIHRvIHdyaXRlIG9uIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogR3JhcGhRTEJvb2xlYW4sXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBBQ0wgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnQUNMJyxcbiAgZGVzY3JpcHRpb246ICdDdXJyZW50IGFjY2VzcyBjb250cm9sIGxpc3Qgb2YgdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gIGZpZWxkczoge1xuICAgIHVzZXJzOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FjY2VzcyBjb250cm9sIGxpc3QgZm9yIHVzZXJzLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKFVTRVJfQUNMKSksXG4gICAgICByZXNvbHZlKHApIHtcbiAgICAgICAgY29uc3QgdXNlcnMgPSBbXTtcbiAgICAgICAgT2JqZWN0LmtleXMocCkuZm9yRWFjaChydWxlID0+IHtcbiAgICAgICAgICBpZiAocnVsZSAhPT0gJyonICYmIHJ1bGUuaW5kZXhPZigncm9sZTonKSAhPT0gMCkge1xuICAgICAgICAgICAgdXNlcnMucHVzaCh7XG4gICAgICAgICAgICAgIHVzZXJJZDogdG9HbG9iYWxJZCgnX1VzZXInLCBydWxlKSxcbiAgICAgICAgICAgICAgcmVhZDogcFtydWxlXS5yZWFkID8gdHJ1ZSA6IGZhbHNlLFxuICAgICAgICAgICAgICB3cml0ZTogcFtydWxlXS53cml0ZSA/IHRydWUgOiBmYWxzZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB1c2Vycy5sZW5ndGggPyB1c2VycyA6IG51bGw7XG4gICAgICB9LFxuICAgIH0sXG4gICAgcm9sZXM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWNjZXNzIGNvbnRyb2wgbGlzdCBmb3Igcm9sZXMuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoUk9MRV9BQ0wpKSxcbiAgICAgIHJlc29sdmUocCkge1xuICAgICAgICBjb25zdCByb2xlcyA9IFtdO1xuICAgICAgICBPYmplY3Qua2V5cyhwKS5mb3JFYWNoKHJ1bGUgPT4ge1xuICAgICAgICAgIGlmIChydWxlLmluZGV4T2YoJ3JvbGU6JykgPT09IDApIHtcbiAgICAgICAgICAgIHJvbGVzLnB1c2goe1xuICAgICAgICAgICAgICByb2xlTmFtZTogcnVsZS5yZXBsYWNlKCdyb2xlOicsICcnKSxcbiAgICAgICAgICAgICAgcmVhZDogcFtydWxlXS5yZWFkID8gdHJ1ZSA6IGZhbHNlLFxuICAgICAgICAgICAgICB3cml0ZTogcFtydWxlXS53cml0ZSA/IHRydWUgOiBmYWxzZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiByb2xlcy5sZW5ndGggPyByb2xlcyA6IG51bGw7XG4gICAgICB9LFxuICAgIH0sXG4gICAgcHVibGljOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1B1YmxpYyBhY2Nlc3MgY29udHJvbCBsaXN0LicsXG4gICAgICB0eXBlOiBQVUJMSUNfQUNMLFxuICAgICAgcmVzb2x2ZShwKSB7XG4gICAgICAgIC8qIGVzbGludC1kaXNhYmxlICovXG4gICAgICAgIHJldHVybiBwWycqJ11cbiAgICAgICAgICA/IHtcbiAgICAgICAgICAgICAgcmVhZDogcFsnKiddLnJlYWQgPyB0cnVlIDogZmFsc2UsXG4gICAgICAgICAgICAgIHdyaXRlOiBwWycqJ10ud3JpdGUgPyB0cnVlIDogZmFsc2UsXG4gICAgICAgICAgICB9XG4gICAgICAgICAgOiBudWxsO1xuICAgICAgfSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IE9CSkVDVF9JRCA9IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMSUQpO1xuXG5jb25zdCBDTEFTU19OQU1FX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBjbGFzcyBuYW1lIG9mIHRoZSBvYmplY3QuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxufTtcblxuY29uc3QgR0xPQkFMX09SX09CSkVDVF9JRF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgb2JqZWN0IGlkLiBZb3UgY2FuIHVzZSBlaXRoZXIgdGhlIGdsb2JhbCBvciB0aGUgb2JqZWN0IGlkLicsXG4gIHR5cGU6IE9CSkVDVF9JRCxcbn07XG5cbmNvbnN0IE9CSkVDVF9JRF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgb2JqZWN0IGlkLicsXG4gIHR5cGU6IE9CSkVDVF9JRCxcbn07XG5cbmNvbnN0IENSRUFURURfQVRfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGRhdGUgaW4gd2hpY2ggdGhlIG9iamVjdCB3YXMgY3JlYXRlZC4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoREFURSksXG59O1xuXG5jb25zdCBVUERBVEVEX0FUX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBkYXRlIGluIHdoaWNoIHRoZSBvYmplY3Qgd2FzIGxhcyB1cGRhdGVkLicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChEQVRFKSxcbn07XG5cbmNvbnN0IElOUFVUX0ZJRUxEUyA9IHtcbiAgQUNMOiB7XG4gICAgdHlwZTogQUNMLFxuICB9LFxufTtcblxuY29uc3QgQ1JFQVRFX1JFU1VMVF9GSUVMRFMgPSB7XG4gIG9iamVjdElkOiBPQkpFQ1RfSURfQVRULFxuICBjcmVhdGVkQXQ6IENSRUFURURfQVRfQVRULFxufTtcblxuY29uc3QgVVBEQVRFX1JFU1VMVF9GSUVMRFMgPSB7XG4gIHVwZGF0ZWRBdDogVVBEQVRFRF9BVF9BVFQsXG59O1xuXG5jb25zdCBQQVJTRV9PQkpFQ1RfRklFTERTID0ge1xuICAuLi5DUkVBVEVfUkVTVUxUX0ZJRUxEUyxcbiAgLi4uVVBEQVRFX1JFU1VMVF9GSUVMRFMsXG4gIC4uLklOUFVUX0ZJRUxEUyxcbiAgQUNMOiB7XG4gICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEFDTCksXG4gICAgcmVzb2x2ZTogKHsgQUNMIH0pID0+IChBQ0wgPyBBQ0wgOiB7ICcqJzogeyByZWFkOiB0cnVlLCB3cml0ZTogdHJ1ZSB9IH0pLFxuICB9LFxufTtcblxuY29uc3QgUEFSU0VfT0JKRUNUID0gbmV3IEdyYXBoUUxJbnRlcmZhY2VUeXBlKHtcbiAgbmFtZTogJ1BhcnNlT2JqZWN0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBQYXJzZU9iamVjdCBpbnRlcmZhY2UgdHlwZSBpcyB1c2VkIGFzIGEgYmFzZSB0eXBlIGZvciB0aGUgYXV0byBnZW5lcmF0ZWQgb2JqZWN0IHR5cGVzLicsXG4gIGZpZWxkczogUEFSU0VfT0JKRUNUX0ZJRUxEUyxcbn0pO1xuXG5jb25zdCBTRVNTSU9OX1RPS0VOX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGUgY3VycmVudCB1c2VyIHNlc3Npb24gdG9rZW4uJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxufTtcblxuY29uc3QgUkVBRF9QUkVGRVJFTkNFID0gbmV3IEdyYXBoUUxFbnVtVHlwZSh7XG4gIG5hbWU6ICdSZWFkUHJlZmVyZW5jZScsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgUmVhZFByZWZlcmVuY2UgZW51bSB0eXBlIGlzIHVzZWQgaW4gcXVlcmllcyBpbiBvcmRlciB0byBzZWxlY3QgaW4gd2hpY2ggZGF0YWJhc2UgcmVwbGljYSB0aGUgb3BlcmF0aW9uIG11c3QgcnVuLicsXG4gIHZhbHVlczoge1xuICAgIFBSSU1BUlk6IHsgdmFsdWU6ICdQUklNQVJZJyB9LFxuICAgIFBSSU1BUllfUFJFRkVSUkVEOiB7IHZhbHVlOiAnUFJJTUFSWV9QUkVGRVJSRUQnIH0sXG4gICAgU0VDT05EQVJZOiB7IHZhbHVlOiAnU0VDT05EQVJZJyB9LFxuICAgIFNFQ09OREFSWV9QUkVGRVJSRUQ6IHsgdmFsdWU6ICdTRUNPTkRBUllfUFJFRkVSUkVEJyB9LFxuICAgIE5FQVJFU1Q6IHsgdmFsdWU6ICdORUFSRVNUJyB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFJFQURfUFJFRkVSRU5DRV9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhlIHJlYWQgcHJlZmVyZW5jZSBmb3IgdGhlIG1haW4gcXVlcnkgdG8gYmUgZXhlY3V0ZWQuJyxcbiAgdHlwZTogUkVBRF9QUkVGRVJFTkNFLFxufTtcblxuY29uc3QgSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoZSByZWFkIHByZWZlcmVuY2UgZm9yIHRoZSBxdWVyaWVzIHRvIGJlIGV4ZWN1dGVkIHRvIGluY2x1ZGUgZmllbGRzLicsXG4gIHR5cGU6IFJFQURfUFJFRkVSRU5DRSxcbn07XG5cbmNvbnN0IFNVQlFVRVJZX1JFQURfUFJFRkVSRU5DRV9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhlIHJlYWQgcHJlZmVyZW5jZSBmb3IgdGhlIHN1YnF1ZXJpZXMgdGhhdCBtYXkgYmUgcmVxdWlyZWQuJyxcbiAgdHlwZTogUkVBRF9QUkVGRVJFTkNFLFxufTtcblxuY29uc3QgUkVBRF9PUFRJT05TX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnUmVhZE9wdGlvbnNJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgUmVhZE9wdGlvbnNJbnB1dHQgdHlwZSBpcyB1c2VkIGluIHF1ZXJpZXMgaW4gb3JkZXIgdG8gc2V0IHRoZSByZWFkIHByZWZlcmVuY2VzLicsXG4gIGZpZWxkczoge1xuICAgIHJlYWRQcmVmZXJlbmNlOiBSRUFEX1BSRUZFUkVOQ0VfQVRULFxuICAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZTogSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRULFxuICAgIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U6IFNVQlFVRVJZX1JFQURfUFJFRkVSRU5DRV9BVFQsXG4gIH0sXG59KTtcblxuY29uc3QgUkVBRF9PUFRJT05TX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGUgcmVhZCBvcHRpb25zIGZvciB0aGUgcXVlcnkgdG8gYmUgZXhlY3V0ZWQuJyxcbiAgdHlwZTogUkVBRF9PUFRJT05TX0lOUFVULFxufTtcblxuY29uc3QgV0hFUkVfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoZXNlIGFyZSB0aGUgY29uZGl0aW9ucyB0aGF0IHRoZSBvYmplY3RzIG5lZWQgdG8gbWF0Y2ggaW4gb3JkZXIgdG8gYmUgZm91bmQnLFxuICB0eXBlOiBPQkpFQ1QsXG59O1xuXG5jb25zdCBTS0lQX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBudW1iZXIgb2Ygb2JqZWN0cyB0aGF0IG11c3QgYmUgc2tpcHBlZCB0byByZXR1cm4uJyxcbiAgdHlwZTogR3JhcGhRTEludCxcbn07XG5cbmNvbnN0IExJTUlUX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBsaW1pdCBudW1iZXIgb2Ygb2JqZWN0cyB0aGF0IG11c3QgYmUgcmV0dXJuZWQuJyxcbiAgdHlwZTogR3JhcGhRTEludCxcbn07XG5cbmNvbnN0IENPVU5UX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIHRvdGFsIG1hdGNoZWQgb2JqZWNzIGNvdW50IHRoYXQgaXMgcmV0dXJuZWQgd2hlbiB0aGUgY291bnQgZmxhZyBpcyBzZXQuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxJbnQpLFxufTtcblxuY29uc3QgU0VBUkNIX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnU2VhcmNoSW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBTZWFyY2hJbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmaXkgYSBzZWFyY2ggb3BlcmF0aW9uIG9uIGEgZnVsbCB0ZXh0IHNlYXJjaC4nLFxuICBmaWVsZHM6IHtcbiAgICB0ZXJtOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHRlcm0gdG8gYmUgc2VhcmNoZWQuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICB9LFxuICAgIGxhbmd1YWdlOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGxhbmd1YWdlIHRvIHRldGVybWluZSB0aGUgbGlzdCBvZiBzdG9wIHdvcmRzIGFuZCB0aGUgcnVsZXMgZm9yIHRva2VuaXplci4nLFxuICAgICAgdHlwZTogR3JhcGhRTFN0cmluZyxcbiAgICB9LFxuICAgIGNhc2VTZW5zaXRpdmU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZmxhZyB0byBlbmFibGUgb3IgZGlzYWJsZSBjYXNlIHNlbnNpdGl2ZSBzZWFyY2guJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxCb29sZWFuLFxuICAgIH0sXG4gICAgZGlhY3JpdGljU2Vuc2l0aXZlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGZsYWcgdG8gZW5hYmxlIG9yIGRpc2FibGUgZGlhY3JpdGljIHNlbnNpdGl2ZSBzZWFyY2guJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxCb29sZWFuLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgVEVYVF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1RleHRJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnVGhlIFRleHRJbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmeSBhIHRleHQgb3BlcmF0aW9uIG9uIGEgY29uc3RyYWludC4nLFxuICBmaWVsZHM6IHtcbiAgICBzZWFyY2g6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgc2VhcmNoIHRvIGJlIGV4ZWN1dGVkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoU0VBUkNIX0lOUFVUKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IEJPWF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0JveElucHV0JyxcbiAgZGVzY3JpcHRpb246ICdUaGUgQm94SW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZml5IGEgYm94IG9wZXJhdGlvbiBvbiBhIHdpdGhpbiBnZW8gcXVlcnkuJyxcbiAgZmllbGRzOiB7XG4gICAgYm90dG9tTGVmdDoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBib3R0b20gbGVmdCBjb29yZGluYXRlcyBvZiB0aGUgYm94LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR0VPX1BPSU5UX0lOUFVUKSxcbiAgICB9LFxuICAgIHVwcGVyUmlnaHQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXBwZXIgcmlnaHQgY29vcmRpbmF0ZXMgb2YgdGhlIGJveC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVF9JTlBVVCksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBXSVRISU5fSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdXaXRoaW5JbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnVGhlIFdpdGhpbklucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGEgd2l0aGluIG9wZXJhdGlvbiBvbiBhIGNvbnN0cmFpbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgYm94OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGJveCB0byBiZSBzcGVjaWZpZWQuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChCT1hfSU5QVVQpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgQ0VOVEVSX1NQSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0NlbnRlclNwaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBDZW50ZXJTcGhlcmVJbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmaXkgYSBjZW50ZXJTcGhlcmUgb3BlcmF0aW9uIG9uIGEgZ2VvV2l0aGluIHF1ZXJ5LicsXG4gIGZpZWxkczoge1xuICAgIGNlbnRlcjoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBjZW50ZXIgb2YgdGhlIHNwaGVyZS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVF9JTlBVVCksXG4gICAgfSxcbiAgICBkaXN0YW5jZToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSByYWRpdXMgb2YgdGhlIHNwaGVyZS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxGbG9hdCksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBHRU9fV0lUSElOX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnR2VvV2l0aGluSW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ1RoZSBHZW9XaXRoaW5JbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmeSBhIGdlb1dpdGhpbiBvcGVyYXRpb24gb24gYSBjb25zdHJhaW50LicsXG4gIGZpZWxkczoge1xuICAgIHBvbHlnb246IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgcG9seWdvbiB0byBiZSBzcGVjaWZpZWQuJyxcbiAgICAgIHR5cGU6IFBPTFlHT05fSU5QVVQsXG4gICAgfSxcbiAgICBjZW50ZXJTcGhlcmU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgc3BoZXJlIHRvIGJlIHNwZWNpZmllZC4nLFxuICAgICAgdHlwZTogQ0VOVEVSX1NQSEVSRV9JTlBVVCxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IEdFT19JTlRFUlNFQ1RTX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnR2VvSW50ZXJzZWN0c0lucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBHZW9JbnRlcnNlY3RzSW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYSBnZW9JbnRlcnNlY3RzIG9wZXJhdGlvbiBvbiBhIGNvbnN0cmFpbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgcG9pbnQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgcG9pbnQgdG8gYmUgc3BlY2lmaWVkLicsXG4gICAgICB0eXBlOiBHRU9fUE9JTlRfSU5QVVQsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBlcXVhbFRvID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgZXF1YWxUbyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgZXF1YWxzIHRvIGEgc3BlY2lmaWVkIHZhbHVlLicsXG4gIHR5cGUsXG59KTtcblxuY29uc3Qgbm90RXF1YWxUbyA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIG5vdEVxdWFsVG8gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGRvIG5vdCBlcXVhbCB0byBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IGxlc3NUaGFuID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgbGVzc1RoYW4gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGlzIGxlc3MgdGhhbiBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IGxlc3NUaGFuT3JFcXVhbFRvID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgbGVzc1RoYW5PckVxdWFsVG8gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGlzIGxlc3MgdGhhbiBvciBlcXVhbCB0byBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IGdyZWF0ZXJUaGFuID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgZ3JlYXRlclRoYW4gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGlzIGdyZWF0ZXIgdGhhbiBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IGdyZWF0ZXJUaGFuT3JFcXVhbFRvID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgZ3JlYXRlclRoYW5PckVxdWFsVG8gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGlzIGdyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IGluT3AgPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBpbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgZXF1YWxzIGFueSB2YWx1ZSBpbiB0aGUgc3BlY2lmaWVkIGFycmF5LicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTGlzdCh0eXBlKSxcbn0pO1xuXG5jb25zdCBub3RJbiA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIG5vdEluIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBkbyBub3QgZXF1YWwgYW55IHZhbHVlIGluIHRoZSBzcGVjaWZpZWQgYXJyYXkuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KHR5cGUpLFxufSk7XG5cbmNvbnN0IGV4aXN0cyA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGV4aXN0cyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgYSBmaWVsZCBleGlzdHMgKG9yIGRvIG5vdCBleGlzdCkuJyxcbiAgdHlwZTogR3JhcGhRTEJvb2xlYW4sXG59O1xuXG5jb25zdCBtYXRjaGVzUmVnZXggPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBtYXRjaGVzUmVnZXggb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIG1hdGNoZXMgYSBzcGVjaWZpZWQgcmVndWxhciBleHByZXNzaW9uLicsXG4gIHR5cGU6IEdyYXBoUUxTdHJpbmcsXG59O1xuXG5jb25zdCBvcHRpb25zID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgb3B0aW9ucyBvcGVyYXRvciB0byBzcGVjaWZ5IG9wdGlvbmFsIGZsYWdzIChzdWNoIGFzIFwiaVwiIGFuZCBcIm1cIikgdG8gYmUgYWRkZWQgdG8gYSBtYXRjaGVzUmVnZXggb3BlcmF0aW9uIGluIHRoZSBzYW1lIHNldCBvZiBjb25zdHJhaW50cy4nLFxuICB0eXBlOiBHcmFwaFFMU3RyaW5nLFxufTtcblxuY29uc3QgU1VCUVVFUllfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdTdWJxdWVyeUlucHV0JyxcbiAgZGVzY3JpcHRpb246ICdUaGUgU3VicXVlcnlJbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmeSBhIHN1YiBxdWVyeSB0byBhbm90aGVyIGNsYXNzLicsXG4gIGZpZWxkczoge1xuICAgIGNsYXNzTmFtZTogQ0xBU1NfTkFNRV9BVFQsXG4gICAgd2hlcmU6IE9iamVjdC5hc3NpZ24oe30sIFdIRVJFX0FUVCwge1xuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFdIRVJFX0FUVC50eXBlKSxcbiAgICB9KSxcbiAgfSxcbn0pO1xuXG5jb25zdCBTRUxFQ1RfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdTZWxlY3RJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgU2VsZWN0SW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYW4gaW5RdWVyeUtleSBvciBhIG5vdEluUXVlcnlLZXkgb3BlcmF0aW9uIG9uIGEgY29uc3RyYWludC4nLFxuICBmaWVsZHM6IHtcbiAgICBxdWVyeToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBzdWJxdWVyeSB0byBiZSBleGVjdXRlZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFNVQlFVRVJZX0lOUFVUKSxcbiAgICB9LFxuICAgIGtleToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBrZXkgaW4gdGhlIHJlc3VsdCBvZiB0aGUgc3VicXVlcnkgdGhhdCBtdXN0IG1hdGNoIChub3QgbWF0Y2gpIHRoZSBmaWVsZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgaW5RdWVyeUtleSA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGluUXVlcnlLZXkgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIGEgZmllbGQgZXF1YWxzIHRvIGEga2V5IGluIHRoZSByZXN1bHQgb2YgYSBkaWZmZXJlbnQgcXVlcnkuJyxcbiAgdHlwZTogU0VMRUNUX0lOUFVULFxufTtcblxuY29uc3Qgbm90SW5RdWVyeUtleSA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIG5vdEluUXVlcnlLZXkgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIGEgZmllbGQgZG8gbm90IGVxdWFsIHRvIGEga2V5IGluIHRoZSByZXN1bHQgb2YgYSBkaWZmZXJlbnQgcXVlcnkuJyxcbiAgdHlwZTogU0VMRUNUX0lOUFVULFxufTtcblxuY29uc3QgSURfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdJZFdoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIElkV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYW4gaWQuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhHcmFwaFFMSUQpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oR3JhcGhRTElEKSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oR3JhcGhRTElEKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oR3JhcGhRTElEKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oR3JhcGhRTElEKSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oR3JhcGhRTElEKSxcbiAgICBpbjogaW5PcChHcmFwaFFMSUQpLFxuICAgIG5vdEluOiBub3RJbihHcmFwaFFMSUQpLFxuICAgIGV4aXN0cyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgU1RSSU5HX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnU3RyaW5nV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgU3RyaW5nV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIFN0cmluZy4nLFxuICBmaWVsZHM6IHtcbiAgICBlcXVhbFRvOiBlcXVhbFRvKEdyYXBoUUxTdHJpbmcpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oR3JhcGhRTFN0cmluZyksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKEdyYXBoUUxTdHJpbmcpLFxuICAgIGxlc3NUaGFuT3JFcXVhbFRvOiBsZXNzVGhhbk9yRXF1YWxUbyhHcmFwaFFMU3RyaW5nKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oR3JhcGhRTFN0cmluZyksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKEdyYXBoUUxTdHJpbmcpLFxuICAgIGluOiBpbk9wKEdyYXBoUUxTdHJpbmcpLFxuICAgIG5vdEluOiBub3RJbihHcmFwaFFMU3RyaW5nKSxcbiAgICBleGlzdHMsXG4gICAgbWF0Y2hlc1JlZ2V4LFxuICAgIG9wdGlvbnMsXG4gICAgdGV4dDoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSAkdGV4dCBvcGVyYXRvciB0byBzcGVjaWZ5IGEgZnVsbCB0ZXh0IHNlYXJjaCBjb25zdHJhaW50LicsXG4gICAgICB0eXBlOiBURVhUX0lOUFVULFxuICAgIH0sXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IE5VTUJFUl9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ051bWJlcldoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIE51bWJlcldoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBOdW1iZXIuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhHcmFwaFFMRmxvYXQpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oR3JhcGhRTEZsb2F0KSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oR3JhcGhRTEZsb2F0KSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oR3JhcGhRTEZsb2F0KSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oR3JhcGhRTEZsb2F0KSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oR3JhcGhRTEZsb2F0KSxcbiAgICBpbjogaW5PcChHcmFwaFFMRmxvYXQpLFxuICAgIG5vdEluOiBub3RJbihHcmFwaFFMRmxvYXQpLFxuICAgIGV4aXN0cyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgQk9PTEVBTl9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0Jvb2xlYW5XaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBCb29sZWFuV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIEJvb2xlYW4uJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhHcmFwaFFMQm9vbGVhbiksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhHcmFwaFFMQm9vbGVhbiksXG4gICAgZXhpc3RzLFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBBUlJBWV9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0FycmF5V2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQXJyYXlXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgQXJyYXkuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhBTlkpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oQU5ZKSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oQU5ZKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oQU5ZKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oQU5ZKSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oQU5ZKSxcbiAgICBpbjogaW5PcChBTlkpLFxuICAgIG5vdEluOiBub3RJbihBTlkpLFxuICAgIGV4aXN0cyxcbiAgICBjb250YWluZWRCeToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBjb250YWluZWRCeSBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhbiBhcnJheSBmaWVsZCBpcyBjb250YWluZWQgYnkgYW5vdGhlciBzcGVjaWZpZWQgYXJyYXkuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChBTlkpLFxuICAgIH0sXG4gICAgY29udGFpbnM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgY29udGFpbnMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYW4gYXJyYXkgZmllbGQgY29udGFpbiBhbGwgZWxlbWVudHMgb2YgYW5vdGhlciBzcGVjaWZpZWQgYXJyYXkuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChBTlkpLFxuICAgIH0sXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IEtFWV9WQUxVRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0tleVZhbHVlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ0FuIGVudHJ5IGZyb20gYW4gb2JqZWN0LCBpLmUuLCBhIHBhaXIgb2Yga2V5IGFuZCB2YWx1ZS4nLFxuICBmaWVsZHM6IHtcbiAgICBrZXk6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIGtleSB1c2VkIHRvIHJldHJpZXZlIHRoZSB2YWx1ZSBvZiB0aGlzIGVudHJ5LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgICB2YWx1ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGUgdmFsdWUgb2YgdGhlIGVudHJ5LiBDb3VsZCBiZSBhbnkgdHlwZSBvZiBzY2FsYXIgZGF0YS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEFOWSksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBPQkpFQ1RfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdPYmplY3RXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBPYmplY3RXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgcmVzdWx0IGJ5IGEgZmllbGQgb2YgdHlwZSBPYmplY3QuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhLRVlfVkFMVUVfSU5QVVQpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBpbjogaW5PcChLRVlfVkFMVUVfSU5QVVQpLFxuICAgIG5vdEluOiBub3RJbihLRVlfVkFMVUVfSU5QVVQpLFxuICAgIGxlc3NUaGFuOiBsZXNzVGhhbihLRVlfVkFMVUVfSU5QVVQpLFxuICAgIGxlc3NUaGFuT3JFcXVhbFRvOiBsZXNzVGhhbk9yRXF1YWxUbyhLRVlfVkFMVUVfSU5QVVQpLFxuICAgIGdyZWF0ZXJUaGFuOiBncmVhdGVyVGhhbihLRVlfVkFMVUVfSU5QVVQpLFxuICAgIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiBncmVhdGVyVGhhbk9yRXF1YWxUbyhLRVlfVkFMVUVfSU5QVVQpLFxuICAgIGV4aXN0cyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgREFURV9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0RhdGVXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBEYXRlV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIERhdGUuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhEQVRFKSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKERBVEUpLFxuICAgIGxlc3NUaGFuOiBsZXNzVGhhbihEQVRFKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oREFURSksXG4gICAgZ3JlYXRlclRoYW46IGdyZWF0ZXJUaGFuKERBVEUpLFxuICAgIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiBncmVhdGVyVGhhbk9yRXF1YWxUbyhEQVRFKSxcbiAgICBpbjogaW5PcChEQVRFKSxcbiAgICBub3RJbjogbm90SW4oREFURSksXG4gICAgZXhpc3RzLFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBCWVRFU19XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0J5dGVzV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQnl0ZXNXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgQnl0ZXMuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhCWVRFUyksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhCWVRFUyksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKEJZVEVTKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oQllURVMpLFxuICAgIGdyZWF0ZXJUaGFuOiBncmVhdGVyVGhhbihCWVRFUyksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKEJZVEVTKSxcbiAgICBpbjogaW5PcChCWVRFUyksXG4gICAgbm90SW46IG5vdEluKEJZVEVTKSxcbiAgICBleGlzdHMsXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IEZJTEVfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdGaWxlV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgRmlsZVdoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBGaWxlLicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oRklMRSksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhGSUxFKSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oRklMRSksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKEZJTEUpLFxuICAgIGdyZWF0ZXJUaGFuOiBncmVhdGVyVGhhbihGSUxFKSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oRklMRSksXG4gICAgaW46IGluT3AoRklMRSksXG4gICAgbm90SW46IG5vdEluKEZJTEUpLFxuICAgIGV4aXN0cyxcbiAgICBtYXRjaGVzUmVnZXgsXG4gICAgb3B0aW9ucyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgR0VPX1BPSU5UX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnR2VvUG9pbnRXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBHZW9Qb2ludFdoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBHZW9Qb2ludC4nLFxuICBmaWVsZHM6IHtcbiAgICBleGlzdHMsXG4gICAgbmVhclNwaGVyZToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBuZWFyU3BoZXJlIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIG5lYXIgdG8gYW5vdGhlciBnZW8gcG9pbnQuJyxcbiAgICAgIHR5cGU6IEdFT19QT0lOVF9JTlBVVCxcbiAgICB9LFxuICAgIG1heERpc3RhbmNlOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIG1heERpc3RhbmNlIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIGF0IGEgbWF4IGRpc3RhbmNlIChpbiByYWRpYW5zKSBmcm9tIHRoZSBnZW8gcG9pbnQgc3BlY2lmaWVkIGluIHRoZSAkbmVhclNwaGVyZSBvcGVyYXRvci4nLFxuICAgICAgdHlwZTogR3JhcGhRTEZsb2F0LFxuICAgIH0sXG4gICAgbWF4RGlzdGFuY2VJblJhZGlhbnM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgbWF4RGlzdGFuY2VJblJhZGlhbnMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBnZW8gcG9pbnQgZmllbGQgaXMgYXQgYSBtYXggZGlzdGFuY2UgKGluIHJhZGlhbnMpIGZyb20gdGhlIGdlbyBwb2ludCBzcGVjaWZpZWQgaW4gdGhlICRuZWFyU3BoZXJlIG9wZXJhdG9yLicsXG4gICAgICB0eXBlOiBHcmFwaFFMRmxvYXQsXG4gICAgfSxcbiAgICBtYXhEaXN0YW5jZUluTWlsZXM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgbWF4RGlzdGFuY2VJbk1pbGVzIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIGF0IGEgbWF4IGRpc3RhbmNlIChpbiBtaWxlcykgZnJvbSB0aGUgZ2VvIHBvaW50IHNwZWNpZmllZCBpbiB0aGUgJG5lYXJTcGhlcmUgb3BlcmF0b3IuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxGbG9hdCxcbiAgICB9LFxuICAgIG1heERpc3RhbmNlSW5LaWxvbWV0ZXJzOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIG1heERpc3RhbmNlSW5LaWxvbWV0ZXJzIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIGF0IGEgbWF4IGRpc3RhbmNlIChpbiBraWxvbWV0ZXJzKSBmcm9tIHRoZSBnZW8gcG9pbnQgc3BlY2lmaWVkIGluIHRoZSAkbmVhclNwaGVyZSBvcGVyYXRvci4nLFxuICAgICAgdHlwZTogR3JhcGhRTEZsb2F0LFxuICAgIH0sXG4gICAgd2l0aGluOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIHdpdGhpbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyB3aXRoaW4gYSBzcGVjaWZpZWQgYm94LicsXG4gICAgICB0eXBlOiBXSVRISU5fSU5QVVQsXG4gICAgfSxcbiAgICBnZW9XaXRoaW46IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgZ2VvV2l0aGluIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIHdpdGhpbiBhIHNwZWNpZmllZCBwb2x5Z29uIG9yIHNwaGVyZS4nLFxuICAgICAgdHlwZTogR0VPX1dJVEhJTl9JTlBVVCxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFBPTFlHT05fV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdQb2x5Z29uV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgUG9seWdvbldoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBQb2x5Z29uLicsXG4gIGZpZWxkczoge1xuICAgIGV4aXN0cyxcbiAgICBnZW9JbnRlcnNlY3RzOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGdlb0ludGVyc2VjdHMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBwb2x5Z29uIGZpZWxkIGludGVyc2VjdCBhIHNwZWNpZmllZCBwb2ludC4nLFxuICAgICAgdHlwZTogR0VPX0lOVEVSU0VDVFNfSU5QVVQsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBFTEVNRU5UID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0VsZW1lbnQnLFxuICBkZXNjcmlwdGlvbjogXCJUaGUgRWxlbWVudCBvYmplY3QgdHlwZSBpcyB1c2VkIHRvIHJldHVybiBhcnJheSBpdGVtcycgdmFsdWUuXCIsXG4gIGZpZWxkczoge1xuICAgIHZhbHVlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1JldHVybiB0aGUgdmFsdWUgb2YgdGhlIGVsZW1lbnQgaW4gdGhlIGFycmF5JyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChBTlkpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuLy8gRGVmYXVsdCBzdGF0aWMgdW5pb24gdHlwZSwgd2UgdXBkYXRlIHR5cGVzIGFuZCByZXNvbHZlVHlwZSBmdW5jdGlvbiBsYXRlclxubGV0IEFSUkFZX1JFU1VMVDtcblxuY29uc3QgbG9hZEFycmF5UmVzdWx0ID0gKHBhcnNlR3JhcGhRTFNjaGVtYSwgcGFyc2VDbGFzc2VzQXJyYXkpID0+IHtcbiAgY29uc3QgY2xhc3NUeXBlcyA9IHBhcnNlQ2xhc3Nlc0FycmF5XG4gICAgLmZpbHRlcihwYXJzZUNsYXNzID0+XG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW3BhcnNlQ2xhc3MuY2xhc3NOYW1lXS5jbGFzc0dyYXBoUUxPdXRwdXRUeXBlID8gdHJ1ZSA6IGZhbHNlXG4gICAgKVxuICAgIC5tYXAoXG4gICAgICBwYXJzZUNsYXNzID0+IHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbcGFyc2VDbGFzcy5jbGFzc05hbWVdLmNsYXNzR3JhcGhRTE91dHB1dFR5cGVcbiAgICApO1xuICBBUlJBWV9SRVNVTFQgPSBuZXcgR3JhcGhRTFVuaW9uVHlwZSh7XG4gICAgbmFtZTogJ0FycmF5UmVzdWx0JyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdVc2UgSW5saW5lIEZyYWdtZW50IG9uIEFycmF5IHRvIGdldCByZXN1bHRzOiBodHRwczovL2dyYXBocWwub3JnL2xlYXJuL3F1ZXJpZXMvI2lubGluZS1mcmFnbWVudHMnLFxuICAgIHR5cGVzOiAoKSA9PiBbRUxFTUVOVCwgLi4uY2xhc3NUeXBlc10sXG4gICAgcmVzb2x2ZVR5cGU6IHZhbHVlID0+IHtcbiAgICAgIGlmICh2YWx1ZS5fX3R5cGUgPT09ICdPYmplY3QnICYmIHZhbHVlLmNsYXNzTmFtZSAmJiB2YWx1ZS5vYmplY3RJZCkge1xuICAgICAgICBpZiAocGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1t2YWx1ZS5jbGFzc05hbWVdKSB7XG4gICAgICAgICAgcmV0dXJuIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbdmFsdWUuY2xhc3NOYW1lXS5jbGFzc0dyYXBoUUxPdXRwdXRUeXBlLm5hbWU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIEVMRU1FTlQubmFtZTtcbiAgICAgICAgfVxuICAgICAgfSBlbHNlIHtcbiAgICAgICAgcmV0dXJuIEVMRU1FTlQubmFtZTtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKEFSUkFZX1JFU1VMVCk7XG59O1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEdyYXBoUUxVcGxvYWQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQU5ZLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKE9CSkVDVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShEQVRFLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEJZVEVTLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEZJTEUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoRklMRV9JTkZPLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEZJTEVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR0VPX1BPSU5UX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEdFT19QT0lOVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShQQVJTRV9PQkpFQ1QsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUkVBRF9QUkVGRVJFTkNFLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFJFQURfT1BUSU9OU19JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTRUFSQ0hfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoVEVYVF9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShCT1hfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoV0lUSElOX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKENFTlRFUl9TUEhFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR0VPX1dJVEhJTl9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShHRU9fSU5URVJTRUNUU19JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShJRF9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTVFJJTkdfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoTlVNQkVSX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEJPT0xFQU5fV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQVJSQVlfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoS0VZX1ZBTFVFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKE9CSkVDVF9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShEQVRFX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEJZVEVTX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEZJTEVfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR0VPX1BPSU5UX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFBPTFlHT05fV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoRUxFTUVOVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShBQ0xfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoVVNFUl9BQ0xfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUk9MRV9BQ0xfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUFVCTElDX0FDTF9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShBQ0wsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoVVNFUl9BQ0wsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUk9MRV9BQ0wsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUFVCTElDX0FDTCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTVUJRVUVSWV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTRUxFQ1RfSU5QVVQsIHRydWUpO1xufTtcblxuZXhwb3J0IHtcbiAgR3JhcGhRTFVwbG9hZCxcbiAgVHlwZVZhbGlkYXRpb25FcnJvcixcbiAgcGFyc2VTdHJpbmdWYWx1ZSxcbiAgcGFyc2VJbnRWYWx1ZSxcbiAgcGFyc2VGbG9hdFZhbHVlLFxuICBwYXJzZUJvb2xlYW5WYWx1ZSxcbiAgcGFyc2VWYWx1ZSxcbiAgcGFyc2VMaXN0VmFsdWVzLFxuICBwYXJzZU9iamVjdEZpZWxkcyxcbiAgQU5ZLFxuICBPQkpFQ1QsXG4gIHBhcnNlRGF0ZUlzb1ZhbHVlLFxuICBzZXJpYWxpemVEYXRlSXNvLFxuICBEQVRFLFxuICBCWVRFUyxcbiAgcGFyc2VGaWxlVmFsdWUsXG4gIFNVQlFVRVJZX0lOUFVULFxuICBTRUxFQ1RfSU5QVVQsXG4gIEZJTEUsXG4gIEZJTEVfSU5GTyxcbiAgRklMRV9JTlBVVCxcbiAgR0VPX1BPSU5UX0ZJRUxEUyxcbiAgR0VPX1BPSU5UX0lOUFVULFxuICBHRU9fUE9JTlQsXG4gIFBPTFlHT05fSU5QVVQsXG4gIFBPTFlHT04sXG4gIE9CSkVDVF9JRCxcbiAgQ0xBU1NfTkFNRV9BVFQsXG4gIEdMT0JBTF9PUl9PQkpFQ1RfSURfQVRULFxuICBPQkpFQ1RfSURfQVRULFxuICBVUERBVEVEX0FUX0FUVCxcbiAgQ1JFQVRFRF9BVF9BVFQsXG4gIElOUFVUX0ZJRUxEUyxcbiAgQ1JFQVRFX1JFU1VMVF9GSUVMRFMsXG4gIFVQREFURV9SRVNVTFRfRklFTERTLFxuICBQQVJTRV9PQkpFQ1RfRklFTERTLFxuICBQQVJTRV9PQkpFQ1QsXG4gIFNFU1NJT05fVE9LRU5fQVRULFxuICBSRUFEX1BSRUZFUkVOQ0UsXG4gIFJFQURfUFJFRkVSRU5DRV9BVFQsXG4gIElOQ0xVREVfUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgU1VCUVVFUllfUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgUkVBRF9PUFRJT05TX0lOUFVULFxuICBSRUFEX09QVElPTlNfQVRULFxuICBXSEVSRV9BVFQsXG4gIFNLSVBfQVRULFxuICBMSU1JVF9BVFQsXG4gIENPVU5UX0FUVCxcbiAgU0VBUkNIX0lOUFVULFxuICBURVhUX0lOUFVULFxuICBCT1hfSU5QVVQsXG4gIFdJVEhJTl9JTlBVVCxcbiAgQ0VOVEVSX1NQSEVSRV9JTlBVVCxcbiAgR0VPX1dJVEhJTl9JTlBVVCxcbiAgR0VPX0lOVEVSU0VDVFNfSU5QVVQsXG4gIGVxdWFsVG8sXG4gIG5vdEVxdWFsVG8sXG4gIGxlc3NUaGFuLFxuICBsZXNzVGhhbk9yRXF1YWxUbyxcbiAgZ3JlYXRlclRoYW4sXG4gIGdyZWF0ZXJUaGFuT3JFcXVhbFRvLFxuICBpbk9wLFxuICBub3RJbixcbiAgZXhpc3RzLFxuICBtYXRjaGVzUmVnZXgsXG4gIG9wdGlvbnMsXG4gIGluUXVlcnlLZXksXG4gIG5vdEluUXVlcnlLZXksXG4gIElEX1dIRVJFX0lOUFVULFxuICBTVFJJTkdfV0hFUkVfSU5QVVQsXG4gIE5VTUJFUl9XSEVSRV9JTlBVVCxcbiAgQk9PTEVBTl9XSEVSRV9JTlBVVCxcbiAgQVJSQVlfV0hFUkVfSU5QVVQsXG4gIEtFWV9WQUxVRV9JTlBVVCxcbiAgT0JKRUNUX1dIRVJFX0lOUFVULFxuICBEQVRFX1dIRVJFX0lOUFVULFxuICBCWVRFU19XSEVSRV9JTlBVVCxcbiAgRklMRV9XSEVSRV9JTlBVVCxcbiAgR0VPX1BPSU5UX1dIRVJFX0lOUFVULFxuICBQT0xZR09OX1dIRVJFX0lOUFVULFxuICBBUlJBWV9SRVNVTFQsXG4gIEVMRU1FTlQsXG4gIEFDTF9JTlBVVCxcbiAgVVNFUl9BQ0xfSU5QVVQsXG4gIFJPTEVfQUNMX0lOUFVULFxuICBQVUJMSUNfQUNMX0lOUFVULFxuICBBQ0wsXG4gIFVTRVJfQUNMLFxuICBST0xFX0FDTCxcbiAgUFVCTElDX0FDTCxcbiAgbG9hZCxcbiAgbG9hZEFycmF5UmVzdWx0LFxufTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUE7QUFnQkE7QUFBMkM7QUFBQTtBQUFBO0FBQUE7QUFBQTtBQUUzQyxNQUFNQSxtQkFBbUIsU0FBU0MsS0FBSyxDQUFDO0VBQ3RDQyxXQUFXLENBQUNDLEtBQUssRUFBRUMsSUFBSSxFQUFFO0lBQ3ZCLEtBQUssQ0FBRSxHQUFFRCxLQUFNLG1CQUFrQkMsSUFBSyxFQUFDLENBQUM7RUFDMUM7QUFDRjtBQUFDO0FBRUQsTUFBTUMsZ0JBQWdCLEdBQUdGLEtBQUssSUFBSTtFQUNoQyxJQUFJLE9BQU9BLEtBQUssS0FBSyxRQUFRLEVBQUU7SUFDN0IsT0FBT0EsS0FBSztFQUNkO0VBRUEsTUFBTSxJQUFJSCxtQkFBbUIsQ0FBQ0csS0FBSyxFQUFFLFFBQVEsQ0FBQztBQUNoRCxDQUFDO0FBQUM7QUFFRixNQUFNRyxhQUFhLEdBQUdILEtBQUssSUFBSTtFQUM3QixJQUFJLE9BQU9BLEtBQUssS0FBSyxRQUFRLEVBQUU7SUFDN0IsTUFBTUksR0FBRyxHQUFHQyxNQUFNLENBQUNMLEtBQUssQ0FBQztJQUN6QixJQUFJSyxNQUFNLENBQUNDLFNBQVMsQ0FBQ0YsR0FBRyxDQUFDLEVBQUU7TUFDekIsT0FBT0EsR0FBRztJQUNaO0VBQ0Y7RUFFQSxNQUFNLElBQUlQLG1CQUFtQixDQUFDRyxLQUFLLEVBQUUsS0FBSyxDQUFDO0FBQzdDLENBQUM7QUFBQztBQUVGLE1BQU1PLGVBQWUsR0FBR1AsS0FBSyxJQUFJO0VBQy9CLElBQUksT0FBT0EsS0FBSyxLQUFLLFFBQVEsRUFBRTtJQUM3QixNQUFNUSxLQUFLLEdBQUdILE1BQU0sQ0FBQ0wsS0FBSyxDQUFDO0lBQzNCLElBQUksQ0FBQ1MsS0FBSyxDQUFDRCxLQUFLLENBQUMsRUFBRTtN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