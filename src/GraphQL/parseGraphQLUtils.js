import Parse from 'parse/node';
import { ApolloError } from 'apollo-server-core';

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
