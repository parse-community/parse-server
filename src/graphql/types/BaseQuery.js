import {
  GraphQLList,
  GraphQLBoolean
} from 'graphql'

export const BaseQuery = (type) => {
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
    }
  };
}

export default {
  BaseQuery,
}
