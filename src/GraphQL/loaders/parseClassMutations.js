import { GraphQLNonNull } from 'graphql';
import getFieldNames from 'graphql-list-fields';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import * as parseClassTypes from './parseClassTypes';
import * as objectsMutations from './objectsMutations';
import * as objectsQueries from './objectsQueries';
import { ParseGraphQLClassConfig } from '../../Controllers/ParseGraphQLController';
import { transformClassNameToGraphQL } from '../transformers/className';

const getParseClassMutationConfig = function(
  parseClassConfig: ?ParseGraphQLClassConfig
) {
  return (parseClassConfig && parseClassConfig.mutation) || {};
};

const getOnlyRequiredFields = (
  updatedFields,
  selectedFieldsString,
  includedFieldsString,
  nativeObjectFields
) => {
  const includedFields = includedFieldsString.split(',');
  const selectedFields = selectedFieldsString.split(',');
  const missingFields = selectedFields
    .filter(
      field =>
        (!updatedFields[field] && !nativeObjectFields.includes(field)) ||
        includedFields.includes(field)
    )
    .join(',');
  if (!missingFields.length) {
    return { needGet: false, keys: '' };
  } else {
    return { needGet: true, keys: missingFields };
  }
};

const load = function(
  parseGraphQLSchema,
  parseClass,
  parseClassConfig: ?ParseGraphQLClassConfig
) {
  const className = transformClassNameToGraphQL(parseClass.className);

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
        input: createFields,
      },
      type: new GraphQLNonNull(classGraphQLOutputType),
      async resolve(_source, args, context, mutationInfo) {
        try {
          let { input: fields } = args;
          if (!fields) fields = {};
          const { config, auth, info } = context;
          transformTypes('create', fields);
          const createdObject = await objectsMutations.createObject(
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
          const { keys: requiredKeys, needGet } = getOnlyRequiredFields(
            fields,
            keys,
            include,
            ['objectId', 'createdAt', 'updatedAt']
          );
          let optimizedObject = {};
          if (needGet) {
            optimizedObject = await objectsQueries.getObject(
              className,
              createdObject.objectId,
              requiredKeys,
              include,
              undefined,
              undefined,
              config,
              auth,
              info
            );
          }
          return {
            ...createdObject,
            updatedAt: createdObject.createdAt,
            ...fields,
            ...optimizedObject,
          };
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
        input: updateFields,
      },
      type: new GraphQLNonNull(classGraphQLOutputType),
      async resolve(_source, args, context, mutationInfo) {
        try {
          const { objectId, input: fields } = args;
          const { config, auth, info } = context;

          transformTypes('update', fields);

          const updatedObject = await objectsMutations.updateObject(
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

          const { keys: requiredKeys, needGet } = getOnlyRequiredFields(
            fields,
            keys,
            include,
            ['objectId', 'updatedAt']
          );
          let optimizedObject = {};
          if (needGet) {
            optimizedObject = await objectsQueries.getObject(
              className,
              objectId,
              requiredKeys,
              include,
              undefined,
              undefined,
              config,
              auth,
              info
            );
          }
          return { ...updatedObject, ...fields, ...optimizedObject };
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

          let optimizedObject = {};
          const splitedKeys = keys.split(',');
          if (splitedKeys.length > 1 || splitedKeys[0] !== 'objectId') {
            optimizedObject = await objectsQueries.getObject(
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
          }
          await objectsMutations.deleteObject(
            className,
            objectId,
            config,
            auth,
            info
          );
          return { objectId: objectId, ...optimizedObject };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    };
  }
};

export { load };
