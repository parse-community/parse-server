import {
  GraphQLInputObjectType,
  GraphQLNonNull,
  GraphQLString,
  GraphQLBoolean,
} from 'graphql'

import {
  transformResult,
  runGet,
} from '../execute';

import { logIn, logOut } from '../../Controllers/UserAuthentication';
import { loadClass } from './ParseClass';

const getLoginCompletePayload = (schema) => loadClass('_User', schema).objectType;

const LoginInput = new GraphQLInputObjectType({
  name: 'LoginInput',
  fields: {
    email: { type: GraphQLString, description: 'the email of the user. Either email or username should be provided' },
    username: { type: GraphQLString, description: 'the username of the user. Either email or username should be provided'  },
    password: { type: GraphQLNonNull(GraphQLString) }
  }
});

const login = (schema) => ({
  type: getLoginCompletePayload(schema),
  args: {
    input: { type: LoginInput }
  },
  resolve: async (root, args, req) => {
    const user = await logIn(args.input, req.config, req.auth, req.info && req.info.installationId);
    return transformResult('_User', user);
  }
});

const logout = {
  type: GraphQLBoolean,
  resolve: async (root, args, req) => {
    await logOut(req.info.sessionToken, req.config, req.info.clientSDK);
    return true;
  }
}

export function getUserAuthMutationFields(schema) {
  return {
    login: login(schema),
    logout,
  };
}

export function getUserAuthQueryFields(schema) {
  return {
    currentUser: {
      type: getLoginCompletePayload(schema),
      resolve: async (root, args, req, info) => {
        if (!req.auth.user) {
          throw new Error('You need to be logged in.');
        }
        const object = await runGet(req, info, '_User', req.auth.user.id);
        return transformResult('_User', object);
      }
    }
  };
}

export default {
  Query: getUserAuthQueryFields,
  Mutation: getUserAuthMutationFields,
}
