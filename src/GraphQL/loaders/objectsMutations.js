import { GraphQLNonNull, GraphQLBoolean } from 'graphql';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import rest from '../../rest';

const createObject = async (className, fields, config, auth, info) => {
  if (!fields) {
    fields = {};
  }

  return (await rest.create(config, auth, className, fields, info.clientSDK))
    .response;
};

const updateObject = async (
  className,
  objectId,
  fields,
  config,
  auth,
  info
) => {
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
};

const deleteObject = async (className, objectId, config, auth, info) => {
  await rest.del(config, auth, className, objectId, info.clientSDK);
  return true;
};

const load = parseGraphQLSchema => {
  parseGraphQLSchema.addGraphQLMutation(
    'create',
    {
      description:
        'The create mutation can be used to create a new object of a certain class.',
      args: {
        className: defaultGraphQLTypes.CLASS_NAME_ATT,
        fields: defaultGraphQLTypes.FIELDS_ATT,
      },
      type: new GraphQLNonNull(defaultGraphQLTypes.CREATE_RESULT),
      async resolve(_source, args, context) {
        try {
          const { className, fields } = args;
          const { config, auth, info } = context;

          return await createObject(className, fields, config, auth, info);
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    },
    true,
    true
  );

  parseGraphQLSchema.addGraphQLMutation(
    'update',
    {
      description:
        'The update mutation can be used to update an object of a certain class.',
      args: {
        className: defaultGraphQLTypes.CLASS_NAME_ATT,
        objectId: defaultGraphQLTypes.OBJECT_ID_ATT,
        fields: defaultGraphQLTypes.FIELDS_ATT,
      },
      type: new GraphQLNonNull(defaultGraphQLTypes.UPDATE_RESULT),
      async resolve(_source, args, context) {
        try {
          const { className, objectId, fields } = args;
          const { config, auth, info } = context;

          return await updateObject(
            className,
            objectId,
            fields,
            config,
            auth,
            info
          );
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    },
    true,
    true
  );

  parseGraphQLSchema.addGraphQLMutation(
    'delete',
    {
      description:
        'The delete mutation can be used to delete an object of a certain class.',
      args: {
        className: defaultGraphQLTypes.CLASS_NAME_ATT,
        objectId: defaultGraphQLTypes.OBJECT_ID_ATT,
      },
      type: new GraphQLNonNull(GraphQLBoolean),
      async resolve(_source, args, context) {
        try {
          const { className, objectId } = args;
          const { config, auth, info } = context;

          return await deleteObject(className, objectId, config, auth, info);
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    },
    true,
    true
  );
};

export { createObject, updateObject, deleteObject, load };
