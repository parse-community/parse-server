# Security probing

Parse Server is internet-facing infrastructure holding other people's user data. Its vulnerability history is **long, public, and highly repetitive** - the repo's own specs cite 28 GHSA advisories, and they cluster into a small number of primitives that keep working in new places.

That repetition is the opportunity: you do not need to invent a threat model. **Take the primitives below and apply them to whatever you just changed.** If your change touches any surface here and you have not run the matching probes, the change is not verified.

## Start here: ask the file what it has already been exploited for

**The single highest-value move, before any probe: read the advisory history of the file you are editing.**

```bash
git log --oneline -- <path/to/file/you/changed> | grep -iE "GHSA|injection|security|vulnerab"
```

Parse Server commit messages carry the GHSA id and a description, so this returns a targeted list of *the attacks that have already worked on these exact lines*. It routinely surfaces more than the spec catalogue does, because some fixes have no spec naming them.

Run it before you write a line of test code, then read the linked fix. If your change touches code that was hardened against an attack, **you are not adding a feature - you are modifying a security control**, and the burden is to prove you did not reopen it. Re-run that advisory's existing specs against your build, and add payloads tuned to whatever *your* code newly introduces (the old payloads were written against the old code, so passing them is necessary, not sufficient).

Then read the living catalogue for the class as a whole:

```bash
grep -rhoE "GHSA-[a-z0-9]{4}-[a-z0-9]{4}-[a-z0-9]{4}" spec/ | sort -u
grep -nE "describe\('\(GHSA" spec/vulnerabilities.spec.js
```

Security specs live in `spec/vulnerabilities.spec.js`, `spec/RegexVulnerabilities.spec.js`, `spec/ProtectedFields.spec.js`, `spec/SecurityCheck.spec.js`, `spec/SecurityCheckGroups.spec.js`.

> **Scope.** Defensive QA of the server you are changing: find the flaw, write the failing spec, fix it. Probes run against your local test server, never against a deployment you do not own.

---

# Part 1 - The recurring primitives

Derived from the advisories this repo has actually shipped fixes for. Each row is a *technique*, and the "seen in" column shows it is not hypothetical.

| # | Primitive | What it does | Seen in |
|---|---|---|---|
| 1 | **Dot-notation sub-keys** | `"a.b"` as a field name slips past validation that only checks top-level keys, then reaches SQL, a WHERE clause, or a protected-field filter | `GHSA-qpr4-jrj4-6f27` (SQL injection via sort), `GHSA-gqpp-xgvh-9h7h` (increment sub-key), `GHSA-r2m8-pxm9-9c4g` + `GHSA-j7mm-f4rv-6q6q` (protectedFields bypass) |
| 2 | **Prototype pollution** | `__proto__` / `constructor` / `prototype` as a key, at any depth or as a keypath string, poisons object lookups | `GHSA-5j86-7r7m-p8h6`, `GHSA-4263-jgmp-7pf4` (cloud function names), `GHSA-3v4q-4q9g-x83q` (application id), `GHSA-9ccr-fpp6-78qf` (schema poisoning) |
| 3 | **Field names reaching SQL** | Postgres builds SQL from *identifiers*, not just values. An unescaped field name is injection even when every value is parameterised | `GHSA-qpr4-jrj4-6f27`, `GHSA-q3vj-96h2-gwvg`, `GHSA-gqpp-xgvh-9h7h`, `GHSA-c442-97qw-j6c6` |
| 4 | **Type confusion / operator smuggling** | A string parameter is supplied as an object (`{"$ne":null}`, `{"$regex":…}`) and becomes a query operator | `GHSA-fjxm-vhvc-gcmj` (LiveQuery operators), `GHSA-wjqw-r9x4-j59v` (empty authData), all of `RegexVulnerabilities.spec.js` |
| 5 | **Guard present on one path only** | REST is protected; LiveQuery, GraphQL, batch, or the direct DB path is not | `GHSA-j7mm-f4rv-6q6q` (LiveQuery), `GHSA-p2x3-8689-cwpg` (GraphQL WebSocket), `GHSA-2xm2-xj2q-qgpj` (LiveQuery session) |
| 6 | **Denylist bypass by position** | The value is *scanned*, but not when nested inside a sibling object or array | `GHSA-q342-9w2p-57fp` |
| 7 | **Algorithmic DoS** | Catastrophic-backtracking regex or deep nesting consumes the event loop or the stack | `GHSA-mf3j-86qx-cq5j`, `GHSA-qxh4-6wmx-rhg9` (ReDoS), `GHSA-9xp9-j92r-p88v` (stack overflow via nested operators) |
| 8 | **Content-type / extension handling** | A file is served with a type that executes in the browser | `GHSA-v5hf-f4c3-m5rv`, `GHSA-42ph-pf9q-cr72` (parameterised Content-Type bypass), `GHSA-3jmq-rrxf-gqrg` |
| 9 | **Shared mutable state** | A singleton or shared context leaks data between providers, requests or evaluations | `GHSA-2cjm-2gwv-m892` (OAuth2 singleton), `GHSA-v88r-ghm9-267f` (regex vmContext cross-contamination) |
| 10 | **Concurrency defeating single-use** | Two simultaneous requests both pass a "has it been used?" check | `GHSA-r3xq-68wh-gwvh` (password reset token) |
| 11 | **Trusting a client-supplied identifier** | A custom `objectId` shaped like an internal identifier (`role:admin`) grants privilege | `GHSA-8xq9-g7ch-35hg` |
| 12 | **Response differences as an oracle** | Status/body/timing differences disclose whether an account exists | `GHSA-w54v-hf9p-8856` (email verification enumeration) |
| 13 | **Trusting attacker-controlled crypto metadata** | Using the JWT header's `alg` instead of a hardcoded algorithm accepts forged tokens | `GHSA-4q3h-vp4r-prv2` (`alg:none`) |

## How to use this table

For your change, ask which primitives are *reachable*, then probe those:

- Does it accept a **field name, key, or sort key** from the client? → 1, 3
- Does it use a client string to **index an object**? → 2
- Does it accept a value that should be a **string**? → 4
- Does the data path exist in **LiveQuery / GraphQL / batch** too? → 5
- Does it **scan or filter** request data? → 6
- Does it accept a **regex or nestable structure**? → 7
- Does it touch **files, extensions or content types**? → 8
- Does it use a **singleton, cache or shared context**? → 9
- Does it enforce **single use or a quota**? → 10
- Does it accept a **client-supplied id**? → 11
- Does it answer **differently for existing vs non-existing** records? → 12
- Does it **verify a token** whose parameters come from the token? → 13

---

# Part 2 - Surface-by-surface probes

## Authorization: ACL and CLP (OWASP API1)

Every read and write path must enforce ACL **independently**. The failure is never the direct GET - it is the secondary path that forgot.

Create an object owned by user A with a private ACL, then attempt to reach it as anonymous, as user B, and via each of: `include` from a readable object; `$relatedTo` / relation query; `count`; `distinct` / `aggregate`; `select` / `keys` projection; `/batch`; GraphQL; a LiveQuery subscription; a `beforeFind` that rewrites the query; and dot-notation into an object field (primitive 1).

Also probe **existence disclosure**: do 404-vs-403, error text, or a non-zero `count` reveal that an unreadable object exists?

## Field-level: mass assignment and data exposure (API3)

**Can a client write a field it should not own?** Probe `_hashed_password`, `_perishable_token`, `_email_verify_token`, `emailVerified`, `_failed_login_count`, `sessionToken`, `ACL` on another user's object, `objectId`/`createdAt`/`updatedAt`, and any `_`-prefixed key - **at top level, nested in an object, inside an array, and via dot-notation** (that last position is primitive 1 and is where the bypasses were found).

**Does a field leak on read?** `protectedFields` defaults to `{ _User: { '*': ['email'] } }`. Probe whether it holds through: direct GET, `keys`/`select` projection, `include` from another class, `count`, aggregate/distinct, **LiveQuery events**, `afterFind` output, error messages, and **dot-notation WHERE clauses on object-type fields** - the exact shape of `GHSA-r2m8-pxm9-9c4g` and `GHSA-j7mm-f4rv-6q6q`.

Then compare stored shape against REST output (VERIFICATION.md step 7): `_hashed_password`, `_rperm`/`_wperm`, `_p_*` must never reach a client.

## Authentication and sessions (API2)

- Supply session tokens, email-verification tokens, password-reset tokens and `authData` ids as **operator objects** (`{"$ne":null}`, `{"$regex":"^r:"}`, `{"$exists":true}`, `{"$gt":""}`) - primitive 4. Every such lookup must **type-check for a string first**.
- Empty / missing / malformed `authData` must not issue a session (`GHSA-wjqw-r9x4-j59v`).
- JWT-based adapters must use a **hardcoded algorithm**, never the token's own `alg` header (`GHSA-4q3h-vp4r-prv2`).
- Token reuse after logout, password change, or user deletion.
- Poisoned `objectId` (`role:abc`) with `allowCustomObjectId` enabled (`GHSA-8xq9-g7ch-35hg`).
- **Concurrent** use of a single-use reset token (primitive 10).
- Password-reset and email-verification **enumeration** - note `emailVerifySuccessOnInvalidEmail` exists precisely because of this.

## Function-level authorization (API5)

Call every endpoint with: no key, client key, JavaScript key, REST key, session token, **read-only master key**, **maintenance key**, and master key - and assert each outcome deliberately. Read-only master key must not write.

Cloud functions must not be reachable via prototype-chain names (`constructor`, `toString`, `valueOf`, `hasOwnProperty`, `__proto__.toString`), and the same applies to **application ids used as object keys** (primitive 2).

> Master key bypasses ACL and CLP entirely. A test that only uses the master key proves nothing about authorization.

## Injection

- **NoSQL operator smuggling:** `{"$ne":null}`, `{"$gt":""}`, `{"$regex":…}`, `{"$exists":true}`, `{"$where":…}`, `{"$expr":…}`, `{"$function":…}`, `{"_bsontype":"Code"}`. The `requestKeywordDenylist` option deep-scans request data (default denies `_bsontype` among others) - probe it **nested inside sibling objects and arrays**, which is how `GHSA-q342-9w2p-57fp` bypassed it.
- **SQL injection via identifiers (Postgres):** field names, sort keys, `$regex` operator field names, increment targets and dot-notation sub-keys. **Run every injection probe on both backends** - the Mongo path being safe says nothing about the SQL path, and four separate advisories live here.
- **Prototype pollution:** `__proto__` / `constructor` / `prototype` in object writes, cloud function names, application ids, **schema/field creation**, global config, file metadata and tags, and direct database writes - top-level, nested, and as dot-notation keypaths.

## Availability (API4)

ReDoS via `$regex` in queries **and** LiveQuery subscriptions (`regexTimeout` defaults to 100ms - verify it applies to your path); deeply nested `$or`/`$and`/operators causing stack overflow; unbounded `limit`, `limit` above `maxLimit`, unbounded `skip`; deep `include` chains; huge `$in`/`$all` arrays; large uploads. Confirm rate limiting actually covers any endpoint you add.

## Files

Extension and content-type handling, including **parameterised Content-Type** (`text/plain; charset=…`) which was itself a filter bypass. If you touch file naming, extensions, or serving, probe `.svgz`, `.xht`, `.xml`, `.xsl`, `.xslt` and confirm what content type is actually served.

## SSRF (API7)

Anywhere the server fetches a URL you influence - auth adapter endpoints, webhook/hook URLs, `Parse.Cloud.httpRequest`, file URL fetching, LiveQuery `redisURL`: probe `127.0.0.1`, `169.254.169.254`, `[::1]`, redirect-to-internal, and non-http schemes.

## Configuration (API8)

The repo encodes its own baseline - treat these as a checklist your change must not regress:

```bash
grep -n "title:" src/Security/CheckGroups/CheckGroupServerConfig.js src/Security/CheckGroups/CheckGroupDatabase.js
```

Covers secure master key, security log disabled, client class creation disabled, users created without public access, insecure auth adapters disabled, GraphQL introspection/playground disabled, public database explain disabled, read-only master key IP restriction, request complexity limits, password-reset and email-verification enumeration mitigations, LiveQuery regex timeout, secure database password.

**If you add an option, ask whether it needs a security check and whether its default is the safe one.** Defaults are what most deployments run. New checks go in `src/Security/CheckGroups/` - CONTRIBUTING has a wording guideline.

---

# Part 3 - Writing the spec

```js
describe('(GHSA-xxxx-xxxx-xxxx) Short description of the vulnerability', () => {
  it('rejects operator object as session token', async () => {
    await expectAsync(
      new Parse.Query(Parse.User).find({ sessionToken: { $ne: null } })
    ).toBeRejectedWith(new Parse.Error(Parse.Error.INVALID_SESSION_TOKEN, 'Invalid session token'));
  });
});
```

Rules:

1. **Assert the specific error**, never just "it rejected" - a rejection for the wrong reason hides a live vulnerability.
2. **Name the GHSA id** in the describe block when one exists; match the existing convention.
3. **Guard-proof it** against the unfixed code (VERIFICATION.md step 3). A security spec that passes before the fix is worthless.
4. **Cover the sibling paths** - if you fixed REST, add the LiveQuery/GraphQL/batch case too (primitive 5).
5. **Run it on both backends** for anything involving field names or queries.
6. Put it next to its relatives in `spec/vulnerabilities.spec.js` or `spec/RegexVulnerabilities.spec.js`.

---

# Part 4 - Disclosure

**A vulnerability you find in existing code is not a normal bug report.**

- **Do not open a public GitHub issue, and do not describe it in a public PR.** Follow the repo's security policy (`SECURITY.md` at the repo root) for private disclosure.
- Tell the user what you found, with evidence, and let them decide how to route it.
- If you are fixing one under an advisory, CONTRIBUTING's "Security Vulnerability" section defines the local-testing and merge process - it requires the full Mongo suite, the Postgres suite, `madge:circular`, `lint`, and `definitions` before publishing.
- Fixing a vulnerability in code you touched is in scope for your PR. Expanding into an unrelated vulnerability is a scope change - report it and ask.
