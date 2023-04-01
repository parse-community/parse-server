import { mapSchema, getDirective, MapperKind } from '@graphql-tools/utils';
import { FunctionsRouter } from '../../Routers/FunctionsRouter';

export const definitions = `
  directive @resolve(to: String) on FIELD_DEFINITION
  directive @mock(with: Any!) on FIELD_DEFINITION
`;

const load = parseGraphQLSchema => {
  parseGraphQLSchema.graphQLSchemaDirectivesDefinitions = definitions;

  const resolveDirective = schema =>
    mapSchema(schema, {
      [MapperKind.OBJECT_FIELD]: fieldConfig => {
        const directive = getDirective(schema, fieldConfig, 'resolve')?.[0];
        if (directive) {
          const { to: targetCloudFunction } = directive;
          fieldConfig.resolve = async (_source, args, context, gqlInfo) => {
            try {
              const { config, auth, info } = context;
              const functionName = targetCloudFunction || gqlInfo.fieldName;
              return (
                await FunctionsRouter.handleCloudFunction({
                  params: {
                    functionName,
                  },
                  config,
                  auth,
                  info,
                  body: args,
                })
              ).response.result;
            } catch (e) {
              parseGraphQLSchema.handleError(e);
            }
          };
        }
        return fieldConfig;
      },
    });

  const mockDirective = schema =>
    mapSchema(schema, {
      [MapperKind.OBJECT_FIELD]: fieldConfig => {
        const directive = getDirective(schema, fieldConfig, 'mock')?.[0];
        if (directive) {
          const { with: mockValue } = directive;
          fieldConfig.resolve = async () => mockValue;
        }
        return fieldConfig;
      },
    });

  parseGraphQLSchema.graphQLSchemaDirectives = schema => mockDirective(resolveDirective(schema));
};
export { load };
