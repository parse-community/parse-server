import { GraphQLNonNull, GraphQLID, GraphQLBoolean } from 'graphql';
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

  const deleteGraphQLMutationName = `delete${className}`;
  parseGraphQLSchema.graphQLMutations[deleteGraphQLMutationName] = {
    description: `The ${deleteGraphQLMutationName} mutation can be used to delete an object of the ${className} class.`,
    args: {
      objectId: {
        description: 'This is the objectIt of the object to be deleted.',
        type: new GraphQLNonNull(GraphQLID),
      },
    },
    type: new GraphQLNonNull(GraphQLBoolean),
    async resolve(_source, args, context) {
      const { objectId } = args;

      const { config, auth, info } = context;

      await rest.del(config, auth, className, objectId, info.clientSDK);

      return true;
    },
  };
};

export { load };
