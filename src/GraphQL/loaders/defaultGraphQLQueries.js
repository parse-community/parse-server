import { GraphQLNonNull, GraphQLBoolean } from 'graphql';
import * as usersQueries from './usersQueries';
import * as classSchemaQueries from './classSchemaQueries';

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

  usersQueries.load(parseGraphQLSchema);
  classSchemaQueries.load(parseGraphQLSchema);
};

export { load };
