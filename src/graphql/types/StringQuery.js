import {
  GraphQLScalarType,
  Kind
} from 'graphql'

export const StringQuery = new GraphQLScalarType({
  name: 'StringQuery',
  description: `Query constraint on string parameters
  Supported constraints:

  - key: "value"
  - key: {regex: "value"}
  `,
  serialize: () => {
    throw "StringQuery serialize not implemented"
  },
  parseValue: () => {
    throw "StringQuery parseValue not implemented"
  },
  parseLiteral: (ast) => {
    if (ast.kind == Kind.OBJECT) {
      const fields = ast.fields;
      return fields.reduce((memo, field) => {
        const operator = field.name.value;
        const value = field.value.value;
        memo['$' + operator] = value;
        return memo;
      }, {});
    } else if (ast.kind == Kind.STRING) {
      return ast.value;
    } else {
      throw 'Invalid literal for StringQuery';
    }
  }
});
