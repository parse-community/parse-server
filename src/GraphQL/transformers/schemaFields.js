const transformToParse = graphQLSchemaFields => {
  if (!graphQLSchemaFields) {
    return {};
  }

  let parseSchemaFields = {};

  const reducerGenerator = type => (parseSchemaFields, field) => {
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
      reducerGenerator('String'),
      parseSchemaFields
    );
  }
  if (graphQLSchemaFields.addNumbers) {
    parseSchemaFields = graphQLSchemaFields.addNumbers.reduce(
      reducerGenerator('Number'),
      parseSchemaFields
    );
  }
  if (graphQLSchemaFields.addBooleans) {
    parseSchemaFields = graphQLSchemaFields.addBooleans.reduce(
      reducerGenerator('Boolean'),
      parseSchemaFields
    );
  }
  if (graphQLSchemaFields.addArrays) {
    parseSchemaFields = graphQLSchemaFields.addArrays.reduce(
      reducerGenerator('Array'),
      parseSchemaFields
    );
  }
  if (graphQLSchemaFields.addObjects) {
    parseSchemaFields = graphQLSchemaFields.addObjects.reduce(
      reducerGenerator('Object'),
      parseSchemaFields
    );
  }
  if (graphQLSchemaFields.addDates) {
    parseSchemaFields = graphQLSchemaFields.addDates.reduce(
      reducerGenerator('Date'),
      parseSchemaFields
    );
  }
  if (graphQLSchemaFields.addFiles) {
    parseSchemaFields = graphQLSchemaFields.addFiles.reduce(
      reducerGenerator('File'),
      parseSchemaFields
    );
  }
  if (graphQLSchemaFields.addGeoPoints) {
    parseSchemaFields = graphQLSchemaFields.addGeoPoints.reduce(
      reducerGenerator('GeoPoint'),
      parseSchemaFields
    );
  }
  if (graphQLSchemaFields.addPolygons) {
    parseSchemaFields = graphQLSchemaFields.addPolygons.reduce(
      reducerGenerator('Polygon'),
      parseSchemaFields
    );
  }
  if (graphQLSchemaFields.addBytes) {
    parseSchemaFields = graphQLSchemaFields.addBytes.reduce(
      reducerGenerator('Bytes'),
      parseSchemaFields
    );
  }
  if (graphQLSchemaFields.addPointers) {
    parseSchemaFields = graphQLSchemaFields.addPointers.reduce(
      reducerGenerator('Pointer'),
      parseSchemaFields
    );
  }
  if (graphQLSchemaFields.addRelations) {
    parseSchemaFields = graphQLSchemaFields.addRelations.reduce(
      reducerGenerator('Relation'),
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
