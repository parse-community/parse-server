import {
  GraphQLScalarType,
  Kind
} from 'graphql'

import {
  ComparableQuery
} from './NumberQuery';

export const Date = new GraphQLScalarType({
  name: 'Date',
  serialize: (obj) => {
    if (typeof obj === 'object' && obj.__type === 'Date') {
      return new global.Date(obj.iso);
    } else if (typeof obj === 'string' || typeof obj === 'number') {
      return new global.Date(obj);
    }
    throw `Cannot serialize date`;
  },
  parseValue: (value) => {
    const date = new global.Date(value);
    return { iso: date.toISOString(), __type: 'Date' };
  },
  parseLiteral: (node) => {
    if (node.kind === Kind.STRING) {
      const date = new global.Date(node.value);
      return { iso: date.toISOString(), __type: 'Date' };
    }
    throw `Cannot parse date of type ${node.kind}`;
  }
});

export const DateQuery = ComparableQuery('DateQuery', Date);
