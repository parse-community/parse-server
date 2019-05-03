import {
  GraphQLObjectType,
  GraphQLString,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLList,
} from 'graphql';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';

const mapType = parseType => {
  switch (parseType) {
    case 'String':
      return GraphQLString;
    case 'Number':
      return GraphQLFloat;
    case 'Boolean':
      return GraphQLBoolean;
    case 'Array':
      return GraphQLList;
    case 'Object':
      return defaultGraphQLTypes.OBJECT;
    case 'Date':
      return defaultGraphQLTypes.DATE;
  }
};

const load = (parseGraphQLSchema, parseClass) => {
  const className = parseClass.className;

  const classGraphQLCustomFields = Object.keys(parseClass.fields)
    .filter(
      field => !Object.keys(defaultGraphQLTypes.CLASS_FIELDS).includes(field)
    )
    .reduce(
      (args, field) => ({
        ...args,
        [field]: {
          description: `This is the object ${field}.`,
          type: mapType(parseClass.fields[field].type),
        },
      }),
      {}
    );

  const classGraphQLTypeName = `${className}Class`;
  const classGraphQLType = new GraphQLObjectType({
    name: classGraphQLTypeName,
    description: `The ${classGraphQLTypeName} object type is used in operations that involve objects of this specific class.`,
    interfaces: [defaultGraphQLTypes.CLASS],
    fields: {
      ...defaultGraphQLTypes.CLASS_FIELDS,
      ...classGraphQLCustomFields,
    },
  });

  parseGraphQLSchema.parseClassTypes = {
    [className]: {
      classGraphQLType,
      classGraphQLCustomFields,
    },
  };

  parseGraphQLSchema.graphQLTypes.push(classGraphQLType);
};

export { load };
