import Parse from 'parse/node';
import { GraphQLNonNull, GraphQLList, GraphQLBoolean, GraphQLObjectType } from 'graphql';
import { fromGlobalId, mutationWithClientMutationId } from 'graphql-relay';
import getFieldNames from 'graphql-list-fields';

import * as defaultGraphQLTypes from './defaultGraphQLTypes';
import { extractKeysAndInclude, getParseClassMutationConfig, cloneArgs } from '../parseGraphQLUtils';
import * as objectsMutations from '../helpers/objectsMutations';
import * as objectsQueries from '../helpers/objectsQueries';
import { ParseGraphQLClassConfig } from '../../Controllers/ParseGraphQLController';
import { transformClassNameToGraphQL } from '../transformers/className';
import { transformTypes } from '../transformers/mutation';
import { createSanitizedError } from '../../Error';
import { getBatchRequestLimit, isBatchRequestLimitExceeded } from '../../batchRequestLimit';

const bulkErrorFromReason = reason => {
  if (reason instanceof Parse.Error) {
    return { code: reason.code, message: reason.message };
  }
  const message =
    reason && typeof reason.message === 'string' ? reason.message : 'Internal server error';
  return { code: Parse.Error.INTERNAL_SERVER_ERROR, message };
};

const normalizeObjectIdForClass = (id, className) => {
  try {
    const globalIdObject = fromGlobalId(id);
    if (globalIdObject.type === className) {
      return globalIdObject.id;
    }
  } catch {
    // `id` is not a Relay global id; use as Parse objectId
  }
  return id;
};

const assertBulkInputLength = (count, config, auth) => {
  if (count === 0) {
    throw createSanitizedError(
      Parse.Error.INVALID_JSON,
      'bulk input must contain at least one item',
      config
    );
  }
  if (isBatchRequestLimitExceeded(count, config, auth)) {
    const batchRequestLimit = getBatchRequestLimit(config);
    throw new Parse.Error(
      Parse.Error.INVALID_JSON,
      `bulk input contains ${count} items, which exceeds the limit of ${batchRequestLimit}.`
    );
  }
};

const filterDeletedFields = fields =>
  Object.keys(fields).reduce((acc, key) => {
    if (typeof fields[key] === 'object' && fields[key]?.__op === 'Delete') {
      acc[key] = null;
    }
    return acc;
  }, fields);

const getOnlyRequiredFields = (
  updatedFields,
  selectedFieldsString,
  includedFieldsString,
  nativeObjectFields
) => {
  const includedFields = includedFieldsString ? includedFieldsString.split(',') : [];
  const selectedFields = selectedFieldsString ? selectedFieldsString.split(',') : [];
  const missingFields = selectedFields
    .filter(field => !nativeObjectFields.includes(field) || includedFields.includes(field))
    .join(',');
  if (!missingFields.length) {
    return { needGet: false, keys: '' };
  } else {
    return { needGet: true, keys: missingFields };
  }
};

const load = function (parseGraphQLSchema, parseClass, parseClassConfig: ?ParseGraphQLClassConfig) {
  const className = parseClass.className;
  const graphQLClassName = transformClassNameToGraphQL(className);
  const getGraphQLQueryName = graphQLClassName.charAt(0).toLowerCase() + graphQLClassName.slice(1);

  const {
    create: isCreateEnabled = true,
    update: isUpdateEnabled = true,
    destroy: isDestroyEnabled = true,
    createAlias: createAlias = '',
    updateAlias: updateAlias = '',
    destroyAlias: destroyAlias = '',
  } = getParseClassMutationConfig(parseClassConfig);

  const createManyExplicit = parseClassConfig?.mutation?.createMany;
  const updateManyExplicit = parseClassConfig?.mutation?.updateMany;
  const deleteManyExplicit = parseClassConfig?.mutation?.deleteMany;
  const isCreateManyEnabled = createManyExplicit !== undefined ? createManyExplicit : isCreateEnabled;
  const isUpdateManyEnabled = updateManyExplicit !== undefined ? updateManyExplicit : isUpdateEnabled;
  const isDeleteManyEnabled = deleteManyExplicit !== undefined ? deleteManyExplicit : isDestroyEnabled;
  const allowCreateMany =
    isCreateManyEnabled && (isCreateEnabled || createManyExplicit === true);
  const allowUpdateMany =
    isUpdateManyEnabled && (isUpdateEnabled || updateManyExplicit === true);
  const allowDeleteMany =
    isDeleteManyEnabled && (isDestroyEnabled || deleteManyExplicit === true);
  const createManyAliasCfg = parseClassConfig?.mutation?.createManyAlias || '';
  const updateManyAliasCfg = parseClassConfig?.mutation?.updateManyAlias || '';
  const deleteManyAliasCfg = parseClassConfig?.mutation?.deleteManyAlias || '';

  const {
    classGraphQLCreateType,
    classGraphQLUpdateType,
    classGraphQLUpdateManyItemType,
    classGraphQLOutputType,
  } = parseGraphQLSchema.parseClassTypes[className];

  if (isCreateEnabled) {
    const createGraphQLMutationName = createAlias || `create${graphQLClassName}`;
    const createGraphQLMutation = mutationWithClientMutationId({
      name: `Create${graphQLClassName}`,
      description: `The ${createGraphQLMutationName} mutation can be used to create a new object of the ${graphQLClassName} class.`,
      inputFields: {
        fields: {
          description: 'These are the fields that will be used to create the new object.',
          type: classGraphQLCreateType || defaultGraphQLTypes.OBJECT,
        },
      },
      outputFields: {
        [getGraphQLQueryName]: {
          description: 'This is the created object.',
          type: new GraphQLNonNull(classGraphQLOutputType || defaultGraphQLTypes.OBJECT),
        },
      },
      mutateAndGetPayload: async (args, context, mutationInfo) => {
        try {
          let { fields } = cloneArgs(args);
          if (!fields) { fields = {}; }
          const { config, auth, info } = context;

          const parseFields = await transformTypes('create', fields, {
            className,
            parseGraphQLSchema,
            originalFields: args.fields,
            req: { config, auth, info },
          });

          const createdObject = await objectsMutations.createObject(
            className,
            parseFields,
            config,
            auth,
            info
          );
          const selectedFields = getFieldNames(mutationInfo)
            .filter(field => field.startsWith(`${getGraphQLQueryName}.`))
            .map(field => field.replace(`${getGraphQLQueryName}.`, ''));
          const { keys, include } = extractKeysAndInclude(selectedFields);
          const { keys: requiredKeys, needGet } = getOnlyRequiredFields(fields, keys, include, [
            'id',
            'objectId',
            'createdAt',
            'updatedAt',
          ]);
          const needToGetAllKeys = objectsQueries.needToGetAllKeys(
            parseClass.fields,
            keys,
            parseGraphQLSchema.parseClasses
          );
          let optimizedObject = {};
          if (needGet && !needToGetAllKeys) {
            optimizedObject = await objectsQueries.getObject(
              className,
              createdObject.objectId,
              requiredKeys,
              include,
              undefined,
              undefined,
              config,
              auth,
              info,
              parseGraphQLSchema.parseClasses
            );
          } else if (needToGetAllKeys) {
            optimizedObject = await objectsQueries.getObject(
              className,
              createdObject.objectId,
              undefined,
              include,
              undefined,
              undefined,
              config,
              auth,
              info,
              parseGraphQLSchema.parseClasses
            );
          }
          return {
            [getGraphQLQueryName]: {
              ...createdObject,
              updatedAt: createdObject.createdAt,
              ...filterDeletedFields(parseFields),
              ...optimizedObject,
            },
          };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    });

    if (
      parseGraphQLSchema.addGraphQLType(createGraphQLMutation.args.input.type.ofType) &&
      parseGraphQLSchema.addGraphQLType(createGraphQLMutation.type)
    ) {
      parseGraphQLSchema.addGraphQLMutation(createGraphQLMutationName, createGraphQLMutation);
    }
  }

  if (isUpdateEnabled) {
    const updateGraphQLMutationName = updateAlias || `update${graphQLClassName}`;
    const updateGraphQLMutation = mutationWithClientMutationId({
      name: `Update${graphQLClassName}`,
      description: `The ${updateGraphQLMutationName} mutation can be used to update an object of the ${graphQLClassName} class.`,
      inputFields: {
        id: defaultGraphQLTypes.GLOBAL_OR_OBJECT_ID_ATT,
        fields: {
          description: 'These are the fields that will be used to update the object.',
          type: classGraphQLUpdateType || defaultGraphQLTypes.OBJECT,
        },
      },
      outputFields: {
        [getGraphQLQueryName]: {
          description: 'This is the updated object.',
          type: new GraphQLNonNull(classGraphQLOutputType || defaultGraphQLTypes.OBJECT),
        },
      },
      mutateAndGetPayload: async (args, context, mutationInfo) => {
        try {
          let { id, fields } = cloneArgs(args);
          if (!fields) { fields = {}; }
          const { config, auth, info } = context;

          id = normalizeObjectIdForClass(id, className);

          const parseFields = await transformTypes('update', fields, {
            className,
            parseGraphQLSchema,
            originalFields: args.fields,
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

          const selectedFields = getFieldNames(mutationInfo)
            .filter(field => field.startsWith(`${getGraphQLQueryName}.`))
            .map(field => field.replace(`${getGraphQLQueryName}.`, ''));
          const { keys, include } = extractKeysAndInclude(selectedFields);
          const { keys: requiredKeys, needGet } = getOnlyRequiredFields(fields, keys, include, [
            'id',
            'objectId',
            'updatedAt',
          ]);
          const needToGetAllKeys = objectsQueries.needToGetAllKeys(
            parseClass.fields,
            keys,
            parseGraphQLSchema.parseClasses
          );
          let optimizedObject = {};
          if (needGet && !needToGetAllKeys) {
            optimizedObject = await objectsQueries.getObject(
              className,
              id,
              requiredKeys,
              include,
              undefined,
              undefined,
              config,
              auth,
              info,
              parseGraphQLSchema.parseClasses
            );
          } else if (needToGetAllKeys) {
            optimizedObject = await objectsQueries.getObject(
              className,
              id,
              undefined,
              include,
              undefined,
              undefined,
              config,
              auth,
              info,
              parseGraphQLSchema.parseClasses
            );
          }
          return {
            [getGraphQLQueryName]: {
              objectId: id,
              ...updatedObject,
              ...filterDeletedFields(parseFields),
              ...optimizedObject,
            },
          };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    });

    if (
      parseGraphQLSchema.addGraphQLType(updateGraphQLMutation.args.input.type.ofType) &&
      parseGraphQLSchema.addGraphQLType(updateGraphQLMutation.type)
    ) {
      parseGraphQLSchema.addGraphQLMutation(updateGraphQLMutationName, updateGraphQLMutation);
    }
  }

  if (isDestroyEnabled) {
    const deleteGraphQLMutationName = destroyAlias || `delete${graphQLClassName}`;
    const deleteGraphQLMutation = mutationWithClientMutationId({
      name: `Delete${graphQLClassName}`,
      description: `The ${deleteGraphQLMutationName} mutation can be used to delete an object of the ${graphQLClassName} class.`,
      inputFields: {
        id: defaultGraphQLTypes.GLOBAL_OR_OBJECT_ID_ATT,
      },
      outputFields: {
        [getGraphQLQueryName]: {
          description: 'This is the deleted object.',
          type: new GraphQLNonNull(classGraphQLOutputType || defaultGraphQLTypes.OBJECT),
        },
      },
      mutateAndGetPayload: async (args, context, mutationInfo) => {
        try {
          let { id } = cloneArgs(args);
          const { config, auth, info } = context;

          id = normalizeObjectIdForClass(id, className);

          const selectedFields = getFieldNames(mutationInfo)
            .filter(field => field.startsWith(`${getGraphQLQueryName}.`))
            .map(field => field.replace(`${getGraphQLQueryName}.`, ''));
          const { keys, include } = extractKeysAndInclude(selectedFields);
          let optimizedObject = {};
          if (keys && keys.split(',').filter(key => !['id', 'objectId'].includes(key)).length > 0) {
            optimizedObject = await objectsQueries.getObject(
              className,
              id,
              keys,
              include,
              undefined,
              undefined,
              config,
              auth,
              info,
              parseGraphQLSchema.parseClasses
            );
          }
          await objectsMutations.deleteObject(className, id, config, auth, info);
          return {
            [getGraphQLQueryName]: {
              objectId: id,
              ...optimizedObject,
            },
          };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    });

    if (
      parseGraphQLSchema.addGraphQLType(deleteGraphQLMutation.args.input.type.ofType) &&
      parseGraphQLSchema.addGraphQLType(deleteGraphQLMutation.type)
    ) {
      parseGraphQLSchema.addGraphQLMutation(deleteGraphQLMutationName, deleteGraphQLMutation);
    }
  }

  if (allowCreateMany) {
    const createManyGraphQLMutationName = createManyAliasCfg || `createMany${graphQLClassName}`;
    const createManyResultsPrefix = `results.${getGraphQLQueryName}.`;
    const createManyResultItemType = new GraphQLObjectType({
      name: `CreateMany${graphQLClassName}ResultItem`,
      description: `One result entry for ${createManyGraphQLMutationName}.`,
      fields: () => ({
        success: {
          description: 'Whether this object was created successfully.',
          type: new GraphQLNonNull(GraphQLBoolean),
        },
        [getGraphQLQueryName]: {
          description: `The created object when success is true.`,
          type: classGraphQLOutputType || defaultGraphQLTypes.OBJECT,
        },
        error: {
          description: 'Present when success is false.',
          type: defaultGraphQLTypes.PARSE_GRAPHQL_BULK_ERROR,
        },
      }),
    });
    const createManyGraphQLMutation = mutationWithClientMutationId({
      name: `CreateMany${graphQLClassName}`,
      description: `The ${createManyGraphQLMutationName} mutation creates multiple objects of the ${graphQLClassName} class. Each entry succeeds or fails independently.`,
      inputFields: {
        fields: {
          description: 'List of field sets; one object will be created per element.',
          type: new GraphQLNonNull(
            new GraphQLList(new GraphQLNonNull(classGraphQLCreateType || defaultGraphQLTypes.OBJECT))
          ),
        },
      },
      outputFields: {
        results: {
          description: 'Creation results in the same order as the input list.',
          type: new GraphQLNonNull(
            new GraphQLList(new GraphQLNonNull(createManyResultItemType))
          ),
        },
      },
      mutateAndGetPayload: async (args, context, mutationInfo) => {
        try {
          let { fields: fieldsList } = cloneArgs(args);
          if (!fieldsList) {
            fieldsList = [];
          }
          const { config, auth, info } = context;
          assertBulkInputLength(fieldsList.length, config, auth);

          const settled = await Promise.allSettled(
            fieldsList.map(fieldSet =>
              (async () => {
                let fields = fieldSet ? cloneArgs({ fields: fieldSet }).fields : {};
                if (!fields) {
                  fields = {};
                }
                const parseFields = await transformTypes('create', fields, {
                  className,
                  parseGraphQLSchema,
                  originalFields: fieldSet,
                  req: { config, auth, info },
                });
                const createdObject = await objectsMutations.createObject(
                  className,
                  parseFields,
                  config,
                  auth,
                  info
                );
                const selectedFields = getFieldNames(mutationInfo)
                  .filter(field => field.startsWith(createManyResultsPrefix))
                  .map(field => field.replace(createManyResultsPrefix, ''));
                const { keys, include } = extractKeysAndInclude(selectedFields);
                const { keys: requiredKeys, needGet } = getOnlyRequiredFields(
                  fields,
                  keys,
                  include,
                  ['id', 'objectId', 'createdAt', 'updatedAt']
                );
                const needToGetAllKeys = objectsQueries.needToGetAllKeys(
                  parseClass.fields,
                  keys,
                  parseGraphQLSchema.parseClasses
                );
                let optimizedObject = {};
                if (needGet && !needToGetAllKeys) {
                  optimizedObject = await objectsQueries.getObject(
                    className,
                    createdObject.objectId,
                    requiredKeys,
                    include,
                    undefined,
                    undefined,
                    config,
                    auth,
                    info,
                    parseGraphQLSchema.parseClasses
                  );
                } else if (needToGetAllKeys) {
                  optimizedObject = await objectsQueries.getObject(
                    className,
                    createdObject.objectId,
                    undefined,
                    include,
                    undefined,
                    undefined,
                    config,
                    auth,
                    info,
                    parseGraphQLSchema.parseClasses
                  );
                }
                return {
                  ...createdObject,
                  updatedAt: createdObject.createdAt,
                  ...filterDeletedFields(parseFields),
                  ...optimizedObject,
                };
              })()
            )
          );

          const results = settled.map(r => {
            if (r.status === 'fulfilled') {
              return {
                success: true,
                [getGraphQLQueryName]: r.value,
                error: null,
              };
            }
            return {
              success: false,
              [getGraphQLQueryName]: null,
              error: bulkErrorFromReason(r.reason),
            };
          });

          return { results };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    });

    if (
      parseGraphQLSchema.addGraphQLType(createManyResultItemType) &&
      parseGraphQLSchema.addGraphQLType(createManyGraphQLMutation.args.input.type.ofType) &&
      parseGraphQLSchema.addGraphQLType(createManyGraphQLMutation.type)
    ) {
      parseGraphQLSchema.addGraphQLMutation(createManyGraphQLMutationName, createManyGraphQLMutation);
    }
  }

  if (allowUpdateMany) {
    const updateManyGraphQLMutationName = updateManyAliasCfg || `updateMany${graphQLClassName}`;
    const updateManyResultsPrefix = `results.${getGraphQLQueryName}.`;
    const updateManyResultItemType = new GraphQLObjectType({
      name: `UpdateMany${graphQLClassName}ResultItem`,
      description: `One result entry for ${updateManyGraphQLMutationName}.`,
      fields: () => ({
        success: {
          description: 'Whether this object was updated successfully.',
          type: new GraphQLNonNull(GraphQLBoolean),
        },
        [getGraphQLQueryName]: {
          description: `The updated object when success is true.`,
          type: classGraphQLOutputType || defaultGraphQLTypes.OBJECT,
        },
        error: {
          description: 'Present when success is false.',
          type: defaultGraphQLTypes.PARSE_GRAPHQL_BULK_ERROR,
        },
      }),
    });
    const updateManyGraphQLMutation = mutationWithClientMutationId({
      name: `UpdateMany${graphQLClassName}`,
      description: `The ${updateManyGraphQLMutationName} mutation updates multiple objects of the ${graphQLClassName} class. Each entry succeeds or fails independently.`,
      inputFields: {
        updates: {
          description: 'List of id + fields pairs; one update per element.',
          type: new GraphQLNonNull(
            new GraphQLList(
              new GraphQLNonNull(
                classGraphQLUpdateManyItemType || defaultGraphQLTypes.OBJECT
              )
            )
          ),
        },
      },
      outputFields: {
        results: {
          description: 'Update results in the same order as the input list.',
          type: new GraphQLNonNull(
            new GraphQLList(new GraphQLNonNull(updateManyResultItemType))
          ),
        },
      },
      mutateAndGetPayload: async (args, context, mutationInfo) => {
        try {
          let { updates } = cloneArgs(args);
          if (!updates) {
            updates = [];
          }
          const { config, auth, info } = context;
          assertBulkInputLength(updates.length, config, auth);

          const settled = await Promise.allSettled(
            updates.map(updateEntry =>
              (async () => {
                let { id, fields } = updateEntry;
                if (!fields) {
                  fields = {};
                }
                id = normalizeObjectIdForClass(id, className);
                const parseFields = await transformTypes('update', fields, {
                  className,
                  parseGraphQLSchema,
                  originalFields: updateEntry.fields,
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
                const selectedFields = getFieldNames(mutationInfo)
                  .filter(field => field.startsWith(updateManyResultsPrefix))
                  .map(field => field.replace(updateManyResultsPrefix, ''));
                const { keys, include } = extractKeysAndInclude(selectedFields);
                const { keys: requiredKeys, needGet } = getOnlyRequiredFields(
                  fields,
                  keys,
                  include,
                  ['id', 'objectId', 'updatedAt']
                );
                const needToGetAllKeys = objectsQueries.needToGetAllKeys(
                  parseClass.fields,
                  keys,
                  parseGraphQLSchema.parseClasses
                );
                let optimizedObject = {};
                if (needGet && !needToGetAllKeys) {
                  optimizedObject = await objectsQueries.getObject(
                    className,
                    id,
                    requiredKeys,
                    include,
                    undefined,
                    undefined,
                    config,
                    auth,
                    info,
                    parseGraphQLSchema.parseClasses
                  );
                } else if (needToGetAllKeys) {
                  optimizedObject = await objectsQueries.getObject(
                    className,
                    id,
                    undefined,
                    include,
                    undefined,
                    undefined,
                    config,
                    auth,
                    info,
                    parseGraphQLSchema.parseClasses
                  );
                }
                return {
                  objectId: id,
                  ...updatedObject,
                  ...filterDeletedFields(parseFields),
                  ...optimizedObject,
                };
              })()
            )
          );

          const results = settled.map(r => {
            if (r.status === 'fulfilled') {
              return {
                success: true,
                [getGraphQLQueryName]: r.value,
                error: null,
              };
            }
            return {
              success: false,
              [getGraphQLQueryName]: null,
              error: bulkErrorFromReason(r.reason),
            };
          });

          return { results };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    });

    if (
      parseGraphQLSchema.addGraphQLType(updateManyResultItemType) &&
      parseGraphQLSchema.addGraphQLType(updateManyGraphQLMutation.args.input.type.ofType) &&
      parseGraphQLSchema.addGraphQLType(updateManyGraphQLMutation.type)
    ) {
      parseGraphQLSchema.addGraphQLMutation(updateManyGraphQLMutationName, updateManyGraphQLMutation);
    }
  }

  if (allowDeleteMany) {
    const deleteManyGraphQLMutationName = deleteManyAliasCfg || `deleteMany${graphQLClassName}`;
    const deleteManyResultsPrefix = `results.${getGraphQLQueryName}.`;
    const deleteManyResultItemType = new GraphQLObjectType({
      name: `DeleteMany${graphQLClassName}ResultItem`,
      description: `One result entry for ${deleteManyGraphQLMutationName}.`,
      fields: () => ({
        success: {
          description: 'Whether this object was deleted successfully.',
          type: new GraphQLNonNull(GraphQLBoolean),
        },
        [getGraphQLQueryName]: {
          description: `The object before deletion when success is true.`,
          type: classGraphQLOutputType || defaultGraphQLTypes.OBJECT,
        },
        error: {
          description: 'Present when success is false.',
          type: defaultGraphQLTypes.PARSE_GRAPHQL_BULK_ERROR,
        },
      }),
    });
    const deleteManyGraphQLMutation = mutationWithClientMutationId({
      name: `DeleteMany${graphQLClassName}`,
      description: `The ${deleteManyGraphQLMutationName} mutation deletes multiple objects of the ${graphQLClassName} class. Each entry succeeds or fails independently.`,
      inputFields: {
        ids: {
          description: 'Object ids to delete (global or object id).',
          type: new GraphQLNonNull(new GraphQLList(defaultGraphQLTypes.OBJECT_ID)),
        },
      },
      outputFields: {
        results: {
          description: 'Deletion results in the same order as the input list.',
          type: new GraphQLNonNull(
            new GraphQLList(new GraphQLNonNull(deleteManyResultItemType))
          ),
        },
      },
      mutateAndGetPayload: async (args, context, mutationInfo) => {
        try {
          let { ids } = cloneArgs(args);
          if (!ids) {
            ids = [];
          }
          const { config, auth, info } = context;
          assertBulkInputLength(ids.length, config, auth);

          const settled = await Promise.allSettled(
            ids.map(id =>
              (async () => {
                const objectId = normalizeObjectIdForClass(id, className);
                const selectedFields = getFieldNames(mutationInfo)
                  .filter(field => field.startsWith(deleteManyResultsPrefix))
                  .map(field => field.replace(deleteManyResultsPrefix, ''));
                const { keys, include } = extractKeysAndInclude(selectedFields);
                let optimizedObject = {};
                if (
                  keys &&
                  keys.split(',').filter(key => !['id', 'objectId'].includes(key)).length > 0
                ) {
                  optimizedObject = await objectsQueries.getObject(
                    className,
                    objectId,
                    keys,
                    include,
                    undefined,
                    undefined,
                    config,
                    auth,
                    info,
                    parseGraphQLSchema.parseClasses
                  );
                }
                await objectsMutations.deleteObject(className, objectId, config, auth, info);
                return {
                  className,
                  objectId,
                  ...optimizedObject,
                };
              })()
            )
          );

          const results = settled.map(r => {
            if (r.status === 'fulfilled') {
              return {
                success: true,
                [getGraphQLQueryName]: r.value,
                error: null,
              };
            }
            return {
              success: false,
              [getGraphQLQueryName]: null,
              error: bulkErrorFromReason(r.reason),
            };
          });

          return { results };
        } catch (e) {
          parseGraphQLSchema.handleError(e);
        }
      },
    });

    if (
      parseGraphQLSchema.addGraphQLType(deleteManyResultItemType) &&
      parseGraphQLSchema.addGraphQLType(deleteManyGraphQLMutation.args.input.type.ofType) &&
      parseGraphQLSchema.addGraphQLType(deleteManyGraphQLMutation.type)
    ) {
      parseGraphQLSchema.addGraphQLMutation(deleteManyGraphQLMutationName, deleteManyGraphQLMutation);
    }
  }
};

export { load };
