# [5.0.0-alpha.23](https://github.com/parse-community/parse-server/compare/5.0.0-alpha.22...5.0.0-alpha.23) (2022-02-06)


### Bug Fixes

* server crash using GraphQL due to missing @apollo/client peer dependency ([#7787](https://github.com/parse-community/parse-server/issues/7787)) ([08089d6](https://github.com/parse-community/parse-server/commit/08089d6fcbb215412448ce7d92b21b9fe6c929f2))

# [5.0.0-alpha.22](https://github.com/parse-community/parse-server/compare/5.0.0-alpha.21...5.0.0-alpha.22) (2022-02-06)


### Features

* upgrade to MongoDB Node.js driver 4.x for MongoDB 5.0 support ([#7794](https://github.com/parse-community/parse-server/issues/7794)) ([f88aa2a](https://github.com/parse-community/parse-server/commit/f88aa2a62a533e5344d1c13dd38c5a0b283a480a))


### BREAKING CHANGES

* The MongoDB GridStore adapter has been removed. By default, Parse Server already uses GridFS, so if you do not manually use the GridStore adapter, you can ignore this change. ([f88aa2a](f88aa2a))

# [5.0.0-alpha.21](https://github.com/parse-community/parse-server/compare/5.0.0-alpha.20...5.0.0-alpha.21) (2022-01-25)


### Features

* add Cloud Code context to `ParseObject.fetch` ([#7779](https://github.com/parse-community/parse-server/issues/7779)) ([315290d](https://github.com/parse-community/parse-server/commit/315290d16110110938f80a6b779cc2d1db58c552))

# [5.0.0-alpha.20](https://github.com/parse-community/parse-server/compare/5.0.0-alpha.19...5.0.0-alpha.20) (2022-01-22)


### Bug Fixes

* bump node-fetch from 2.6.1 to 3.1.1 ([#7782](https://github.com/parse-community/parse-server/issues/7782)) ([9082351](https://github.com/parse-community/parse-server/commit/90823514113a1a085ebc818f7109b3fd7591346f))

# [5.0.0-alpha.19](https://github.com/parse-community/parse-server/compare/5.0.0-alpha.18...5.0.0-alpha.19) (2022-01-22)


### Bug Fixes

* bump nanoid from 3.1.25 to 3.2.0 ([#7781](https://github.com/parse-community/parse-server/issues/7781)) ([f5f63bf](https://github.com/parse-community/parse-server/commit/f5f63bfc64d3481ed944ceb5e9f50b33dccd1ce9))

# [5.0.0-alpha.18](https://github.com/parse-community/parse-server/compare/5.0.0-alpha.17...5.0.0-alpha.18) (2022-01-13)


### Bug Fixes

* security upgrade follow-redirects from 1.14.6 to 1.14.7 ([#7769](https://github.com/parse-community/parse-server/issues/7769)) ([8f5a861](https://github.com/parse-community/parse-server/commit/8f5a8618cfa7ed9a2a239a095abffa8f3fd8d31a))

# [5.0.0-alpha.17](https://github.com/parse-community/parse-server/compare/5.0.0-alpha.16...5.0.0-alpha.17) (2022-01-13)


### Bug Fixes

* schema cache not cleared in some cases ([#7678](https://github.com/parse-community/parse-server/issues/7678)) ([5af6e5d](https://github.com/parse-community/parse-server/commit/5af6e5dfaa129b1a350afcba4fb381b21c4cc35d))

# [5.0.0-alpha.16](https://github.com/parse-community/parse-server/compare/5.0.0-alpha.15...5.0.0-alpha.16) (2022-01-02)


### Features

* add Idempotency to Postgres ([#7750](https://github.com/parse-community/parse-server/issues/7750)) ([0c3feaa](https://github.com/parse-community/parse-server/commit/0c3feaaa1751964c0db89f25674935c3354b1538))

# [5.0.0-alpha.15](https://github.com/parse-community/parse-server/compare/5.0.0-alpha.14...5.0.0-alpha.15) (2022-01-02)


### Features

* support `postgresql` protocol in database URI ([#7757](https://github.com/parse-community/parse-server/issues/7757)) ([caf4a23](https://github.com/parse-community/parse-server/commit/caf4a2341f554b28e3918c53e7e897a3ca47bf8b))

# [5.0.0-alpha.14](https://github.com/parse-community/parse-server/compare/5.0.0-alpha.13...5.0.0-alpha.14) (2022-01-02)


### Features

* support relativeTime query constraint on Postgres ([#7747](https://github.com/parse-community/parse-server/issues/7747)) ([16b1b2a](https://github.com/parse-community/parse-server/commit/16b1b2a19714535ca805f2dbb3b561d8f6a519a7))

# [5.0.0-alpha.13](https://github.com/parse-community/parse-server/compare/5.0.0-alpha.12...5.0.0-alpha.13) (2021-12-08)


### Bug Fixes

* node engine compatibility did not include node 16 ([#7739](https://github.com/parse-community/parse-server/issues/7739)) ([ea7c014](https://github.com/parse-community/parse-server/commit/ea7c01400f992a1263543706fe49b6174758a2d6))

# [5.0.0-alpha.12](https://github.com/parse-community/parse-server/compare/5.0.0-alpha.11...5.0.0-alpha.12) (2021-12-06)


### Bug Fixes

* adding or modifying a nested property requires addField permissions ([#7679](https://github.com/parse-community/parse-server/issues/7679)) ([6a6248b](https://github.com/parse-community/parse-server/commit/6a6248b6cb2e732d17131e18e659943b894ed2f1))

# [5.0.0-alpha.11](https://github.com/parse-community/parse-server/compare/5.0.0-alpha.10...5.0.0-alpha.11) (2021-11-29)


### Bug Fixes

* upgrade mime from 2.5.2 to 3.0.0 ([#7725](https://github.com/parse-community/parse-server/issues/7725)) ([f5ef98b](https://github.com/parse-community/parse-server/commit/f5ef98bde32083403c0e30a12162fcc1e52cac37))

# [5.0.0-alpha.10](https://github.com/parse-community/parse-server/compare/5.0.0-alpha.9...5.0.0-alpha.10) (2021-11-29)


### Bug Fixes

* upgrade parse from 3.3.1 to 3.4.0 ([#7723](https://github.com/parse-community/parse-server/issues/7723)) ([d4c1f47](https://github.com/parse-community/parse-server/commit/d4c1f473073764cb0570c633fc4a30669c2ce889))

# [5.0.0-alpha.9](https://github.com/parse-community/parse-server/compare/5.0.0-alpha.8...5.0.0-alpha.9) (2021-11-27)


### Bug Fixes

* unable to use objectId size higher than 19 on GraphQL API ([#7627](https://github.com/parse-community/parse-server/issues/7627)) ([ed86c80](https://github.com/parse-community/parse-server/commit/ed86c807721cc52a1a5a9dea0b768717eec269ed))

# [5.0.0-alpha.8](https://github.com/parse-community/parse-server/compare/5.0.0-alpha.7...5.0.0-alpha.8) (2021-11-18)


### Features

* add support for Node 16 ([#7707](https://github.com/parse-community/parse-server/issues/7707)) ([45cc58c](https://github.com/parse-community/parse-server/commit/45cc58c7e5e640a46c5d508019a3aa81242964b1))


### BREAKING CHANGES

* Removes official Node 15 support which has reached it end-of-life date. ([45cc58c](45cc58c))

# [5.0.0-alpha.7](https://github.com/parse-community/parse-server/compare/5.0.0-alpha.6...5.0.0-alpha.7) (2021-11-12)


### Bug Fixes

* node engine range has no upper limit to exclude incompatible node versions ([#7692](https://github.com/parse-community/parse-server/issues/7692)) ([573558d](https://github.com/parse-community/parse-server/commit/573558d3adcbcc6222c92003829867e1a73eef94))

# [5.0.0-alpha.6](https://github.com/parse-community/parse-server/compare/5.0.0-alpha.5...5.0.0-alpha.6) (2021-11-10)


### Reverts

* refactor: allow ES import for cloud string if package type is module ([b64640c](https://github.com/parse-community/parse-server/commit/b64640c5705f733798783e68d216e957044ef23c))

# [5.0.0-alpha.5](https://github.com/parse-community/parse-server/compare/5.0.0-alpha.4...5.0.0-alpha.5) (2021-11-01)


### Features

* add user-defined schema and migrations ([#7418](https://github.com/parse-community/parse-server/issues/7418)) ([25d5c30](https://github.com/parse-community/parse-server/commit/25d5c30be2111be332eb779eb0697774a17da7af))

# [5.0.0-alpha.4](https://github.com/parse-community/parse-server/compare/5.0.0-alpha.3...5.0.0-alpha.4) (2021-10-31)


### Features

* add support for Postgres 14 ([#7644](https://github.com/parse-community/parse-server/issues/7644)) ([090350a](https://github.com/parse-community/parse-server/commit/090350a7a0fac945394ca1cb24b290316ef06aa7))

# [5.0.0-alpha.3](https://github.com/parse-community/parse-server/compare/5.0.0-alpha.2...5.0.0-alpha.3) (2021-10-29)


### Bug Fixes

* combined `and` query with relational query condition returns incorrect results ([#7593](https://github.com/parse-community/parse-server/issues/7593)) ([174886e](https://github.com/parse-community/parse-server/commit/174886e385e091c6bbd4a84891ef95f80b50d05c))

# [5.0.0-alpha.2](https://github.com/parse-community/parse-server/compare/5.0.0-alpha.1...5.0.0-alpha.2) (2021-10-27)


### Bug Fixes

* setting a field to null does not delete it via GraphQL API ([#7649](https://github.com/parse-community/parse-server/issues/7649)) ([626fad2](https://github.com/parse-community/parse-server/commit/626fad2e71017dcc62196c487de5f908fa43000b))


### BREAKING CHANGES

* To delete a field via the GraphQL API, the field value has to be set to `null`. Previously, setting a field value to `null` would save a null value in the database, which was not according to the [GraphQL specs](https://spec.graphql.org/June2018/#sec-Null-Value). To delete a file field use `file: null`, the previous way of using `file: { file: null }` has become obsolete. ([626fad2](626fad2))

# [5.0.0-alpha.1](https://github.com/parse-community/parse-server/compare/4.10.4...5.0.0-alpha.1) (2021-10-12)

## Breaking Changes
- Improved schema caching through database real-time hooks. Reduces DB queries, decreases Parse Query execution time and fixes a potential schema memory leak. If multiple Parse Server instances connect to the same DB (for example behind a load balancer), set the [Parse Server Option](https://parseplatform.org/parse-server/api/master/ParseServerOptions.html) `databaseOptions.enableSchemaHooks: true` to enable this feature and keep the schema in sync across all instances. Failing to do so will cause a schema change to not propagate to other instances and re-syncing will only happen when these instances restart. The options `enableSingleSchemaCache` and `schemaCacheTTL` have been removed. To use this feature with MongoDB, a replica set cluster with [change stream](https://docs.mongodb.com/manual/changeStreams/#availability) support is required. (Diamond Lewis, SebC) [#7214](https://github.com/parse-community/parse-server/issues/7214)
- Added file upload restriction. File upload is now only allowed for authenticated users by default for improved security. To allow file upload also for Anonymous Users or Public, set the `fileUpload` parameter in the [Parse Server Options](https://parseplatform.org/parse-server/api/master/ParseServerOptions.html) (dblythy, Manuel Trezza) [#7071](https://github.com/parse-community/parse-server/pull/7071)
- Removed [parse-server-simple-mailgun-adapter](https://github.com/parse-community/parse-server-simple-mailgun-adapter) dependency; to continue using the adapter it has to be explicitly installed (Manuel Trezza) [#7321](https://github.com/parse-community/parse-server/pull/7321)
- Remove support for MongoDB 3.6 which has reached its End-of-Life date and PostgreSQL 10 (Manuel Trezza) [#7315](https://github.com/parse-community/parse-server/pull/7315)
- Remove support for Node 10 which has reached its End-of-Life date (Manuel Trezza) [#7314](https://github.com/parse-community/parse-server/pull/7314)
- Remove S3 Files Adapter from Parse Server, instead install separately as `@parse/s3-files-adapter` (Manuel Trezza) [#7324](https://github.com/parse-community/parse-server/pull/7324)
- Remove Session field `restricted`; the field was a code artifact from a feature that never existed in Open Source Parse Server; if you have been using this field for custom purposes, consider that for new Parse Server installations the field does not exist anymore in the schema, and for existing installations the field default value `false` will not be set anymore when creating a new session (Manuel Trezza) [#7543](https://github.com/parse-community/parse-server/pull/7543)
- ci: add node engine version check (Manuel Trezza) [#7574](https://github.com/parse-community/parse-server/pull/7574)

## Notable Changes
- Alphabetical ordered GraphQL API, improved GraphQL Schema cache system and fix GraphQL input reassign issue (Moumouls) [#7344](https://github.com/parse-community/parse-server/issues/7344)
- Added Parse Server Security Check to report weak security settings (Manuel Trezza, dblythy) [#7247](https://github.com/parse-community/parse-server/issues/7247)
- EXPERIMENTAL: Added new page router with placeholder rendering and localization of custom and feature pages such as password reset and email verification (Manuel Trezza) [#7128](https://github.com/parse-community/parse-server/pull/7128)
- EXPERIMENTAL: Added custom routes to easily customize flows for password reset, email verification or build entirely new flows (Manuel Trezza) [#7231](https://github.com/parse-community/parse-server/pull/7231)
- Added Deprecation Policy to govern the introduction of breaking changes in a phased pattern that is more predictable for developers (Manuel Trezza) [#7199](https://github.com/parse-community/parse-server/pull/7199)
- Add REST API endpoint `/loginAs` to create session of any user with master key; allows to impersonate another user. (GormanFletcher) [#7406](https://github.com/parse-community/parse-server/pull/7406)
- Add official support for MongoDB 5.0 (Manuel Trezza) [#7469](https://github.com/parse-community/parse-server/pull/7469)
- Added Parse Server Configuration `enforcePrivateUsers`, which will remove public access by default on new Parse.Users (dblythy) [#7319](https://github.com/parse-community/parse-server/pull/7319)

## Other Changes
- Support native mongodb syntax in aggregation pipelines (Raschid JF Rafeally) [#7339](https://github.com/parse-community/parse-server/pull/7339)
- Fix error when a not yet inserted job is updated (Antonio Davi Macedo Coelho de Castro) [#7196](https://github.com/parse-community/parse-server/pull/7196)
- request.context for afterFind triggers (dblythy) [#7078](https://github.com/parse-community/parse-server/pull/7078)
- Winston Logger interpolating stdout to console (dplewis) [#7114](https://github.com/parse-community/parse-server/pull/7114)
- Added convenience method `Parse.Cloud.sendEmail(...)` to send email via email adapter in Cloud Code (dblythy) [#7089](https://github.com/parse-community/parse-server/pull/7089)
- LiveQuery support for $and, $nor, $containedBy, $geoWithin, $geoIntersects queries (dplewis) [#7113](https://github.com/parse-community/parse-server/pull/7113)
- Supporting patterns in LiveQuery server's config parameter `classNames` (Nes-si) [#7131](https://github.com/parse-community/parse-server/pull/7131)
- Added `requireAnyUserRoles` and `requireAllUserRoles` for Parse Cloud validator (dblythy) [#7097](https://github.com/parse-community/parse-server/pull/7097)
- Support Facebook Limited Login (miguel-s) [#7219](https://github.com/parse-community/parse-server/pull/7219)
- Removed Stage name check on aggregate pipelines (BRETT71) [#7237](https://github.com/parse-community/parse-server/pull/7237)
- Retry transactions on MongoDB when it fails due to transient error (Antonio Davi Macedo Coelho de Castro) [#7187](https://github.com/parse-community/parse-server/pull/7187)
- Bump tests to use Mongo 4.4.4 (Antonio Davi Macedo Coelho de Castro) [#7184](https://github.com/parse-community/parse-server/pull/7184)
- Added new account lockout policy option `accountLockout.unlockOnPasswordReset` to automatically unlock account on password reset (Manuel Trezza) [#7146](https://github.com/parse-community/parse-server/pull/7146)
- Test Parse Server continuously against all recent MongoDB versions that have not reached their end-of-life support date, added MongoDB compatibility table to Parse Server docs (Manuel Trezza) [#7161](https://github.com/parse-community/parse-server/pull/7161)
- Test Parse Server continuously against all recent Node.js versions that have not reached their end-of-life support date, added Node.js compatibility table to Parse Server docs (Manuel Trezza) [7161](https://github.com/parse-community/parse-server/pull/7177)
- Throw error on invalid Cloud Function validation configuration (dblythy) [#7154](https://github.com/parse-community/parse-server/pull/7154)
- Allow Cloud Validator `options` to be async (dblythy) [#7155](https://github.com/parse-community/parse-server/pull/7155)
- Optimize queries on classes with pointer permissions (Pedro Diaz) [#7061](https://github.com/parse-community/parse-server/pull/7061)
- Test Parse Server continuously against all relevant Postgres versions (minor versions), added Postgres compatibility table to Parse Server docs (Corey Baker) [#7176](https://github.com/parse-community/parse-server/pull/7176)
- Randomize test suite (Diamond Lewis) [#7265](https://github.com/parse-community/parse-server/pull/7265)
- LDAP: Properly unbind client on group search error (Diamond Lewis) [#7265](https://github.com/parse-community/parse-server/pull/7265)
- Improve data consistency in Push and Job Status update (Diamond Lewis) [#7267](https://github.com/parse-community/parse-server/pull/7267)
- Excluding keys that have trailing edges.node when performing GraphQL resolver (Chris Bland) [#7273](https://github.com/parse-community/parse-server/pull/7273)
- Added centralized feature deprecation with standardized warning logs (Manuel Trezza) [#7303](https://github.com/parse-community/parse-server/pull/7303)
- Use Node.js 15.13.0 in CI (Olle Jonsson) [#7312](https://github.com/parse-community/parse-server/pull/7312)
- Fix file upload issue for S3 compatible storage (Linode, DigitalOcean) by avoiding empty tags property when creating a file (Ali Oguzhan Yildiz) [#7300](https://github.com/parse-community/parse-server/pull/7300)
- Add building Docker image as CI check (Manuel Trezza) [#7332](https://github.com/parse-community/parse-server/pull/7332)
- Add NPM package-lock version check to CI (Manuel Trezza) [#7333](https://github.com/parse-community/parse-server/pull/7333)
- Fix incorrect LiveQuery events triggered for multiple subscriptions on the same class with different events [#7341](https://github.com/parse-community/parse-server/pull/7341)
- Fix select and excludeKey queries to properly accept JSON string arrays. Also allow nested fields in exclude (Corey Baker) [#7242](https://github.com/parse-community/parse-server/pull/7242)
- Fix LiveQuery server crash when using $all query operator on a missing object key (Jason Posthuma) [#7421](https://github.com/parse-community/parse-server/pull/7421)
- Added runtime deprecation warnings (Manuel Trezza) [#7451](https://github.com/parse-community/parse-server/pull/7451)
- Add ability to pass context of an object via a header, X-Parse-Cloud-Context, for Cloud Code triggers. The header addition allows client SDK's to add context without injecting _context in the body of JSON objects (Corey Baker) [#7437](https://github.com/parse-community/parse-server/pull/7437)
- Add CI check to add changelog entry (Manuel Trezza) [#7512](https://github.com/parse-community/parse-server/pull/7512)
- Refactor: uniform issue templates across repos (Manuel Trezza) [#7528](https://github.com/parse-community/parse-server/pull/7528)
- ci: bump ci environment (Manuel Trezza) [#7539](https://github.com/parse-community/parse-server/pull/7539)
- CI now pushes docker images to Docker Hub (Corey Baker) [#7548](https://github.com/parse-community/parse-server/pull/7548)
- Allow afterFind and afterLiveQueryEvent to set unsaved pointers and keys (dblythy) [#7310](https://github.com/parse-community/parse-server/pull/7310)
- Allow setting descending sort to full text queries (dblythy) [#7496](https://github.com/parse-community/parse-server/pull/7496)
- Allow cloud string for ES modules (Daniel Blyth) [#7560](https://github.com/parse-community/parse-server/pull/7560)
- docs: Introduce deprecation ID for reference in comments and online search (Manuel Trezza) [#7562](https://github.com/parse-community/parse-server/pull/7562)
- refactor: deprecate `Parse.Cloud.httpRequest`; it is recommended to use a HTTP library instead. (Daniel Blyth) [#7595](https://github.com/parse-community/parse-server/pull/7595)
- refactor: Modernize HTTPRequest tests (brandongregoryscott) [#7604](https://github.com/parse-community/parse-server/pull/7604)
- Allow liveQuery on Session class (Daniel Blyth) [#7554](https://github.com/parse-community/parse-server/pull/7554)
