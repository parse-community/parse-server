import { GraphQLNonNull, GraphQLString, GraphQLBoolean, GraphQLObjectType } from 'graphql';
import Parse from 'parse/node';
import { createSanitizedError } from '../../Error';

const configValue = async (context, paramName) => {
  const { config, auth } = context;

  if (!auth.isMaster) {
    throw createSanitizedError(
      Parse.Error.OPERATION_FORBIDDEN,
      'Master Key is required to access GlobalConfig.'
    );
  }

  const results = await config.database.find('_GlobalConfig', { objectId: '1' }, { limit: 1 });

  if (results.length !== 1) {
    return { value: null, isMasterKeyOnly: null };
  }

  const globalConfig = results[0];
  const params = globalConfig.params || {};
  const masterKeyOnly = globalConfig.masterKeyOnly || {};

  if (params[paramName] !== undefined) {
    return { value: params[paramName], isMasterKeyOnly: masterKeyOnly[paramName] ?? null };
  }

  return { value: null, isMasterKeyOnly: null };
};

const load = (parseGraphQLSchema) => {
  if (!parseGraphQLSchema.configValueType) {
    const configValueType = new GraphQLObjectType({
      name: 'ConfigValue',
      fields: {
        value: { type: GraphQLString },
        isMasterKeyOnly: { type: GraphQLBoolean },
      },
    });
    parseGraphQLSchema.addGraphQLType(configValueType, true, true);
    parseGraphQLSchema.configValueType = configValueType;
  }

  parseGraphQLSchema.addGraphQLQuery('configValue', {
    description: 'Returns the value of a specific parameter from GlobalConfig.',
    args: {
      paramName: { type: new GraphQLNonNull(GraphQLString) },
    },
    type: new GraphQLNonNull(parseGraphQLSchema.configValueType),
    async resolve(_source, args, context) {
      try {
        return await configValue(context, args.paramName);
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    },
  }, false, true);
};

export { load, configValue };
