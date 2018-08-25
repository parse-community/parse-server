import {
  GraphQLFloat,
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLNonNull,
  GraphQLList,
} from 'graphql'

import { BaseQuery } from './BaseQuery';
const geoPointFields = {
  latitude: {
    type: GraphQLFloat,
    description: 'laititude of the point, in degrees'
  },
  longitude: {
    type: GraphQLFloat,
    description: 'latitude of the point, in degrees'
  }
};

export const GeoPoint = new GraphQLObjectType({
  name: 'GeoPoint',
  fields: geoPointFields
});

export const GeoPointInput = new GraphQLInputObjectType({
  name: 'GeoPointInput',
  fields: geoPointFields
});

export const NearQuery = new GraphQLInputObjectType({
  name: 'NearQuery',
  fields: {
    point: {
      type: new GraphQLNonNull(GeoPointInput),
    },
    maxDistanceInMiles: {
      type: GraphQLFloat
    },
    maxDistanceInKilometers: {
      type: GraphQLFloat
    },
    maxDistanceInRadians: {
      type: GraphQLFloat
    }
  }
});

export const WithinQuery = new GraphQLInputObjectType({
  name: 'WithinQuery',
  fields: {
    box: {
      type: new GraphQLList(GeoPointInput),
    },
  }
});

export const GeoWithinQuery = new GraphQLInputObjectType({
  name: 'GeoWithinQuery',
  fields: {
    polygon: {
      type: new GraphQLList(GeoPointInput),
    },
  }
});

export const GeoPointQuery = new GraphQLInputObjectType({
  name: "GeoQuery",
  fields: Object.assign({}, BaseQuery(GeoPointInput), {
    nearSphere: {
      type: NearQuery
    },
    within: {
      type: WithinQuery
    },
    geoWithin: {
      type: GeoWithinQuery,
    }
  })
});
