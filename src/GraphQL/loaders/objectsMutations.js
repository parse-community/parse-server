import {
  GraphQLNonNull,
  GraphQLString,
  GraphQLID,
  GraphQLBoolean,
  GraphQLObjectType,
} from 'graphql';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import rest from '../../rest';

const load = parseGraphQLSchema => {
  const fields = {};

  fields.create = {
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
      try {
        const { className } = args;
        let { fields } = args;
        const { config, auth, info } = context;

        if (!fields) {
          fields = {};
        }

        return (await rest.create(
          config,
          auth,
          className,
          fields,
          info.clientSDK
        )).response;
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    },
  };

  fields.update = {
    description:
      'The update mutation can be used to update an object of a certain class.',
    args: {
      className: {
        description:
          'This is the class name of the object that will be updated.',
        type: new GraphQLNonNull(GraphQLString),
      },
      objectId: {
        description: 'This is the objectId of the object that will be updated',
        type: new GraphQLNonNull(GraphQLID),
      },
      fields: {
        description:
          'These are the fields to be attributed to the object in the update process.',
        type: defaultGraphQLTypes.OBJECT,
      },
    },
    type: new GraphQLNonNull(defaultGraphQLTypes.UPDATE_RESULT),
    async resolve(_source, args, context) {
      try {
        const { className, objectId } = args;
        let { fields } = args;
        const { config, auth, info } = context;

        if (!fields) {
          fields = {};
        }

        return (await rest.update(
          config,
          auth,
          className,
          { objectId },
          fields,
          info.clientSDK
        )).response;
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    },
  };

  fields.delete = {
    description:
      'The delete mutation can be used to delete an object of a certain class.',
    args: {
      className: {
        description: 'This is the class name of the object to be deleted.',
        type: new GraphQLNonNull(GraphQLString),
      },
      objectId: {
        description: 'This is the objectId of the object to be deleted.',
        type: new GraphQLNonNull(GraphQLID),
      },
    },
    type: new GraphQLNonNull(GraphQLBoolean),
    async resolve(_source, args, context) {
      try {
        const { className, objectId } = args;
        const { config, auth, info } = context;

        await rest.del(config, auth, className, objectId, info.clientSDK);

        return true;
      } catch (e) {
        parseGraphQLSchema.handleError(e);
      }
    },
  };

  const objectsMutation = new GraphQLObjectType({
    name: 'ObjectsMutation',
    description: 'ObjectsMutation is the top level type for objects mutations.',
    fields,
  });
  parseGraphQLSchema.graphQLTypes.push(objectsMutation);

  parseGraphQLSchema.graphQLMutations.objects = {
    description: 'This is the top level for objects mutations.',
    type: objectsMutation,
    resolve: () => new Object(),
  };
};

export { load };
