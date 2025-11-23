import { GraphQLNonNull, GraphQLString } from 'graphql';
import Parse from 'parse/node';
import { createSanitizedError } from '../../Error';
import { GlobalConfigRouter } from '../../Routers/GlobalConfigRouter';

const getConfigValue = async (context, paramName) => {
  const { config, auth } = context;

  if (!auth.isMaster) {
    throw createSanitizedError(
      Parse.Error.OPERATION_FORBIDDEN,
      'Master Key is required to access GlobalConfig.'
    );
  }

  const globalConfig = await GlobalConfigRouter.getGlobalConfig(config, auth);
  const { params, masterKeyOnly } = globalConfig;

  // Vérifie si le paramètre existe dans params ou masterKeyOnly
  if (params && params[paramName] !== undefined) {
    return { value: params[paramName], source: 'params' };
  } else if (masterKeyOnly && masterKeyOnly[paramName] !== undefined) {
    return { value: masterKeyOnly[paramName], source: 'masterKeyOnly' };
  } else {
    throw createSanitizedError(
      Parse.Error.INVALID_QUERY,
      `Parameter "${paramName}" not found in GlobalConfig.`
    );
  }
};

const load = (parseGraphQLSchema) => {
  parseGraphQLSchema.addGraphQLQuery('configValue', {
    description: 'Returns the value of a specific parameter from GlobalConfig.',
    args: {
      paramName: { type: new GraphQLNonNull(GraphQLString) },
    },
    type: new GraphQLNonNull(parseGraphQLSchema.configValueType),
    async resolve(_source, args, context) {
      try {
        return getConfigValue(context, args.paramName);
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    },
  });
};

export { load, getConfig, getConfigValue };
