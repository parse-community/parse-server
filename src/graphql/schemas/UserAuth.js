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

const getLoginCompletePayload = (schema) => new GraphQLObjectType({
  name: 'LoginCompletePayload',
  fields: () => {
    const { parseClass } = loadClass('_User', schema);
    const fields = parseClass.graphQLConfig().fields;
    return Object.assign({}, fields(), {
      sessionToken: { type: GraphQLNonNull(GraphQLString) }
    });
  }
});

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

export default {
  Query: () => ({}),
  Mutation: getUserAuthMutationFields,
}
