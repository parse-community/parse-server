import {
  GraphQLNonNull,
  GraphQLString,
  GraphQLID,
  GraphQLBoolean,
} from 'graphql';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import rest from '../../rest';

// const SIGN_UP = {
//   description: '',
//   type: null,
//   resolve: () => {},
// };

const CREATE = {
  description:
    'The create mutation can be used to create a new object of a certain class.',
  args: {
    className: {
      description: 'This is the class name of the new object.',
      type: new GraphQLNonNull(GraphQLString),
    },
    fields: {
      description: 'These are the fields to be attributed to the new object.',
      type: defaultGraphQLTypes.OBJECT,
    },
  },
  type: new GraphQLNonNull(defaultGraphQLTypes.CREATE_RESULT),
  async resolve(_source, args, context) {
    const { className } = args;
    let { fields } = args;

    if (!fields) {
      fields = {};
    }

    const { config, auth, info } = context;

    return (await rest.create(config, auth, className, fields, info.clientSDK))
      .response;
  },
};

const DELETE = {
  description:
    'The delete mutation can be used to delete an object of a certain class.',
  args: {
    className: {
      description: 'This is the class name of the object to be deleted.',
      type: new GraphQLNonNull(GraphQLString),
    },
    objectId: {
      description: 'This is the objectIt of the object to be deleted.',
      type: new GraphQLNonNull(GraphQLID),
    },
  },
  type: new GraphQLNonNull(GraphQLBoolean),
  async resolve(_source, args, context) {
    const { className, objectId } = args;

    const { config, auth, info } = context;

    await rest.del(config, auth, className, objectId, info.clientSDK);

    return true;
  },
};

const load = parseGraphQLSchema => {
  //parseGraphQLSchema.graphQLMutations.signUp = SIGN_UP;

  parseGraphQLSchema.graphQLMutations.create = CREATE;
  parseGraphQLSchema.graphQLMutations.delete = DELETE;
};

export { load };
