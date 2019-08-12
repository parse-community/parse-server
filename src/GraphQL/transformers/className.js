import logger from '../../logger';

const parseMap = {
  Role: '_Role',
  User: '_User',
  Session: '_Session',
  // Add native type to avoid name collision
  Files: 'Files',
  String: 'String',
  Boolean: 'Boolean',
  Number: 'Number',
  Array: 'Array',
  Object: 'Object',
  Date: 'Date',
  GeoPoint: 'GeoPoint',
  Polygon: 'Polygon',
  Bytes: 'Bytes',
};
const reverseParseMap = {};
// Dynamically fill reverseParseMap based on parseMap
Object.keys(parseMap).forEach(key => (reverseParseMap[parseMap[key]] = key));

const transformClassNameToParse = className => {
  if (reverseParseMap[className])
    logger.error(
      `Class collision detected, please change the name of your class ${className}`
    );
  return parseMap[className] ? parseMap[className] : className;
};

const transformClassNameToGraphQL = className => {
  if (parseMap[className])
    logger.error(
      `Class collision detected, please change the name of your class ${className}`
    );
  return reverseParseMap[className] ? reverseParseMap[className] : className;
};

export { transformClassNameToGraphQL, transformClassNameToParse };
