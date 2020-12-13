import Parse from 'parse/node';

const transformToParse = (graphQLSchemaFields, existingFields) => {
  if (!graphQLSchemaFields) {
    return {};
  }

  let parseSchemaFields = {};

  const reducerGenerator = type => (parseSchemaFields, field) => {
    if (type === 'Remove') {
      if (existingFields[field.name]) {
        return {
          ...parseSchemaFields,
          [field.name]: {
            __op: 'Delete',
          },
        };
      } else {
        return parseSchemaFields;
      }
    }
    if (
      graphQLSchemaFields.remove &&
      graphQLSchemaFields.remove.find(removeField => removeField.name === field.name)
    ) {
      return parseSchemaFields;
    }
    if (parseSchemaFields[field.name] || (existingFields && existingFields[field.name])) {
      throw new Parse.Error(Parse.Error.INVALID_KEY_NAME, `Duplicated field name: ${field.name}`);
    }
    if (type === 'Relation' || type === 'Pointer') {
      return {
        ...parseSchemaFields,
        [field.name]: {
          type,
          targetClass: field.targetClassName,
        },
      };
    }
    return {
      ...parseSchemaFields,
      [field.name]: {
        type,
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
  if (graphQLSchemaFields.addGeoPoint) {
    parseSchemaFields = [graphQLSchemaFields.addGeoPoint].reduce(
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
  if (existingFields && graphQLSchemaFields.remove) {
    parseSchemaFields = graphQLSchemaFields.remove.reduce(
      reducerGenerator('Remove'),
      parseSchemaFields
    );
  }

  return parseSchemaFields;
};

const transformToGraphQL = parseSchemaFields => {
  return Object.keys(parseSchemaFields).map(name => ({
    name,
    type: parseSchemaFields[name].type,
    targetClassName: parseSchemaFields[name].targetClass,
  }));
};

export { transformToParse, transformToGraphQL };
