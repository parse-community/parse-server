import { fromGlobalId } from 'graphql-relay';

const parseQueryMap = {
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
  parentFieldName,
  className,
  parentConstraints,
  parseClasses
) => {
  const fields = parseClasses.find(parseClass => parseClass.className === className).fields;
  if (parentFieldName === 'id' && className) {
    Object.keys(constraints).forEach(constraintName => {
      const constraintValue = constraints[constraintName];
      if (typeof constraintValue === 'string') {
        const globalIdObject = fromGlobalId(constraintValue);

        if (globalIdObject.type === className) {
          constraints[constraintName] = globalIdObject.id;
        }
      } else if (Array.isArray(constraintValue)) {
        constraints[constraintName] = constraintValue.map(value => {
          const globalIdObject = fromGlobalId(value);

          if (globalIdObject.type === className) {
            return globalIdObject.id;
          }

          return value;
        });
      }
    });
    parentConstraints.objectId = constraints;
    delete parentConstraints.id;
  }
  Object.keys(constraints).forEach(fieldName => {
    let fieldValue = constraints[fieldName];
    if (parseConstraintMap[fieldName]) {
      constraints[parseConstraintMap[fieldName]] = constraints[fieldName];
      delete constraints[fieldName];
    }
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
    if (fieldValue.key && fieldValue.value && parentConstraints && parentFieldName) {
      delete parentConstraints[parentFieldName];
      parentConstraints[`${parentFieldName}.${fieldValue.key}`] = {
        ...parentConstraints[`${parentFieldName}.${fieldValue.key}`],
        [parseConstraintMap[fieldName]]: fieldValue.value,
      };
    } else if (
      fields[parentFieldName] &&
      (fields[parentFieldName].type === 'Pointer' || fields[parentFieldName].type === 'Relation')
    ) {
      const { targetClass } = fields[parentFieldName];
      if (fieldName === 'exists') {
        if (fields[parentFieldName].type === 'Relation') {
          const whereTarget = fieldValue ? 'where' : 'notWhere';
          if (constraints[whereTarget]) {
            if (constraints[whereTarget].objectId) {
              constraints[whereTarget].objectId = {
                ...constraints[whereTarget].objectId,
                $exists: fieldValue,
              };
            } else {
              constraints[whereTarget].objectId = {
                $exists: fieldValue,
              };
            }
          } else {
            const parseWhereTarget = fieldValue ? '$inQuery' : '$notInQuery';
            parentConstraints[parentFieldName][parseWhereTarget] = {
              where: { objectId: { $exists: true } },
              className: targetClass,
            };
          }
          delete constraints.$exists;
        } else {
          parentConstraints[parentFieldName].$exists = fieldValue;
        }
        return;
      }
      switch (fieldName) {
        case 'have':
          parentConstraints[parentFieldName].$inQuery = {
            where: fieldValue,
            className: targetClass,
          };
          transformQueryInputToParse(
            parentConstraints[parentFieldName].$inQuery.where,
            targetClass,
            parseClasses
          );
          break;
        case 'haveNot':
          parentConstraints[parentFieldName].$notInQuery = {
            where: fieldValue,
            className: targetClass,
          };
          transformQueryInputToParse(
            parentConstraints[parentFieldName].$notInQuery.where,
            targetClass,
            parseClasses
          );
          break;
      }
      delete constraints[fieldName];
      return;
    }
    switch (fieldName) {
      case 'point':
        if (typeof fieldValue === 'object' && !fieldValue.__type) {
          fieldValue.__type = 'GeoPoint';
        }
        break;
      case 'nearSphere':
        if (typeof fieldValue === 'object' && !fieldValue.__type) {
          fieldValue.__type = 'GeoPoint';
        }
        break;
      case 'box':
        if (typeof fieldValue === 'object' && fieldValue.bottomLeft && fieldValue.upperRight) {
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
          constraints[parseConstraintMap[fieldName]] = fieldValue;
        }
        break;
      case 'polygon':
        if (fieldValue instanceof Array) {
          fieldValue.forEach(geoPoint => {
            if (typeof geoPoint === 'object' && !geoPoint.__type) {
              geoPoint.__type = 'GeoPoint';
            }
          });
        }
        break;
      case 'centerSphere':
        if (typeof fieldValue === 'object' && fieldValue.center && fieldValue.distance) {
          fieldValue = [
            {
              __type: 'GeoPoint',
              ...fieldValue.center,
            },
            fieldValue.distance,
          ];
          constraints[parseConstraintMap[fieldName]] = fieldValue;
        }
        break;
    }
    if (typeof fieldValue === 'object') {
      if (fieldName === 'where') {
        transformQueryInputToParse(fieldValue, className, parseClasses);
      } else {
        transformQueryConstraintInputToParse(
          fieldValue,
          fieldName,
          className,
          constraints,
          parseClasses
        );
      }
    }
  });
};

const transformQueryInputToParse = (constraints, className, parseClasses) => {
  if (!constraints || typeof constraints !== 'object') {
    return;
  }

  Object.keys(constraints).forEach(fieldName => {
    const fieldValue = constraints[fieldName];

    if (parseQueryMap[fieldName]) {
      delete constraints[fieldName];
      fieldName = parseQueryMap[fieldName];
      constraints[fieldName] = fieldValue;
      fieldValue.forEach(fieldValueItem => {
        transformQueryInputToParse(fieldValueItem, className, parseClasses);
      });
      return;
    } else {
      transformQueryConstraintInputToParse(
        fieldValue,
        fieldName,
        className,
        constraints,
        parseClasses
      );
    }
  });
};

export { transformQueryConstraintInputToParse, transformQueryInputToParse };
