import * as defaultGraphQLTypes from '../loaders/defaultGraphQLTypes';
import { GraphQLString, GraphQLFloat, GraphQLBoolean, GraphQLList, GraphQLNonNull } from 'graphql';

const transformOutputTypeToGraphQL = (parseType, targetClass, parseClassTypes) => {
  switch (parseType) {
    case 'String':
      return GraphQLString;
    case 'Number':
      return GraphQLFloat;
    case 'Boolean':
      return GraphQLBoolean;
    case 'Array':
      return new GraphQLList(defaultGraphQLTypes.ARRAY_RESULT);
    case 'Object':
      return defaultGraphQLTypes.OBJECT;
    case 'Date':
      return defaultGraphQLTypes.DATE;
    case 'Pointer':
      if (
        parseClassTypes &&
        parseClassTypes[targetClass] &&
        parseClassTypes[targetClass].classGraphQLOutputType
      ) {
        return parseClassTypes[targetClass].classGraphQLOutputType;
      } else {
        return defaultGraphQLTypes.OBJECT;
      }
    case 'Relation':
      if (
        parseClassTypes &&
        parseClassTypes[targetClass] &&
        parseClassTypes[targetClass].classGraphQLFindResultType
      ) {
        return new GraphQLNonNull(parseClassTypes[targetClass].classGraphQLFindResultType);
      } else {
        return new GraphQLNonNull(defaultGraphQLTypes.OBJECT);
      }
    case 'File':
      return defaultGraphQLTypes.FILE_INFO;
    case 'GeoPoint':
      return defaultGraphQLTypes.GEO_POINT;
    case 'Polygon':
      return defaultGraphQLTypes.POLYGON;
    case 'Bytes':
      return defaultGraphQLTypes.BYTES;
    case 'ACL':
      return new GraphQLNonNull(defaultGraphQLTypes.ACL);
    default:
      return undefined;
  }
};

export { transformOutputTypeToGraphQL };
