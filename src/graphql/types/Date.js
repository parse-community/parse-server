import {
  GraphQLScalarType
} from 'graphql'

// http://graphql.org/graphql-js/type/#graphqlscalartype
export const GraphQLDate = new GraphQLScalarType({
  name: 'Date',
  serialize: (obj) => {
    if (typeof a === 'string') {
      return new Date(obj);
    }
    return obj;
  },
  parseValue: () => {
    throw "Date parseValue not implemented"
  },
  parseLiteral: () => {
    throw "Date parseLiteral not implemented"
  }
});
