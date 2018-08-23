import {
  GraphQLScalarType,
  GraphQLFloat,
  Kind,
} from 'graphql'

import QueryConstraint from './QueryConstraint';

export const GraphQLGeoPoint = new GraphQLScalarType({
  name: 'GeoPoint',
  fields: {
    latitude: {
      type: GraphQLFloat,
      name: 'latitude',
      description: 'laititude of the point, in degrees'
    },
    longitude: {
      type: GraphQLFloat,
      name: 'latitude',
      description: 'latitude of the point, in degrees'
    }
  },
  serialize: (object) => {
    return {
      latitude: object.latitude,
      longitude: object.longitude,
    }
  },
  parseValue: () => {
    throw "not implemented"
  },
  parseLiteral: () => {
    throw "not implemented"
  }
});

function parseValue(value) {
  if (!value) {
    return value;
  }
  if (value.kind === Kind.INT) {
    return parseInt(value.value);
  }
  if (value.kind === Kind.FLOAT) {
    return parseFloat(value.value);
  }
  if (value.kind === Kind.LIST) {
    return value.values.map((field) => {
      return parseValue(field);
    });
  }

  if (value.kind !== Kind.OBJECT) {
    return value;
  }
  return value.fields.reduce((memo, field) => {
    memo[field.name.value] = parseValue(field.value);
    return memo;
  }, {});
}

export const GraphQLGeoPointQuery = new GraphQLScalarType({
  name: 'GeoPointQuery',
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
        const value = parseValue(field.value);
        if (operator === 'near') {
          memo['$nearSphere'] = {
            type: '__GeoPoint',
            latitude: value.latitude,
            longitude: value.longitude,
          };
        }
        if (operator === 'maxDistanceInMiles' || operator === 'maxDistanceInKilometers' || operator === 'maxDistanceInRadians') {
          memo[`$${operator}`] = value;
        }
        if (operator === 'within') {
          memo['$within'] = {
            $box: value.map((val) => ({
              type: '__GeoPoint',
              latitude: val.latitude,
              longitude: val.longitude,
            }))
          };
        }
        if (operator === 'geoWithin') {
          memo['$geoWithin'] =  {
            $polygon: value.map((val) => ({
              type: '__GeoPoint',
              latitude: val.latitude,
              longitude: val.longitude,
            }))
          };
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


export const GraphQLGeoPointInput = GraphQLGeoPoint;
