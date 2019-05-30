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
  GraphQLList,
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

const parseDateValue = value => {
  if (typeof value === 'string') {
    const date = new Date(value);
    if (!isNaN(date)) {
      return date;
    }
  }

  throw new TypeValidationError(value, 'Date');
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

const DATE = new GraphQLScalarType({
  name: 'Date',
  description:
    'The Date scalar type is used in operations and types that involve dates.',
  parseValue: parseDateValue,
  serialize(value) {
    if (typeof value === 'string') {
      return value;
    }
    if (value instanceof Date) {
      return value.toUTCString();
    }

    throw new TypeValidationError(value, 'Date');
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return parseDateValue(ast.value);
    }

    throw new TypeValidationError(ast.kind, 'Date');
  },
});

const FILE = new GraphQLObjectType({
  name: 'File',
  description:
    'The File object type is used in operations and types that have fields involving files.',
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

const KEYS_ATT = {
  description: 'The keys of the objects that will be returned',
  type: GraphQLString,
};

const INCLUDE_ATT = {
  description: 'The pointers of the objects that will be returned',
  type: GraphQLString,
};

const READ_PREFERENCE = new GraphQLEnumType({
  name: 'ReadPreference',
  description:
    'The ReadPreference enum type is used in queries in order to select in which database replica the operation must run',
  values: {
    PRIMARY: { value: 'PRIMARY' },
    PRIMARY_PREFERRED: { value: 'PRIMARY_PREFERRED' },
    SECONDARY: { value: 'SECONDARY' },
    SECONDARY_PREFERRED: { value: 'SECONDARY_PREFERRED' },
    NEAREST: { value: 'NEAREST' },
  },
});

const READ_PREFERENCE_ATT = {
  description: 'The read preference for the main query to be executed',
  type: READ_PREFERENCE,
};

const INCLUDE_READ_PREFERENCE_ATT = {
  description:
    'The read preference for the queries to be executed to include fields',
  type: READ_PREFERENCE,
};

const SUBQUERY_READ_PREFERENCE_ATT = {
  description: 'The read preference for the subqueries that may be required',
  type: READ_PREFERENCE,
};

const SKIP_ATT = {
  description: 'This is the number of objects that must be skipped to return',
  type: GraphQLInt,
};

const LIMIT_ATT = {
  description: 'This is the limit number of objects that must be returned',
  type: GraphQLInt,
};

const COUNT_ATT = {
  description:
    'This is the total matched objecs count that is returned when the count flag is set',
  type: new GraphQLNonNull(GraphQLInt),
};

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

const load = parseGraphQLSchema => {
  parseGraphQLSchema.graphQLTypes.push(GraphQLUpload);
  parseGraphQLSchema.graphQLTypes.push(OBJECT);
  parseGraphQLSchema.graphQLTypes.push(DATE);
  parseGraphQLSchema.graphQLTypes.push(FILE);
  parseGraphQLSchema.graphQLTypes.push(CREATE_RESULT);
  parseGraphQLSchema.graphQLTypes.push(UPDATE_RESULT);
  parseGraphQLSchema.graphQLTypes.push(CLASS);
  parseGraphQLSchema.graphQLTypes.push(READ_PREFERENCE);
  parseGraphQLSchema.graphQLTypes.push(FIND_RESULT);
};

export {
  TypeValidationError,
  parseStringValue,
  parseIntValue,
  parseFloatValue,
  parseBooleanValue,
  parseDateValue,
  parseValue,
  parseListValues,
  parseObjectFields,
  OBJECT,
  DATE,
  FILE,
  CLASS_NAME_ATT,
  FIELDS_ATT,
  OBJECT_ID_ATT,
  CREATED_AT_ATT,
  UPDATED_AT_ATT,
  ACL_ATT,
  INPUT_FIELDS,
  CREATE_RESULT_FIELDS,
  CREATE_RESULT,
  UPDATE_RESULT_FIELDS,
  UPDATE_RESULT,
  CLASS_FIELDS,
  CLASS,
  KEYS_ATT,
  INCLUDE_ATT,
  READ_PREFERENCE,
  READ_PREFERENCE_ATT,
  INCLUDE_READ_PREFERENCE_ATT,
  SUBQUERY_READ_PREFERENCE_ATT,
  SKIP_ATT,
  LIMIT_ATT,
  COUNT_ATT,
  FIND_RESULT,
  load,
};
