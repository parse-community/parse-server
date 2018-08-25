import {
  GraphQLInputObjectType,
  GraphQLID,
  GraphQLString,
  GraphQLNonNull,
} from 'graphql'

import {
  getOrElse,
} from '../typesCache';

export const Pointer = new GraphQLInputObjectType({
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

export const PointerInput = (field) => {
  const name = `${field.targetClass}PointerInput`;
  return getOrElse(name, () =>
    new GraphQLInputObjectType({
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
    }));
};
