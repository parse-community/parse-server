import {
  GraphQLScalarType
} from 'graphql'
// http://graphql.org/graphql-js/type/#graphqlscalartype
export const GraphQLJSONObject = new GraphQLScalarType({
  name: 'JSONObject',
  serialize: () => {
    throw "JSONObject serialize not implemented"
  },
  parseValue: () => {
    throw "JSONObject parseValue not implemented"
  },
  parseLiteral: (litteral) => {
    return litteral.fields.reduce((memo, field) => {
      const value = field.value;
      if (value.kind == 'IntValue') {
        memo[field.name.value] = parseInt(value.value, 10);
      } else {
        memo[field.name.value] = value.value;
      }
      return memo;
    }, {});
  }
});
