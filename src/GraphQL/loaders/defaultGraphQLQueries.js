import { GraphQLNonNull, GraphQLBoolean } from 'graphql';
import * as objectsQueries from './objectsQueries';

const load = parseGraphQLSchema => {
  parseGraphQLSchema.graphQLQueries.health = {
    description:
      'The health query can be used to check if the server is up and running.',
    type: new GraphQLNonNull(GraphQLBoolean),
    resolve: () => true,
  };

  objectsQueries.load(parseGraphQLSchema);
};

export { load };
