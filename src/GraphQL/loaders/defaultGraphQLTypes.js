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
import { GraphQLUpload } from 'graphql-upload';

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
  description:
    'The Object scalar type is used in operations and types that involve objects.',
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
    return value.toUTCString();
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
  description:
    'The Date scalar type is used in operations and types that involve dates.',
  parseValue(value) {
    if (typeof value === 'string' || value instanceof Date) {
      return {
        __type: 'Date',
        iso: parseDateIsoValue(value),
      };
    } else if (
      typeof value === 'object' &&
      value.__type === 'Date' &&
      value.iso
    ) {
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
    } else if (
      typeof value === 'object' &&
      value.__type === 'Date' &&
      value.iso
    ) {
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
  description:
    'The File scalar type is used in operations and types that involve files.',
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
  description:
    'The FileInfo object type is used to return the information about files.',
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
  description:
    'The GeoPoint object type is used to return the information about geo point fields.',
  fields: GEO_POINT_FIELDS,
});

const POLYGON_INPUT = new GraphQLList(new GraphQLNonNull(GEO_POINT_INPUT));

const POLYGON = new GraphQLList(new GraphQLNonNull(GEO_POINT));

const RELATION_INPUT = new GraphQLInputObjectType({
  name: 'RelationInput',
  description: 'Object involved into a relation',
  fields: {
    objectId: {
      description: 'Id of the object involved.',
      type: new GraphQLNonNull(GraphQLID),
    },
  },
});

const CLASS_NAME_ATT = {
  description: 'This is the class name of the object.',
  type: new GraphQLNonNull(GraphQLString),
};

const FIELDS_ATT = {
  description: 'These are the fields of the object.',
  type: OBJECT,
};

const OBJECT_ID_ATT = {
  description: 'This is the object id.',
  type: new GraphQLNonNull(GraphQLID),
};

const CREATED_AT_ATT = {
  description: 'This is the date in which the object was created.',
  type: new GraphQLNonNull(DATE),
};

const UPDATED_AT_ATT = {
  description: 'This is the date in which the object was las updated.',
  type: new GraphQLNonNull(DATE),
};

const ACL_ATT = {
  description: 'This is the access control list of the object.',
  type: OBJECT,
};

const INPUT_FIELDS = {
  ACL: ACL_ATT,
};

const CREATE_RESULT_FIELDS = {
  objectId: OBJECT_ID_ATT,
  createdAt: CREATED_AT_ATT,
};

const CREATE_RESULT = new GraphQLObjectType({
  name: 'CreateResult',
  description:
    'The CreateResult object type is used in the create mutations to return the data of the recent created object.',
  fields: CREATE_RESULT_FIELDS,
});

const UPDATE_RESULT_FIELDS = {
  updatedAt: UPDATED_AT_ATT,
};

const UPDATE_RESULT = new GraphQLObjectType({
  name: 'UpdateResult',
  description:
    'The UpdateResult object type is used in the update mutations to return the data of the recent updated object.',
  fields: UPDATE_RESULT_FIELDS,
});

const CLASS_FIELDS = {
  ...CREATE_RESULT_FIELDS,
  ...UPDATE_RESULT_FIELDS,
  ...INPUT_FIELDS,
};

const CLASS = new GraphQLInterfaceType({
  name: 'Class',
  description:
    'The Class interface type is used as a base type for the auto generated class types.',
  fields: CLASS_FIELDS,
});

const SESSION_TOKEN_ATT = {
  description: 'The user session token',
  type: new GraphQLNonNull(GraphQLString),
};

const KEYS_ATT = {
  description: 'The keys of the objects that will be returned.',
  type: GraphQLString,
};

const INCLUDE_ATT = {
  description: 'The pointers of the objects that will be returned.',
  type: GraphQLString,
};

const POINTER_INPUT = new GraphQLInputObjectType({
  name: 'PointerInput',
  description: 'Allow to link an object to another object',
  fields: {
    objectId: {
      description: 'Id of the object involved.',
      type: new GraphQLNonNull(GraphQLID),
    },
  },
});

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
  description:
    'The read preference for the queries to be executed to include fields.',
  type: READ_PREFERENCE,
};

const SUBQUERY_READ_PREFERENCE_ATT = {
  description: 'The read preference for the subqueries that may be required.',
  type: READ_PREFERENCE,
};

const WHERE_ATT = {
  description:
    'These are the conditions that the objects need to match in order to be found',
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

const SUBQUERY_INPUT = new GraphQLInputObjectType({
  name: 'SubqueryInput',
  description:
    'The SubqueryInput type is used to specific a different query to a different class.',
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
    'The SelectInput type is used to specify a $select operation on a constraint.',
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

const SEARCH_INPUT = new GraphQLInputObjectType({
  name: 'SearchInput',
  description:
    'The SearchInput type is used to specifiy a $search operation on a full text search.',
  fields: {
    _term: {
      description: 'This is the term to be searched.',
      type: new GraphQLNonNull(GraphQLString),
    },
    _language: {
      description:
        'This is the language to tetermine the list of stop words and the rules for tokenizer.',
      type: GraphQLString,
    },
    _caseSensitive: {
      description:
        'This is the flag to enable or disable case sensitive search.',
      type: GraphQLBoolean,
    },
    _diacriticSensitive: {
      description:
        'This is the flag to enable or disable diacritic sensitive search.',
      type: GraphQLBoolean,
    },
  },
});

const TEXT_INPUT = new GraphQLInputObjectType({
  name: 'TextInput',
  description:
    'The TextInput type is used to specify a $text operation on a constraint.',
  fields: {
    _search: {
      description: 'This is the search to be executed.',
      type: new GraphQLNonNull(SEARCH_INPUT),
    },
  },
});

const BOX_INPUT = new GraphQLInputObjectType({
  name: 'BoxInput',
  description:
    'The BoxInput type is used to specifiy a $box operation on a within geo query.',
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
  description:
    'The WithinInput type is used to specify a $within operation on a constraint.',
  fields: {
    _box: {
      description: 'This is the box to be specified.',
      type: new GraphQLNonNull(BOX_INPUT),
    },
  },
});

const CENTER_SPHERE_INPUT = new GraphQLInputObjectType({
  name: 'CenterSphereInput',
  description:
    'The CenterSphereInput type is used to specifiy a $centerSphere operation on a geoWithin query.',
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
  description:
    'The GeoWithinInput type is used to specify a $geoWithin operation on a constraint.',
  fields: {
    _polygon: {
      description: 'This is the polygon to be specified.',
      type: POLYGON_INPUT,
    },
    _centerSphere: {
      description: 'This is the sphere to be specified.',
      type: CENTER_SPHERE_INPUT,
    },
  },
});

const GEO_INTERSECTS_INPUT = new GraphQLInputObjectType({
  name: 'GeoIntersectsInput',
  description:
    'The GeoIntersectsInput type is used to specify a $geoIntersects operation on a constraint.',
  fields: {
    _point: {
      description: 'This is the point to be specified.',
      type: GEO_POINT_INPUT,
    },
  },
});

const _eq = type => ({
  description:
    'This is the $eq operator to specify a constraint to select the objects where the value of a field equals to a specified value.',
  type,
});

const _ne = type => ({
  description:
    'This is the $ne operator to specify a constraint to select the objects where the value of a field do not equal to a specified value.',
  type,
});

const _lt = type => ({
  description:
    'This is the $lt operator to specify a constraint to select the objects where the value of a field is less than a specified value.',
  type,
});

const _lte = type => ({
  description:
    'This is the $lte operator to specify a constraint to select the objects where the value of a field is less than or equal to a specified value.',
  type,
});

const _gt = type => ({
  description:
    'This is the $gt operator to specify a constraint to select the objects where the value of a field is greater than a specified value.',
  type,
});

const _gte = type => ({
  description:
    'This is the $gte operator to specify a constraint to select the objects where the value of a field is greater than or equal to a specified value.',
  type,
});

const _in = type => ({
  description:
    'This is the $in operator to specify a constraint to select the objects where the value of a field equals any value in the specified array.',
  type: new GraphQLList(type),
});

const _nin = type => ({
  description:
    'This is the $nin operator to specify a constraint to select the objects where the value of a field do not equal any value in the specified array.',
  type: new GraphQLList(type),
});

const _exists = {
  description:
    'This is the $exists operator to specify a constraint to select the objects where a field exists (or do not exist).',
  type: GraphQLBoolean,
};

const _select = {
  description:
    'This is the $select operator to specify a constraint to select the objects where a field equals to a key in the result of a different query.',
  type: SELECT_INPUT,
};

const _dontSelect = {
  description:
    'This is the $dontSelect operator to specify a constraint to select the objects where a field do not equal to a key in the result of a different query.',
  type: SELECT_INPUT,
};

const _regex = {
  description:
    'This is the $regex operator to specify a constraint to select the objects where the value of a field matches a specified regular expression.',
  type: GraphQLString,
};

const _options = {
  description:
    'This is the $options operator to specify optional flags (such as "i" and "m") to be added to a $regex operation in the same set of constraints.',
  type: GraphQLString,
};

const STRING_WHERE_INPUT = new GraphQLInputObjectType({
  name: 'StringWhereInput',
  description:
    'The StringWhereInput input type is used in operations that involve filtering objects by a field of type String.',
  fields: {
    _eq: _eq(GraphQLString),
    _ne: _ne(GraphQLString),
    _lt: _lt(GraphQLString),
    _lte: _lte(GraphQLString),
    _gt: _gt(GraphQLString),
    _gte: _gte(GraphQLString),
    _in: _in(GraphQLString),
    _nin: _nin(GraphQLString),
    _exists,
    _select,
    _dontSelect,
    _regex,
    _options,
    _text: {
      description:
        'This is the $text operator to specify a full text search constraint.',
      type: TEXT_INPUT,
    },
  },
});

const NUMBER_WHERE_INPUT = new GraphQLInputObjectType({
  name: 'NumberWhereInput',
  description:
    'The NumberWhereInput input type is used in operations that involve filtering objects by a field of type Number.',
  fields: {
    _eq: _eq(GraphQLFloat),
    _ne: _ne(GraphQLFloat),
    _lt: _lt(GraphQLFloat),
    _lte: _lte(GraphQLFloat),
    _gt: _gt(GraphQLFloat),
    _gte: _gte(GraphQLFloat),
    _in: _in(GraphQLFloat),
    _nin: _nin(GraphQLFloat),
    _exists,
    _select,
    _dontSelect,
  },
});

const BOOLEAN_WHERE_INPUT = new GraphQLInputObjectType({
  name: 'BooleanWhereInput',
  description:
    'The BooleanWhereInput input type is used in operations that involve filtering objects by a field of type Boolean.',
  fields: {
    _eq: _eq(GraphQLBoolean),
    _ne: _ne(GraphQLBoolean),
    _exists,
    _select,
    _dontSelect,
  },
});

const ARRAY_WHERE_INPUT = new GraphQLInputObjectType({
  name: 'ArrayWhereInput',
  description:
    'The ArrayWhereInput input type is used in operations that involve filtering objects by a field of type Array.',
  fields: {
    _eq: _eq(ANY),
    _ne: _ne(ANY),
    _lt: _lt(ANY),
    _lte: _lte(ANY),
    _gt: _gt(ANY),
    _gte: _gte(ANY),
    _in: _in(ANY),
    _nin: _nin(ANY),
    _exists,
    _select,
    _dontSelect,
    _containedBy: {
      description:
        'This is the $containedBy operator to specify a constraint to select the objects where the values of an array field is contained by another specified array.',
      type: new GraphQLList(ANY),
    },
    _all: {
      description:
        'This is the $all operator to specify a constraint to select the objects where the values of an array field contain all elements of another specified array.',
      type: new GraphQLList(ANY),
    },
  },
});

const KEY_VALUE_INPUT = new GraphQLInputObjectType({
  name: 'KeyValueInput',
  description: 'An entry from an object, i.e., a pair of key and value.',
  fields: {
    _key: {
      description: 'The key used to retrieve the value of this entry.',
      type: new GraphQLNonNull(GraphQLString),
    },
    _value: {
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
    _eq: _eq(KEY_VALUE_INPUT),
    _ne: _ne(KEY_VALUE_INPUT),
    _in: _in(KEY_VALUE_INPUT),
    _nin: _nin(KEY_VALUE_INPUT),
    _lt: _lt(KEY_VALUE_INPUT),
    _lte: _lte(KEY_VALUE_INPUT),
    _gt: _gt(KEY_VALUE_INPUT),
    _gte: _gte(KEY_VALUE_INPUT),
    _exists,
    _select,
    _dontSelect,
  },
});

const DATE_WHERE_INPUT = new GraphQLInputObjectType({
  name: 'DateWhereInput',
  description:
    'The DateWhereInput input type is used in operations that involve filtering objects by a field of type Date.',
  fields: {
    _eq: _eq(DATE),
    _ne: _ne(DATE),
    _lt: _lt(DATE),
    _lte: _lte(DATE),
    _gt: _gt(DATE),
    _gte: _gte(DATE),
    _in: _in(DATE),
    _nin: _nin(DATE),
    _exists,
    _select,
    _dontSelect,
  },
});

const BYTES_WHERE_INPUT = new GraphQLInputObjectType({
  name: 'BytesWhereInput',
  description:
    'The BytesWhereInput input type is used in operations that involve filtering objects by a field of type Bytes.',
  fields: {
    _eq: _eq(BYTES),
    _ne: _ne(BYTES),
    _lt: _lt(BYTES),
    _lte: _lte(BYTES),
    _gt: _gt(BYTES),
    _gte: _gte(BYTES),
    _in: _in(BYTES),
    _nin: _nin(BYTES),
    _exists,
    _select,
    _dontSelect,
  },
});

const FILE_WHERE_INPUT = new GraphQLInputObjectType({
  name: 'FileWhereInput',
  description:
    'The FileWhereInput input type is used in operations that involve filtering objects by a field of type File.',
  fields: {
    _eq: _eq(FILE),
    _ne: _ne(FILE),
    _lt: _lt(FILE),
    _lte: _lte(FILE),
    _gt: _gt(FILE),
    _gte: _gte(FILE),
    _in: _in(FILE),
    _nin: _nin(FILE),
    _exists,
    _select,
    _dontSelect,
    _regex,
    _options,
  },
});

const GEO_POINT_WHERE_INPUT = new GraphQLInputObjectType({
  name: 'GeoPointWhereInput',
  description:
    'The GeoPointWhereInput input type is used in operations that involve filtering objects by a field of type GeoPoint.',
  fields: {
    _exists,
    _nearSphere: {
      description:
        'This is the $nearSphere operator to specify a constraint to select the objects where the values of a geo point field is near to another geo point.',
      type: GEO_POINT_INPUT,
    },
    _maxDistance: {
      description:
        'This is the $maxDistance operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in radians) from the geo point specified in the $nearSphere operator.',
      type: GraphQLFloat,
    },
    _maxDistanceInRadians: {
      description:
        'This is the $maxDistanceInRadians operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in radians) from the geo point specified in the $nearSphere operator.',
      type: GraphQLFloat,
    },
    _maxDistanceInMiles: {
      description:
        'This is the $maxDistanceInMiles operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in miles) from the geo point specified in the $nearSphere operator.',
      type: GraphQLFloat,
    },
    _maxDistanceInKilometers: {
      description:
        'This is the $maxDistanceInKilometers operator to specify a constraint to select the objects where the values of a geo point field is at a max distance (in kilometers) from the geo point specified in the $nearSphere operator.',
      type: GraphQLFloat,
    },
    _within: {
      description:
        'This is the $within operator to specify a constraint to select the objects where the values of a geo point field is within a specified box.',
      type: WITHIN_INPUT,
    },
    _geoWithin: {
      description:
        'This is the $geoWithin operator to specify a constraint to select the objects where the values of a geo point field is within a specified polygon or sphere.',
      type: GEO_WITHIN_INPUT,
    },
  },
});

const POLYGON_WHERE_INPUT = new GraphQLInputObjectType({
  name: 'PolygonWhereInput',
  description:
    'The PolygonWhereInput input type is used in operations that involve filtering objects by a field of type Polygon.',
  fields: {
    _exists,
    _geoIntersects: {
      description:
        'This is the $geoIntersects operator to specify a constraint to select the objects where the values of a polygon field intersect a specified point.',
      type: GEO_INTERSECTS_INPUT,
    },
  },
});

const FIND_RESULT = new GraphQLObjectType({
  name: 'FindResult',
  description:
    'The FindResult object type is used in the find queries to return the data of the matched objects.',
  fields: {
    results: {
      description: 'This is the objects returned by the query',
      type: new GraphQLNonNull(new GraphQLList(new GraphQLNonNull(OBJECT))),
    },
    count: COUNT_ATT,
  },
});

const SIGN_UP_RESULT = new GraphQLObjectType({
  name: 'SignUpResult',
  description:
    'The SignUpResult object type is used in the users sign up mutation to return the data of the recent created user.',
  fields: {
    ...CREATE_RESULT_FIELDS,
    sessionToken: SESSION_TOKEN_ATT,
  },
});

const ELEMENT = new GraphQLObjectType({
  name: 'Element',
  description:
    'The SignUpResult object type is used in the users sign up mutation to return the data of the recent created user.',
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
      parseGraphQLSchema.parseClassTypes[parseClass.className]
        .classGraphQLOutputType
        ? true
        : false
    )
    .map(
      parseClass =>
        parseGraphQLSchema.parseClassTypes[parseClass.className]
          .classGraphQLOutputType
    );
  ARRAY_RESULT = new GraphQLUnionType({
    name: 'ArrayResult',
    description:
      'Use Inline Fragment on Array to get results: https://graphql.org/learn/queries/#inline-fragments',
    types: () => [ELEMENT, ...classTypes],
    resolveType: value => {
      if (value.__type === 'Object' && value.className && value.objectId) {
        if (parseGraphQLSchema.parseClassTypes[value.className]) {
          return parseGraphQLSchema.parseClassTypes[value.className]
            .classGraphQLOutputType;
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
  parseGraphQLSchema.addGraphQLType(GEO_POINT_INPUT, true);
  parseGraphQLSchema.addGraphQLType(GEO_POINT, true);
  parseGraphQLSchema.addGraphQLType(CREATE_RESULT, true);
  parseGraphQLSchema.addGraphQLType(UPDATE_RESULT, true);
  parseGraphQLSchema.addGraphQLType(CLASS, true);
  parseGraphQLSchema.addGraphQLType(READ_PREFERENCE, true);
  parseGraphQLSchema.addGraphQLType(SUBQUERY_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SELECT_INPUT, true);
  parseGraphQLSchema.addGraphQLType(SEARCH_INPUT, true);
  parseGraphQLSchema.addGraphQLType(TEXT_INPUT, true);
  parseGraphQLSchema.addGraphQLType(BOX_INPUT, true);
  parseGraphQLSchema.addGraphQLType(WITHIN_INPUT, true);
  parseGraphQLSchema.addGraphQLType(CENTER_SPHERE_INPUT, true);
  parseGraphQLSchema.addGraphQLType(GEO_WITHIN_INPUT, true);
  parseGraphQLSchema.addGraphQLType(GEO_INTERSECTS_INPUT, true);
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
  parseGraphQLSchema.addGraphQLType(FIND_RESULT, true);
  parseGraphQLSchema.addGraphQLType(SIGN_UP_RESULT, true);
  parseGraphQLSchema.addGraphQLType(ELEMENT, true);
  parseGraphQLSchema.addGraphQLType(RELATION_INPUT, true);
  parseGraphQLSchema.addGraphQLType(POINTER_INPUT, true);
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
  FILE,
  FILE_INFO,
  GEO_POINT_FIELDS,
  GEO_POINT_INPUT,
  GEO_POINT,
  POLYGON_INPUT,
  POLYGON,
  CLASS_NAME_ATT,
  FIELDS_ATT,
  OBJECT_ID_ATT,
  UPDATED_AT_ATT,
  CREATED_AT_ATT,
  ACL_ATT,
  INPUT_FIELDS,
  CREATE_RESULT_FIELDS,
  CREATE_RESULT,
  UPDATE_RESULT_FIELDS,
  UPDATE_RESULT,
  CLASS_FIELDS,
  CLASS,
  SESSION_TOKEN_ATT,
  KEYS_ATT,
  INCLUDE_ATT,
  READ_PREFERENCE,
  READ_PREFERENCE_ATT,
  INCLUDE_READ_PREFERENCE_ATT,
  SUBQUERY_READ_PREFERENCE_ATT,
  WHERE_ATT,
  SKIP_ATT,
  LIMIT_ATT,
  COUNT_ATT,
  SUBQUERY_INPUT,
  SELECT_INPUT,
  SEARCH_INPUT,
  TEXT_INPUT,
  BOX_INPUT,
  WITHIN_INPUT,
  CENTER_SPHERE_INPUT,
  GEO_WITHIN_INPUT,
  GEO_INTERSECTS_INPUT,
  _eq,
  _ne,
  _lt,
  _lte,
  _gt,
  _gte,
  _in,
  _nin,
  _exists,
  _select,
  _dontSelect,
  _regex,
  _options,
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
  FIND_RESULT,
  SIGN_UP_RESULT,
  ARRAY_RESULT,
  ELEMENT,
  POINTER_INPUT,
  RELATION_INPUT,
  load,
  loadArrayResult,
};
