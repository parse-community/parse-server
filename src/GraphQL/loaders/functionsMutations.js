import { GraphQLNonNull, GraphQLEnumType } from 'graphql';
import { FunctionsRouter } from '../../Routers/FunctionsRouter';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';

const load = parseGraphQLSchema => {
  if (parseGraphQLSchema.functionNames.length > 0) {
    const cloudCodeFunctionEnum = parseGraphQLSchema.addGraphQLType(
      new GraphQLEnumType({
        name: 'CloudCodeFunction',
        description:
          'The CloudCodeFunction enum type contains a list of all available cloud code functions.',
        values: parseGraphQLSchema.functionNames.reduce(
          (values, functionName) => ({
            ...values,
            [functionName]: { value: functionName },
          }),
          {}
        ),
      }),
      true,
      true
    );

    parseGraphQLSchema.addGraphQLMutation(
      'callCloudCode',
      {
        description:
          'The call mutation can be used to invoke a cloud code function.',
        args: {
          functionName: {
            description: 'This is the function to be called.',
            type: new GraphQLNonNull(cloudCodeFunctionEnum),
          },
          params: {
            description: 'These are the params to be passed to the function.',
            type: defaultGraphQLTypes.OBJECT,
          },
        },
        type: defaultGraphQLTypes.ANY,
        async resolve(_source, args, context) {
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
        },
      },
      true,
      true
    );
  }
};

export { load };
