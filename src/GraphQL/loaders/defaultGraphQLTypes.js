import {
  Kind,
  GraphQLNonNull,
  GraphQLScalarType,
  GraphQLID,
  GraphQLString,
  GraphQLObjectType,
  GraphQLInterfaceType,
} from 'graphql';

class TypeValidationError extends Error {
  constructor(value, type) {
    super(`${value} is not a valid ${type}`);
  }
}

const parseObject = value => {
  if (typeof value === 'object') {
    return value;
  }
  throw new TypeValidationError(value, 'Object');
};

const OBJECT = new GraphQLScalarType({
  name: 'Object',
  description:
    'The Object scalar type is used in operations and types that involve objects.',
  parseValue: parseObject,
  serialize: parseObject,
  parseLiteral(ast) {
    if (ast.kind === Kind.OBJECT) {
      return ast.fields.reduce(
        (fields, field) => ({
          ...fields,
          [field.name.value]: field.value.value,
        }),
        {}
      );
    }
    throw new TypeValidationError(ast.kind, 'Object');
  },
});

const parseDate = value => {
  if (typeof value === 'string') {
    const date = new Date(parseDate);
    if (!isNaN(date)) {
      return date;
    }
  }

  throw new TypeValidationError(value, 'Date');
};

const DATE = new GraphQLScalarType({
  name: 'Date',
  description:
    'The Date scalar type is used in operations and types that involve dates.',
  parseValue: parseDate,
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
      return parseDate(ast.value);
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

const CREATE_RESULT_FIELDS = {
  objectId: {
    description: 'This is the object id.',
    type: new GraphQLNonNull(GraphQLID),
  },
  createdAt: {
    description: 'This is the date in which the object was created.',
    type: new GraphQLNonNull(DATE),
  },
};

const CREATE_RESULT = new GraphQLObjectType({
  name: 'CreateResult',
  description:
    'The CreateResult object type is used in the create mutations to return the data of the recent created object.',
  fields: CREATE_RESULT_FIELDS,
});

const CLASS_FIELDS = {
  ...CREATE_RESULT_FIELDS,
};

const CLASS = new GraphQLInterfaceType({
  name: 'Class',
  description:
    'The Class interface type is used as a base type for the auto generated class types.',
  fields: CLASS_FIELDS,
});

const load = parseGraphQLSchema => {
  parseGraphQLSchema.graphQLTypes.push(OBJECT);
  parseGraphQLSchema.graphQLTypes.push(DATE);
  parseGraphQLSchema.graphQLTypes.push(FILE);
  parseGraphQLSchema.graphQLTypes.push(CREATE_RESULT);
  parseGraphQLSchema.graphQLTypes.push(CLASS);
};

export { OBJECT, DATE, FILE, CREATE_RESULT, CLASS_FIELDS, CLASS, load };
