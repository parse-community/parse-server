const parseMap = {
  _or: '$or',
  _and: '$and',
  _nor: '$nor',
  _relatedTo: '$relatedTo',
  _eq: '$eq',
  _ne: '$ne',
  _lt: '$lt',
  _lte: '$lte',
  _gt: '$gt',
  _gte: '$gte',
  _in: '$in',
  _nin: '$nin',
  _exists: '$exists',
  _select: '$select',
  _dontSelect: '$dontSelect',
  _inQuery: '$inQuery',
  _notInQuery: '$notInQuery',
  _containedBy: '$containedBy',
  _all: '$all',
  _regex: '$regex',
  _options: '$options',
  _text: '$text',
  _search: '$search',
  _term: '$term',
  _language: '$language',
  _caseSensitive: '$caseSensitive',
  _diacriticSensitive: '$diacriticSensitive',
  _nearSphere: '$nearSphere',
  _maxDistance: '$maxDistance',
  _maxDistanceInRadians: '$maxDistanceInRadians',
  _maxDistanceInMiles: '$maxDistanceInMiles',
  _maxDistanceInKilometers: '$maxDistanceInKilometers',
  _within: '$within',
  _box: '$box',
  _geoWithin: '$geoWithin',
  _polygon: '$polygon',
  _centerSphere: '$centerSphere',
  _geoIntersects: '$geoIntersects',
  _point: '$point',
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
