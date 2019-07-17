import gql from 'graphql-tag';
import { SchemaDirectiveVisitor } from 'graphql-tools';
import { FunctionsRouter } from '../../Routers/FunctionsRouter';

export const definitions = gql`
  directive @namespace on FIELD_DEFINITION
  directive @resolve on FIELD_DEFINITION
`;

const load = parseGraphQLSchema => {
  parseGraphQLSchema.graphQLSchemaDirectivesDefinitions = definitions;

  class NamespaceDirectiveVistor extends SchemaDirectiveVisitor {
    visitFieldDefinition(field) {
      field.resolve = () => ({});
    }
  }

  parseGraphQLSchema.graphQLSchemaDirectives.namespace = NamespaceDirectiveVistor;

  class ResolveDirectiveVistor extends SchemaDirectiveVisitor {
    visitFieldDefinition(field) {
      field.resolve = async (_source, args, context) => {
        try {
          const { config, auth, info } = context;

          let functionName = field.name;
          if (this.args.to) {
            functionName = this.args.to;
          }

          return (await FunctionsRouter.handleCloudFunction({
            params: {
              functionName,
            },
            config,
            auth,
            info,
            body: args,
          })).response.result;
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      };
    }
  }

  parseGraphQLSchema.graphQLSchemaDirectives.resolve = ResolveDirectiveVistor;
};

export { load };
