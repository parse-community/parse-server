import gql from 'graphql-tag';
import { SchemaDirectiveVisitor } from 'graphql-tools';

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
      field.resolve = async () => {
        return 'Hello world!';
      };
    }
  }

  parseGraphQLSchema.graphQLSchemaDirectives.resolve = ResolveDirectiveVistor;
};

export { load };
