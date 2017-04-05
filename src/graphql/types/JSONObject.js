import {
  GraphQLScalarType
} from 'graphql'
/* eslint-disable */
// http://graphql.org/graphql-js/type/#graphqlscalartype
export const GraphQLJSONObject = new GraphQLScalarType({
  name: 'JSONObject',
  serialize: (...options) => {
    console.log(options);
    throw "JSONObject serialize not implemented"
  },
  parseValue: (...options) => {
    console.log(options);
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
      console.log(field);
      return memo;
    }, {});
  }
});
