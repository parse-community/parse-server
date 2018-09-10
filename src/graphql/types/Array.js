import { GraphQLInputObjectType, GraphQLList } from 'graphql';
import { JSONObject } from './JSONObject';

import { BaseQuery } from './BaseQuery';

export const ArrayQuery = new GraphQLInputObjectType({
  name: 'ArrayQuery',
  fields: Object.assign({}, BaseQuery(JSONObject), {
    eq: {
      type: JSONObject,
      description: 'Test for equality',
    },
    all: {
      type: GraphQLList(JSONObject),
      description:
        'Constraints that require the array to contain all the values',
    },
  }),
});
