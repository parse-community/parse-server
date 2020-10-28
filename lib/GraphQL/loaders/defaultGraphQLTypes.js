"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.loadArrayResult = exports.load = exports.PUBLIC_ACL = exports.ROLE_ACL = exports.USER_ACL = exports.ACL = exports.PUBLIC_ACL_INPUT = exports.ROLE_ACL_INPUT = exports.USER_ACL_INPUT = exports.ACL_INPUT = exports.ELEMENT = exports.ARRAY_RESULT = exports.POLYGON_WHERE_INPUT = exports.GEO_POINT_WHERE_INPUT = exports.FILE_WHERE_INPUT = exports.BYTES_WHERE_INPUT = exports.DATE_WHERE_INPUT = exports.OBJECT_WHERE_INPUT = exports.KEY_VALUE_INPUT = exports.ARRAY_WHERE_INPUT = exports.BOOLEAN_WHERE_INPUT = exports.NUMBER_WHERE_INPUT = exports.STRING_WHERE_INPUT = exports.ID_WHERE_INPUT = exports.notInQueryKey = exports.inQueryKey = exports.options = exports.matchesRegex = exports.exists = exports.notIn = exports.inOp = exports.greaterThanOrEqualTo = exports.greaterThan = exports.lessThanOrEqualTo = exports.lessThan = exports.notEqualTo = exports.equalTo = exports.GEO_INTERSECTS_INPUT = exports.GEO_WITHIN_INPUT = exports.CENTER_SPHERE_INPUT = exports.WITHIN_INPUT = exports.BOX_INPUT = exports.TEXT_INPUT = exports.SEARCH_INPUT = exports.COUNT_ATT = exports.LIMIT_ATT = exports.SKIP_ATT = exports.WHERE_ATT = exports.READ_OPTIONS_ATT = exports.READ_OPTIONS_INPUT = exports.SUBQUERY_READ_PREFERENCE_ATT = exports.INCLUDE_READ_PREFERENCE_ATT = exports.READ_PREFERENCE_ATT = exports.READ_PREFERENCE = exports.SESSION_TOKEN_ATT = exports.PARSE_OBJECT = exports.PARSE_OBJECT_FIELDS = exports.UPDATE_RESULT_FIELDS = exports.CREATE_RESULT_FIELDS = exports.INPUT_FIELDS = exports.CREATED_AT_ATT = exports.UPDATED_AT_ATT = exports.OBJECT_ID_ATT = exports.GLOBAL_OR_OBJECT_ID_ATT = exports.CLASS_NAME_ATT = exports.OBJECT_ID = exports.POLYGON = exports.POLYGON_INPUT = exports.GEO_POINT = exports.GEO_POINT_INPUT = exports.GEO_POINT_FIELDS = exports.FILE_INPUT = exports.FILE_INFO = exports.FILE = exports.SELECT_INPUT = exports.SUBQUERY_INPUT = exports.parseFileValue = exports.BYTES = exports.DATE = exports.serializeDateIso = exports.parseDateIsoValue = exports.OBJECT = exports.ANY = exports.parseObjectFields = exports.parseListValues = exports.parseValue = exports.parseBooleanValue = exports.parseFloatValue = exports.parseIntValue = exports.parseStringValue = exports.TypeValidationError = void 0;

var _graphql = require("graphql");

var _graphqlRelay = require("graphql-relay");

var _links = require("@graphql-tools/links");

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
      description: 'A File Scalar can be an url or a FileInfo object. If this field is set to null the file will be unlinked.',
      type: FILE
    },
    upload: {
      description: 'Use this field if you want to create a new file.',
      type: _links.GraphQLUpload
    },
    unlink: {
      description: 'Use this field if you want to unlink the file (the file will not be deleted on cloud storage)',
      type: _graphql.GraphQLBoolean
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
  parseGraphQLSchema.addGraphQLType(_links.GraphQLUpload, true);
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9HcmFwaFFML2xvYWRlcnMvZGVmYXVsdEdyYXBoUUxUeXBlcy5qcyJdLCJuYW1lcyI6WyJUeXBlVmFsaWRhdGlvbkVycm9yIiwiRXJyb3IiLCJjb25zdHJ1Y3RvciIsInZhbHVlIiwidHlwZSIsInBhcnNlU3RyaW5nVmFsdWUiLCJwYXJzZUludFZhbHVlIiwiaW50IiwiTnVtYmVyIiwiaXNJbnRlZ2VyIiwicGFyc2VGbG9hdFZhbHVlIiwiZmxvYXQiLCJpc05hTiIsInBhcnNlQm9vbGVhblZhbHVlIiwicGFyc2VWYWx1ZSIsImtpbmQiLCJLaW5kIiwiU1RSSU5HIiwiSU5UIiwiRkxPQVQiLCJCT09MRUFOIiwiTElTVCIsInBhcnNlTGlzdFZhbHVlcyIsInZhbHVlcyIsIk9CSkVDVCIsInBhcnNlT2JqZWN0RmllbGRzIiwiZmllbGRzIiwiQXJyYXkiLCJpc0FycmF5IiwibWFwIiwicmVkdWNlIiwib2JqZWN0IiwiZmllbGQiLCJuYW1lIiwiQU5ZIiwiR3JhcGhRTFNjYWxhclR5cGUiLCJkZXNjcmlwdGlvbiIsInNlcmlhbGl6ZSIsInBhcnNlTGl0ZXJhbCIsImFzdCIsInBhcnNlRGF0ZUlzb1ZhbHVlIiwiZGF0ZSIsIkRhdGUiLCJzZXJpYWxpemVEYXRlSXNvIiwidG9JU09TdHJpbmciLCJwYXJzZURhdGVJc29MaXRlcmFsIiwiREFURSIsIl9fdHlwZSIsImlzbyIsImZpbmQiLCJCWVRFUyIsImJhc2U2NCIsInBhcnNlRmlsZVZhbHVlIiwidXJsIiwidW5kZWZpbmVkIiwiRklMRSIsIkZJTEVfSU5GTyIsIkdyYXBoUUxPYmplY3RUeXBlIiwiR3JhcGhRTE5vbk51bGwiLCJHcmFwaFFMU3RyaW5nIiwiRklMRV9JTlBVVCIsIkdyYXBoUUxJbnB1dE9iamVjdFR5cGUiLCJmaWxlIiwidXBsb2FkIiwiR3JhcGhRTFVwbG9hZCIsInVubGluayIsIkdyYXBoUUxCb29sZWFuIiwiR0VPX1BPSU5UX0ZJRUxEUyIsImxhdGl0dWRlIiwiR3JhcGhRTEZsb2F0IiwibG9uZ2l0dWRlIiwiR0VPX1BPSU5UX0lOUFVUIiwiR0VPX1BPSU5UIiwiUE9MWUdPTl9JTlBVVCIsIkdyYXBoUUxMaXN0IiwiUE9MWUdPTiIsIlVTRVJfQUNMX0lOUFVUIiwidXNlcklkIiwiR3JhcGhRTElEIiwicmVhZCIsIndyaXRlIiwiUk9MRV9BQ0xfSU5QVVQiLCJyb2xlTmFtZSIsIlBVQkxJQ19BQ0xfSU5QVVQiLCJBQ0xfSU5QVVQiLCJ1c2VycyIsInJvbGVzIiwicHVibGljIiwiVVNFUl9BQ0wiLCJST0xFX0FDTCIsIlBVQkxJQ19BQ0wiLCJBQ0wiLCJyZXNvbHZlIiwicCIsIk9iamVjdCIsImtleXMiLCJmb3JFYWNoIiwicnVsZSIsImluZGV4T2YiLCJwdXNoIiwibGVuZ3RoIiwicmVwbGFjZSIsIk9CSkVDVF9JRCIsIkNMQVNTX05BTUVfQVRUIiwiR0xPQkFMX09SX09CSkVDVF9JRF9BVFQiLCJPQkpFQ1RfSURfQVRUIiwiQ1JFQVRFRF9BVF9BVFQiLCJVUERBVEVEX0FUX0FUVCIsIklOUFVUX0ZJRUxEUyIsIkNSRUFURV9SRVNVTFRfRklFTERTIiwib2JqZWN0SWQiLCJjcmVhdGVkQXQiLCJVUERBVEVfUkVTVUxUX0ZJRUxEUyIsInVwZGF0ZWRBdCIsIlBBUlNFX09CSkVDVF9GSUVMRFMiLCJQQVJTRV9PQkpFQ1QiLCJHcmFwaFFMSW50ZXJmYWNlVHlwZSIsIlNFU1NJT05fVE9LRU5fQVRUIiwiUkVBRF9QUkVGRVJFTkNFIiwiR3JhcGhRTEVudW1UeXBlIiwiUFJJTUFSWSIsIlBSSU1BUllfUFJFRkVSUkVEIiwiU0VDT05EQVJZIiwiU0VDT05EQVJZX1BSRUZFUlJFRCIsIk5FQVJFU1QiLCJSRUFEX1BSRUZFUkVOQ0VfQVRUIiwiSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRUIiwiU1VCUVVFUllfUkVBRF9QUkVGRVJFTkNFX0FUVCIsIlJFQURfT1BUSU9OU19JTlBVVCIsInJlYWRQcmVmZXJlbmNlIiwiaW5jbHVkZVJlYWRQcmVmZXJlbmNlIiwic3VicXVlcnlSZWFkUHJlZmVyZW5jZSIsIlJFQURfT1BUSU9OU19BVFQiLCJXSEVSRV9BVFQiLCJTS0lQX0FUVCIsIkdyYXBoUUxJbnQiLCJMSU1JVF9BVFQiLCJDT1VOVF9BVFQiLCJTRUFSQ0hfSU5QVVQiLCJ0ZXJtIiwibGFuZ3VhZ2UiLCJjYXNlU2Vuc2l0aXZlIiwiZGlhY3JpdGljU2Vuc2l0aXZlIiwiVEVYVF9JTlBVVCIsInNlYXJjaCIsIkJPWF9JTlBVVCIsImJvdHRvbUxlZnQiLCJ1cHBlclJpZ2h0IiwiV0lUSElOX0lOUFVUIiwiYm94IiwiQ0VOVEVSX1NQSEVSRV9JTlBVVCIsImNlbnRlciIsImRpc3RhbmNlIiwiR0VPX1dJVEhJTl9JTlBVVCIsInBvbHlnb24iLCJjZW50ZXJTcGhlcmUiLCJHRU9fSU5URVJTRUNUU19JTlBVVCIsInBvaW50IiwiZXF1YWxUbyIsIm5vdEVxdWFsVG8iLCJsZXNzVGhhbiIsImxlc3NUaGFuT3JFcXVhbFRvIiwiZ3JlYXRlclRoYW4iLCJncmVhdGVyVGhhbk9yRXF1YWxUbyIsImluT3AiLCJub3RJbiIsImV4aXN0cyIsIm1hdGNoZXNSZWdleCIsIm9wdGlvbnMiLCJTVUJRVUVSWV9JTlBVVCIsImNsYXNzTmFtZSIsIndoZXJlIiwiYXNzaWduIiwiU0VMRUNUX0lOUFVUIiwicXVlcnkiLCJrZXkiLCJpblF1ZXJ5S2V5Iiwibm90SW5RdWVyeUtleSIsIklEX1dIRVJFX0lOUFVUIiwiaW4iLCJTVFJJTkdfV0hFUkVfSU5QVVQiLCJ0ZXh0IiwiTlVNQkVSX1dIRVJFX0lOUFVUIiwiQk9PTEVBTl9XSEVSRV9JTlBVVCIsIkFSUkFZX1dIRVJFX0lOUFVUIiwiY29udGFpbmVkQnkiLCJjb250YWlucyIsIktFWV9WQUxVRV9JTlBVVCIsIk9CSkVDVF9XSEVSRV9JTlBVVCIsIkRBVEVfV0hFUkVfSU5QVVQiLCJCWVRFU19XSEVSRV9JTlBVVCIsIkZJTEVfV0hFUkVfSU5QVVQiLCJHRU9fUE9JTlRfV0hFUkVfSU5QVVQiLCJuZWFyU3BoZXJlIiwibWF4RGlzdGFuY2UiLCJtYXhEaXN0YW5jZUluUmFkaWFucyIsIm1heERpc3RhbmNlSW5NaWxlcyIsIm1heERpc3RhbmNlSW5LaWxvbWV0ZXJzIiwid2l0aGluIiwiZ2VvV2l0aGluIiwiUE9MWUdPTl9XSEVSRV9JTlBVVCIsImdlb0ludGVyc2VjdHMiLCJFTEVNRU5UIiwiQVJSQVlfUkVTVUxUIiwibG9hZEFycmF5UmVzdWx0IiwicGFyc2VHcmFwaFFMU2NoZW1hIiwicGFyc2VDbGFzc2VzIiwiY2xhc3NUeXBlcyIsImZpbHRlciIsInBhcnNlQ2xhc3MiLCJwYXJzZUNsYXNzVHlwZXMiLCJjbGFzc0dyYXBoUUxPdXRwdXRUeXBlIiwiR3JhcGhRTFVuaW9uVHlwZSIsInR5cGVzIiwicmVzb2x2ZVR5cGUiLCJncmFwaFFMVHlwZXMiLCJsb2FkIiwiYWRkR3JhcGhRTFR5cGUiXSwibWFwcGluZ3MiOiI7Ozs7Ozs7QUFBQTs7QUFnQkE7O0FBQ0E7Ozs7Ozs7O0FBRUEsTUFBTUEsbUJBQU4sU0FBa0NDLEtBQWxDLENBQXdDO0FBQ3RDQyxFQUFBQSxXQUFXLENBQUNDLEtBQUQsRUFBUUMsSUFBUixFQUFjO0FBQ3ZCLFVBQU8sR0FBRUQsS0FBTSxtQkFBa0JDLElBQUssRUFBdEM7QUFDRDs7QUFIcUM7Ozs7QUFNeEMsTUFBTUMsZ0JBQWdCLEdBQUlGLEtBQUQsSUFBVztBQUNsQyxNQUFJLE9BQU9BLEtBQVAsS0FBaUIsUUFBckIsRUFBK0I7QUFDN0IsV0FBT0EsS0FBUDtBQUNEOztBQUVELFFBQU0sSUFBSUgsbUJBQUosQ0FBd0JHLEtBQXhCLEVBQStCLFFBQS9CLENBQU47QUFDRCxDQU5EOzs7O0FBUUEsTUFBTUcsYUFBYSxHQUFJSCxLQUFELElBQVc7QUFDL0IsTUFBSSxPQUFPQSxLQUFQLEtBQWlCLFFBQXJCLEVBQStCO0FBQzdCLFVBQU1JLEdBQUcsR0FBR0MsTUFBTSxDQUFDTCxLQUFELENBQWxCOztBQUNBLFFBQUlLLE1BQU0sQ0FBQ0MsU0FBUCxDQUFpQkYsR0FBakIsQ0FBSixFQUEyQjtBQUN6QixhQUFPQSxHQUFQO0FBQ0Q7QUFDRjs7QUFF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WSxjQUFuQixDQUFrQy9ILFVBQWxDLEVBQThDLElBQTlDO0FBQ0FtSCxFQUFBQSxrQkFBa0IsQ0FBQ1ksY0FBbkIsQ0FBa0NoRCxjQUFsQyxFQUFrRCxJQUFsRDtBQUNBb0MsRUFBQUEsa0JBQWtCLENBQUNZLGNBQW5CLENBQWtDNUMsWUFBbEMsRUFBZ0QsSUFBaEQ7QUFDRCxDQTVDRCIsInNvdXJjZXNDb250ZW50IjpbImltcG9ydCB7XG4gIEtpbmQsXG4gIEdyYXBoUUxOb25OdWxsLFxuICBHcmFwaFFMU2NhbGFyVHlwZSxcbiAgR3JhcGhRTElELFxuICBHcmFwaFFMU3RyaW5nLFxuICBHcmFwaFFMT2JqZWN0VHlwZSxcbiAgR3JhcGhRTEludGVyZmFjZVR5cGUsXG4gIEdyYXBoUUxFbnVtVHlwZSxcbiAgR3JhcGhRTEludCxcbiAgR3JhcGhRTEZsb2F0LFxuICBHcmFwaFFMTGlzdCxcbiAgR3JhcGhRTElucHV0T2JqZWN0VHlwZSxcbiAgR3JhcGhRTEJvb2xlYW4sXG4gIEdyYXBoUUxVbmlvblR5cGUsXG59IGZyb20gJ2dyYXBocWwnO1xuaW1wb3J0IHsgdG9HbG9iYWxJZCB9IGZyb20gJ2dyYXBocWwtcmVsYXknO1xuaW1wb3J0IHsgR3JhcGhRTFVwbG9hZCB9IGZyb20gJ0BncmFwaHFsLXRvb2xzL2xpbmtzJztcblxuY2xhc3MgVHlwZVZhbGlkYXRpb25FcnJvciBleHRlbmRzIEVycm9yIHtcbiAgY29uc3RydWN0b3IodmFsdWUsIHR5cGUpIHtcbiAgICBzdXBlcihgJHt2YWx1ZX0gaXMgbm90IGEgdmFsaWQgJHt0eXBlfWApO1xuICB9XG59XG5cbmNvbnN0IHBhcnNlU3RyaW5nVmFsdWUgPSAodmFsdWUpID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ1N0cmluZycpO1xufTtcblxuY29uc3QgcGFyc2VJbnRWYWx1ZSA9ICh2YWx1ZSkgPT4ge1xuICBpZiAodHlwZW9mIHZhbHVlID09PSAnc3RyaW5nJykge1xuICAgIGNvbnN0IGludCA9IE51bWJlcih2YWx1ZSk7XG4gICAgaWYgKE51bWJlci5pc0ludGVnZXIoaW50KSkge1xuICAgICAgcmV0dXJuIGludDtcbiAgICB9XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0ludCcpO1xufTtcblxuY29uc3QgcGFyc2VGbG9hdFZhbHVlID0gKHZhbHVlKSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgY29uc3QgZmxvYXQgPSBOdW1iZXIodmFsdWUpO1xuICAgIGlmICghaXNOYU4oZmxvYXQpKSB7XG4gICAgICByZXR1cm4gZmxvYXQ7XG4gICAgfVxuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdGbG9hdCcpO1xufTtcblxuY29uc3QgcGFyc2VCb29sZWFuVmFsdWUgPSAodmFsdWUpID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ2Jvb2xlYW4nKSB7XG4gICAgcmV0dXJuIHZhbHVlO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdCb29sZWFuJyk7XG59O1xuXG5jb25zdCBwYXJzZVZhbHVlID0gKHZhbHVlKSA9PiB7XG4gIHN3aXRjaCAodmFsdWUua2luZCkge1xuICAgIGNhc2UgS2luZC5TVFJJTkc6XG4gICAgICByZXR1cm4gcGFyc2VTdHJpbmdWYWx1ZSh2YWx1ZS52YWx1ZSk7XG5cbiAgICBjYXNlIEtpbmQuSU5UOlxuICAgICAgcmV0dXJuIHBhcnNlSW50VmFsdWUodmFsdWUudmFsdWUpO1xuXG4gICAgY2FzZSBLaW5kLkZMT0FUOlxuICAgICAgcmV0dXJuIHBhcnNlRmxvYXRWYWx1ZSh2YWx1ZS52YWx1ZSk7XG5cbiAgICBjYXNlIEtpbmQuQk9PTEVBTjpcbiAgICAgIHJldHVybiBwYXJzZUJvb2xlYW5WYWx1ZSh2YWx1ZS52YWx1ZSk7XG5cbiAgICBjYXNlIEtpbmQuTElTVDpcbiAgICAgIHJldHVybiBwYXJzZUxpc3RWYWx1ZXModmFsdWUudmFsdWVzKTtcblxuICAgIGNhc2UgS2luZC5PQkpFQ1Q6XG4gICAgICByZXR1cm4gcGFyc2VPYmplY3RGaWVsZHModmFsdWUuZmllbGRzKTtcblxuICAgIGRlZmF1bHQ6XG4gICAgICByZXR1cm4gdmFsdWUudmFsdWU7XG4gIH1cbn07XG5cbmNvbnN0IHBhcnNlTGlzdFZhbHVlcyA9ICh2YWx1ZXMpID0+IHtcbiAgaWYgKEFycmF5LmlzQXJyYXkodmFsdWVzKSkge1xuICAgIHJldHVybiB2YWx1ZXMubWFwKCh2YWx1ZSkgPT4gcGFyc2VWYWx1ZSh2YWx1ZSkpO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWVzLCAnTGlzdCcpO1xufTtcblxuY29uc3QgcGFyc2VPYmplY3RGaWVsZHMgPSAoZmllbGRzKSA9PiB7XG4gIGlmIChBcnJheS5pc0FycmF5KGZpZWxkcykpIHtcbiAgICByZXR1cm4gZmllbGRzLnJlZHVjZShcbiAgICAgIChvYmplY3QsIGZpZWxkKSA9PiAoe1xuICAgICAgICAuLi5vYmplY3QsXG4gICAgICAgIFtmaWVsZC5uYW1lLnZhbHVlXTogcGFyc2VWYWx1ZShmaWVsZC52YWx1ZSksXG4gICAgICB9KSxcbiAgICAgIHt9XG4gICAgKTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGZpZWxkcywgJ09iamVjdCcpO1xufTtcblxuY29uc3QgQU5ZID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ0FueScsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQW55IHNjYWxhciB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyBhbmQgdHlwZXMgdGhhdCBpbnZvbHZlIGFueSB0eXBlIG9mIHZhbHVlLicsXG4gIHBhcnNlVmFsdWU6ICh2YWx1ZSkgPT4gdmFsdWUsXG4gIHNlcmlhbGl6ZTogKHZhbHVlKSA9PiB2YWx1ZSxcbiAgcGFyc2VMaXRlcmFsOiAoYXN0KSA9PiBwYXJzZVZhbHVlKGFzdCksXG59KTtcblxuY29uc3QgT0JKRUNUID0gbmV3IEdyYXBoUUxTY2FsYXJUeXBlKHtcbiAgbmFtZTogJ09iamVjdCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgT2JqZWN0IHNjYWxhciB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyBhbmQgdHlwZXMgdGhhdCBpbnZvbHZlIG9iamVjdHMuJyxcbiAgcGFyc2VWYWx1ZSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdPYmplY3QnKTtcbiAgfSxcbiAgc2VyaWFsaXplKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcpIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ09iamVjdCcpO1xuICB9LFxuICBwYXJzZUxpdGVyYWwoYXN0KSB7XG4gICAgaWYgKGFzdC5raW5kID09PSBLaW5kLk9CSkVDVCkge1xuICAgICAgcmV0dXJuIHBhcnNlT2JqZWN0RmllbGRzKGFzdC5maWVsZHMpO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnT2JqZWN0Jyk7XG4gIH0sXG59KTtcblxuY29uc3QgcGFyc2VEYXRlSXNvVmFsdWUgPSAodmFsdWUpID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICBjb25zdCBkYXRlID0gbmV3IERhdGUodmFsdWUpO1xuICAgIGlmICghaXNOYU4oZGF0ZSkpIHtcbiAgICAgIHJldHVybiBkYXRlO1xuICAgIH1cbiAgfSBlbHNlIGlmICh2YWx1ZSBpbnN0YW5jZW9mIERhdGUpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0RhdGUnKTtcbn07XG5cbmNvbnN0IHNlcmlhbGl6ZURhdGVJc28gPSAodmFsdWUpID0+IHtcbiAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICByZXR1cm4gdmFsdWU7XG4gIH1cbiAgaWYgKHZhbHVlIGluc3RhbmNlb2YgRGF0ZSkge1xuICAgIHJldHVybiB2YWx1ZS50b0lTT1N0cmluZygpO1xuICB9XG5cbiAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdEYXRlJyk7XG59O1xuXG5jb25zdCBwYXJzZURhdGVJc29MaXRlcmFsID0gKGFzdCkgPT4ge1xuICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgcmV0dXJuIHBhcnNlRGF0ZUlzb1ZhbHVlKGFzdC52YWx1ZSk7XG4gIH1cblxuICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcihhc3Qua2luZCwgJ0RhdGUnKTtcbn07XG5cbmNvbnN0IERBVEUgPSBuZXcgR3JhcGhRTFNjYWxhclR5cGUoe1xuICBuYW1lOiAnRGF0ZScsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgRGF0ZSBzY2FsYXIgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgYW5kIHR5cGVzIHRoYXQgaW52b2x2ZSBkYXRlcy4nLFxuICBwYXJzZVZhbHVlKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgfHwgdmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBwYXJzZURhdGVJc29WYWx1ZSh2YWx1ZSksXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoXG4gICAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgICB2YWx1ZS5fX3R5cGUgPT09ICdEYXRlJyAmJlxuICAgICAgdmFsdWUuaXNvXG4gICAgKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6IHZhbHVlLl9fdHlwZSxcbiAgICAgICAgaXNvOiBwYXJzZURhdGVJc29WYWx1ZSh2YWx1ZS5pc28pLFxuICAgICAgfTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0RhdGUnKTtcbiAgfSxcbiAgc2VyaWFsaXplKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycgfHwgdmFsdWUgaW5zdGFuY2VvZiBEYXRlKSB7XG4gICAgICByZXR1cm4gc2VyaWFsaXplRGF0ZUlzbyh2YWx1ZSk7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHZhbHVlLl9fdHlwZSA9PT0gJ0RhdGUnICYmXG4gICAgICB2YWx1ZS5pc29cbiAgICApIHtcbiAgICAgIHJldHVybiBzZXJpYWxpemVEYXRlSXNvKHZhbHVlLmlzbyk7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdEYXRlJyk7XG4gIH0sXG4gIHBhcnNlTGl0ZXJhbChhc3QpIHtcbiAgICBpZiAoYXN0LmtpbmQgPT09IEtpbmQuU1RSSU5HKSB7XG4gICAgICByZXR1cm4ge1xuICAgICAgICBfX3R5cGU6ICdEYXRlJyxcbiAgICAgICAgaXNvOiBwYXJzZURhdGVJc29MaXRlcmFsKGFzdCksXG4gICAgICB9O1xuICAgIH0gZWxzZSBpZiAoYXN0LmtpbmQgPT09IEtpbmQuT0JKRUNUKSB7XG4gICAgICBjb25zdCBfX3R5cGUgPSBhc3QuZmllbGRzLmZpbmQoKGZpZWxkKSA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnX190eXBlJyk7XG4gICAgICBjb25zdCBpc28gPSBhc3QuZmllbGRzLmZpbmQoKGZpZWxkKSA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnaXNvJyk7XG4gICAgICBpZiAoX190eXBlICYmIF9fdHlwZS52YWx1ZSAmJiBfX3R5cGUudmFsdWUudmFsdWUgPT09ICdEYXRlJyAmJiBpc28pIHtcbiAgICAgICAgcmV0dXJuIHtcbiAgICAgICAgICBfX3R5cGU6IF9fdHlwZS52YWx1ZS52YWx1ZSxcbiAgICAgICAgICBpc286IHBhcnNlRGF0ZUlzb0xpdGVyYWwoaXNvLnZhbHVlKSxcbiAgICAgICAgfTtcbiAgICAgIH1cbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcihhc3Qua2luZCwgJ0RhdGUnKTtcbiAgfSxcbn0pO1xuXG5jb25zdCBCWVRFUyA9IG5ldyBHcmFwaFFMU2NhbGFyVHlwZSh7XG4gIG5hbWU6ICdCeXRlcycsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQnl0ZXMgc2NhbGFyIHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIGFuZCB0eXBlcyB0aGF0IGludm9sdmUgYmFzZSA2NCBiaW5hcnkgZGF0YS4nLFxuICBwYXJzZVZhbHVlKHZhbHVlKSB7XG4gICAgaWYgKHR5cGVvZiB2YWx1ZSA9PT0gJ3N0cmluZycpIHtcbiAgICAgIHJldHVybiB7XG4gICAgICAgIF9fdHlwZTogJ0J5dGVzJyxcbiAgICAgICAgYmFzZTY0OiB2YWx1ZSxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHZhbHVlLl9fdHlwZSA9PT0gJ0J5dGVzJyAmJlxuICAgICAgdHlwZW9mIHZhbHVlLmJhc2U2NCA9PT0gJ3N0cmluZydcbiAgICApIHtcbiAgICAgIHJldHVybiB2YWx1ZTtcbiAgICB9XG5cbiAgICB0aHJvdyBuZXcgVHlwZVZhbGlkYXRpb25FcnJvcih2YWx1ZSwgJ0J5dGVzJyk7XG4gIH0sXG4gIHNlcmlhbGl6ZSh2YWx1ZSkge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHZhbHVlLl9fdHlwZSA9PT0gJ0J5dGVzJyAmJlxuICAgICAgdHlwZW9mIHZhbHVlLmJhc2U2NCA9PT0gJ3N0cmluZydcbiAgICApIHtcbiAgICAgIHJldHVybiB2YWx1ZS5iYXNlNjQ7XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IodmFsdWUsICdCeXRlcycpO1xuICB9LFxuICBwYXJzZUxpdGVyYWwoYXN0KSB7XG4gICAgaWYgKGFzdC5raW5kID09PSBLaW5kLlNUUklORykge1xuICAgICAgcmV0dXJuIHtcbiAgICAgICAgX190eXBlOiAnQnl0ZXMnLFxuICAgICAgICBiYXNlNjQ6IGFzdC52YWx1ZSxcbiAgICAgIH07XG4gICAgfSBlbHNlIGlmIChhc3Qua2luZCA9PT0gS2luZC5PQkpFQ1QpIHtcbiAgICAgIGNvbnN0IF9fdHlwZSA9IGFzdC5maWVsZHMuZmluZCgoZmllbGQpID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdfX3R5cGUnKTtcbiAgICAgIGNvbnN0IGJhc2U2NCA9IGFzdC5maWVsZHMuZmluZCgoZmllbGQpID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdiYXNlNjQnKTtcbiAgICAgIGlmIChcbiAgICAgICAgX190eXBlICYmXG4gICAgICAgIF9fdHlwZS52YWx1ZSAmJlxuICAgICAgICBfX3R5cGUudmFsdWUudmFsdWUgPT09ICdCeXRlcycgJiZcbiAgICAgICAgYmFzZTY0ICYmXG4gICAgICAgIGJhc2U2NC52YWx1ZSAmJlxuICAgICAgICB0eXBlb2YgYmFzZTY0LnZhbHVlLnZhbHVlID09PSAnc3RyaW5nJ1xuICAgICAgKSB7XG4gICAgICAgIHJldHVybiB7XG4gICAgICAgICAgX190eXBlOiBfX3R5cGUudmFsdWUudmFsdWUsXG4gICAgICAgICAgYmFzZTY0OiBiYXNlNjQudmFsdWUudmFsdWUsXG4gICAgICAgIH07XG4gICAgICB9XG4gICAgfVxuXG4gICAgdGhyb3cgbmV3IFR5cGVWYWxpZGF0aW9uRXJyb3IoYXN0LmtpbmQsICdCeXRlcycpO1xuICB9LFxufSk7XG5cbmNvbnN0IHBhcnNlRmlsZVZhbHVlID0gKHZhbHVlKSA9PiB7XG4gIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgcmV0dXJuIHtcbiAgICAgIF9fdHlwZTogJ0ZpbGUnLFxuICAgICAgbmFtZTogdmFsdWUsXG4gICAgfTtcbiAgfSBlbHNlIGlmIChcbiAgICB0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnICYmXG4gICAgdmFsdWUuX190eXBlID09PSAnRmlsZScgJiZcbiAgICB0eXBlb2YgdmFsdWUubmFtZSA9PT0gJ3N0cmluZycgJiZcbiAgICAodmFsdWUudXJsID09PSB1bmRlZmluZWQgfHwgdHlwZW9mIHZhbHVlLnVybCA9PT0gJ3N0cmluZycpXG4gICkge1xuICAgIHJldHVybiB2YWx1ZTtcbiAgfVxuXG4gIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRmlsZScpO1xufTtcblxuY29uc3QgRklMRSA9IG5ldyBHcmFwaFFMU2NhbGFyVHlwZSh7XG4gIG5hbWU6ICdGaWxlJyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBGaWxlIHNjYWxhciB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyBhbmQgdHlwZXMgdGhhdCBpbnZvbHZlIGZpbGVzLicsXG4gIHBhcnNlVmFsdWU6IHBhcnNlRmlsZVZhbHVlLFxuICBzZXJpYWxpemU6ICh2YWx1ZSkgPT4ge1xuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdzdHJpbmcnKSB7XG4gICAgICByZXR1cm4gdmFsdWU7XG4gICAgfSBlbHNlIGlmIChcbiAgICAgIHR5cGVvZiB2YWx1ZSA9PT0gJ29iamVjdCcgJiZcbiAgICAgIHZhbHVlLl9fdHlwZSA9PT0gJ0ZpbGUnICYmXG4gICAgICB0eXBlb2YgdmFsdWUubmFtZSA9PT0gJ3N0cmluZycgJiZcbiAgICAgICh2YWx1ZS51cmwgPT09IHVuZGVmaW5lZCB8fCB0eXBlb2YgdmFsdWUudXJsID09PSAnc3RyaW5nJylcbiAgICApIHtcbiAgICAgIHJldHVybiB2YWx1ZS5uYW1lO1xuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKHZhbHVlLCAnRmlsZScpO1xuICB9LFxuICBwYXJzZUxpdGVyYWwoYXN0KSB7XG4gICAgaWYgKGFzdC5raW5kID09PSBLaW5kLlNUUklORykge1xuICAgICAgcmV0dXJuIHBhcnNlRmlsZVZhbHVlKGFzdC52YWx1ZSk7XG4gICAgfSBlbHNlIGlmIChhc3Qua2luZCA9PT0gS2luZC5PQkpFQ1QpIHtcbiAgICAgIGNvbnN0IF9fdHlwZSA9IGFzdC5maWVsZHMuZmluZCgoZmllbGQpID0+IGZpZWxkLm5hbWUudmFsdWUgPT09ICdfX3R5cGUnKTtcbiAgICAgIGNvbnN0IG5hbWUgPSBhc3QuZmllbGRzLmZpbmQoKGZpZWxkKSA9PiBmaWVsZC5uYW1lLnZhbHVlID09PSAnbmFtZScpO1xuICAgICAgY29uc3QgdXJsID0gYXN0LmZpZWxkcy5maW5kKChmaWVsZCkgPT4gZmllbGQubmFtZS52YWx1ZSA9PT0gJ3VybCcpO1xuICAgICAgaWYgKF9fdHlwZSAmJiBfX3R5cGUudmFsdWUgJiYgbmFtZSAmJiBuYW1lLnZhbHVlKSB7XG4gICAgICAgIHJldHVybiBwYXJzZUZpbGVWYWx1ZSh7XG4gICAgICAgICAgX190eXBlOiBfX3R5cGUudmFsdWUudmFsdWUsXG4gICAgICAgICAgbmFtZTogbmFtZS52YWx1ZS52YWx1ZSxcbiAgICAgICAgICB1cmw6IHVybCAmJiB1cmwudmFsdWUgPyB1cmwudmFsdWUudmFsdWUgOiB1bmRlZmluZWQsXG4gICAgICAgIH0pO1xuICAgICAgfVxuICAgIH1cblxuICAgIHRocm93IG5ldyBUeXBlVmFsaWRhdGlvbkVycm9yKGFzdC5raW5kLCAnRmlsZScpO1xuICB9LFxufSk7XG5cbmNvbnN0IEZJTEVfSU5GTyA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdGaWxlSW5mbycsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgRmlsZUluZm8gb2JqZWN0IHR5cGUgaXMgdXNlZCB0byByZXR1cm4gdGhlIGluZm9ybWF0aW9uIGFib3V0IGZpbGVzLicsXG4gIGZpZWxkczoge1xuICAgIG5hbWU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZmlsZSBuYW1lLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgICB1cmw6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgdXJsIGluIHdoaWNoIHRoZSBmaWxlIGNhbiBiZSBkb3dubG9hZGVkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBGSUxFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnRmlsZUlucHV0JyxcbiAgZmllbGRzOiB7XG4gICAgZmlsZToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdBIEZpbGUgU2NhbGFyIGNhbiBiZSBhbiB1cmwgb3IgYSBGaWxlSW5mbyBvYmplY3QuIElmIHRoaXMgZmllbGQgaXMgc2V0IHRvIG51bGwgdGhlIGZpbGUgd2lsbCBiZSB1bmxpbmtlZC4nLFxuICAgICAgdHlwZTogRklMRSxcbiAgICB9LFxuICAgIHVwbG9hZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdVc2UgdGhpcyBmaWVsZCBpZiB5b3Ugd2FudCB0byBjcmVhdGUgYSBuZXcgZmlsZS4nLFxuICAgICAgdHlwZTogR3JhcGhRTFVwbG9hZCxcbiAgICB9LFxuICAgIHVubGluazoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdVc2UgdGhpcyBmaWVsZCBpZiB5b3Ugd2FudCB0byB1bmxpbmsgdGhlIGZpbGUgKHRoZSBmaWxlIHdpbGwgbm90IGJlIGRlbGV0ZWQgb24gY2xvdWQgc3RvcmFnZSknLFxuICAgICAgdHlwZTogR3JhcGhRTEJvb2xlYW4sXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBHRU9fUE9JTlRfRklFTERTID0ge1xuICBsYXRpdHVkZToge1xuICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgbGF0aXR1ZGUuJyxcbiAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEZsb2F0KSxcbiAgfSxcbiAgbG9uZ2l0dWRlOiB7XG4gICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBsb25naXR1ZGUuJyxcbiAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEZsb2F0KSxcbiAgfSxcbn07XG5cbmNvbnN0IEdFT19QT0lOVF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0dlb1BvaW50SW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIEdlb1BvaW50SW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGlucHV0dGluZyBmaWVsZHMgb2YgdHlwZSBnZW8gcG9pbnQuJyxcbiAgZmllbGRzOiBHRU9fUE9JTlRfRklFTERTLFxufSk7XG5cbmNvbnN0IEdFT19QT0lOVCA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdHZW9Qb2ludCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgR2VvUG9pbnQgb2JqZWN0IHR5cGUgaXMgdXNlZCB0byByZXR1cm4gdGhlIGluZm9ybWF0aW9uIGFib3V0IGdlbyBwb2ludCBmaWVsZHMuJyxcbiAgZmllbGRzOiBHRU9fUE9JTlRfRklFTERTLFxufSk7XG5cbmNvbnN0IFBPTFlHT05fSU5QVVQgPSBuZXcgR3JhcGhRTExpc3QobmV3IEdyYXBoUUxOb25OdWxsKEdFT19QT0lOVF9JTlBVVCkpO1xuXG5jb25zdCBQT0xZR09OID0gbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChHRU9fUE9JTlQpKTtcblxuY29uc3QgVVNFUl9BQ0xfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdVc2VyQUNMSW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ0FsbG93IHRvIG1hbmFnZSB1c2VycyBpbiBBQ0wuJyxcbiAgZmllbGRzOiB7XG4gICAgdXNlcklkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0lEIG9mIHRoZSB0YXJnZXR0ZWQgVXNlci4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxJRCksXG4gICAgfSxcbiAgICByZWFkOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IHRoZSB1c2VyIHRvIHJlYWQgdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gICAgd3JpdGU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgdGhlIHVzZXIgdG8gd3JpdGUgb24gdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgUk9MRV9BQ0xfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdSb2xlQUNMSW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ0FsbG93IHRvIG1hbmFnZSByb2xlcyBpbiBBQ0wuJyxcbiAgZmllbGRzOiB7XG4gICAgcm9sZU5hbWU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgdGFyZ2V0dGVkIFJvbGUuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbiAgICB9LFxuICAgIHJlYWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnQWxsb3cgdXNlcnMgd2hvIGFyZSBtZW1iZXJzIG9mIHRoZSByb2xlIHRvIHJlYWQgdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gICAgd3JpdGU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnQWxsb3cgdXNlcnMgd2hvIGFyZSBtZW1iZXJzIG9mIHRoZSByb2xlIHRvIHdyaXRlIG9uIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFBVQkxJQ19BQ0xfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdQdWJsaWNBQ0xJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOiAnQWxsb3cgdG8gbWFuYWdlIHB1YmxpYyByaWdodHMuJyxcbiAgZmllbGRzOiB7XG4gICAgcmVhZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyBhbnlvbmUgdG8gcmVhZCB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgICB3cml0ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyBhbnlvbmUgdG8gd3JpdGUgb24gdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgQUNMX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnQUNMSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnQWxsb3cgdG8gbWFuYWdlIGFjY2VzcyByaWdodHMuIElmIG5vdCBwcm92aWRlZCBvYmplY3Qgd2lsbCBiZSBwdWJsaWNseSByZWFkYWJsZSBhbmQgd3JpdGFibGUnLFxuICBmaWVsZHM6IHtcbiAgICB1c2Vyczoge1xuICAgICAgZGVzY3JpcHRpb246ICdBY2Nlc3MgY29udHJvbCBsaXN0IGZvciB1c2Vycy4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChVU0VSX0FDTF9JTlBVVCkpLFxuICAgIH0sXG4gICAgcm9sZXM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWNjZXNzIGNvbnRyb2wgbGlzdCBmb3Igcm9sZXMuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoUk9MRV9BQ0xfSU5QVVQpKSxcbiAgICB9LFxuICAgIHB1YmxpYzoge1xuICAgICAgZGVzY3JpcHRpb246ICdQdWJsaWMgYWNjZXNzIGNvbnRyb2wgbGlzdC4nLFxuICAgICAgdHlwZTogUFVCTElDX0FDTF9JTlBVVCxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFVTRVJfQUNMID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1VzZXJBQ0wnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnQWxsb3cgdG8gbWFuYWdlIHVzZXJzIGluIEFDTC4gSWYgcmVhZCBhbmQgd3JpdGUgYXJlIG51bGwgdGhlIHVzZXJzIGhhdmUgcmVhZCBhbmQgd3JpdGUgcmlnaHRzLicsXG4gIGZpZWxkczoge1xuICAgIHVzZXJJZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdJRCBvZiB0aGUgdGFyZ2V0dGVkIFVzZXIuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMSUQpLFxuICAgIH0sXG4gICAgcmVhZDoge1xuICAgICAgZGVzY3JpcHRpb246ICdBbGxvdyB0aGUgdXNlciB0byByZWFkIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICAgIHdyaXRlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IHRoZSB1c2VyIHRvIHdyaXRlIG9uIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxCb29sZWFuKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFJPTEVfQUNMID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1JvbGVBQ0wnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnQWxsb3cgdG8gbWFuYWdlIHJvbGVzIGluIEFDTC4gSWYgcmVhZCBhbmQgd3JpdGUgYXJlIG51bGwgdGhlIHJvbGUgaGF2ZSByZWFkIGFuZCB3cml0ZSByaWdodHMuJyxcbiAgZmllbGRzOiB7XG4gICAgcm9sZU5hbWU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnTmFtZSBvZiB0aGUgdGFyZ2V0dGVkIFJvbGUuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMSUQpLFxuICAgIH0sXG4gICAgcmVhZDoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdBbGxvdyB1c2VycyB3aG8gYXJlIG1lbWJlcnMgb2YgdGhlIHJvbGUgdG8gcmVhZCB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMQm9vbGVhbiksXG4gICAgfSxcbiAgICB3cml0ZToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdBbGxvdyB1c2VycyB3aG8gYXJlIG1lbWJlcnMgb2YgdGhlIHJvbGUgdG8gd3JpdGUgb24gdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEJvb2xlYW4pLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgUFVCTElDX0FDTCA9IG5ldyBHcmFwaFFMT2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdQdWJsaWNBQ0wnLFxuICBkZXNjcmlwdGlvbjogJ0FsbG93IHRvIG1hbmFnZSBwdWJsaWMgcmlnaHRzLicsXG4gIGZpZWxkczoge1xuICAgIHJlYWQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWxsb3cgYW55b25lIHRvIHJlYWQgdGhlIGN1cnJlbnQgb2JqZWN0LicsXG4gICAgICB0eXBlOiBHcmFwaFFMQm9vbGVhbixcbiAgICB9LFxuICAgIHdyaXRlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ0FsbG93IGFueW9uZSB0byB3cml0ZSBvbiB0aGUgY3VycmVudCBvYmplY3QuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxCb29sZWFuLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgQUNMID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0FDTCcsXG4gIGRlc2NyaXB0aW9uOiAnQ3VycmVudCBhY2Nlc3MgY29udHJvbCBsaXN0IG9mIHRoZSBjdXJyZW50IG9iamVjdC4nLFxuICBmaWVsZHM6IHtcbiAgICB1c2Vyczoge1xuICAgICAgZGVzY3JpcHRpb246ICdBY2Nlc3MgY29udHJvbCBsaXN0IGZvciB1c2Vycy4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KG5ldyBHcmFwaFFMTm9uTnVsbChVU0VSX0FDTCkpLFxuICAgICAgcmVzb2x2ZShwKSB7XG4gICAgICAgIGNvbnN0IHVzZXJzID0gW107XG4gICAgICAgIE9iamVjdC5rZXlzKHApLmZvckVhY2goKHJ1bGUpID0+IHtcbiAgICAgICAgICBpZiAocnVsZSAhPT0gJyonICYmIHJ1bGUuaW5kZXhPZigncm9sZTonKSAhPT0gMCkge1xuICAgICAgICAgICAgdXNlcnMucHVzaCh7XG4gICAgICAgICAgICAgIHVzZXJJZDogdG9HbG9iYWxJZCgnX1VzZXInLCBydWxlKSxcbiAgICAgICAgICAgICAgcmVhZDogcFtydWxlXS5yZWFkID8gdHJ1ZSA6IGZhbHNlLFxuICAgICAgICAgICAgICB3cml0ZTogcFtydWxlXS53cml0ZSA/IHRydWUgOiBmYWxzZSxcbiAgICAgICAgICAgIH0pO1xuICAgICAgICAgIH1cbiAgICAgICAgfSk7XG4gICAgICAgIHJldHVybiB1c2Vycy5sZW5ndGggPyB1c2VycyA6IG51bGw7XG4gICAgICB9LFxuICAgIH0sXG4gICAgcm9sZXM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnQWNjZXNzIGNvbnRyb2wgbGlzdCBmb3Igcm9sZXMuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChuZXcgR3JhcGhRTE5vbk51bGwoUk9MRV9BQ0wpKSxcbiAgICAgIHJlc29sdmUocCkge1xuICAgICAgICBjb25zdCByb2xlcyA9IFtdO1xuICAgICAgICBPYmplY3Qua2V5cyhwKS5mb3JFYWNoKChydWxlKSA9PiB7XG4gICAgICAgICAgaWYgKHJ1bGUuaW5kZXhPZigncm9sZTonKSA9PT0gMCkge1xuICAgICAgICAgICAgcm9sZXMucHVzaCh7XG4gICAgICAgICAgICAgIHJvbGVOYW1lOiBydWxlLnJlcGxhY2UoJ3JvbGU6JywgJycpLFxuICAgICAgICAgICAgICByZWFkOiBwW3J1bGVdLnJlYWQgPyB0cnVlIDogZmFsc2UsXG4gICAgICAgICAgICAgIHdyaXRlOiBwW3J1bGVdLndyaXRlID8gdHJ1ZSA6IGZhbHNlLFxuICAgICAgICAgICAgfSk7XG4gICAgICAgICAgfVxuICAgICAgICB9KTtcbiAgICAgICAgcmV0dXJuIHJvbGVzLmxlbmd0aCA/IHJvbGVzIDogbnVsbDtcbiAgICAgIH0sXG4gICAgfSxcbiAgICBwdWJsaWM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnUHVibGljIGFjY2VzcyBjb250cm9sIGxpc3QuJyxcbiAgICAgIHR5cGU6IFBVQkxJQ19BQ0wsXG4gICAgICByZXNvbHZlKHApIHtcbiAgICAgICAgLyogZXNsaW50LWRpc2FibGUgKi9cbiAgICAgICAgcmV0dXJuIHBbJyonXVxuICAgICAgICAgID8ge1xuICAgICAgICAgICAgICByZWFkOiBwWycqJ10ucmVhZCA/IHRydWUgOiBmYWxzZSxcbiAgICAgICAgICAgICAgd3JpdGU6IHBbJyonXS53cml0ZSA/IHRydWUgOiBmYWxzZSxcbiAgICAgICAgICAgIH1cbiAgICAgICAgICA6IG51bGw7XG4gICAgICB9LFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgT0JKRUNUX0lEID0gbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxJRCk7XG5cbmNvbnN0IENMQVNTX05BTUVfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGNsYXNzIG5hbWUgb2YgdGhlIG9iamVjdC4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG59O1xuXG5jb25zdCBHTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIG9iamVjdCBpZC4gWW91IGNhbiB1c2UgZWl0aGVyIHRoZSBnbG9iYWwgb3IgdGhlIG9iamVjdCBpZC4nLFxuICB0eXBlOiBPQkpFQ1RfSUQsXG59O1xuXG5jb25zdCBPQkpFQ1RfSURfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG9iamVjdCBpZC4nLFxuICB0eXBlOiBPQkpFQ1RfSUQsXG59O1xuXG5jb25zdCBDUkVBVEVEX0FUX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBkYXRlIGluIHdoaWNoIHRoZSBvYmplY3Qgd2FzIGNyZWF0ZWQuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKERBVEUpLFxufTtcblxuY29uc3QgVVBEQVRFRF9BVF9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgZGF0ZSBpbiB3aGljaCB0aGUgb2JqZWN0IHdhcyBsYXMgdXBkYXRlZC4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoREFURSksXG59O1xuXG5jb25zdCBJTlBVVF9GSUVMRFMgPSB7XG4gIEFDTDoge1xuICAgIHR5cGU6IEFDTCxcbiAgfSxcbn07XG5cbmNvbnN0IENSRUFURV9SRVNVTFRfRklFTERTID0ge1xuICBvYmplY3RJZDogT0JKRUNUX0lEX0FUVCxcbiAgY3JlYXRlZEF0OiBDUkVBVEVEX0FUX0FUVCxcbn07XG5cbmNvbnN0IFVQREFURV9SRVNVTFRfRklFTERTID0ge1xuICB1cGRhdGVkQXQ6IFVQREFURURfQVRfQVRULFxufTtcblxuY29uc3QgUEFSU0VfT0JKRUNUX0ZJRUxEUyA9IHtcbiAgLi4uQ1JFQVRFX1JFU1VMVF9GSUVMRFMsXG4gIC4uLlVQREFURV9SRVNVTFRfRklFTERTLFxuICAuLi5JTlBVVF9GSUVMRFMsXG4gIEFDTDoge1xuICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChBQ0wpLFxuICAgIHJlc29sdmU6ICh7IEFDTCB9KSA9PiAoQUNMID8gQUNMIDogeyAnKic6IHsgcmVhZDogdHJ1ZSwgd3JpdGU6IHRydWUgfSB9KSxcbiAgfSxcbn07XG5cbmNvbnN0IFBBUlNFX09CSkVDVCA9IG5ldyBHcmFwaFFMSW50ZXJmYWNlVHlwZSh7XG4gIG5hbWU6ICdQYXJzZU9iamVjdCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgUGFyc2VPYmplY3QgaW50ZXJmYWNlIHR5cGUgaXMgdXNlZCBhcyBhIGJhc2UgdHlwZSBmb3IgdGhlIGF1dG8gZ2VuZXJhdGVkIG9iamVjdCB0eXBlcy4nLFxuICBmaWVsZHM6IFBBUlNFX09CSkVDVF9GSUVMRFMsXG59KTtcblxuY29uc3QgU0VTU0lPTl9UT0tFTl9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhlIGN1cnJlbnQgdXNlciBzZXNzaW9uIHRva2VuLicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMU3RyaW5nKSxcbn07XG5cbmNvbnN0IFJFQURfUFJFRkVSRU5DRSA9IG5ldyBHcmFwaFFMRW51bVR5cGUoe1xuICBuYW1lOiAnUmVhZFByZWZlcmVuY2UnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFJlYWRQcmVmZXJlbmNlIGVudW0gdHlwZSBpcyB1c2VkIGluIHF1ZXJpZXMgaW4gb3JkZXIgdG8gc2VsZWN0IGluIHdoaWNoIGRhdGFiYXNlIHJlcGxpY2EgdGhlIG9wZXJhdGlvbiBtdXN0IHJ1bi4nLFxuICB2YWx1ZXM6IHtcbiAgICBQUklNQVJZOiB7IHZhbHVlOiAnUFJJTUFSWScgfSxcbiAgICBQUklNQVJZX1BSRUZFUlJFRDogeyB2YWx1ZTogJ1BSSU1BUllfUFJFRkVSUkVEJyB9LFxuICAgIFNFQ09OREFSWTogeyB2YWx1ZTogJ1NFQ09OREFSWScgfSxcbiAgICBTRUNPTkRBUllfUFJFRkVSUkVEOiB7IHZhbHVlOiAnU0VDT05EQVJZX1BSRUZFUlJFRCcgfSxcbiAgICBORUFSRVNUOiB7IHZhbHVlOiAnTkVBUkVTVCcgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBSRUFEX1BSRUZFUkVOQ0VfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoZSByZWFkIHByZWZlcmVuY2UgZm9yIHRoZSBtYWluIHF1ZXJ5IHRvIGJlIGV4ZWN1dGVkLicsXG4gIHR5cGU6IFJFQURfUFJFRkVSRU5DRSxcbn07XG5cbmNvbnN0IElOQ0xVREVfUkVBRF9QUkVGRVJFTkNFX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSByZWFkIHByZWZlcmVuY2UgZm9yIHRoZSBxdWVyaWVzIHRvIGJlIGV4ZWN1dGVkIHRvIGluY2x1ZGUgZmllbGRzLicsXG4gIHR5cGU6IFJFQURfUFJFRkVSRU5DRSxcbn07XG5cbmNvbnN0IFNVQlFVRVJZX1JFQURfUFJFRkVSRU5DRV9BVFQgPSB7XG4gIGRlc2NyaXB0aW9uOiAnVGhlIHJlYWQgcHJlZmVyZW5jZSBmb3IgdGhlIHN1YnF1ZXJpZXMgdGhhdCBtYXkgYmUgcmVxdWlyZWQuJyxcbiAgdHlwZTogUkVBRF9QUkVGRVJFTkNFLFxufTtcblxuY29uc3QgUkVBRF9PUFRJT05TX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnUmVhZE9wdGlvbnNJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgUmVhZE9wdGlvbnNJbnB1dHQgdHlwZSBpcyB1c2VkIGluIHF1ZXJpZXMgaW4gb3JkZXIgdG8gc2V0IHRoZSByZWFkIHByZWZlcmVuY2VzLicsXG4gIGZpZWxkczoge1xuICAgIHJlYWRQcmVmZXJlbmNlOiBSRUFEX1BSRUZFUkVOQ0VfQVRULFxuICAgIGluY2x1ZGVSZWFkUHJlZmVyZW5jZTogSU5DTFVERV9SRUFEX1BSRUZFUkVOQ0VfQVRULFxuICAgIHN1YnF1ZXJ5UmVhZFByZWZlcmVuY2U6IFNVQlFVRVJZX1JFQURfUFJFRkVSRU5DRV9BVFQsXG4gIH0sXG59KTtcblxuY29uc3QgUkVBRF9PUFRJT05TX0FUVCA9IHtcbiAgZGVzY3JpcHRpb246ICdUaGUgcmVhZCBvcHRpb25zIGZvciB0aGUgcXVlcnkgdG8gYmUgZXhlY3V0ZWQuJyxcbiAgdHlwZTogUkVBRF9PUFRJT05TX0lOUFVULFxufTtcblxuY29uc3QgV0hFUkVfQVRUID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlc2UgYXJlIHRoZSBjb25kaXRpb25zIHRoYXQgdGhlIG9iamVjdHMgbmVlZCB0byBtYXRjaCBpbiBvcmRlciB0byBiZSBmb3VuZCcsXG4gIHR5cGU6IE9CSkVDVCxcbn07XG5cbmNvbnN0IFNLSVBfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIG51bWJlciBvZiBvYmplY3RzIHRoYXQgbXVzdCBiZSBza2lwcGVkIHRvIHJldHVybi4nLFxuICB0eXBlOiBHcmFwaFFMSW50LFxufTtcblxuY29uc3QgTElNSVRfQVRUID0ge1xuICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGxpbWl0IG51bWJlciBvZiBvYmplY3RzIHRoYXQgbXVzdCBiZSByZXR1cm5lZC4nLFxuICB0eXBlOiBHcmFwaFFMSW50LFxufTtcblxuY29uc3QgQ09VTlRfQVRUID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgdG90YWwgbWF0Y2hlZCBvYmplY3MgY291bnQgdGhhdCBpcyByZXR1cm5lZCB3aGVuIHRoZSBjb3VudCBmbGFnIGlzIHNldC4nLFxuICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTEludCksXG59O1xuXG5jb25zdCBTRUFSQ0hfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdTZWFyY2hJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgU2VhcmNoSW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZml5IGEgc2VhcmNoIG9wZXJhdGlvbiBvbiBhIGZ1bGwgdGV4dCBzZWFyY2guJyxcbiAgZmllbGRzOiB7XG4gICAgdGVybToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB0ZXJtIHRvIGJlIHNlYXJjaGVkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgICBsYW5ndWFnZToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBsYW5ndWFnZSB0byB0ZXRlcm1pbmUgdGhlIGxpc3Qgb2Ygc3RvcCB3b3JkcyBhbmQgdGhlIHJ1bGVzIGZvciB0b2tlbml6ZXIuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxTdHJpbmcsXG4gICAgfSxcbiAgICBjYXNlU2Vuc2l0aXZlOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGZsYWcgdG8gZW5hYmxlIG9yIGRpc2FibGUgY2FzZSBzZW5zaXRpdmUgc2VhcmNoLicsXG4gICAgICB0eXBlOiBHcmFwaFFMQm9vbGVhbixcbiAgICB9LFxuICAgIGRpYWNyaXRpY1NlbnNpdGl2ZToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBmbGFnIHRvIGVuYWJsZSBvciBkaXNhYmxlIGRpYWNyaXRpYyBzZW5zaXRpdmUgc2VhcmNoLicsXG4gICAgICB0eXBlOiBHcmFwaFFMQm9vbGVhbixcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFRFWFRfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdUZXh0SW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIFRleHRJbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmeSBhIHRleHQgb3BlcmF0aW9uIG9uIGEgY29uc3RyYWludC4nLFxuICBmaWVsZHM6IHtcbiAgICBzZWFyY2g6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgc2VhcmNoIHRvIGJlIGV4ZWN1dGVkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoU0VBUkNIX0lOUFVUKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IEJPWF9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0JveElucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBCb3hJbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmaXkgYSBib3ggb3BlcmF0aW9uIG9uIGEgd2l0aGluIGdlbyBxdWVyeS4nLFxuICBmaWVsZHM6IHtcbiAgICBib3R0b21MZWZ0OiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1RoaXMgaXMgdGhlIGJvdHRvbSBsZWZ0IGNvb3JkaW5hdGVzIG9mIHRoZSBib3guJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHRU9fUE9JTlRfSU5QVVQpLFxuICAgIH0sXG4gICAgdXBwZXJSaWdodDoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSB1cHBlciByaWdodCBjb29yZGluYXRlcyBvZiB0aGUgYm94LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR0VPX1BPSU5UX0lOUFVUKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFdJVEhJTl9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ1dpdGhpbklucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBXaXRoaW5JbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmeSBhIHdpdGhpbiBvcGVyYXRpb24gb24gYSBjb25zdHJhaW50LicsXG4gIGZpZWxkczoge1xuICAgIGJveDoge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBib3ggdG8gYmUgc3BlY2lmaWVkLicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoQk9YX0lOUFVUKSxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IENFTlRFUl9TUEhFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdDZW50ZXJTcGhlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQ2VudGVyU3BoZXJlSW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZml5IGEgY2VudGVyU3BoZXJlIG9wZXJhdGlvbiBvbiBhIGdlb1dpdGhpbiBxdWVyeS4nLFxuICBmaWVsZHM6IHtcbiAgICBjZW50ZXI6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgY2VudGVyIG9mIHRoZSBzcGhlcmUuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHRU9fUE9JTlRfSU5QVVQpLFxuICAgIH0sXG4gICAgZGlzdGFuY2U6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgcmFkaXVzIG9mIHRoZSBzcGhlcmUuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChHcmFwaFFMRmxvYXQpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgR0VPX1dJVEhJTl9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0dlb1dpdGhpbklucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBHZW9XaXRoaW5JbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmeSBhIGdlb1dpdGhpbiBvcGVyYXRpb24gb24gYSBjb25zdHJhaW50LicsXG4gIGZpZWxkczoge1xuICAgIHBvbHlnb246IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgcG9seWdvbiB0byBiZSBzcGVjaWZpZWQuJyxcbiAgICAgIHR5cGU6IFBPTFlHT05fSU5QVVQsXG4gICAgfSxcbiAgICBjZW50ZXJTcGhlcmU6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgc3BoZXJlIHRvIGJlIHNwZWNpZmllZC4nLFxuICAgICAgdHlwZTogQ0VOVEVSX1NQSEVSRV9JTlBVVCxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IEdFT19JTlRFUlNFQ1RTX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnR2VvSW50ZXJzZWN0c0lucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBHZW9JbnRlcnNlY3RzSW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYSBnZW9JbnRlcnNlY3RzIG9wZXJhdGlvbiBvbiBhIGNvbnN0cmFpbnQuJyxcbiAgZmllbGRzOiB7XG4gICAgcG9pbnQ6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhpcyBpcyB0aGUgcG9pbnQgdG8gYmUgc3BlY2lmaWVkLicsXG4gICAgICB0eXBlOiBHRU9fUE9JTlRfSU5QVVQsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBlcXVhbFRvID0gKHR5cGUpID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBlcXVhbFRvIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBlcXVhbHMgdG8gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBub3RFcXVhbFRvID0gKHR5cGUpID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBub3RFcXVhbFRvIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBkbyBub3QgZXF1YWwgdG8gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBsZXNzVGhhbiA9ICh0eXBlKSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgbGVzc1RoYW4gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGlzIGxlc3MgdGhhbiBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IGxlc3NUaGFuT3JFcXVhbFRvID0gKHR5cGUpID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBsZXNzVGhhbk9yRXF1YWxUbyBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgaXMgbGVzcyB0aGFuIG9yIGVxdWFsIHRvIGEgc3BlY2lmaWVkIHZhbHVlLicsXG4gIHR5cGUsXG59KTtcblxuY29uc3QgZ3JlYXRlclRoYW4gPSAodHlwZSkgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGdyZWF0ZXJUaGFuIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBpcyBncmVhdGVyIHRoYW4gYSBzcGVjaWZpZWQgdmFsdWUuJyxcbiAgdHlwZSxcbn0pO1xuXG5jb25zdCBncmVhdGVyVGhhbk9yRXF1YWxUbyA9ICh0eXBlKSA9PiAoe1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgZ3JlYXRlclRoYW5PckVxdWFsVG8gb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZSBvZiBhIGZpZWxkIGlzIGdyZWF0ZXIgdGhhbiBvciBlcXVhbCB0byBhIHNwZWNpZmllZCB2YWx1ZS4nLFxuICB0eXBlLFxufSk7XG5cbmNvbnN0IGluT3AgPSAodHlwZSkgPT4gKHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGluIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBlcXVhbHMgYW55IHZhbHVlIGluIHRoZSBzcGVjaWZpZWQgYXJyYXkuJyxcbiAgdHlwZTogbmV3IEdyYXBoUUxMaXN0KHR5cGUpLFxufSk7XG5cbmNvbnN0IG5vdEluID0gKHR5cGUpID0+ICh7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBub3RJbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlIG9mIGEgZmllbGQgZG8gbm90IGVxdWFsIGFueSB2YWx1ZSBpbiB0aGUgc3BlY2lmaWVkIGFycmF5LicsXG4gIHR5cGU6IG5ldyBHcmFwaFFMTGlzdCh0eXBlKSxcbn0pO1xuXG5jb25zdCBleGlzdHMgPSB7XG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGlzIGlzIHRoZSBleGlzdHMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIGEgZmllbGQgZXhpc3RzIChvciBkbyBub3QgZXhpc3QpLicsXG4gIHR5cGU6IEdyYXBoUUxCb29sZWFuLFxufTtcblxuY29uc3QgbWF0Y2hlc1JlZ2V4ID0ge1xuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhpcyBpcyB0aGUgbWF0Y2hlc1JlZ2V4IG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWUgb2YgYSBmaWVsZCBtYXRjaGVzIGEgc3BlY2lmaWVkIHJlZ3VsYXIgZXhwcmVzc2lvbi4nLFxuICB0eXBlOiBHcmFwaFFMU3RyaW5nLFxufTtcblxuY29uc3Qgb3B0aW9ucyA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIG9wdGlvbnMgb3BlcmF0b3IgdG8gc3BlY2lmeSBvcHRpb25hbCBmbGFncyAoc3VjaCBhcyBcImlcIiBhbmQgXCJtXCIpIHRvIGJlIGFkZGVkIHRvIGEgbWF0Y2hlc1JlZ2V4IG9wZXJhdGlvbiBpbiB0aGUgc2FtZSBzZXQgb2YgY29uc3RyYWludHMuJyxcbiAgdHlwZTogR3JhcGhRTFN0cmluZyxcbn07XG5cbmNvbnN0IFNVQlFVRVJZX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnU3VicXVlcnlJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgU3VicXVlcnlJbnB1dCB0eXBlIGlzIHVzZWQgdG8gc3BlY2lmeSBhIHN1YiBxdWVyeSB0byBhbm90aGVyIGNsYXNzLicsXG4gIGZpZWxkczoge1xuICAgIGNsYXNzTmFtZTogQ0xBU1NfTkFNRV9BVFQsXG4gICAgd2hlcmU6IE9iamVjdC5hc3NpZ24oe30sIFdIRVJFX0FUVCwge1xuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFdIRVJFX0FUVC50eXBlKSxcbiAgICB9KSxcbiAgfSxcbn0pO1xuXG5jb25zdCBTRUxFQ1RfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdTZWxlY3RJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgU2VsZWN0SW5wdXQgdHlwZSBpcyB1c2VkIHRvIHNwZWNpZnkgYW4gaW5RdWVyeUtleSBvciBhIG5vdEluUXVlcnlLZXkgb3BlcmF0aW9uIG9uIGEgY29uc3RyYWludC4nLFxuICBmaWVsZHM6IHtcbiAgICBxdWVyeToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGlzIGlzIHRoZSBzdWJxdWVyeSB0byBiZSBleGVjdXRlZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKFNVQlFVRVJZX0lOUFVUKSxcbiAgICB9LFxuICAgIGtleToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBrZXkgaW4gdGhlIHJlc3VsdCBvZiB0aGUgc3VicXVlcnkgdGhhdCBtdXN0IG1hdGNoIChub3QgbWF0Y2gpIHRoZSBmaWVsZC4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEdyYXBoUUxTdHJpbmcpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuY29uc3QgaW5RdWVyeUtleSA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIGluUXVlcnlLZXkgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIGEgZmllbGQgZXF1YWxzIHRvIGEga2V5IGluIHRoZSByZXN1bHQgb2YgYSBkaWZmZXJlbnQgcXVlcnkuJyxcbiAgdHlwZTogU0VMRUNUX0lOUFVULFxufTtcblxuY29uc3Qgbm90SW5RdWVyeUtleSA9IHtcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoaXMgaXMgdGhlIG5vdEluUXVlcnlLZXkgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIGEgZmllbGQgZG8gbm90IGVxdWFsIHRvIGEga2V5IGluIHRoZSByZXN1bHQgb2YgYSBkaWZmZXJlbnQgcXVlcnkuJyxcbiAgdHlwZTogU0VMRUNUX0lOUFVULFxufTtcblxuY29uc3QgSURfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdJZFdoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIElkV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYW4gaWQuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhHcmFwaFFMSUQpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oR3JhcGhRTElEKSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oR3JhcGhRTElEKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oR3JhcGhRTElEKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oR3JhcGhRTElEKSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oR3JhcGhRTElEKSxcbiAgICBpbjogaW5PcChHcmFwaFFMSUQpLFxuICAgIG5vdEluOiBub3RJbihHcmFwaFFMSUQpLFxuICAgIGV4aXN0cyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgU1RSSU5HX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnU3RyaW5nV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgU3RyaW5nV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIFN0cmluZy4nLFxuICBmaWVsZHM6IHtcbiAgICBlcXVhbFRvOiBlcXVhbFRvKEdyYXBoUUxTdHJpbmcpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oR3JhcGhRTFN0cmluZyksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKEdyYXBoUUxTdHJpbmcpLFxuICAgIGxlc3NUaGFuT3JFcXVhbFRvOiBsZXNzVGhhbk9yRXF1YWxUbyhHcmFwaFFMU3RyaW5nKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oR3JhcGhRTFN0cmluZyksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKEdyYXBoUUxTdHJpbmcpLFxuICAgIGluOiBpbk9wKEdyYXBoUUxTdHJpbmcpLFxuICAgIG5vdEluOiBub3RJbihHcmFwaFFMU3RyaW5nKSxcbiAgICBleGlzdHMsXG4gICAgbWF0Y2hlc1JlZ2V4LFxuICAgIG9wdGlvbnMsXG4gICAgdGV4dDoge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSAkdGV4dCBvcGVyYXRvciB0byBzcGVjaWZ5IGEgZnVsbCB0ZXh0IHNlYXJjaCBjb25zdHJhaW50LicsXG4gICAgICB0eXBlOiBURVhUX0lOUFVULFxuICAgIH0sXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IE5VTUJFUl9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ051bWJlcldoZXJlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjpcbiAgICAnVGhlIE51bWJlcldoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBOdW1iZXIuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhHcmFwaFFMRmxvYXQpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oR3JhcGhRTEZsb2F0KSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oR3JhcGhRTEZsb2F0KSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oR3JhcGhRTEZsb2F0KSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oR3JhcGhRTEZsb2F0KSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oR3JhcGhRTEZsb2F0KSxcbiAgICBpbjogaW5PcChHcmFwaFFMRmxvYXQpLFxuICAgIG5vdEluOiBub3RJbihHcmFwaFFMRmxvYXQpLFxuICAgIGV4aXN0cyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgQk9PTEVBTl9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0Jvb2xlYW5XaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBCb29sZWFuV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIEJvb2xlYW4uJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhHcmFwaFFMQm9vbGVhbiksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhHcmFwaFFMQm9vbGVhbiksXG4gICAgZXhpc3RzLFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBBUlJBWV9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0FycmF5V2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQXJyYXlXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgQXJyYXkuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhBTlkpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oQU5ZKSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oQU5ZKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oQU5ZKSxcbiAgICBncmVhdGVyVGhhbjogZ3JlYXRlclRoYW4oQU5ZKSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oQU5ZKSxcbiAgICBpbjogaW5PcChBTlkpLFxuICAgIG5vdEluOiBub3RJbihBTlkpLFxuICAgIGV4aXN0cyxcbiAgICBjb250YWluZWRCeToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBjb250YWluZWRCeSBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhbiBhcnJheSBmaWVsZCBpcyBjb250YWluZWQgYnkgYW5vdGhlciBzcGVjaWZpZWQgYXJyYXkuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChBTlkpLFxuICAgIH0sXG4gICAgY29udGFpbnM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgY29udGFpbnMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYW4gYXJyYXkgZmllbGQgY29udGFpbiBhbGwgZWxlbWVudHMgb2YgYW5vdGhlciBzcGVjaWZpZWQgYXJyYXkuJyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTGlzdChBTlkpLFxuICAgIH0sXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IEtFWV9WQUxVRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0tleVZhbHVlSW5wdXQnLFxuICBkZXNjcmlwdGlvbjogJ0FuIGVudHJ5IGZyb20gYW4gb2JqZWN0LCBpLmUuLCBhIHBhaXIgb2Yga2V5IGFuZCB2YWx1ZS4nLFxuICBmaWVsZHM6IHtcbiAgICBrZXk6IHtcbiAgICAgIGRlc2NyaXB0aW9uOiAnVGhlIGtleSB1c2VkIHRvIHJldHJpZXZlIHRoZSB2YWx1ZSBvZiB0aGlzIGVudHJ5LicsXG4gICAgICB0eXBlOiBuZXcgR3JhcGhRTE5vbk51bGwoR3JhcGhRTFN0cmluZyksXG4gICAgfSxcbiAgICB2YWx1ZToge1xuICAgICAgZGVzY3JpcHRpb246ICdUaGUgdmFsdWUgb2YgdGhlIGVudHJ5LiBDb3VsZCBiZSBhbnkgdHlwZSBvZiBzY2FsYXIgZGF0YS4nLFxuICAgICAgdHlwZTogbmV3IEdyYXBoUUxOb25OdWxsKEFOWSksXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBPQkpFQ1RfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdPYmplY3RXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBPYmplY3RXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgcmVzdWx0IGJ5IGEgZmllbGQgb2YgdHlwZSBPYmplY3QuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhLRVlfVkFMVUVfSU5QVVQpLFxuICAgIG5vdEVxdWFsVG86IG5vdEVxdWFsVG8oS0VZX1ZBTFVFX0lOUFVUKSxcbiAgICBpbjogaW5PcChLRVlfVkFMVUVfSU5QVVQpLFxuICAgIG5vdEluOiBub3RJbihLRVlfVkFMVUVfSU5QVVQpLFxuICAgIGxlc3NUaGFuOiBsZXNzVGhhbihLRVlfVkFMVUVfSU5QVVQpLFxuICAgIGxlc3NUaGFuT3JFcXVhbFRvOiBsZXNzVGhhbk9yRXF1YWxUbyhLRVlfVkFMVUVfSU5QVVQpLFxuICAgIGdyZWF0ZXJUaGFuOiBncmVhdGVyVGhhbihLRVlfVkFMVUVfSU5QVVQpLFxuICAgIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiBncmVhdGVyVGhhbk9yRXF1YWxUbyhLRVlfVkFMVUVfSU5QVVQpLFxuICAgIGV4aXN0cyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgREFURV9XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0RhdGVXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBEYXRlV2hlcmVJbnB1dCBpbnB1dCB0eXBlIGlzIHVzZWQgaW4gb3BlcmF0aW9ucyB0aGF0IGludm9sdmUgZmlsdGVyaW5nIG9iamVjdHMgYnkgYSBmaWVsZCBvZiB0eXBlIERhdGUuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhEQVRFKSxcbiAgICBub3RFcXVhbFRvOiBub3RFcXVhbFRvKERBVEUpLFxuICAgIGxlc3NUaGFuOiBsZXNzVGhhbihEQVRFKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oREFURSksXG4gICAgZ3JlYXRlclRoYW46IGdyZWF0ZXJUaGFuKERBVEUpLFxuICAgIGdyZWF0ZXJUaGFuT3JFcXVhbFRvOiBncmVhdGVyVGhhbk9yRXF1YWxUbyhEQVRFKSxcbiAgICBpbjogaW5PcChEQVRFKSxcbiAgICBub3RJbjogbm90SW4oREFURSksXG4gICAgZXhpc3RzLFxuICAgIGluUXVlcnlLZXksXG4gICAgbm90SW5RdWVyeUtleSxcbiAgfSxcbn0pO1xuXG5jb25zdCBCWVRFU19XSEVSRV9JTlBVVCA9IG5ldyBHcmFwaFFMSW5wdXRPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0J5dGVzV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgQnl0ZXNXaGVyZUlucHV0IGlucHV0IHR5cGUgaXMgdXNlZCBpbiBvcGVyYXRpb25zIHRoYXQgaW52b2x2ZSBmaWx0ZXJpbmcgb2JqZWN0cyBieSBhIGZpZWxkIG9mIHR5cGUgQnl0ZXMuJyxcbiAgZmllbGRzOiB7XG4gICAgZXF1YWxUbzogZXF1YWxUbyhCWVRFUyksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhCWVRFUyksXG4gICAgbGVzc1RoYW46IGxlc3NUaGFuKEJZVEVTKSxcbiAgICBsZXNzVGhhbk9yRXF1YWxUbzogbGVzc1RoYW5PckVxdWFsVG8oQllURVMpLFxuICAgIGdyZWF0ZXJUaGFuOiBncmVhdGVyVGhhbihCWVRFUyksXG4gICAgZ3JlYXRlclRoYW5PckVxdWFsVG86IGdyZWF0ZXJUaGFuT3JFcXVhbFRvKEJZVEVTKSxcbiAgICBpbjogaW5PcChCWVRFUyksXG4gICAgbm90SW46IG5vdEluKEJZVEVTKSxcbiAgICBleGlzdHMsXG4gICAgaW5RdWVyeUtleSxcbiAgICBub3RJblF1ZXJ5S2V5LFxuICB9LFxufSk7XG5cbmNvbnN0IEZJTEVfV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdGaWxlV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgRmlsZVdoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBGaWxlLicsXG4gIGZpZWxkczoge1xuICAgIGVxdWFsVG86IGVxdWFsVG8oRklMRSksXG4gICAgbm90RXF1YWxUbzogbm90RXF1YWxUbyhGSUxFKSxcbiAgICBsZXNzVGhhbjogbGVzc1RoYW4oRklMRSksXG4gICAgbGVzc1RoYW5PckVxdWFsVG86IGxlc3NUaGFuT3JFcXVhbFRvKEZJTEUpLFxuICAgIGdyZWF0ZXJUaGFuOiBncmVhdGVyVGhhbihGSUxFKSxcbiAgICBncmVhdGVyVGhhbk9yRXF1YWxUbzogZ3JlYXRlclRoYW5PckVxdWFsVG8oRklMRSksXG4gICAgaW46IGluT3AoRklMRSksXG4gICAgbm90SW46IG5vdEluKEZJTEUpLFxuICAgIGV4aXN0cyxcbiAgICBtYXRjaGVzUmVnZXgsXG4gICAgb3B0aW9ucyxcbiAgICBpblF1ZXJ5S2V5LFxuICAgIG5vdEluUXVlcnlLZXksXG4gIH0sXG59KTtcblxuY29uc3QgR0VPX1BPSU5UX1dIRVJFX0lOUFVUID0gbmV3IEdyYXBoUUxJbnB1dE9iamVjdFR5cGUoe1xuICBuYW1lOiAnR2VvUG9pbnRXaGVyZUlucHV0JyxcbiAgZGVzY3JpcHRpb246XG4gICAgJ1RoZSBHZW9Qb2ludFdoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBHZW9Qb2ludC4nLFxuICBmaWVsZHM6IHtcbiAgICBleGlzdHMsXG4gICAgbmVhclNwaGVyZToge1xuICAgICAgZGVzY3JpcHRpb246XG4gICAgICAgICdUaGlzIGlzIHRoZSBuZWFyU3BoZXJlIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIG5lYXIgdG8gYW5vdGhlciBnZW8gcG9pbnQuJyxcbiAgICAgIHR5cGU6IEdFT19QT0lOVF9JTlBVVCxcbiAgICB9LFxuICAgIG1heERpc3RhbmNlOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIG1heERpc3RhbmNlIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIGF0IGEgbWF4IGRpc3RhbmNlIChpbiByYWRpYW5zKSBmcm9tIHRoZSBnZW8gcG9pbnQgc3BlY2lmaWVkIGluIHRoZSAkbmVhclNwaGVyZSBvcGVyYXRvci4nLFxuICAgICAgdHlwZTogR3JhcGhRTEZsb2F0LFxuICAgIH0sXG4gICAgbWF4RGlzdGFuY2VJblJhZGlhbnM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgbWF4RGlzdGFuY2VJblJhZGlhbnMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBnZW8gcG9pbnQgZmllbGQgaXMgYXQgYSBtYXggZGlzdGFuY2UgKGluIHJhZGlhbnMpIGZyb20gdGhlIGdlbyBwb2ludCBzcGVjaWZpZWQgaW4gdGhlICRuZWFyU3BoZXJlIG9wZXJhdG9yLicsXG4gICAgICB0eXBlOiBHcmFwaFFMRmxvYXQsXG4gICAgfSxcbiAgICBtYXhEaXN0YW5jZUluTWlsZXM6IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgbWF4RGlzdGFuY2VJbk1pbGVzIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIGF0IGEgbWF4IGRpc3RhbmNlIChpbiBtaWxlcykgZnJvbSB0aGUgZ2VvIHBvaW50IHNwZWNpZmllZCBpbiB0aGUgJG5lYXJTcGhlcmUgb3BlcmF0b3IuJyxcbiAgICAgIHR5cGU6IEdyYXBoUUxGbG9hdCxcbiAgICB9LFxuICAgIG1heERpc3RhbmNlSW5LaWxvbWV0ZXJzOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIG1heERpc3RhbmNlSW5LaWxvbWV0ZXJzIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIGF0IGEgbWF4IGRpc3RhbmNlIChpbiBraWxvbWV0ZXJzKSBmcm9tIHRoZSBnZW8gcG9pbnQgc3BlY2lmaWVkIGluIHRoZSAkbmVhclNwaGVyZSBvcGVyYXRvci4nLFxuICAgICAgdHlwZTogR3JhcGhRTEZsb2F0LFxuICAgIH0sXG4gICAgd2l0aGluOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIHdpdGhpbiBvcGVyYXRvciB0byBzcGVjaWZ5IGEgY29uc3RyYWludCB0byBzZWxlY3QgdGhlIG9iamVjdHMgd2hlcmUgdGhlIHZhbHVlcyBvZiBhIGdlbyBwb2ludCBmaWVsZCBpcyB3aXRoaW4gYSBzcGVjaWZpZWQgYm94LicsXG4gICAgICB0eXBlOiBXSVRISU5fSU5QVVQsXG4gICAgfSxcbiAgICBnZW9XaXRoaW46IHtcbiAgICAgIGRlc2NyaXB0aW9uOlxuICAgICAgICAnVGhpcyBpcyB0aGUgZ2VvV2l0aGluIG9wZXJhdG9yIHRvIHNwZWNpZnkgYSBjb25zdHJhaW50IHRvIHNlbGVjdCB0aGUgb2JqZWN0cyB3aGVyZSB0aGUgdmFsdWVzIG9mIGEgZ2VvIHBvaW50IGZpZWxkIGlzIHdpdGhpbiBhIHNwZWNpZmllZCBwb2x5Z29uIG9yIHNwaGVyZS4nLFxuICAgICAgdHlwZTogR0VPX1dJVEhJTl9JTlBVVCxcbiAgICB9LFxuICB9LFxufSk7XG5cbmNvbnN0IFBPTFlHT05fV0hFUkVfSU5QVVQgPSBuZXcgR3JhcGhRTElucHV0T2JqZWN0VHlwZSh7XG4gIG5hbWU6ICdQb2x5Z29uV2hlcmVJbnB1dCcsXG4gIGRlc2NyaXB0aW9uOlxuICAgICdUaGUgUG9seWdvbldoZXJlSW5wdXQgaW5wdXQgdHlwZSBpcyB1c2VkIGluIG9wZXJhdGlvbnMgdGhhdCBpbnZvbHZlIGZpbHRlcmluZyBvYmplY3RzIGJ5IGEgZmllbGQgb2YgdHlwZSBQb2x5Z29uLicsXG4gIGZpZWxkczoge1xuICAgIGV4aXN0cyxcbiAgICBnZW9JbnRlcnNlY3RzOiB7XG4gICAgICBkZXNjcmlwdGlvbjpcbiAgICAgICAgJ1RoaXMgaXMgdGhlIGdlb0ludGVyc2VjdHMgb3BlcmF0b3IgdG8gc3BlY2lmeSBhIGNvbnN0cmFpbnQgdG8gc2VsZWN0IHRoZSBvYmplY3RzIHdoZXJlIHRoZSB2YWx1ZXMgb2YgYSBwb2x5Z29uIGZpZWxkIGludGVyc2VjdCBhIHNwZWNpZmllZCBwb2ludC4nLFxuICAgICAgdHlwZTogR0VPX0lOVEVSU0VDVFNfSU5QVVQsXG4gICAgfSxcbiAgfSxcbn0pO1xuXG5jb25zdCBFTEVNRU5UID0gbmV3IEdyYXBoUUxPYmplY3RUeXBlKHtcbiAgbmFtZTogJ0VsZW1lbnQnLFxuICBkZXNjcmlwdGlvbjogXCJUaGUgRWxlbWVudCBvYmplY3QgdHlwZSBpcyB1c2VkIHRvIHJldHVybiBhcnJheSBpdGVtcycgdmFsdWUuXCIsXG4gIGZpZWxkczoge1xuICAgIHZhbHVlOiB7XG4gICAgICBkZXNjcmlwdGlvbjogJ1JldHVybiB0aGUgdmFsdWUgb2YgdGhlIGVsZW1lbnQgaW4gdGhlIGFycmF5JyxcbiAgICAgIHR5cGU6IG5ldyBHcmFwaFFMTm9uTnVsbChBTlkpLFxuICAgIH0sXG4gIH0sXG59KTtcblxuLy8gRGVmYXVsdCBzdGF0aWMgdW5pb24gdHlwZSwgd2UgdXBkYXRlIHR5cGVzIGFuZCByZXNvbHZlVHlwZSBmdW5jdGlvbiBsYXRlclxubGV0IEFSUkFZX1JFU1VMVDtcblxuY29uc3QgbG9hZEFycmF5UmVzdWx0ID0gKHBhcnNlR3JhcGhRTFNjaGVtYSwgcGFyc2VDbGFzc2VzKSA9PiB7XG4gIGNvbnN0IGNsYXNzVHlwZXMgPSBwYXJzZUNsYXNzZXNcbiAgICAuZmlsdGVyKChwYXJzZUNsYXNzKSA9PlxuICAgICAgcGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1twYXJzZUNsYXNzLmNsYXNzTmFtZV1cbiAgICAgICAgLmNsYXNzR3JhcGhRTE91dHB1dFR5cGVcbiAgICAgICAgPyB0cnVlXG4gICAgICAgIDogZmFsc2VcbiAgICApXG4gICAgLm1hcChcbiAgICAgIChwYXJzZUNsYXNzKSA9PlxuICAgICAgICBwYXJzZUdyYXBoUUxTY2hlbWEucGFyc2VDbGFzc1R5cGVzW3BhcnNlQ2xhc3MuY2xhc3NOYW1lXVxuICAgICAgICAgIC5jbGFzc0dyYXBoUUxPdXRwdXRUeXBlXG4gICAgKTtcbiAgQVJSQVlfUkVTVUxUID0gbmV3IEdyYXBoUUxVbmlvblR5cGUoe1xuICAgIG5hbWU6ICdBcnJheVJlc3VsdCcsXG4gICAgZGVzY3JpcHRpb246XG4gICAgICAnVXNlIElubGluZSBGcmFnbWVudCBvbiBBcnJheSB0byBnZXQgcmVzdWx0czogaHR0cHM6Ly9ncmFwaHFsLm9yZy9sZWFybi9xdWVyaWVzLyNpbmxpbmUtZnJhZ21lbnRzJyxcbiAgICB0eXBlczogKCkgPT4gW0VMRU1FTlQsIC4uLmNsYXNzVHlwZXNdLFxuICAgIHJlc29sdmVUeXBlOiAodmFsdWUpID0+IHtcbiAgICAgIGlmICh2YWx1ZS5fX3R5cGUgPT09ICdPYmplY3QnICYmIHZhbHVlLmNsYXNzTmFtZSAmJiB2YWx1ZS5vYmplY3RJZCkge1xuICAgICAgICBpZiAocGFyc2VHcmFwaFFMU2NoZW1hLnBhcnNlQ2xhc3NUeXBlc1t2YWx1ZS5jbGFzc05hbWVdKSB7XG4gICAgICAgICAgcmV0dXJuIHBhcnNlR3JhcGhRTFNjaGVtYS5wYXJzZUNsYXNzVHlwZXNbdmFsdWUuY2xhc3NOYW1lXVxuICAgICAgICAgICAgLmNsYXNzR3JhcGhRTE91dHB1dFR5cGU7XG4gICAgICAgIH0gZWxzZSB7XG4gICAgICAgICAgcmV0dXJuIEVMRU1FTlQ7XG4gICAgICAgIH1cbiAgICAgIH0gZWxzZSB7XG4gICAgICAgIHJldHVybiBFTEVNRU5UO1xuICAgICAgfVxuICAgIH0sXG4gIH0pO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuZ3JhcGhRTFR5cGVzLnB1c2goQVJSQVlfUkVTVUxUKTtcbn07XG5cbmNvbnN0IGxvYWQgPSAocGFyc2VHcmFwaFFMU2NoZW1hKSA9PiB7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShHcmFwaFFMVXBsb2FkLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEFOWSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShPQkpFQ1QsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoREFURSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShCWVRFUywgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShGSUxFLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEZJTEVfSU5GTywgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShGSUxFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEdFT19QT0lOVF9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShHRU9fUE9JTlQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoUEFSU0VfT0JKRUNULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFJFQURfUFJFRkVSRU5DRSwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShSRUFEX09QVElPTlNfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoU0VBUkNIX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFRFWFRfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQk9YX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFdJVEhJTl9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShDRU5URVJfU1BIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEdFT19XSVRISU5fSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoR0VPX0lOVEVSU0VDVFNfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoSURfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoU1RSSU5HX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKE5VTUJFUl9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShCT09MRUFOX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEFSUkFZX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEtFWV9WQUxVRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShPQkpFQ1RfV0hFUkVfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoREFURV9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShCWVRFU19XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShGSUxFX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEdFT19QT0lOVF9XSEVSRV9JTlBVVCwgdHJ1ZSk7XG4gIHBhcnNlR3JhcGhRTFNjaGVtYS5hZGRHcmFwaFFMVHlwZShQT0xZR09OX1dIRVJFX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKEVMRU1FTlQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQUNMX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFVTRVJfQUNMX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFJPTEVfQUNMX0lOUFVULCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFBVQkxJQ19BQ0xfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoQUNMLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFVTRVJfQUNMLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFJPTEVfQUNMLCB0cnVlKTtcbiAgcGFyc2VHcmFwaFFMU2NoZW1hLmFkZEdyYXBoUUxUeXBlKFBVQkxJQ19BQ0wsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoU1VCUVVFUllfSU5QVVQsIHRydWUpO1xuICBwYXJzZUdyYXBoUUxTY2hlbWEuYWRkR3JhcGhRTFR5cGUoU0VMRUNUX0lOUFVULCB0cnVlKTtcbn07XG5cbmV4cG9ydCB7XG4gIFR5cGVWYWxpZGF0aW9uRXJyb3IsXG4gIHBhcnNlU3RyaW5nVmFsdWUsXG4gIHBhcnNlSW50VmFsdWUsXG4gIHBhcnNlRmxvYXRWYWx1ZSxcbiAgcGFyc2VCb29sZWFuVmFsdWUsXG4gIHBhcnNlVmFsdWUsXG4gIHBhcnNlTGlzdFZhbHVlcyxcbiAgcGFyc2VPYmplY3RGaWVsZHMsXG4gIEFOWSxcbiAgT0JKRUNULFxuICBwYXJzZURhdGVJc29WYWx1ZSxcbiAgc2VyaWFsaXplRGF0ZUlzbyxcbiAgREFURSxcbiAgQllURVMsXG4gIHBhcnNlRmlsZVZhbHVlLFxuICBTVUJRVUVSWV9JTlBVVCxcbiAgU0VMRUNUX0lOUFVULFxuICBGSUxFLFxuICBGSUxFX0lORk8sXG4gIEZJTEVfSU5QVVQsXG4gIEdFT19QT0lOVF9GSUVMRFMsXG4gIEdFT19QT0lOVF9JTlBVVCxcbiAgR0VPX1BPSU5ULFxuICBQT0xZR09OX0lOUFVULFxuICBQT0xZR09OLFxuICBPQkpFQ1RfSUQsXG4gIENMQVNTX05BTUVfQVRULFxuICBHTE9CQUxfT1JfT0JKRUNUX0lEX0FUVCxcbiAgT0JKRUNUX0lEX0FUVCxcbiAgVVBEQVRFRF9BVF9BVFQsXG4gIENSRUFURURfQVRfQVRULFxuICBJTlBVVF9GSUVMRFMsXG4gIENSRUFURV9SRVNVTFRfRklFTERTLFxuICBVUERBVEVfUkVTVUxUX0ZJRUxEUyxcbiAgUEFSU0VfT0JKRUNUX0ZJRUxEUyxcbiAgUEFSU0VfT0JKRUNULFxuICBTRVNTSU9OX1RPS0VOX0FUVCxcbiAgUkVBRF9QUkVGRVJFTkNFLFxuICBSRUFEX1BSRUZFUkVOQ0VfQVRULFxuICBJTkNMVURFX1JFQURfUFJFRkVSRU5DRV9BVFQsXG4gIFNVQlFVRVJZX1JFQURfUFJFRkVSRU5DRV9BVFQsXG4gIFJFQURfT1BUSU9OU19JTlBVVCxcbiAgUkVBRF9PUFRJT05TX0FUVCxcbiAgV0hFUkVfQVRULFxuICBTS0lQX0FUVCxcbiAgTElNSVRfQVRULFxuICBDT1VOVF9BVFQsXG4gIFNFQVJDSF9JTlBVVCxcbiAgVEVYVF9JTlBVVCxcbiAgQk9YX0lOUFVULFxuICBXSVRISU5fSU5QVVQsXG4gIENFTlRFUl9TUEhFUkVfSU5QVVQsXG4gIEdFT19XSVRISU5fSU5QVVQsXG4gIEdFT19JTlRFUlNFQ1RTX0lOUFVULFxuICBlcXVhbFRvLFxuICBub3RFcXVhbFRvLFxuICBsZXNzVGhhbixcbiAgbGVzc1RoYW5PckVxdWFsVG8sXG4gIGdyZWF0ZXJUaGFuLFxuICBncmVhdGVyVGhhbk9yRXF1YWxUbyxcbiAgaW5PcCxcbiAgbm90SW4sXG4gIGV4aXN0cyxcbiAgbWF0Y2hlc1JlZ2V4LFxuICBvcHRpb25zLFxuICBpblF1ZXJ5S2V5LFxuICBub3RJblF1ZXJ5S2V5LFxuICBJRF9XSEVSRV9JTlBVVCxcbiAgU1RSSU5HX1dIRVJFX0lOUFVULFxuICBOVU1CRVJfV0hFUkVfSU5QVVQsXG4gIEJPT0xFQU5fV0hFUkVfSU5QVVQsXG4gIEFSUkFZX1dIRVJFX0lOUFVULFxuICBLRVlfVkFMVUVfSU5QVVQsXG4gIE9CSkVDVF9XSEVSRV9JTlBVVCxcbiAgREFURV9XSEVSRV9JTlBVVCxcbiAgQllURVNfV0hFUkVfSU5QVVQsXG4gIEZJTEVfV0hFUkVfSU5QVVQsXG4gIEdFT19QT0lOVF9XSEVSRV9JTlBVVCxcbiAgUE9MWUdPTl9XSEVSRV9JTlBVVCxcbiAgQVJSQVlfUkVTVUxULFxuICBFTEVNRU5ULFxuICBBQ0xfSU5QVVQsXG4gIFVTRVJfQUNMX0lOUFVULFxuICBST0xFX0FDTF9JTlBVVCxcbiAgUFVCTElDX0FDTF9JTlBVVCxcbiAgQUNMLFxuICBVU0VSX0FDTCxcbiAgUk9MRV9BQ0wsXG4gIFBVQkxJQ19BQ0wsXG4gIGxvYWQsXG4gIGxvYWRBcnJheVJlc3VsdCxcbn07XG4iXX0=