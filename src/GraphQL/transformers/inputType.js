import { GraphQLString, GraphQLFloat, GraphQLBoolean, GraphQLList } from 'graphql';
import * as defaultGraphQLTypes from '../loaders/defaultGraphQLTypes';

const transformInputTypeToGraphQL = (parseType, targetClass, parseClassTypes) => {
  switch (parseType) {
    case 'String':
      return GraphQLString;
    case 'Number':
      return GraphQLFloat;
    case 'Boolean':
      return GraphQLBoolean;
    case 'Array':
      return new GraphQLList(defaultGraphQLTypes.ANY);
    case 'Object':
      return defaultGraphQLTypes.OBJECT;
    case 'Date':
      return defaultGraphQLTypes.DATE;
    case 'Pointer':
      if (
        parseClassTypes &&
        parseClassTypes[targetClass] &&
        parseClassTypes[targetClass].classGraphQLPointerType
      ) {
        return parseClassTypes[targetClass].classGraphQLPointerType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }
    case 'Relation':
      if (
        parseClassTypes &&
        parseClassTypes[targetClass] &&
        parseClassTypes[targetClass].classGraphQLRelationType
      ) {
        return parseClassTypes[targetClass].classGraphQLRelationType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }
    case 'File':
      return defaultGraphQLTypes.FILE_INPUT;
    case 'GeoPoint':
      return defaultGraphQLTypes.GEO_POINT_INPUT;
    case 'Polygon':
      return defaultGraphQLTypes.POLYGON_INPUT;
    case 'Bytes':
      return defaultGraphQLTypes.BYTES;
    case 'ACL':
      return defaultGraphQLTypes.ACL_INPUT;
    default:
      return undefined;
  }
};

export { transformInputTypeToGraphQL };
