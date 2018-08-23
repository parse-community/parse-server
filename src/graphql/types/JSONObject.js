import {
  GraphQLScalarType,
  Kind,
} from 'graphql'

function parseLiteral(ast, variables) {
  switch (ast.kind) {
  case Kind.STRING:
  case Kind.BOOLEAN:
    return ast.value;
  case Kind.INT:
  case Kind.FLOAT:
    return parseFloat(ast.value);
  case Kind.OBJECT: {
    const value = Object.create(null);
    ast.fields.forEach(field => {
      value[field.name.value] = parseLiteral(field.value, variables);
    });

    return value;
  }
  case Kind.LIST:
    return ast.values.map(n => parseLiteral(n, variables));
  case Kind.NULL:
    return null;
  case Kind.VARIABLE: {
    const name = ast.name.value;
    return variables ? variables[name] : undefined;
  }
  default:
    return undefined;
  }
}

const id = (value) => value;

// https://github.com/taion/graphql-type-json/blob/master/src/index.js
// http://graphql.org/graphql-js/type/#graphqlscalartype
export const GraphQLJSONObject = new GraphQLScalarType({
  name: 'JSON',
  description:
  'The `JSON` scalar type represents JSON values as specified by ' +
  '[ECMA-404](http://www.ecma-international.org/' +
  'publications/files/ECMA-ST/ECMA-404.pdf).',
  serialize: id,
  parseValue: id,
  parseLiteral
});
