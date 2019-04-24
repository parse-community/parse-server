import {
  Kind,
  GraphQLNonNull,
  GraphQLScalarType,
  GraphQLString,
  GraphQLObjectType,
} from 'graphql';

const parseObject = value => {
  if (typeof value === 'object') {
    return value;
  }
  return null;
};

const OBJECT = new GraphQLScalarType({
  name: 'Object',
  description:
    'The Object scalar type is used in operations and types that involve objects.',
  parseValue(value) {
    return parseObject(value);
  },
  serialize(value) {
    if (typeof value === 'object') {
      return JSON.stringify(value);
    }
    return null;
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.OBJECT) {
      return parseObject(ast.value);
    }
    return null;
  },
});

const parseDate = value => {
  if (typeof value !== 'string') {
    return null;
  }

  try {
    return new Date(value);
  } catch {
    return null;
  }
};

const DATE = new GraphQLScalarType({
  name: 'Date',
  description:
    'The Date scalar type is used in operations and types that involve dates.',
  parseValue(value) {
    return parseDate(value);
  },
  serialize(value) {
    if (value instanceof Date) {
      return value.toUTCString();
    }
    return null;
  },
  parseLiteral(ast) {
    if (ast.kind === Kind.STRING) {
      return parseDate(ast.value);
    }
    return null;
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

const load = parseGraphQLSchema => {
  parseGraphQLSchema.graphQLTypes.push(OBJECT);
  parseGraphQLSchema.graphQLTypes.push(DATE);
  parseGraphQLSchema.graphQLTypes.push(FILE);
};

export { OBJECT, DATE, FILE, load };
