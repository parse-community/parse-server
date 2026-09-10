// ObjectAdapter — the single boundary between parse-server's internal,
// SDK-agnostic object format and the Parse JS SDK's `Parse.Object`.
//
// parse-server represents an object internally as plain JSON (REST format).
// Cloud Code triggers (`beforeSave`, `afterSave`, `afterFind`, ...) and the
// LiveQuery server, however, are a public contract that hands the handler a
// real `Parse.Object` instance. This module is the conversion seam: the only
// place in `src/` that constructs or inspects a `Parse.Object`, so the rest of
// the codebase stays free of a direct SDK dependency on the object type.
// Towards #8787. Mirrors `QueryAdapter`.
//
// Scope note: this covers the *conversion* half only (inflate / deflate /
// type-check / hydrate). The SDK's pending-ops state tracking — the seam that
// flows a `beforeSave` handler's `set`/`unset`/`increment` mutations back into
// the write — is deferred to a follow-up and still reaches into the SDK
// directly (`_getStateIdentifier`, `getObjectStateController`, `_getSaveJSON`,
// `_handleSaveResponse`, `toJSONwithObjects`).

import Parse from 'parse/node';

// Build a `Parse.Object` from parse-server's REST format so it can be handed
// to a Cloud Code trigger. `data` is either a className string or a REST-format
// object; `restObject` is an optional set of fields merged on top. A payload
// with `className: '_User'` yields a `Parse.User`, so this also covers the
// `_User` / `Parse.User.fromJSON` call sites.
export function inflateObject(data, restObject) {
  const copy = typeof data === 'object' ? data : { className: data };
  for (const key in restObject) {
    copy[key] = restObject[key];
  }
  return Parse.Object.fromJSON(copy);
}

// Whether a value is a `Parse.Object` instance. Used where a trigger may return
// or be handed either a real object or some other value.
export function isObject(value) {
  return value instanceof Parse.Object;
}

// Deflate a `Parse.Object` to its full JSON representation (including the
// `__type`/`className` envelope), for LiveQuery message payloads.
export function toFullJSON(object) {
  return object._toFullJSON();
}

// Hydrate a `Parse.Object` from a full-JSON attribute payload without going
// through `fromJSON`. Used by the LiveQuery server to rebuild objects received
// from the publisher.
export function hydrateFromFullJSON(className, attributes) {
  const object = new Parse.Object(className);
  object._finishFetch(attributes);
  return object;
}

// Passthrough for the LiveQuery server's single-instance opt-out.
export function disableSingleInstance() {
  Parse.Object.disableSingleInstance();
}

export default { inflateObject, isObject, toFullJSON, hydrateFromFullJSON, disableSingleInstance };
