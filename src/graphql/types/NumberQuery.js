import {
  GraphQLScalarType,
  Kind
} from 'graphql'

import QueryConstraint from './QueryConstraint';

export const NumberQuery = new GraphQLScalarType({
  name: 'NumberQuery',
  description: `Queries for number values

  Common Constraints:

  ${QueryConstraint.description()}
  
  Numeric constraints:

  - key: 1
  - key: {lt: 1} # less than
  - key: {gt: 1} # greater than
  - key: {lte: 1} # less than or equal
  - key: {gte: 1} # greater than or equal
  `,
  serialize: () => {
    throw "NumberQuery serialize not implemented"
  },
  parseValue: () => {
    throw "NumberQuery parseValue not implemented"
  },
  parseLiteral: (ast) => {
    if (ast.kind == Kind.OBJECT) {
      const fields = ast.fields;
      return fields.reduce((memo, field) => {
        const operator = field.name.value;
        const value = field.value.value;
        if (['lt', 'gt', 'lte', 'gte'].includes(operator)) {
          memo['$' + operator] = parseFloat(value);
        }
        return memo;
      }, QueryConstraint.parseFields(fields));
    } else if (ast.kind == Kind.INT || ast.kind == Kind.FLOAT) {
      return parseFloat(ast.value);
    } else {
      throw 'Invalid literal for NumberQuery';
    }
  }
});
