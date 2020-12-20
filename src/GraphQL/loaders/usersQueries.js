import { GraphQLNonNull } from 'graphql';
import getFieldNames from 'graphql-list-fields';
import Parse from 'parse/node';
import rest from '../../rest';
import { extractKeysAndInclude } from './parseClassTypes';
import { Auth } from '../../Auth';

const getUserFromSessionToken = async (context, queryInfo, keysPrefix, userId) => {
  const { info, config } = context;
  if (!info || !info.sessionToken) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
  }
  const sessionToken = info.sessionToken;
  const selectedFields = getFieldNames(queryInfo)
    .filter(field => field.startsWith(keysPrefix))
    .map(field => field.replace(keysPrefix, ''));

  const keysAndInclude = extractKeysAndInclude(selectedFields);
  const { keys } = keysAndInclude;
  let { include } = keysAndInclude;

  if (userId && !keys && !include) {
    return {
      sessionToken,
    };
  } else if (keys && !include) {
    include = 'user';
  }

  if (userId) {
    // We need to re create the auth context
    // to avoid security breach if userId is provided
    context.auth = new Auth({
      config,
      isMaster: context.auth.isMaster,
      user: { id: userId },
    });
  }

  const options = {};
  if (keys) {
    options.keys = keys
      .split(',')
      .map(key => `${key}`)
      .join(',');
  }
  if (include) {
    options.include = include
      .split(',')
      .map(included => `${included}`)
      .join(',');
  }

  const response = await rest.find(
    config,
    context.auth,
    '_User',
    // Get the user it self from auth object
    { objectId: context.auth.user.id },
    options,
    info.clientVersion,
    info.context
  );
  if (!response.results || response.results.length == 0) {
    throw new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Invalid session token');
  } else {
    const user = response.results[0];
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
      description: 'The viewer query can be used to return the current user data.',
      type: new GraphQLNonNull(parseGraphQLSchema.viewerType),
      async resolve(_source, _args, context, queryInfo) {
        try {
          return await getUserFromSessionToken(context, queryInfo, 'user.', false);
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
