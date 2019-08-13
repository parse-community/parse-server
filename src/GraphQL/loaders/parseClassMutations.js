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
  const className = parseClass.className;
  const graphQLClassName = transformClassNameToGraphQL(className);

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

  const transformTypes = (inputType: 'create' | 'update', fields) => {
    if (fields) {
      const classGraphQLCreateTypeFields =
        isCreateEnabled && classGraphQLCreateType
          ? classGraphQLCreateType.getFields()
          : null;
      const classGraphQLUpdateTypeFields =
        isUpdateEnabled && classGraphQLUpdateType
          ? classGraphQLUpdateType.getFields()
          : null;
      Object.keys(fields).forEach(field => {
        let inputTypeField;
        if (inputType === 'create' && classGraphQLCreateTypeFields) {
          inputTypeField = classGraphQLCreateTypeFields[field];
        } else if (classGraphQLUpdateTypeFields) {
          inputTypeField = classGraphQLUpdateTypeFields[field];
        }
        if (inputTypeField) {
          switch (inputTypeField.type) {
            case defaultGraphQLTypes.GEO_POINT_INPUT:
              fields[field].__type = 'GeoPoint';
              break;
            case defaultGraphQLTypes.POLYGON_INPUT:
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
    const createGraphQLMutationName = `create${graphQLClassName}`;
    parseGraphQLSchema.addGraphQLObjectMutation(createGraphQLMutationName, {
      description: `The ${createGraphQLMutationName} mutation can be used to create a new object of the ${graphQLClassName} class.`,
      args: {
        fields: {
          description: 'These are the fields used to create the object.',
          type: classGraphQLCreateType || defaultGraphQLTypes.OBJECT,
        },
      },
      type: new GraphQLNonNull(
        classGraphQLOutputType || defaultGraphQLTypes.OBJECT
      ),
      async resolve(_source, args, context, mutationInfo) {
        try {
          let { fields } = args;
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
    });
  }

  if (isUpdateEnabled) {
    const updateGraphQLMutationName = `update${graphQLClassName}`;
    parseGraphQLSchema.addGraphQLObjectMutation(updateGraphQLMutationName, {
      description: `The ${updateGraphQLMutationName} mutation can be used to update an object of the ${graphQLClassName} class.`,
      args: {
        objectId: defaultGraphQLTypes.OBJECT_ID_ATT,
        fields: {
          description: 'These are the fields used to update the object.',
          type: classGraphQLUpdateType || defaultGraphQLTypes.OBJECT,
        },
      },
      type: new GraphQLNonNull(
        classGraphQLOutputType || defaultGraphQLTypes.OBJECT
      ),
      async resolve(_source, args, context, mutationInfo) {
        try {
          const { objectId, fields } = args;
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
    });
  }

  if (isDestroyEnabled) {
    const deleteGraphQLMutationName = `delete${graphQLClassName}`;
    parseGraphQLSchema.addGraphQLObjectMutation(deleteGraphQLMutationName, {
      description: `The ${deleteGraphQLMutationName} mutation can be used to delete an object of the ${graphQLClassName} class.`,
      args: {
        objectId: defaultGraphQLTypes.OBJECT_ID_ATT,
      },
      type: new GraphQLNonNull(
        classGraphQLOutputType || defaultGraphQLTypes.OBJECT
      ),
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
    });
  }
};

export { load };
