import { GraphQLNonNull, GraphQLBoolean } from 'graphql';

const HEALTH = {
  description:
    'The health query can be used to check if the server is up and running.',
  type: new GraphQLNonNull(GraphQLBoolean),
  resolve: () => true,
};

const load = parseGraphQLSchema => {
  parseGraphQLSchema.graphQLQueries.health = HEALTH;
};

export { load };
