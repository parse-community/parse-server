import {
  //GraphQLObjectType,
  //GraphQLInputObjectType,
  GraphQLScalarType,
  GraphQLID,
  GraphQLString,
} from 'graphql'

export const GraphQLPointer = new GraphQLScalarType({
  name: 'Pointer',
  fields: {
    objectId: {
      type: GraphQLID,
      name: 'objectId',
      description: 'pointer\'s objectId'
    },
    className: {
      type: GraphQLString,
      name: 'className',
      description: 'pointer\'s className'
    }
  },
  serialize: () => {
    throw "serialize not implemented"
  },
  parseValue: () => {
    throw "parseValue not implemented"
  },
  parseLiteral: (litteral) => {
    return { objectId: litteral.value };
  }
});

export const GraphQLPointerInput = GraphQLPointer;
