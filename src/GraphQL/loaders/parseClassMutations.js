import { GraphQLNonNull } from 'graphql';
import getFieldNames from 'graphql-list-fields';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import * as parseClassTypes from './parseClassTypes';
import * as objectsMutations from './objectsMutations';
import * as objectsQueries from './objectsQueries';
import { ParseGraphQLClassConfig } from '../../Controllers/ParseGraphQLController';

const getParseClassMutationConfig = function(
  parseClassConfig: ?ParseGraphQLClassConfig
) {
  return (parseClassConfig && parseClassConfig.mutation) || {};
};

const load = function(
  parseGraphQLSchema,
  parseClass,
  parseClassConfig: ?ParseGraphQLClassConfig
) {
  const { className } = parseClass;
  const {
    create: isCreateEnabled = true,
    update: isUpdateEnabled = true,
    destroy: isDestroyEnabled = true,
  } = getParseClassMutationConfig(parseClassConfig);

  const {
    classGraphQLCreateType,
    classGraphQLUpdateType,
    classGraphQLOutputType,
  } = parseGraphQLSchema.parseClassTypes[className];

  const createFields = {
    description: 'These are the fields used to create the object.',
    type: classGraphQLCreateType,
  };
  const updateFields = {
    description: 'These are the fields used to update the object.',
    type: classGraphQLUpdateType,
  };

  const classGraphQLCreateTypeFields = isCreateEnabled
    ? classGraphQLCreateType.getFields()
    : null;
  const classGraphQLUpdateTypeFields = isUpdateEnabled
    ? classGraphQLUpdateType.getFields()
    : null;

  const transformTypes = (inputType: 'create' | 'update', fields) => {
    if (fields) {
      Object.keys(fields).forEach(field => {
        let inputTypeField;
        if (inputType === 'create') {
          inputTypeField = classGraphQLCreateTypeFields[field];
        } else {
          inputTypeField = classGraphQLUpdateTypeFields[field];
        }
        if (inputTypeField) {
          switch (inputTypeField.type) {
            case defaultGraphQLTypes.GEO_POINT:
              fields[field].__type = 'GeoPoint';
              break;
            case defaultGraphQLTypes.POLYGON:
              fields[field] = {
                __type: 'Polygon',
                coordinates: fields[field].map(geoPoint => [
                  geoPoint.latitude,
                  geoPoint.longitude,
                ]),
              };
              break;
          }
        }
      });
    }
  };

  if (isCreateEnabled) {
    const createGraphQLMutationName = `create${className}`;
    parseGraphQLSchema.graphQLObjectsMutations[createGraphQLMutationName] = {
      description: `The ${createGraphQLMutationName} mutation can be used to create a new object of the ${className} class.`,
      args: {
        fields: createFields,
      },
      type: new GraphQLNonNull(classGraphQLOutputType),
      async resolve(_source, args, context, mutationInfo) {
        try {
          const { fields } = args;
          const { config, auth, info } = context;

          transformTypes('create', fields);
          const { objectId } = await objectsMutations.createObject(
            className,
            fields,
            config,
            auth,
            info
          );
          const selectedFields = getFieldNames(mutationInfo);
          const { keys, include } = parseClassTypes.extractKeysAndInclude(
            selectedFields
          );

          return await objectsQueries.getObject(
            className,
            objectId,
            keys,
            include,
            undefined,
            undefined,
            config,
            auth,
            info
          );
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    };
  }

  if (isUpdateEnabled) {
    const updateGraphQLMutationName = `update${className}`;
    parseGraphQLSchema.graphQLObjectsMutations[updateGraphQLMutationName] = {
      description: `The ${updateGraphQLMutationName} mutation can be used to update an object of the ${className} class.`,
      args: {
        objectId: defaultGraphQLTypes.OBJECT_ID_ATT,
        fields: updateFields,
      },
      type: new GraphQLNonNull(classGraphQLOutputType),
      async resolve(_source, args, context, mutationInfo) {
        try {
          const { objectId, fields } = args;
          const { config, auth, info } = context;

          transformTypes('update', fields);

          await objectsMutations.updateObject(
            className,
            objectId,
            fields,
            config,
            auth,
            info
          );
          const selectedFields = getFieldNames(mutationInfo);
          const { keys, include } = parseClassTypes.extractKeysAndInclude(
            selectedFields
          );

          return await objectsQueries.getObject(
            className,
            objectId,
            keys,
            include,
            undefined,
            undefined,
            config,
            auth,
            info
          );
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    };
  }

  if (isDestroyEnabled) {
    const deleteGraphQLMutationName = `delete${className}`;
    parseGraphQLSchema.graphQLObjectsMutations[deleteGraphQLMutationName] = {
      description: `The ${deleteGraphQLMutationName} mutation can be used to delete an object of the ${className} class.`,
      args: {
        objectId: defaultGraphQLTypes.OBJECT_ID_ATT,
      },
      type: new GraphQLNonNull(classGraphQLOutputType),
      async resolve(_source, args, context, mutationInfo) {
        try {
          const { objectId } = args;
          const { config, auth, info } = context;
          const selectedFields = getFieldNames(mutationInfo);
          const { keys, include } = parseClassTypes.extractKeysAndInclude(
            selectedFields
          );
          const object = await objectsQueries.getObject(
            className,
            objectId,
            keys,
            include,
            undefined,
            undefined,
            config,
            auth,
            info
          );
          await objectsMutations.deleteObject(
            className,
            objectId,
            config,
            auth,
            info
          );
          return object;
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    };
  }
};

export { load };
