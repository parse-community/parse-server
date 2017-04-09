import {
  GraphQLScalarType,
  Kind
} from 'graphql'

export const NumberInput = new GraphQLScalarType({
  name: 'NumberInput',
  description: `Input for number
  Supported schemas:

  - key: 1
  - key: {increment: 1}
  `,
  serialize: () => {
    throw "NumberInput serialize not implemented"
  },
  parseValue: () => {
    throw "NumberInput parseValue not implemented"
  },
  parseLiteral: (ast) => {
    if (ast.kind == Kind.OBJECT) {
      const fields = ast.fields;
      if (fields.length != 1) {
        throw 'Invalid NUmberInput';
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
