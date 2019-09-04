const parseQueryMap = {
  id: 'objectId',
  OR: '$or',
  AND: '$and',
  NOR: '$nor',
};

const parseConstraintMap = {
  equalTo: '$eq',
  notEqualTo: '$ne',
  lessThan: '$lt',
  lessThanOrEqualTo: '$lte',
  greaterThan: '$gt',
  greaterThanOrEqualTo: '$gte',
  in: '$in',
  notIn: '$nin',
  exists: '$exists',
  inQueryKey: '$select',
  notInQueryKey: '$dontSelect',
  inQuery: '$inQuery',
  notInQuery: '$notInQuery',
  containedBy: '$containedBy',
  contains: '$all',
  matchesRegex: '$regex',
  options: '$options',
  text: '$text',
  search: '$search',
  term: '$term',
  language: '$language',
  caseSensitive: '$caseSensitive',
  diacriticSensitive: '$diacriticSensitive',
  nearSphere: '$nearSphere',
  maxDistance: '$maxDistance',
  maxDistanceInRadians: '$maxDistanceInRadians',
  maxDistanceInMiles: '$maxDistanceInMiles',
  maxDistanceInKilometers: '$maxDistanceInKilometers',
  within: '$within',
  box: '$box',
  geoWithin: '$geoWithin',
  polygon: '$polygon',
  centerSphere: '$centerSphere',
  geoIntersects: '$geoIntersects',
  point: '$point',
};

const transformQueryConstraintInputToParse = (
  constraints,
  fields,
  parentFieldName,
  parentConstraints
) => {
  Object.keys(constraints).forEach(fieldName => {
    let fieldValue = constraints[fieldName];

    /**
     * If we have a key-value pair, we need to change the way the constraint is structured.
     *
     * Example:
     *   From:
     *   {
     *     "someField": {
     *       "lessThan": {
     *         "key":"foo.bar",
     *         "value": 100
     *       },
     *       "greaterThan": {
     *         "key":"foo.bar",
     *         "value": 10
     *       }
     *     }
     *   }
     *
     *   To:
     *   {
     *     "someField.foo.bar": {
     *       "$lt": 100,
     *       "$gt": 10
     *      }
     *   }
     */
    if (
      fieldValue.key &&
      fieldValue.value &&
      parentConstraints &&
      parentFieldName
    ) {
      delete parentConstraints[parentFieldName];
      parentConstraints[`${parentFieldName}.${fieldValue.key}`] = {
        ...parentConstraints[`${parentFieldName}.${fieldValue.key}`],
        [parseConstraintMap[fieldName]]: fieldValue.value,
      };
    } else if (parseConstraintMap[fieldName]) {
      delete constraints[fieldName];
      fieldName = parseConstraintMap[fieldName];
      constraints[fieldName] = fieldValue;

      // If parent field type is Pointer, changes constraint value to format expected
      // by Parse.
      if (
        fields[parentFieldName] &&
        fields[parentFieldName].type === 'Pointer' &&
        typeof fieldValue === 'string'
      ) {
        const { targetClass } = fields[parentFieldName];
        constraints[fieldName] = {
          __type: 'Pointer',
          className: targetClass,
          objectId: fieldValue,
        };
      }
    }
    switch (fieldName) {
      case '$point':
      case '$nearSphere':
        if (typeof fieldValue === 'object' && !fieldValue.__type) {
          fieldValue.__type = 'GeoPoint';
        }
        break;
      case '$box':
        if (
          typeof fieldValue === 'object' &&
          fieldValue.bottomLeft &&
          fieldValue.upperRight
        ) {
          fieldValue = [
            {
              __type: 'GeoPoint',
              ...fieldValue.bottomLeft,
            },
            {
              __type: 'GeoPoint',
              ...fieldValue.upperRight,
            },
          ];
          constraints[fieldName] = fieldValue;
        }
        break;
      case '$polygon':
        if (fieldValue instanceof Array) {
          fieldValue.forEach(geoPoint => {
            if (typeof geoPoint === 'object' && !geoPoint.__type) {
              geoPoint.__type = 'GeoPoint';
            }
          });
        }
        break;
      case '$centerSphere':
        if (
          typeof fieldValue === 'object' &&
          fieldValue.center &&
          fieldValue.distance
        ) {
          fieldValue = [
            {
              __type: 'GeoPoint',
              ...fieldValue.center,
            },
            fieldValue.distance,
          ];
          constraints[fieldName] = fieldValue;
        }
        break;
    }
    if (typeof fieldValue === 'object') {
      if (fieldName === 'where') {
        transformQueryInputToParse(fieldValue);
      } else {
        transformQueryConstraintInputToParse(
          fieldValue,
          fields,
          fieldName,
          constraints
        );
      }
    }
  });
};

const transformQueryInputToParse = (constraints, fields) => {
  if (!constraints || typeof constraints !== 'object') {
    return;
  }

  Object.keys(constraints).forEach(fieldName => {
    const fieldValue = constraints[fieldName];

    if (parseQueryMap[fieldName]) {
      delete constraints[fieldName];
      fieldName = parseQueryMap[fieldName];
      constraints[fieldName] = fieldValue;

      if (fieldName !== 'objectId') {
        fieldValue.forEach(fieldValueItem => {
          transformQueryInputToParse(fieldValueItem, fields);
        });
        return;
      }
    }

    if (typeof fieldValue === 'object') {
      transformQueryConstraintInputToParse(fieldValue, fields, fieldName, constraints);
    }
  });
};

export { transformQueryConstraintInputToParse, transformQueryInputToParse };
