import {
  GraphQLNonNull,
  GraphQLString,
  GraphQLFloat,
  GraphQLBoolean,
  GraphQLList,
} from 'graphql';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import rest from '../../rest';

const mapType = parseType => {
  //console.log(parseType);
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
  const createGraphQLMutationName = `create${className}`;
  parseGraphQLSchema.graphQLMutations[createGraphQLMutationName] = {
    description: `The ${createGraphQLMutationName} mutation can be used to create a new object of the ${className} class.`,
    args: Object.keys(parseClass.fields)
      .filter(
        field => !['objectId', 'ACL', 'createdAt', 'updatedAt'].includes(field)
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
      ),
    type: new GraphQLNonNull(defaultGraphQLTypes.CREATE_RESULT),
    async resolve(_source, args, context) {
      if (!args) {
        args = {};
      }

      const { config, auth, info } = context;

      return (await rest.create(config, auth, className, args, info.clientSDK))
        .response;
    },
  };
};

export { load };
