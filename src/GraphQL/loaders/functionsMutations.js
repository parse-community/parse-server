import { GraphQLObjectType, GraphQLNonNull, GraphQLString } from 'graphql';
import { mutationWithClientMutationId } from 'graphql-relay';
import { FunctionsRouter } from '../../Routers/FunctionsRouter';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';

const load = parseGraphQLSchema => {
  const fields = {};

  const description =
    'The call mutation can be used to invoke a cloud code function.';
  const args = {
    functionName: {
      description: 'This is the name of the function to be called.',
      type: new GraphQLNonNull(GraphQLString),
    },
    params: {
      description: 'These are the params to be passed to the function.',
      type: defaultGraphQLTypes.OBJECT,
    },
  };
  const type = defaultGraphQLTypes.ANY;
  const resolve = async (_source, args, context) => {
    try {
      const { functionName, params } = args;
      const { config, auth, info } = context;

      return (await FunctionsRouter.handleCloudFunction({
        params: {
          functionName,
        },
        config,
        auth,
        info,
        body: params,
      })).response.result;
    } catch (e) {
      parseGraphQLSchema.handleError(e);
    }
  };

  let callField;
  if (parseGraphQLSchema.graphQLSchemaIsRelayStyle) {
    callField = mutationWithClientMutationId({
      name: 'CallFunction',
      inputFields: args,
      outputFields: {
        result: { type },
      },
      mutateAndGetPayload: async (args, context) => ({
        result: await resolve(undefined, args, context),
      }),
    });
  } else {
    callField = {
      description,
      args,
      type,
      resolve,
    };
  }
  fields.call = callField;

  const functionsMutation = new GraphQLObjectType({
    name: 'FunctionsMutation',
    description:
      'FunctionsMutation is the top level type for functions mutations.',
    fields,
  });
  parseGraphQLSchema.graphQLTypes.push(functionsMutation);

  parseGraphQLSchema.graphQLMutations.functions = {
    description: 'This is the top level for functions mutations.',
    type: functionsMutation,
    resolve: () => new Object(),
  };
};

export { load };
