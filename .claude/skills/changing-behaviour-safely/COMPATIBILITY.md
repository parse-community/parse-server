# Compatibility surfaces

A change is not just its call site. Four surfaces outlive any single release, and each one has broken users before.

---

## 1. Client SDKs

Parse Server is consumed by the JavaScript, iOS, Android, Flutter, PHP and .NET SDKs, and by applications talking raw REST. The server's responses are those SDKs' input, so a response-shape change ripples outward into applications you cannot see, test or fix.

**Error codes are not defined in this repository.** `src/Error.js` only holds sanitisation helpers. The `Parse.Error.<NAME>` enum lives in the Parse JS SDK (`parse/node`, pinned in `package.json`), and the rules are:

- Always throw `new Parse.Error(Parse.Error.SOME_CODE, 'message')`. **Never hard-code the numeric code.**
- Prefer an existing code that fits. Codes are shared across scenarios and distinguished by message, so a new, specific message under an existing code is usually the right change.
- Adding a genuinely new code is a **cross-repository, sequenced process**: land it in Parse-SDK-JS (`src/ParseError.js`), get an SDK release, bump the `parse` dependency here, then use it — and document it in the `parse-community/docs` repo (`_includes/common/errors.md`). You cannot do it inside this repo alone.

Changing which code a given failure returns is a breaking change even though nothing in this repo fails.

---

## 2. Version-gate instead of breaking

**This is the most useful tool for this problem and the least discoverable.** When behaviour genuinely must differ for older clients, the server can branch on the client's SDK version rather than breaking it.

`src/ClientSDK.js` provides it. The server reads the `X-Parse-Client-Version` header in `src/middlewares.js` (`info.clientVersion`, then `info.clientSDK = ClientSDK.fromString(info.clientVersion)`), parsing a string like `js1.9.0` into `{ sdk: 'js', version: '1.9.0' }`. `compatible()` then does a semver check per SDK:

```js
function supportsForwardDelete(clientSDK) {
  return compatible({
    js: '>=1.9.0',
  })(clientSDK);
}
```

Used at the call site as:

```js
const clientSupportsDelete = ClientSDK.supportsForwardDelete(this.clientSDK);
```

Two properties matter:

- **A missing or unparseable client version returns `true`** — raw REST callers and custom SDKs are treated as capable rather than being locked out. Preserve that; do not invert it into a denylist.
- It is already threaded through `rest.js`, `RestWrite.js`, `RestQuery.js`, the routers and the GraphQL helpers, so the plumbing exists wherever you are likely to need it.

Reach for this when a new behaviour would confuse an older client but the old behaviour is wrong for new ones. Add a named predicate next to `supportsForwardDelete` rather than inlining a semver range at the call site.

---

## 3. Keep the API surfaces consistent with each other

The same data is reachable through REST, GraphQL, LiveQuery and `/batch`. Changing one and not the others produces a divergence that is itself a compatibility break — the same operation now behaves differently depending on how a client reaches it.

For each behaviour change, ask which of these apply:

- **REST** — the routers under `src/Routers/`, via `rest.js` and `RestWrite`/`RestQuery`.
- **`/batch`** — `src/batch.js` replays mounted routes internally, so it usually inherits router-level changes automatically, but **not** anything you implement above the router.
- **GraphQL** — `src/GraphQL/` is an independently built schema layer. It derives class CRUD from the schema rather than from routers, so it does **not** automatically inherit a REST change.
- **LiveQuery** — `src/LiveQuery/` evaluates queries and pushes events on its own path. Field visibility, ACL and query semantics all have to be applied there separately.

`testing-parse-server/ADVERSARIAL-QA.md` treats this as a correctness question ("does a guard exist on every path?"). Here it is a compatibility question: if a client can observe the difference between two surfaces, you have shipped an inconsistency.

---

## 4. Existing data

Deployments have years of data written by older Parse Server versions. The database is a compatibility surface with no version header at all.

- **A read path must keep understanding what older versions wrote.** If you change how something is stored, existing rows do not migrate themselves.
- **Do not delete a legacy branch because it looks dead.** In this codebase those are frequently live guards. `MongoTransform.mongoObjectToParseObject`'s `default:` branch throws `"bad key in untransform: <key>"` on any unknown `_`-prefixed key, so a `case '_field'` passthrough is often the only thing keeping legacy documents readable. `testing-parse-server/GOTCHAS.md` records this; check the `default:` branch before removing a case.
- **Write the new format, keep reading the old one**, for at least as long as the deprecation window. A migration that requires downtime or a manual script is itself a breaking change and needs to be documented as one.
- Verify against data written *before* your change, not just data your new code wrote. Stored shape is not REST shape — inspect the database directly, per `testing-parse-server/VERIFICATION.md`.
