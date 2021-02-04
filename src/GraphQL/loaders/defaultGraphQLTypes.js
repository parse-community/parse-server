import {
  Kind,
  GraphQLNonNull,
  GraphQLScalarType,
  GraphQLID,
  GraphQLString,
  GraphQLObjectType,
  GraphQLInterfaceType,
  GraphQLEnumType,
  GraphQLInt,
  GraphQLFloat,
  GraphQLList,
  GraphQLInputObjectType,
  GraphQLBoolean,
  GraphQLUnionType,
} from 'graphql';
import { toGlobalId } from 'graphql-relay';
import { GraphQLUpload } from '@graphql-tools/links';

class TypeValidationError extends Error {
  constructor(value, type) {
    super(`${value} is not a valid ${type}`);
  }
}

const parseStringValue = value => {
  if (typeof value === 'string') {
    return value;
  }

  throw new TypeValidationError(value, 'String');
};

const parseIntValue = value => {
  if (typeof value === 'string') {
    const int = Number(value);
    if (Number.isInteger(int)) {
      return int;
    }
  }

  throw new TypeValidationError(value, 'Int');
};

const parseFloatValue = value => {
  if (typeof value === 'string') {
    const float = Number(value);
    if (!isNaN(float)) {
      return float;
    }
  }

  throw new TypeValidationError(value, 'Float');
};

const parseBooleanValue = value => {
  if (typeof value === 'boolean') {
    return value;
  }

  throw new TypeValidationError(value, 'Boolean');
};

const parseValue = value => {
  switch (value.kind) {
    case Kind.STRING:
      return parseStringValue(value.value);

    case Kind.INT:
      return parseIntValue(value.value);

    case Kind.FLOAT:
      return parseFloatValue(value.value);

    case Kind.BOOLEAN:
      return parseBooleanValue(value.value);

    case Kind.LIST:
      return parseListValues(value.values);

    case Kind.OBJECT:
      return parseObjectFields(value.fields);

    default:
      return value.value;
  }
};

const parseListValues = values => {
  if (Array.isArray(values)) {
    return values.map(value => parseValue(value));
  }

  throw new TypeValidationError(values, 'List');
};

const parseObjectFields = fields => {
  if (Array.isArray(fields)) {
    return fields.reduce(
      (object, field) => ({
        ...object,
        [field.name.value]: parseValue(field.value),
      }),
      {}
    );
  }

  throw new TypeValidationError(fields, 'Object');
};

const ANY = new GraphQLScalarType({
  name: 'Any',
  description:
    'The Any scalar type is used in operations and types that involve any type of value.',
  parseValue: value => value,
  serialize: value => value,
  parseLiteral: ast => parseValue(ast),
});

const OBJECT = new GraphQLScalarType({
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
    if (ast.kind === Kind.OBJECT) {
      return parseObjectFields(ast.fields);
    }

    throw new TypeValidationError(ast.kind, 'Object');
  },
});

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

const serializeDateIso = value => {
  if (typeof value === 'string') {
    return value;
  }
  if (value instanceof Date) {
    return value.toISOString();
  }

  throw new TypeValidationError(value, 'Date');
};

const parseDateIsoLiteral = ast => {
  if (ast.kind === Kind.STRING) {
    return parseDateIsoValue(ast.value);
  }

  throw new TypeValidationError(ast.kind, 'Date');
};

const DATE = new GraphQLScalarType({
  name: 'Date',
  description: 'The Date scalar type is used in operations and types that involve dates.',
  parseValue(value) {
    if (typeof value === 'string' || value instanceof Date) {
      return {
        __type: 'Date',
        iso: parseDateIsoValue(value),
      };
    } else if (typeof value === 'object' && value.__type === 'Date' && value.iso) {
      return {
        __type: value.__type,
        iso: parseDateIsoValue(value.iso),
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
    if (ast.kind === Kind.STRING) {
      return {
        __type: 'Date',
        iso: parseDateIsoLiteral(ast),
      };
    } else if (ast.kind === Kind.OBJECT) {
      const __type = ast.fields.find(field => field.name.value === '__type');
      const iso = ast.fields.find(field => field.name.value === 'iso');
      if (__type && __type.value && __type.value.value === 'Date' && iso) {
        return {
          __type: __type.value.value,
          iso: parseDateIsoLiteral(iso.value),
        };
      }
    }

    throw new TypeValidationError(ast.kind, 'Date');
  },
});

const BYTES = new GraphQLScalarType({
  name: 'Bytes',
  description:
    'The Bytes scalar type is used in operations and types that involve base 64 binary data.',
  parseValue(value) {
    if (typeof value === 'string') {
      return {
        __type: 'Bytes',
        base64: value,
      };
    } else if (
      typeof value === 'object' &&
      value.__type === 'Bytes' &&
      typeof value.base64 === 'string'
    ) {
      return value;
    }

    throw new TypeValidationError(value, 'Bytes');
  },
  serialize(value) {
    if (typeof value === 'string') {
      return value;
    } else if (
      typeof value === 'object' &&
      value.__type === 'Bytes' &&
      typeof value.base64 === 'string'
    ) {
      return value.base64;
    }

    throw new TypeValidationError(value, 'Bytes');
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return {
        __type: 'Bytes',
        base64: ast.value,
      };
    } else if (ast.kind === Kind.OBJECT) {
      const __type = ast.fields.find(field => field.name.value === '__type');
      const base64 = ast.fields.find(field => field.name.value === 'base64');
      if (
        __type &&
        __type.value &&
        __type.value.value === 'Bytes' &&
        base64 &&
        base64.value &&
        typeof base64.value.value === 'string'
      ) {
        return {
          __type: __type.value.value,
          base64: base64.value.value,
        };
      }
    }

    throw new TypeValidationError(ast.kind, 'Bytes');
  },
});

const parseFileValue = value => {
  if (typeof value === 'string') {
    return {
      __type: 'File',
      name: value,
    };
  } else if (
    typeof value === 'object' &&
    value.__type === 'File' &&
    typeof value.name === 'string' &&
    (value.url === undefined || typeof value.url === 'string')
  ) {
    return value;
  }

  throw new TypeValidationError(value, 'File');
};

const FILE = new GraphQLScalarType({
  name: 'File',
  description: 'The File scalar type is used in operations and types that involve files.',
  parseValue: parseFileValue,
  serialize: value => {
    if (typeof value === 'string') {
      return value;
    } else if (
      typeof value === 'object' &&
      value.__type === 'File' &&
      typeof value.name === 'string' &&
      (value.url === undefined || typeof value.url === 'string')
    ) {
      return value.name;
    }

    throw new TypeValidationError(value, 'File');
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return parseFileValue(ast.value);
    } else if (ast.kind === Kind.OBJECT) {
      const __type = ast.fields.find(field => field.name.value === '__type');
      const name = ast.fields.find(field => field.name.value === 'name');
      const url = ast.fields.find(field => field.name.value === 'url');
      if (__type && __type.value && name && name.value) {
        return parseFileValue({
          __type: __type.value.value,
          name: name.value.value,
          url: url && url.value ? url.value.value : undefined,
        });
      }
    }

    throw new TypeValidationError(ast.kind, 'File');
  },
});

const FILE_INFO = new GraphQLObjectType({
  name: 'FileInfo',
  description: 'The FileInfo object type is used to return the information about files.',
  fields: {
    name: {
      description: 'This is the file name.',
      type: new GraphQLNonNull(GraphQLString),
    },
    url: {
      description: 'This is the url in which the file can be downloaded.',
      type: new GraphQLNonNull(GraphQLString),
    },
  },
});

const FILE_INPUT = new GraphQLInputObjectType({
  name: 'FileInput',
  fields: {
    file: {
      description:
        'A File Scalar can be an url or a FileInfo object. If this field is set to null the file will be unlinked.',
      type: FILE,
    },
    upload: {
      description: 'Use this field if you want to create a new file.',
      type: GraphQLUpload,
    },
    unlink: {
      description:
        'Use this field if you want to unlink the file (the file will not be deleted on cloud storage)',
      type: GraphQLBoolean,
    },
  },
});

const GEO_POINT_FIELDS = {
  latitude: {
    description: 'This is the latitude.',
    type: new GraphQLNonNull(GraphQLFloat),
  },
  longitude: {
    description: 'This is the longitude.',
    type: new GraphQLNonNull(GraphQLFloat),
  },
};

const GEO_POINT_INPUT = new GraphQLInputObjectType({
  name: 'GeoPointInput',
  description:
    'The GeoPointInput type is used in operations that involve inputting fields of type geo point.',
  fields: GEO_POINT_FIELDS,
});

const GEO_POINT = new GraphQLObjectType({
  name: 'GeoPoint',
  description: 'The GeoPoint object type is used to return the information about geo point fields.',
  fields: GEO_POINT_FIELDS,
});

const POLYGON_INPUT = new GraphQLList(new GraphQLNonNull(GEO_POINT_INPUT));

const POLYGON = new GraphQLList(new GraphQLNonNull(GEO_POINT));

const USER_ACL_INPUT = new GraphQLInputObjectType({
  name: 'UserACLInput',
  description: 'Allow to manage users in ACL.',
  fields: {
    userId: {
      description: 'ID of the targetted User.',
      type: new GraphQLNonNull(GraphQLID),
    },
    read: {
      description: 'Allow the user to read the current object.',
      type: new GraphQLNonNull(GraphQLBoolean),
    },
    write: {
      description: 'Allow the user to write on the current object.',
      type: new GraphQLNonNull(GraphQLBoolean),
    },
  },
});

const ROLE_ACL_INPUT = new GraphQLInputObjectType({
  name: 'RoleACLInput',
  description: 'Allow to manage roles in ACL.',
  fields: {
    roleName: {
      description: 'Name of the targetted Role.',
      type: new GraphQLNonNull(GraphQLString),
    },
    read: {
      description: 'Allow users who are members of the role to read the current object.',
      type: new GraphQLNonNull(GraphQLBoolean),
    },
    write: {
      description: 'Allow users who are members of the role to write on the current object.',
      type: new GraphQLNonNull(GraphQLBoolean),
    },
  },
});

const PUBLIC_ACL_INPUT = new GraphQLInputObjectType({
  name: 'PublicACLInput',
  description: 'Allow to manage public rights.',
  fields: {
    read: {
      description: 'Allow anyone to read the current object.',
      type: new GraphQLNonNull(GraphQLBoolean),
    },
    write: {
      description: 'Allow anyone to write on the current object.',
      type: new GraphQLNonNull(GraphQLBoolean),
    },
  },
});

const ACL_INPUT = new GraphQLInputObjectType({
  name: 'ACLInput',
  description:
    'Allow to manage access rights. If not provided object will be publicly readable and writable',
  fields: {
    users: {
      description: 'Access control list for users.',
      type: new GraphQLList(new GraphQLNonNull(USER_ACL_INPUT)),
    },
    roles: {
      description: 'Access control list for roles.',
      type: new GraphQLList(new GraphQLNonNull(ROLE_ACL_INPUT)),
    },
    public: {
      description: 'Public access control list.',
      type: PUBLIC_ACL_INPUT,
    },
  },
});

const USER_ACL = new GraphQLObjectType({
  name: 'UserACL',
  description:
    'Allow to manage users in ACL. If read and write are null the users have read and write rights.',
  fields: {
    userId: {
      description: 'ID of the targetted User.',
      type: new GraphQLNonNull(GraphQLID),
    },
    read: {
      description: 'Allow the user to read the current object.',
      type: new GraphQLNonNull(GraphQLBoolean),
    },
    write: {
      description: 'Allow the user to write on the current object.',
      type: new GraphQLNonNull(GraphQLBoolean),
    },
  },
});

const ROLE_ACL = new GraphQLObjectType({
  name: 'RoleACL',
  description:
    'Allow to manage roles in ACL. If read and write are null the role have read and write rights.',
  fields: {
    roleName: {
      description: 'Name of the targetted Role.',
      type: new GraphQLNonNull(GraphQLID),
    },
    read: {
      description: 'Allow users who are members of the role to read the current object.',
      type: new GraphQLNonNull(GraphQLBoolean),
    },
    write: {
      description: 'Allow users who are members of the role to write on the current object.',
      type: new GraphQLNonNull(GraphQLBoolean),
    },
  },
});

const PUBLIC_ACL = new GraphQLObjectType({
  name: 'PublicACL',
  description: 'Allow to manage public rights.',
  fields: {
    read: {
      description: 'Allow anyone to read the current object.',
      type: GraphQLBoolean,
    },
    write: {
      description: 'Allow anyone to write on the current object.',
      type: GraphQLBoolean,
    },
  },
});

const ACL = new GraphQLObjectType({
  name: 'ACL',
  description: 'Current access control list of the current object.',
  fields: {
    users: {
      description: 'Access control list for users.',
      type: new GraphQLList(new GraphQLNonNull(USER_ACL)),
      resolve(p) {
        const users = [];
        Object.keys(p).forEach(rule => {
          if (rule !== '*' && rule.indexOf('role:') !== 0) {
            users.push({
              userId: toGlobalId('_User', rule),
              read: p[rule].read ? true : false,
              write: p[rule].write ? true : false,
            });
          }
        });
        return users.length ? users : null;
      },
    },
    roles: {
      description: 'Access control list for roles.',
      type: new GraphQLList(new GraphQLNonNull(ROLE_ACL)),
      resolve(p) {
        const roles = [];
        Object.keys(p).forEach(rule => {
          if (rule.indexOf('role:') === 0) {
            roles.push({
              roleName: rule.replace('role:', ''),
              read: p[rule].read ? true : false,
              write: p[rule].write ? true : false,
            });
          }
        });
        return roles.length ? roles : null;
      },
    },
    public: {
      description: 'Public access control list.',
      type: PUBLIC_ACL,
      resolve(p) {
        /* eslint-disable */
        return p['*']
          ? {
              read: p['*'].read ? true : false,
              write: p['*'].write ? true : false,
            }
          : null;
      },
    },
  },
});

const OBJECT_ID = new GraphQLNonNull(GraphQLID);

const CLASS_NAME_ATT = {
  description: 'This is the class name of the object.',
  type: new GraphQLNonNull(GraphQLString),
};

const GLOBAL_OR_OBJECT_ID_ATT = {
  description: 'This is the object id. You can use either the global or the object id.',
  type: OBJECT_ID,
};

const OBJECT_ID_ATT = {
  description: 'This is the object id.',
  type: OBJECT_ID,
};

const CREATED_AT_ATT = {
  description: 'This is the date in which the object was created.',
  type: new GraphQLNonNull(DATE),
};

const UPDATED_AT_ATT = {
  description: 'This is the date in which the object was las updated.',
  type: new GraphQLNonNull(DATE),
};

const INPUT_FIELDS = {
  ACL: {
    type: ACL,
  },
};

const CREATE_RESULT_FIELDS = {
  objectId: OBJECT_ID_ATT,
  createdAt: CREATED_AT_ATT,
};

const UPDATE_RESULT_FIELDS = {
  updatedAt: UPDATED_AT_ATT,
};

const PARSE_OBJECT_FIELDS = {
  ...CREATE_RESULT_FIELDS,
  ...UPDATE_RESULT_FIELDS,
  ...INPUT_FIELDS,
  ACL: {
    type: new GraphQLNonNull(ACL),
    resolve: ({ ACL }) => (ACL ? ACL : { '*': { read: true, write: true } }),
  },
};

const PARSE_OBJECT = new GraphQLInterfaceType({
  name: 'ParseObject',
  description:
    'The ParseObject interface type is used as a base type for the auto generated object types.',
  fields: PARSE_OBJECT_FIELDS,
});

const SESSION_TOKEN_ATT = {
  description: 'The current user session token.',
  type: new GraphQLNonNull(GraphQLString),
};

const READ_PREFERENCE = new GraphQLEnumType({
  name: 'ReadPreference',
  description:
    'The ReadPreference enum type is used in queries in order to select in which database replica the operation must run.',
  values: {
    PRIMARY: { value: 'PRIMARY' },
    PRIMARY_PREFERRED: { value: 'PRIMARY_PREFERRED' },
    SECONDARY: { value: 'SECONDARY' },
    SECONDARY_PREFERRED: { value: 'SECONDARY_PREFERRED' },
    NEAREST: { value: 'NEAREST' },
  },
});

const READ_PREFERENCE_ATT = {
  description: 'The read preference for the main query to be executed.',
  type: READ_PREFERENCE,
};

const INCLUDE_READ_PREFERENCE_ATT = {
  description: 'The read preference for the queries to be executed to include fields.',
  type: READ_PREFERENCE,
};

const SUBQUERY_READ_PREFERENCE_ATT = {
  description: 'The read preference for the subqueries that may be required.',
  type: READ_PREFERENCE,
};

const READ_OPTIONS_INPUT = new GraphQLInputObjectType({
  name: 'ReadOptionsInput',
  description:
    'The ReadOptionsInputt type is used in queries in order to set the read preferences.',
  fields: {
    readPreference: READ_PREFERENCE_ATT,
    includeReadPreference: INCLUDE_READ_PREFERENCE_ATT,
    subqueryReadPreference: SUBQUERY_READ_PREFERENCE_ATT,
  },
});

const READ_OPTIONS_ATT = {
  description: 'The read options for the query to be executed.',
  type: READ_OPTIONS_INPUT,
};

const WHERE_ATT = {
  description: 'These are the conditions that the objects need to match in order to be found',
  type: OBJECT,
};

const SKIP_ATT = {
  description: 'This is the number of objects that must be skipped to return.',
  type: GraphQLInt,
};

const LIMIT_ATT = {
  description: 'This is the limit number of objects that must be returned.',
  type: GraphQLInt,
};

const COUNT_ATT = {
  description:
    'This is the total matched objecs count that is returned when the count flag is set.',
  type: new GraphQLNonNull(GraphQLInt),
};

const SEARCH_INPUT = new GraphQLInputObjectType({
  name: 'SearchInput',
  description: 'The SearchInput type is used to specifiy a search operation on a full text search.',
  fields: {
    term: {
      description: 'This is the term to be searched.',
      type: new GraphQLNonNull(GraphQLString),
    },
    language: {
      description:
        'This is the language to tetermine the list of stop words and the rules for tokenizer.',
      type: GraphQLString,
    },
    caseSensitive: {
      description: 'This is the flag to enable or disable case sensitive search.',
      type: GraphQLBoolean,
    },
    diacriticSensitive: {
      description: 'This is the flag to enable or disable diacritic sensitive search.',
      type: GraphQLBoolean,
    },
  },
});

const TEXT_INPUT = new GraphQLInputObjectType({
  name: 'TextInput',
  description: 'The TextInput type is used to specify a text operation on a constraint.',
  fields: {
    search: {
      description: 'This is the search to be executed.',
      type: new GraphQLNonNull(SEARCH_INPUT),
    },
  },
});

const BOX_INPUT = new GraphQLInputObjectType({
  name: 'BoxInput',
  description: 'The BoxInput type is used to specifiy a box operation on a within geo query.',
  fields: {
    bottomLeft: {
      description: 'This is the bottom left coordinates of the box.',
      type: new GraphQLNonNull(GEO_POINT_INPUT),
    },
    upperRight: {
      description: 'This is the upper right coordinates of the box.',
      type: new GraphQLNonNull(GEO_POINT_INPUT),
    },
  },
});

const WITHIN_INPUT = new GraphQLInputObjectType({
  name: 'WithinInput',
  description: 'The WithinInput type is used to specify a within operation on a constraint.',
  fields: {
    box: {
      description: 'This is the box to be specified.',
      type: new GraphQLNonNull(BOX_INPUT),
    },
  },
});

const CENTER_SPHERE_INPUT = new GraphQLInputObjectType({
  name: 'CenterSphereInput',
  description:
    'The CenterSphereInput type is used to specifiy a centerSphere operation on a geoWithin query.',
  fields: {
    center: {
      description: 'This is the center of the sphere.',
      type: new GraphQLNonNull(GEO_POINT_INPUT),
    },
    distance: {
      description: 'This is the radius of the sphere.',
      type: new GraphQLNonNull(GraphQLFloat),
    },
  },
});

const GEO_WITHIN_INPUT = new GraphQLInputObjectType({
  name: 'GeoWithinInput',
  description: 'The GeoWithinInput type is used to specify a geoWithin operation on a constraint.',
  fields: {
    polygon: {
      description: 'This is the polygon to be specified.',
      type: POLYGON_INPUT,
    },
    centerSphere: {
      description: 'This is the sphere to be specified.',
      type: CENTER_SPHERE_INPUT,
    },
  },
});

const GEO_INTERSECTS_INPUT = new GraphQLInputObjectType({
  name: 'GeoIntersectsInput',
  description:
    'The GeoIntersectsInput type is used to specify a geoIntersects operation on a constraint.',
  fields: {
    point: {
      description: 'This is the point to be specified.',
      type: GEO_POINT_INPUT,
    },
  },
});

const equalTo = type => ({
  description:
    'This is the equalTo operator to specify a constraint to select the objects where the value of a field equals to a specified value.',
  type,
});

const notEqualTo = type => ({
  description:
    'This is the notEqualTo operator to specify a constraint to select the objects where the value of a field do not equal to a specified value.',
  type,
});

const lessThan = type => ({
  description:
    'This is the lessThan operator to specify a constraint to select the objects where the value of a field is less than a specified value.',
  type,
});

const lessThanOrEqualTo = type => ({
  description:
    'This is the lessThanOrEqualTo operator to specify a constraint to select the objects where the value of a field is less than or equal to a specified value.',
  type,
});

const greaterThan = type => ({
  description:
    'This is the greaterThan operator to specify a constraint to select the objects where the value of a field is greater than a specified value.',
  type,
});

const greaterThanOrEqualTo = type => ({
  description:
    'This is the greaterThanOrEqualTo operator to specify a constraint to select the objects where the value of a field is greater than or equal to a specified value.',
  type,
});

const inOp = type => ({
  description:
    'This is the in operator to specify a constraint to select the objects where the value of a field equals any value in the specified array.',
  type: new GraphQLList(type),
});

const notIn = type => ({
  description:
    'This is the notIn operator to specify a constraint to select the objects where the value of a field do not equal any value in the specified array.',
  type: new GraphQLList(type),
});

const exists = {
  description:
    'This is the exists operator to specify a constraint to select the objects where a field exists (or do not exist).',
  type: GraphQLBoolean,
};

const matchesRegex = {
  description:
    'This is the matchesRegex operator to specify a constraint to select the objects where the value of a field matches a specified regular expression.',
  type: GraphQLString,
};

const options = {
  description:
    'This is the options operator to specify optional flags (such as "i" and "m") to be added to a matchesRegex operation in the same set of constraints.',
  type: GraphQLString,
};

const SUBQUERY_INPUT = new GraphQLInputObjectType({
  name: 'SubqueryInput',
  description: 'The SubqueryInput type is used to specify a sub query to another class.',
  fields: {
    className: CLASS_NAME_ATT,
    where: Object.assign({}, WHERE_ATT, {
      type: new GraphQLNonNull(WHERE_ATT.type),
    }),
  },
});

const SELECT_INPUT = new GraphQLInputObjectType({
  name: 'SelectInput',
  description:
    'The SelectInput type is used to specify an inQueryKey or a notInQueryKey operation on a constraint.',
  fields: {
    query: {
      description: 'This is the subquery to be executed.',
      type: new GraphQLNonNull(SUBQUERY_INPUT),
    },
    key: {
      description:
        'This is the key in the result of the subquery that must match (not match) the field.',
      type: new GraphQLNonNull(GraphQLString),
    },
  },
});

const inQueryKey = {
  description:
    'This is the inQueryKey operator to specify a constraint to select the objects where a field equals to a key in the result of a different query.',
  type: SELECT_INPUT,
};

const notInQueryKey = {
  description:
    'This is the notInQueryKey operator to specify a constraint to select the objects where a field do not equal to a key in the result of a different query.',
  type: SELECT_INPUT,
};

const ID_WHERE_INPUT = new GraphQLInputObjectType({
  name: 'IdWhereInput',
  description:
    'The IdWhereInput input type is used in operations that involve filtering objects by an id.',
  fields: {
    equalTo: equalTo(GraphQLID),
    notEqualTo: notEqualTo(GraphQLID),
    lessThan: lessThan(GraphQLID),
    lessThanOrEqualTo: lessThanOrEqualTo(GraphQLID),
    greaterThan: greaterThan(GraphQLID),
    greaterThanOrEqualTo: greaterThanOrEqualTo(GraphQLID),
    in: inOp(GraphQLID),
    notIn: notIn(GraphQLID),
    exists,
    inQueryKey,
    notInQueryKey,
  },
});

const STRING_WHERE_INPUT = new GraphQLInputObjectType({
  name: 'StringWhereInput',
  description:
    'The StringWhereInput input type is used in operations that involve filtering objects by a field of type String.',
  fields: {
    equalTo: equalTo(GraphQLString),
    notEqualTo: notEqualTo(GraphQLString),
    lessThan: lessThan(GraphQLString),
    lessThanOrEqualTo: lessThanOrEqualTo(GraphQLString),
    greaterThan: greaterThan(GraphQLString),
    greaterThanOrEqualTo: greaterThanOrEqualTo(GraphQLString),
    in: inOp(GraphQLString),
    notIn: notIn(GraphQLString),
    exists,
    matchesRegex,
    options,
    text: {
      description: 'This is the $text operator to specify a full text search constraint.',
      type: TEXT_INPUT,
    },
    inQueryKey,
    notInQueryKey,
  },
});

const NUMBER_WHERE_INPUT = new GraphQLInputObjectType({
  name: 'NumberWhereInput',
  description:
    'The NumberWhereInput input type is used in operations that involve filtering objects by a field of type Number.',
  fields: {
    equalTo: equalTo(GraphQLFloat),
    notEqualTo: notEqualTo(GraphQLFloat),
    lessThan: lessThan(GraphQLFloat),
    lessThanOrEqualTo: lessThanOrEqualTo(GraphQLFloat),
    greaterThan: greaterThan(GraphQLFloat),
    greaterThanOrEqualTo: greaterThanOrEqualTo(GraphQLFloat),
    in: inOp(GraphQLFloat),
    notIn: notIn(GraphQLFloat),
    exists,
    inQueryKey,
    notInQueryKey,
  },
});

const BOOLEAN_WHERE_INPUT = new GraphQLInputObjectType({
  name: 'BooleanWhereInput',
  description:
    'The BooleanWhereInput input type is used in operations that involve filtering objects by a field of type Boolean.',
  fields: {
    equalTo: equalTo(GraphQLBoolean),
    notEqualTo: notEqualTo(GraphQLBoolean),
    exists,
    inQueryKey,
    notInQueryKey,
  },
});

const ARRAY_WHERE_INPUT = new GraphQLInputObjectType({
  name: 'ArrayWhereInput',
  description:
    'The ArrayWhereInput input type is used in operations that involve filtering objects by a field of type Array.',
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
      description:
        'This is the containedBy operator to specify a constraint to select the objects where the values of an array field is contained by another specified array.',
      type: new GraphQLList(ANY),
    },
    contains: {
      description:
        'This is the contains operator to specify a constraint to select the objects where the values of an array field contain all elements of another specified array.',
      type: new GraphQLList(ANY),
    },
    inQueryKey,
    notInQueryKey,
  },
});

const KEY_VALUE_INPUT = new GraphQLInputObjectType({
  name: 'KeyValueInput',
  description: 'An entry from an object, i.e., a pair of key and value.',
  fields: {
    key: {
      description: 'The key used to retrieve the value of this entry.',
      type: new GraphQLNonNull(GraphQLString),
    },
    value: {
      description: 'The value of the entry. Could be any type of scalar data.',
      type: new GraphQLNonNull(ANY),
    },
  },
});

const OBJECT_WHERE_INPUT = new GraphQLInputObjectType({
  name: 'ObjectWhereInput',
  description:
    'The ObjectWhereInput input type is used in operations that involve filtering result by a field of type Object.',
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
    notInQueryKey,
  },
});

const DATE_WHERE_INPUT = new GraphQLInputObjectType({
  name: 'DateWhereInput',
  description:
    'The DateWhereInput input type is used in operations that involve filtering objects by a field of type Date.',
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
    notInQueryKey,
  },
});

const BYTES_WHERE_INPUT = new GraphQLInputObjectType({
  name: 'BytesWhereInput',
  description:
    'The BytesWhereInput input type is used in operations that involve filtering objects by a field of type Bytes.',
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
    notInQueryKey,
  },
});

const FILE_WHERE_INPUT = new GraphQLInputObjectType({
  name: 'FileWhereInput',
  description:
    'The FileWhereInput input type is used in operations that involve filtering objects by a field of type File.',
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
    notInQueryKey,
  },
});

const GEO_POINT_WHERE_INPUT = new GraphQLInputObjectType({
  name: 'GeoPointWhereInput',
  description:
    'The GeoPointWhereInput input type is used in operations that involve filtering objects by a field of type GeoPoint.',
  fields: {
    exists,
    nearSphere: {
      description:
        'This is the nearSphere operator to specify a constraint to select the objects where the values of a geo point field is near to another geo point.',
      type: GEO_POINT_INPUT,
    },
    maxDistance: {
      description:
        'This is the maxDistance operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in radians) from the geo point specified in the $nearSphere operator.',
      type: GraphQLFloat,
    },
    maxDistanceInRadians: {
      description:
        'This is the maxDistanceInRadians operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in radians) from the geo point specified in the $nearSphere operator.',
      type: GraphQLFloat,
    },
    maxDistanceInMiles: {
      description:
        'This is the maxDistanceInMiles operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in miles) from the geo point specified in the $nearSphere operator.',
      type: GraphQLFloat,
    },
    maxDistanceInKilometers: {
      description:
        'This is the maxDistanceInKilometers operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in kilometers) from the geo point specified in the $nearSphere operator.',
      type: GraphQLFloat,
    },
    within: {
      description:
        'This is the within operator to specify a constraint to select the objects where the values of a geo point field is within a specified box.',
      type: WITHIN_INPUT,
    },
    geoWithin: {
      description:
        'This is the geoWithin operator to specify a constraint to select the objects where the values of a geo point field is within a specified polygon or sphere.',
      type: GEO_WITHIN_INPUT,
    },
  },
});

const POLYGON_WHERE_INPUT = new GraphQLInputObjectType({
  name: 'PolygonWhereInput',
  description:
    'The PolygonWhereInput input type is used in operations that involve filtering objects by a field of type Polygon.',
  fields: {
    exists,
    geoIntersects: {
      description:
        'This is the geoIntersects operator to specify a constraint to select the objects where the values of a polygon field intersect a specified point.',
      type: GEO_INTERSECTS_INPUT,
    },
  },
});

const ELEMENT = new GraphQLObjectType({
  name: 'Element',
  description: "The Element object type is used to return array items' value.",
  fields: {
    value: {
      description: 'Return the value of the element in the array',
      type: new GraphQLNonNull(ANY),
    },
  },
});

// Default static union type, we update types and resolveType function later
let ARRAY_RESULT;

const loadArrayResult = (parseGraphQLSchema, parseClasses) => {
  const classTypes = parseClasses
    .filter(parseClass =>
      parseGraphQLSchema.parseClassTypes[parseClass.className].classGraphQLOutputType ? true : false
    )
    .map(
      parseClass => parseGraphQLSchema.parseClassTypes[parseClass.className].classGraphQLOutputType
    );
  ARRAY_RESULT = new GraphQLUnionType({
    name: 'ArrayResult',
    description:
      'Use Inline Fragment on Array to get results: https://graphql.org/learn/queries/#inline-fragments',
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
    },
  });
  parseGraphQLSchema.graphQLTypes.push(ARRAY_RESULT);
};

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

export {
  TypeValidationError,
  parseStringValue,
  parseIntValue,
  parseFloatValue,
  parseBooleanValue,
  parseValue,
  parseListValues,
  parseObjectFields,
  ANY,
  OBJECT,
  parseDateIsoValue,
  serializeDateIso,
  DATE,
  BYTES,
  parseFileValue,
  SUBQUERY_INPUT,
  SELECT_INPUT,
  FILE,
  FILE_INFO,
  FILE_INPUT,
  GEO_POINT_FIELDS,
  GEO_POINT_INPUT,
  GEO_POINT,
  POLYGON_INPUT,
  POLYGON,
  OBJECT_ID,
  CLASS_NAME_ATT,
  GLOBAL_OR_OBJECT_ID_ATT,
  OBJECT_ID_ATT,
  UPDATED_AT_ATT,
  CREATED_AT_ATT,
  INPUT_FIELDS,
  CREATE_RESULT_FIELDS,
  UPDATE_RESULT_FIELDS,
  PARSE_OBJECT_FIELDS,
  PARSE_OBJECT,
  SESSION_TOKEN_ATT,
  READ_PREFERENCE,
  READ_PREFERENCE_ATT,
  INCLUDE_READ_PREFERENCE_ATT,
  SUBQUERY_READ_PREFERENCE_ATT,
  READ_OPTIONS_INPUT,
  READ_OPTIONS_ATT,
  WHERE_ATT,
  SKIP_ATT,
  LIMIT_ATT,
  COUNT_ATT,
  SEARCH_INPUT,
  TEXT_INPUT,
  BOX_INPUT,
  WITHIN_INPUT,
  CENTER_SPHERE_INPUT,
  GEO_WITHIN_INPUT,
  GEO_INTERSECTS_INPUT,
  equalTo,
  notEqualTo,
  lessThan,
  lessThanOrEqualTo,
  greaterThan,
  greaterThanOrEqualTo,
  inOp,
  notIn,
  exists,
  matchesRegex,
  options,
  inQueryKey,
  notInQueryKey,
  ID_WHERE_INPUT,
  STRING_WHERE_INPUT,
  NUMBER_WHERE_INPUT,
  BOOLEAN_WHERE_INPUT,
  ARRAY_WHERE_INPUT,
  KEY_VALUE_INPUT,
  OBJECT_WHERE_INPUT,
  DATE_WHERE_INPUT,
  BYTES_WHERE_INPUT,
  FILE_WHERE_INPUT,
  GEO_POINT_WHERE_INPUT,
  POLYGON_WHERE_INPUT,
  ARRAY_RESULT,
  ELEMENT,
  ACL_INPUT,
  USER_ACL_INPUT,
  ROLE_ACL_INPUT,
  PUBLIC_ACL_INPUT,
  ACL,
  USER_ACL,
  ROLE_ACL,
  PUBLIC_ACL,
  load,
  loadArrayResult,
};
