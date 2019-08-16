import { GraphQLNonNull } from 'graphql';
import getFieldNames from 'graphql-list-fields';
import Parse from 'parse/node';
import rest from '../../rest';
import Auth from '../../Auth';
import { extractKeysAndInclude } from './parseClassTypes';

const getUserFromSessionToken = async (config, info, queryInfo) => {
  if (!info || !info.sessionToken) {
    throw new Parse.Error(
      Parse.Error.INVALID_SESSION_TOKEN,
      'Invalid session token'
    );
  }
  const sessionToken = info.sessionToken;
  const selectedFields = getFieldNames(queryInfo);

  const { include } = extractKeysAndInclude(selectedFields);
  const response = await rest.find(
    config,
    Auth.master(config),
    '_Session',
    { sessionToken },
    {
      include: include
        .split(',')
        .map(included => `user.${included}`)
        .join(','),
    },
    info.clientVersion
  );
  if (
    !response.results ||
    response.results.length == 0 ||
    !response.results[0].user
  ) {
    throw new Parse.Error(
      Parse.Error.INVALID_SESSION_TOKEN,
      'Invalid session token'
    );
  } else {
    const user = response.results[0].user;
    user.sessionToken = sessionToken;
    return user;
  }
};

const load = parseGraphQLSchema => {
  if (parseGraphQLSchema.isUsersClassDisabled) {
    return;
  }

  parseGraphQLSchema.addGraphQLQuery(
    'viewer',
    {
      description:
        'The viewer query can be used to return the current user data.',
      type: new GraphQLNonNull(parseGraphQLSchema.viewerType),
      async resolve(_source, _args, context, queryInfo) {
        try {
          const { config, info } = context;
          return await getUserFromSessionToken(config, info, queryInfo);
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    },
    true,
    true
  );
};

export { load, getUserFromSessionToken };
