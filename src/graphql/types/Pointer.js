import {
  //GraphQLObjectType,
  //GraphQLInputObjectType,
  GraphQLScalarType,
  GraphQLID,
  GraphQLString,
} from 'graphql'
/* eslint-disable */
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
  parseLiteral: (l, a,b) => {
    console.log('parse-literal!', l,a,b);
    //console.log(a,b,c);
    //throw "parseLiteral not implemented"
    return {objectId: l.value };
  }
});

export const GraphQLPointerInput = GraphQLPointer; /*new GraphQLInputObjectType({
  name: 'PointerInput',
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
  }
});*/
