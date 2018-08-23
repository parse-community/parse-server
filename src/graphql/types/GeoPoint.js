import {
  GraphQLFloat,
  GraphQLObjectType,
  GraphQLInputObjectType,
  GraphQLNonNull,
  GraphQLList,
} from 'graphql'

import { BaseQuery } from './QueryConstraint';
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

export const GraphQLGeoPoint = new GraphQLObjectType({
  name: 'GeoPoint',
  fields: geoPointFields
});

export const GeoPoint = new GraphQLInputObjectType({
  name: 'GeoPointInput',
  fields: geoPointFields
});

export const NearQueryType = new GraphQLInputObjectType({
  name: 'NearQuery',
  fields: {
    point: {
      type: new GraphQLNonNull(GeoPoint),
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

export const WithinQueryType = new GraphQLInputObjectType({
  name: 'WithinQuery',
  fields: {
    box: {
      type: new GraphQLList(GeoPoint),
    },
  }
});

export const GeoWithinQueryType = new GraphQLInputObjectType({
  name: 'GeoWithinQuery',
  fields: {
    polygon: {
      type: new GraphQLList(GeoPoint),
    },
  }
});

export const GraphQLGeoPointQuery = new GraphQLInputObjectType({
  name: "GeoQuery",
  fields: Object.assign({}, BaseQuery(GeoPoint), {
    nearSphere: {
      type: NearQueryType
    },
    within: {
      type: WithinQueryType
    },
    geoWithin: {
      type: GeoWithinQueryType,
    }
  })
});

export const GraphQLGeoPointInput = GraphQLGeoPoint;
