import {
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLNonNull,
  GraphQLString,
} from 'graphql'

import {
  transformResult
} from '../execute';

import { logIn } from '../../Controllers/UserAuthentication';
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

export function getUserAuthMutationFields(schema) {
  return {
    login: login(schema)
  };
}

export function getUserAuthQueryFields(schema) {
  return {
    currentUser: {
      type: getLoginCompletePayload(schema),
      resolve: async (root, args, req) => {
        if (!req.auth.user) {
          throw new Error('You need to be logged in.');
        }
        return transformResult('_User', req.auth.user);
      }
    }
  };
}

export default {
  Query: getUserAuthQueryFields,
  Mutation: getUserAuthMutationFields,
}
