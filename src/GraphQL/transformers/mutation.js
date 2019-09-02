import * as defaultGraphQLTypes from '../loaders/defaultGraphQLTypes';
import * as objectsMutations from '../helpers/objectsMutations';

const transformTypes = async (
  inputType: 'create' | 'update',
  fields,
  { className, parseGraphQLSchema, req }
) => {
  const {
    classGraphQLCreateType,
    classGraphQLUpdateType,
    config: { isCreateEnabled, isUpdateEnabled },
  } = parseGraphQLSchema.parseClassTypes[className];
  const parseClass = parseGraphQLSchema.parseClasses.find(
    clazz => clazz.className === className
  );
  if (fields) {
    const classGraphQLCreateTypeFields =
      isCreateEnabled && classGraphQLCreateType
        ? classGraphQLCreateType.getFields()
        : null;
    const classGraphQLUpdateTypeFields =
      isUpdateEnabled && classGraphQLUpdateType
        ? classGraphQLUpdateType.getFields()
        : null;
    const promises = Object.keys(fields).map(async field => {
      let inputTypeField;
      if (inputType === 'create' && classGraphQLCreateTypeFields) {
        inputTypeField = classGraphQLCreateTypeFields[field];
      } else if (classGraphQLUpdateTypeFields) {
        inputTypeField = classGraphQLUpdateTypeFields[field];
      }
      if (inputTypeField) {
        switch (true) {
          case inputTypeField.type === defaultGraphQLTypes.GEO_POINT_INPUT:
            fields[field] = transformers.geoPoint(fields[field]);
            break;
          case inputTypeField.type === defaultGraphQLTypes.POLYGON_INPUT:
            fields[field] = transformers.polygon(fields[field]);
            break;
          case parseClass.fields[field].type === 'Relation':
            fields[field] = await transformers.relation(
              parseClass.fields[field].targetClass,
              field,
              fields[field],
              parseGraphQLSchema,
              req
            );
            break;
          case parseClass.fields[field].type === 'Pointer':
            fields[field] = await transformers.pointer(
              parseClass.fields[field].targetClass,
              field,
              fields[field],
              parseGraphQLSchema,
              req
            );
            break;
        }
      }
    });
    await Promise.all(promises);
  }
  return fields;
};

const transformers = {
  polygon: value => ({
    __type: 'Polygon',
    coordinates: value.map(geoPoint => [geoPoint.latitude, geoPoint.longitude]),
  }),
  geoPoint: value => ({
    ...value,
    __type: 'GeoPoint',
  }),
  relation: async (
    targetClass,
    field,
    value,
    parseGraphQLSchema,
    { config, auth, info }
  ) => {
    if (Object.keys(value) === 0)
      throw new Error(
        `You need to provide atleast one operation on the relation mutation of field ${field}`
      );

    const op = {
      __op: 'Batch',
      ops: [],
    };
    let nestedObjectsToAdd = [];

    if (value.createAndAdd) {
      nestedObjectsToAdd = (await Promise.all(
        value.createAndAdd.map(async input => {
          const parseFields = await transformTypes('create', input, {
            className: targetClass,
            parseGraphQLSchema,
            req: { config, auth, info },
          });
          return objectsMutations.createObject(
            targetClass,
            parseFields,
            config,
            auth,
            info
          );
        })
      )).map(object => ({
        __type: 'Pointer',
        className: targetClass,
        objectId: object.objectId,
      }));
    }

    if (value.add || nestedObjectsToAdd.length > 0) {
      if (!value.add) value.add = [];
      value.add = value.add.map(input => ({
        __type: 'Pointer',
        className: targetClass,
        objectId: input,
      }));
      op.ops.push({
        __op: 'AddRelation',
        objects: [...value.add, ...nestedObjectsToAdd],
      });
    }

    if (value.remove) {
      op.ops.push({
        __op: 'RemoveRelation',
        objects: value.remove.map(input => ({
          __type: 'Pointer',
          className: targetClass,
          objectId: input,
        })),
      });
    }
    return op;
  },
  pointer: async (
    targetClass,
    field,
    value,
    parseGraphQLSchema,
    { config, auth, info }
  ) => {
    if (Object.keys(value) > 1 || Object.keys(value) === 0)
      throw new Error(
        `You need to provide link OR createLink on the pointer mutation of field ${field}`
      );

    let nestedObjectToAdd;
    if (value.createAndLink) {
      const parseFields = await transformTypes('create', value.createAndLink, {
        className: targetClass,
        parseGraphQLSchema,
        req: { config, auth, info },
      });
      nestedObjectToAdd = await objectsMutations.createObject(
        targetClass,
        parseFields,
        config,
        auth,
        info
      );
      return {
        __type: 'Pointer',
        className: targetClass,
        objectId: nestedObjectToAdd.objectId,
      };
    }
    if (value.link) {
      return {
        __type: 'Pointer',
        className: targetClass,
        objectId: value.link,
      };
    }
  },
};

export { transformTypes };
