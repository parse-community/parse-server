import {
  GraphQLScalarType,
  Kind
} from 'graphql'

export const NumberQuery = new GraphQLScalarType({
  name: 'NumberQuery',
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
        memo['$' + operator] = parseFloat(value);
        return memo;
      }, {});
    } else if (ast.kind == Kind.INT || ast.kind == Kind.FLOAT) {
      return parseFloat(ast.value);
    } else {
      throw 'Invalid literal for NumberQuery';
    }
  }
});
