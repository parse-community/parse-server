import { GraphQLString, GraphQLInputObjectType, GraphQLNonNull } from 'graphql';
import { JSONObject } from './JSONObject';

export const SelectQuery = new GraphQLInputObjectType({
  name: 'SelectQuery',
  fields: {
    query: {
      type: new GraphQLNonNull(
        new GraphQLInputObjectType({
          name: 'JSONQuery',
          fields: {
            where: {
              type: new GraphQLNonNull(JSONObject),
            },
            className: {
              type: new GraphQLNonNull(GraphQLString),
            },
          },
        })
      ),
    },
    key: {
      type: new GraphQLNonNull(GraphQLString),
    },
  },
});
