// @flow
const Database = require('better-sqlite3');
const {
  canonicalJSONStringify,
  normalizeRegexPattern,
  parseJSONArray,
} = require('./SQLiteUtils');

const DEFAULT_SQLITE_CACHE_SIZE_KB = 32768;

function getSQLiteCacheSizeKb(options: Object) {
  const rawValue = options.cacheSizeKb;
  if (rawValue === undefined || rawValue === null) {
    return DEFAULT_SQLITE_CACHE_SIZE_KB;
  }
  const cacheSizeKb = Number(rawValue);
  if (!Number.isFinite(cacheSizeKb) || cacheSizeKb <= 0) {
    return DEFAULT_SQLITE_CACHE_SIZE_KB;
  }
  return Math.trunc(cacheSizeKb);
}

function createClient(options: Object) {
  const filename = options.filename || ':memory:';
  const dbOptions = {
    fileMustExist: options.fileMustExist || false,
    timeout: options.timeout || 5000,
    verbose: options.verbose || null,
  };
  const cacheSizeKb = getSQLiteCacheSizeKb(options);

  const db = new Database(filename, dbOptions);

  // Performance Pragmas
  if (filename !== ':memory:' && !filename.includes('mode=memory')) {
    db.pragma('journal_mode = WAL');
  }
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');
  // Keep the default cache modest for small Parse installs; callers can raise it.
  db.pragma(`cache_size = -${cacheSizeKb}`);
  db.pragma('foreign_keys = ON');

  // Register REGEXP function for SQLite `REGEXP` operator
  db.function('regexp', { deterministic: true }, (pattern, text) => {
    if (pattern == null || text == null) {
      return 0;
    }
    try {
      const normalizedRegex = normalizeRegexPattern(String(pattern));
      const re = new RegExp(normalizedRegex.pattern);
      return re.test(String(text)) ? 1 : 0;
    } catch {
      return 0;
    }
  });

  // Register REGEXP_WITH_FLAGS function for `$options: 'i'` queries
  db.function('regexp_flags', { deterministic: true }, (pattern, flags, text) => {
    if (pattern == null || text == null) {
      return 0;
    }
    try {
      const normalizedRegex = normalizeRegexPattern(String(pattern), flags ? String(flags) : '');
      const re = new RegExp(normalizedRegex.pattern, normalizedRegex.flags);
      return re.test(String(text)) ? 1 : 0;
    } catch {
      return 0;
    }
  });

  // Geo distance function (returns distance in radians)
  db.function('parse_geo_distance', { deterministic: true }, (lat1, lng1, lat2, lng2) => {
    if (lat1 == null || lng1 == null || lat2 == null || lng2 == null) {
      return null;
    }
    const rad = d => (d * Math.PI) / 180;
    const rLat1 = rad(Number(lat1));
    const rLat2 = rad(Number(lat2));
    const rLng1 = rad(Number(lng1));
    const rLng2 = rad(Number(lng2));
    const dLat = rLat2 - rLat1;
    const dLng = rLng2 - rLng1;
    const a =
      Math.sin(dLat / 2) ** 2 + Math.cos(rLat1) * Math.cos(rLat2) * Math.sin(dLng / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return c;
  });

  // Geo within box function
  db.function('parse_within_box', { deterministic: true }, (lat, lng, swLat, swLng, neLat, neLng) => {
    if (lat == null || lng == null || swLat == null || swLng == null || neLat == null || neLng == null) {
      return 0;
    }
    lat = Number(lat);
    lng = Number(lng);
    swLat = Number(swLat);
    swLng = Number(swLng);
    neLat = Number(neLat);
    neLng = Number(neLng);
    const minLat = Math.min(swLat, neLat);
    const maxLat = Math.max(swLat, neLat);
    const minLng = Math.min(swLng, neLng);
    const maxLng = Math.max(swLng, neLng);
    return lat >= minLat && lat <= maxLat && lng >= minLng && lng <= maxLng ? 1 : 0;
  });

  // Geo point in polygon function
  db.function('parse_within_polygon', { deterministic: true }, (lat, lng, polygonJson) => {
    if (lat == null || lng == null || !polygonJson) {
      return 0;
    }
    lat = Number(lat);
    lng = Number(lng);
    let coords;
    try {
      coords = typeof polygonJson === 'string' ? JSON.parse(polygonJson) : polygonJson;
      if (coords.__type === 'Polygon') {
        coords = coords.coordinates;
      }
    } catch {
      return 0;
    }
    if (!Array.isArray(coords) || coords.length === 0) {
      return 0;
    }

    const isSameCoordinate = (left, right) =>
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === 2 &&
      right.length === 2 &&
      Number(left[0]) === Number(right[0]) &&
      Number(left[1]) === Number(right[1]);

    if (coords.length > 1 && isSameCoordinate(coords[0], coords[coords.length - 1])) {
      coords = coords.slice(0, -1);
    }
    if (coords.length < 3) {
      return 0;
    }

    const isPointOnSegment = (px, py, ax, ay, bx, by) => {
      const epsilon = 1e-10;
      const cross = (px - ax) * (by - ay) - (py - ay) * (bx - ax);
      if (Math.abs(cross) > epsilon) {
        return false;
      }
      const dot = (px - ax) * (bx - ax) + (py - ay) * (by - ay);
      if (dot < -epsilon) {
        return false;
      }
      const squaredLength = (bx - ax) ** 2 + (by - ay) ** 2;
      if (dot - squaredLength > epsilon) {
        return false;
      }
      return true;
    };

    let inside = false;
    for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
      const p1 = coords[i];
      const p2 = coords[j];
      const xi = Array.isArray(p1) ? p1[0] : p1.latitude;
      const yi = Array.isArray(p1) ? p1[1] : p1.longitude;
      const xj = Array.isArray(p2) ? p2[0] : p2.latitude;
      const yj = Array.isArray(p2) ? p2[1] : p2.longitude;

      if (isPointOnSegment(lat, lng, xi, yi, xj, yj)) {
        return 1;
      }

      const intersect = yi > lng !== yj > lng && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
      if (intersect) {
        inside = !inside;
      }
    }
    return inside ? 1 : 0;
  });

  db.function('parse_array_add_unique', { deterministic: true }, (targetStr, itemsStr) => {
    const target = parseJSONArray(targetStr);
    const items = parseJSONArray(itemsStr);

    // Normalize object key order once so equality behaves consistently.
    const targetSet = new Set(target.map(item => canonicalJSONStringify(item)));
    for (const item of items) {
      const serializedItem = canonicalJSONStringify(item);
      if (!targetSet.has(serializedItem)) {
        targetSet.add(serializedItem);
        target.push(item);
      }
    }
    return JSON.stringify(target);
  });

  db.function('parse_array_remove', { deterministic: true }, (targetStr, itemsStr) => {
    const target = parseJSONArray(targetStr);
    const items = parseJSONArray(itemsStr);
    const removeSet = new Set(items.map(item => canonicalJSONStringify(item)));
    const result = target.filter(item => !removeSet.has(canonicalJSONStringify(item)));
    return JSON.stringify(result);
  });

  return db;
}

module.exports = {
  createClient,
};
