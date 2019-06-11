import { GraphQLNonNull, GraphQLObjectType } from 'graphql';
import UsersRouter from '../../Routers/UsersRouter';

const usersRouter = new UsersRouter();

const load = parseGraphQLSchema => {
  const fields = {};

  fields.me = {
    description: 'The Me query can be used to return the current user data.',
    type: new GraphQLNonNull(parseGraphQLSchema.meType),
    async resolve(_source, _args, context) {
      try {
        const { config, auth, info } = context;
        return (await usersRouter.handleMe({ config, auth, info })).response;
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    },
  };

  const usersQuery = new GraphQLObjectType({
    name: 'UsersQuery',
    description: 'UsersQuery is the top level type for users queries.',
    fields,
  });
  parseGraphQLSchema.graphQLTypes.push(usersQuery);

  parseGraphQLSchema.graphQLQueries.users = {
    description: 'This is the top level for users queries.',
    type: usersQuery,
    resolve: () => new Object(),
  };
};

export { load };
