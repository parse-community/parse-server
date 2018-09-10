import {
  GraphQLInputObjectType,
  GraphQLID,
  GraphQLString,
  GraphQLNonNull,
} from 'graphql';

import { JSONParseQuery } from './JSONParseQuery';

import { getOrElse } from '../typesCache';

export const Pointer = new GraphQLInputObjectType({
  name: 'Pointer',
  fields: {
    objectId: {
      type: new GraphQLNonNull(GraphQLID),
      description: "pointer's objectId",
    },
    className: {
      type: GraphQLString,
      description: "pointer's className",
    },
  },
});

export const PointerInput = field => {
  const name = `${field.targetClass}PointerInput`;
  return getOrElse(
    name,
    () =>
      new GraphQLInputObjectType({
        name,
        fields: {
          objectId: {
            type: new GraphQLNonNull(GraphQLID),
            description: "pointer's objectId",
          },
          className: {
            type: GraphQLString,
            description: "pointer's className",
            defaultValue: field.targetClass,
          },
        },
      })
  );
};

export const PointerQuery = field => {
  const name = `${field.targetClass}PointerQuery`;
  return getOrElse(
    name,
    () =>
      new GraphQLInputObjectType({
        name,
        fields: {
          eq: {
            type: PointerInput(field),
          },
          inQuery: {
            type: JSONParseQuery,
          },
          notInQuery: {
            type: JSONParseQuery,
          },
        },
      })
  );
};
