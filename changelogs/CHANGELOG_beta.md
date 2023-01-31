# [6.0.0-beta.1](https://github.com/parse-community/parse-server/compare/5.4.0...6.0.0-beta.1) (2023-01-31)


### Bug Fixes

* `ParseServer.verifyServerUrl` may fail if server response headers are missing; remove unnecessary logging ([#8391](https://github.com/parse-community/parse-server/issues/8391)) ([1c37a7c](https://github.com/parse-community/parse-server/commit/1c37a7cd0715949a70b220a629071c7dab7d5e7b))
* Cloud Code trigger `beforeSave` does not work with `Parse.Role` ([#8320](https://github.com/parse-community/parse-server/issues/8320)) ([f29d972](https://github.com/parse-community/parse-server/commit/f29d9720e9b37918fd885c97a31e34c42750e724))
* ES6 modules do not await the import of Cloud Code files ([#8368](https://github.com/parse-community/parse-server/issues/8368)) ([a7bd180](https://github.com/parse-community/parse-server/commit/a7bd180cddd784c8735622f22e012c342ad535fb))
* Nested objects are encoded incorrectly for MongoDB ([#8209](https://github.com/parse-community/parse-server/issues/8209)) ([1412666](https://github.com/parse-community/parse-server/commit/1412666f75829612de6fb9d7ccae35761c9b75cb))
* Parse Server option `masterKeyIps` does not include localhost by default for IPv6 ([#8322](https://github.com/parse-community/parse-server/issues/8322)) ([ab82635](https://github.com/parse-community/parse-server/commit/ab82635b0d4cf323a07ddee51fee587b43dce95c))
* Rate limiter may reject requests that contain a session token ([#8399](https://github.com/parse-community/parse-server/issues/8399)) ([c114dc8](https://github.com/parse-community/parse-server/commit/c114dc8831055d74187b9dfb4c9eeb558520237c))
* Remove Node 12 and Node 17 support ([#8279](https://github.com/parse-community/parse-server/issues/8279)) ([2546cc8](https://github.com/parse-community/parse-server/commit/2546cc8572bea6610cb9b3c7401d9afac0e3c1d6))
* Schema without class level permissions may cause error ([#8409](https://github.com/parse-community/parse-server/issues/8409)) ([aa2cd51](https://github.com/parse-community/parse-server/commit/aa2cd51b703388d925e4572e5c2b2d883c68e49c))
* The client IP address may be determined incorrectly in some cases; this fixes a security vulnerability in which the Parse Server option `masterKeyIps` may be circumvented, see [GHSA-vm5r-c87r-pf6x](https://github.com/parse-community/parse-server/security/advisories/GHSA-vm5r-c87r-pf6x) ([#8372](https://github.com/parse-community/parse-server/issues/8372)) ([892040d](https://github.com/parse-community/parse-server/commit/892040dc2f82a3e2abe2824e4b553521b6f894de))
* Throwing error in Cloud Code Triggers `afterLogin`, `afterLogout` crashes server ([#8280](https://github.com/parse-community/parse-server/issues/8280)) ([130d290](https://github.com/parse-community/parse-server/commit/130d29074e3f763460e5685d0b9059e5a333caff))

### Features

* Access the internal scope of Parse Server using the new `maintenanceKey`; the internal scope contains unofficial and undocumented fields (prefixed with underscore `_`) which are used internally by Parse Server; you may want to manipulate these fields for out-of-band changes such as data migration or correction tasks; changes within the internal scope of Parse Server may happen at any time without notice or changelog entry, it is therefore recommended to look at the source code of Parse Server to understand the effects of manipulating internal fields before using the key; it is discouraged to use the `maintenanceKey` for routine operations in a production environment; see [access scopes](https://github.com/parse-community/parse-server#access-scopes) ([#8212](https://github.com/parse-community/parse-server/issues/8212)) ([f3bcc93](https://github.com/parse-community/parse-server/commit/f3bcc9365cd6f08b0a32c132e8e5ff6d1b650863))
* Adapt `verifyServerUrl` for new asynchronous Parse Server start-up states ([#8366](https://github.com/parse-community/parse-server/issues/8366)) ([ffa4974](https://github.com/parse-community/parse-server/commit/ffa4974158615fbff4a2692b9db41dcb50d3f77b))
* Add `ParseQuery.watch` to trigger LiveQuery only on update of specific fields ([#8028](https://github.com/parse-community/parse-server/issues/8028)) ([fc92faa](https://github.com/parse-community/parse-server/commit/fc92faac75107b3392eeddd916c4c5b45e3c5e0c))
* Add Node 19 support ([#8363](https://github.com/parse-community/parse-server/issues/8363)) ([a4990dc](https://github.com/parse-community/parse-server/commit/a4990dcd29abcb4442f3c424aff482a0a116160f))
* Add option to change the log level of the logs emitted by triggers ([#8328](https://github.com/parse-community/parse-server/issues/8328)) ([8f3b694](https://github.com/parse-community/parse-server/commit/8f3b694e39d4a966567e50dbea4d62e954fa5c06))
* Add request rate limiter based on IP address ([#8174](https://github.com/parse-community/parse-server/issues/8174)) ([6c79f6a](https://github.com/parse-community/parse-server/commit/6c79f6a69e25e47846e3b0685d6bdfd6b91086b1))
* Asynchronous initialization of Parse Server ([#8232](https://github.com/parse-community/parse-server/issues/8232)) ([99fcf45](https://github.com/parse-community/parse-server/commit/99fcf45e55c368de2345b0c4d780e70e0adf0e15))
* Improve authentication adapter interface to support multi-factor authentication (MFA), authentication challenges, and provide a more powerful interface for writing custom authentication adapters ([#8156](https://github.com/parse-community/parse-server/issues/8156)) ([5bbf9ca](https://github.com/parse-community/parse-server/commit/5bbf9cade9a527787fd1002072d4013ab5d8db2b))
* Reduce Docker image size by improving stages ([#8359](https://github.com/parse-community/parse-server/issues/8359)) ([40810b4](https://github.com/parse-community/parse-server/commit/40810b48ebde8b1f21d2448a3a4de0585b1b5e34))
* Remove deprecation `DEPPS1`: Native MongoDB syntax in aggregation pipeline ([#8362](https://github.com/parse-community/parse-server/issues/8362)) ([d0d30c4](https://github.com/parse-community/parse-server/commit/d0d30c4f1394f563724644a8fc81734be538a2c0))
* Remove deprecation `DEPPS2`: Config option `directAccess` defaults to true ([#8284](https://github.com/parse-community/parse-server/issues/8284)) ([f535ee6](https://github.com/parse-community/parse-server/commit/f535ee6ec2abba63f702127258ca49fa5b4e08c9))
* Remove deprecation `DEPPS3`: Config option `enforcePrivateUsers` defaults to `true` ([#8283](https://github.com/parse-community/parse-server/issues/8283)) ([ed499e3](https://github.com/parse-community/parse-server/commit/ed499e32a21bab9a874a9e5367dc71248ce836c4))
* Remove deprecation `DEPPS4`: Remove convenience method for http request `Parse.Cloud.httpRequest`  ([#8287](https://github.com/parse-community/parse-server/issues/8287)) ([2d79c08](https://github.com/parse-community/parse-server/commit/2d79c0835b6a9acaf20d5c943d9b4619bb96831c))
* Remove support for MongoDB 4.0 ([#8292](https://github.com/parse-community/parse-server/issues/8292)) ([37245f6](https://github.com/parse-community/parse-server/commit/37245f62ce83516b6b95a54b850f0274ef680478))
* Restrict use of `masterKey` to localhost by default ([#8281](https://github.com/parse-community/parse-server/issues/8281)) ([6c16021](https://github.com/parse-community/parse-server/commit/6c16021a1f03a70a6d9e68cb64df362d07f3b693))
* Upgrade Node Package Manager lock file `package-lock.json` to version 2 ([#8285](https://github.com/parse-community/parse-server/issues/8285)) ([ee72467](https://github.com/parse-community/parse-server/commit/ee7246733d63e4bda20401f7b00262ff03299f20))
* Upgrade Redis 3 to 4 ([#8293](https://github.com/parse-community/parse-server/issues/8293)) ([7d622f0](https://github.com/parse-community/parse-server/commit/7d622f06a4347e0ad2cba9a4ec07d8d4fb0f67bc))
* Upgrade Redis 3 to 4 for LiveQuery ([#8333](https://github.com/parse-community/parse-server/issues/8333)) ([b2761fb](https://github.com/parse-community/parse-server/commit/b2761fb3786b519d9bbcf35be54309d2d35da1a9))
* Upgrade to Parse JavaScript SDK 4 ([#8332](https://github.com/parse-community/parse-server/issues/8332)) ([9092874](https://github.com/parse-community/parse-server/commit/9092874a9a482a24dfdce1dce56615702999d6b8))
* Write log entry when request with master key is rejected as outside of `masterKeyIps` ([#8350](https://github.com/parse-community/parse-server/issues/8350)) ([e22b73d](https://github.com/parse-community/parse-server/commit/e22b73d4b700c8ff745aa81726c6680082294b45))


### BREAKING CHANGES

* The Docker image does not contain the git dependency anymore; if you have been using git as a transitive dependency it now needs to be explicitly installed in your Docker file, for example with `RUN apk --no-cache add git` (#8359) ([40810b4](40810b4))
* Fields in the internal scope of Parse Server (prefixed with underscore `_`) are only returned using the new `maintenanceKey`; previously the `masterKey` allowed reading of internal fields; see [access scopes](https://github.com/parse-community/parse-server#access-scopes) for a comparison of the keys' access permissions (#8212) ([f3bcc93](f3bcc93))
* The method `ParseServer.verifyServerUrl` now returns a promise instead of a callback. ([ffa4974](ffa4974))
* The MongoDB aggregation pipeline requires native MongoDB syntax instead of the custom Parse Server syntax; for example pipeline stage names require a leading dollar sign like `$match` and the MongoDB document ID is referenced using `_id` instead of `objectId` (#8362) ([d0d30c4](d0d30c4))
* The mechanism to determine the client IP address has been rewritten; to correctly determine the IP address it is now required to set the Parse Server option `trustProxy` accordingly if Parse Server runs behind a proxy server, see the express framework's [trust proxy](https://expressjs.com/en/guide/behind-proxies.html) setting (#8372) ([892040d](892040d))
* The Node Package Manager lock file `package-lock.json` is upgraded to version 2; while it is backwards with version 1 for the npm installer, consider this if you run any non-npm analysis tools that use the lock file (#8285) ([ee72467](ee72467))
* This release introduces the asynchronous initialization of Parse Server to prevent mounting Parse Server before being ready to receive request; it changes how Parse Server is imported, initialized and started; it also removes the callback `serverStartComplete`; see the [Parse Server 6 migration guide](https://github.com/parse-community/parse-server/blob/alpha/6.0.0.md) for more details (#8232) ([99fcf45](99fcf45))
* Nested objects are now properly stored in the database using JSON serialization; previously, due to a bug only top-level objects were serialized, but nested objects were saved as raw JSON; for example, a nested `Date` object was saved as a JSON object like `{ "__type": "Date", "iso": "2020-01-01T00:00:00.000Z" }` instead of its serialized representation `2020-01-01T00:00:00.000Z` (#8209) ([1412666](1412666))
* The Parse Server option `enforcePrivateUsers` is set to `true` by default; in previous releases this option defaults to `false`; this change improves the default security configuration of Parse Server (#8283) ([ed499e3](ed499e3))
* This release restricts the use of `masterKey` to localhost by default; if you are using Parse Dashboard on a different server to connect to Parse Server you need to add the IP address of the server that hosts Parse Dashboard to this option (#8281) ([6c16021](6c16021))
* This release upgrades to Redis 4; if you are using the Redis cache adapter with Parse Server then this is a breaking change as the Redis client options have changed; see the [Redis migration guide](https://github.com/redis/node-redis/blob/redis%404.0.0/docs/v3-to-v4.md) for more details (#8293) ([7d622f0](7d622f0))
* This release removes support for MongoDB 4.0; the new minimum supported MongoDB version is 4.2. which also removes support for the deprecated MongoDB MMAPv1 storage engine ([37245f6](37245f6))
* Throwing an error in Cloud Code Triggers `afterLogin`, `afterLogout` returns a rejected promise; in previous releases it crashed the server if you did not handle the error on the Node.js process level; consider adapting your code if your app currently handles these errors on the Node.js process level with `process.on('unhandledRejection', ...)` ([130d290](130d290))
* Config option `directAccess` defaults to true; set this to `false` in environments where multiple Parse Server instances run behind a load balancer and Parse requests within the current Node.js environment should be routed via the load balancer and distributed as HTTP requests among all instances via the `serverURL`. ([f535ee6](f535ee6))
* The convenience method for HTTP requests `Parse.Cloud.httpRequest` is removed; use your preferred 3rd party library for making HTTP requests ([2d79c08](2d79c08))
* This release removes Node 12 and Node 17 support ([2546cc8](2546cc8))

# [5.4.0-beta.1](https://github.com/parse-community/parse-server/compare/5.3.0...5.4.0-beta.1) (2022-10-29)


### Bug Fixes

* authentication adapter app ID validation may be circumvented; this fixes a vulnerability that affects configurations which allow users to authenticate using the Parse Server authentication adapter for *Facebook* or *Spotify* and where the server-side authentication adapter configuration `appIds` is set as a string (e.g. `abc`) instead of an array of strings (e.g. `["abc"]`) ([GHSA-r657-33vp-gp22](https://github.com/parse-community/parse-server/security/advisories/GHSA-r657-33vp-gp22)) [skip release] ([#8187](https://github.com/parse-community/parse-server/issues/8187)) ([8c8ec71](https://github.com/parse-community/parse-server/commit/8c8ec715739e0f851338cfed794409ebac66c51b))
* brute force guessing of user sensitive data via search patterns (GHSA-2m6g-crv8-p3c6) ([#8146](https://github.com/parse-community/parse-server/issues/8146)) [skip release] ([4c0c7c7](https://github.com/parse-community/parse-server/commit/4c0c7c77b76257878b9bcb05ff9de01c9d790262))
* certificate in Apple Game Center auth adapter not validated [skip release] ([#8058](https://github.com/parse-community/parse-server/issues/8058)) ([75af9a2](https://github.com/parse-community/parse-server/commit/75af9a26cc8e9e88a33d1e452c93a0ee6e509f17))
* graphQL query ignores condition `equalTo` with value `false` ([#8032](https://github.com/parse-community/parse-server/issues/8032)) ([7f5a15d](https://github.com/parse-community/parse-server/commit/7f5a15d5df0dfa3515e9f73709d6a49663545f9b))
* internal indices for classes `_Idempotency` and `_Role` are not protected in defined schema ([#8121](https://github.com/parse-community/parse-server/issues/8121)) ([c16f529](https://github.com/parse-community/parse-server/commit/c16f529f74f92154401bf662f634b3c5fa45e18e))
* invalid file request not properly handled [skip release] ([#8062](https://github.com/parse-community/parse-server/issues/8062)) ([4c9e956](https://github.com/parse-community/parse-server/commit/4c9e95674ad081f13062e8cd30b77b1962d5df57))
* liveQuery with `containedIn` not working when object field is an array ([#8128](https://github.com/parse-community/parse-server/issues/8128)) ([1d9605b](https://github.com/parse-community/parse-server/commit/1d9605bc93009263d3811df4d4249034ba6eb8c4))
* protected fields exposed via LiveQuery (GHSA-crrq-vr9j-fxxh) [skip release] ([#8076](https://github.com/parse-community/parse-server/issues/8076)) ([9fd4516](https://github.com/parse-community/parse-server/commit/9fd4516cde5c742f9f29dd05468b4a43a85639a6))
* push notifications `badge` doesn't update with Installation beforeSave trigger ([#8162](https://github.com/parse-community/parse-server/issues/8162)) ([3c75c2b](https://github.com/parse-community/parse-server/commit/3c75c2ba4851fae96a8c19b11a3efde03816c9a1))
* query aggregation pipeline cannot handle value of type `Date` when `directAccess: true` ([#8167](https://github.com/parse-community/parse-server/issues/8167)) ([e424137](https://github.com/parse-community/parse-server/commit/e4241374061caef66538de15112fb6bbafb1f5bb))
* relation constraints in compound queries `Parse.Query.or`, `Parse.Query.and` not working ([#8203](https://github.com/parse-community/parse-server/issues/8203)) ([28f0d26](https://github.com/parse-community/parse-server/commit/28f0d2667787d2ac68726607b811d6f0ef62b9f1))
* security upgrade undici from 5.6.0 to 5.8.0 ([#8108](https://github.com/parse-community/parse-server/issues/8108)) ([4aa016b](https://github.com/parse-community/parse-server/commit/4aa016b7322467422b9fdf05d8e29b9ecf910da7))
* server crashes when receiving file download request with invalid byte range; this fixes a security vulnerability that allows an attacker to impact the availability of the server instance; the fix improves parsing of the range parameter to properly handle invalid range requests ([GHSA-h423-w6qv-2wj3](https://github.com/parse-community/parse-server/security/advisories/GHSA-h423-w6qv-2wj3)) [skip release] ([#8238](https://github.com/parse-community/parse-server/issues/8238)) ([c03908f](https://github.com/parse-community/parse-server/commit/c03908f74e5c9eed834874a89df6c89c1a1e849f))
* session object properties can be updated by foreign user; this fixes a security vulnerability in which a foreign user can write to the session object of another user if the session object ID is known; the fix prevents writing to foreign session objects ([GHSA-6w4q-23cf-j9jp](https://github.com/parse-community/parse-server/security/advisories/GHSA-6w4q-23cf-j9jp)) [skip release] ([#8180](https://github.com/parse-community/parse-server/issues/8180)) ([37fed30](https://github.com/parse-community/parse-server/commit/37fed3062ccc3ef1dfd49a9fc53318e72b3e4aff))
* sorting by non-existing value throws `INVALID_SERVER_ERROR` on Postgres ([#8157](https://github.com/parse-community/parse-server/issues/8157)) ([3b775a1](https://github.com/parse-community/parse-server/commit/3b775a1fb8a1878714e3451191438963d688f1b0))
* updating object includes unchanged keys in client response for certain key types ([#8159](https://github.com/parse-community/parse-server/issues/8159)) ([37af1d7](https://github.com/parse-community/parse-server/commit/37af1d78fce5a15039ffe3af7b323c1f1e8582fc))

### Features

* add convenience access to Parse Server configuration in Cloud Code via `Parse.Server` ([#8244](https://github.com/parse-community/parse-server/issues/8244)) ([9f11115](https://github.com/parse-community/parse-server/commit/9f111158edf7fd57a65db0c4f9244b37e58cf293))
* add option to change the default value of the `Parse.Query.limit()` constraint ([#8152](https://github.com/parse-community/parse-server/issues/8152)) ([0388956](https://github.com/parse-community/parse-server/commit/038895680894984e569dff54bf5c7b31094f3891))
* add support for MongoDB 6 ([#8242](https://github.com/parse-community/parse-server/issues/8242)) ([aba0081](https://github.com/parse-community/parse-server/commit/aba0081ce1a166a93de57f3928c19a05562b5cc1))
* add support for Postgres 15 ([#8215](https://github.com/parse-community/parse-server/issues/8215)) ([2feb6c4](https://github.com/parse-community/parse-server/commit/2feb6c46080946c984daa351187fa07cd582355d))
* liveQuery support for unsorted distance queries ([#8221](https://github.com/parse-community/parse-server/issues/8221)) ([0f763da](https://github.com/parse-community/parse-server/commit/0f763da17d646b2fec2cd980d3857e46072a8a07))

# [5.3.0-beta.1](https://github.com/parse-community/parse-server/compare/5.2.1...5.3.0-beta.1) (2022-06-17)


### Bug Fixes

* afterSave trigger removes pointer in Parse object ([#7913](https://github.com/parse-community/parse-server/issues/7913)) ([47d796e](https://github.com/parse-community/parse-server/commit/47d796ea58f65e71612ce37149be692abc9ea97f))
* auto-release process may fail if optional back-merging task fails ([#8051](https://github.com/parse-community/parse-server/issues/8051)) ([cf925e7](https://github.com/parse-community/parse-server/commit/cf925e75e87a6989f41e2e2abb2aba4332b1e79f))
* custom database options are not passed to MongoDB GridFS ([#7911](https://github.com/parse-community/parse-server/issues/7911)) ([b1e5565](https://github.com/parse-community/parse-server/commit/b1e5565b22f2eff229571fe9a9500314bd30965b))
* depreciate allowClientClassCreation defaulting to true ([#7925](https://github.com/parse-community/parse-server/issues/7925)) ([38ed96a](https://github.com/parse-community/parse-server/commit/38ed96ace534d639db007aa7dd5387b2da8f03ae))
* errors in GraphQL do not show the original error but a general `Unexpected Error` ([#8045](https://github.com/parse-community/parse-server/issues/8045)) ([0d81887](https://github.com/parse-community/parse-server/commit/0d818879c217f9c56100a5f59868fa37e6d24b71))
* interrupted WebSocket connection not closed by LiveQuery server ([#8012](https://github.com/parse-community/parse-server/issues/8012)) ([2d5221e](https://github.com/parse-community/parse-server/commit/2d5221e48012fb7781c0406d543a922d313075ea))
* live query role cache does not clear when a user is added to a role ([#8026](https://github.com/parse-community/parse-server/issues/8026)) ([199dfc1](https://github.com/parse-community/parse-server/commit/199dfc17226d85a78ab85f24362cce740f4ada39))
* peer dependency mismatch for GraphQL dependencies ([#7934](https://github.com/parse-community/parse-server/issues/7934)) ([0a6faa8](https://github.com/parse-community/parse-server/commit/0a6faa81fa97f8620e7fd05e8c7bbdb4b7da9578))
* return correct response when revert is used in beforeSave ([#7839](https://github.com/parse-community/parse-server/issues/7839)) ([19900fc](https://github.com/parse-community/parse-server/commit/19900fcdf8c9f29a674fb62cf6e4b3341d796891))
* security upgrade @parse/fs-files-adapter from 1.2.1 to 1.2.2 ([#7948](https://github.com/parse-community/parse-server/issues/7948)) ([3a70fda](https://github.com/parse-community/parse-server/commit/3a70fda6798d4143f21046439b5eaf232a31bdb6))
* security upgrade moment from 2.29.1 to 2.29.2 ([#7931](https://github.com/parse-community/parse-server/issues/7931)) ([731c550](https://github.com/parse-community/parse-server/commit/731c5507144bbacff236097e7a2a03bfe54f6e10))
* security upgrade parse push adapter from 4.1.0 to 4.1.2 ([#7893](https://github.com/parse-community/parse-server/issues/7893)) ([93667b4](https://github.com/parse-community/parse-server/commit/93667b4e8402bf13b46c4d3ef12cec6532fd9da7))
* websocket connection of LiveQuery interrupts frequently ([#8048](https://github.com/parse-community/parse-server/issues/8048)) ([03caae1](https://github.com/parse-community/parse-server/commit/03caae1e611f28079cdddbbe433daaf69e3f595c))

### Features

* add MongoDB 5.1 compatibility ([#7682](https://github.com/parse-community/parse-server/issues/7682)) ([022a856](https://github.com/parse-community/parse-server/commit/022a85619d8a2c57a2f2938e245e4d8a47c15276))
* add MongoDB 5.2 support ([#7894](https://github.com/parse-community/parse-server/issues/7894)) ([5bfa716](https://github.com/parse-community/parse-server/commit/5bfa7160d9e35b237cbae1016ed86724aa99f8d7))
* add support for Node 17 and 18 ([#7896](https://github.com/parse-community/parse-server/issues/7896)) ([3e9f292](https://github.com/parse-community/parse-server/commit/3e9f292d840334244934cee9a34545ac86313549))
* align file trigger syntax with class trigger; use the new syntax `Parse.Cloud.beforeSave(Parse.File, (request) => {})`, the old syntax `Parse.Cloud.beforeSaveFile((request) => {})` has been deprecated ([#7966](https://github.com/parse-community/parse-server/issues/7966)) ([c6dcad8](https://github.com/parse-community/parse-server/commit/c6dcad8d167d44912dbd416d328519314c0809bd))
* replace GraphQL Apollo with GraphQL Yoga ([#7967](https://github.com/parse-community/parse-server/issues/7967)) ([1aa2204](https://github.com/parse-community/parse-server/commit/1aa2204aebfdbe273d54d6d56c6029f7c34aab14))
* selectively enable / disable default authentication adapters ([#7953](https://github.com/parse-community/parse-server/issues/7953)) ([c1e808f](https://github.com/parse-community/parse-server/commit/c1e808f9e807fc49508acbde0d8b3f2b901a1638))
* upgrade mongodb from 4.4.1 to 4.5.0 ([#7991](https://github.com/parse-community/parse-server/issues/7991)) ([e692b5d](https://github.com/parse-community/parse-server/commit/e692b5dd8214cdb0ce79bedd30d9aa3cf4de76a5))

### Performance Improvements

* reduce database operations when using the constant parameter in Cloud Function validation ([#7892](https://github.com/parse-community/parse-server/issues/7892)) ([041197f](https://github.com/parse-community/parse-server/commit/041197fb4ca1cd7cf18dc426ce38647267823668))

# [5.2.0-beta.2](https://github.com/parse-community/parse-server/compare/5.2.0-beta.1...5.2.0-beta.2) (2022-03-24)


### Bug Fixes

* security bump minimist from 1.2.5 to 1.2.6 ([#7884](https://github.com/parse-community/parse-server/issues/7884)) ([c5cf282](https://github.com/parse-community/parse-server/commit/c5cf282d11ffdc023764f8e7539a2bd6bc246fe1))
* sensitive keyword detection may produce false positives ([#7881](https://github.com/parse-community/parse-server/issues/7881)) ([0d6f9e9](https://github.com/parse-community/parse-server/commit/0d6f9e951d9e186e95e96d8869066ce7022bad02))

# [5.2.0-beta.1](https://github.com/parse-community/parse-server/compare/5.1.1...5.2.0-beta.1) (2022-03-23)


### Features

* improved LiveQuery error logging with additional information ([#7837](https://github.com/parse-community/parse-server/issues/7837)) ([443a509](https://github.com/parse-community/parse-server/commit/443a5099059538d379fe491793a5871fcbb4f377))

# [5.0.0-beta.10](https://github.com/parse-community/parse-server/compare/5.0.0-beta.9...5.0.0-beta.10) (2022-03-15)


### Bug Fixes

* adding or modifying a nested property requires addField permissions ([#7679](https://github.com/parse-community/parse-server/issues/7679)) ([6a6248b](https://github.com/parse-community/parse-server/commit/6a6248b6cb2e732d17131e18e659943b894ed2f1))
* bump nanoid from 3.1.25 to 3.2.0 ([#7781](https://github.com/parse-community/parse-server/issues/7781)) ([f5f63bf](https://github.com/parse-community/parse-server/commit/f5f63bfc64d3481ed944ceb5e9f50b33dccd1ce9))
* bump node-fetch from 2.6.1 to 3.1.1 ([#7782](https://github.com/parse-community/parse-server/issues/7782)) ([9082351](https://github.com/parse-community/parse-server/commit/90823514113a1a085ebc818f7109b3fd7591346f))
* node engine compatibility did not include node 16 ([#7739](https://github.com/parse-community/parse-server/issues/7739)) ([ea7c014](https://github.com/parse-community/parse-server/commit/ea7c01400f992a1263543706fe49b6174758a2d6))
* node engine range has no upper limit to exclude incompatible node versions ([#7692](https://github.com/parse-community/parse-server/issues/7692)) ([573558d](https://github.com/parse-community/parse-server/commit/573558d3adcbcc6222c92003829867e1a73eef94))
* package.json & package-lock.json to reduce vulnerabilities ([#7823](https://github.com/parse-community/parse-server/issues/7823)) ([5ca2288](https://github.com/parse-community/parse-server/commit/5ca228882332b65f3ac05407e6e4da1ee3ef3749))
* schema cache not cleared in some cases ([#7678](https://github.com/parse-community/parse-server/issues/7678)) ([5af6e5d](https://github.com/parse-community/parse-server/commit/5af6e5dfaa129b1a350afcba4fb381b21c4cc35d))
* security upgrade follow-redirects from 1.14.6 to 1.14.7 ([#7769](https://github.com/parse-community/parse-server/issues/7769)) ([8f5a861](https://github.com/parse-community/parse-server/commit/8f5a8618cfa7ed9a2a239a095abffa8f3fd8d31a))
* security upgrade follow-redirects from 1.14.7 to 1.14.8 ([#7801](https://github.com/parse-community/parse-server/issues/7801)) ([70088a9](https://github.com/parse-community/parse-server/commit/70088a95a78393da2a4ac68be81e63107747626a))
* security vulnerability that allows remote code execution (GHSA-p6h4-93qp-jhcm) ([#7844](https://github.com/parse-community/parse-server/issues/7844)) ([e569f40](https://github.com/parse-community/parse-server/commit/e569f402b1fd8648fb0d1523b71b2a03273902a5))
* server crash using GraphQL due to missing @apollo/client peer dependency ([#7787](https://github.com/parse-community/parse-server/issues/7787)) ([08089d6](https://github.com/parse-community/parse-server/commit/08089d6fcbb215412448ce7d92b21b9fe6c929f2))
* unable to use objectId size higher than 19 on GraphQL API ([#7627](https://github.com/parse-community/parse-server/issues/7627)) ([ed86c80](https://github.com/parse-community/parse-server/commit/ed86c807721cc52a1a5a9dea0b768717eec269ed))
* upgrade mime from 2.5.2 to 3.0.0 ([#7725](https://github.com/parse-community/parse-server/issues/7725)) ([f5ef98b](https://github.com/parse-community/parse-server/commit/f5ef98bde32083403c0e30a12162fcc1e52cac37))
* upgrade parse from 3.3.1 to 3.4.0 ([#7723](https://github.com/parse-community/parse-server/issues/7723)) ([d4c1f47](https://github.com/parse-community/parse-server/commit/d4c1f473073764cb0570c633fc4a30669c2ce889))
* upgrade winston from 3.5.0 to 3.5.1 ([#7820](https://github.com/parse-community/parse-server/issues/7820)) ([4af253d](https://github.com/parse-community/parse-server/commit/4af253d1f8654a6f57b5137ad310cdacadc922cc))

### Features

* add Cloud Code context to `ParseObject.fetch` ([#7779](https://github.com/parse-community/parse-server/issues/7779)) ([315290d](https://github.com/parse-community/parse-server/commit/315290d16110110938f80a6b779cc2d1db58c552))
* add Idempotency to Postgres ([#7750](https://github.com/parse-community/parse-server/issues/7750)) ([0c3feaa](https://github.com/parse-community/parse-server/commit/0c3feaaa1751964c0db89f25674935c3354b1538))
* add support for Node 16 ([#7707](https://github.com/parse-community/parse-server/issues/7707)) ([45cc58c](https://github.com/parse-community/parse-server/commit/45cc58c7e5e640a46c5d508019a3aa81242964b1))
* bump required node engine to >=12.22.10 ([#7846](https://github.com/parse-community/parse-server/issues/7846)) ([5ace99d](https://github.com/parse-community/parse-server/commit/5ace99d542a11e422af46d9fd6b1d3d2513b34cf))
* support `postgresql` protocol in database URI ([#7757](https://github.com/parse-community/parse-server/issues/7757)) ([caf4a23](https://github.com/parse-community/parse-server/commit/caf4a2341f554b28e3918c53e7e897a3ca47bf8b))
* support relativeTime query constraint on Postgres ([#7747](https://github.com/parse-community/parse-server/issues/7747)) ([16b1b2a](https://github.com/parse-community/parse-server/commit/16b1b2a19714535ca805f2dbb3b561d8f6a519a7))
* upgrade to MongoDB Node.js driver 4.x for MongoDB 5.0 support ([#7794](https://github.com/parse-community/parse-server/issues/7794)) ([f88aa2a](https://github.com/parse-community/parse-server/commit/f88aa2a62a533e5344d1c13dd38c5a0b283a480a))

### Reverts

* refactor: allow ES import for cloud string if package type is module ([b64640c](https://github.com/parse-community/parse-server/commit/b64640c5705f733798783e68d216e957044ef23c))
* update node engine to 2.22.0 ([#7827](https://github.com/parse-community/parse-server/issues/7827)) ([f235412](https://github.com/parse-community/parse-server/commit/f235412c1b6c2b173b7531f285429ea7214b56a2))


### BREAKING CHANGES

* This requires Node.js version >=12.22.10. ([5ace99d](5ace99d))
* The MongoDB GridStore adapter has been removed. By default, Parse Server already uses GridFS, so if you do not manually use the GridStore adapter, you can ignore this change. ([f88aa2a](f88aa2a))
* Removes official Node 15 support which has reached it end-of-life date. ([45cc58c](45cc58c))

# [5.0.0-beta.9](https://github.com/parse-community/parse-server/compare/5.0.0-beta.8...5.0.0-beta.9) (2022-03-12)


### Features

* bump required node engine to >=12.22.10 ([#7848](https://github.com/parse-community/parse-server/issues/7848)) ([23a3488](https://github.com/parse-community/parse-server/commit/23a3488f15511fafbe0e1d7ff0ef8355f9cb0215))


### BREAKING CHANGES

* This requires Node.js version >=12.22.10. ([23a3488](23a3488))

# [5.0.0-beta.8](https://github.com/parse-community/parse-server/compare/5.0.0-beta.7...5.0.0-beta.8) (2022-03-12)


### Bug Fixes

* security vulnerability that allows remote code execution (GHSA-p6h4-93qp-jhcm) ([#7843](https://github.com/parse-community/parse-server/issues/7843)) ([971adb5](https://github.com/parse-community/parse-server/commit/971adb54387b0ede31be05ca407d5f35b4575c83))

# [5.0.0-beta.7](https://github.com/parse-community/parse-server/compare/5.0.0-beta.6...5.0.0-beta.7) (2022-02-10)


### Bug Fixes

* security upgrade follow-redirects from 1.14.7 to 1.14.8 ([#7802](https://github.com/parse-community/parse-server/issues/7802)) ([7029b27](https://github.com/parse-community/parse-server/commit/7029b274ca87bc8058617f29865d683dc3b351a1))

# [5.0.0-beta.6](https://github.com/parse-community/parse-server/compare/5.0.0-beta.5...5.0.0-beta.6) (2022-01-13)


### Bug Fixes

* security upgrade follow-redirects from 1.14.2 to 1.14.7 ([#7772](https://github.com/parse-community/parse-server/issues/7772)) ([4bd34b1](https://github.com/parse-community/parse-server/commit/4bd34b189bc9f5aa2e70b7e7c1a456e91b6de773))

# [5.0.0-beta.5](https://github.com/parse-community/parse-server/compare/5.0.0-beta.4...5.0.0-beta.5) (2022-01-13)


### Bug Fixes

* schema cache not cleared in some cases ([#7771](https://github.com/parse-community/parse-server/issues/7771)) ([3b92fa1](https://github.com/parse-community/parse-server/commit/3b92fa1ca9e8889127a32eba913d68309397ca2c))

# [5.0.0-beta.4](https://github.com/parse-community/parse-server/compare/5.0.0-beta.3...5.0.0-beta.4) (2021-11-27)


### Bug Fixes

* unable to use objectId size higher than 19 on GraphQL API ([#7722](https://github.com/parse-community/parse-server/issues/7722)) ([8ee0445](https://github.com/parse-community/parse-server/commit/8ee0445c0aeeb88dff2559b46ade408071d22143))

# [5.0.0-beta.3](https://github.com/parse-community/parse-server/compare/5.0.0-beta.2...5.0.0-beta.3) (2021-11-12)


### Bug Fixes

* node engine range has no upper limit to exclude incompatible node versions ([#7693](https://github.com/parse-community/parse-server/issues/7693)) ([6a54dac](https://github.com/parse-community/parse-server/commit/6a54dac24d9fb63a44f311b8d414f4aa64140f32))

# [5.0.0-beta.2](https://github.com/parse-community/parse-server/compare/5.0.0-beta.1...5.0.0-beta.2) (2021-11-10)


### Reverts

* refactor: allow ES import for cloud string if package type is module ([#7691](https://github.com/parse-community/parse-server/issues/7691)) ([200d4ba](https://github.com/parse-community/parse-server/commit/200d4ba9a527016a65668738c7728696f443bd53))

# [5.0.0-beta.1](https://github.com/parse-community/parse-server/compare/4.5.0...5.0.0-beta.1) (2021-11-01)

### BREAKING CHANGES
- Improved schema caching through database real-time hooks. Reduces DB queries, decreases Parse Query execution time and fixes a potential schema memory leak. If multiple Parse Server instances connect to the same DB (for example behind a load balancer), set the [Parse Server Option](https://parseplatform.org/parse-server/api/master/ParseServerOptions.html) `databaseOptions.enableSchemaHooks: true` to enable this feature and keep the schema in sync across all instances. Failing to do so will cause a schema change to not propagate to other instances and re-syncing will only happen when these instances restart. The options `enableSingleSchemaCache` and `schemaCacheTTL` have been removed. To use this feature with MongoDB, a replica set cluster with [change stream](https://docs.mongodb.com/manual/changeStreams/#availability) support is required. (Diamond Lewis, SebC) [#7214](https://github.com/parse-community/parse-server/issues/7214)
- Added file upload restriction. File upload is now only allowed for authenticated users by default for improved security. To allow file upload also for Anonymous Users or Public, set the `fileUpload` parameter in the [Parse Server Options](https://parseplatform.org/parse-server/api/master/ParseServerOptions.html) (dblythy, Manuel Trezza) [#7071](https://github.com/parse-community/parse-server/pull/7071)
- Removed [parse-server-simple-mailgun-adapter](https://github.com/parse-community/parse-server-simple-mailgun-adapter) dependency; to continue using the adapter it has to be explicitly installed (Manuel Trezza) [#7321](https://github.com/parse-community/parse-server/pull/7321)
- Remove support for MongoDB 3.6 which has reached its End-of-Life date and PostgreSQL 10 (Manuel Trezza) [#7315](https://github.com/parse-community/parse-server/pull/7315)
- Remove support for Node 10 which has reached its End-of-Life date (Manuel Trezza) [#7314](https://github.com/parse-community/parse-server/pull/7314)
- Remove S3 Files Adapter from Parse Server, instead install separately as `@parse/s3-files-adapter` (Manuel Trezza) [#7324](https://github.com/parse-community/parse-server/pull/7324)
- Remove Session field `restricted`; the field was a code artifact from a feature that never existed in Open Source Parse Server; if you have been using this field for custom purposes, consider that for new Parse Server installations the field does not exist anymore in the schema, and for existing installations the field default value `false` will not be set anymore when creating a new session (Manuel Trezza) [#7543](https://github.com/parse-community/parse-server/pull/7543)
- ci: add node engine version check (Manuel Trezza) [#7574](https://github.com/parse-community/parse-server/pull/7574)
- To delete a field via the GraphQL API, the field value has to be set to `null`. Previously, setting a field value to `null` would save a null value in the database, which was not according to the [GraphQL specs](https://spec.graphql.org/June2018/#sec-Null-Value). To delete a file field use `file: null`, the previous way of using `file: { file: null }` has become obsolete. ([626fad2](626fad2))

### Notable Changes
- Alphabetical ordered GraphQL API, improved GraphQL Schema cache system and fix GraphQL input reassign issue (Moumouls) [#7344](https://github.com/parse-community/parse-server/issues/7344)
- Added Parse Server Security Check to report weak security settings (Manuel Trezza, dblythy) [#7247](https://github.com/parse-community/parse-server/issues/7247)
- EXPERIMENTAL: Added new page router with placeholder rendering and localization of custom and feature pages such as password reset and email verification (Manuel Trezza) [#7128](https://github.com/parse-community/parse-server/pull/7128)
- EXPERIMENTAL: Added custom routes to easily customize flows for password reset, email verification or build entirely new flows (Manuel Trezza) [#7231](https://github.com/parse-community/parse-server/pull/7231)
- Added Deprecation Policy to govern the introduction of breaking changes in a phased pattern that is more predictable for developers (Manuel Trezza) [#7199](https://github.com/parse-community/parse-server/pull/7199)
- Add REST API endpoint `/loginAs` to create session of any user with master key; allows to impersonate another user. (GormanFletcher) [#7406](https://github.com/parse-community/parse-server/pull/7406)
- Add official support for MongoDB 5.0 (Manuel Trezza) [#7469](https://github.com/parse-community/parse-server/pull/7469)
- Added Parse Server Configuration `enforcePrivateUsers`, which will remove public access by default on new Parse.Users (dblythy) [#7319](https://github.com/parse-community/parse-server/pull/7319)
* add support for Postgres 14 ([#7644](https://github.com/parse-community/parse-server/issues/7644)) ([090350a](https://github.com/parse-community/parse-server/commit/090350a7a0fac945394ca1cb24b290316ef06aa7))
* add user-defined schema and migrations ([#7418](https://github.com/parse-community/parse-server/issues/7418)) ([25d5c30](https://github.com/parse-community/parse-server/commit/25d5c30be2111be332eb779eb0697774a17da7af))
* setting a field to null does not delete it via GraphQL API ([#7649](https://github.com/parse-community/parse-server/issues/7649)) ([626fad2](https://github.com/parse-community/parse-server/commit/626fad2e71017dcc62196c487de5f908fa43000b))
* combined `and` query with relational query condition returns incorrect results ([#7593](https://github.com/parse-community/parse-server/issues/7593)) ([174886e](https://github.com/parse-community/parse-server/commit/174886e385e091c6bbd4a84891ef95f80b50d05c))

### Other Changes
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
