import { GraphQLNonNull, GraphQLObjectType } from 'graphql';
import { USER_RESULT } from './defaultGraphQLTypes';
import getFieldNames from 'graphql-list-fields';
import UserRouter from '../../Routers/UsersRouter';

const load = parseGraphQLSchema => {
  parseGraphQLSchema.graphQLUsersQueries.me = {
    description:
      'The find query can be used to find objects of a certain class.',
    type: new GraphQLNonNull(USER_RESULT),
    async resolve(_source, args, context, queryInfo) {
      try {
        const { config, auth, info } = context;
        const selectedFields = getFieldNames(queryInfo);
        const req = {
          config,
          auth,
          info,
        };
        const user = (await new UserRouter().handleMe(req)).response;
        const response = Object.entries(user).reduce(
          (fields, [field, value]) => {
            if (selectedFields.includes(field)) {
              fields[field] = value;
            }
            return fields;
          },
          {}
        );
        return response;
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    },
  };

  const usersQuery = new GraphQLObjectType({
    name: 'UsersQuery',
    description: 'UsersQuery is the top level type for users queries.',
    fields: parseGraphQLSchema.graphQLUsersQueries,
  });
  parseGraphQLSchema.graphQLTypes.push(usersQuery);

  parseGraphQLSchema.graphQLQueries.users = {
    description: 'This is the top level for users queries.',
    type: usersQuery,
    resolve: () => new Object(),
  };
};

export { load };
