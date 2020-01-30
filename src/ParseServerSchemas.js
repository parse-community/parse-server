import Parse from '../utils/Parse';

// add class await schema.addClassIfNotExists(name,schema)
// update class await schema.updateClass(name,transformToParse(schemaFields, existingParseClass.fields),undefined,undefined,config.database);

export const buildSchemas = async (localSchemas, config) => {
  const schema = await config.database.loadSchema({ clearCache: true });
  const allCloudSchema = await schema
    .getAllClasses(true)
    .filter(s => !lib.isDefaultSchema(s.className));
  await Promise.all(
    localSchemas.map(async localSchema =>
      lib.saveOrUpdate(allCloudSchema, localSchema)
    )
  );
};

export const lib = {
  saveOrUpdate: async (allCloudSchema, localSchema) => {
    const cloudSchema = allCloudSchema.find(
      sc => sc.className === localSchema.className
    );
    if (cloudSchema) {
      await lib.updateSchema(localSchema, cloudSchema);
    } else {
      await lib.saveSchema(localSchema);
    }
  },
  saveSchema: async localSchema => {
    const newLocalSchema = new Parse.Schema(localSchema.className);
    // Handle fields
    Object.keys(localSchema.fields)
      .filter(
        fieldName => !lib.isDefaultFields(localSchema.className, fieldName)
      )
      .forEach(fieldName => {
        const { type, ...others } = localSchema.fields[fieldName];
        lib.handleFields(newLocalSchema, fieldName, type, others);
      });
    // Handle indexes
    if (localSchema.indexes) {
      Object.keys(localSchema.indexes).forEach(indexName =>
        newLocalSchema.addIndex(indexName, localSchema.indexes[indexName])
      );
    }

    newLocalSchema.setCLP(localSchema.classLevelPermissions);
    return newLocalSchema.save();
  },
  updateSchema: async (localSchema, cloudSchema) => {
    const newLocalSchema = new Parse.Schema(localSchema.className);

    // Handle fields
    // Check addition
    Object.keys(localSchema.fields)
      .filter(
        fieldName => !lib.isDefaultFields(localSchema.className, fieldName)
      )
      .forEach(fieldName => {
        const { type, ...others } = localSchema.fields[fieldName];
        if (!cloudSchema.fields[fieldName])
          lib.handleFields(newLocalSchema, fieldName, type, others);
      });

    // Check deletion
    await Promise.all(
      Object.keys(cloudSchema.fields)
        .filter(
          fieldName => !lib.isDefaultFields(localSchema.className, fieldName)
        )
        .map(async fieldName => {
          const field = cloudSchema.fields[fieldName];
          if (!localSchema.fields[fieldName]) {
            newLocalSchema.deleteField(fieldName);
            await newLocalSchema.update();
            return;
          }
          const localField = localSchema.fields[fieldName];
          if (!lib.paramsAreEquals(field, localField)) {
            newLocalSchema.deleteField(fieldName);
            await newLocalSchema.update();
            const { type, ...others } = localField;
            lib.handleFields(newLocalSchema, fieldName, type, others);
          }
        })
    );

    // Handle Indexes
    // Check addition
    const cloudIndexes = lib.fixCloudIndexes(cloudSchema.indexes);

    if (localSchema.indexes) {
      Object.keys(localSchema.indexes).forEach(indexName => {
        if (
          !cloudIndexes[indexName] &&
          !lib.isNativeIndex(localSchema.className, indexName)
        )
          newLocalSchema.addIndex(indexName, localSchema.indexes[indexName]);
      });
    }

    const indexesToAdd = [];

    // Check deletion
    Object.keys(cloudIndexes).forEach(async indexName => {
      if (!lib.isNativeIndex(localSchema.className, indexName)) {
        if (!localSchema.indexes[indexName]) {
          newLocalSchema.deleteIndex(indexName);
        } else if (
          !lib.paramsAreEquals(
            localSchema.indexes[indexName],
            cloudIndexes[indexName]
          )
        ) {
          newLocalSchema.deleteIndex(indexName);
          indexesToAdd.push({
            indexName,
            index: localSchema.indexes[indexName],
          });
        }
      }
    });
    newLocalSchema.setCLP(localSchema.classLevelPermissions);
    await newLocalSchema.update();
    indexesToAdd.forEach(o => newLocalSchema.addIndex(o.indexName, o.index));
    return newLocalSchema.update();
  },

  isDefaultSchema: className =>
    ['_Session', '_Role', '_PushStatus', '_Installation'].indexOf(className) !==
    -1,

  isDefaultFields: (className, fieldName) =>
    [
      'objectId',
      'createdAt',
      'updatedAt',
      'ACL',
      'emailVerified',
      'authData',
      'username',
      'password',
      'email',
    ]
      .filter(
        value =>
          (className !== '_User' && value !== 'email') || className === '_User'
      )
      .indexOf(fieldName) !== -1,

  fixCloudIndexes: cloudSchemaIndexes => {
    if (!cloudSchemaIndexes) return {};
    // eslint-disable-next-line
    const { _id_, ...others } = cloudSchemaIndexes;

    return {
      objectId: { objectId: 1 },
      ...others,
    };
  },

  isNativeIndex: (className, indexName) => {
    if (className === '_User') {
      switch (indexName) {
        case 'username_1':
          return true;
        case 'objectId':
          return true;
        case 'email_1':
          return true;
        default:
          break;
      }
    }
    return false;
  },

  paramsAreEquals: (indexA, indexB) => {
    const keysIndexA = Object.keys(indexA);
    const keysIndexB = Object.keys(indexB);

    // Check key name
    if (keysIndexA.length !== keysIndexB.length) return false;
    return keysIndexA.every(k => indexA[k] === indexB[k]);
  },

  handleFields: (newLocalSchema, fieldName, type, others) => {
    if (type === 'Relation') {
      newLocalSchema.addRelation(fieldName, others.targetClass);
    } else if (type === 'Pointer') {
      const { targetClass, ...others2 } = others;
      newLocalSchema.addPointer(fieldName, targetClass, others2);
    } else {
      newLocalSchema.addField(fieldName, type, others);
    }
  },
};
