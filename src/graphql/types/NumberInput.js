import {
  GraphQLScalarType,
  Kind
} from 'graphql'

const id = (value) => value;

export const NumberInput = new GraphQLScalarType({
  name: 'NumberInput',
  description: `Input for number
  Supported schemas:

  - key: 1
  - key: {increment: 1}
  `,
  serialize: id,
  parseValue: id,
  parseLiteral: (ast) => {
    if (ast.kind == Kind.OBJECT) {
      const fields = ast.fields;
      if (fields.length != 1) {
        throw 'Invalid literal for NumberInput (too many fields)';
      }
      const field = fields[0];
      const operator = field.name.value;
      if (operator != "increment") {
        throw `the ${operator} operator is not supported`;
      }
      const value = field.value.value;
      return {"__op":"Increment","amount": parseFloat(value)};
    } else if (ast.kind == Kind.INT || ast.kind == Kind.FLOAT) {
      return parseFloat(ast.value);
    } else {
      throw 'Invalid literal for NumberInput';
    }
  }
});
