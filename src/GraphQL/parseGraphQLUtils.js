import Parse from 'parse/node';
import { ApolloError } from 'apollo-server-core';

export function enforceMasterKeyAccess(auth) {
  if (!auth.isMaster) {
    throw new Parse.Error(
      Parse.Error.OPERATION_FORBIDDEN,
      'unauthorized: master key is required'
    );
  }
}

export function toGraphQLError(error) {
  let code, message;
  if (error instanceof Parse.Error) {
    code = error.code;
    message = error.message;
  } else {
    code = Parse.Error.INTERNAL_SERVER_ERROR;
    message = 'Internal server error';
  }
  return new ApolloError(message, code);
}

export const extractKeysAndInclude = selectedFields => {
  selectedFields = selectedFields.filter(
    field => !field.includes('__typename')
  );

  // Handles "id" field for both current and included objects
  selectedFields = selectedFields.map(field => {
    if (field === 'id') return 'objectId';
    return field.endsWith('.id')
      ? `${field.substring(0, field.lastIndexOf('.id'))}.objectId`
      : field;
  });
  let keys = undefined;
  let include = undefined;
  if (selectedFields.length > 0) {
    keys = selectedFields.join(',');
    include = selectedFields
      .reduce((fields, field) => {
        fields = fields.slice();
        let pointIndex = field.lastIndexOf('.');
        while (pointIndex > 0) {
          const lastField = field.slice(pointIndex + 1);
          field = field.slice(0, pointIndex);
          if (!fields.includes(field) && lastField !== 'objectId') {
            fields.push(field);
          }
          pointIndex = field.lastIndexOf('.');
        }
        return fields;
      }, [])
      .join(',');
  }
  return { keys, include };
};

export const getParseClassMutationConfig = function(parseClassConfig) {
  return (parseClassConfig && parseClassConfig.mutation) || {};
};
