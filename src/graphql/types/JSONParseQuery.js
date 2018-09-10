import { GraphQLString, GraphQLInputObjectType, GraphQLNonNull } from 'graphql';
import { JSONObject } from './JSONObject';

export const JSONParseQuery = new GraphQLInputObjectType({
  name: 'JSONParseQuery',
  fields: {
    where: {
      type: new GraphQLNonNull(JSONObject),
    },
    className: {
      type: new GraphQLNonNull(GraphQLString),
    },
  },
});
