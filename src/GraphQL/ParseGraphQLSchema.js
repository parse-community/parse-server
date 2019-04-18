import gql from 'graphql-tag';
import { makeExecutableSchema } from 'graphql-tools';
import requiredParameter from '../requiredParameter';

const defaultGraphQLSchema = makeExecutableSchema({
  typeDefs: gql`
    schema {
      query: Query
    }

    type Query {
      health: Boolean!
    }
  `,
  resolvers: {
    Query: {
      health: () => true,
    },
  },
});

class ParseGraphQLSchema {
  constructor(parseServer) {
    this.parseServer =
      parseServer ||
      requiredParameter('You must provide a parseServer instance!');
  }

  make() {
    return defaultGraphQLSchema;
  }
}

export { ParseGraphQLSchema };
