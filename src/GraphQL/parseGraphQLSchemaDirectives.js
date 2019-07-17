import gql from 'graphql-tag';
import { SchemaDirectiveVisitor } from 'graphql-tools';

export const definitions = gql`
  directive @namespace on FIELD_DEFINITION
  directive @resolve on FIELD_DEFINITION
`;

class NamespaceDirectiveVistor extends SchemaDirectiveVisitor {
  visitFieldDefinition(field) {
    field.resolve = () => ({});
  }
}

class ResolveDirectiveVistor extends SchemaDirectiveVisitor {
  visitFieldDefinition(field) {
    field.resolve = async () => {
      return 'Hello world!';
    };
  }
}

export default {
  namespace: NamespaceDirectiveVistor,
  resolve: ResolveDirectiveVistor,
};
