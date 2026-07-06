// @flow
const Database = require('better-sqlite3');

function createClient(options: Object) {
  const filename = options.filename || ':memory:';
  const dbOptions = {
    fileMustExist: options.fileMustExist || false,
    timeout: options.timeout || 5000,
    verbose: options.verbose || null,
  };

  const db = new Database(filename, dbOptions);

  // Performance Pragmas
  if (filename !== ':memory:' && !filename.includes('mode=memory')) {
    db.pragma('journal_mode = WAL');
  }
  db.pragma('synchronous = NORMAL');
  db.pragma('temp_store = MEMORY');
  db.pragma('cache_size = -64000'); // 64MB cache size
  db.pragma('foreign_keys = ON');

  const unquotePcre = (pattern: string) => {
    if (typeof pattern !== 'string') return pattern;
    return pattern.replace(/\\Q([\s\S]*?)\\E/g, (_, p1) => {
      return p1.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    });
  };

  // Register REGEXP function for SQLite `REGEXP` operator
  db.function('regexp', { deterministic: true }, (pattern, text) => {
    if (pattern == null || text == null) {
      return 0;
    }
    try {
      const cleaned = unquotePcre(pattern);
      const re = new RegExp(cleaned);
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
      const cleaned = unquotePcre(pattern);
      const re = new RegExp(cleaned, flags || '');
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

    let inside = false;
    for (let i = 0, j = coords.length - 1; i < coords.length; j = i++) {
      const p1 = coords[i];
      const p2 = coords[j];
      const xi = Array.isArray(p1) ? p1[0] : p1.latitude;
      const yi = Array.isArray(p1) ? p1[1] : p1.longitude;
      const xj = Array.isArray(p2) ? p2[0] : p2.latitude;
      const yj = Array.isArray(p2) ? p2[1] : p2.longitude;

      const intersect = yi > lng !== yj > lng && lat < ((xj - xi) * (lng - yi)) / (yj - yi) + xi;
      if (intersect) {
        inside = !inside;
      }
    }
    return inside ? 1 : 0;
  });

  db.function('parse_array_add', { deterministic: true }, (targetStr, itemsStr) => {
    let target = [];
    try {
      target = targetStr ? JSON.parse(targetStr) : [];
      if (!Array.isArray(target)) target = [];
    } catch {
      target = [];
    }
    let items = [];
    try {
      items = itemsStr ? JSON.parse(itemsStr) : [];
      if (!Array.isArray(items)) items = [itemsStr];
    } catch {
      items = [];
    }
    return JSON.stringify([...target, ...items]);
  });

  db.function('parse_array_add_unique', { deterministic: true }, (targetStr, itemsStr) => {
    let target = [];
    try {
      target = targetStr ? JSON.parse(targetStr) : [];
      if (!Array.isArray(target)) target = [];
    } catch {
      target = [];
    }
    let items = [];
    try {
      items = itemsStr ? JSON.parse(itemsStr) : [];
      if (!Array.isArray(items)) items = [itemsStr];
    } catch {
      items = [];
    }
    const targetSet = new Set(target.map(x => JSON.stringify(x)));
    for (const item of items) {
      const s = JSON.stringify(item);
      if (!targetSet.has(s)) {
        targetSet.add(s);
        target.push(item);
      }
    }
    return JSON.stringify(target);
  });

  db.function('parse_array_remove', { deterministic: true }, (targetStr, itemsStr) => {
    let target = [];
    try {
      target = targetStr ? JSON.parse(targetStr) : [];
      if (!Array.isArray(target)) target = [];
    } catch {
      target = [];
    }
    let items = [];
    try {
      items = itemsStr ? JSON.parse(itemsStr) : [];
      if (!Array.isArray(items)) items = [itemsStr];
    } catch {
      items = [];
    }
    const removeSet = new Set(items.map(x => JSON.stringify(x)));
    const result = target.filter(x => !removeSet.has(JSON.stringify(x)));
    return JSON.stringify(result);
  });

  return db;
}

module.exports = {
  createClient,
};
