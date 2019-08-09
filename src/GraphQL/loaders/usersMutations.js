import {
  GraphQLBoolean,
  GraphQLNonNull,
  GraphQLObjectType,
  GraphQLString,
} from 'graphql';
import { mutationWithClientMutationId } from 'graphql-relay';
import UsersRouter from '../../Routers/UsersRouter';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import * as objectsMutations from './objectsMutations';

const usersRouter = new UsersRouter();

const loadSignUp = (parseGraphQLSchema, fields) => {
  const description = 'The signUp mutation can be used to sign the user up.';
  const args = {
    fields: {
      descriptions: 'These are the fields of the user.',
      type: parseGraphQLSchema.parseClassTypes['_User'].signUpInputType,
    },
  };
  const type = new GraphQLNonNull(defaultGraphQLTypes.SIGN_UP_RESULT);
  const resolve = async (_source, args, context) => {
    try {
      const { fields } = args;
      const { config, auth, info } = context;

      return await objectsMutations.createObject(
        '_User',
        fields,
        config,
        auth,
        info
      );
    } catch (e) {
      parseGraphQLSchema.handleError(e);
    }
  };

  let signUpField;
  if (parseGraphQLSchema.graphQLSchemaIsRelayStyle) {
    signUpField = mutationWithClientMutationId({
      name: 'SignUp',
      inputFields: args,
      outputFields: {
        result: { type },
      },
      mutateAndGetPayload: async (args, context) => ({
        result: await resolve(undefined, args, context),
      }),
    });
  } else {
    signUpField = {
      description,
      args,
      type,
      resolve,
    };
  }
  fields.signUp = signUpField;
};

const loadLogIn = (parseGraphQLSchema, fields) => {
  const description = 'The logIn mutation can be used to log the user in.';
  const args = {
    username: {
      description: 'This is the username used to log the user in.',
      type: new GraphQLNonNull(GraphQLString),
    },
    password: {
      description: 'This is the password used to log the user in.',
      type: new GraphQLNonNull(GraphQLString),
    },
  };
  const type = new GraphQLNonNull(parseGraphQLSchema.meType);
  const resolve = async (_source, args, context) => {
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
  };

  let logInField;
  if (parseGraphQLSchema.graphQLSchemaIsRelayStyle) {
    logInField = mutationWithClientMutationId({
      name: 'LogIn',
      inputFields: args,
      outputFields: {
        me: { type },
      },
      mutateAndGetPayload: async (args, context) => ({
        me: await resolve(undefined, args, context),
      }),
    });
  } else {
    logInField = {
      description,
      args,
      type,
      resolve,
    };
  }
  fields.logIn = logInField;
};

const loadLogOut = (parseGraphQLSchema, fields) => {
  const description = 'The logOut mutation can be used to log the user out.';
  const type = new GraphQLNonNull(GraphQLBoolean);
  const resolve = async (_source, _args, context) => {
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
  };

  let logOutField;
  if (parseGraphQLSchema.graphQLSchemaIsRelayStyle) {
    logOutField = mutationWithClientMutationId({
      name: 'LogOut',
      inputFields: {},
      outputFields: {
        result: { type },
      },
      mutateAndGetPayload: async (_args, context) => ({
        result: await resolve(undefined, undefined, context),
      }),
    });
  } else {
    logOutField = {
      description,
      type,
      resolve,
    };
  }
  fields.logOut = logOutField;
};

const load = parseGraphQLSchema => {
  if (parseGraphQLSchema.isUsersClassDisabled) {
    return;
  }

  const fields = {};

  loadSignUp(parseGraphQLSchema, fields);
  loadLogIn(parseGraphQLSchema, fields);
  loadLogOut(parseGraphQLSchema, fields);

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
