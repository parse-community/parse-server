import {
  GraphQLScalarType,
  Kind
} from 'graphql'

const supportedOperators = ['eq', 'ne', 'in', 'nin', 'exists', 'select', 'dontSelect']

export const QueryConstraint = new GraphQLScalarType({
  name: 'QueryConstraint',
  description: `Generic Query Constraint
  Supported constraints:
  
  Equal To:
  - key: "value"
  - key: {eq: "value"}
  
  Not Equal To
  - key: {ne: "value"}
  
  Contained in:
  - key: {in: ["value1", "value2"]}
  Not Contained in:
  - key: {nin: ["value1", "value2"]}
  
  Exists: 
  - key: {exists: true}
  
  This matches a value for a key in the result of a different query
  - key: {select: {"query": {"className":"Team","where":{"winPct":{"$gt":0.5}}},"key":"city"}}}

  Requires that a key’s value not match a value for a key in the result of a different query
  - key: {dontSelect: {"query": {"className":"Team","where":{"winPct":{"$gt":0.5}}},"key":"city"}}}
  `,
  serialize: () => {
    throw "QueryConstraint serialize not implemented"
  },
  parseValue: () => {
    throw "QueryConstraint parseValue not implemented"
  },
  parseLiteral: (ast) => {
    if (ast.kind == Kind.OBJECT) {
      const fields = ast.fields;
      return fields.reduce((memo, field) => {
        const operator = field.name.value;
        if (supportedOperators.indexOf(operator) > -1) {
          const value = field.value.value;
          memo['$' + operator] = value;
        }
        return memo;
      }, {});
    } else if (ast.kind == Kind.STRING) {
      return ast.value;
    } else {
      throw 'Invalid literal for QueryConstraint';
    }
  }
});
