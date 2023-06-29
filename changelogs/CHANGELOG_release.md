## [5.5.2](https://github.com/parse-community/parse-server/compare/5.5.1...5.5.2) (2023-06-28)


### Bug Fixes

* Remote code execution via MongoDB BSON parser through prototype pollution; fixes security vulnerability [GHSA-462x-c3jw-7vr6](https://github.com/parse-community/parse-server/security/advisories/GHSA-462x-c3jw-7vr6) ([#8675](https://github.com/parse-community/parse-server/issues/8675)) ([5fad292](https://github.com/parse-community/parse-server/commit/5fad2928fb8ee17304abcdcf259932f827d8c81f))

## [5.5.1](https://github.com/parse-community/parse-server/compare/5.5.0...5.5.1) (2023-05-23)


### Bug Fixes

* Security upgrade @parse/push-adapter from 4.1.2 to 4.1.3 ([#8571](https://github.com/parse-community/parse-server/issues/8571)) ([8e83cac](https://github.com/parse-community/parse-server/commit/8e83cac02d6258e9b84b69d4e76da7d771a5eac7))

# [5.5.0](https://github.com/parse-community/parse-server/compare/5.4.3...5.5.0) (2023-05-20)


### Features

* Add new Parse Server option `fileUpload.fileExtensions` to restrict file upload by file extension; this fixes a security vulnerability in which a phishing attack could be performed using an uploaded HTML file; by default the new option only allows file extensions matching the regex pattern `^[^hH][^tT][^mM][^lL]?$`, which excludes HTML files; this fix is released as a patch version given the severity of this vulnerability, however, if your app currently depends on uploading files with HTML file extensions then this may be a breaking change and you could allow HTML file upload by setting the option to `['.*']` ([#8537](https://github.com/parse-community/parse-server/issues/8537)) ([196e05f](https://github.com/parse-community/parse-server/commit/196e05f047a65f0fa96910905bb5bf24b6d30338))

## [5.4.3](https://github.com/parse-community/parse-server/compare/5.4.2...5.4.3) (2023-03-22)


### Bug Fixes

* Unable to create new role if `beforeSave` hook exists ([#8474](https://github.com/parse-community/parse-server/issues/8474)) ([4f0f0ec](https://github.com/parse-community/parse-server/commit/4f0f0ec4bb7334adf64fcbfb80589727dc46906d))

## [5.4.2](https://github.com/parse-community/parse-server/compare/5.4.1...5.4.2) (2023-02-16)


### Bug Fixes

* Security upgrade jsonwebtoken to 9.0.0 ([#8431](https://github.com/parse-community/parse-server/issues/8431)) ([2c19c2e](https://github.com/parse-community/parse-server/commit/2c19c2e4d4cfdeefe31e0ec11d2dc0e8ee508a91))

## [5.4.1](https://github.com/parse-community/parse-server/compare/5.4.0...5.4.1) (2023-01-31)


### Bug Fixes

* The client IP address may be determined incorrectly in some cases; it is now required to set the Parse Server option `trustProxy` accordingly if Parse Server runs behind a proxy server, see the express framework's [trust proxy](https://expressjs.com/en/guide/behind-proxies.html) setting; this fixes a security vulnerability in which the Parse Server option `masterKeyIps` may be circumvented, see [GHSA-vm5r-c87r-pf6x](https://github.com/parse-community/parse-server/security/advisories/GHSA-vm5r-c87r-pf6x) ([#8369](https://github.com/parse-community/parse-server/issues/8369)) ([e016d81](https://github.com/parse-community/parse-server/commit/e016d813e083ce6828f9abce245d15b681a224d8))

# [5.4.0](https://github.com/parse-community/parse-server/compare/5.3.3...5.4.0) (2022-11-19)


### Bug Fixes

* GraphQL query ignores condition `equalTo` with value `false` ([#8032](https://github.com/parse-community/parse-server/issues/8032)) ([7f5a15d](https://github.com/parse-community/parse-server/commit/7f5a15d5df0dfa3515e9f73709d6a49663545f9b))
* Internal indices for classes `_Idempotency` and `_Role` are not protected in defined schema ([#8121](https://github.com/parse-community/parse-server/issues/8121)) ([c16f529](https://github.com/parse-community/parse-server/commit/c16f529f74f92154401bf662f634b3c5fa45e18e))
* LiveQuery with `containedIn` not working when object field is an array ([#8128](https://github.com/parse-community/parse-server/issues/8128)) ([1d9605b](https://github.com/parse-community/parse-server/commit/1d9605bc93009263d3811df4d4249034ba6eb8c4))
* Push notifications `badge` doesn't update with Installation beforeSave trigger ([#8162](https://github.com/parse-community/parse-server/issues/8162)) ([3c75c2b](https://github.com/parse-community/parse-server/commit/3c75c2ba4851fae96a8c19b11a3efde03816c9a1))
* Query aggregation pipeline cannot handle value of type `Date` when `directAccess: true` ([#8167](https://github.com/parse-community/parse-server/issues/8167)) ([e424137](https://github.com/parse-community/parse-server/commit/e4241374061caef66538de15112fb6bbafb1f5bb))
* Relation constraints in compound queries `Parse.Query.or`, `Parse.Query.and` not working ([#8203](https://github.com/parse-community/parse-server/issues/8203)) ([28f0d26](https://github.com/parse-community/parse-server/commit/28f0d2667787d2ac68726607b811d6f0ef62b9f1))
* Security upgrade undici from 5.6.0 to 5.8.0 ([#8108](https://github.com/parse-community/parse-server/issues/8108)) ([4aa016b](https://github.com/parse-community/parse-server/commit/4aa016b7322467422b9fdf05d8e29b9ecf910da7))
* Sorting by non-existing value throws `INVALID_SERVER_ERROR` on Postgres ([#8157](https://github.com/parse-community/parse-server/issues/8157)) ([3b775a1](https://github.com/parse-community/parse-server/commit/3b775a1fb8a1878714e3451191438963d688f1b0))
* Updating object includes unchanged keys in client response for certain key types ([#8159](https://github.com/parse-community/parse-server/issues/8159)) ([37af1d7](https://github.com/parse-community/parse-server/commit/37af1d78fce5a15039ffe3af7b323c1f1e8582fc))

### Features

* Add convenience access to Parse Server configuration in Cloud Code via `Parse.Server` ([#8244](https://github.com/parse-community/parse-server/issues/8244)) ([9f11115](https://github.com/parse-community/parse-server/commit/9f111158edf7fd57a65db0c4f9244b37e58cf293))
* Add option to change the default value of the `Parse.Query.limit()` constraint ([#8152](https://github.com/parse-community/parse-server/issues/8152)) ([0388956](https://github.com/parse-community/parse-server/commit/038895680894984e569dff54bf5c7b31094f3891))
* Add support for MongoDB 6 ([#8242](https://github.com/parse-community/parse-server/issues/8242)) ([aba0081](https://github.com/parse-community/parse-server/commit/aba0081ce1a166a93de57f3928c19a05562b5cc1))
* Add support for Postgres 15 ([#8215](https://github.com/parse-community/parse-server/issues/8215)) ([2feb6c4](https://github.com/parse-community/parse-server/commit/2feb6c46080946c984daa351187fa07cd582355d))
* LiveQuery support for unsorted distance queries ([#8221](https://github.com/parse-community/parse-server/issues/8221)) ([0f763da](https://github.com/parse-community/parse-server/commit/0f763da17d646b2fec2cd980d3857e46072a8a07))

## [5.3.3](https://github.com/parse-community/parse-server/compare/5.3.2...5.3.3) (2022-11-09)


### Bug Fixes

* Prototype pollution via Cloud Code Webhooks; fixes security vulnerability [GHSA-93vw-8fm5-p2jf](https://github.com/parse-community/parse-server/security/advisories/GHSA-93vw-8fm5-p2jf) ([#8305](https://github.com/parse-community/parse-server/issues/8305)) ([60c5a73](https://github.com/parse-community/parse-server/commit/60c5a73d257e0d536056b38bdafef8b7130524d8))

## [5.3.2](https://github.com/parse-community/parse-server/compare/5.3.1...5.3.2) (2022-11-09)


### Bug Fixes

* Parse Server option `requestKeywordDenylist` can be bypassed via Cloud Code Webhooks or Triggers; fixes security vulnerability [GHSA-xprv-wvh7-qqqx](https://github.com/parse-community/parse-server/security/advisories/GHSA-xprv-wvh7-qqqx) ([#8302](https://github.com/parse-community/parse-server/issues/8302)) ([6728da1](https://github.com/parse-community/parse-server/commit/6728da1e3591db1e27031d335d64d8f25546a06f))

## [5.3.1](https://github.com/parse-community/parse-server/compare/5.3.0...5.3.1) (2022-11-07)


### Bug Fixes

* Remote code execution via MongoDB BSON parser through prototype pollution; fixes security vulnerability [GHSA-prm5-8g2m-24gg](https://github.com/parse-community/parse-server/security/advisories/GHSA-prm5-8g2m-24gg) ([#8295](https://github.com/parse-community/parse-server/issues/8295)) ([50eed3c](https://github.com/parse-community/parse-server/commit/50eed3cffe80fadfb4bdac52b2783a18da2cfc4f))

# [5.3.0](https://github.com/parse-community/parse-server/compare/5.2.8...5.3.0) (2022-10-29)


### Bug Fixes

* afterSave trigger removes pointer in Parse object ([#7913](https://github.com/parse-community/parse-server/issues/7913)) ([47d796e](https://github.com/parse-community/parse-server/commit/47d796ea58f65e71612ce37149be692abc9ea97f))
* authentication adapter app ID validation may be circumvented; this fixes a vulnerability that affects configurations which allow users to authenticate using the Parse Server authentication adapter for *Facebook* or *Spotify* and where the server-side authentication adapter configuration `appIds` is set as a string (e.g. `abc`) instead of an array of strings (e.g. `["abc"]`) ([GHSA-r657-33vp-gp22](https://github.com/parse-community/parse-server/security/advisories/GHSA-r657-33vp-gp22)) [skip release] ([#8188](https://github.com/parse-community/parse-server/issues/8188)) ([1a2b1b9](https://github.com/parse-community/parse-server/commit/1a2b1b9bc18012acc019ec2b5ee16fddfa41de41))
* auto-release process may fail if optional back-merging task fails ([#8051](https://github.com/parse-community/parse-server/issues/8051)) ([cf925e7](https://github.com/parse-community/parse-server/commit/cf925e75e87a6989f41e2e2abb2aba4332b1e79f))
* brute force guessing of user sensitive data via search patterns (GHSA-2m6g-crv8-p3c6) ([#8145](https://github.com/parse-community/parse-server/issues/8145)) [skip release] ([f0db4ca](https://github.com/parse-community/parse-server/commit/f0db4ca4a45208e6c86e21ce563105977c2b1c1f))
* certificate in Apple Game Center auth adapter not validated [skip release] ([#8055](https://github.com/parse-community/parse-server/issues/8055)) ([4c2aa63](https://github.com/parse-community/parse-server/commit/4c2aa63fd2f4ee6cca48b051b7d345ca7c975591))
* custom database options are not passed to MongoDB GridFS ([#7911](https://github.com/parse-community/parse-server/issues/7911)) ([b1e5565](https://github.com/parse-community/parse-server/commit/b1e5565b22f2eff229571fe9a9500314bd30965b))
* depreciate allowClientClassCreation defaulting to true ([#7925](https://github.com/parse-community/parse-server/issues/7925)) ([38ed96a](https://github.com/parse-community/parse-server/commit/38ed96ace534d639db007aa7dd5387b2da8f03ae))
* errors in GraphQL do not show the original error but a general `Unexpected Error` ([#8045](https://github.com/parse-community/parse-server/issues/8045)) ([0d81887](https://github.com/parse-community/parse-server/commit/0d818879c217f9c56100a5f59868fa37e6d24b71))
* interrupted WebSocket connection not closed by LiveQuery server ([#8012](https://github.com/parse-community/parse-server/issues/8012)) ([2d5221e](https://github.com/parse-community/parse-server/commit/2d5221e48012fb7781c0406d543a922d313075ea))
* invalid file request not properly handled [skip release] ([#8061](https://github.com/parse-community/parse-server/issues/8061)) ([1a04a34](https://github.com/parse-community/parse-server/commit/1a04a347cf5e015069fd133bfc7d2566374c99d7))
* live query role cache does not clear when a user is added to a role ([#8026](https://github.com/parse-community/parse-server/issues/8026)) ([199dfc1](https://github.com/parse-community/parse-server/commit/199dfc17226d85a78ab85f24362cce740f4ada39))
* peer dependency mismatch for GraphQL dependencies ([#7934](https://github.com/parse-community/parse-server/issues/7934)) ([0a6faa8](https://github.com/parse-community/parse-server/commit/0a6faa81fa97f8620e7fd05e8c7bbdb4b7da9578))
* protected fields exposed via LiveQuery (GHSA-crrq-vr9j-fxxh) [skip release] ([#8075](https://github.com/parse-community/parse-server/issues/8075)) ([636d16e](https://github.com/parse-community/parse-server/commit/636d16e0f9f40bbb68ae2b32bcb4d016c1cd749c))
* return correct response when revert is used in beforeSave ([#7839](https://github.com/parse-community/parse-server/issues/7839)) ([19900fc](https://github.com/parse-community/parse-server/commit/19900fcdf8c9f29a674fb62cf6e4b3341d796891))
* security upgrade @parse/fs-files-adapter from 1.2.1 to 1.2.2 ([#7948](https://github.com/parse-community/parse-server/issues/7948)) ([3a70fda](https://github.com/parse-community/parse-server/commit/3a70fda6798d4143f21046439b5eaf232a31bdb6))
* security upgrade moment from 2.29.1 to 2.29.2 ([#7931](https://github.com/parse-community/parse-server/issues/7931)) ([731c550](https://github.com/parse-community/parse-server/commit/731c5507144bbacff236097e7a2a03bfe54f6e10))
* security upgrade parse push adapter from 4.1.0 to 4.1.2 ([#7893](https://github.com/parse-community/parse-server/issues/7893)) ([93667b4](https://github.com/parse-community/parse-server/commit/93667b4e8402bf13b46c4d3ef12cec6532fd9da7))
* server crashes when receiving file download request with invalid byte range; this fixes a security vulnerability that allows an attacker to impact the availability of the server instance; the fix improves parsing of the range parameter to properly handle invalid range requests ([GHSA-h423-w6qv-2wj3](https://github.com/parse-community/parse-server/security/advisories/GHSA-h423-w6qv-2wj3)) [skip release] ([#8237](https://github.com/parse-community/parse-server/issues/8237)) ([4c1befa](https://github.com/parse-community/parse-server/commit/4c1befabf2e40bf3cf41b8b3db257435684f7a62))
* session object properties can be updated by foreign user; this fixes a security vulnerability in which a foreign user can write to the session object of another user if the session object ID is known; the fix prevents writing to foreign session objects ([GHSA-6w4q-23cf-j9jp](https://github.com/parse-community/parse-server/security/advisories/GHSA-6w4q-23cf-j9jp)) [skip release] ([#8181](https://github.com/parse-community/parse-server/issues/8181)) ([83cdc89](https://github.com/parse-community/parse-server/commit/83cdc89be994416f74533030b90e8d1dd82fec57))
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

## [5.2.8](https://github.com/parse-community/parse-server/compare/5.2.7...5.2.8) (2022-10-14)


### Bug Fixes

* server crashes when receiving file download request with invalid byte range; this fixes a security vulnerability that allows an attacker to impact the availability of the server instance; the fix improves parsing of the range parameter to properly handle invalid range requests ([GHSA-h423-w6qv-2wj3](https://github.com/parse-community/parse-server/security/advisories/GHSA-h423-w6qv-2wj3)) ([#8235](https://github.com/parse-community/parse-server/issues/8235)) ([066f296](https://github.com/parse-community/parse-server/commit/066f29673ab4030b6b5b90c0c0326f7d3fe7612a))

## [5.2.7](https://github.com/parse-community/parse-server/compare/5.2.6...5.2.7) (2022-09-20)


### Bug Fixes

* authentication adapter app ID validation may be circumvented; this fixes a vulnerability that affects configurations which allow users to authenticate using the Parse Server authentication adapter for *Facebook* or *Spotify* and where the server-side authentication adapter configuration `appIds` is set as a string (e.g. `abc`) instead of an array of strings (e.g. `["abc"]`) ([GHSA-r657-33vp-gp22](https://github.com/parse-community/parse-server/security/advisories/GHSA-r657-33vp-gp22)) ([#8185](https://github.com/parse-community/parse-server/issues/8185)) ([ecf0814](https://github.com/parse-community/parse-server/commit/ecf0814499bde31ab6082b6e42854aa65ad2e03e))

## [5.2.6](https://github.com/parse-community/parse-server/compare/5.2.5...5.2.6) (2022-09-20)


### Bug Fixes

* session object properties can be updated by foreign user; this fixes a security vulnerability in which a foreign user can write to the session object of another user if the session object ID is known; the fix prevents writing to foreign session objects ([GHSA-6w4q-23cf-j9jp](https://github.com/parse-community/parse-server/security/advisories/GHSA-6w4q-23cf-j9jp)) ([#8182](https://github.com/parse-community/parse-server/issues/8182)) ([6d0b2f5](https://github.com/parse-community/parse-server/commit/6d0b2f534603301bb630d9c8e497af3bc7ff1d09))

## [5.2.5](https://github.com/parse-community/parse-server/compare/5.2.4...5.2.5) (2022-09-02)


### Bug Fixes

* brute force guessing of user sensitive data via search patterns; this fixes a security vulnerability in which internal and protected fields may be used as query constraints to guess the value of these fields and obtain sensitive data (GHSA-2m6g-crv8-p3c6) ([#8144](https://github.com/parse-community/parse-server/issues/8144)) ([e39d51b](https://github.com/parse-community/parse-server/commit/e39d51bd329cd978589983bd659db46e1d45aad4))

## [5.2.4](https://github.com/parse-community/parse-server/compare/5.2.3...5.2.4) (2022-06-30)


### Bug Fixes

* protected fields exposed via LiveQuery; this removes protected fields from the client response; this may be a breaking change if your app is currently expecting to receive these protected fields ([GHSA-crrq-vr9j-fxxh](https://github.com/parse-community/parse-server/security/advisories/GHSA-crrq-vr9j-fxxh)) (https://github.com/parse-community/parse-server/pull/8074) ([#8073](https://github.com/parse-community/parse-server/issues/8073)) ([309f64c](https://github.com/parse-community/parse-server/commit/309f64ced8700321df056fb3cc97f15007a00df1))

## [5.2.3](https://github.com/parse-community/parse-server/compare/5.2.2...5.2.3) (2022-06-17)


### Bug Fixes

* invalid file request not properly handled; this fixes a security vulnerability in which an invalid file request can crash the server ([GHSA-xw6g-jjvf-wwf9](https://github.com/parse-community/parse-server/security/advisories/GHSA-xw6g-jjvf-wwf9)) ([#8060](https://github.com/parse-community/parse-server/issues/8060)) ([5be375d](https://github.com/parse-community/parse-server/commit/5be375dec2fa35425c1003ae81c55995ac72af92))

## [5.2.2](https://github.com/parse-community/parse-server/compare/5.2.1...5.2.2) (2022-06-17)


### Bug Fixes

* certificate in Apple Game Center auth adapter not validated; this fixes a security vulnerability in which authentication could be bypassed using a fake certificate; if you are using the Apple Gamer Center auth adapter it is your responsibility to keep its root certificate up-to-date and we advice you read the security advisory ([GHSA-rh9j-f5f8-rvgc](https://github.com/parse-community/parse-server/security/advisories/GHSA-rh9j-f5f8-rvgc)) ([ba2b0a9](https://github.com/parse-community/parse-server/commit/ba2b0a9cb9a568817a114b132a4c2e0911d76df1))

## [5.2.1](https://github.com/parse-community/parse-server/compare/5.2.0...5.2.1) (2022-05-01)


### Bug Fixes

* authentication bypass and denial of service (DoS) vulnerabilities in Apple Game Center auth adapter (GHSA-qf8x-vqjv-92gr) ([#7962](https://github.com/parse-community/parse-server/issues/7962)) ([af4a041](https://github.com/parse-community/parse-server/commit/af4a0417a9f3c1e99b3793806b4b18e04d9fa999))

# [5.2.0](https://github.com/parse-community/parse-server/compare/5.1.1...5.2.0) (2022-03-24)


### Bug Fixes

* security bump minimist from 1.2.5 to 1.2.6 ([#7884](https://github.com/parse-community/parse-server/issues/7884)) ([c5cf282](https://github.com/parse-community/parse-server/commit/c5cf282d11ffdc023764f8e7539a2bd6bc246fe1))
* sensitive keyword detection may produce false positives ([#7881](https://github.com/parse-community/parse-server/issues/7881)) ([0d6f9e9](https://github.com/parse-community/parse-server/commit/0d6f9e951d9e186e95e96d8869066ce7022bad02))

### Features

* improved LiveQuery error logging with additional information ([#7837](https://github.com/parse-community/parse-server/issues/7837)) ([443a509](https://github.com/parse-community/parse-server/commit/443a5099059538d379fe491793a5871fcbb4f377))

## [5.1.1](https://github.com/parse-community/parse-server/compare/5.1.0...5.1.1) (2022-03-18)


### Reverts

* ci: temporarily disable breaking change detection ([#7861](https://github.com/parse-community/parse-server/issues/7861)) ([effed92](https://github.com/parse-community/parse-server/commit/effed92cabd88676fdf9eca2e079a4d8be017f1b))

# [5.1.0](https://github.com/parse-community/parse-server/compare/5.0.0...5.1.0) (2022-03-18)


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

### ⚠️ NOTABLE CHANGES

*The following changes would formally require a major version increment (Parse Server 6.0), but given their low relevance they are released as part of this minor version increment (Parse Server 5.1).*

* The MongoDB GridStore adapter has been removed. By default, Parse Server already uses GridFS, so if you do not manually use the GridStore adapter, you can ignore this change. Parse Server uses the GridFSBucket adapter instead of GridStore adapter by default since 2018. ([f88aa2a](f88aa2a))
* Removes official Node 15 support which has already reached it End-of-Life date. ([45cc58c](45cc58c))


# [5.0.0](https://github.com/parse-community/parse-server/compare/4.10.7...5.0.0) (2022-03-14)


### BREAKING CHANGES
- Improved schema caching through database real-time hooks. Reduces DB queries, decreases Parse Query execution time and fixes a potential schema memory leak. If multiple Parse Server instances connect to the same DB (for example behind a load balancer), set the [Parse Server Option](https://parseplatform.org/parse-server/api/master/ParseServerOptions.html) `databaseOptions.enableSchemaHooks: true` to enable this feature and keep the schema in sync across all instances. Failing to do so will cause a schema change to not propagate to other instances and re-syncing will only happen when these instances restart. The options `enableSingleSchemaCache` and `schemaCacheTTL` have been removed. To use this feature with MongoDB, a replica set cluster with [change stream](https://docs.mongodb.com/manual/changeStreams/#availability) support is required. (Diamond Lewis, SebC) [#7214](https://github.com/parse-community/parse-server/issues/7214)
- Fix security vulnerability that allows remote code execution; as part of the fix a new security feature scans for sensitive keywords in request data to prevent JavaScript prototype pollution. If such a keyword is found, the request is rejected with HTTP response code `400` and Parse Error `105` (`INVALID_KEY_NAME`). By default these keywords are: `{_bsontype: "Code"}`, `constructor`, `__proto__`. If you are using any of these keywords in your request data, you can override the default keywords by setting the new Parse Server option `requestKeywordDenylist` to `[]` and specify your own keywords as needed. ([GHSA-p6h4-93qp-jhcm](https://github.com/advisories/GHSA-p6h4-93qp-jhcm)) ([#7843](https://github.com/parse-community/parse-server/issues/7843)) ([971adb5](https://github.com/parse-community/parse-server/commit/971adb54387b0ede31be05ca407d5f35b4575c83))
- Added file upload restriction. File upload is now only allowed for authenticated users by default for improved security. To allow file upload also for Anonymous Users or Public, set the `fileUpload` parameter in the [Parse Server Options](https://parseplatform.org/parse-server/api/master/ParseServerOptions.html) (dblythy, Manuel Trezza) [#7071](https://github.com/parse-community/parse-server/pull/7071)
- Removed [parse-server-simple-mailgun-adapter](https://github.com/parse-community/parse-server-simple-mailgun-adapter) dependency; to continue using the adapter it has to be explicitly installed (Manuel Trezza) [#7321](https://github.com/parse-community/parse-server/pull/7321)
- Remove support for MongoDB 3.6 which has reached its End-of-Life date and PostgreSQL 10 (Manuel Trezza) [#7315](https://github.com/parse-community/parse-server/pull/7315)
- Remove support for Node 10 which has reached its End-of-Life date (Manuel Trezza) [#7314](https://github.com/parse-community/parse-server/pull/7314)
- Bump required Node engine to >=12.22.10 ([#7848](https://github.com/parse-community/parse-server/issues/7848)) ([23a3488](https://github.com/parse-community/parse-server/commit/23a3488f15511fafbe0e1d7ff0ef8355f9cb0215))
- Remove S3 Files Adapter from Parse Server, instead install separately as `@parse/s3-files-adapter` (Manuel Trezza) [#7324](https://github.com/parse-community/parse-server/pull/7324)
- Remove Session field `restricted`; the field was a code artifact from a feature that never existed in Open Source Parse Server; if you have been using this field for custom purposes, consider that for new Parse Server installations the field does not exist anymore in the schema, and for existing installations the field default value `false` will not be set anymore when creating a new session (Manuel Trezza) [#7543](https://github.com/parse-community/parse-server/pull/7543)
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
- add support for Postgres 14 ([#7644](https://github.com/parse-community/parse-server/issues/7644)) ([090350a](https://github.com/parse-community/parse-server/commit/090350a7a0fac945394ca1cb24b290316ef06aa7))
- add user-defined schema and migrations ([#7418](https://github.com/parse-community/parse-server/issues/7418)) ([25d5c30](https://github.com/parse-community/parse-server/commit/25d5c30be2111be332eb779eb0697774a17da7af))
- setting a field to null does not delete it via GraphQL API ([#7649](https://github.com/parse-community/parse-server/issues/7649)) ([626fad2](https://github.com/parse-community/parse-server/commit/626fad2e71017dcc62196c487de5f908fa43000b))
- combined `and` query with relational query condition returns incorrect results ([#7593](https://github.com/parse-community/parse-server/issues/7593)) ([174886e](https://github.com/parse-community/parse-server/commit/174886e385e091c6bbd4a84891ef95f80b50d05c))
- node engine range has no upper limit to exclude incompatible node versions ([#7693](https://github.com/parse-community/parse-server/issues/7693)) ([6a54dac](https://github.com/parse-community/parse-server/commit/6a54dac24d9fb63a44f311b8d414f4aa64140f32))
- unable to use objectId size higher than 19 on GraphQL API ([#7722](https://github.com/parse-community/parse-server/issues/7722)) ([8ee0445](https://github.com/parse-community/parse-server/commit/8ee0445c0aeeb88dff2559b46ade408071d22143))
- schema cache not cleared in some cases ([#7771](https://github.com/parse-community/parse-server/issues/7771)) ([3b92fa1](https://github.com/parse-community/parse-server/commit/3b92fa1ca9e8889127a32eba913d68309397ca2c))

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
- security upgrade follow-redirects from 1.14.2 to 1.14.7 ([#7772](https://github.com/parse-community/parse-server/issues/7772)) ([4bd34b1](https://github.com/parse-community/parse-server/commit/4bd34b189bc9f5aa2e70b7e7c1a456e91b6de773))
- security upgrade follow-redirects from 1.14.7 to 1.14.8 ([#7802](https://github.com/parse-community/parse-server/issues/7802)) ([7029b27](https://github.com/parse-community/parse-server/commit/7029b274ca87bc8058617f29865d683dc3b351a1))
- Add node engine version check (Manuel Trezza) [#7574](https://github.com/parse-community/parse-server/pull/7574)
