import { GraphQLNonNull, GraphQLBoolean, GraphQLObjectType } from 'graphql';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import rest from '../../rest';

const parseMap = {
  _op: '__op',
};

const transformToParse = fields => {
  if (!fields || typeof fields !== 'object') {
    return;
  }
  Object.keys(fields).forEach(fieldName => {
    const fieldValue = fields[fieldName];
    if (parseMap[fieldName]) {
      delete fields[fieldName];
      fields[parseMap[fieldName]] = fieldValue;
    }
    if (typeof fieldValue === 'object') {
      transformToParse(fieldValue);
    }
  });
};

const createObject = async (className, fields, config, auth, info) => {
  if (!fields) {
    fields = {};
  }

  transformToParse(fields);

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

  transformToParse(fields);

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
  parseGraphQLSchema.graphQLObjectsMutations.create = {
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
  };

  parseGraphQLSchema.graphQLObjectsMutations.update = {
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
  };

  parseGraphQLSchema.graphQLObjectsMutations.delete = {
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
  };

  const objectsMutation = new GraphQLObjectType({
    name: 'ObjectsMutation',
    description: 'ObjectsMutation is the top level type for objects mutations.',
    fields: parseGraphQLSchema.graphQLObjectsMutations,
  });
  parseGraphQLSchema.graphQLTypes.push(objectsMutation);

  parseGraphQLSchema.graphQLMutations.objects = {
    description: 'This is the top level for objects mutations.',
    type: objectsMutation,
    resolve: () => new Object(),
  };
};

export { createObject, updateObject, deleteObject, load };
