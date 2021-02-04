import { GraphQLNonNull, GraphQLBoolean } from 'graphql';
import * as usersQueries from './usersQueries';
import * as schemaQueries from './schemaQueries';

const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLQuery(
    'health',
    {
      description: 'The health query can be used to check if the server is up and running.',
      type: new GraphQLNonNull(GraphQLBoolean),
      resolve: () => true,
    },
    true,
    true
  );

  usersQueries.load(parseGraphQLSchema);
  schemaQueries.load(parseGraphQLSchema);
};

export { load };
