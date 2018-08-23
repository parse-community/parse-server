import {
  GraphQLScalarType,
  Kind
} from 'graphql'

import QueryConstraint from './QueryConstraint';

export const StringQuery = new GraphQLScalarType({
  name: 'StringQuery',
  description: `Query constraint on string parameters

  # Common Constraints:

  ${QueryConstraint.description()}

  # String constraints:
  \`\`\`
  { key: "value" }
  { key: {regex: "value"}}
  \`\`\`
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
        if (operator === 'regex') {
          memo['$' + operator] = field.value.value;
        }
        return memo;
      }, QueryConstraint.parseFields(fields));
    } else if (ast.kind == Kind.STRING) {
      return ast.value;
    } else {
      throw 'Invalid literal for StringQuery';
    }
  }
});
