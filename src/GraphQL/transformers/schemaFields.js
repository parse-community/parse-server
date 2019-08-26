const transformToParse = graphQLSchemaFields => {
  if (!graphQLSchemaFields) {
    return {};
  }

  let parseSchemaFields = {};

  const reducerFabric = type => (parseSchemaFields, field) => {
    if (
      graphQLSchemaFields.remove &&
      graphQLSchemaFields.remove.find(
        removeField => removeField.name === field.name
      )
    ) {
      return parseSchemaFields;
    }
    if (type === 'Relation') {
      return {
        ...parseSchemaFields,
        [field.name]: {
          type,
          targetClass: field.targetClassName,
        },
      };
    }
    if (type === 'Pointer') {
      return {
        ...parseSchemaFields,
        [field.name]: {
          type,
          targetClass: field.targetClassName,
          isRequired: field.isRequired,
          defaultValue: field.defaultValue,
        },
      };
    }
    return {
      ...parseSchemaFields,
      [field.name]: {
        type,
        isRequired: field.isRequired,
        defaultValue: field.defaultValue,
      },
    };
  };

  if (graphQLSchemaFields.addStrings) {
    parseSchemaFields = graphQLSchemaFields.addStrings.reduce(
      reducerFabric('String'),
      parseSchemaFields
    );
  }
  if (graphQLSchemaFields.addNumbers) {
    parseSchemaFields = graphQLSchemaFields.addNumbers.reduce(
      reducerFabric('Number'),
      parseSchemaFields
    );
  }
  if (graphQLSchemaFields.addBooleans) {
    parseSchemaFields = graphQLSchemaFields.addBooleans.reduce(
      reducerFabric('Boolean'),
      parseSchemaFields
    );
  }
  if (graphQLSchemaFields.addArrays) {
    parseSchemaFields = graphQLSchemaFields.addArrays.reduce(
      reducerFabric('Array'),
      parseSchemaFields
    );
  }
  if (graphQLSchemaFields.addObjects) {
    parseSchemaFields = graphQLSchemaFields.addObjects.reduce(
      reducerFabric('Object'),
      parseSchemaFields
    );
  }
  if (graphQLSchemaFields.addDates) {
    parseSchemaFields = graphQLSchemaFields.addDates.reduce(
      reducerFabric('Date'),
      parseSchemaFields
    );
  }
  if (graphQLSchemaFields.addFiles) {
    parseSchemaFields = graphQLSchemaFields.addFiles.reduce(
      reducerFabric('File'),
      parseSchemaFields
    );
  }
  if (graphQLSchemaFields.addGeoPoints) {
    parseSchemaFields = graphQLSchemaFields.addGeoPoints.reduce(
      reducerFabric('GeoPoint'),
      parseSchemaFields
    );
  }
  if (graphQLSchemaFields.addPolygons) {
    parseSchemaFields = graphQLSchemaFields.addPolygons.reduce(
      reducerFabric('Polygon'),
      parseSchemaFields
    );
  }
  if (graphQLSchemaFields.addBytes) {
    parseSchemaFields = graphQLSchemaFields.addBytes.reduce(
      reducerFabric('Byte'),
      parseSchemaFields
    );
  }
  if (graphQLSchemaFields.addPointers) {
    parseSchemaFields = graphQLSchemaFields.addPointers.reduce(
      reducerFabric('Pointer'),
      parseSchemaFields
    );
  }
  if (graphQLSchemaFields.addRelations) {
    parseSchemaFields = graphQLSchemaFields.addRelations.reduce(
      reducerFabric('Relation'),
      parseSchemaFields
    );
  }

  return parseSchemaFields;
};

const transformToGraphQL = parseSchemaFields => {
  return Object.keys(parseSchemaFields).map(name => ({
    name,
    type: parseSchemaFields[name].type,
    targetClass: parseSchemaFields[name].targetClass,
    isRequired: parseSchemaFields[name].isRequired,
    defaultValue: parseSchemaFields[name].defaultValue,
  }));
};

export { transformToParse, transformToGraphQL };
