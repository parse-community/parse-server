import { GraphQLNonNull } from 'graphql';
import UsersRouter from '../../Routers/UsersRouter';
import * as objectsMutations from '../helpers/objectsMutations';
import { getUserFromSessionToken } from './usersQueries';

const usersRouter = new UsersRouter();

const load = parseGraphQLSchema => {
  if (parseGraphQLSchema.isUsersClassDisabled) {
    return;
  }

  parseGraphQLSchema.addGraphQLMutation(
    'signUp',
    {
      description: 'The signUp mutation can be used to sign the user up.',
      args: {
        fields: {
          descriptions: 'These are the fields of the user.',
          type: parseGraphQLSchema.parseClassTypes['_User'].signUpInputType,
        },
      },
      type: new GraphQLNonNull(parseGraphQLSchema.viewerType),
      async resolve(_source, args, context, mutationInfo) {
        try {
          const { fields } = args;

          const { config, auth, info } = context;

          const { sessionToken } = await objectsMutations.createObject(
            '_User',
            fields,
            config,
            auth,
            info
          );

          info.sessionToken = sessionToken;

          return await getUserFromSessionToken(config, info, mutationInfo);
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    },
    true,
    true
  );

  parseGraphQLSchema.addGraphQLMutation(
    'logIn',
    {
      description: 'The logIn mutation can be used to log the user in.',
      args: {
        fields: {
          description: 'This is data needed to login',
          type: parseGraphQLSchema.parseClassTypes['_User'].logInInputType,
        },
      },
      type: new GraphQLNonNull(parseGraphQLSchema.viewerType),
      async resolve(_source, args, context) {
        try {
          const {
            fields: { username, password },
          } = args;
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
    },
    true,
    true
  );

  parseGraphQLSchema.addGraphQLMutation(
    'logOut',
    {
      description: 'The logOut mutation can be used to log the user out.',
      type: new GraphQLNonNull(parseGraphQLSchema.viewerType),
      async resolve(_source, _args, context, mutationInfo) {
        try {
          const { config, auth, info } = context;

          const viewer = await getUserFromSessionToken(
            config,
            info,
            mutationInfo
          );

          await usersRouter.handleLogOut({
            config,
            auth,
            info,
          });

          return viewer;
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    },
    true,
    true
  );
};

export { load };
