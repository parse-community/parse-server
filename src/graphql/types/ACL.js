import {
  GraphQLScalarType,
} from 'graphql'
import { Parse } from 'parse/node';

const id = (value) => value;

export const ACL = new GraphQLScalarType({
  name: 'ACL',
  serialize: id,
  parseValue: (value) => {
    if (value && value instanceof Parse.ACL) {
      return value.toJSON();
    }
    throw 'Invalid ACL value, should be a Parse.ACL';
  },
  parseLiteral: () => {
    throw "not implemented"
  }
});
