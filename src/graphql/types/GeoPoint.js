import {
  GraphQLScalarType,
  GraphQLFloat
} from 'graphql'

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

export const GraphQLGeoPointInput = GraphQLGeoPoint;
