// @flow
import {
  GraphQLInputObjectType,
  GraphQLNonNull,
  GraphQLString,
  GraphQLBoolean,
  // @flow-disable-next
} from 'graphql';

import { ClientRequest } from 'http';
interface ParseClientRequest extends ClientRequest {
  config: Config;
  auth: Auth;
  info: { installationId: ?string, clientSDK: ?string, sessionToken: ?string };
}

import { transformResult, runGet } from '../execute';

import { logIn, logOut } from '../../Controllers/UserAuthentication';
import { loadClass } from './ParseClass';
import { Config } from '../../Config';
import { Auth } from '../../Auth';

const getLoginCompletePayload = schema => loadClass('_User', schema).objectType;

const LoginInput = new GraphQLInputObjectType({
  name: 'LoginInput',
  fields: {
    email: {
      type: GraphQLString,
      description:
        'the email of the user. Either email or username should be provided',
    },
    username: {
      type: GraphQLString,
      description:
        'the username of the user. Either email or username should be provided',
    },
    password: { type: GraphQLNonNull(GraphQLString) },
  },
});

const login = (schema: any) => ({
  type: getLoginCompletePayload(schema),
  args: {
    input: { type: LoginInput },
  },
  resolve: async (root: any, args: { input: any }, req: ParseClientRequest) => {
    const user = await logIn(
      args.input,
      req.config,
      req.auth,
      req.info && req.info.installationId
    );
    return transformResult('_User', user);
  },
});

const logout = {
  type: GraphQLBoolean,
  resolve: async (root: any, args: void, req: ParseClientRequest) => {
    await logOut(req.info.sessionToken, req.config, req.info.clientSDK);
    return true;
  },
};

const requestPasswordReset = {
  type: GraphQLBoolean,
  args: {
    input: {
      type: new GraphQLInputObjectType({
        name: 'RequestPasswordResetInput',
        fields: {
          email: {
            type: GraphQLString,
            description: 'the email address to send the password reset mail.',
          },
        },
      }),
    },
  },
  resolve: async (
    root: any,
    args: { input: { email: string } },
    req: ParseClientRequest
  ) => {
    const config: Config = req.config;
    await config.userController.sendPasswordResetEmail(args.input.email);
    return true;
  },
};

export function getUserAuthMutationFields(schema: any) {
  return {
    login: login(schema),
    logout,
    requestPasswordReset,
  };
}

export function getUserAuthQueryFields(schema: any) {
  return {
    currentUser: {
      type: getLoginCompletePayload(schema),
      resolve: async (
        root: any,
        args: void,
        req: ParseClientRequest,
        info: any
      ) => {
        if (!req.auth.user) {
          throw new Error('You need to be logged in.');
        }
        const object = await runGet(req, info, '_User', req.auth.user.id);
        return transformResult('_User', object);
      },
    },
  };
}

export default {
  Query: getUserAuthQueryFields,
  Mutation: getUserAuthMutationFields,
};
