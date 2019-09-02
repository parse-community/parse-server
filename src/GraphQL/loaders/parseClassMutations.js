import { GraphQLNonNull } from 'graphql';
import getFieldNames from 'graphql-list-fields';
import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import {
  extractKeysAndInclude,
  getParseClassMutationConfig,
} from '../parseGraphQLUtils';
import * as objectsMutations from '../helpers/objectsMutations';
import * as objectsQueries from '../helpers/objectsQueries';
import { ParseGraphQLClassConfig } from '../../Controllers/ParseGraphQLController';
import { transformClassNameToGraphQL } from '../transformers/className';
import { transformTypes } from '../transformers/mutation';

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

  if (isCreateEnabled) {
    const createGraphQLMutationName = `create${graphQLClassName}`;
    parseGraphQLSchema.addGraphQLMutation(createGraphQLMutationName, {
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

          const parseFields = await transformTypes('create', fields, {
            className,
            parseGraphQLSchema,
            req: { config, auth, info },
          });

          const createdObject = await objectsMutations.createObject(
            className,
            parseFields,
            config,
            auth,
            info
          );
          const selectedFields = getFieldNames(mutationInfo);
          const { keys, include } = extractKeysAndInclude(selectedFields);
          const { keys: requiredKeys, needGet } = getOnlyRequiredFields(
            fields,
            keys,
            include,
            ['id', 'createdAt', 'updatedAt']
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
    parseGraphQLSchema.addGraphQLMutation(updateGraphQLMutationName, {
      description: `The ${updateGraphQLMutationName} mutation can be used to update an object of the ${graphQLClassName} class.`,
      args: {
        id: defaultGraphQLTypes.OBJECT_ID_ATT,
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
          const { id, fields } = args;
          const { config, auth, info } = context;

          const parseFields = await transformTypes('update', fields, {
            className,
            parseGraphQLSchema,
            req: { config, auth, info },
          });

          const updatedObject = await objectsMutations.updateObject(
            className,
            id,
            parseFields,
            config,
            auth,
            info
          );
          const selectedFields = getFieldNames(mutationInfo);
          const { keys, include } = extractKeysAndInclude(selectedFields);

          const { keys: requiredKeys, needGet } = getOnlyRequiredFields(
            fields,
            keys,
            include,
            ['id', 'updatedAt']
          );
          let optimizedObject = {};
          if (needGet) {
            optimizedObject = await objectsQueries.getObject(
              className,
              id,
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
            id,
            ...updatedObject,
            ...fields,
            ...optimizedObject,
          };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    });
  }

  if (isDestroyEnabled) {
    const deleteGraphQLMutationName = `delete${graphQLClassName}`;
    parseGraphQLSchema.addGraphQLMutation(deleteGraphQLMutationName, {
      description: `The ${deleteGraphQLMutationName} mutation can be used to delete an object of the ${graphQLClassName} class.`,
      args: {
        id: defaultGraphQLTypes.OBJECT_ID_ATT,
      },
      type: new GraphQLNonNull(
        classGraphQLOutputType || defaultGraphQLTypes.OBJECT
      ),
      async resolve(_source, args, context, mutationInfo) {
        try {
          const { id } = args;
          const { config, auth, info } = context;
          const selectedFields = getFieldNames(mutationInfo);
          const { keys, include } = extractKeysAndInclude(selectedFields);

          let optimizedObject = {};
          const splitedKeys = keys.split(',');
          if (splitedKeys.length > 1 || splitedKeys[0] !== 'id') {
            optimizedObject = await objectsQueries.getObject(
              className,
              id,
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
            id,
            config,
            auth,
            info
          );
          return { id, ...optimizedObject };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    });
  }
};

export { load };
