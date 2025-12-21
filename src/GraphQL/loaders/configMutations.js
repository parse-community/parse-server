import { GraphQLNonNull, GraphQLString, GraphQLBoolean } from 'graphql';
import { mutationWithClientMutationId } from 'graphql-relay';
import Parse from 'parse/node';
import { createSanitizedError } from '../../Error';
import GlobalConfigRouter from '../../Routers/GlobalConfigRouter';

const globalConfigRouter = new GlobalConfigRouter();

const updateCloudConfig = async (context, paramName, value, isMasterKeyOnly = false) => {
  const { config, auth } = context;

  if (!auth.isMaster) {
    throw createSanitizedError(
      Parse.Error.OPERATION_FORBIDDEN,
      'Master Key is required to update GlobalConfig.'
    );
  }

  await globalConfigRouter.updateGlobalConfig({
    body: {
      params: { [paramName]: value },
      masterKeyOnly: { [paramName]: isMasterKeyOnly },
    },
    config,
    auth,
    context,
  });

  return { value, isMasterKeyOnly };
};

const load = parseGraphQLSchema => {
  const updateCloudConfigMutation = mutationWithClientMutationId({
    name: 'UpdateCloudConfig',
    description: 'Updates the value of a specific parameter in GlobalConfig.',
    inputFields: {
      paramName: {
        description: 'The name of the parameter to set.',
        type: new GraphQLNonNull(GraphQLString),
      },
      value: {
        description: 'The value to set for the parameter.',
        type: new GraphQLNonNull(GraphQLString),
      },
      isMasterKeyOnly: {
        description: 'Whether this parameter should only be accessible with master key.',
        type: GraphQLBoolean,
        defaultValue: false,
      },
    },
    outputFields: {
      cloudConfig: {
        description: 'The updated config value.',
        type: new GraphQLNonNull(parseGraphQLSchema.cloudConfigType),
      },
    },
    mutateAndGetPayload: async (args, context) => {
      try {
        const { paramName, value, isMasterKeyOnly } = args;
        const result = await updateCloudConfig(context, paramName, value, isMasterKeyOnly);
        return {
          cloudConfig: result,
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    },
  });

  parseGraphQLSchema.addGraphQLType(updateCloudConfigMutation.args.input.type.ofType, true, true);
  parseGraphQLSchema.addGraphQLType(updateCloudConfigMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('updateCloudConfig', updateCloudConfigMutation, true, true);
};

export { load, updateCloudConfig };

