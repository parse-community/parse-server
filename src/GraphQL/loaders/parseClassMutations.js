import { GraphQLNonNull } from 'graphql';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import rest from '../../rest';

const load = (parseGraphQLSchema, parseClass) => {
  const className = parseClass.className;

  const createGraphQLMutationName = `create${className}`;
  parseGraphQLSchema.graphQLMutations[createGraphQLMutationName] = {
    description: `The ${createGraphQLMutationName} mutation can be used to create a new object of the ${className} class.`,
    args: defaultGraphQLTypes.classGraphQLCustomFields,
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
