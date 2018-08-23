import {
  GraphQLInputObjectType,
  GraphQLString,
} from 'graphql'

import { BaseQuery } from './QueryConstraint';

export const StringQuery = new GraphQLInputObjectType({
  name: 'StringQuery',
  fields: Object.assign({}, BaseQuery(GraphQLString), {
    regex: {
      type: GraphQLString
    }
  }),
});
