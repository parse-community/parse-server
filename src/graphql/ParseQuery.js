import {
  GraphQLInputObjectType,
  GraphQLFloat,
  GraphQLString,
} from 'graphql'

const FloatKeyValIT = new GraphQLInputObjectType({
  name: 'FloatConstraint',
  fields: {
    key: { type: GraphQLString },
    value: { type: GraphQLFloat }
  }
});

const StringKeyValIT = new GraphQLInputObjectType({
  name: 'StringConstraint',
  fields: {
    key: { type: GraphQLString },
    value: { type: GraphQLString }
  }
});

export const ParseQuery = {
  whereLessThan: {
    type: FloatKeyValIT,
    args: FloatKeyValIT.fields,
    description: ''
  },
  whereGreaterThan: {
    type: FloatKeyValIT,
    args: FloatKeyValIT.fields
  },
  whereLessThanOrEqualTo: {
    type: FloatKeyValIT,
    args: FloatKeyValIT.fields
  },
  whereGreaterThanOrEqualTo: {
    type: FloatKeyValIT,
    args: FloatKeyValIT.fields
  },
  whereMatches: {
    type: StringKeyValIT,
    args: StringKeyValIT.fields
  },
  whereExists: {
    type: GraphQLString,
    args: { key: GraphQLString }
  },
  whereDoesNotExist: {
    type: GraphQLString,
    args: { key: GraphQLString }
  },
  whereStartsWith: {
    type: StringKeyValIT,
    args: StringKeyValIT.fields
  },
  whereEndsWith: {
    type: StringKeyValIT,
    args: StringKeyValIT.fields
  }
};

/* eslint-disable */

export const AtomicOps = {
  incrementKey: {
    type: FloatKeyValIT,
    args: FloatKeyValIT.fields
  },
  unsetKey: {
    type: GraphQLString,
    args: { key: GraphQLString }
  }
}
