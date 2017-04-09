import {
  GraphQLScalarType,
  GraphQLList,
  GraphQLString
} from 'graphql'

export const GraphQLACL = new GraphQLScalarType({
  name: 'ACL',
  fields: {
    read: {
      type: new GraphQLList(GraphQLString),
      name: 'read',
      description: 'Read access for the object'
    },
    write: {
      type: new GraphQLList(GraphQLString),
      name: 'write',
      description: 'Write access for the object'
    }
  },
  serialize: () => {
    throw "not implemented"
  },
  parseValue: () => {
    throw "not implemented"
  },
  parseLiteral: () => {
    throw "not implemented"
  }
});

export const GraphQLACLInput = GraphQLACL;
