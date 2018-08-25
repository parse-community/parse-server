import {
  GraphQLInputObjectType,
  GraphQLFloat,
} from 'graphql'

import { BaseQuery } from './BaseQuery';

export const ComparableQuery = (name, type) => {
  return new GraphQLInputObjectType({
    name: name,
    fields: Object.assign({}, BaseQuery(type), {
      lt: {
        type: type
      },
      gt: {
        type: type
      },
      lte: {
        type: type
      },
      gte: {
        type: type
      }
    }),
  });
};

export const NumberQuery = ComparableQuery('NumberQuery', GraphQLFloat);
