import { GraphQLNonNull, GraphQLBoolean } from 'graphql';
import * as objectsQueries from './objectsQueries';
import * as usersQueries from './usersQueries';

const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLQuery(
    'health',
    {
      description:
        'The health query can be used to check if the server is up and running.',
      type: new GraphQLNonNull(GraphQLBoolean),
      resolve: () => true,
    },
    true,
    true
  );

  objectsQueries.load(parseGraphQLSchema);
  usersQueries.load(parseGraphQLSchema);
};

export { load };
