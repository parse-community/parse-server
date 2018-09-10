import { GraphQLList, GraphQLBoolean } from 'graphql';
import { SelectQuery } from './SelectQuery';

export const BaseQuery = type => {
  return {
    eq: {
      type,
      description: 'Test for equality',
    },
    neq: {
      type,
      description: 'Test for non equality',
    },
    in: {
      type: new GraphQLList(type),
      description: 'Test that the object is contained in',
    },
    nin: {
      type: new GraphQLList(type),
    },
    exists: {
      type: GraphQLBoolean,
    },
    select: {
      type: SelectQuery,
      description:
        'This matches a value for a key in the result of a different query',
    },
    dontSelect: {
      type: SelectQuery,
      description:
        'Requires that a key’s value not match a value for a key in the result of a different query',
    },
  };
};

export default {
  BaseQuery,
};
