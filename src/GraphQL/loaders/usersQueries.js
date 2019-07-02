import { GraphQLNonNull, GraphQLObjectType } from 'graphql';
import getFieldNames from 'graphql-list-fields';
import Parse from 'parse/node';
import rest from '../../rest';
import Auth from '../../Auth';
import { extractKeysAndInclude } from './parseClassTypes';

const load = parseGraphQLSchema => {
  const fields = {};

  fields.me = {
    description: 'The Me query can be used to return the current user data.',
    type: new GraphQLNonNull(parseGraphQLSchema.meType),
    async resolve(_source, _args, context, queryInfo) {
      try {
        const { config, info } = context;

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
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    },
  };

  const usersQuery = new GraphQLObjectType({
    name: 'UsersQuery',
    description: 'UsersQuery is the top level type for users queries.',
    fields,
  });
  parseGraphQLSchema.graphQLTypes.push(usersQuery);

  parseGraphQLSchema.graphQLQueries.users = {
    description: 'This is the top level for users queries.',
    type: usersQuery,
    resolve: () => new Object(),
  };
};

export { load };
