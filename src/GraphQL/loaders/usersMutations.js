import {
  GraphQLBoolean,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLString,
} from 'graphql';
import UsersRouter from '../../Routers/UsersRouter';

const load = parseGraphQLSchema => {
  const fields = {};

  fields.login = {
    description: 'The login mutation can be used to log the user in.',
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
    type: new GraphQLNonNull(GraphQLString),
    async resolve(_source, args, context) {
      try {
        const { username, password } = args;
        const { config, auth, info } = context;

        const user = (await new UsersRouter().handleLogIn({
          body: {
            username,
            password,
          },
          query: {},
          config,
          auth,
          info,
        })).response;
        return user.sessionToken;
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    },
  };

  fields.logout = {
    description: 'The logout mutation can be used to log the user out.',
    type: new GraphQLNonNull(GraphQLBoolean),
    async resolve(_source, args, context) {
      try {
        const { config, auth, info } = context;

        await new UsersRouter().handleLogOut({
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
