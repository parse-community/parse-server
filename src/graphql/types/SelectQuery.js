import { GraphQLString, GraphQLInputObjectType, GraphQLNonNull } from 'graphql';
import { JSONParseQuery } from './JSONParseQuery';

export const SelectQuery = new GraphQLInputObjectType({
  name: 'SelectQuery',
  fields: {
    query: {
      type: new GraphQLNonNull(JSONParseQuery),
    },
    key: {
      type: new GraphQLNonNull(GraphQLString),
    },
  },
});
