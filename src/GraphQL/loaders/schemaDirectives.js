import gql from 'graphql-tag';
import { SchemaDirectiveVisitor } from '@graphql-tools/utils';
import { FunctionsRouter } from '../../Routers/FunctionsRouter';

export const definitions = gql`
  directive @resolve(to: String) on FIELD_DEFINITION
  directive @mock(with: Any!) on FIELD_DEFINITION
`;

const load = parseGraphQLSchema => {
  parseGraphQLSchema.graphQLSchemaDirectivesDefinitions = definitions;

  class ResolveDirectiveVisitor extends SchemaDirectiveVisitor {
    visitFieldDefinition(field) {
      field.resolve = async (_source, args, context) => {
        try {
          const { config, auth, info } = context;

          let functionName = field.name;
          if (this.args.to) {
            functionName = this.args.to;
          }

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
  }

  parseGraphQLSchema.graphQLSchemaDirectives.resolve = ResolveDirectiveVisitor;

  class MockDirectiveVisitor extends SchemaDirectiveVisitor {
    visitFieldDefinition(field) {
      field.resolve = () => {
        return this.args.with;
      };
    }
  }

  parseGraphQLSchema.graphQLSchemaDirectives.mock = MockDirectiveVisitor;
};

export { load };
