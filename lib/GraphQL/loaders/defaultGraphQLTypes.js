"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.loadArrayResult = exports.load = exports.PUBLIC_ACL = exports.ROLE_ACL = exports.USER_ACL = exports.ACL = exports.PUBLIC_ACL_INPUT = exports.ROLE_ACL_INPUT = exports.USER_ACL_INPUT = exports.ACL_INPUT = exports.ELEMENT = exports.ARRAY_RESULT = exports.POLYGON_WHERE_INPUT = exports.GEO_POINT_WHERE_INPUT = exports.FILE_WHERE_INPUT = exports.BYTES_WHERE_INPUT = exports.DATE_WHERE_INPUT = exports.OBJECT_WHERE_INPUT = exports.KEY_VALUE_INPUT = exports.ARRAY_WHERE_INPUT = exports.BOOLEAN_WHERE_INPUT = exports.NUMBER_WHERE_INPUT = exports.STRING_WHERE_INPUT = exports.ID_WHERE_INPUT = exports.notInQueryKey = exports.inQueryKey = exports.options = exports.matchesRegex = exports.exists = exports.notIn = exports.inOp = exports.greaterThanOrEqualTo = exports.greaterThan = exports.lessThanOrEqualTo = exports.lessThan = exports.notEqualTo = exports.equalTo = exports.GEO_INTERSECTS_INPUT = exports.GEO_WITHIN_INPUT = exports.CENTER_SPHERE_INPUT = exports.WITHIN_INPUT = exports.BOX_INPUT = exports.TEXT_INPUT = exports.SEARCH_INPUT = exports.COUNT_ATT = exports.LIMIT_ATT = exports.SKIP_ATT = exports.WHERE_ATT = exports.READ_OPTIONS_ATT = exports.READ_OPTIONS_INPUT = exports.SUBQUERY_READ_PREFERENCE_ATT = exports.INCLUDE_READ_PREFERENCE_ATT = exports.READ_PREFERENCE_ATT = exports.READ_PREFERENCE = exports.SESSION_TOKEN_ATT = exports.PARSE_OBJECT = exports.PARSE_OBJECT_FIELDS = exports.UPDATE_RESULT_FIELDS = exports.CREATE_RESULT_FIELDS = exports.INPUT_FIELDS = exports.CREATED_AT_ATT = exports.UPDATED_AT_ATT = exports.OBJECT_ID_ATT = exports.GLOBAL_OR_OBJECT_ID_ATT = exports.CLASS_NAME_ATT = exports.OBJECT_ID = exports.POLYGON = exports.POLYGON_INPUT = exports.GEO_POINT = exports.GEO_POINT_INPUT = exports.GEO_POINT_FIELDS = exports.FILE_INPUT = exports.FILE_INFO = exports.FILE = exports.SELECT_INPUT = exports.SUBQUERY_INPUT = exports.parseFileValue = exports.BYTES = exports.DATE = exports.serializeDateIso = exports.parseDateIsoValue = exports.OBJECT = exports.ANY = exports.parseObjectFields = exports.parseListValues = exports.parseValue = exports.parseBooleanValue = exports.parseFloatValue = exports.parseIntValue = exports.parseStringValue = exports.TypeValidationError = void 0;

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
const FILE_INPUT = new _graphql.GraphQLInputObjectType({
  name: 'FileInput',
  fields: {
    file: {
      description: 'A File Scalar can be an url or a FileInfo object.',
      type: FILE
    },
    upload: {
      description: 'Use this field if you want to create a new file.',
      type: _graphqlUpload.GraphQLUpload
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcy5qcyJdLCJuYW1lcyI6WyJUeXBlVmFsaWRhdGlvbkVycm9yIiwiRXJyb3IiLCJjb25zdHJ1Y3RvciIsInZhbHVlIiwidHlwZSIsInBhcnNlU3RyaW5nVmFsdWUiLCJwYXJzZUludFZhbHVlIiwiaW50IiwiTnVtYmVyIiwiaXNJbnRlZ2VyIiwicGFyc2VGbG9hdFZhbHVlIiwiZmxvYXQiLCJpc05hTiIsInBhcnNlQm9vbGVhblZhbHVlIiwicGFyc2VWYWx1ZSIsImtpbmQiLCJLaW5kIiwiU1RSSU5HIiwiSU5UIiwiRkxPQVQiLCJCT09MRUFOIiwiTElTVCIsInBhcnNlTGlzdFZhbHVlcyIsInZhbHVlcyIsIk9CSkVDVCIsInBhcnNlT2JqZWN0RmllbGRzIiwiZmllbGRzIiwiQXJyYXkiLCJpc0FycmF5IiwibWFwIiwicmVkdWNlIiwib2JqZWN0IiwiZmllbGQiLCJuYW1lIiwiQU5ZIiwiR3JhcGhRTFNjYWxhclR5cGUiLCJkZXNjcmlwdGlvbiIsInNlcmlhbGl6ZSIsInBhcnNlTGl0ZXJhbCIsImFzdCIsInBhcnNlRGF0ZUlzb1ZhbHVlIiwiZGF0ZSIsIkRhdGUiLCJzZXJpYWxpemVEYXRlSXNvIiwidG9VVENTdHJpbmciLCJwYXJzZURhdGVJc29MaXRlcmFsIiwiREFURSIsIl9fdHlwZSIsImlzbyIsImZpbmQiLCJCWVRFUyIsImJhc2U2NCIsInBhcnNlRmlsZVZhbHVlIiwidXJsIiwidW5kZWZpbmVkIiwiRklMRSIsIkZJTEVfSU5GTyIsIkdyYXBoUUxPYmplY3RUeXBlIiwiR3JhcGhRTE5vbk51bGwiLCJHcmFwaFFMU3RyaW5nIiwiRklMRV9JTlBVVCIsIkdyYXBoUUxJbnB1dE9iamVjdFR5cGUiLCJmaWxlIiwidXBsb2FkIiwiR3JhcGhRTFVwbG9hZCIsIkdFT19QT0lOVF9GSUVMRFMiLCJsYXRpdHVkZSIsIkdyYXBoUUxGbG9hdCIsImxvbmdpdHVkZSIsIkdFT19QT0lOVF9JTlBVVCIsIkdFT19QT0lOVCIsIlBPTFlHT05fSU5QVVQiLCJHcmFwaFFMTGlzdCIsIlBPTFlHT04iLCJVU0VSX0FDTF9JTlBVVCIsInVzZXJJZCIsIkdyYXBoUUxJRCIsInJlYWQiLCJHcmFwaFFMQm9vbGVhbiIsIndyaXRlIiwiUk9MRV9BQ0xfSU5QVVQiLCJyb2xlTmFtZSIsIlBVQkxJQ19BQ0xfSU5QVVQiLCJBQ0xfSU5QVVQiLCJ1c2VycyIsInJvbGVzIiwicHVibGljIiwiVVNFUl9BQ0wiLCJST0xFX0FDTCIsIlBVQkxJQ19BQ0wiLCJBQ0wiLCJyZXNvbHZlIiwicCIsIk9iamVjdCIsImtleXMiLCJmb3JFYWNoIiwicnVsZSIsImluZGV4T2YiLCJwdXNoIiwibGVuZ3RoIiwicmVwbGFjZSIsIk9CSkVDVF9JRCIsIkNMQVNTX05BTUVfQVRUIiwiR0xPQkFMX09SX09CSkVDVF9JRF9BVFQiLCJPQkpFQ1RfSURfQVRUIiwiQ1JFQVRFRF9BVF9BVFQiLCJVUERBVEVEX0FUX0FUVCIsIklOUFVUX0ZJRUxEUyIsIkNSRUFURV9SRVNVTFRfRklFTERTIiwib2JqZWN0SWQiLCJjcmVhdGVkQXQiLCJVUERBVEVfUkVTVUxUX0ZJRUxEUyIsInVwZGF0ZWRBdCIsIlBBUlNFX09CSkVDVF9GSUVMRFMiLCJQQVJTRV9PQkpFQ1QiLCJHcmFwaFFMSW50ZXJmYWNlVHlwZSIsIlNFU1NJT05fVE9LRU5fQVRUIiwiUkVBRF9QUkVGRVJFTkNFIiwiR3JhcGhRTEVudW1UeXBlIiwiUFJJTUFSWSIsIlBSSU1BUllfUFJFRkVSUkVEIiwiU0VDT05EQVJZIiwiU0VDT05EQVJZX1BSRUZFUlJFRCIsIk5FQVJFU1QiLCJSRUFEX1BSRUZFUkVOQ0VfQVRUIiwiSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRUIiwiU1VCUVVFUllfUkVBRF9QUkVGRVJFTkNFX0FUVCIsIlJFQURfT1BUSU9OU19JTlBVVCIsInJlYWRQcmVmZXJlbmNlIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsIlJFQURfT1BUSU9OU19BVFQiLCJXSEVSRV9BVFQiLCJTS0lQX0FUVCIsIkdyYXBoUUxJbnQiLCJMSU1JVF9BVFQiLCJDT1VOVF9BVFQiLCJTRUFSQ0hfSU5QVVQiLCJ0ZXJtIiwibGFuZ3VhZ2UiLCJjYXNlU2Vuc2l0aXZlIiwiZGlhY3JpdGljU2Vuc2l0aXZlIiwiVEVYVF9JTlBVVCIsInNlYXJjaCIsIkJPWF9JTlBVVCIsImJvdHRvbUxlZnQiLCJ1cHBlclJpZ2h0IiwiV0lUSElOX0lOUFVUIiwiYm94IiwiQ0VOVEVSX1NQSEVSRV9JTlBVVCIsImNlbnRlciIsImRpc3RhbmNlIiwiR0VPX1dJVEhJTl9JTlBVVCIsInBvbHlnb24iLCJjZW50ZXJTcGhlcmUiLCJHRU9fSU5URVJTRUNUU19JTlBVVCIsInBvaW50IiwiZXF1YWxUbyIsIm5vdEVxdWFsVG8iLCJsZXNzVGhhbiIsImxlc3NUaGFuT3JFcXVhbFRvIiwiZ3JlYXRlclRoYW4iLCJncmVhdGVyVGhhbk9yRXF1YWxUbyIsImluT3AiLCJub3RJbiIsImV4aXN0cyIsIm1hdGNoZXNSZWdleCIsIm9wdGlvbnMiLCJTVUJRVUVSWV9JTlBVVCIsImNsYXNzTmFtZSIsIndoZXJlIiwiYXNzaWduIiwiU0VMRUNUX0lOUFVUIiwicXVlcnkiLCJrZXkiLCJpblF1ZXJ5S2V5Iiwibm90SW5RdWVyeUtleSIsIklEX1dIRVJFX0lOUFVUIiwiaW4iLCJTVFJJTkdfV0hFUkVfSU5QVVQiLCJ0ZXh0IiwiTlVNQkVSX1dIRVJFX0lOUFVUIiwiQk9PTEVBTl9XSEVSRV9JTlBVVCIsIkFSUkFZX1dIRVJFX0lOUFVUIiwiY29udGFpbmVkQnkiLCJjb250YWlucyIsIktFWV9WQUxVRV9JTlBVVCIsIk9CSkVDVF9XSEVSRV9JTlBVVCIsIkRBVEVfV0hFUkVfSU5QVVQiLCJCWVRFU19XSEVSRV9JTlBVVCIsIkZJTEVfV0hFUkVfSU5QVVQiLCJHRU9fUE9JTlRfV0hFUkVfSU5QVVQiLCJuZWFyU3BoZXJlIiwibWF4RGlzdGFuY2UiLCJtYXhEaXN0YW5jZUluUmFkaWFucyIsIm1heERpc3RhbmNlSW5NaWxlcyIsIm1heERpc3RhbmNlSW5LaWxvbWV0ZXJzIiwid2l0aGluIiwiZ2VvV2l0aGluIiwiUE9MWUdPTl9XSEVSRV9JTlBVVCIsImdlb0ludGVyc2VjdHMiLCJFTEVNRU5UIiwiQVJSQVlfUkVTVUxUIiwibG9hZEFycmF5UmVzdWx0IiwicGFyc2VHcmFwaFFMU2NoZW1hIiwicGFyc2VDbGFzc2VzIiwiY2xhc3NUeXBlcyIsImZpbHRlciIsInBhcnNlQ2xhc3MiLCJwYXJzZUNsYXNzVHlwZXMiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwiR3JhcGhRTFVuaW9uVHlwZSIsInR5cGVzIiwicmVzb2x2ZVR5cGUiLCJncmFwaFFMVHlwZXMiLCJsb2FkIiwiYWRkR3JhcGhRTFR5cGUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFnQkE7Ozs7Ozs7O0FBRUEsTUFBTUEsbUJBQU4sU0FBa0NDLEtBQWxDLENBQXdDO0FBQ3RDQyxFQUFBQSxXQUFXLENBQUNDLEtBQUQsRUFBUUMsSUFBUixFQUFjO0FBQ3ZCLFVBQU8sR0FBRUQsS0FBTSxtQkFBa0JDLElBQUssRUFBdEM7QUFDRDs7QUFIcUM7Ozs7QUFNeEMsTUFBTUMsZ0JBQWdCLEdBQUdGLEtBQUssSUFBSTtBQUNoQyxNQUFJLE9BQU9BLEtBQVAsS0FBaUIsUUFBckIsRUFBK0I7QUFDN0IsV0FBT0EsS0FBUDtBQUNEOztBQUVELFFBQU0sSUFBSUgsbUJBQUosQ0FBd0JHLEtBQXhCLEVBQStCLFFBQS9CLENBQU47QUFDRCxDQU5EOzs7O0FBUUEsTUFBTUcsYUFBYSxHQUFHSCxLQUFLLElBQUk7QUFDN0IsTUFBSSxPQUFPQSxLQUFQLEtBQWlCLFFBQXJCLEVBQStCO0FBQzdCLFVBQU1JLEdBQUcsR0FBR0MsTUFBTSxDQUFDTCxLQUFELENBQWxCOztBQUNBLFFBQUlLLE1BQU0sQ0FBQ0MsU0FBUCxDQUFpQkYsR0FBakIsQ0FBSixFQUEyQjtBQUN6QixhQUFPQSxHQUFQO0FBQ0Q7QUFDRjs7QUFFRCxRQUFNLElBQUlQLG1C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QUFrQzVDLFlBQWxDLEVBQWdELElBQWhEO0FBQ0QsQ0E1Q0QiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQge1xuICBLaW5kLFxuICBHcmFwaFFMTm9uTnVsbCxcbiAgR3JhcGhRTFNjYWxhclR5cGUsXG4gIEdyYXBoUUxJRCxcbiAgR3JhcGhRTFN0cmluZyxcbiAgR3JhcGhRTE9iamVjdFR5cGUsXG4gIEdyYXBoUUxJbnRlcmZhY2VUeXBlLFxuICBHcmFwaFFMRW51bVR5cGUsXG4gIEdyYXBoUUxJbnQsXG4gIEdyYXBoUUxGbG9hdCxcbiAgR3JhcGhRTExpc3QsXG4gIEdyYXBoUUxJbnB1dE9iamVjdFR5cGUsXG4gIEdyYXBoUUxCb29sZWFuLFxuICBHcmFwaFFMVW5pb25UeXBlLFxufSBmcm9tICdncmFwaHFsJztcbmltcG9ydCB7IEdyYXBoUUxVcGxvYWQgfSBmcm9tICdncmFwaHFsLXVwbG9hZCc7XG5cbmNsYXNzIFR5cGVWYWxpZGF0aW9uRXJyb3IgZXh0ZW5kcyBFcnJvciB7XG4gIGNvbnN0cnVjdG9yKHZhbHVlLCB0eXBlKSB7XG4gICAgc3VwZXIoYCR7dmFsdWV9IGlzIG5vdCBhIHZhbGlkICR7dHlwZX1gKTtcbiAgfVxufVxuXG5jb25zdCBwYXJzZVN0cmluZ1ZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnU3RyaW5nJyk7XG59O1xuXG5jb25zdCBwYXJzZUludFZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIGNvbnN0IGludCA9IE51bWJlcih2YWx1ZSk7XG4gICAgaWYgKE51bWJlci5pc0ludGVnZXIoaW50KSkge1xuICAgICAgcmV0dXJuIGludDtcbiAgICB9XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0ludCcpO1xufTtcblxuY29uc3QgcGFyc2VGbG9hdFZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIGNvbnN0IGZsb2F0ID0gTnVtYmVyKHZhbHVlKTtcbiAgICBpZiAoIWlzTmFOKGZsb2F0KSkge1xuICAgICAgcmV0dXJuIGZsb2F0O1xuICAgIH1cbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRmxvYXQnKTtcbn07XG5cbmNvbnN0IHBhcnNlQm9vbGVhblZhbHVlID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnYm9vbGVhbicpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0Jvb2xlYW4nKTtcbn07XG5cbmNvbnN0IHBhcnNlVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIHN3aXRjaCAodmFsdWUua2luZCkge1xuICAgIGNhc2UgS2luZC5TVFJJTkc6XG4gICAgICByZXR1cm4gcGFyc2VTdHJpbmdWYWx1ZSh2YWx1ZS52YWx1ZSk7XG5cbiAgICBjYXNlIEtpbmQuSU5UOlxuICAgICAgcmV0dXJuIHBhcnNlSW50VmFsdWUodmFsdWUudmFsdWUpO1xuXG4gICAgY2FzZSBLaW5kLkZMT0FUOlxuICAgICAgcmV0dXJuIHBhcnNlRmxvYXRWYWx1ZSh2YWx1ZS52YWx1ZSk7XG5cbiAgICBjYXNlIEtpbmQuQk9PTEVBTjpcbiAgICAgIHJldHVybiBwYXJzZUJvb2xlYW5WYWx1ZSh2YWx1ZS52YWx1ZSk7XG5cbiAgICBjYXNlIEtpbmQuTElTVDpcbiAgICAgIHJldHVybiBwYXJzZUxpc3RWYWx1ZXModmFsdWUudmFsdWVzKTtcblxuICAgIGNhc2UgS2luZC5PQkpFQ1Q6XG4gICAgICByZXR1cm4gcGFyc2VPYmplY3RGaWVsZHModmFsdWUuZmllbGRzKTtcblxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gdmFsdWUudmFsdWU7XG4gIH1cbn07XG5cbmNvbnN0IHBhcnNlTGlzdFZhbHVlcyA9IHZhbHVlcyA9PiB7XG4gIGlmIChBcnJheS5pc0FycmF5KHZhbHVlcykpIHtcbiAgICByZXR1cm4gdmFsdWVzLm1hcCh2YWx1ZSA9PiBwYXJzZVZhbHVlKHZhbHVlKSk7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZXMsICdMaXN0Jyk7XG59O1xuXG5jb25zdCBwYXJzZU9iamVjdEZpZWxkcyA9IGZpZWxkcyA9PiB7XG4gIGlmIChBcnJheS5pc0FycmF5KGZpZWxkcykpIHtcbiAgICByZXR1cm4gZmllbGRzLnJlZHVjZShcbiAgICAgIChvYmplY3QsIGZpZWxkKSA9PiAoe1xuICAgICAgICAuLi5vYmplY3QsXG4gICAgICAgIFtmaWVsZC5uYW1lLnZhbHVlXTogcGFyc2VWYWx1ZShmaWVsZC52YWx1ZSksXG4gICAgICB9KSxcbiAgICAgIHt9XG4gICAgKTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGZpZWxkcywgJ09iamVjdCcpO1xufTtcblxuY29uc3QgQU5ZID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ0FueScsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQW55IHNjYWxhciB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyBhbmQgdHlwZXMgdGhhdCBpbnZvbHZlIGFueSB0eXBlIG9mIHZhbHVlLicsXG4gIHBhcnNlVmFsdWU6IHZhbHVlID0+IHZhbHVlLFxuICBzZXJpYWxpemU6IHZhbHVlID0+IHZhbHVlLFxuICBwYXJzZUxpdGVyYWw6IGFzdCA9PiBwYXJzZVZhbHVlKGFzdCksXG59KTtcblxuY29uc3QgT0JKRUNUID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ09iamVjdCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgT2JqZWN0IHNjYWxhciB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyBhbmQgdHlwZXMgdGhhdCBpbnZvbHZlIG9iamVjdHMuJyxcbiAgcGFyc2VWYWx1ZSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdPYmplY3QnKTtcbiAgfSxcbiAgc2VyaWFsaXplKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ09iamVjdCcpO1xuICB9LFxuICBwYXJzZUxpdGVyYWwoYXN0KSB7XG4gICAgaWYgKGFzdC5raW5kID09PSBLaW5kLk9CSkVDVCkge1xuICAgICAgcmV0dXJuIHBhcnNlT2JqZWN0RmllbGRzKGFzdC5maWVsZHMpO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnT2JqZWN0Jyk7XG4gIH0sXG59KTtcblxuY29uc3QgcGFyc2VEYXRlSXNvVmFsdWUgPSB2YWx1ZSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgY29uc3QgZGF0ZSA9IG5ldyBEYXRlKHZhbHVlKTtcbiAgICBpZiAoIWlzTmFOKGRhdGUpKSB7XG4gICAgICByZXR1cm4gZGF0ZTtcbiAgICB9XG4gIH0gZWxzZSBpZiAodmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdEYXRlJyk7XG59O1xuXG5jb25zdCBzZXJpYWxpemVEYXRlSXNvID0gdmFsdWUgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuICBpZiAodmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgcmV0dXJuIHZhbHVlLnRvVVRDU3RyaW5nKCk7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0RhdGUnKTtcbn07XG5cbmNvbnN0IHBhcnNlRGF0ZUlzb0xpdGVyYWwgPSBhc3QgPT4ge1xuICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgcmV0dXJuIHBhcnNlRGF0ZUlzb1ZhbHVlKGFzdC52YWx1ZSk7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcihhc3Qua2luZCwgJ0RhdGUnKTtcbn07XG5cbmNvbnN0IERBVEUgPSBuZXcgR3JhcGhRTFNjYWxhclR5cGUoe1xuICBuYW1lOiAnRGF0ZScsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgRGF0ZSBzY2FsYXIgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgYW5kIHR5cGVzIHRoYXQgaW52b2x2ZSBkYXRlcy4nLFxuICBwYXJzZVZhbHVlKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgfHwgdmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBwYXJzZURhdGVJc29WYWx1ZSh2YWx1ZSksXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICB2YWx1ZS5fX3R5cGUgPT09ICdEYXRlJyAmJlxuICAgICAgdmFsdWUuaXNvXG4gICAgKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6IHZhbHVlLl9fdHlwZSxcbiAgICAgICAgaXNvOiBwYXJzZURhdGVJc29WYWx1ZSh2YWx1ZS5pc28pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0RhdGUnKTtcbiAgfSxcbiAgc2VyaWFsaXplKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgfHwgdmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICByZXR1cm4gc2VyaWFsaXplRGF0ZUlzbyh2YWx1ZSk7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnICYmXG4gICAgICB2YWx1ZS5pc29cbiAgICApIHtcbiAgICAgIHJldHVybiBzZXJpYWxpemVEYXRlSXNvKHZhbHVlLmlzbyk7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdEYXRlJyk7XG4gIH0sXG4gIHBhcnNlTGl0ZXJhbChhc3QpIHtcbiAgICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBwYXJzZURhdGVJc29MaXRlcmFsKGFzdCksXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoYXN0LmtpbmQgPT09IEtpbmQuT0JKRUNUKSB7XG4gICAgICBjb25zdCBfX3R5cGUgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ19fdHlwZScpO1xuICAgICAgY29uc3QgaXNvID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdpc28nKTtcbiAgICAgIGlmIChfX3R5cGUgJiYgX190eXBlLnZhbHVlICYmIF9fdHlwZS52YWx1ZS52YWx1ZSA9PT0gJ0RhdGUnICYmIGlzbykge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIF9fdHlwZTogX190eXBlLnZhbHVlLnZhbHVlLFxuICAgICAgICAgIGlzbzogcGFyc2VEYXRlSXNvTGl0ZXJhbChpc28udmFsdWUpLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnRGF0ZScpO1xuICB9LFxufSk7XG5cbmNvbnN0IEJZVEVTID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ0J5dGVzJyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBCeXRlcyBzY2FsYXIgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgYW5kIHR5cGVzIHRoYXQgaW52b2x2ZSBiYXNlIDY0IGJpbmFyeSBkYXRhLicsXG4gIHBhcnNlVmFsdWUodmFsdWUpIHtcbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnQnl0ZXMnLFxuICAgICAgICBiYXNlNjQ6IHZhbHVlLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgdmFsdWUuX190eXBlID09PSAnQnl0ZXMnICYmXG4gICAgICB0eXBlb2YgdmFsdWUuYmFzZTY0ID09PSAnc3RyaW5nJ1xuICAgICkge1xuICAgICAgcmV0dXJuIHZhbHVlO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnQnl0ZXMnKTtcbiAgfSxcbiAgc2VyaWFsaXplKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9IGVsc2UgaWYgKFxuICAgICAgdHlwZW9mIHZhbHVlID09PSAnb2JqZWN0JyAmJlxuICAgICAgdmFsdWUuX190eXBlID09PSAnQnl0ZXMnICYmXG4gICAgICB0eXBlb2YgdmFsdWUuYmFzZTY0ID09PSAnc3RyaW5nJ1xuICAgICkge1xuICAgICAgcmV0dXJuIHZhbHVlLmJhc2U2NDtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0J5dGVzJyk7XG4gIH0sXG4gIHBhcnNlTGl0ZXJhbChhc3QpIHtcbiAgICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdCeXRlcycsXG4gICAgICAgIGJhc2U2NDogYXN0LnZhbHVlLFxuICAgICAgfTtcbiAgICB9IGVsc2UgaWYgKGFzdC5raW5kID09PSBLaW5kLk9CSkVDVCkge1xuICAgICAgY29uc3QgX190eXBlID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdfX3R5cGUnKTtcbiAgICAgIGNvbnN0IGJhc2U2NCA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnYmFzZTY0Jyk7XG4gICAgICBpZiAoXG4gICAgICAgIF9fdHlwZSAmJlxuICAgICAgICBfX3R5cGUudmFsdWUgJiZcbiAgICAgICAgX190eXBlLnZhbHVlLnZhbHVlID09PSAnQnl0ZXMnICYmXG4gICAgICAgIGJhc2U2NCAmJlxuICAgICAgICBiYXNlNjQudmFsdWUgJiZcbiAgICAgICAgdHlwZW9mIGJhc2U2NC52YWx1ZS52YWx1ZSA9PT0gJ3N0cmluZydcbiAgICAgICkge1xuICAgICAgICByZXR1cm4ge1xuICAgICAgICAgIF9fdHlwZTogX190eXBlLnZhbHVlLnZhbHVlLFxuICAgICAgICAgIGJhc2U2NDogYmFzZTY0LnZhbHVlLnZhbHVlLFxuICAgICAgICB9O1xuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnQnl0ZXMnKTtcbiAgfSxcbn0pO1xuXG5jb25zdCBwYXJzZUZpbGVWYWx1ZSA9IHZhbHVlID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4ge1xuICAgICAgX190eXBlOiAnRmlsZScsXG4gICAgICBuYW1lOiB2YWx1ZSxcbiAgICB9O1xuICB9IGVsc2UgaWYgKFxuICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICB2YWx1ZS5fX3R5cGUgPT09ICdGaWxlJyAmJlxuICAgIHR5cGVvZiB2YWx1ZS5uYW1lID09PSAnc3RyaW5nJyAmJlxuICAgICh2YWx1ZS51cmwgPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgdmFsdWUudXJsID09PSAnc3RyaW5nJylcbiAgKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdGaWxlJyk7XG59O1xuXG5jb25zdCBGSUxFID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ0ZpbGUnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEZpbGUgc2NhbGFyIHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIGFuZCB0eXBlcyB0aGF0IGludm9sdmUgZmlsZXMuJyxcbiAgcGFyc2VWYWx1ZTogcGFyc2VGaWxlVmFsdWUsXG4gIHNlcmlhbGl6ZTogdmFsdWUgPT4ge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHZhbHVlLl9fdHlwZSA9PT0gJ0ZpbGUnICYmXG4gICAgICB0eXBlb2YgdmFsdWUubmFtZSA9PT0gJ3N0cmluZycgJiZcbiAgICAgICh2YWx1ZS51cmwgPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgdmFsdWUudXJsID09PSAnc3RyaW5nJylcbiAgICApIHtcbiAgICAgIHJldHVybiB2YWx1ZS5uYW1lO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRmlsZScpO1xuICB9LFxuICBwYXJzZUxpdGVyYWwoYXN0KSB7XG4gICAgaWYgKGFzdC5raW5kID09PSBLaW5kLlNUUklORykge1xuICAgICAgcmV0dXJuIHBhcnNlRmlsZVZhbHVlKGFzdC52YWx1ZSk7XG4gICAgfSBlbHNlIGlmIChhc3Qua2luZCA9PT0gS2luZC5PQkpFQ1QpIHtcbiAgICAgIGNvbnN0IF9fdHlwZSA9IGFzdC5maWVsZHMuZmluZChmaWVsZCA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnX190eXBlJyk7XG4gICAgICBjb25zdCBuYW1lID0gYXN0LmZpZWxkcy5maW5kKGZpZWxkID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICduYW1lJyk7XG4gICAgICBjb25zdCB1cmwgPSBhc3QuZmllbGRzLmZpbmQoZmllbGQgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ3VybCcpO1xuICAgICAgaWYgKF9fdHlwZSAmJiBfX3R5cGUudmFsdWUgJiYgbmFtZSAmJiBuYW1lLnZhbHVlKSB7XG4gICAgICAgIHJldHVybiBwYXJzZUZpbGVWYWx1ZSh7XG4gICAgICAgICAgX190eXBlOiBfX3R5cGUudmFsdWUudmFsdWUsXG4gICAgICAgICAgbmFtZTogbmFtZS52YWx1ZS52YWx1ZSxcbiAgICAgICAgICB1cmw6IHVybCAmJiB1cmwudmFsdWUgPyB1cmwudmFsdWUudmFsdWUgOiB1bmRlZmluZWQsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnRmlsZScpO1xuICB9LFxufSk7XG5cbmNvbnN0IEZJTEVfSU5GTyA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdGaWxlSW5mbycsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgRmlsZUluZm8gb2JqZWN0IHR5cGUgaXMgdXNlZCB0byByZXR1cm4gdGhlIGluZm9ybWF0aW9uIGFib3V0IGZpbGVzLicsXG4gIGZpZWxkczoge1xuICAgIG5hbWU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZmlsZSBuYW1lLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgICB1cmw6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXJsIGluIHdoaWNoIHRoZSBmaWxlIGNhbiBiZSBkb3dubG9hZGVkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBGSUxFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnRmlsZUlucHV0JyxcbiAgZmllbGRzOiB7XG4gICAgZmlsZToge1xuICAgICAgZGVzY3JpcHRpb246ICdBIEZpbGUgU2NhbGFyIGNhbiBiZSBhbiB1cmwgb3IgYSBGaWxlSW5mbyBvYmplY3QuJyxcbiAgICAgIHR5cGU6IEZJTEUsXG4gICAgfSxcbiAgICB1cGxvYWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVXNlIHRoaXMgZmllbGQgaWYgeW91IHdhbnQgdG8gY3JlYXRlIGEgbmV3IGZpbGUuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxVcGxvYWQsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBHRU9fUE9JTlRfRklFTERTID0ge1xuICBsYXRpdHVkZToge1xuICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbGF0aXR1ZGUuJyxcbiAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEZsb2F0KSxcbiAgfSxcbiAgbG9uZ2l0dWRlOiB7XG4gICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBsb25naXR1ZGUuJyxcbiAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEZsb2F0KSxcbiAgfSxcbn07XG5cbmNvbnN0IEdFT19QT0lOVF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0dlb1BvaW50SW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEdlb1BvaW50SW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGlucHV0dGluZyBmaWVsZHMgb2YgdHlwZSBnZW8gcG9pbnQuJyxcbiAgZmllbGRzOiBHRU9fUE9JTlRfRklFTERTLFxufSk7XG5cbmNvbnN0IEdFT19QT0lOVCA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdHZW9Qb2ludCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgR2VvUG9pbnQgb2JqZWN0IHR5cGUgaXMgdXNlZCB0byByZXR1cm4gdGhlIGluZm9ybWF0aW9uIGFib3V0IGdlbyBwb2ludCBmaWVsZHMuJyxcbiAgZmllbGRzOiBHRU9fUE9JTlRfRklFTERTLFxufSk7XG5cbmNvbnN0IFBPTFlHT05fSU5QVVQgPSBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVF9JTlBVVCkpO1xuXG5jb25zdCBQT0xZR09OID0gbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChHRU9fUE9JTlQpKTtcblxuY29uc3QgVVNFUl9BQ0xfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdVc2VyQUNMSW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ0FsbG93IHRvIG1hbmFnZSB1c2VycyBpbiBBQ0wuJyxcbiAgZmllbGRzOiB7XG4gICAgdXNlcklkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0lEIG9mIHRoZSB0YXJnZXR0ZWQgVXNlci4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxJRCksXG4gICAgfSxcbiAgICByZWFkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IHRoZSB1c2VyIHRvIHJlYWQgdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gICAgd3JpdGU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgdGhlIHVzZXIgdG8gd3JpdGUgb24gdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgUk9MRV9BQ0xfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdSb2xlQUNMSW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ0FsbG93IHRvIG1hbmFnZSByb2xlcyBpbiBBQ0wuJyxcbiAgZmllbGRzOiB7XG4gICAgcm9sZU5hbWU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgdGFyZ2V0dGVkIFJvbGUuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICB9LFxuICAgIHJlYWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnQWxsb3cgdXNlcnMgd2hvIGFyZSBtZW1iZXJzIG9mIHRoZSByb2xlIHRvIHJlYWQgdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gICAgd3JpdGU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnQWxsb3cgdXNlcnMgd2hvIGFyZSBtZW1iZXJzIG9mIHRoZSByb2xlIHRvIHdyaXRlIG9uIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFBVQkxJQ19BQ0xfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdQdWJsaWNBQ0xJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnQWxsb3cgdG8gbWFuYWdlIHB1YmxpYyByaWdodHMuJyxcbiAgZmllbGRzOiB7XG4gICAgcmVhZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyBhbnlvbmUgdG8gcmVhZCB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgICB3cml0ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyBhbnlvbmUgdG8gd3JpdGUgb24gdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgQUNMX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnQUNMSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnQWxsb3cgdG8gbWFuYWdlIGFjY2VzcyByaWdodHMuIElmIG5vdCBwcm92aWRlZCBvYmplY3Qgd2lsbCBiZSBwdWJsaWNseSByZWFkYWJsZSBhbmQgd3JpdGFibGUnLFxuICBmaWVsZHM6IHtcbiAgICB1c2Vyczoge1xuICAgICAgZGVzY3JpcHRpb246ICdBY2Nlc3MgY29udHJvbCBsaXN0IGZvciB1c2Vycy4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChVU0VSX0FDTF9JTlBVVCkpLFxuICAgIH0sXG4gICAgcm9sZXM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWNjZXNzIGNvbnRyb2wgbGlzdCBmb3Igcm9sZXMuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoUk9MRV9BQ0xfSU5QVVQpKSxcbiAgICB9LFxuICAgIHB1YmxpYzoge1xuICAgICAgZGVzY3JpcHRpb246ICdQdWJsaWMgYWNjZXNzIGNvbnRyb2wgbGlzdC4nLFxuICAgICAgdHlwZTogUFVCTElDX0FDTF9JTlBVVCxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFVTRVJfQUNMID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1VzZXJBQ0wnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnQWxsb3cgdG8gbWFuYWdlIHVzZXJzIGluIEFDTC4gSWYgcmVhZCBhbmQgd3JpdGUgYXJlIG51bGwgdGhlIHVzZXJzIGhhdmUgcmVhZCBhbmQgd3JpdGUgcmlnaHRzLicsXG4gIGZpZWxkczoge1xuICAgIHVzZXJJZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdJRCBvZiB0aGUgdGFyZ2V0dGVkIFVzZXIuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMSUQpLFxuICAgIH0sXG4gICAgcmVhZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyB0aGUgdXNlciB0byByZWFkIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICAgIHdyaXRlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IHRoZSB1c2VyIHRvIHdyaXRlIG9uIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFJPTEVfQUNMID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1JvbGVBQ0wnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnQWxsb3cgdG8gbWFuYWdlIHJvbGVzIGluIEFDTC4gSWYgcmVhZCBhbmQgd3JpdGUgYXJlIG51bGwgdGhlIHJvbGUgaGF2ZSByZWFkIGFuZCB3cml0ZSByaWdodHMuJyxcbiAgZmllbGRzOiB7XG4gICAgcm9sZU5hbWU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgdGFyZ2V0dGVkIFJvbGUuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMSUQpLFxuICAgIH0sXG4gICAgcmVhZDoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdBbGxvdyB1c2VycyB3aG8gYXJlIG1lbWJlcnMgb2YgdGhlIHJvbGUgdG8gcmVhZCB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgICB3cml0ZToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdBbGxvdyB1c2VycyB3aG8gYXJlIG1lbWJlcnMgb2YgdGhlIHJvbGUgdG8gd3JpdGUgb24gdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgUFVCTElDX0FDTCA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdQdWJsaWNBQ0wnLFxuICBkZXNjcmlwdGlvbjogJ0FsbG93IHRvIG1hbmFnZSBwdWJsaWMgcmlnaHRzLicsXG4gIGZpZWxkczoge1xuICAgIHJlYWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgYW55b25lIHRvIHJlYWQgdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBHcmFwaFFMQm9vbGVhbixcbiAgICB9LFxuICAgIHdyaXRlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IGFueW9uZSB0byB3cml0ZSBvbiB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxCb29sZWFuLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgQUNMID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0FDTCcsXG4gIGRlc2NyaXB0aW9uOiAnQ3VycmVudCBhY2Nlc3MgY29udHJvbCBsaXN0IG9mIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICBmaWVsZHM6IHtcbiAgICB1c2Vyczoge1xuICAgICAgZGVzY3JpcHRpb246ICdBY2Nlc3MgY29udHJvbCBsaXN0IGZvciB1c2Vycy4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChVU0VSX0FDTCkpLFxuICAgICAgcmVzb2x2ZShwKSB7XG4gICAgICAgIGNvbnN0IHVzZXJzID0gW107XG4gICAgICAgIE9iamVjdC5rZXlzKHApLmZvckVhY2gocnVsZSA9PiB7XG4gICAgICAgICAgaWYgKHJ1bGUgIT09ICcqJyAmJiBydWxlLmluZGV4T2YoJ3JvbGU6JykgIT09IDApIHtcbiAgICAgICAgICAgIHVzZXJzLnB1c2goe1xuICAgICAgICAgICAgICB1c2VySWQ6IHJ1bGUsXG4gICAgICAgICAgICAgIHJlYWQ6IHBbcnVsZV0ucmVhZCA/IHRydWUgOiBmYWxzZSxcbiAgICAgICAgICAgICAgd3JpdGU6IHBbcnVsZV0ud3JpdGUgPyB0cnVlIDogZmFsc2UsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gdXNlcnMubGVuZ3RoID8gdXNlcnMgOiBudWxsO1xuICAgICAgfSxcbiAgICB9LFxuICAgIHJvbGVzOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FjY2VzcyBjb250cm9sIGxpc3QgZm9yIHJvbGVzLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKFJPTEVfQUNMKSksXG4gICAgICByZXNvbHZlKHApIHtcbiAgICAgICAgY29uc3Qgcm9sZXMgPSBbXTtcbiAgICAgICAgT2JqZWN0LmtleXMocCkuZm9yRWFjaChydWxlID0+IHtcbiAgICAgICAgICBpZiAocnVsZS5pbmRleE9mKCdyb2xlOicpID09PSAwKSB7XG4gICAgICAgICAgICByb2xlcy5wdXNoKHtcbiAgICAgICAgICAgICAgcm9sZU5hbWU6IHJ1bGUucmVwbGFjZSgncm9sZTonLCAnJyksXG4gICAgICAgICAgICAgIHJlYWQ6IHBbcnVsZV0ucmVhZCA/IHRydWUgOiBmYWxzZSxcbiAgICAgICAgICAgICAgd3JpdGU6IHBbcnVsZV0ud3JpdGUgPyB0cnVlIDogZmFsc2UsXG4gICAgICAgICAgICB9KTtcbiAgICAgICAgICB9XG4gICAgICAgIH0pO1xuICAgICAgICByZXR1cm4gcm9sZXMubGVuZ3RoID8gcm9sZXMgOiBudWxsO1xuICAgICAgfSxcbiAgICB9LFxuICAgIHB1YmxpYzoge1xuICAgICAgZGVzY3JpcHRpb246ICdQdWJsaWMgYWNjZXNzIGNvbnRyb2wgbGlzdC4nLFxuICAgICAgdHlwZTogUFVCTElDX0FDTCxcbiAgICAgIHJlc29sdmUocCkge1xuICAgICAgICAvKiBlc2xpbnQtZGlzYWJsZSAqL1xuICAgICAgICByZXR1cm4gcFsnKiddXG4gICAgICAgICAgPyB7XG4gICAgICAgICAgICAgIHJlYWQ6IHBbJyonXS5yZWFkID8gdHJ1ZSA6IGZhbHNlLFxuICAgICAgICAgICAgICB3cml0ZTogcFsnKiddLndyaXRlID8gdHJ1ZSA6IGZhbHNlLFxuICAgICAgICAgICAgfVxuICAgICAgICAgIDogbnVsbDtcbiAgICAgIH0sXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBPQkpFQ1RfSUQgPSBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTElEKTtcblxuY29uc3QgQ0xBU1NfTkFNRV9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgY2xhc3MgbmFtZSBvZiB0aGUgb2JqZWN0LicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbn07XG5cbmNvbnN0IEdMT0JBTF9PUl9PQkpFQ1RfSURfQVRUID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgb2JqZWN0IGlkLiBZb3UgY2FuIHVzZSBlaXRoZXIgdGhlIGdsb2JhbCBvciB0aGUgb2JqZWN0IGlkLicsXG4gIHR5cGU6IE9CSkVDVF9JRCxcbn07XG5cbmNvbnN0IE9CSkVDVF9JRF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgb2JqZWN0IGlkLicsXG4gIHR5cGU6IE9CSkVDVF9JRCxcbn07XG5cbmNvbnN0IENSRUFURURfQVRfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGRhdGUgaW4gd2hpY2ggdGhlIG9iamVjdCB3YXMgY3JlYXRlZC4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoREFURSksXG59O1xuXG5jb25zdCBVUERBVEVEX0FUX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBkYXRlIGluIHdoaWNoIHRoZSBvYmplY3Qgd2FzIGxhcyB1cGRhdGVkLicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChEQVRFKSxcbn07XG5cbmNvbnN0IElOUFVUX0ZJRUxEUyA9IHtcbiAgQUNMOiB7XG4gICAgdHlwZTogQUNMLFxuICB9LFxufTtcblxuY29uc3QgQ1JFQVRFX1JFU1VMVF9GSUVMRFMgPSB7XG4gIG9iamVjdElkOiBPQkpFQ1RfSURfQVRULFxuICBjcmVhdGVkQXQ6IENSRUFURURfQVRfQVRULFxufTtcblxuY29uc3QgVVBEQVRFX1JFU1VMVF9GSUVMRFMgPSB7XG4gIHVwZGF0ZWRBdDogVVBEQVRFRF9BVF9BVFQsXG59O1xuXG5jb25zdCBQQVJTRV9PQkpFQ1RfRklFTERTID0ge1xuICAuLi5DUkVBVEVfUkVTVUxUX0ZJRUxEUyxcbiAgLi4uVVBEQVRFX1JFU1VMVF9GSUVMRFMsXG4gIC4uLklOUFVUX0ZJRUxEUyxcbiAgQUNMOiB7XG4gICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEFDTCksXG4gICAgcmVzb2x2ZTogKHsgQUNMIH0pID0+IChBQ0wgPyBBQ0wgOiB7ICcqJzogeyByZWFkOiB0cnVlLCB3cml0ZTogdHJ1ZSB9IH0pLFxuICB9LFxufTtcblxuY29uc3QgUEFSU0VfT0JKRUNUID0gbmV3IEdyYXBoUUxJbnRlcmZhY2VUeXBlKHtcbiAgbmFtZTogJ1BhcnNlT2JqZWN0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBQYXJzZU9iamVjdCBpbnRlcmZhY2UgdHlwZSBpcyB1c2VkIGFzIGEgYmFzZSB0eXBlIGZvciB0aGUgYXV0byBnZW5lcmF0ZWQgb2JqZWN0IHR5cGVzLicsXG4gIGZpZWxkczogUEFSU0VfT0JKRUNUX0ZJRUxEUyxcbn0pO1xuXG5jb25zdCBTRVNTSU9OX1RPS0VOX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGUgY3VycmVudCB1c2VyIHNlc3Npb24gdG9rZW4uJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxufTtcblxuY29uc3QgUkVBRF9QUkVGRVJFTkNFID0gbmV3IEdyYXBoUUxFbnVtVHlwZSh7XG4gIG5hbWU6ICdSZWFkUHJlZmVyZW5jZScsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgUmVhZFByZWZlcmVuY2UgZW51bSB0eXBlIGlzIHVzZWQgaW4gcXVlcmllcyBpbiBvcmRlciB0byBzZWxlY3QgaW4gd2hpY2ggZGF0YWJhc2UgcmVwbGljYSB0aGUgb3BlcmF0aW9uIG11c3QgcnVuLicsXG4gIHZhbHVlczoge1xuICAgIFBSSU1BUlk6IHsgdmFsdWU6ICdQUklNQVJZJyB9LFxuICAgIFBSSU1BUllfUFJFRkVSUkVEOiB7IHZhbHVlOiAnUFJJTUFSWV9QUkVGRVJSRUQnIH0sXG4gICAgU0VDT05EQVJZOiB7IHZhbHVlOiAnU0VDT05EQVJZJyB9LFxuICAgIFNFQ09OREFSWV9QUkVGRVJSRUQ6IHsgdmFsdWU6ICdTRUNPTkRBUllfUFJFRkVSUkVEJyB9LFxuICAgIE5FQVJFU1Q6IHsgdmFsdWU6ICdORUFSRVNUJyB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFJFQURfUFJFRkVSRU5DRV9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhlIHJlYWQgcHJlZmVyZW5jZSBmb3IgdGhlIG1haW4gcXVlcnkgdG8gYmUgZXhlY3V0ZWQuJyxcbiAgdHlwZTogUkVBRF9QUkVGRVJFTkNFLFxufTtcblxuY29uc3QgSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRUID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIHJlYWQgcHJlZmVyZW5jZSBmb3IgdGhlIHF1ZXJpZXMgdG8gYmUgZXhlY3V0ZWQgdG8gaW5jbHVkZSBmaWVsZHMuJyxcbiAgdHlwZTogUkVBRF9QUkVGRVJFTkNFLFxufTtcblxuY29uc3QgU1VCUVVFUllfUkVBRF9QUkVGRVJFTkNFX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGUgcmVhZCBwcmVmZXJlbmNlIGZvciB0aGUgc3VicXVlcmllcyB0aGF0IG1heSBiZSByZXF1aXJlZC4nLFxuICB0eXBlOiBSRUFEX1BSRUZFUkVOQ0UsXG59O1xuXG5jb25zdCBSRUFEX09QVElPTlNfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdSZWFkT3B0aW9uc0lucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBSZWFkT3B0aW9uc0lucHV0dCB0eXBlIGlzIHVzZWQgaW4gcXVlcmllcyBpbiBvcmRlciB0byBzZXQgdGhlIHJlYWQgcHJlZmVyZW5jZXMuJyxcbiAgZmllbGRzOiB7XG4gICAgcmVhZFByZWZlcmVuY2U6IFJFQURfUFJFRkVSRU5DRV9BVFQsXG4gICAgaW5jbHVkZVJlYWRQcmVmZXJlbmNlOiBJTkNMVURFX1JFQURfUFJFRkVSRU5DRV9BVFQsXG4gICAgc3VicXVlcnlSZWFkUHJlZmVyZW5jZTogU1VCUVVFUllfUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgfSxcbn0pO1xuXG5jb25zdCBSRUFEX09QVElPTlNfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoZSByZWFkIG9wdGlvbnMgZm9yIHRoZSBxdWVyeSB0byBiZSBleGVjdXRlZC4nLFxuICB0eXBlOiBSRUFEX09QVElPTlNfSU5QVVQsXG59O1xuXG5jb25zdCBXSEVSRV9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGVzZSBhcmUgdGhlIGNvbmRpdGlvbnMgdGhhdCB0aGUgb2JqZWN0cyBuZWVkIHRvIG1hdGNoIGluIG9yZGVyIHRvIGJlIGZvdW5kJyxcbiAgdHlwZTogT0JKRUNULFxufTtcblxuY29uc3QgU0tJUF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbnVtYmVyIG9mIG9iamVjdHMgdGhhdCBtdXN0IGJlIHNraXBwZWQgdG8gcmV0dXJuLicsXG4gIHR5cGU6IEdyYXBoUUxJbnQsXG59O1xuXG5jb25zdCBMSU1JVF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbGltaXQgbnVtYmVyIG9mIG9iamVjdHMgdGhhdCBtdXN0IGJlIHJldHVybmVkLicsXG4gIHR5cGU6IEdyYXBoUUxJbnQsXG59O1xuXG5jb25zdCBDT1VOVF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSB0b3RhbCBtYXRjaGVkIG9iamVjcyBjb3VudCB0aGF0IGlzIHJldHVybmVkIHdoZW4gdGhlIGNvdW50IGZsYWcgaXMgc2V0LicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMSW50KSxcbn07XG5cbmNvbnN0IFNFQVJDSF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1NlYXJjaElucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBTZWFyY2hJbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmaXkgYSBzZWFyY2ggb3BlcmF0aW9uIG9uIGEgZnVsbCB0ZXh0IHNlYXJjaC4nLFxuICBmaWVsZHM6IHtcbiAgICB0ZXJtOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHRlcm0gdG8gYmUgc2VhcmNoZWQuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICB9LFxuICAgIGxhbmd1YWdlOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGxhbmd1YWdlIHRvIHRldGVybWluZSB0aGUgbGlzdCBvZiBzdG9wIHdvcmRzIGFuZCB0aGUgcnVsZXMgZm9yIHRva2VuaXplci4nLFxuICAgICAgdHlwZTogR3JhcGhRTFN0cmluZyxcbiAgICB9LFxuICAgIGNhc2VTZW5zaXRpdmU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgZmxhZyB0byBlbmFibGUgb3IgZGlzYWJsZSBjYXNlIHNlbnNpdGl2ZSBzZWFyY2guJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxCb29sZWFuLFxuICAgIH0sXG4gICAgZGlhY3JpdGljU2Vuc2l0aXZlOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGZsYWcgdG8gZW5hYmxlIG9yIGRpc2FibGUgZGlhY3JpdGljIHNlbnNpdGl2ZSBzZWFyY2guJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxCb29sZWFuLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgVEVYVF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1RleHRJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgVGV4dElucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGEgdGV4dCBvcGVyYXRpb24gb24gYSBjb25zdHJhaW50LicsXG4gIGZpZWxkczoge1xuICAgIHNlYXJjaDoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBzZWFyY2ggdG8gYmUgZXhlY3V0ZWQuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChTRUFSQ0hfSU5QVVQpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgQk9YX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnQm94SW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEJveElucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZpeSBhIGJveCBvcGVyYXRpb24gb24gYSB3aXRoaW4gZ2VvIHF1ZXJ5LicsXG4gIGZpZWxkczoge1xuICAgIGJvdHRvbUxlZnQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgYm90dG9tIGxlZnQgY29vcmRpbmF0ZXMgb2YgdGhlIGJveC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVF9JTlBVVCksXG4gICAgfSxcbiAgICB1cHBlclJpZ2h0OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIHVwcGVyIHJpZ2h0IGNvb3JkaW5hdGVzIG9mIHRoZSBib3guJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHRU9fUE9JTlRfSU5QVVQpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgV0lUSElOX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnV2l0aGluSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFdpdGhpbklucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGEgd2l0aGluIG9wZXJhdGlvbiBvbiBhIGNvbnN0cmFpbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgYm94OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGJveCB0byBiZSBzcGVjaWZpZWQuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChCT1hfSU5QVVQpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgQ0VOVEVSX1NQSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0NlbnRlclNwaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBDZW50ZXJTcGhlcmVJbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmaXkgYSBjZW50ZXJTcGhlcmUgb3BlcmF0aW9uIG9uIGEgZ2VvV2l0aGluIHF1ZXJ5LicsXG4gIGZpZWxkczoge1xuICAgIGNlbnRlcjoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBjZW50ZXIgb2YgdGhlIHNwaGVyZS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVF9JTlBVVCksXG4gICAgfSxcbiAgICBkaXN0YW5jZToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSByYWRpdXMgb2YgdGhlIHNwaGVyZS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxGbG9hdCksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBHRU9fV0lUSElOX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnR2VvV2l0aGluSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEdlb1dpdGhpbklucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGEgZ2VvV2l0aGluIG9wZXJhdGlvbiBvbiBhIGNvbnN0cmFpbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgcG9seWdvbjoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBwb2x5Z29uIHRvIGJlIHNwZWNpZmllZC4nLFxuICAgICAgdHlwZTogUE9MWUdPTl9JTlBVVCxcbiAgICB9LFxuICAgIGNlbnRlclNwaGVyZToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBzcGhlcmUgdG8gYmUgc3BlY2lmaWVkLicsXG4gICAgICB0eXBlOiBDRU5URVJfU1BIRVJFX0lOUFVULFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgR0VPX0lOVEVSU0VDVFNfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdHZW9JbnRlcnNlY3RzSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEdlb0ludGVyc2VjdHNJbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmeSBhIGdlb0ludGVyc2VjdHMgb3BlcmF0aW9uIG9uIGEgY29uc3RyYWludC4nLFxuICBmaWVsZHM6IHtcbiAgICBwb2ludDoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBwb2ludCB0byBiZSBzcGVjaWZpZWQuJyxcbiAgICAgIHR5cGU6IEdFT19QT0lOVF9JTlBVVCxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IGVxdWFsVG8gPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBlcXVhbFRvIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBlcXVhbHMgdG8gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBub3RFcXVhbFRvID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgbm90RXF1YWxUbyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgZG8gbm90IGVxdWFsIHRvIGEgc3BlY2lmaWVkIHZhbHVlLicsXG4gIHR5cGUsXG59KTtcblxuY29uc3QgbGVzc1RoYW4gPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBsZXNzVGhhbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgaXMgbGVzcyB0aGFuIGEgc3BlY2lmaWVkIHZhbHVlLicsXG4gIHR5cGUsXG59KTtcblxuY29uc3QgbGVzc1RoYW5PckVxdWFsVG8gPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBsZXNzVGhhbk9yRXF1YWxUbyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgaXMgbGVzcyB0aGFuIG9yIGVxdWFsIHRvIGEgc3BlY2lmaWVkIHZhbHVlLicsXG4gIHR5cGUsXG59KTtcblxuY29uc3QgZ3JlYXRlclRoYW4gPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBncmVhdGVyVGhhbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgaXMgZ3JlYXRlciB0aGFuIGEgc3BlY2lmaWVkIHZhbHVlLicsXG4gIHR5cGUsXG59KTtcblxuY29uc3QgZ3JlYXRlclRoYW5PckVxdWFsVG8gPSB0eXBlID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBncmVhdGVyVGhhbk9yRXF1YWxUbyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgaXMgZ3JlYXRlciB0aGFuIG9yIGVxdWFsIHRvIGEgc3BlY2lmaWVkIHZhbHVlLicsXG4gIHR5cGUsXG59KTtcblxuY29uc3QgaW5PcCA9IHR5cGUgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGluIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBlcXVhbHMgYW55IHZhbHVlIGluIHRoZSBzcGVjaWZpZWQgYXJyYXkuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KHR5cGUpLFxufSk7XG5cbmNvbnN0IG5vdEluID0gdHlwZSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgbm90SW4gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGRvIG5vdCBlcXVhbCBhbnkgdmFsdWUgaW4gdGhlIHNwZWNpZmllZCBhcnJheS4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTExpc3QodHlwZSksXG59KTtcblxuY29uc3QgZXhpc3RzID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgZXhpc3RzIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSBhIGZpZWxkIGV4aXN0cyAob3IgZG8gbm90IGV4aXN0KS4nLFxuICB0eXBlOiBHcmFwaFFMQm9vbGVhbixcbn07XG5cbmNvbnN0IG1hdGNoZXNSZWdleCA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIG1hdGNoZXNSZWdleCBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgbWF0Y2hlcyBhIHNwZWNpZmllZCByZWd1bGFyIGV4cHJlc3Npb24uJyxcbiAgdHlwZTogR3JhcGhRTFN0cmluZyxcbn07XG5cbmNvbnN0IG9wdGlvbnMgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBvcHRpb25zIG9wZXJhdG9yIHRvIHNwZWNpZnkgb3B0aW9uYWwgZmxhZ3MgKHN1Y2ggYXMgXCJpXCIgYW5kIFwibVwiKSB0byBiZSBhZGRlZCB0byBhIG1hdGNoZXNSZWdleCBvcGVyYXRpb24gaW4gdGhlIHNhbWUgc2V0IG9mIGNvbnN0cmFpbnRzLicsXG4gIHR5cGU6IEdyYXBoUUxTdHJpbmcsXG59O1xuXG5jb25zdCBTVUJRVUVSWV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1N1YnF1ZXJ5SW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFN1YnF1ZXJ5SW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYSBzdWIgcXVlcnkgdG8gYW5vdGhlciBjbGFzcy4nLFxuICBmaWVsZHM6IHtcbiAgICBjbGFzc05hbWU6IENMQVNTX05BTUVfQVRULFxuICAgIHdoZXJlOiBPYmplY3QuYXNzaWduKHt9LCBXSEVSRV9BVFQsIHtcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChXSEVSRV9BVFQudHlwZSksXG4gICAgfSksXG4gIH0sXG59KTtcblxuY29uc3QgU0VMRUNUX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnU2VsZWN0SW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFNlbGVjdElucHV0IHR5cGUgaXMgdXNlZCB0byBzcGVjaWZ5IGFuIGluUXVlcnlLZXkgb3IgYSBub3RJblF1ZXJ5S2V5IG9wZXJhdGlvbiBvbiBhIGNvbnN0cmFpbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgcXVlcnk6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgc3VicXVlcnkgdG8gYmUgZXhlY3V0ZWQuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChTVUJRVUVSWV9JTlBVVCksXG4gICAgfSxcbiAgICBrZXk6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUga2V5IGluIHRoZSByZXN1bHQgb2YgdGhlIHN1YnF1ZXJ5IHRoYXQgbXVzdCBtYXRjaCAobm90IG1hdGNoKSB0aGUgZmllbGQuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IGluUXVlcnlLZXkgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBpblF1ZXJ5S2V5IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSBhIGZpZWxkIGVxdWFscyB0byBhIGtleSBpbiB0aGUgcmVzdWx0IG9mIGEgZGlmZmVyZW50IHF1ZXJ5LicsXG4gIHR5cGU6IFNFTEVDVF9JTlBVVCxcbn07XG5cbmNvbnN0IG5vdEluUXVlcnlLZXkgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBub3RJblF1ZXJ5S2V5IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSBhIGZpZWxkIGRvIG5vdCBlcXVhbCB0byBhIGtleSBpbiB0aGUgcmVzdWx0IG9mIGEgZGlmZmVyZW50IHF1ZXJ5LicsXG4gIHR5cGU6IFNFTEVDVF9JTlBVVCxcbn07XG5cbmNvbnN0IElEX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnSWRXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBJZFdoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGFuIGlkLicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oR3JhcGhRTElEKSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKEdyYXBoUUxJRCksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKEdyYXBoUUxJRCksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKEdyYXBoUUxJRCksXG4gICAgZ3JlYXRlclRoYW46IGdyZWF0ZXJUaGFuKEdyYXBoUUxJRCksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKEdyYXBoUUxJRCksXG4gICAgaW46IGluT3AoR3JhcGhRTElEKSxcbiAgICBub3RJbjogbm90SW4oR3JhcGhRTElEKSxcbiAgICBleGlzdHMsXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IFNUUklOR19XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1N0cmluZ1doZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFN0cmluZ1doZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBTdHJpbmcuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhHcmFwaFFMU3RyaW5nKSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKEdyYXBoUUxTdHJpbmcpLFxuICAgIGxlc3NUaGFuOiBsZXNzVGhhbihHcmFwaFFMU3RyaW5nKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oR3JhcGhRTFN0cmluZyksXG4gICAgZ3JlYXRlclRoYW46IGdyZWF0ZXJUaGFuKEdyYXBoUUxTdHJpbmcpLFxuICAgIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiBncmVhdGVyVGhhbk9yRXF1YWxUbyhHcmFwaFFMU3RyaW5nKSxcbiAgICBpbjogaW5PcChHcmFwaFFMU3RyaW5nKSxcbiAgICBub3RJbjogbm90SW4oR3JhcGhRTFN0cmluZyksXG4gICAgZXhpc3RzLFxuICAgIG1hdGNoZXNSZWdleCxcbiAgICBvcHRpb25zLFxuICAgIHRleHQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgJHRleHQgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGZ1bGwgdGV4dCBzZWFyY2ggY29uc3RyYWludC4nLFxuICAgICAgdHlwZTogVEVYVF9JTlBVVCxcbiAgICB9LFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBOVU1CRVJfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdOdW1iZXJXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBOdW1iZXJXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgTnVtYmVyLicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oR3JhcGhRTEZsb2F0KSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKEdyYXBoUUxGbG9hdCksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKEdyYXBoUUxGbG9hdCksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKEdyYXBoUUxGbG9hdCksXG4gICAgZ3JlYXRlclRoYW46IGdyZWF0ZXJUaGFuKEdyYXBoUUxGbG9hdCksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKEdyYXBoUUxGbG9hdCksXG4gICAgaW46IGluT3AoR3JhcGhRTEZsb2F0KSxcbiAgICBub3RJbjogbm90SW4oR3JhcGhRTEZsb2F0KSxcbiAgICBleGlzdHMsXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IEJPT0xFQU5fV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdCb29sZWFuV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQm9vbGVhbldoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBCb29sZWFuLicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oR3JhcGhRTEJvb2xlYW4pLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oR3JhcGhRTEJvb2xlYW4pLFxuICAgIGV4aXN0cyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgQVJSQVlfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdBcnJheVdoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEFycmF5V2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIEFycmF5LicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oQU5ZKSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKEFOWSksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKEFOWSksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKEFOWSksXG4gICAgZ3JlYXRlclRoYW46IGdyZWF0ZXJUaGFuKEFOWSksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKEFOWSksXG4gICAgaW46IGluT3AoQU5ZKSxcbiAgICBub3RJbjogbm90SW4oQU5ZKSxcbiAgICBleGlzdHMsXG4gICAgY29udGFpbmVkQnk6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgY29udGFpbmVkQnkgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYW4gYXJyYXkgZmllbGQgaXMgY29udGFpbmVkIGJ5IGFub3RoZXIgc3BlY2lmaWVkIGFycmF5LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QoQU5ZKSxcbiAgICB9LFxuICAgIGNvbnRhaW5zOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGNvbnRhaW5zIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGFuIGFycmF5IGZpZWxkIGNvbnRhaW4gYWxsIGVsZW1lbnRzIG9mIGFub3RoZXIgc3BlY2lmaWVkIGFycmF5LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTExpc3QoQU5ZKSxcbiAgICB9LFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBLRVlfVkFMVUVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdLZXlWYWx1ZUlucHV0JyxcbiAgZGVzY3JpcHRpb246ICdBbiBlbnRyeSBmcm9tIGFuIG9iamVjdCwgaS5lLiwgYSBwYWlyIG9mIGtleSBhbmQgdmFsdWUuJyxcbiAgZmllbGRzOiB7XG4gICAga2V5OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoZSBrZXkgdXNlZCB0byByZXRyaWV2ZSB0aGUgdmFsdWUgb2YgdGhpcyBlbnRyeS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgIH0sXG4gICAgdmFsdWU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIHZhbHVlIG9mIHRoZSBlbnRyeS4gQ291bGQgYmUgYW55IHR5cGUgb2Ygc2NhbGFyIGRhdGEuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChBTlkpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgT0JKRUNUX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnT2JqZWN0V2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgT2JqZWN0V2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIHJlc3VsdCBieSBhIGZpZWxkIG9mIHR5cGUgT2JqZWN0LicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKEtFWV9WQUxVRV9JTlBVVCksXG4gICAgaW46IGluT3AoS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBub3RJbjogbm90SW4oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBleGlzdHMsXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IERBVEVfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdEYXRlV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgRGF0ZVdoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBEYXRlLicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oREFURSksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhEQVRFKSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oREFURSksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKERBVEUpLFxuICAgIGdyZWF0ZXJUaGFuOiBncmVhdGVyVGhhbihEQVRFKSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oREFURSksXG4gICAgaW46IGluT3AoREFURSksXG4gICAgbm90SW46IG5vdEluKERBVEUpLFxuICAgIGV4aXN0cyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgQllURVNfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdCeXRlc1doZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEJ5dGVzV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIEJ5dGVzLicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oQllURVMpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oQllURVMpLFxuICAgIGxlc3NUaGFuOiBsZXNzVGhhbihCWVRFUyksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKEJZVEVTKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oQllURVMpLFxuICAgIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiBncmVhdGVyVGhhbk9yRXF1YWxUbyhCWVRFUyksXG4gICAgaW46IGluT3AoQllURVMpLFxuICAgIG5vdEluOiBub3RJbihCWVRFUyksXG4gICAgZXhpc3RzLFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBGSUxFX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnRmlsZVdoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEZpbGVXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgRmlsZS4nLFxuICBmaWVsZHM6IHtcbiAgICBlcXVhbFRvOiBlcXVhbFRvKEZJTEUpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oRklMRSksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKEZJTEUpLFxuICAgIGxlc3NUaGFuT3JFcXVhbFRvOiBsZXNzVGhhbk9yRXF1YWxUbyhGSUxFKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oRklMRSksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKEZJTEUpLFxuICAgIGluOiBpbk9wKEZJTEUpLFxuICAgIG5vdEluOiBub3RJbihGSUxFKSxcbiAgICBleGlzdHMsXG4gICAgbWF0Y2hlc1JlZ2V4LFxuICAgIG9wdGlvbnMsXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IEdFT19QT0lOVF9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0dlb1BvaW50V2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgR2VvUG9pbnRXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgR2VvUG9pbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgZXhpc3RzLFxuICAgIG5lYXJTcGhlcmU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgbmVhclNwaGVyZSBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyBuZWFyIHRvIGFub3RoZXIgZ2VvIHBvaW50LicsXG4gICAgICB0eXBlOiBHRU9fUE9JTlRfSU5QVVQsXG4gICAgfSxcbiAgICBtYXhEaXN0YW5jZToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBtYXhEaXN0YW5jZSBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyBhdCBhIG1heCBkaXN0YW5jZSAoaW4gcmFkaWFucykgZnJvbSB0aGUgZ2VvIHBvaW50IHNwZWNpZmllZCBpbiB0aGUgJG5lYXJTcGhlcmUgb3BlcmF0b3IuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxGbG9hdCxcbiAgICB9LFxuICAgIG1heERpc3RhbmNlSW5SYWRpYW5zOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIG1heERpc3RhbmNlSW5SYWRpYW5zIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIGF0IGEgbWF4IGRpc3RhbmNlIChpbiByYWRpYW5zKSBmcm9tIHRoZSBnZW8gcG9pbnQgc3BlY2lmaWVkIGluIHRoZSAkbmVhclNwaGVyZSBvcGVyYXRvci4nLFxuICAgICAgdHlwZTogR3JhcGhRTEZsb2F0LFxuICAgIH0sXG4gICAgbWF4RGlzdGFuY2VJbk1pbGVzOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIG1heERpc3RhbmNlSW5NaWxlcyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyBhdCBhIG1heCBkaXN0YW5jZSAoaW4gbWlsZXMpIGZyb20gdGhlIGdlbyBwb2ludCBzcGVjaWZpZWQgaW4gdGhlICRuZWFyU3BoZXJlIG9wZXJhdG9yLicsXG4gICAgICB0eXBlOiBHcmFwaFFMRmxvYXQsXG4gICAgfSxcbiAgICBtYXhEaXN0YW5jZUluS2lsb21ldGVyczoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBtYXhEaXN0YW5jZUluS2lsb21ldGVycyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyBhdCBhIG1heCBkaXN0YW5jZSAoaW4ga2lsb21ldGVycykgZnJvbSB0aGUgZ2VvIHBvaW50IHNwZWNpZmllZCBpbiB0aGUgJG5lYXJTcGhlcmUgb3BlcmF0b3IuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxGbG9hdCxcbiAgICB9LFxuICAgIHdpdGhpbjoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSB3aXRoaW4gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBnZW8gcG9pbnQgZmllbGQgaXMgd2l0aGluIGEgc3BlY2lmaWVkIGJveC4nLFxuICAgICAgdHlwZTogV0lUSElOX0lOUFVULFxuICAgIH0sXG4gICAgZ2VvV2l0aGluOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGdlb1dpdGhpbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyB3aXRoaW4gYSBzcGVjaWZpZWQgcG9seWdvbiBvciBzcGhlcmUuJyxcbiAgICAgIHR5cGU6IEdFT19XSVRISU5fSU5QVVQsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBQT0xZR09OX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnUG9seWdvbldoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFBvbHlnb25XaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgUG9seWdvbi4nLFxuICBmaWVsZHM6IHtcbiAgICBleGlzdHMsXG4gICAgZ2VvSW50ZXJzZWN0czoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBnZW9JbnRlcnNlY3RzIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgcG9seWdvbiBmaWVsZCBpbnRlcnNlY3QgYSBzcGVjaWZpZWQgcG9pbnQuJyxcbiAgICAgIHR5cGU6IEdFT19JTlRFUlNFQ1RTX0lOUFVULFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgRUxFTUVOVCA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdFbGVtZW50JyxcbiAgZGVzY3JpcHRpb246IFwiVGhlIEVsZW1lbnQgb2JqZWN0IHR5cGUgaXMgdXNlZCB0byByZXR1cm4gYXJyYXkgaXRlbXMnIHZhbHVlLlwiLFxuICBmaWVsZHM6IHtcbiAgICB2YWx1ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdSZXR1cm4gdGhlIHZhbHVlIG9mIHRoZSBlbGVtZW50IGluIHRoZSBhcnJheScsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoQU5ZKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbi8vIERlZmF1bHQgc3RhdGljIHVuaW9uIHR5cGUsIHdlIHVwZGF0ZSB0eXBlcyBhbmQgcmVzb2x2ZVR5cGUgZnVuY3Rpb24gbGF0ZXJcbmxldCBBUlJBWV9SRVNVTFQ7XG5cbmNvbnN0IGxvYWRBcnJheVJlc3VsdCA9IChwYXJzZUdyYXBoUUxTY2hlbWEsIHBhcnNlQ2xhc3NlcykgPT4ge1xuICBjb25zdCBjbGFzc1R5cGVzID0gcGFyc2VDbGFzc2VzXG4gICAgLmZpbHRlcihwYXJzZUNsYXNzID0+XG4gICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW3BhcnNlQ2xhc3MuY2xhc3NOYW1lXVxuICAgICAgICAuY2xhc3NHcmFwaFFMT3V0cHV0VHlwZVxuICAgICAgICA/IHRydWVcbiAgICAgICAgOiBmYWxzZVxuICAgIClcbiAgICAubWFwKFxuICAgICAgcGFyc2VDbGFzcyA9PlxuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW3BhcnNlQ2xhc3MuY2xhc3NOYW1lXVxuICAgICAgICAgIC5jbGFzc0dyYXBoUUxPdXRwdXRUeXBlXG4gICAgKTtcbiAgQVJSQVlfUkVTVUxUID0gbmV3IEdyYXBoUUxVbmlvblR5cGUoe1xuICAgIG5hbWU6ICdBcnJheVJlc3VsdCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVXNlIElubGluZSBGcmFnbWVudCBvbiBBcnJheSB0byBnZXQgcmVzdWx0czogaHR0cHM6Ly9ncmFwaHFsLm9yZy9sZWFybi9xdWVyaWVzLyNpbmxpbmUtZnJhZ21lbnRzJyxcbiAgICB0eXBlczogKCkgPT4gW0VMRU1FTlQsIC4uLmNsYXNzVHlwZXNdLFxuICAgIHJlc29sdmVUeXBlOiB2YWx1ZSA9PiB7XG4gICAgICBpZiAodmFsdWUuX190eXBlID09PSAnT2JqZWN0JyAmJiB2YWx1ZS5jbGFzc05hbWUgJiYgdmFsdWUub2JqZWN0SWQpIHtcbiAgICAgICAgaWYgKHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbdmFsdWUuY2xhc3NOYW1lXSkge1xuICAgICAgICAgIHJldHVybiBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW3ZhbHVlLmNsYXNzTmFtZV1cbiAgICAgICAgICAgIC5jbGFzc0dyYXBoUUxPdXRwdXRUeXBlO1xuICAgICAgICB9IGVsc2Uge1xuICAgICAgICAgIHJldHVybiBFTEVNRU5UO1xuICAgICAgICB9XG4gICAgICB9IGVsc2Uge1xuICAgICAgICByZXR1cm4gRUxFTUVOVDtcbiAgICAgIH1cbiAgICB9LFxuICB9KTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmdyYXBoUUxUeXBlcy5wdXNoKEFSUkFZX1JFU1VMVCk7XG59O1xuXG5jb25zdCBsb2FkID0gcGFyc2VHcmFwaFFMU2NoZW1hID0+IHtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEdyYXBoUUxVcGxvYWQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQU5ZLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKE9CSkVDVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShEQVRFLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEJZVEVTLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEZJTEUsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoRklMRV9JTkZPLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEZJTEVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR0VPX1BPSU5UX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEdFT19QT0lOVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShQQVJTRV9PQkpFQ1QsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUkVBRF9QUkVGRVJFTkNFLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFJFQURfT1BUSU9OU19JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTRUFSQ0hfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoVEVYVF9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShCT1hfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoV0lUSElOX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKENFTlRFUl9TUEhFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR0VPX1dJVEhJTl9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShHRU9fSU5URVJTRUNUU19JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShJRF9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTVFJJTkdfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoTlVNQkVSX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEJPT0xFQU5fV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQVJSQVlfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoS0VZX1ZBTFVFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKE9CSkVDVF9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShEQVRFX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEJZVEVTX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEZJTEVfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR0VPX1BPSU5UX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFBPTFlHT05fV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoRUxFTUVOVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShBQ0xfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoVVNFUl9BQ0xfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUk9MRV9BQ0xfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUFVCTElDX0FDTF9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShBQ0wsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoVVNFUl9BQ0wsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUk9MRV9BQ0wsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUFVCTElDX0FDTCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTVUJRVUVSWV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShTRUxFQ1RfSU5QVVQsIHRydWUpO1xufTtcblxuZXhwb3J0IHtcbiAgVHlwZVZhbGlkYXRpb25FcnJvcixcbiAgcGFyc2VTdHJpbmdWYWx1ZSxcbiAgcGFyc2VJbnRWYWx1ZSxcbiAgcGFyc2VGbG9hdFZhbHVlLFxuICBwYXJzZUJvb2xlYW5WYWx1ZSxcbiAgcGFyc2VWYWx1ZSxcbiAgcGFyc2VMaXN0VmFsdWVzLFxuICBwYXJzZU9iamVjdEZpZWxkcyxcbiAgQU5ZLFxuICBPQkpFQ1QsXG4gIHBhcnNlRGF0ZUlzb1ZhbHVlLFxuICBzZXJpYWxpemVEYXRlSXNvLFxuICBEQVRFLFxuICBCWVRFUyxcbiAgcGFyc2VGaWxlVmFsdWUsXG4gIFNVQlFVRVJZX0lOUFVULFxuICBTRUxFQ1RfSU5QVVQsXG4gIEZJTEUsXG4gIEZJTEVfSU5GTyxcbiAgRklMRV9JTlBVVCxcbiAgR0VPX1BPSU5UX0ZJRUxEUyxcbiAgR0VPX1BPSU5UX0lOUFVULFxuICBHRU9fUE9JTlQsXG4gIFBPTFlHT05fSU5QVVQsXG4gIFBPTFlHT04sXG4gIE9CSkVDVF9JRCxcbiAgQ0xBU1NfTkFNRV9BVFQsXG4gIEdMT0JBTF9PUl9PQkpFQ1RfSURfQVRULFxuICBPQkpFQ1RfSURfQVRULFxuICBVUERBVEVEX0FUX0FUVCxcbiAgQ1JFQVRFRF9BVF9BVFQsXG4gIElOUFVUX0ZJRUxEUyxcbiAgQ1JFQVRFX1JFU1VMVF9GSUVMRFMsXG4gIFVQREFURV9SRVNVTFRfRklFTERTLFxuICBQQVJTRV9PQkpFQ1RfRklFTERTLFxuICBQQVJTRV9PQkpFQ1QsXG4gIFNFU1NJT05fVE9LRU5fQVRULFxuICBSRUFEX1BSRUZFUkVOQ0UsXG4gIFJFQURfUFJFRkVSRU5DRV9BVFQsXG4gIElOQ0xVREVfUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgU1VCUVVFUllfUkVBRF9QUkVGRVJFTkNFX0FUVCxcbiAgUkVBRF9PUFRJT05TX0lOUFVULFxuICBSRUFEX09QVElPTlNfQVRULFxuICBXSEVSRV9BVFQsXG4gIFNLSVBfQVRULFxuICBMSU1JVF9BVFQsXG4gIENPVU5UX0FUVCxcbiAgU0VBUkNIX0lOUFVULFxuICBURVhUX0lOUFVULFxuICBCT1hfSU5QVVQsXG4gIFdJVEhJTl9JTlBVVCxcbiAgQ0VOVEVSX1NQSEVSRV9JTlBVVCxcbiAgR0VPX1dJVEhJTl9JTlBVVCxcbiAgR0VPX0lOVEVSU0VDVFNfSU5QVVQsXG4gIGVxdWFsVG8sXG4gIG5vdEVxdWFsVG8sXG4gIGxlc3NUaGFuLFxuICBsZXNzVGhhbk9yRXF1YWxUbyxcbiAgZ3JlYXRlclRoYW4sXG4gIGdyZWF0ZXJUaGFuT3JFcXVhbFRvLFxuICBpbk9wLFxuICBub3RJbixcbiAgZXhpc3RzLFxuICBtYXRjaGVzUmVnZXgsXG4gIG9wdGlvbnMsXG4gIGluUXVlcnlLZXksXG4gIG5vdEluUXVlcnlLZXksXG4gIElEX1dIRVJFX0lOUFVULFxuICBTVFJJTkdfV0hFUkVfSU5QVVQsXG4gIE5VTUJFUl9XSEVSRV9JTlBVVCxcbiAgQk9PTEVBTl9XSEVSRV9JTlBVVCxcbiAgQVJSQVlfV0hFUkVfSU5QVVQsXG4gIEtFWV9WQUxVRV9JTlBVVCxcbiAgT0JKRUNUX1dIRVJFX0lOUFVULFxuICBEQVRFX1dIRVJFX0lOUFVULFxuICBCWVRFU19XSEVSRV9JTlBVVCxcbiAgRklMRV9XSEVSRV9JTlBVVCxcbiAgR0VPX1BPSU5UX1dIRVJFX0lOUFVULFxuICBQT0xZR09OX1dIRVJFX0lOUFVULFxuICBBUlJBWV9SRVNVTFQsXG4gIEVMRU1FTlQsXG4gIEFDTF9JTlBVVCxcbiAgVVNFUl9BQ0xfSU5QVVQsXG4gIFJPTEVfQUNMX0lOUFVULFxuICBQVUJMSUNfQUNMX0lOUFVULFxuICBBQ0wsXG4gIFVTRVJfQUNMLFxuICBST0xFX0FDTCxcbiAgUFVCTElDX0FDTCxcbiAgbG9hZCxcbiAgbG9hZEFycmF5UmVzdWx0LFxufTtcbiJdfQ==