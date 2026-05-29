// Builders for GeoPoint literals and geo query constraints, expressed as the
// raw REST `where` JSON that Parse Server expects. These mirror the wire format
// produced by the Parse JS SDK's Parse.Query geo methods, so query semantics
// (and result ordering) are identical.

export interface GeoPointLiteral {
  __type: 'GeoPoint';
  latitude: number;
  longitude: number;
}

// Earth radii used by the Parse SDK to convert distances to radians.
const EARTH_RADIUS_MILES = 3958.8;
const EARTH_RADIUS_KM = 6371.0;

export function geoPoint(latitude: number, longitude: number): GeoPointLiteral {
  return { __type: 'GeoPoint', latitude, longitude };
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

/** Search within a polygon, given either a list of points or a Polygon object. */
export function withinPolygon(polygon: GeoPointLiteral[] | unknown) {
  return { $geoWithin: { $polygon: polygon } };
}

/** Inequality constraint ($ne). */
export function notEqualTo(value: unknown) {
  return { $ne: value };
}
