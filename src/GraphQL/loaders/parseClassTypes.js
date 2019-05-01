import { GraphQLObjectType } from 'graphql';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';

const load = (parseGraphQLSchema, parseClass) => {
  const className = parseClass.className;

  const classGraphQLTypeName = `${className}Class`;
  const classGraphQLType = new GraphQLObjectType({
    name: classGraphQLTypeName,
    description: `The ${classGraphQLTypeName} object type is used in operations that involve objects of this specific class.`,
    interfaces: [defaultGraphQLTypes.CLASS],
    fields: {
      ...defaultGraphQLTypes.CLASS_FIELDS,
    },
  });

  parseGraphQLSchema.parseClassTypes = {
    [className]: {
      classGraphQLType,
    },
  };

  parseGraphQLSchema.graphQLTypes.push(classGraphQLType);
};

export { load };
