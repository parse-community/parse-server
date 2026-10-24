// Builders for GeoPoint literals and geo query constraints, expressed as the
// raw REST `where` JSON that Parse Server expects. These mirror the wire format
// produced by the Parse JS SDK's Parse.Query geo methods, so query semantics
// (and result ordering) are identical.

export interface GeoPointLiteral {
  __type: 'GeoPoint';
  latitude: number;
  longitude: number;
}

export interface PolygonLiteral {
  __type: 'Polygon';
  coordinates: number[][];
}

// Earth radii used by the Parse SDK to convert distances to radians.
const EARTH_RADIUS_MILES = 3958.8;
const EARTH_RADIUS_KM = 6371.0;

export function geoPoint(latitude: number, longitude: number): GeoPointLiteral {
  return { __type: 'GeoPoint', latitude, longitude };
}

export function polygon(coordinates: number[][]): PolygonLiteral {
  return { __type: 'Polygon', coordinates };
}

/** Sorted proximity search with no max distance ($nearSphere). */
export function near(point: GeoPointLiteral) {
  return { $nearSphere: point };
}

/** Sorted proximity search within a max distance in radians. */
export function withinRadians(point: GeoPointLiteral, maxDistance: number) {
  return { $nearSphere: point, $maxDistance: maxDistance };
}

/** Sorted proximity search within a max distance in miles. */
export function withinMiles(point: GeoPointLiteral, miles: number) {
  return withinRadians(point, miles / EARTH_RADIUS_MILES);
}

/** Sorted proximity search within a max distance in kilometers. */
export function withinKilometers(point: GeoPointLiteral, kilometers: number) {
  return withinRadians(point, kilometers / EARTH_RADIUS_KM);
}

/** Rectangular search between a south-west and north-east corner. */
export function withinGeoBox(southwest: GeoPointLiteral, northeast: GeoPointLiteral) {
  return { $within: { $box: [southwest, northeast] } };
}

/**
 * Search within a polygon, given a list of GeoPoints or a Polygon object.
 * Typed as `unknown` because the negative-path specs deliberately pass invalid
 * values (numbers, empty arrays, malformed points) to exercise server validation.
 */
export function withinPolygon(polygon: unknown) {
  return { $geoWithin: { $polygon: polygon } };
}

/** Point-in-polygon search: matches stored polygons containing the point ($geoIntersects). */
export function geoIntersects(point: unknown) {
  return { $geoIntersects: { $point: point } };
}

/** Inequality constraint ($ne). */
export function notEqualTo(value: unknown) {
  return { $ne: value };
}
