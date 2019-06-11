import {
  GraphQLBoolean,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLString,
} from 'graphql';
import UsersRouter from '../../Routers/UsersRouter';

const usersRouter = new UsersRouter();

const load = parseGraphQLSchema => {
  const fields = {};

  fields.logIn = {
    description: 'The logIn mutation can be used to log the user in.',
    args: {
      username: {
        description: 'This is the username used to log the user in.',
        type: new GraphQLNonNull(GraphQLString),
      },
      password: {
        description: 'This is the password used to log the user in.',
        type: new GraphQLNonNull(GraphQLString),
      },
    },
    type: new GraphQLNonNull(parseGraphQLSchema.meType),
    async resolve(_source, args, context) {
      try {
        const { username, password } = args;
        const { config, auth, info } = context;

        return (await usersRouter.handleLogIn({
          body: {
            username,
            password,
          },
          query: {},
          config,
          auth,
          info,
        })).response;
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    },
  };

  fields.logOut = {
    description: 'The logOut mutation can be used to log the user out.',
    type: new GraphQLNonNull(GraphQLBoolean),
    async resolve(_source, _args, context) {
      try {
        const { config, auth, info } = context;

        await usersRouter.handleLogOut({
          config,
          auth,
          info,
        });
        return true;
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    },
  };

  const usersMutation = new GraphQLObjectType({
    name: 'UsersMutation',
    description: 'UsersMutation is the top level type for files mutations.',
    fields,
  });
  parseGraphQLSchema.graphQLTypes.push(usersMutation);

  parseGraphQLSchema.graphQLMutations.users = {
    description: 'This is the top level for users mutations.',
    type: usersMutation,
    resolve: () => new Object(),
  };
};

export { load };
