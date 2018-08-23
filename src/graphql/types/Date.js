import {
  GraphQLScalarType,
  Kind
} from 'graphql'

import {
  ComparableQuery
} from './NumberQuery';

export const GraphQLDate = new GraphQLScalarType({
  name: 'Date',
  serialize: (obj) => {
    if (typeof obj === 'string') {
      return new Date(obj);
    }
    return obj;
  },
  parseValue: () => {
    throw "Date parseValue not implemented"
  },
  parseLiteral: (node) => {
    if (node.kind === Kind.STRING) {
      return new Date(node.value);
    }
    throw `Cannot parse date of type ${node.kind}`;
  }
});

export const DateQuery = ComparableQuery('DateQuery', GraphQLDate);
