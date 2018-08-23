import {
  GraphQLInputObjectType,
  GraphQLID,
  GraphQLString,
  GraphQLNonNull,
} from 'graphql'

export const GraphQLPointer = new GraphQLInputObjectType({
  name: 'Pointer',
  fields: {
    objectId: {
      type: new GraphQLNonNull(GraphQLID),
      description: 'pointer\'s objectId'
    },
    className: {
      type: GraphQLString,
      description: 'pointer\'s className'
    }
  }
});

const cache = {};

export const GraphQLPointerInput = (field) => {
  if (!cache[field.targetClass]) {
    cache[field.targetClass] = new GraphQLInputObjectType({
      name: `${field.targetClass}PointerInput`,
      fields: {
        objectId: {
          type: new GraphQLNonNull(GraphQLID),
          description: 'pointer\'s objectId'
        },
        className: {
          type: GraphQLString,
          description: 'pointer\'s className',
          defaultValue: field.targetClass
        }
      }
    });
  }
  return cache[field.targetClass];
};
