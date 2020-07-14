import { GraphQLNonNull } from 'graphql';
import getFieldNames from 'graphql-list-fields';
import Parse from 'parse/node';
import rest from '../../rest';
import Auth from '../../Auth';
import { extractKeysAndInclude } from './parseClassTypes';

const getUserFromSessionToken = async (
  config,
  info,
  queryInfo,
  keysPrefix,
  validatedToken
) => {
  if (!info || !info.sessionToken) {
    throw new Parse.Error(
      Parse.Error.INVALID_SESSION_TOKEN,
      'Invalid session token'
    );
  }
  const sessionToken = info.sessionToken;
  const selectedFields = getFieldNames(queryInfo)
    .filter(field => field.startsWith(keysPrefix))
    .map(field => field.replace(keysPrefix, ''));

  const keysAndInclude = extractKeysAndInclude(selectedFields);
  const { keys } = keysAndInclude;
  let { include } = keysAndInclude;

  if (validatedToken && !keys && !include) {
    return {
      sessionToken,
    };
  } else if (keys && !include) {
    include = 'user';
  }

  const options = {};
  if (keys) {
    options.keys = keys
      .split(',')
      .map(key => `user.${key}`)
      .join(',');
  }
  if (include) {
    options.include = include
      .split(',')
      .map(included => `user.${included}`)
      .join(',');
  }

  const response = await rest.find(
    config,
    Auth.master(config),
    '_Session',
    { sessionToken },
    options,
    info.clientVersion,
    info.context,
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
    return {
      sessionToken,
      user,
    };
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
          return await getUserFromSessionToken(
            config,
            info,
            queryInfo,
            'user.',
            false
          );
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
