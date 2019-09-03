const parseMap = {
  id: 'objectId',
  OR: '$or',
  AND: '$and',
  NOR: '$nor',
  relatedTo: '$relatedTo',
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

const transformQueryInputToParse = (
  constraints,
  parentFieldName,
  parentConstraints
) => {
  if (!constraints || typeof constraints !== 'object') {
    return;
  }
  Object.keys(constraints).forEach(fieldName => {
    let fieldValue = constraints[fieldName];

    /**
     * If we have a key-value pair, we need to change the way the constraint is structured.
     *
     * Example:
     *   From:
     *   {
     *     "someField": {
     *       "_lt": {
     *         "_key":"foo.bar",
     *         "_value": 100
     *       },
     *       "_gt": {
     *         "_key":"foo.bar",
     *         "_value": 10
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
      fieldValue._key &&
      fieldValue._value &&
      parentConstraints &&
      parentFieldName
    ) {
      delete parentConstraints[parentFieldName];
      parentConstraints[`${parentFieldName}.${fieldValue._key}`] = {
        ...parentConstraints[`${parentFieldName}.${fieldValue._key}`],
        [parseMap[fieldName]]: fieldValue._value,
      };
    } else if (parseMap[fieldName]) {
      delete constraints[fieldName];
      fieldName = parseMap[fieldName];
      constraints[fieldName] = fieldValue;
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
      transformQueryInputToParse(fieldValue, fieldName, constraints);
    }
  });
};

export { transformQueryInputToParse };
