import * as defaultGraphQLTypes from '../loaders/defaultGraphQLTypes';

const transformConstraintTypeToGraphQL = (parseType, targetClass, parseClassTypes, fieldName) => {
  if (fieldName === 'id' || fieldName === 'objectId') {
    return defaultGraphQLTypes.ID_WHERE_INPUT;
  }

  switch (parseType) {
    case 'String':
      return defaultGraphQLTypes.STRING_WHERE_INPUT;
    case 'Number':
      return defaultGraphQLTypes.NUMBER_WHERE_INPUT;
    case 'Boolean':
      return defaultGraphQLTypes.BOOLEAN_WHERE_INPUT;
    case 'Array':
      return defaultGraphQLTypes.ARRAY_WHERE_INPUT;
    case 'Object':
      return defaultGraphQLTypes.OBJECT_WHERE_INPUT;
    case 'Date':
      return defaultGraphQLTypes.DATE_WHERE_INPUT;
    case 'Pointer':
      if (
        parseClassTypes[targetClass] &&
        parseClassTypes[targetClass].classGraphQLRelationConstraintsType
      ) {
        return parseClassTypes[targetClass].classGraphQLRelationConstraintsType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }
    case 'File':
      return defaultGraphQLTypes.FILE_WHERE_INPUT;
    case 'GeoPoint':
      return defaultGraphQLTypes.GEO_POINT_WHERE_INPUT;
    case 'Polygon':
      return defaultGraphQLTypes.POLYGON_WHERE_INPUT;
    case 'Bytes':
      return defaultGraphQLTypes.BYTES_WHERE_INPUT;
    case 'ACL':
      return defaultGraphQLTypes.OBJECT_WHERE_INPUT;
    case 'Relation':
      if (
        parseClassTypes[targetClass] &&
        parseClassTypes[targetClass].classGraphQLRelationConstraintsType
      ) {
        return parseClassTypes[targetClass].classGraphQLRelationConstraintsType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }
    default:
      return undefined;
  }
};

export { transformConstraintTypeToGraphQL };
