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
  if (typeof fields === 'object') {
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
  updatedAt: {
    description: 'This is the date in which the object was las updated.',
    type: new GraphQLNonNull(DATE),
  },
  ACL: {
    description: "This is the object's access control list.",
    type: new GraphQLNonNull(OBJECT),
  },
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
