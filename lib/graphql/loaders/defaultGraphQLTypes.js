"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.loadArrayResult = exports.load = exports.PUBLIC_ACL = exports.ROLE_ACL = exports.USER_ACL = exports.ACL = exports.PUBLIC_ACL_INPUT = exports.ROLE_ACL_INPUT = exports.USER_ACL_INPUT = exports.ACL_INPUT = exports.ELEMENT = exports.ARRAY_RESULT = exports.POLYGON_WHERE_INPUT = exports.GEO_POINT_WHERE_INPUT = exports.FILE_WHERE_INPUT = exports.BYTES_WHERE_INPUT = exports.DATE_WHERE_INPUT = exports.OBJECT_WHERE_INPUT = exports.KEY_VALUE_INPUT = exports.ARRAY_WHERE_INPUT = exports.BOOLEAN_WHERE_INPUT = exports.NUMBER_WHERE_INPUT = exports.STRING_WHERE_INPUT = exports.ID_WHERE_INPUT = exports.notInQueryKey = exports.inQueryKey = exports.options = exports.matchesRegex = exports.exists = exports.notIn = exports.inOp = exports.greaterThanOrEqualTo = exports.greaterThan = exports.lessThanOrEqualTo = exports.lessThan = exports.notEqualTo = exports.equalTo = exports.GEO_INTERSECTS_INPUT = exports.GEO_WITHIN_INPUT = exports.CENTER_SPHERE_INPUT = exports.WITHIN_INPUT = exports.BOX_INPUT = exports.TEXT_INPUT = exports.SEARCH_INPUT = exports.COUNT_ATT = exports.LIMIT_ATT = exports.SKIP_ATT = exports.WHERE_ATT = exports.READ_OPTIONS_ATT = exports.READ_OPTIONS_INPUT = exports.SUBQUERY_READ_PREFERENCE_ATT = exports.INCLUDE_READ_PREFERENCE_ATT = exports.READ_PREFERENCE_ATT = exports.READ_PREFERENCE = exports.SESSION_TOKEN_ATT = exports.PARSE_OBJECT = exports.PARSE_OBJECT_FIELDS = exports.UPDATE_RESULT_FIELDS = exports.CREATE_RESULT_FIELDS = exports.INPUT_FIELDS = exports.CREATED_AT_ATT = exports.UPDATED_AT_ATT = exports.OBJECT_ID_ATT = exports.GLOBAL_OR_OBJECT_ID_ATT = exports.CLASS_NAME_ATT = exports.OBJECT_ID = exports.POLYGON = exports.POLYGON_INPUT = exports.GEO_POINT = exports.GEO_POINT_INPUT = exports.GEO_POINT_FIELDS = exports.FILE_INFO = exports.FILE = exports.SELECT_INPUT = exports.SUBQUERY_INPUT = exports.parseFileValue = exports.BYTES = exports.DATE = exports.serializeDateIso = exports.parseDateIsoValue = exports.OBJECT = exports.ANY = exports.parseObjectFields = exports.parseListValues = exports.parseValue = exports.parseBooleanValue = exports.parseFloatValue = exports.parseIntValue = exports.parseStringValue = exports.TypeValidationError = void 0;

var _graphql = require("graphql");

var _graphqlUpload = require("graphql-upload");

function ownKeys(object, enumerableOnly) { var keys = Object.keys(object); if (Object.getOwnPropertySymbols) { var symbols = Object.getOwnPropertySymbols(object); if (enumerableOnly) symbols = symbols.filter(function (sym) { return Object.getOwnPropertyDescriptor(object, sym).enumerable; }); keys.push.apply(keys, symbols); } return keys; }

function _objectSpread(target) { for (var i = 1; i < arguments.length; i++) { var source = arguments[i] != null ? arguments[i] : {}; if (i % 2) { ownKeys(Object(source), true).forEach(function (key) { _defineProperty(target, key, source[key]); }); } else if (Object.getOwnPropertyDescriptors) { Object.defineProperties(target, Object.getOwnPropertyDescriptors(source)); } else { ownKeys(Object(source)).forEach(function (key) { Object.defineProperty(target, key, Object.getOwnPropertyDescriptor(source, key)); }); } } return target; }

function _defineProperty(obj, key, value) { if (key in obj) { Object.defineProperty(obj, key, { value: value, enumerable: true, configurable: true, writable: true }); } else { obj[key] = value; } return obj; }

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
    return fields.reduce((object, field) => _objectSpread({}, object, {
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
    return value.toUTCString();
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
              userId: rule,
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

const PARSE_OBJECT_FIELDS = _objectSpread({}, CREATE_RESULT_FIELDS, {}, UPDATE_RESULT_FIELDS, {}, INPUT_FIELDS, {
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
}); // Default static union type, we update types and resolveType function later

exports.ELEMENT = ELEMENT;
let ARRAY_RESULT;
exports.ARRAY_RESULT = ARRAY_RESULT;

const loadArrayResult = (parseGraphQLSchema, parseClasses) => {
  const classTypes = parseClasses.filter(parseClass => parseGraphQLSchema.parseClassTypes[parseClass.className].classGraphQLOutputType ? true : false).map(parseClass => parseGraphQLSchema.parseClassTypes[parseClass.className].classGraphQLOutputType);
  exports.ARRAY_RESULT = ARRAY_RESULT = new _graphql.GraphQLUnionType({
    name: 'ArrayResult',
    description: 'Use Inline Fragment on Array to get results: https://graphql.org/learn/queries/#inline-fragments',
    types: () => [ELEMENT, ...classTypes],
    resolveType: value => {
      if (value.__type === 'Object' && value.className && value.objectId) {
        if (parseGraphQLSchema.parseClassTypes[value.className]) {
          return parseGraphQLSchema.parseClassTypes[value.className].classGraphQLOutputType;
        } else {
          return ELEMENT;
        }
      } else {
        return ELEMENT;
      }
    }
  });
  parseGraphQLSchema.graphQLTypes.push(ARRAY_RESULT);
};

exports.loadArrayResult = loadArrayResult;

const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLType(_graphqlUpload.GraphQLUpload, true);
  parseGraphQLSchema.addGraphQLType(ANY, true);
  parseGraphQLSchema.addGraphQLType(OBJECT, true);
  parseGraphQLSchema.addGraphQLType(DATE, true);
  parseGraphQLSchema.addGraphQLType(BYTES, true);
  parseGraphQLSchema.addGraphQLType(FILE, true);
  parseGraphQLSchema.addGraphQLType(FILE_INFO, true);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcy5qcyJdLCJuYW1lcyI6WyJUeXBlVmFsaWRhdGlvbkVycm9yIiwiRXJyb3IiLCJjb25zdHJ1Y3RvciIsInZhbHVlIiwidHlwZSIsInBhcnNlU3RyaW5nVmFsdWUiLCJwYXJzZUludFZhbHVlIiwiaW50IiwiTnVtYmVyIiwiaXNJbnRlZ2VyIiwicGFyc2VGbG9hdFZhbHVlIiwiZmxvYXQiLCJpc05hTiIsInBhcnNlQm9vbGVhblZhbHVlIiwicGFyc2VWYWx1ZSIsImtpbmQiLCJLaW5kIiwiU1RSSU5HIiwiSU5UIiwiRkxPQVQiLCJCT09MRUFOIiwiTElTVCIsInBhcnNlTGlzdFZhbHVlcyIsInZhbHVlcyIsIk9CSkVDVCIsInBhcnNlT2JqZWN0RmllbGRzIiwiZmllbGRzIiwiQXJyYXkiLCJpc0FycmF5IiwibWFwIiwicmVkdWNlIiwib2JqZWN0IiwiZmllbGQiLCJuYW1lIiwiQU5ZIiwiR3JhcGhRTFNjYWxhclR5cGUiLCJkZXNjcmlwdGlvbiIsInNlcmlhbGl6ZSIsInBhcnNlTGl0ZXJhbCIsImFzdCIsInBhcnNlRGF0ZUlzb1ZhbHVlIiwiZGF0ZSIsIkRhdGUiLCJzZXJpYWxpemVEYXRlSXNvIiwidG9VVENTdHJpbmciLCJwYXJzZURhdGVJc29MaXRlcmFsIiwiREFURSIsIl9fdHlwZSIsImlzbyIsImZpbmQiLCJCWVRFUyIsImJhc2U2NCIsInBhcnNlRmlsZVZhbHVlIiwidXJsIiwidW5kZWZpbmVkIiwiRklMRSIsIkZJTEVfSU5GTyIsIkdyYXBoUUxPYmplY3RUeXBlIiwiR3JhcGhRTE5vbk51bGwiLCJHcmFwaFFMU3RyaW5nIiwiR0VPX1BPSU5UX0ZJRUxEUyIsImxhdGl0dWRlIiwiR3JhcGhRTEZsb2F0IiwibG9uZ2l0dWRlIiwiR0VPX1BPSU5UX0lOUFVUIiwiR3JhcGhRTElucHV0T2JqZWN0VHlwZSIsIkdFT19QT0lOVCIsIlBPTFlHT05fSU5QVVQiLCJHcmFwaFFMTGlzdCIsIlBPTFlHT04iLCJVU0VSX0FDTF9JTlBVVCIsInVzZXJJZCIsIkdyYXBoUUxJRCIsInJlYWQiLCJHcmFwaFFMQm9vbGVhbiIsIndyaXRlIiwiUk9MRV9BQ0xfSU5QVVQiLCJyb2xlTmFtZSIsIlBVQkxJQ19BQ0xfSU5QVVQiLCJBQ0xfSU5QVVQiLCJ1c2VycyIsInJvbGVzIiwicHVibGljIiwiVVNFUl9BQ0wiLCJST0xFX0FDTCIsIlBVQkxJQ19BQ0wiLCJBQ0wiLCJyZXNvbHZlIiwicCIsIk9iamVjdCIsImtleXMiLCJmb3JFYWNoIiwicnVsZSIsImluZGV4T2YiLCJwdXNoIiwibGVuZ3RoIiwicmVwbGFjZSIsIk9CSkVDVF9JRCIsIkNMQVNTX05BTUVfQVRUIiwiR0xPQkFMX09SX09CSkVDVF9JRF9BVFQiLCJPQkpFQ1RfSURfQVRUIiwiQ1JFQVRFRF9BVF9BVFQiLCJVUERBVEVEX0FUX0FUVCIsIklOUFVUX0ZJRUxEUyIsIkNSRUFURV9SRVNVTFRfRklFTERTIiwib2JqZWN0SWQiLCJjcmVhdGVkQXQiLCJVUERBVEVfUkVTVUxUX0ZJRUxEUyIsInVwZGF0ZWRBdCIsIlBBUlNFX09CSkVDVF9GSUVMRFMiLCJQQVJTRV9PQkpFQ1QiLCJHcmFwaFFMSW50ZXJmYWNlVHlwZSIsIlNFU1NJT05fVE9LRU5fQVRUIiwiUkVBRF9QUkVGRVJFTkNFIiwiR3JhcGhRTEVudW1UeXBlIiwiUFJJTUFSWSIsIlBSSU1BUllfUFJFRkVSUkVEIiwiU0VDT05EQVJZIiwiU0VDT05EQVJZX1BSRUZFUlJFRCIsIk5FQVJFU1QiLCJSRUFEX1BSRUZFUkVOQ0VfQVRUIiwiSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRUIiwiU1VCUVVFUllfUkVBRF9QUkVGRVJFTkNFX0FUVCIsIlJFQURfT1BUSU9OU19JTlBVVCIsInJlYWRQcmVmZXJlbmNlIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsIlJFQURfT1BUSU9OU19BVFQiLCJXSEVSRV9BVFQiLCJTS0lQX0FUVCIsIkdyYXBoUUxJbnQiLCJMSU1JVF9BVFQiLCJDT1VOVF9BVFQiLCJTRUFSQ0hfSU5QVVQiLCJ0ZXJtIiwibGFuZ3VhZ2UiLCJjYXNlU2Vuc2l0aXZlIiwiZGlhY3JpdGljU2Vuc2l0aXZlIiwiVEVYVF9JTlBVVCIsInNlYXJjaCIsIkJPWF9JTlBVVCIsImJvdHRvbUxlZnQiLCJ1cHBlclJpZ2h0IiwiV0lUSElOX0lOUFVUIiwiYm94IiwiQ0VOVEVSX1NQSEVSRV9JTlBVVCIsImNlbnRlciIsImRpc3RhbmNlIiwiR0VPX1dJVEhJTl9JTlBVVCIsInBvbHlnb24iLCJjZW50ZXJTcGhlcmUiLCJHRU9fSU5URVJTRUNUU19JTlBVVCIsInBvaW50IiwiZXF1YWxUbyIsIm5vdEVxdWFsVG8iLCJsZXNzVGhhbiIsImxlc3NUaGFuT3JFcXVhbFRvIiwiZ3JlYXRlclRoYW4iLCJncmVhdGVyVGhhbk9yRXF1YWxUbyIsImluT3AiLCJub3RJbiIsImV4aXN0cyIsIm1hdGNoZXNSZWdleCIsIm9wdGlvbnMiLCJTVUJRVUVSWV9JTlBVVCIsImNsYXNzTmFtZSIsIndoZXJlIiwiYXNzaWduIiwiU0VMRUNUX0lOUFVUIiwicXVlcnkiLCJrZXkiLCJpblF1ZXJ5S2V5Iiwibm90SW5RdWVyeUtleSIsIklEX1dIRVJFX0lOUFVUIiwiaW4iLCJTVFJJTkdfV0hFUkVfSU5QVVQiLCJ0ZXh0IiwiTlVNQkVSX1dIRVJFX0lOUFVUIiwiQk9PTEVBTl9XSEVSRV9JTlBVVCIsIkFSUkFZX1dIRVJFX0lOUFVUIiwiY29udGFpbmVkQnkiLCJjb250YWlucyIsIktFWV9WQUxVRV9JTlBVVCIsIk9CSkVDVF9XSEVSRV9JTlBVVCIsIkRBVEVfV0hFUkVfSU5QVVQiLCJCWVRFU19XSEVSRV9JTlBVVCIsIkZJTEVfV0hFUkVfSU5QVVQiLCJHRU9fUE9JTlRfV0hFUkVfSU5QVVQiLCJuZWFyU3BoZXJlIiwibWF4RGlzdGFuY2UiLCJtYXhEaXN0YW5jZUluUmFkaWFucyIsIm1heERpc3RhbmNlSW5NaWxlcyIsIm1heERpc3RhbmNlSW5LaWxvbWV0ZXJzIiwid2l0aGluIiwiZ2VvV2l0aGluIiwiUE9MWUdPTl9XSEVSRV9JTlBVVCIsImdlb0ludGVyc2VjdHMiLCJFTEVNRU5UIiwiQVJSQVlfUkVTVUxUIiwibG9hZEFycmF5UmVzdWx0IiwicGFyc2VHcmFwaFFMU2NoZW1hIiwicGFyc2VDbGFzc2VzIiwiY2xhc3NUeXBlcyIsImZpbHRlciIsInBhcnNlQ2xhc3MiLCJwYXJzZUNsYXNzVHlwZXMiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwiR3JhcGhRTFVuaW9uVHlwZSIsInR5cGVzIiwicmVzb2x2ZVR5cGUiLCJncmFwaFFMVHlwZXMiLCJsb2FkIiwiYWRkR3JhcGhRTFR5cGUiLCJHcmFwaFFMVXBsb2FkIl0sIm1hcHBpbmdzIjoiOzs7Ozs7O0FBQUE7O0FBZ0JBOzs7Ozs7OztBQUVBLE1BQU1BLG1CQUFOLFNBQWtDQyxLQUFsQyxDQUF3QztBQUN0Q0MsRUFBQUEsV0FBVyxDQUFDQyxLQUFELEVBQVFDLElBQVIsRUFBYztBQUN2QixVQUFPLEdBQUVELEtBQU0sbUJBQWtCQyxJQUFLLEVBQXRDO0FBQ0Q7O0FBSHFDOzs7O0FBTXhDLE1BQU1DLGdCQUFnQixHQUFHRixLQUFLLElBQUk7QUFDaEMsTUFBSSxPQUFPQSxLQUFQLEtBQWlCLFFBQXJCLEVBQStCO0FBQzdCLFdBQU9BLEtBQVA7QUFDRDs7QUFFRCxRQUFNLElBQUlILG1CQUFKLENBQXdCRyxLQUF4QixFQUErQixRQUEvQixDQUFOO0FBQ0QsQ0FORDs7OztBQVFBLE1BQU1HLGFBQWEsR0FBR0gsS0FBSyxJQUFJO0FBQzdCLE1BQUksT0FBT0EsS0FBUCxLQUFpQixRQUFyQixFQUErQjtBQUM3QixVQUFNSSxHQUFHLEdBQUdDLE1BQU0sQ0FBQ0wsS0FBRCxDQUFsQjs7QUFDQSxRQUFJSyxNQUFNLENBQUNDLFNBQVAsQ0FBaUJGLEdBQWpCLENBQUosRUFBMkI7QUFDekIsYUFBT0EsR0FBUDtBQUNEO0FBQ0Y7O0FBRUQsUUFBTSxJQUFJUCxtQkFBSixDQUF3QkcsS0FBeEIsRUFBK0IsS0FBL0Is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SSxTQUFsQyxFQUE2QyxJQUE3QztBQUNBeUgsRUFBQUEsa0JBQWtCLENBQUNZLGNBQW5CLENBQWtDOUksY0FBbEMsRUFBa0QsSUFBbEQ7QUFDQWtJLEVBQUFBLGtCQUFrQixDQUFDWSxjQUFuQixDQUFrQ3hJLGNBQWxDLEVBQWtELElBQWxEO0FBQ0E0SCxFQUFBQSxrQkFBa0IsQ0FBQ1ksY0FBbkIsQ0FBa0N0SSxnQkFBbEMsRUFBb0QsSUFBcEQ7QUFDQTBILEVBQUFBLGtCQUFrQixDQUFDWSxjQUFuQixDQUFrQzlILEdBQWxDLEVBQXVDLElBQXZDO0FBQ0FrSCxFQUFBQSxrQkFBa0IsQ0FBQ1ksY0FBbkIsQ0FBa0NqSSxRQUFsQyxFQUE0QyxJQUE1QztBQUNBcUgsRUFBQUEsa0JBQWtCLENBQUNZLGNBQW5CLENBQWtDaEksUUFBbEMsRUFBNEMsSUFBNUM7QUFDQW9ILEVBQUFBLGtCQUFrQixDQUFDWSxjQUFuQixDQUFrQy9ILFVBQWxDLEVBQThDLElBQTlDO0FBQ0FtSCxFQUFBQSxrQkFBa0IsQ0FBQ1ksY0FBbkIsQ0FBa0NoRCxjQUFsQyxFQUFrRCxJQUFsRDtBQUNBb0MsRUFBQUEsa0JBQWtCLENBQUNZLGNBQW5CLENBQWtDNUMsWUFBbEMsRUFBZ0QsSUFBaEQ7QUFDRCxDQTNDRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIEtpbmQsXG4gIEdyYXBoUUxOb25OdWxsLFxuICBHcmFwaFFMU2NhbGFyVHlwZSxcbiAgR3JhcGhRTElELFxuICBHcmFwaFFMU3RyaW5nLFxuICBHcmFwaFFMT2JqZWN0VHlwZSxcbiAgR3JhcGhRTEludGVyZmFjZVR5cGUsXG4gIEdyYXBoUUxFbnVtVHlwZSxcbiAgR3JhcGhRTEludCxcbiAgR3JhcGhRTEZsb2F0LFxuICBHcmFwaFFMTGlzdCxcbiAgR3JhcGhRTElucHV0T2JqZWN0VHlwZSxcbiAgR3JhcGhRTEJvb2xlYW4sXG4gIEdyYXBoUUxVbmlvblR5cGUsXG59IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgR3JhcGhRTFVwbG9hZCB9IGZyb20gJ2dyYXBocWwtdXBsb2FkJztcblxuY2xhc3MgVHlwZVZhbGlkYXRpb25FcnJvciBleHRlbmRzIEVycm9yIHtcbiAgY29uc3RydWN0b3IodmFsdWUsIHR5cGUpIHtcbiAgICBzdXBlcihgJHt2YWx1ZX0gaXMgbm90IGEgdmFsaWQgJHt0eXBlfWApO1xuICB9XG59XG5cbmNvbnN0IHBhcnNlU3RyaW5nVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdTdHJpbmcnKTtcbn07XG5cbmNvbnN0IHBhcnNlSW50VmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgY29uc3QgaW50ID0gTnVtYmVyKHZhbHVlKTtcbiAgICBpZiAoTnVtYmVyLmlzSW50ZWdlcihpbnQpKSB7XG4gICAgICByZXR1cm4gaW50O1xuICAgIH1cbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnSW50Jyk7XG59O1xuXG5jb25zdCBwYXJzZUZsb2F0VmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgY29uc3QgZmxvYXQgPSBOdW1iZXIodmFsdWUpO1xuICAgIGlmICghaXNOYU4oZmxvYXQpKSB7XG4gICAgICByZXR1cm4gZmxvYXQ7XG4gICAgfVxuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdGbG9hdCcpO1xufTtcblxuY29uc3QgcGFyc2VCb29sZWFuVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdib29sZWFuJykge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnQm9vbGVhbicpO1xufTtcblxuY29uc3QgcGFyc2VWYWx1ZSA9IHZhbHVlID0+IHtcbiAgc3dpdGNoICh2YWx1ZS5raW5kKSB7XG4gICAgY2FzZSBLaW5kLlNUUklORzpcbiAgICAgIHJldHVybiBwYXJzZVN0cmluZ1ZhbHVlKHZhbHVlLnZhbHVlKTtcblxuICAgIGNhc2UgS2luZC5JTlQ6XG4gICAgICByZXR1cm4gcGFyc2VJbnRWYWx1ZSh2YWx1ZS52YWx1ZSk7XG5cbiAgICBjYXNlIEtpbmQuRkxPQVQ6XG4gICAgICByZXR1cm4gcGFyc2VGbG9hdFZhbHVlKHZhbHVlLnZhbHVlKTtcblxuICAgIGNhc2UgS2luZC5CT09MRUFOOlxuICAgICAgcmV0dXJuIHBhcnNlQm9vbGVhblZhbHVlKHZhbHVlLnZhbHVlKTtcblxuICAgIGNhc2UgS2luZC5MSVNUOlxuICAgICAgcmV0dXJuIHBhcnNlTGlzdFZhbHVlcyh2YWx1ZS52YWx1ZXMpO1xuXG4gICAgY2FzZSBLaW5kLk9CSkVDVDpcbiAgICAgIHJldHVybiBwYXJzZU9iamVjdEZpZWxkcyh2YWx1ZS5maWVsZHMpO1xuXG4gICAgZGVmYXVsdDpcbiAgICAgIHJldHVybiB2YWx1ZS52YWx1ZTtcbiAgfVxufTtcblxuY29uc3QgcGFyc2VMaXN0VmFsdWVzID0gdmFsdWVzID0+IHtcbiAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWVzKSkge1xuICAgIHJldHVybiB2YWx1ZXMubWFwKHZhbHVlID0+IHBhcnNlVmFsdWUodmFsdWUpKTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlcywgJ0xpc3QnKTtcbn07XG5cbmNvbnN0IHBhcnNlT2JqZWN0RmllbGRzID0gZmllbGRzID0+IHtcbiAgaWYgKEFycmF5LmlzQXJyYXkoZmllbGRzKSkge1xuICAgIHJldHVybiBmaWVsZHMucmVkdWNlKFxuICAgICAgKG9iamVjdCwgZmllbGQpID0+ICh7XG4gICAgICAgIC4uLm9iamVjdCxcbiAgICAgICAgW2ZpZWxkLm5hbWUudmFsdWVdOiBwYXJzZVZhbHVlKGZpZWxkLnZhbHVlKSxcbiAgICAgIH0pLFxuICAgICAge31cbiAgICApO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IoZmllbGRzLCAnT2JqZWN0Jyk7XG59O1xuXG5jb25zdCBBTlkgPSBuZXcgR3JhcGhRTFNjYWxhclR5cGUoe1xuICBuYW1lOiAnQW55JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBBbnkgc2NhbGFyIHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIGFuZCB0eXBlcyB0aGF0IGludm9sdmUgYW55IHR5cGUgb2YgdmFsdWUuJyxcbiAgcGFyc2VWYWx1ZTogdmFsdWUgPT4gdmFsdWUsXG4gIHNlcmlhbGl6ZTogdmFsdWUgPT4gdmFsdWUsXG4gIHBhcnNlTGl0ZXJhbDogYXN0ID0+IHBhcnNlVmFsdWUoYXN0KSxcbn0pO1xuXG5jb25zdCBPQkpFQ1QgPSBuZXcgR3JhcGhRTFNjYWxhclR5cGUoe1xuICBuYW1lOiAnT2JqZWN0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBPYmplY3Qgc2NhbGFyIHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIGFuZCB0eXBlcyB0aGF0IGludm9sdmUgb2JqZWN0cy4nLFxuICBwYXJzZVZhbHVlKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ09iamVjdCcpO1xuICB9LFxuICBzZXJpYWxpemUodmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnT2JqZWN0Jyk7XG4gIH0sXG4gIHBhcnNlTGl0ZXJhbChhc3QpIHtcbiAgICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuT0JKRUNUKSB7XG4gICAgICByZXR1cm4gcGFyc2VPYmplY3RGaWVsZHMoYXN0LmZpZWxkcyk7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IoYXN0LmtpbmQsICdPYmplY3QnKTtcbiAgfSxcbn0pO1xuXG5jb25zdCBwYXJzZURhdGVJc29WYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICBjb25zdCBkYXRlID0gbmV3IERhdGUodmFsdWUpO1xuICAgIGlmICghaXNOYU4oZGF0ZSkpIHtcbiAgICAgIHJldHVybiBkYXRlO1xuICAgIH1cbiAgfSBlbHNlIGlmICh2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0RhdGUnKTtcbn07XG5cbmNvbnN0IHNlcmlhbGl6ZURhdGVJc28gPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG4gIGlmICh2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICByZXR1cm4gdmFsdWUudG9VVENTdHJpbmcoKTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRGF0ZScpO1xufTtcblxuY29uc3QgcGFyc2VEYXRlSXNvTGl0ZXJhbCA9IGFzdCA9PiB7XG4gIGlmIChhc3Qua2luZCA9PT0gS2luZC5TVFJJTkcpIHtcbiAgICByZXR1cm4gcGFyc2VEYXRlSXNvVmFsdWUoYXN0LnZhbHVlKTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnRGF0ZScpO1xufTtcblxuY29uc3QgREFURSA9IG5ldyBHcmFwaFFMU2NhbGFyVHlwZSh7XG4gIG5hbWU6ICdEYXRlJyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBEYXRlIHNjYWxhciB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyBhbmQgdHlwZXMgdGhhdCBpbnZvbHZlIGRhdGVzLicsXG4gIHBhcnNlVmFsdWUodmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyB8fCB2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IHBhcnNlRGF0ZUlzb1ZhbHVlKHZhbHVlKSxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnICYmXG4gICAgICB2YWx1ZS5pc29cbiAgICApIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogdmFsdWUuX190eXBlLFxuICAgICAgICBpc286IHBhcnNlRGF0ZUlzb1ZhbHVlKHZhbHVlLmlzbyksXG4gICAgICB9O1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRGF0ZScpO1xuICB9LFxuICBzZXJpYWxpemUodmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJyB8fCB2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICAgIHJldHVybiBzZXJpYWxpemVEYXRlSXNvKHZhbHVlKTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgdmFsdWUuX190eXBlID09PSAnRGF0ZScgJiZcbiAgICAgIHZhbHVlLmlzb1xuICAgICkge1xuICAgICAgcmV0dXJuIHNlcmlhbGl6ZURhdGVJc28odmFsdWUuaXNvKTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0RhdGUnKTtcbiAgfSxcbiAgcGFyc2VMaXRlcmFsKGFzdCkge1xuICAgIGlmIChhc3Qua2luZCA9PT0gS2luZC5TVFJJTkcpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ0RhdGUnLFxuICAgICAgICBpc286IHBhcnNlRGF0ZUlzb0xpdGVyYWwoYXN0KSxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChhc3Qua2luZCA9PT0gS2luZC5PQkpFQ1QpIHtcbiAgICAgIGNvbnN0IF9fdHlwZSA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnX190eXBlJyk7XG4gICAgICBjb25zdCBpc28gPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ2lzbycpO1xuICAgICAgaWYgKF9fdHlwZSAmJiBfX3R5cGUudmFsdWUgJiYgX190eXBlLnZhbHVlLnZhbHVlID09PSAnRGF0ZScgJiYgaXNvKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgX190eXBlOiBfX3R5cGUudmFsdWUudmFsdWUsXG4gICAgICAgICAgaXNvOiBwYXJzZURhdGVJc29MaXRlcmFsKGlzby52YWx1ZSksXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IoYXN0LmtpbmQsICdEYXRlJyk7XG4gIH0sXG59KTtcblxuY29uc3QgQllURVMgPSBuZXcgR3JhcGhRTFNjYWxhclR5cGUoe1xuICBuYW1lOiAnQnl0ZXMnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEJ5dGVzIHNjYWxhciB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyBhbmQgdHlwZXMgdGhhdCBpbnZvbHZlIGJhc2UgNjQgYmluYXJ5IGRhdGEuJyxcbiAgcGFyc2VWYWx1ZSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdCeXRlcycsXG4gICAgICAgIGJhc2U2NDogdmFsdWUsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICB2YWx1ZS5fX3R5cGUgPT09ICdCeXRlcycgJiZcbiAgICAgIHR5cGVvZiB2YWx1ZS5iYXNlNjQgPT09ICdzdHJpbmcnXG4gICAgKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdCeXRlcycpO1xuICB9LFxuICBzZXJpYWxpemUodmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICB2YWx1ZS5fX3R5cGUgPT09ICdCeXRlcycgJiZcbiAgICAgIHR5cGVvZiB2YWx1ZS5iYXNlNjQgPT09ICdzdHJpbmcnXG4gICAgKSB7XG4gICAgICByZXR1cm4gdmFsdWUuYmFzZTY0O1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnQnl0ZXMnKTtcbiAgfSxcbiAgcGFyc2VMaXRlcmFsKGFzdCkge1xuICAgIGlmIChhc3Qua2luZCA9PT0gS2luZC5TVFJJTkcpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ0J5dGVzJyxcbiAgICAgICAgYmFzZTY0OiBhc3QudmFsdWUsXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoYXN0LmtpbmQgPT09IEtpbmQuT0JKRUNUKSB7XG4gICAgICBjb25zdCBfX3R5cGUgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ19fdHlwZScpO1xuICAgICAgY29uc3QgYmFzZTY0ID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdiYXNlNjQnKTtcbiAgICAgIGlmIChcbiAgICAgICAgX190eXBlICYmXG4gICAgICAgIF9fdHlwZS52YWx1ZSAmJlxuICAgICAgICBfX3R5cGUudmFsdWUudmFsdWUgPT09ICdCeXRlcycgJiZcbiAgICAgICAgYmFzZTY0ICYmXG4gICAgICAgIGJhc2U2NC52YWx1ZSAmJlxuICAgICAgICB0eXBlb2YgYmFzZTY0LnZhbHVlLnZhbHVlID09PSAnc3RyaW5nJ1xuICAgICAgKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgX190eXBlOiBfX3R5cGUudmFsdWUudmFsdWUsXG4gICAgICAgICAgYmFzZTY0OiBiYXNlNjQudmFsdWUudmFsdWUsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IoYXN0LmtpbmQsICdCeXRlcycpO1xuICB9LFxufSk7XG5cbmNvbnN0IHBhcnNlRmlsZVZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiB7XG4gICAgICBfX3R5cGU6ICdGaWxlJyxcbiAgICAgIG5hbWU6IHZhbHVlLFxuICAgIH07XG4gIH0gZWxzZSBpZiAoXG4gICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgIHZhbHVlLl9fdHlwZSA9PT0gJ0ZpbGUnICYmXG4gICAgdHlwZW9mIHZhbHVlLm5hbWUgPT09ICdzdHJpbmcnICYmXG4gICAgKHZhbHVlLnVybCA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiB2YWx1ZS51cmwgPT09ICdzdHJpbmcnKVxuICApIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0ZpbGUnKTtcbn07XG5cbmNvbnN0IEZJTEUgPSBuZXcgR3JhcGhRTFNjYWxhclR5cGUoe1xuICBuYW1lOiAnRmlsZScsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgRmlsZSBzY2FsYXIgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgYW5kIHR5cGVzIHRoYXQgaW52b2x2ZSBmaWxlcy4nLFxuICBwYXJzZVZhbHVlOiBwYXJzZUZpbGVWYWx1ZSxcbiAgc2VyaWFsaXplOiB2YWx1ZSA9PiB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgdmFsdWUuX190eXBlID09PSAnRmlsZScgJiZcbiAgICAgIHR5cGVvZiB2YWx1ZS5uYW1lID09PSAnc3RyaW5nJyAmJlxuICAgICAgKHZhbHVlLnVybCA9PT0gdW5kZWZpbmVkIHx8IHR5cGVvZiB2YWx1ZS51cmwgPT09ICdzdHJpbmcnKVxuICAgICkge1xuICAgICAgcmV0dXJuIHZhbHVlLm5hbWU7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdGaWxlJyk7XG4gIH0sXG4gIHBhcnNlTGl0ZXJhbChhc3QpIHtcbiAgICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgICByZXR1cm4gcGFyc2VGaWxlVmFsdWUoYXN0LnZhbHVlKTtcbiAgICB9IGVsc2UgaWYgKGFzdC5raW5kID09PSBLaW5kLk9CSkVDVCkge1xuICAgICAgY29uc3QgX190eXBlID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdfX3R5cGUnKTtcbiAgICAgIGNvbnN0IG5hbWUgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ25hbWUnKTtcbiAgICAgIGNvbnN0IHVybCA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAndXJsJyk7XG4gICAgICBpZiAoX190eXBlICYmIF9fdHlwZS52YWx1ZSAmJiBuYW1lICYmIG5hbWUudmFsdWUpIHtcbiAgICAgICAgcmV0dXJuIHBhcnNlRmlsZVZhbHVlKHtcbiAgICAgICAgICBfX3R5cGU6IF9fdHlwZS52YWx1ZS52YWx1ZSxcbiAgICAgICAgICBuYW1lOiBuYW1lLnZhbHVlLnZhbHVlLFxuICAgICAgICAgIHVybDogdXJsICYmIHVybC52YWx1ZSA/IHVybC52YWx1ZS52YWx1ZSA6IHVuZGVmaW5lZCxcbiAgICAgICAgfSk7XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IoYXN0LmtpbmQsICdGaWxlJyk7XG4gIH0sXG59KTtcblxuY29uc3QgRklMRV9JTkZPID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0ZpbGVJbmZvJyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBGaWxlSW5mbyBvYmplY3QgdHlwZSBpcyB1c2VkIHRvIHJldHVybiB0aGUgaW5mb3JtYXRpb24gYWJvdXQgZmlsZXMuJyxcbiAgZmllbGRzOiB7XG4gICAgbmFtZToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBmaWxlIG5hbWUuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICB9LFxuICAgIHVybDoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB1cmwgaW4gd2hpY2ggdGhlIGZpbGUgY2FuIGJlIGRvd25sb2FkZWQuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IEdFT19QT0lOVF9GSUVMRFMgPSB7XG4gIGxhdGl0dWRlOiB7XG4gICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBsYXRpdHVkZS4nLFxuICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMRmxvYXQpLFxuICB9LFxuICBsb25naXR1ZGU6IHtcbiAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGxvbmdpdHVkZS4nLFxuICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMRmxvYXQpLFxuICB9LFxufTtcblxuY29uc3QgR0VPX1BPSU5UX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnR2VvUG9pbnRJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgR2VvUG9pbnRJbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgaW5wdXR0aW5nIGZpZWxkcyBvZiB0eXBlIGdlbyBwb2ludC4nLFxuICBmaWVsZHM6IEdFT19QT0lOVF9GSUVMRFMsXG59KTtcblxuY29uc3QgR0VPX1BPSU5UID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0dlb1BvaW50JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBHZW9Qb2ludCBvYmplY3QgdHlwZSBpcyB1c2VkIHRvIHJldHVybiB0aGUgaW5mb3JtYXRpb24gYWJvdXQgZ2VvIHBvaW50IGZpZWxkcy4nLFxuICBmaWVsZHM6IEdFT19QT0lOVF9GSUVMRFMsXG59KTtcblxuY29uc3QgUE9MWUdPTl9JTlBVVCA9IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoR0VPX1BPSU5UX0lOUFVUKSk7XG5cbmNvbnN0IFBPTFlHT04gPSBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVCkpO1xuXG5jb25zdCBVU0VSX0FDTF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1VzZXJBQ0xJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnQWxsb3cgdG8gbWFuYWdlIHVzZXJzIGluIEFDTC4nLFxuICBmaWVsZHM6IHtcbiAgICB1c2VySWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnSUQgb2YgdGhlIHRhcmdldHRlZCBVc2VyLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTElEKSxcbiAgICB9LFxuICAgIHJlYWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgdGhlIHVzZXIgdG8gcmVhZCB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgICB3cml0ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyB0aGUgdXNlciB0byB3cml0ZSBvbiB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBST0xFX0FDTF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1JvbGVBQ0xJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnQWxsb3cgdG8gbWFuYWdlIHJvbGVzIGluIEFDTC4nLFxuICBmaWVsZHM6IHtcbiAgICByb2xlTmFtZToge1xuICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSB0YXJnZXR0ZWQgUm9sZS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgIH0sXG4gICAgcmVhZDoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdBbGxvdyB1c2VycyB3aG8gYXJlIG1lbWJlcnMgb2YgdGhlIHJvbGUgdG8gcmVhZCB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgICB3cml0ZToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdBbGxvdyB1c2VycyB3aG8gYXJlIG1lbWJlcnMgb2YgdGhlIHJvbGUgdG8gd3JpdGUgb24gdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgUFVCTElDX0FDTF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1B1YmxpY0FDTElucHV0JyxcbiAgZGVzY3JpcHRpb246ICdBbGxvdyB0byBtYW5hZ2UgcHVibGljIHJpZ2h0cy4nLFxuICBmaWVsZHM6IHtcbiAgICByZWFkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IGFueW9uZSB0byByZWFkIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICAgIHdyaXRlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IGFueW9uZSB0byB3cml0ZSBvbiB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBBQ0xfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdBQ0xJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdBbGxvdyB0byBtYW5hZ2UgYWNjZXNzIHJpZ2h0cy4gSWYgbm90IHByb3ZpZGVkIG9iamVjdCB3aWxsIGJlIHB1YmxpY2x5IHJlYWRhYmxlIGFuZCB3cml0YWJsZScsXG4gIGZpZWxkczoge1xuICAgIHVzZXJzOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FjY2VzcyBjb250cm9sIGxpc3QgZm9yIHVzZXJzLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKFVTRVJfQUNMX0lOUFVUKSksXG4gICAgfSxcbiAgICByb2xlczoge1xuICAgICAgZGVzY3JpcHRpb246ICdBY2Nlc3MgY29udHJvbCBsaXN0IGZvciByb2xlcy4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChST0xFX0FDTF9JTlBVVCkpLFxuICAgIH0sXG4gICAgcHVibGljOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1B1YmxpYyBhY2Nlc3MgY29udHJvbCBsaXN0LicsXG4gICAgICB0eXBlOiBQVUJMSUNfQUNMX0lOUFVULFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgVVNFUl9BQ0wgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnVXNlckFDTCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdBbGxvdyB0byBtYW5hZ2UgdXNlcnMgaW4gQUNMLiBJZiByZWFkIGFuZCB3cml0ZSBhcmUgbnVsbCB0aGUgdXNlcnMgaGF2ZSByZWFkIGFuZCB3cml0ZSByaWdodHMuJyxcbiAgZmllbGRzOiB7XG4gICAgdXNlcklkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0lEIG9mIHRoZSB0YXJnZXR0ZWQgVXNlci4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxJRCksXG4gICAgfSxcbiAgICByZWFkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IHRoZSB1c2VyIHRvIHJlYWQgdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gICAgd3JpdGU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgdGhlIHVzZXIgdG8gd3JpdGUgb24gdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgUk9MRV9BQ0wgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnUm9sZUFDTCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdBbGxvdyB0byBtYW5hZ2Ugcm9sZXMgaW4gQUNMLiBJZiByZWFkIGFuZCB3cml0ZSBhcmUgbnVsbCB0aGUgcm9sZSBoYXZlIHJlYWQgYW5kIHdyaXRlIHJpZ2h0cy4nLFxuICBmaWVsZHM6IHtcbiAgICByb2xlTmFtZToge1xuICAgICAgZGVzY3JpcHRpb246ICdOYW1lIG9mIHRoZSB0YXJnZXR0ZWQgUm9sZS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxJRCksXG4gICAgfSxcbiAgICByZWFkOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ0FsbG93IHVzZXJzIHdobyBhcmUgbWVtYmVycyBvZiB0aGUgcm9sZSB0byByZWFkIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICAgIHdyaXRlOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ0FsbG93IHVzZXJzIHdobyBhcmUgbWVtYmVycyBvZiB0aGUgcm9sZSB0byB3cml0ZSBvbiB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBQVUJMSUNfQUNMID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1B1YmxpY0FDTCcsXG4gIGRlc2NyaXB0aW9uOiAnQWxsb3cgdG8gbWFuYWdlIHB1YmxpYyByaWdodHMuJyxcbiAgZmllbGRzOiB7XG4gICAgcmVhZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyBhbnlvbmUgdG8gcmVhZCB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxCb29sZWFuLFxuICAgIH0sXG4gICAgd3JpdGU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgYW55b25lIHRvIHdyaXRlIG9uIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogR3JhcGhRTEJvb2xlYW4sXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBBQ0wgPSBuZXcgR3JhcGhRTE9iamVjdFR5cGUoe1xuICBuYW1lOiAnQUNMJyxcbiAgZGVzY3JpcHRpb246ICdDdXJyZW50IGFjY2VzcyBjb250cm9sIGxpc3Qgb2YgdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gIGZpZWxkczoge1xuICAgIHVzZXJzOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FjY2VzcyBjb250cm9sIGxpc3QgZm9yIHVzZXJzLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKFVTRVJfQUNMKSksXG4gICAgICByZXNvbHZlKHApIHtcbiAgICAgICAgY29uc3QgdXNlcnMgPSBbXTtcbiAgICAgICAgT2JqZWN0LmtleXMocCkuZm9yRWFjaChydWxlID0+IHtcbiAgICAgICAgICBpZiAocnVsZSAhPT0gJyonICYmIHJ1bGUuaW5kZXhPZigncm9sZTonKSAhPT0gMCkge1xuICAgICAgICAgICAgdXNlcnMucHVzaCh7XG4gICAgICAgICAgICAgIHVzZXJJZDogcnVsZSxcbiAgICAgICAgICAgICAgcmVhZDogcFtydWxlXS5yZWFkID8gdHJ1ZSA6IGZhbHNlLFxuICAgICAgICAgICAgICB3cml0ZTogcFtydWxlXS53cml0ZSA/IHRydWUgOiBmYWxzZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB1c2Vycy5sZW5ndGggPyB1c2VycyA6IG51bGw7XG4gICAgICB9LFxuICAgIH0sXG4gICAgcm9sZXM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWNjZXNzIGNvbnRyb2wgbGlzdCBmb3Igcm9sZXMuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoUk9MRV9BQ0wpKSxcbiAgICAgIHJlc29sdmUocCkge1xuICAgICAgICBjb25zdCByb2xlcyA9IFtdO1xuICAgICAgICBPYmplY3Qua2V5cyhwKS5mb3JFYWNoKHJ1bGUgPT4ge1xuICAgICAgICAgIGlmIChydWxlLmluZGV4T2YoJ3JvbGU6JykgPT09IDApIHtcbiAgICAgICAgICAgIHJvbGVzLnB1c2goe1xuICAgICAgICAgICAgICByb2xlTmFtZTogcnVsZS5yZXBsYWNlKCdyb2xlOicsICcnKSxcbiAgICAgICAgICAgICAgcmVhZDogcFtydWxlXS5yZWFkID8gdHJ1ZSA6IGZhbHNlLFxuICAgICAgICAgICAgICB3cml0ZTogcFtydWxlXS53cml0ZSA/IHRydWUgOiBmYWxzZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiByb2xlcy5sZW5ndGggPyByb2xlcyA6IG51bGw7XG4gICAgICB9LFxuICAgIH0sXG4gICAgcHVibGljOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1B1YmxpYyBhY2Nlc3MgY29udHJvbCBsaXN0LicsXG4gICAgICB0eXBlOiBQVUJMSUNfQUNMLFxuICAgICAgcmVzb2x2ZShwKSB7XG4gICAgICAgIC8qIGVzbGludC1kaXNhYmxlICovXG4gICAgICAgIHJldHVybiBwWycqJ11cbiAgICAgICAgICA/IHtcbiAgICAgICAgICAgICAgcmVhZDogcFsnKiddLnJlYWQgPyB0cnVlIDogZmFsc2UsXG4gICAgICAgICAgICAgIHdyaXRlOiBwWycqJ10ud3JpdGUgPyB0cnVlIDogZmFsc2UsXG4gICAgICAgICAgICB9XG4gICAgICAgICAgOiBudWxsO1xuICAgICAgfSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IE9CSkVDVF9JRCA9IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMSUQpO1xuXG5jb25zdCBDTEFTU19OQU1FX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBjbGFzcyBuYW1lIG9mIHRoZSBvYmplY3QuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxufTtcblxuY29uc3QgR0xPQkFMX09SX09CSkVDVF9JRF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBvYmplY3QgaWQuIFlvdSBjYW4gdXNlIGVpdGhlciB0aGUgZ2xvYmFsIG9yIHRoZSBvYmplY3QgaWQuJyxcbiAgdHlwZTogT0JKRUNUX0lELFxufTtcblxuY29uc3QgT0JKRUNUX0lEX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBvYmplY3QgaWQuJyxcbiAgdHlwZTogT0JKRUNUX0lELFxufTtcblxuY29uc3QgQ1JFQVRFRF9BVF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZGF0ZSBpbiB3aGljaCB0aGUgb2JqZWN0IHdhcyBjcmVhdGVkLicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChEQVRFKSxcbn07XG5cbmNvbnN0IFVQREFURURfQVRfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGRhdGUgaW4gd2hpY2ggdGhlIG9iamVjdCB3YXMgbGFzIHVwZGF0ZWQuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKERBVEUpLFxufTtcblxuY29uc3QgSU5QVVRfRklFTERTID0ge1xuICBBQ0w6IHtcbiAgICB0eXBlOiBBQ0wsXG4gIH0sXG59O1xuXG5jb25zdCBDUkVBVEVfUkVTVUxUX0ZJRUxEUyA9IHtcbiAgb2JqZWN0SWQ6IE9CSkVDVF9JRF9BVFQsXG4gIGNyZWF0ZWRBdDogQ1JFQVRFRF9BVF9BVFQsXG59O1xuXG5jb25zdCBVUERBVEVfUkVTVUxUX0ZJRUxEUyA9IHtcbiAgdXBkYXRlZEF0OiBVUERBVEVEX0FUX0FUVCxcbn07XG5cbmNvbnN0IFBBUlNFX09CSkVDVF9GSUVMRFMgPSB7XG4gIC4uLkNSRUFURV9SRVNVTFRfRklFTERTLFxuICAuLi5VUERBVEVfUkVTVUxUX0ZJRUxEUyxcbiAgLi4uSU5QVVRfRklFTERTLFxuICBBQ0w6IHtcbiAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoQUNMKSxcbiAgICByZXNvbHZlOiAoeyBBQ0wgfSkgPT4gKEFDTCA/IEFDTCA6IHsgJyonOiB7IHJlYWQ6IHRydWUsIHdyaXRlOiB0cnVlIH0gfSksXG4gIH0sXG59O1xuXG5jb25zdCBQQVJTRV9PQkpFQ1QgPSBuZXcgR3JhcGhRTEludGVyZmFjZVR5cGUoe1xuICBuYW1lOiAnUGFyc2VPYmplY3QnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFBhcnNlT2JqZWN0IGludGVyZmFjZSB0eXBlIGlzIHVzZWQgYXMgYSBiYXNlIHR5cGUgZm9yIHRoZSBhdXRvIGdlbmVyYXRlZCBvYmplY3QgdHlwZXMuJyxcbiAgZmllbGRzOiBQQVJTRV9PQkpFQ1RfRklFTERTLFxufSk7XG5cbmNvbnN0IFNFU1NJT05fVE9LRU5fQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoZSBjdXJyZW50IHVzZXIgc2Vzc2lvbiB0b2tlbi4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG59O1xuXG5jb25zdCBSRUFEX1BSRUZFUkVOQ0UgPSBuZXcgR3JhcGhRTEVudW1UeXBlKHtcbiAgbmFtZTogJ1JlYWRQcmVmZXJlbmNlJyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBSZWFkUHJlZmVyZW5jZSBlbnVtIHR5cGUgaXMgdXNlZCBpbiBxdWVyaWVzIGluIG9yZGVyIHRvIHNlbGVjdCBpbiB3aGljaCBkYXRhYmFzZSByZXBsaWNhIHRoZSBvcGVyYXRpb24gbXVzdCBydW4uJyxcbiAgdmFsdWVzOiB7XG4gICAgUFJJTUFSWTogeyB2YWx1ZTogJ1BSSU1BUlknIH0sXG4gICAgUFJJTUFSWV9QUkVGRVJSRUQ6IHsgdmFsdWU6ICdQUklNQVJZX1BSRUZFUlJFRCcgfSxcbiAgICBTRUNPTkRBUlk6IHsgdmFsdWU6ICdTRUNPTkRBUlknIH0sXG4gICAgU0VDT05EQVJZX1BSRUZFUlJFRDogeyB2YWx1ZTogJ1NFQ09OREFSWV9QUkVGRVJSRUQnIH0sXG4gICAgTkVBUkVTVDogeyB2YWx1ZTogJ05FQVJFU1QnIH0sXG4gIH0sXG59KTtcblxuY29uc3QgUkVBRF9QUkVGRVJFTkNFX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGUgcmVhZCBwcmVmZXJlbmNlIGZvciB0aGUgbWFpbiBxdWVyeSB0byBiZSBleGVjdXRlZC4nLFxuICB0eXBlOiBSRUFEX1BSRUZFUkVOQ0UsXG59O1xuXG5jb25zdCBJTkNMVURFX1JFQURfUFJFRkVSRU5DRV9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgcmVhZCBwcmVmZXJlbmNlIGZvciB0aGUgcXVlcmllcyB0byBiZSBleGVjdXRlZCB0byBpbmNsdWRlIGZpZWxkcy4nLFxuICB0eXBlOiBSRUFEX1BSRUZFUkVOQ0UsXG59O1xuXG5jb25zdCBTVUJRVUVSWV9SRUFEX1BSRUZFUkVOQ0VfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoZSByZWFkIHByZWZlcmVuY2UgZm9yIHRoZSBzdWJxdWVyaWVzIHRoYXQgbWF5IGJlIHJlcXVpcmVkLicsXG4gIHR5cGU6IFJFQURfUFJFRkVSRU5DRSxcbn07XG5cbmNvbnN0IFJFQURfT1BUSU9OU19JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1JlYWRPcHRpb25zSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFJlYWRPcHRpb25zSW5wdXR0IHR5cGUgaXMgdXNlZCBpbiBxdWVyaWVzIGluIG9yZGVyIHRvIHNldCB0aGUgcmVhZCBwcmVmZXJlbmNlcy4nLFxuICBmaWVsZHM6IHtcbiAgICByZWFkUHJlZmVyZW5jZTogUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgICBpbmNsdWRlUmVhZFByZWZlcmVuY2U6IElOQ0xVREVfUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgICBzdWJxdWVyeVJlYWRQcmVmZXJlbmNlOiBTVUJRVUVSWV9SRUFEX1BSRUZFUkVOQ0VfQVRULFxuICB9LFxufSk7XG5cbmNvbnN0IFJFQURfT1BUSU9OU19BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhlIHJlYWQgb3B0aW9ucyBmb3IgdGhlIHF1ZXJ5IHRvIGJlIGV4ZWN1dGVkLicsXG4gIHR5cGU6IFJFQURfT1BUSU9OU19JTlBVVCxcbn07XG5cbmNvbnN0IFdIRVJFX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZXNlIGFyZSB0aGUgY29uZGl0aW9ucyB0aGF0IHRoZSBvYmplY3RzIG5lZWQgdG8gbWF0Y2ggaW4gb3JkZXIgdG8gYmUgZm91bmQnLFxuICB0eXBlOiBPQkpFQ1QsXG59O1xuXG5jb25zdCBTS0lQX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBudW1iZXIgb2Ygb2JqZWN0cyB0aGF0IG11c3QgYmUgc2tpcHBlZCB0byByZXR1cm4uJyxcbiAgdHlwZTogR3JhcGhRTEludCxcbn07XG5cbmNvbnN0IExJTUlUX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBsaW1pdCBudW1iZXIgb2Ygb2JqZWN0cyB0aGF0IG11c3QgYmUgcmV0dXJuZWQuJyxcbiAgdHlwZTogR3JhcGhRTEludCxcbn07XG5cbmNvbnN0IENPVU5UX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIHRvdGFsIG1hdGNoZWQgb2JqZWNzIGNvdW50IHRoYXQgaXMgcmV0dXJuZWQgd2hlbiB0aGUgY291bnQgZmxhZyBpcyBzZXQuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxJbnQpLFxufTtcblxuY29uc3QgU0VBUkNIX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnU2VhcmNoSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFNlYXJjaElucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZpeSBhIHNlYXJjaCBvcGVyYXRpb24gb24gYSBmdWxsIHRleHQgc2VhcmNoLicsXG4gIGZpZWxkczoge1xuICAgIHRlcm06IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdGVybSB0byBiZSBzZWFyY2hlZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgIH0sXG4gICAgbGFuZ3VhZ2U6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgbGFuZ3VhZ2UgdG8gdGV0ZXJtaW5lIHRoZSBsaXN0IG9mIHN0b3Agd29yZHMgYW5kIHRoZSBydWxlcyBmb3IgdG9rZW5pemVyLicsXG4gICAgICB0eXBlOiBHcmFwaFFMU3RyaW5nLFxuICAgIH0sXG4gICAgY2FzZVNlbnNpdGl2ZToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBmbGFnIHRvIGVuYWJsZSBvciBkaXNhYmxlIGNhc2Ugc2Vuc2l0aXZlIHNlYXJjaC4nLFxuICAgICAgdHlwZTogR3JhcGhRTEJvb2xlYW4sXG4gICAgfSxcbiAgICBkaWFjcml0aWNTZW5zaXRpdmU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgZmxhZyB0byBlbmFibGUgb3IgZGlzYWJsZSBkaWFjcml0aWMgc2Vuc2l0aXZlIHNlYXJjaC4nLFxuICAgICAgdHlwZTogR3JhcGhRTEJvb2xlYW4sXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBURVhUX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnVGV4dElucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBUZXh0SW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYSB0ZXh0IG9wZXJhdGlvbiBvbiBhIGNvbnN0cmFpbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgc2VhcmNoOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHNlYXJjaCB0byBiZSBleGVjdXRlZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFNFQVJDSF9JTlBVVCksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBCT1hfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdCb3hJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQm94SW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZml5IGEgYm94IG9wZXJhdGlvbiBvbiBhIHdpdGhpbiBnZW8gcXVlcnkuJyxcbiAgZmllbGRzOiB7XG4gICAgYm90dG9tTGVmdDoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBib3R0b20gbGVmdCBjb29yZGluYXRlcyBvZiB0aGUgYm94LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR0VPX1BPSU5UX0lOUFVUKSxcbiAgICB9LFxuICAgIHVwcGVyUmlnaHQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXBwZXIgcmlnaHQgY29vcmRpbmF0ZXMgb2YgdGhlIGJveC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVF9JTlBVVCksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBXSVRISU5fSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdXaXRoaW5JbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgV2l0aGluSW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYSB3aXRoaW4gb3BlcmF0aW9uIG9uIGEgY29uc3RyYWludC4nLFxuICBmaWVsZHM6IHtcbiAgICBib3g6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgYm94IHRvIGJlIHNwZWNpZmllZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEJPWF9JTlBVVCksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBDRU5URVJfU1BIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnQ2VudGVyU3BoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIENlbnRlclNwaGVyZUlucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZpeSBhIGNlbnRlclNwaGVyZSBvcGVyYXRpb24gb24gYSBnZW9XaXRoaW4gcXVlcnkuJyxcbiAgZmllbGRzOiB7XG4gICAgY2VudGVyOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGNlbnRlciBvZiB0aGUgc3BoZXJlLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR0VPX1BPSU5UX0lOUFVUKSxcbiAgICB9LFxuICAgIGRpc3RhbmNlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHJhZGl1cyBvZiB0aGUgc3BoZXJlLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEZsb2F0KSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IEdFT19XSVRISU5fSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdHZW9XaXRoaW5JbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgR2VvV2l0aGluSW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYSBnZW9XaXRoaW4gb3BlcmF0aW9uIG9uIGEgY29uc3RyYWludC4nLFxuICBmaWVsZHM6IHtcbiAgICBwb2x5Z29uOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHBvbHlnb24gdG8gYmUgc3BlY2lmaWVkLicsXG4gICAgICB0eXBlOiBQT0xZR09OX0lOUFVULFxuICAgIH0sXG4gICAgY2VudGVyU3BoZXJlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHNwaGVyZSB0byBiZSBzcGVjaWZpZWQuJyxcbiAgICAgIHR5cGU6IENFTlRFUl9TUEhFUkVfSU5QVVQsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBHRU9fSU5URVJTRUNUU19JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0dlb0ludGVyc2VjdHNJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgR2VvSW50ZXJzZWN0c0lucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGEgZ2VvSW50ZXJzZWN0cyBvcGVyYXRpb24gb24gYSBjb25zdHJhaW50LicsXG4gIGZpZWxkczoge1xuICAgIHBvaW50OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHBvaW50IHRvIGJlIHNwZWNpZmllZC4nLFxuICAgICAgdHlwZTogR0VPX1BPSU5UX0lOUFVULFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgZXF1YWxUbyA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGVxdWFsVG8gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGVxdWFscyB0byBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IG5vdEVxdWFsVG8gPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBub3RFcXVhbFRvIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBkbyBub3QgZXF1YWwgdG8gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBsZXNzVGhhbiA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGxlc3NUaGFuIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBpcyBsZXNzIHRoYW4gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBsZXNzVGhhbk9yRXF1YWxUbyA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGxlc3NUaGFuT3JFcXVhbFRvIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBpcyBsZXNzIHRoYW4gb3IgZXF1YWwgdG8gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBncmVhdGVyVGhhbiA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGdyZWF0ZXJUaGFuIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBpcyBncmVhdGVyIHRoYW4gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBncmVhdGVyVGhhbk9yRXF1YWxUbyA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGdyZWF0ZXJUaGFuT3JFcXVhbFRvIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBpcyBncmVhdGVyIHRoYW4gb3IgZXF1YWwgdG8gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBpbk9wID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgaW4gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGVxdWFscyBhbnkgdmFsdWUgaW4gdGhlIHNwZWNpZmllZCBhcnJheS4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTExpc3QodHlwZSksXG59KTtcblxuY29uc3Qgbm90SW4gPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBub3RJbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgZG8gbm90IGVxdWFsIGFueSB2YWx1ZSBpbiB0aGUgc3BlY2lmaWVkIGFycmF5LicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTGlzdCh0eXBlKSxcbn0pO1xuXG5jb25zdCBleGlzdHMgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBleGlzdHMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIGEgZmllbGQgZXhpc3RzIChvciBkbyBub3QgZXhpc3QpLicsXG4gIHR5cGU6IEdyYXBoUUxCb29sZWFuLFxufTtcblxuY29uc3QgbWF0Y2hlc1JlZ2V4ID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgbWF0Y2hlc1JlZ2V4IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBtYXRjaGVzIGEgc3BlY2lmaWVkIHJlZ3VsYXIgZXhwcmVzc2lvbi4nLFxuICB0eXBlOiBHcmFwaFFMU3RyaW5nLFxufTtcblxuY29uc3Qgb3B0aW9ucyA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIG9wdGlvbnMgb3BlcmF0b3IgdG8gc3BlY2lmeSBvcHRpb25hbCBmbGFncyAoc3VjaCBhcyBcImlcIiBhbmQgXCJtXCIpIHRvIGJlIGFkZGVkIHRvIGEgbWF0Y2hlc1JlZ2V4IG9wZXJhdGlvbiBpbiB0aGUgc2FtZSBzZXQgb2YgY29uc3RyYWludHMuJyxcbiAgdHlwZTogR3JhcGhRTFN0cmluZyxcbn07XG5cbmNvbnN0IFNVQlFVRVJZX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnU3VicXVlcnlJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgU3VicXVlcnlJbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmeSBhIHN1YiBxdWVyeSB0byBhbm90aGVyIGNsYXNzLicsXG4gIGZpZWxkczoge1xuICAgIGNsYXNzTmFtZTogQ0xBU1NfTkFNRV9BVFQsXG4gICAgd2hlcmU6IE9iamVjdC5hc3NpZ24oe30sIFdIRVJFX0FUVCwge1xuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFdIRVJFX0FUVC50eXBlKSxcbiAgICB9KSxcbiAgfSxcbn0pO1xuXG5jb25zdCBTRUxFQ1RfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdTZWxlY3RJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgU2VsZWN0SW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYW4gaW5RdWVyeUtleSBvciBhIG5vdEluUXVlcnlLZXkgb3BlcmF0aW9uIG9uIGEgY29uc3RyYWludC4nLFxuICBmaWVsZHM6IHtcbiAgICBxdWVyeToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBzdWJxdWVyeSB0byBiZSBleGVjdXRlZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFNVQlFVRVJZX0lOUFVUKSxcbiAgICB9LFxuICAgIGtleToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBrZXkgaW4gdGhlIHJlc3VsdCBvZiB0aGUgc3VicXVlcnkgdGhhdCBtdXN0IG1hdGNoIChub3QgbWF0Y2gpIHRoZSBmaWVsZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgaW5RdWVyeUtleSA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGluUXVlcnlLZXkgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIGEgZmllbGQgZXF1YWxzIHRvIGEga2V5IGluIHRoZSByZXN1bHQgb2YgYSBkaWZmZXJlbnQgcXVlcnkuJyxcbiAgdHlwZTogU0VMRUNUX0lOUFVULFxufTtcblxuY29uc3Qgbm90SW5RdWVyeUtleSA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIG5vdEluUXVlcnlLZXkgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIGEgZmllbGQgZG8gbm90IGVxdWFsIHRvIGEga2V5IGluIHRoZSByZXN1bHQgb2YgYSBkaWZmZXJlbnQgcXVlcnkuJyxcbiAgdHlwZTogU0VMRUNUX0lOUFVULFxufTtcblxuY29uc3QgSURfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdJZFdoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIElkV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYW4gaWQuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhHcmFwaFFMSUQpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oR3JhcGhRTElEKSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oR3JhcGhRTElEKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oR3JhcGhRTElEKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oR3JhcGhRTElEKSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oR3JhcGhRTElEKSxcbiAgICBpbjogaW5PcChHcmFwaFFMSUQpLFxuICAgIG5vdEluOiBub3RJbihHcmFwaFFMSUQpLFxuICAgIGV4aXN0cyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgU1RSSU5HX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnU3RyaW5nV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgU3RyaW5nV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIFN0cmluZy4nLFxuICBmaWVsZHM6IHtcbiAgICBlcXVhbFRvOiBlcXVhbFRvKEdyYXBoUUxTdHJpbmcpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oR3JhcGhRTFN0cmluZyksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKEdyYXBoUUxTdHJpbmcpLFxuICAgIGxlc3NUaGFuT3JFcXVhbFRvOiBsZXNzVGhhbk9yRXF1YWxUbyhHcmFwaFFMU3RyaW5nKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oR3JhcGhRTFN0cmluZyksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKEdyYXBoUUxTdHJpbmcpLFxuICAgIGluOiBpbk9wKEdyYXBoUUxTdHJpbmcpLFxuICAgIG5vdEluOiBub3RJbihHcmFwaFFMU3RyaW5nKSxcbiAgICBleGlzdHMsXG4gICAgbWF0Y2hlc1JlZ2V4LFxuICAgIG9wdGlvbnMsXG4gICAgdGV4dDoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSAkdGV4dCBvcGVyYXRvciB0byBzcGVjaWZ5IGEgZnVsbCB0ZXh0IHNlYXJjaCBjb25zdHJhaW50LicsXG4gICAgICB0eXBlOiBURVhUX0lOUFVULFxuICAgIH0sXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IE5VTUJFUl9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ051bWJlcldoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIE51bWJlcldoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBOdW1iZXIuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhHcmFwaFFMRmxvYXQpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oR3JhcGhRTEZsb2F0KSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oR3JhcGhRTEZsb2F0KSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oR3JhcGhRTEZsb2F0KSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oR3JhcGhRTEZsb2F0KSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oR3JhcGhRTEZsb2F0KSxcbiAgICBpbjogaW5PcChHcmFwaFFMRmxvYXQpLFxuICAgIG5vdEluOiBub3RJbihHcmFwaFFMRmxvYXQpLFxuICAgIGV4aXN0cyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgQk9PTEVBTl9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0Jvb2xlYW5XaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBCb29sZWFuV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIEJvb2xlYW4uJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhHcmFwaFFMQm9vbGVhbiksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhHcmFwaFFMQm9vbGVhbiksXG4gICAgZXhpc3RzLFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBBUlJBWV9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0FycmF5V2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQXJyYXlXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgQXJyYXkuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhBTlkpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oQU5ZKSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oQU5ZKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oQU5ZKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oQU5ZKSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oQU5ZKSxcbiAgICBpbjogaW5PcChBTlkpLFxuICAgIG5vdEluOiBub3RJbihBTlkpLFxuICAgIGV4aXN0cyxcbiAgICBjb250YWluZWRCeToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBjb250YWluZWRCeSBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhbiBhcnJheSBmaWVsZCBpcyBjb250YWluZWQgYnkgYW5vdGhlciBzcGVjaWZpZWQgYXJyYXkuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChBTlkpLFxuICAgIH0sXG4gICAgY29udGFpbnM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgY29udGFpbnMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYW4gYXJyYXkgZmllbGQgY29udGFpbiBhbGwgZWxlbWVudHMgb2YgYW5vdGhlciBzcGVjaWZpZWQgYXJyYXkuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChBTlkpLFxuICAgIH0sXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IEtFWV9WQUxVRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0tleVZhbHVlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ0FuIGVudHJ5IGZyb20gYW4gb2JqZWN0LCBpLmUuLCBhIHBhaXIgb2Yga2V5IGFuZCB2YWx1ZS4nLFxuICBmaWVsZHM6IHtcbiAgICBrZXk6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIGtleSB1c2VkIHRvIHJldHJpZXZlIHRoZSB2YWx1ZSBvZiB0aGlzIGVudHJ5LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgICB2YWx1ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGUgdmFsdWUgb2YgdGhlIGVudHJ5LiBDb3VsZCBiZSBhbnkgdHlwZSBvZiBzY2FsYXIgZGF0YS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEFOWSksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBPQkpFQ1RfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdPYmplY3RXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBPYmplY3RXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgcmVzdWx0IGJ5IGEgZmllbGQgb2YgdHlwZSBPYmplY3QuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhLRVlfVkFMVUVfSU5QVVQpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBpbjogaW5PcChLRVlfVkFMVUVfSU5QVVQpLFxuICAgIG5vdEluOiBub3RJbihLRVlfVkFMVUVfSU5QVVQpLFxuICAgIGxlc3NUaGFuOiBsZXNzVGhhbihLRVlfVkFMVUVfSU5QVVQpLFxuICAgIGxlc3NUaGFuT3JFcXVhbFRvOiBsZXNzVGhhbk9yRXF1YWxUbyhLRVlfVkFMVUVfSU5QVVQpLFxuICAgIGdyZWF0ZXJUaGFuOiBncmVhdGVyVGhhbihLRVlfVkFMVUVfSU5QVVQpLFxuICAgIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiBncmVhdGVyVGhhbk9yRXF1YWxUbyhLRVlfVkFMVUVfSU5QVVQpLFxuICAgIGV4aXN0cyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgREFURV9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0RhdGVXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBEYXRlV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIERhdGUuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhEQVRFKSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKERBVEUpLFxuICAgIGxlc3NUaGFuOiBsZXNzVGhhbihEQVRFKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oREFURSksXG4gICAgZ3JlYXRlclRoYW46IGdyZWF0ZXJUaGFuKERBVEUpLFxuICAgIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiBncmVhdGVyVGhhbk9yRXF1YWxUbyhEQVRFKSxcbiAgICBpbjogaW5PcChEQVRFKSxcbiAgICBub3RJbjogbm90SW4oREFURSksXG4gICAgZXhpc3RzLFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBCWVRFU19XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0J5dGVzV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQnl0ZXNXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgQnl0ZXMuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhCWVRFUyksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhCWVRFUyksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKEJZVEVTKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oQllURVMpLFxuICAgIGdyZWF0ZXJUaGFuOiBncmVhdGVyVGhhbihCWVRFUyksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKEJZVEVTKSxcbiAgICBpbjogaW5PcChCWVRFUyksXG4gICAgbm90SW46IG5vdEluKEJZVEVTKSxcbiAgICBleGlzdHMsXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IEZJTEVfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdGaWxlV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgRmlsZVdoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBGaWxlLicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oRklMRSksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhGSUxFKSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oRklMRSksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKEZJTEUpLFxuICAgIGdyZWF0ZXJUaGFuOiBncmVhdGVyVGhhbihGSUxFKSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oRklMRSksXG4gICAgaW46IGluT3AoRklMRSksXG4gICAgbm90SW46IG5vdEluKEZJTEUpLFxuICAgIGV4aXN0cyxcbiAgICBtYXRjaGVzUmVnZXgsXG4gICAgb3B0aW9ucyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgR0VPX1BPSU5UX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnR2VvUG9pbnRXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBHZW9Qb2ludFdoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBHZW9Qb2ludC4nLFxuICBmaWVsZHM6IHtcbiAgICBleGlzdHMsXG4gICAgbmVhclNwaGVyZToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBuZWFyU3BoZXJlIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIG5lYXIgdG8gYW5vdGhlciBnZW8gcG9pbnQuJyxcbiAgICAgIHR5cGU6IEdFT19QT0lOVF9JTlBVVCxcbiAgICB9LFxuICAgIG1heERpc3RhbmNlOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIG1heERpc3RhbmNlIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIGF0IGEgbWF4IGRpc3RhbmNlIChpbiByYWRpYW5zKSBmcm9tIHRoZSBnZW8gcG9pbnQgc3BlY2lmaWVkIGluIHRoZSAkbmVhclNwaGVyZSBvcGVyYXRvci4nLFxuICAgICAgdHlwZTogR3JhcGhRTEZsb2F0LFxuICAgIH0sXG4gICAgbWF4RGlzdGFuY2VJblJhZGlhbnM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgbWF4RGlzdGFuY2VJblJhZGlhbnMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBnZW8gcG9pbnQgZmllbGQgaXMgYXQgYSBtYXggZGlzdGFuY2UgKGluIHJhZGlhbnMpIGZyb20gdGhlIGdlbyBwb2ludCBzcGVjaWZpZWQgaW4gdGhlICRuZWFyU3BoZXJlIG9wZXJhdG9yLicsXG4gICAgICB0eXBlOiBHcmFwaFFMRmxvYXQsXG4gICAgfSxcbiAgICBtYXhEaXN0YW5jZUluTWlsZXM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgbWF4RGlzdGFuY2VJbk1pbGVzIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIGF0IGEgbWF4IGRpc3RhbmNlIChpbiBtaWxlcykgZnJvbSB0aGUgZ2VvIHBvaW50IHNwZWNpZmllZCBpbiB0aGUgJG5lYXJTcGhlcmUgb3BlcmF0b3IuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxGbG9hdCxcbiAgICB9LFxuICAgIG1heERpc3RhbmNlSW5LaWxvbWV0ZXJzOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIG1heERpc3RhbmNlSW5LaWxvbWV0ZXJzIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIGF0IGEgbWF4IGRpc3RhbmNlIChpbiBraWxvbWV0ZXJzKSBmcm9tIHRoZSBnZW8gcG9pbnQgc3BlY2lmaWVkIGluIHRoZSAkbmVhclNwaGVyZSBvcGVyYXRvci4nLFxuICAgICAgdHlwZTogR3JhcGhRTEZsb2F0LFxuICAgIH0sXG4gICAgd2l0aGluOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIHdpdGhpbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyB3aXRoaW4gYSBzcGVjaWZpZWQgYm94LicsXG4gICAgICB0eXBlOiBXSVRISU5fSU5QVVQsXG4gICAgfSxcbiAgICBnZW9XaXRoaW46IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgZ2VvV2l0aGluIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIHdpdGhpbiBhIHNwZWNpZmllZCBwb2x5Z29uIG9yIHNwaGVyZS4nLFxuICAgICAgdHlwZTogR0VPX1dJVEhJTl9JTlBVVCxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFBPTFlHT05fV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdQb2x5Z29uV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgUG9seWdvbldoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBQb2x5Z29uLicsXG4gIGZpZWxkczoge1xuICAgIGV4aXN0cyxcbiAgICBnZW9JbnRlcnNlY3RzOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGdlb0ludGVyc2VjdHMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBwb2x5Z29uIGZpZWxkIGludGVyc2VjdCBhIHNwZWNpZmllZCBwb2ludC4nLFxuICAgICAgdHlwZTogR0VPX0lOVEVSU0VDVFNfSU5QVVQsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBFTEVNRU5UID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0VsZW1lbnQnLFxuICBkZXNjcmlwdGlvbjogXCJUaGUgRWxlbWVudCBvYmplY3QgdHlwZSBpcyB1c2VkIHRvIHJldHVybiBhcnJheSBpdGVtcycgdmFsdWUuXCIsXG4gIGZpZWxkczoge1xuICAgIHZhbHVlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1JldHVybiB0aGUgdmFsdWUgb2YgdGhlIGVsZW1lbnQgaW4gdGhlIGFycmF5JyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChBTlkpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuLy8gRGVmYXVsdCBzdGF0aWMgdW5pb24gdHlwZSwgd2UgdXBkYXRlIHR5cGVzIGFuZCByZXNvbHZlVHlwZSBmdW5jdGlvbiBsYXRlclxubGV0IEFSUkFZX1JFU1VMVDtcblxuY29uc3QgbG9hZEFycmF5UmVzdWx0ID0gKHBhcnNlR3JhcGhRTFNjaGVtYSwgcGFyc2VDbGFzc2VzKSA9PiB7XG4gIGNvbnN0IGNsYXNzVHlwZXMgPSBwYXJzZUNsYXNzZXNcbiAgICAuZmlsdGVyKHBhcnNlQ2xhc3MgPT5cbiAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbcGFyc2VDbGFzcy5jbGFzc05hbWVdXG4gICAgICAgIC5jbGFzc0dyYXBoUUxPdXRwdXRUeXBlXG4gICAgICAgID8gdHJ1ZVxuICAgICAgICA6IGZhbHNlXG4gICAgKVxuICAgIC5tYXAoXG4gICAgICBwYXJzZUNsYXNzID0+XG4gICAgICAgIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbcGFyc2VDbGFzcy5jbGFzc05hbWVdXG4gICAgICAgICAgLmNsYXNzR3JhcGhRTE91dHB1dFR5cGVcbiAgICApO1xuICBBUlJBWV9SRVNVTFQgPSBuZXcgR3JhcGhRTFVuaW9uVHlwZSh7XG4gICAgbmFtZTogJ0FycmF5UmVzdWx0JyxcbiAgICBkZXNjcmlwdGlvbjpcbiAgICAgICdVc2UgSW5saW5lIEZyYWdtZW50IG9uIEFycmF5IHRvIGdldCByZXN1bHRzOiBodHRwczovL2dyYXBocWwub3JnL2xlYXJuL3F1ZXJpZXMvI2lubGluZS1mcmFnbWVudHMnLFxuICAgIHR5cGVzOiAoKSA9PiBbRUxFTUVOVCwgLi4uY2xhc3NUeXBlc10sXG4gICAgcmVzb2x2ZVR5cGU6IHZhbHVlID0+IHtcbiAgICAgIGlmICh2YWx1ZS5fX3R5cGUgPT09ICdPYmplY3QnICYmIHZhbHVlLmNsYXNzTmFtZSAmJiB2YWx1ZS5vYmplY3RJZCkge1xuICAgICAgICBpZiAocGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1t2YWx1ZS5jbGFzc05hbWVdKSB7XG4gICAgICAgICAgcmV0dXJuIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbdmFsdWUuY2xhc3NOYW1lXVxuICAgICAgICAgICAgLmNsYXNzR3JhcGhRTE91dHB1dFR5cGU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIEVMRU1FTlQ7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBFTEVNRU5UO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goQVJSQVlfUkVTVUxUKTtcbn07XG5cbmNvbnN0IGxvYWQgPSBwYXJzZUdyYXBoUUxTY2hlbWEgPT4ge1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR3JhcGhRTFVwbG9hZCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShBTlksIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoT0JKRUNULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKERBVEUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQllURVMsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoRklMRSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShGSUxFX0lORk8sIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR0VPX1BPSU5UX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEdFT19QT0lOVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShQQVJTRV9PQkpFQ1QsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUkVBRF9QUkVGRVJFTkNFLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFJFQURfT1BUSU9OU19JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTRUFSQ0hfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoVEVYVF9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShCT1hfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoV0lUSElOX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKENFTlRFUl9TUEhFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR0VPX1dJVEhJTl9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShHRU9fSU5URVJTRUNUU19JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShJRF9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTVFJJTkdfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoTlVNQkVSX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEJPT0xFQU5fV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQVJSQVlfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoS0VZX1ZBTFVFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKE9CSkVDVF9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShEQVRFX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEJZVEVTX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEZJTEVfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR0VPX1BPSU5UX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFBPTFlHT05fV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoRUxFTUVOVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShBQ0xfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoVVNFUl9BQ0xfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUk9MRV9BQ0xfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUFVCTElDX0FDTF9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShBQ0wsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoVVNFUl9BQ0wsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUk9MRV9BQ0wsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUFVCTElDX0FDTCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTVUJRVUVSWV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTRUxFQ1RfSU5QVVQsIHRydWUpO1xufTtcblxuZXhwb3J0IHtcbiAgVHlwZVZhbGlkYXRpb25FcnJvcixcbiAgcGFyc2VTdHJpbmdWYWx1ZSxcbiAgcGFyc2VJbnRWYWx1ZSxcbiAgcGFyc2VGbG9hdFZhbHVlLFxuICBwYXJzZUJvb2xlYW5WYWx1ZSxcbiAgcGFyc2VWYWx1ZSxcbiAgcGFyc2VMaXN0VmFsdWVzLFxuICBwYXJzZU9iamVjdEZpZWxkcyxcbiAgQU5ZLFxuICBPQkpFQ1QsXG4gIHBhcnNlRGF0ZUlzb1ZhbHVlLFxuICBzZXJpYWxpemVEYXRlSXNvLFxuICBEQVRFLFxuICBCWVRFUyxcbiAgcGFyc2VGaWxlVmFsdWUsXG4gIFNVQlFVRVJZX0lOUFVULFxuICBTRUxFQ1RfSU5QVVQsXG4gIEZJTEUsXG4gIEZJTEVfSU5GTyxcbiAgR0VPX1BPSU5UX0ZJRUxEUyxcbiAgR0VPX1BPSU5UX0lOUFVULFxuICBHRU9fUE9JTlQsXG4gIFBPTFlHT05fSU5QVVQsXG4gIFBPTFlHT04sXG4gIE9CSkVDVF9JRCxcbiAgQ0xBU1NfTkFNRV9BVFQsXG4gIEdMT0JBTF9PUl9PQkpFQ1RfSURfQVRULFxuICBPQkpFQ1RfSURfQVRULFxuICBVUERBVEVEX0FUX0FUVCxcbiAgQ1JFQVRFRF9BVF9BVFQsXG4gIElOUFVUX0ZJRUxEUyxcbiAgQ1JFQVRFX1JFU1VMVF9GSUVMRFMsXG4gIFVQREFURV9SRVNVTFRfRklFTERTLFxuICBQQVJTRV9PQkpFQ1RfRklFTERTLFxuICBQQVJTRV9PQkpFQ1QsXG4gIFNFU1NJT05fVE9LRU5fQVRULFxuICBSRUFEX1BSRUZFUkVOQ0UsXG4gIFJFQURfUFJFRkVSRU5DRV9BVFQsXG4gIElOQ0xVREVfUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgU1VCUVVFUllfUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgUkVBRF9PUFRJT05TX0lOUFVULFxuICBSRUFEX09QVElPTlNfQVRULFxuICBXSEVSRV9BVFQsXG4gIFNLSVBfQVRULFxuICBMSU1JVF9BVFQsXG4gIENPVU5UX0FUVCxcbiAgU0VBUkNIX0lOUFVULFxuICBURVhUX0lOUFVULFxuICBCT1hfSU5QVVQsXG4gIFdJVEhJTl9JTlBVVCxcbiAgQ0VOVEVSX1NQSEVSRV9JTlBVVCxcbiAgR0VPX1dJVEhJTl9JTlBVVCxcbiAgR0VPX0lOVEVSU0VDVFNfSU5QVVQsXG4gIGVxdWFsVG8sXG4gIG5vdEVxdWFsVG8sXG4gIGxlc3NUaGFuLFxuICBsZXNzVGhhbk9yRXF1YWxUbyxcbiAgZ3JlYXRlclRoYW4sXG4gIGdyZWF0ZXJUaGFuT3JFcXVhbFRvLFxuICBpbk9wLFxuICBub3RJbixcbiAgZXhpc3RzLFxuICBtYXRjaGVzUmVnZXgsXG4gIG9wdGlvbnMsXG4gIGluUXVlcnlLZXksXG4gIG5vdEluUXVlcnlLZXksXG4gIElEX1dIRVJFX0lOUFVULFxuICBTVFJJTkdfV0hFUkVfSU5QVVQsXG4gIE5VTUJFUl9XSEVSRV9JTlBVVCxcbiAgQk9PTEVBTl9XSEVSRV9JTlBVVCxcbiAgQVJSQVlfV0hFUkVfSU5QVVQsXG4gIEtFWV9WQUxVRV9JTlBVVCxcbiAgT0JKRUNUX1dIRVJFX0lOUFVULFxuICBEQVRFX1dIRVJFX0lOUFVULFxuICBCWVRFU19XSEVSRV9JTlBVVCxcbiAgRklMRV9XSEVSRV9JTlBVVCxcbiAgR0VPX1BPSU5UX1dIRVJFX0lOUFVULFxuICBQT0xZR09OX1dIRVJFX0lOUFVULFxuICBBUlJBWV9SRVNVTFQsXG4gIEVMRU1FTlQsXG4gIEFDTF9JTlBVVCxcbiAgVVNFUl9BQ0xfSU5QVVQsXG4gIFJPTEVfQUNMX0lOUFVULFxuICBQVUJMSUNfQUNMX0lOUFVULFxuICBBQ0wsXG4gIFVTRVJfQUNMLFxuICBST0xFX0FDTCxcbiAgUFVCTElDX0FDTCxcbiAgbG9hZCxcbiAgbG9hZEFycmF5UmVzdWx0LFxufTtcbiJdfQ==