import { GraphQLNonNull } from 'graphql';
import { mutationWithClientMutationId } from 'graphql-relay';
import UsersRouter from '../../Routers/UsersRouter';
import * as objectsMutations from '../helpers/objectsMutations';
import { getUserFromSessionToken } from './usersQueries';

const usersRouter = new UsersRouter();

const load = parseGraphQLSchema => {
  if (parseGraphQLSchema.isUsersClassDisabled) {
    return;
  }

  const signUpMutation = mutationWithClientMutationId({
    name: 'SignUp',
    description:
      'The signUp mutation can be used to create and sign up a new user.',
    inputFields: {
      userFields: {
        descriptions:
          'These are the fields of the new user to be created and signed up.',
        type:
          parseGraphQLSchema.parseClassTypes['_User'].classGraphQLCreateType,
      },
    },
    outputFields: {
      viewer: {
        description:
          'This is the new user that was created, signed up and returned as a viewer.',
        type: new GraphQLNonNull(parseGraphQLSchema.viewerType),
      },
    },
    mutateAndGetPayload: async (args, context, mutationInfo) => {
      try {
        const { userFields } = args;
        const { config, auth, info } = context;

        const { sessionToken } = await objectsMutations.createObject(
          '_User',
          userFields,
          config,
          auth,
          info
        );

        info.sessionToken = sessionToken;

        return {
          viewer: await getUserFromSessionToken(config, info, mutationInfo),
        };
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    },
  });

  parseGraphQLSchema.addGraphQLType(
    signUpMutation.args.input.type.ofType,
    true,
    true
  );
  parseGraphQLSchema.addGraphQLType(signUpMutation.type, true, true);
  parseGraphQLSchema.addGraphQLMutation('signUp', signUpMutation, true, true);

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
