## Parse Server Changelog

### 2.2.25

Postgres support requires v9.5

#### New Features
* Dockerizing Parse Server, thanks to [Kirill Kravinsky](https://github.com/woyorus)
* Login with qq, wechat, weibo, thanks to [haifeizhang]()
* Password policy, validation and expiration, thanks to [Bhaskar Reddy Yasa](https://github.com/bhaskaryasa)
* Health check on /health, thanks to [Kirill Kravinsky](https://github.com/woyorus)
* Reuse SchemaCache across requests option, thanks to [Steven Shipton](https://github.com/steven-supersolid)

#### Improvements
* Better support for CLI options, thanks to [Steven Shipton](https://github.com/steven-supersolid)
* Specity a database timeout with maxTimeMS, thanks to [Tyler Brock](https://github.com/TylerBrock)
* Adds the username to reset password success pages, thanks to [Halim Qarroum](https://github.com/HQarroum)
* Better support for Redis cache adapter, thanks to [Tyler Brock](https://github.com/TylerBrock)
* Better coverage of Postgres, thanks to [Kulshekhar Kabra](https://github.com/kulshekhar)

#### Bug Fixes
* Fixes issue when sending push to multiple installations, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fixes issues with twitter authentication, thanks to [jonas-db](https://github.com/jonas-db)
* Ignore createdAt fields update, thanks to [Yuki Takeichi](https://github.com/yuki-takeichi)
* Improve support for array equality with LiveQuery, thanks to [David Poetzsch-Heffter](https://github.com/dpoetzsch)
* Improve support for batch endpoint when serverURL and publicServerURL have different paths, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Support saving relation objects, thanks to [Yuki Takeichi](https://github.com/yuki-takeichi)

### 2.2.24

#### New Features
* LiveQuery: Bring your own adapter (#2902), thanks to [Florent Vilmart](https://github.com/flovilmart)
* LiveQuery: Adds "update" operator to update a query subscription (#2935), thanks to [Florent Vilmart](https://github.com/flovilmart)

#### Improvements
* Better Postgres support, thanks to [Kulshekhar Kabra](https://github.com/kulshekhar)
* Logs the function name when failing (#2963), thanks to [Michael Helvey](https://github.com/michaelhelvey)
* CLI: forces closing the connections with SIGINT/SIGTERM (#2964), thanks to [Kulshekhar Kabra](https://github.com/kulshekhar)
* Reduce the number of calls to the _SCHEMA table (#2912), thanks to [Steven Shipton](https://github.com/steven-supersolid)
* LiveQuery: Support for Role ACL's, thanks to [Aaron Blondeau](https://github.com/aaron-blondeau-dose)

#### Bug Fixes
* Better support for checking application and client keys, thanks to [Steven Shipton](https://github.com/steven-supersolid)
* Google OAuth, better support for android and web logins, thanks to [Florent Vilmart](https://github.com/flovilmart)

### 2.2.23

* Run liveQuery server from CLI with a different port, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Support for Postgres databaseURI, thanks to [Kulshekhar Kabra](https://github.com/kulshekhar)
* Support for Postgres options, thanks to [Kulshekhar Kabra](https://github.com/kulshekhar)
* Improved support for google login (id_token and access_token), thanks to [Florent Vilmart](https://github.com/flovilmart)
* Improvements with VKontakte login, thanks to [Eugene Antropov](https://github.com/antigp)
* Improved support for `select` and `include`, thanks to [Florent Vilmart](https://github.com/flovilmart)

#### Bug fixes

* Fix error when updating installation with useMasterKey (#2888), thanks to [Jeremy Louie](https://github.com/JeremyPlease)
* Fix bug affecting usage of multiple `notEqualTo`, thanks to [Jeremy Louie](https://github.com/JeremyPlease)
* Improved support for null values in arrays, thanks to [Florent Vilmart](https://github.com/flovilmart)

### 2.2.22

* Minimum nodejs engine is now 4.5

#### New Features
* New: CLI for parse-live-query-server, thanks to [Florent Vilmart](https://github.com/flovilmart)
* New: Start parse-live-query-server for parse-server CLI, thanks to [Florent Vilmart](https://github.com/flovilmart)

#### Bug fixes
* Fix: Include with pointers are not conflicting with get CLP anymore, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: Removes dependency on babel-polyfill, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: Support nested select calls, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: Use native column selection instead of runtime, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: installationId header is properly used when updating `_Installation` objects, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: don't crash parse-server on improperly formatted live-query messages, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: Passwords are properly stripped out of logs, thanks to [Arthur Cinader](https://github.com/acinader)
* Fix: Lookup for email in username if email is not set, thanks to [Florent Vilmart](https://github.com/flovilmart)

### 2.2.21

* Fix: Reverts removal of babel-polyfill

### 2.2.20

* New: Adds CloudCode handler for `beforeFind`, thanks to [Florent Vilmart](https://github.com/flovilmart)
* New: RedisCacheAdapter for syncing schema, role and user caches across servers, thanks to [Florent Vilmart](https://github.com/flovilmart) 
* New: Latest master build available at `ParsePlatform/parse-server#latest`, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: Better support for upgradeToRevocableSession with missing session token, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: Removes babel-polyfill runtime dependency, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: Cluster option now support a boolean value for automatically choosing the right number of processes, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: Filenames now appear correctly, thanks to [Lama Chandrasena](https://github.com/lama-buddy)
* Fix: `_acl` is properly updated, thanks to [Steven Shipton](https://github.com/steven-supersolid)

Other fixes by [Mathias Rangel Wulff](https://github.com/mathiasrw)

### 2.2.19

* New: support for upgrading to revocable sessions, thanks to [Florent Vilmart](https://github.com/flovilmart)
* New: NullCacheAdapter for disabling caching, thanks to [Yuki Takeichi](https://github.com/yuki-takeichi)
* New: Account lockout policy [#2601](https://github.com/ParsePlatform/parse-server/pull/2601), thanks to [Diwakar Cherukumilli](https://github.com/cherukumilli)
* New: Jobs endpoint for defining and run jobs (no scheduling), thanks to [Florent Vilmart](https://github.com/flovilmart)
* New: Add --cluster option to the CLI, thanks to [Florent Vilmart](https://github.com/flovilmart)
* New: Support for login with vk.com, thanks to [Nurdaulet Bolatov](https://github.com/nbolatov)
* New: experimental support for postgres databases, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: parse-server doesn't call next() after successful responses, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: Nested objects are properly includeed with Pointer Permissions on, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: null values in include calls are properly handled, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: Schema validations now runs after beforeSave hooks, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: usersname and passwords are properly type checked, thanks to [Bam Wang](https://github.com/bamwang)
* Fix: logging in info log would log also in error log, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: removes extaneous logging from ParseLiveQueryServer, thanks to [Flavio Torres](https://github.com/flavionegrao)
* Fix: support for Range requests for files, thanks to [Brage G. Staven](https://github.com/Bragegs)

### 2.2.18

* Fix: Improve support for objects in push alert, thanks to [Antoine Lenoir](https://github.com/alenoir)
* Fix; Prevent pointed from getting clobbered when they are changed in a beforeSave, thanks to [sud](https://github.com/sud80)
* Fix: Improve support for "Bytes" type, thanks to [CongHoang](https://github.com/conghoang)
* Fix: Better logging compatability with Parse.com, thanks to [Arthur Cinader](https://github.com/acinader)
* New: Add Janrain Capture and Janrain Engage auth provider, thanks to [Andrew Lane](https://github.com/AndrewLane)
* Improved: Include content length header in files response, thanks to [Steven Van Bael](https://github.com/vbsteven)
* Improved: Support byte range header for files, thanks to [Brage G. Staven](https://github.com/Bragegs)
* Improved: Validations for LinkedIn access_tokens, thanks to [Felix Dumit](https://github.com/felix-dumit)
* Improved: Experimental postgres support, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Perf: Use native bcrypt implementation if available, thanks to [Florent Vilmart](https://github.com/flovilmart)


### [2.2.17](https://github.com/ParsePlatform/parse-server/tree/2.2.17) (07/23/2016)
[Full Changelog](https://github.com/ParsePlatform/parse-server/compare/2.2.16...2.2.17)

* Cloud code logs [\#2370](https://github.com/ParsePlatform/parse-server/pull/2370) ([flovilmart](https://github.com/flovilmart))
* Make sure \_PushStatus operations are run in order [\#2367](https://github.com/ParsePlatform/parse-server/pull/2367) ([flovilmart](https://github.com/flovilmart))
* Typo fix for error message when can't ensure uniqueness of user email addresses [\#2360](https://github.com/ParsePlatform/parse-server/pull/2360) ([AndrewLane](https://github.com/AndrewLane))
* LiveQuery constrains matching fix [\#2357](https://github.com/ParsePlatform/parse-server/pull/2357) ([simonas-notcat](https://github.com/simonas-notcat))
* Fix typo in logging for commander parseConfigFile [\#2352](https://github.com/ParsePlatform/parse-server/pull/2352) ([AndrewLane](https://github.com/AndrewLane))
* Fix minor typos in test names [\#2351](https://github.com/ParsePlatform/parse-server/pull/2351) ([acinader](https://github.com/acinader))
* Makes sure we don't strip authData or session token from users using masterKey [\#2348](https://github.com/ParsePlatform/parse-server/pull/2348) ([flovilmart](https://github.com/flovilmart))
* Run coverage with istanbul [\#2340](https://github.com/ParsePlatform/parse-server/pull/2340) ([flovilmart](https://github.com/flovilmart))
* Run next\(\) after successfully sending data to the client [\#2338](https://github.com/ParsePlatform/parse-server/pull/2338) ([blacha](https://github.com/blacha))
* Cache all the mongodb/version folder [\#2336](https://github.com/ParsePlatform/parse-server/pull/2336) ([flovilmart](https://github.com/flovilmart))
* updates usage of setting: emailVerifyTokenValidityDuration [\#2331](https://github.com/ParsePlatform/parse-server/pull/2331) ([cherukumilli](https://github.com/cherukumilli))
* Update Mongodb client to 2.2.4 [\#2329](https://github.com/ParsePlatform/parse-server/pull/2329) ([flovilmart](https://github.com/flovilmart))
* Allow usage of analytics adapter [\#2327](https://github.com/ParsePlatform/parse-server/pull/2327) ([deashay](https://github.com/deashay))
* Fix flaky tests [\#2324](https://github.com/ParsePlatform/parse-server/pull/2324) ([flovilmart](https://github.com/flovilmart))
* don't serve null authData values [\#2320](https://github.com/ParsePlatform/parse-server/pull/2320) ([yuzeh](https://github.com/yuzeh))
* Fix null relation problem [\#2319](https://github.com/ParsePlatform/parse-server/pull/2319) ([flovilmart](https://github.com/flovilmart))
* Clear the connectionPromise upon close or error [\#2314](https://github.com/ParsePlatform/parse-server/pull/2314) ([flovilmart](https://github.com/flovilmart))
* Report validation errors with correct error code [\#2299](https://github.com/ParsePlatform/parse-server/pull/2299) ([flovilmart](https://github.com/flovilmart))
* Parses correctly Parse.Files and Dates when sent to Cloud Code Functions [\#2297](https://github.com/ParsePlatform/parse-server/pull/2297) ([flovilmart](https://github.com/flovilmart))
* Adding proper generic Not Implemented. [\#2292](https://github.com/ParsePlatform/parse-server/pull/2292) ([vitaly-t](https://github.com/vitaly-t))
* Adds schema caching capabilities \(5s by default\) [\#2286](https://github.com/ParsePlatform/parse-server/pull/2286) ([flovilmart](https://github.com/flovilmart))
* add digits oauth provider [\#2284](https://github.com/ParsePlatform/parse-server/pull/2284) ([ranhsd](https://github.com/ranhsd))
* Improve installations query [\#2281](https://github.com/ParsePlatform/parse-server/pull/2281) ([flovilmart](https://github.com/flovilmart))
* Adding request headers to cloud functions fixes \#1461 [\#2274](https://github.com/ParsePlatform/parse-server/pull/2274) ([blacha](https://github.com/blacha))
* Creates a new sessionToken when updating password [\#2266](https://github.com/ParsePlatform/parse-server/pull/2266) ([flovilmart](https://github.com/flovilmart))
* Add Gitter chat link to the README. [\#2264](https://github.com/ParsePlatform/parse-server/pull/2264) ([nlutsenko](https://github.com/nlutsenko))
* Restores ability to include non pointer keys [\#2263](https://github.com/ParsePlatform/parse-server/pull/2263) ([flovilmart](https://github.com/flovilmart))
* Allow next middleware handle error in handleParseErrors [\#2260](https://github.com/ParsePlatform/parse-server/pull/2260) ([mejcz](https://github.com/mejcz))
* Exposes the ClientSDK infos if available [\#2259](https://github.com/ParsePlatform/parse-server/pull/2259) ([flovilmart](https://github.com/flovilmart))
* Adds support for multiple twitter auths options [\#2256](https://github.com/ParsePlatform/parse-server/pull/2256) ([flovilmart](https://github.com/flovilmart))
* validate\_purchase fix for SANDBOX requests [\#2253](https://github.com/ParsePlatform/parse-server/pull/2253) ([valeryvaskabovich](https://github.com/valeryvaskabovich))

### 2.2.16 (7/10/2016)

* New: Expose InMemoryCacheAdapter publicly, thanks to [Steven Shipton](https://github.com/steven-supersolid)
* New: Add ability to prevent login with unverified email, thanks to [Diwakar Cherukumilli](https://github.com/cherukumilli)
* Improved: Better error message for incorrect type, thanks to [Andrew Lane](https://github.com/AndrewLane)
* Improved: Better error message for permission denied, thanks to [Blayne Chard](https://github.com/blacha)
* Improved: Update authData on login, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Improved: Ability to not check for old files on Parse.com, thanks to [OzgeAkin](https://github.com/OzgeAkin)
* Fix: Issues with email adapter validation, thanks to [Tyler Brock](https://github.com/TylerBrock)
* Fix: Issues with nested $or queries, thanks to [Florent Vilmart](https://github.com/flovilmart)

### 2.2.15 (6/30/2016)

* Fix: Type in description for Parse.Error.INVALID_QUERY, thanks to [Andrew Lane](https://github.com/AndrewLane)
* Improvement: Stop requiring verifyUserEmails for password reset functionality, thanks to [Tyler Brock](https://github.com/TylerBrock)
* Improvement: Kill without validation, thanks to [Drew Gross](https://github.com/drew-gross)
* Fix: Deleting a file does not delete from fs.files, thanks to [David Keita](https://github.com/maninga)
* Fix: Postgres stoage adapter fix, thanks to [Vitaly Tomilov](https://github.com/vitaly-t)
* Fix: Results invalid session when providing an invalid session token, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: issue creating an anonymous user, thanks to [Hussam Moqhim](https://github.com/hmoqhim)
* Fix: make http response serializable, thanks to [Florent Vilmart](https://github.com/flovilmart)
* New: Add postmark email adapter alternative [Glenn Reyes](https://github.com/glennreyes)

### 2.2.14 (6/25/2016)

* Hotfix: Fix Parse.Cloud.HTTPResponse serialization

### 2.2.13 (6/12/2016)

* Hotfix: Pin version of deepcopy

### 2.2.12 (6/9/2016)

* New: Custom error codes in cloud code response.error, thanks to [Jeremy Pease](https://github.com/JeremyPlease)
* Fix: Crash in beforeSave when response is not an object, thanks to [Tyler Brock](https://github.com/TylerBrock)
* Fix: Allow "get" on installations
* Fix: Fix overly restrictive Class Level Permissions, thanks to [Florent Vilmart](https://github.com/flovilmart)
* Fix: Fix nested date parsing in Cloud Code, thanks to [Marco Cheung](https://github.com/Marco129)
* Fix: Support very old file formats from Parse.com

### 2.2.11 (5/31/2016)

* Security: Censor user password in logs, thanks to [Marco Cheung](https://github.com/Marco129)
* New: Add PARSE_SERVER_LOGS_FOLDER env var for setting log folder, thanks to [KartikeyaRokde](https://github.com/KartikeyaRokde)
* New: Webhook key support, thanks to [Tyler Brock](https://github.com/TylerBrock)
* Perf: Add cache adapter and default caching of certain objects, thanks to [Blayne Chard](https://github.com/blacha)
* Improvement: Better error messages for schema type mismatches, thanks to [Jeremy Pease](https://github.com/JeremyPlease)
* Improvement: Better error messages for reset password emails
* Improvement: Webhook key support in CLI, thanks to [Tyler Brock](https://github.com/TylerBrock)
* Fix: Remove read only fields when using beforeSave, thanks to [Tyler Brock](https://github.com/TylerBrock)
* Fix: Use content type provided by JS SDK, thanks to [Blayne Chard](https://github.com/blacha) and [Florent Vilmart](https://github.com/flovilmart)
* Fix: Tell the dashboard the stored push data is available, thanks to [Jeremy Pease](https://github.com/JeremyPlease)
* Fix: Add support for HTTP Basic Auth, thanks to [Hussam Moqhim](https://github.com/hmoqhim)
* Fix: Support for MongoDB version 3.2.6, (note: do not use MongoDB 3.2 with migrated apps that still have traffic on Parse.com), thanks to [Tyler Brock](https://github.com/TylerBrock)
* Fix: Prevent `pm2` from crashing when push notifications fail, thanks to [benishak](https://github.com/benishak)
* Fix: Add full list of default _Installation fields, thanks to [Jeremy Pease](https://github.com/JeremyPlease)
* Fix: Strip objectId out of hooks responses, thanks to [Tyler Brock](https://github.com/TylerBrock)
* Fix: Fix external webhook response format, thanks to [Tyler Brock](https://github.com/TylerBrock)
* Fix: Fix beforeSave when object is passed to `success`, thanks to [Madhav Bhagat](https://github.com/codebreach)
* Fix: Remove use of deprecated APIs, thanks to [Emad Ehsan](https://github.com/emadehsan)
* Fix: Crash when multiple Parse Servers on the same machine try to write to the same logs folder, thanks to [Steven Shipton](https://github.com/steven-supersolid)
* Fix: Various issues with key names in `Parse.Object`s
* Fix: Treat Bytes type properly
* Fix: Caching bugs that caused writes by masterKey or other session token to not show up to users reading with a different session token
* Fix: Pin mongo driver version, preventing a regression in version 2.1.19
* Fix: Various issues with pointer fields not being treated properly
* Fix: Issues with pointed getting un-fetched due to changes in beforeSave
* Fix: Fixed crash when deleting classes that have CLPs

### 2.2.10 (5/15/2016)

* Fix: Write legacy ACLs to Mongo so that clients that still go through Parse.com can read them, thanks to [Tyler Brock](https://github.com/TylerBrock) and [carmenlau](https://github.com/carmenlau)
* Fix: Querying installations with limit = 0 and count = 1 now works, thanks to [ssk7833](https://github.com/ssk7833)
* Fix: Return correct error when violating unique index, thanks to [Marco Cheung](https://github.com/Marco129)
* Fix: Allow unsetting user's email, thanks to [Marco Cheung](https://github.com/Marco129)
* New: Support for Node 6.1

### 2.2.9 (5/9/2016)

* Fix: Fix a regression that caused Parse Server to crash when a null parameter is passed to a Cloud function

### 2.2.8 (5/8/2016)

* New: Support for Pointer Permissions
* New: Expose logger in Cloud Code
* New: Option to revoke sessions on password reset
* New: Option to expire inactive sessions
* Perf: Improvements in ACL checking query
* Fix: Issues when sending pushes to list of devices that contains invalid values
* Fix: Issues caused by using babel-polyfill outside of Parse Server, but in the same express app
* Fix: Remove creation of extra session tokens
* Fix: Return authData when querying with master key
* Fix: Bugs when deleting webhooks
* Fix: Ignore _RevocableSession header, which might be sent by the JS SDK
* Fix: Issues with querying via URL params
* Fix: Properly encode "Date" parameters to cloud code functions


### 2.2.7 (4/15/2016)

* Adds support for --verbose and verbose option when running ParseServer [\#1414](https://github.com/ParsePlatform/parse-server/pull/1414) ([flovilmart](https://github.com/flovilmart))
* Adds limit = 0 as a valid parameter for queries [\#1493](https://github.com/ParsePlatform/parse-server/pull/1493) ([seijiakiyama](https://github.com/seijiakiyama))
* Makes sure we preserve Installations when updating a token  \(\#1475\) [\#1486](https://github.com/ParsePlatform/parse-server/pull/1486) ([flovilmart](https://github.com/flovilmart))
* Hotfix for tests [\#1503](https://github.com/ParsePlatform/parse-server/pull/1503) ([flovilmart](https://github.com/flovilmart))
* Enable logs [\#1502](https://github.com/ParsePlatform/parse-server/pull/1502) ([drew-gross](https://github.com/drew-gross))
* Do some triple equals for great justice [\#1499](https://github.com/ParsePlatform/parse-server/pull/1499) ([TylerBrock](https://github.com/TylerBrock))
* Apply credential stripping to all untransforms for \_User [\#1498](https://github.com/ParsePlatform/parse-server/pull/1498) ([TylerBrock](https://github.com/TylerBrock))
* Checking if object has defined key for Pointer constraints in liveQuery [\#1487](https://github.com/ParsePlatform/parse-server/pull/1487) ([simonas-notcat](https://github.com/simonas-notcat))
* Remove collection prefix and default mongo URI [\#1479](https://github.com/ParsePlatform/parse-server/pull/1479) ([drew-gross](https://github.com/drew-gross))
* Store collection prefix in mongo adapter, and clean up adapter interface [\#1472](https://github.com/ParsePlatform/parse-server/pull/1472) ([drew-gross](https://github.com/drew-gross))
* Move field deletion logic into mongo adapter [\#1471](https://github.com/ParsePlatform/parse-server/pull/1471) ([drew-gross](https://github.com/drew-gross))
* Adds support for Long and Double mongodb types \(fixes \#1316\) [\#1470](https://github.com/ParsePlatform/parse-server/pull/1470) ([flovilmart](https://github.com/flovilmart))
* Schema.js database agnostic [\#1468](https://github.com/ParsePlatform/parse-server/pull/1468) ([flovilmart](https://github.com/flovilmart))
* Remove console.log [\#1465](https://github.com/ParsePlatform/parse-server/pull/1465) ([drew-gross](https://github.com/drew-gross))
* Push status nits [\#1462](https://github.com/ParsePlatform/parse-server/pull/1462) ([flovilmart](https://github.com/flovilmart))
* Fixes \#1444 [\#1451](https://github.com/ParsePlatform/parse-server/pull/1451) ([flovilmart](https://github.com/flovilmart))
* Removing sessionToken and authData from \_User objects included in a query [\#1450](https://github.com/ParsePlatform/parse-server/pull/1450) ([simonas-notcat](https://github.com/simonas-notcat))
* Move mongo field type logic into mongoadapter [\#1432](https://github.com/ParsePlatform/parse-server/pull/1432) ([drew-gross](https://github.com/drew-gross))
* Prevents \_User lock out when setting ACL on signup or afterwards [\#1429](https://github.com/ParsePlatform/parse-server/pull/1429) ([flovilmart](https://github.com/flovilmart))
* Update .travis.yml [\#1428](https://github.com/ParsePlatform/parse-server/pull/1428) ([flovilmart](https://github.com/flovilmart))
* Adds relation fields to objects [\#1424](https://github.com/ParsePlatform/parse-server/pull/1424) ([flovilmart](https://github.com/flovilmart))
* Update .travis.yml [\#1423](https://github.com/ParsePlatform/parse-server/pull/1423) ([flovilmart](https://github.com/flovilmart))
* Sets the defaultSchemas keys in the SchemaCollection [\#1421](https://github.com/ParsePlatform/parse-server/pull/1421) ([flovilmart](https://github.com/flovilmart))
* Fixes \#1417 [\#1420](https://github.com/ParsePlatform/parse-server/pull/1420) ([drew-gross](https://github.com/drew-gross))
* Untransform should treat Array's as nested objects [\#1416](https://github.com/ParsePlatform/parse-server/pull/1416) ([blacha](https://github.com/blacha))
* Adds X-Parse-Push-Status-Id header [\#1412](https://github.com/ParsePlatform/parse-server/pull/1412) ([flovilmart](https://github.com/flovilmart))
* Schema format cleanup [\#1407](https://github.com/ParsePlatform/parse-server/pull/1407) ([drew-gross](https://github.com/drew-gross))
* Updates the publicServerURL option [\#1397](https://github.com/ParsePlatform/parse-server/pull/1397) ([flovilmart](https://github.com/flovilmart))
* Fix exception with non-expiring session tokens. [\#1386](https://github.com/ParsePlatform/parse-server/pull/1386) ([0x18B2EE](https://github.com/0x18B2EE))
* Move mongo schema format related logic into mongo adapter [\#1385](https://github.com/ParsePlatform/parse-server/pull/1385) ([drew-gross](https://github.com/drew-gross))
* WIP: Huge performance improvement on roles queries [\#1383](https://github.com/ParsePlatform/parse-server/pull/1383) ([flovilmart](https://github.com/flovilmart))
* Removes GCS Adapter from provided adapters [\#1339](https://github.com/ParsePlatform/parse-server/pull/1339) ([flovilmart](https://github.com/flovilmart))
* DBController refactoring [\#1228](https://github.com/ParsePlatform/parse-server/pull/1228) ([flovilmart](https://github.com/flovilmart))
* Spotify authentication [\#1226](https://github.com/ParsePlatform/parse-server/pull/1226) ([1nput0utput](https://github.com/1nput0utput))
* Expose DatabaseAdapter to simplify application tests [\#1121](https://github.com/ParsePlatform/parse-server/pull/1121) ([steven-supersolid](https://github.com/steven-supersolid))

### 2.2.6 (4/5/2016)

* Important Fix: Disables find on installation from clients [\#1374](https://github.com/ParsePlatform/parse-server/pull/1374) ([flovilmart](https://github.com/flovilmart))
* Adds missing options to the CLI [\#1368](https://github.com/ParsePlatform/parse-server/pull/1368) ([flovilmart](https://github.com/flovilmart))
* Removes only master on travis [\#1367](https://github.com/ParsePlatform/parse-server/pull/1367) ([flovilmart](https://github.com/flovilmart))
* Auth.\_loadRoles should not query the same role twice. [\#1366](https://github.com/ParsePlatform/parse-server/pull/1366) ([blacha](https://github.com/blacha))

### 2.2.5 (4/4/2016)

* Improves config loading and tests [\#1363](https://github.com/ParsePlatform/parse-server/pull/1363) ([flovilmart](https://github.com/flovilmart))
* Adds travis configuration to deploy NPM on new version tags [\#1361](https://github.com/ParsePlatform/parse-server/pull/1361) ([gfosco](https://github.com/gfosco))
* Inject the default schemas properties when loading it [\#1357](https://github.com/ParsePlatform/parse-server/pull/1357) ([flovilmart](https://github.com/flovilmart))
* Adds console transport when testing with VERBOSE=1 [\#1351](https://github.com/ParsePlatform/parse-server/pull/1351) ([flovilmart](https://github.com/flovilmart))
* Make notEqual work on relations  [\#1350](https://github.com/ParsePlatform/parse-server/pull/1350) ([flovilmart](https://github.com/flovilmart))
* Accept only bool for $exists in LiveQuery [\#1315](https://github.com/ParsePlatform/parse-server/pull/1315) ([drew-gross](https://github.com/drew-gross))
* Adds more options when using CLI/config [\#1305](https://github.com/ParsePlatform/parse-server/pull/1305) ([flovilmart](https://github.com/flovilmart))
* Update error message [\#1297](https://github.com/ParsePlatform/parse-server/pull/1297) ([drew-gross](https://github.com/drew-gross))
* Properly let masterKey add fields [\#1291](https://github.com/ParsePlatform/parse-server/pull/1291) ([flovilmart](https://github.com/flovilmart))
* Point to \#1271 as how to write a good issue report [\#1290](https://github.com/ParsePlatform/parse-server/pull/1290) ([drew-gross](https://github.com/drew-gross))
* Adds ability to override mount with publicServerURL for production uses [\#1287](https://github.com/ParsePlatform/parse-server/pull/1287) ([flovilmart](https://github.com/flovilmart))
* Single object queries to use include and keys [\#1280](https://github.com/ParsePlatform/parse-server/pull/1280) ([jeremyjackson89](https://github.com/jeremyjackson89))
* Improves report for Push error in logs and \_PushStatus [\#1269](https://github.com/ParsePlatform/parse-server/pull/1269) ([flovilmart](https://github.com/flovilmart))
* Removes all stdout/err logs while testing [\#1268](https://github.com/ParsePlatform/parse-server/pull/1268) ([flovilmart](https://github.com/flovilmart))
* Matching queries with doesNotExist constraint [\#1250](https://github.com/ParsePlatform/parse-server/pull/1250) ([andrecardoso](https://github.com/andrecardoso))
* Added session length option for session tokens to server configuration [\#997](https://github.com/ParsePlatform/parse-server/pull/997) ([Kenishi](https://github.com/Kenishi))
* Regression test for \#1259 [\#1286](https://github.com/ParsePlatform/parse-server/pull/1286) ([drew-gross](https://github.com/drew-gross))
* Regression test for \#871 [\#1283](https://github.com/ParsePlatform/parse-server/pull/1283) ([drew-gross](https://github.com/drew-gross))
* Add a test to repro \#701 [\#1281](https://github.com/ParsePlatform/parse-server/pull/1281) ([drew-gross](https://github.com/drew-gross))
* Fix for \#1334: using relative cloud code files broken  [\#1353](https://github.com/ParsePlatform/parse-server/pull/1353) ([airdrummingfool](https://github.com/airdrummingfool))
* Fix Issue/1288 [\#1346](https://github.com/ParsePlatform/parse-server/pull/1346) ([flovilmart](https://github.com/flovilmart))
* Fixes \#1271 [\#1295](https://github.com/ParsePlatform/parse-server/pull/1295) ([drew-gross](https://github.com/drew-gross))
* Fixes issue \#1302 [\#1314](https://github.com/ParsePlatform/parse-server/pull/1314) ([flovilmart](https://github.com/flovilmart))
* Fixes bug related to include in queries [\#1312](https://github.com/ParsePlatform/parse-server/pull/1312) ([flovilmart](https://github.com/flovilmart))


### 2.2.4 (3/29/2016)

* Hotfix: fixed imports issue for S3Adapter, GCSAdapter, FileSystemAdapter [\#1263](https://github.com/ParsePlatform/parse-server/pull/1263) ([drew-gross](https://github.com/drew-gross)
* Fix: Clean null authData values on _User update [\#1199](https://github.com/ParsePlatform/parse-server/pull/1199) ([yuzeh](https://github.com/yuzeh))

### 2.2.3 (3/29/2016)

* Fixed bug with invalid email verification link on email update. [\#1253](https://github.com/ParsePlatform/parse-server/pull/1253) ([kzielonka](https://github.com/kzielonka))
* Badge update supports increment as well as Increment [\#1248](https://github.com/ParsePlatform/parse-server/pull/1248) ([flovilmart](https://github.com/flovilmart))
* Config/Push Tested with the dashboard. [\#1235](https://github.com/ParsePlatform/parse-server/pull/1235) ([drew-gross](https://github.com/drew-gross))
* Better logging with winston [\#1234](https://github.com/ParsePlatform/parse-server/pull/1234) ([flovilmart](https://github.com/flovilmart))
* Make GlobalConfig work like parse.com [\#1210](https://github.com/ParsePlatform/parse-server/pull/1210) ([framp](https://github.com/framp))
* Improve flattening of results from pushAdapter [\#1204](https://github.com/ParsePlatform/parse-server/pull/1204) ([flovilmart](https://github.com/flovilmart))
* Push adapters are provided by external packages [\#1195](https://github.com/ParsePlatform/parse-server/pull/1195) ([flovilmart](https://github.com/flovilmart))
* Fix flaky test [\#1188](https://github.com/ParsePlatform/parse-server/pull/1188) ([drew-gross](https://github.com/drew-gross))
* Fixes problem affecting finding array pointers [\#1185](https://github.com/ParsePlatform/parse-server/pull/1185) ([flovilmart](https://github.com/flovilmart))
* Moves Files adapters to external packages [\#1172](https://github.com/ParsePlatform/parse-server/pull/1172) ([flovilmart](https://github.com/flovilmart))
* Mark push as enabled in serverInfo endpoint [\#1164](https://github.com/ParsePlatform/parse-server/pull/1164) ([drew-gross](https://github.com/drew-gross))
* Document email adapter [\#1144](https://github.com/ParsePlatform/parse-server/pull/1144) ([drew-gross](https://github.com/drew-gross))
* Reset password fix [\#1133](https://github.com/ParsePlatform/parse-server/pull/1133) ([carmenlau](https://github.com/carmenlau))

### 2.2.2 (3/23/2016)

* Important Fix: Mounts createLiveQueryServer, fix babel induced problem [\#1153](https://github.com/ParsePlatform/parse-server/pull/1153) (flovilmart)
* Move ParseServer to it's own file [\#1166](https://github.com/ParsePlatform/parse-server/pull/1166) (flovilmart)
* Update README.md * remove deploy buttons * replace with community links [\#1139](https://github.com/ParsePlatform/parse-server/pull/1139) (drew-gross)
* Adds bootstrap.sh [\#1138](https://github.com/ParsePlatform/parse-server/pull/1138) (flovilmart)
* Fix: Do not override username [\#1142](https://github.com/ParsePlatform/parse-server/pull/1142) (flovilmart)
* Fix: Add pushId back to GCM payload [\#1168](https://github.com/ParsePlatform/parse-server/pull/1168) (wangmengyan95)

### 2.2.1 (3/22/2016)

* New: Add FileSystemAdapter file adapter [\#1098](https://github.com/ParsePlatform/parse-server/pull/1098) (dtsolis)
* New: Enabled CLP editing [\#1128](https://github.com/ParsePlatform/parse-server/pull/1128) (drew-gross)
* Improvement: Reduces the number of connections to mongo created [\#1111](https://github.com/ParsePlatform/parse-server/pull/1111) (flovilmart)
* Improvement: Make ParseServer a class [\#980](https://github.com/ParsePlatform/parse-server/pull/980) (flovilmart)
* Fix: Adds support for plain object in $add, $addUnique, $remove [\#1114](https://github.com/ParsePlatform/parse-server/pull/1114) (flovilmart)
* Fix: Generates default CLP, freezes objects [\#1132](https://github.com/ParsePlatform/parse-server/pull/1132) (flovilmart)
* Fix: Properly sets installationId on creating session with 3rd party auth [\#1110](https://github.com/ParsePlatform/parse-server/pull/1110) (flovilmart)

### 2.2.0 (3/18/2016)

* New Feature: Real-time functionality with Live Queries! [\#1092](https://github.com/ParsePlatform/parse-server/pull/1092) (wangmengyan95)
* Improvement: Push Status API [\#1004](https://github.com/ParsePlatform/parse-server/pull/1004) (flovilmart)
* Improvement: Allow client operations on Roles [\#1068](https://github.com/ParsePlatform/parse-server/pull/1068) (flovilmart)
* Improvement: Add URI encoding to mongo auth parameters [\#986](https://github.com/ParsePlatform/parse-server/pull/986) (bgw)
* Improvement: Adds support for apps key in config file, but only support single app for now [\#979](https://github.com/ParsePlatform/parse-server/pull/979) (flovilmart)
* Documentation: Getting Started and Configuring Parse Server [\#988](https://github.com/ParsePlatform/parse-server/pull/988) (hramos)
* Fix: Various edge cases with REST API [\#1066](https://github.com/ParsePlatform/parse-server/pull/1066) (flovilmart)
* Fix: Makes sure the location in results has the proper objectId [\#1065](https://github.com/ParsePlatform/parse-server/pull/1065) (flovilmart)
* Fix: Third-party auth is properly removed when unlinked [\#1081](https://github.com/ParsePlatform/parse-server/pull/1081) (flovilmart)
* Fix: Clear the session-user cache when changing \_User objects [\#1072](https://github.com/ParsePlatform/parse-server/pull/1072) (gfosco)
* Fix: Bug related to subqueries on unfetched objects [\#1046](https://github.com/ParsePlatform/parse-server/pull/1046) (flovilmart)
* Fix: Properly urlencode parameters for email validation and password reset [\#1001](https://github.com/ParsePlatform/parse-server/pull/1001) (flovilmart)
* Fix: Better sanitization/decoding of object data for afterSave triggers [\#992](https://github.com/ParsePlatform/parse-server/pull/992) (flovilmart)
* Fix: Changes default encoding for httpRequest [\#892](https://github.com/ParsePlatform/parse-server/pull/892) (flovilmart)

### 2.1.6 (3/11/2016)

* Improvement: Full query support for badge Increment \(\#931\) [\#983](https://github.com/ParsePlatform/parse-server/pull/983) (flovilmart)
* Improvement: Shutdown standalone parse server gracefully [\#958](https://github.com/ParsePlatform/parse-server/pull/958) (raulr)
* Improvement: Add database options to ParseServer constructor and pass to MongoStorageAdapter [\#956](https://github.com/ParsePlatform/parse-server/pull/956) (steven-supersolid)
* Improvement: AuthData logic refactor [\#952](https://github.com/ParsePlatform/parse-server/pull/952) (flovilmart)
* Improvement: Changed FileLoggerAdapterSpec to fail gracefully on Windows [\#946](https://github.com/ParsePlatform/parse-server/pull/946) (aneeshd16)
* Improvement: Add new schema collection type and replace all usages of direct mongo collection for schema operations. [\#943](https://github.com/ParsePlatform/parse-server/pull/943) (nlutsenko)
* Improvement: Adds CLP API to Schema router [\#898](https://github.com/ParsePlatform/parse-server/pull/898) (flovilmart)
* Fix: Cleans up authData null keys on login for android crash [\#978](https://github.com/ParsePlatform/parse-server/pull/978) (flovilmart)
* Fix: Do master query for before/afterSaveHook [\#959](https://github.com/ParsePlatform/parse-server/pull/959) (wangmengyan95)
* Fix: re-add shebang [\#944](https://github.com/ParsePlatform/parse-server/pull/944) (flovilmart)
* Fix: Added test command for Windows support [\#886](https://github.com/ParsePlatform/parse-server/pull/886) (aneeshd16)

### 2.1.5 (3/9/2016)

* New: FileAdapter for Google Cloud Storage [\#708](https://github.com/ParsePlatform/parse-server/pull/708) (mcdonamp)
* Improvement: Minimize extra schema queries in some scenarios. [\#919](https://github.com/ParsePlatform/parse-server/pull/919) (Marco129)
* Improvement: Move DatabaseController and Schema fully to adaptive mongo collection. [\#909](https://github.com/ParsePlatform/parse-server/pull/909) (nlutsenko)
* Improvement: Cleanup PushController/PushRouter, remove raw mongo collection access. [\#903](https://github.com/ParsePlatform/parse-server/pull/903) (nlutsenko)
* Improvement: Increment badge the right way [\#902](https://github.com/ParsePlatform/parse-server/pull/902) (flovilmart)
* Improvement: Migrate ParseGlobalConfig to new database storage API. [\#901](https://github.com/ParsePlatform/parse-server/pull/901) (nlutsenko)
* Improvement: Improve delete flow for non-existent \_Join collection [\#881](https://github.com/ParsePlatform/parse-server/pull/881) (Marco129)
* Improvement: Adding a role scenario test for issue 827 [\#878](https://github.com/ParsePlatform/parse-server/pull/878) (gfosco)
* Improvement: Test empty authData block on login for \#413 [\#863](https://github.com/ParsePlatform/parse-server/pull/863) (gfosco)
* Improvement: Modified the npm dev script to support Windows [\#846](https://github.com/ParsePlatform/parse-server/pull/846) (aneeshd16)
* Improvement: Move HooksController to use MongoCollection instead of direct Mongo access. [\#844](https://github.com/ParsePlatform/parse-server/pull/844) (nlutsenko)
* Improvement: Adds public\_html and views for packaging [\#839](https://github.com/ParsePlatform/parse-server/pull/839) (flovilmart)
* Improvement: Better support for windows builds [\#831](https://github.com/ParsePlatform/parse-server/pull/831) (flovilmart)
* Improvement: Convert Schema.js to ES6 class. [\#826](https://github.com/ParsePlatform/parse-server/pull/826) (nlutsenko)
* Improvement: Remove duplicated instructions [\#816](https://github.com/ParsePlatform/parse-server/pull/816) (hramos)
* Improvement: Completely migrate SchemasRouter to new MongoCollection API. [\#794](https://github.com/ParsePlatform/parse-server/pull/794) (nlutsenko)
* Fix: Do not require where clause in $dontSelect condition on queries. [\#925](https://github.com/ParsePlatform/parse-server/pull/925) (nlutsenko)
* Fix: Make sure that ACLs propagate to before/after save hooks. [\#924](https://github.com/ParsePlatform/parse-server/pull/924) (nlutsenko)
* Fix: Support params option in Parse.Cloud.httpRequest. [\#912](https://github.com/ParsePlatform/parse-server/pull/912) (carmenlau)
* Fix: Fix flaky Parse.GeoPoint test. [\#908](https://github.com/ParsePlatform/parse-server/pull/908) (nlutsenko)
* Fix: Handle legacy \_client\_permissions key in \_SCHEMA. [\#900](https://github.com/ParsePlatform/parse-server/pull/900) (drew-gross)
* Fix: Fixes bug when querying equalTo on objectId and relation [\#887](https://github.com/ParsePlatform/parse-server/pull/887) (flovilmart)
* Fix: Allow crossdomain on filesRouter [\#876](https://github.com/ParsePlatform/parse-server/pull/876) (flovilmart)
* Fix: Remove limit when counting results. [\#867](https://github.com/ParsePlatform/parse-server/pull/867) (gfosco)
* Fix: beforeSave changes should propagate to the response [\#865](https://github.com/ParsePlatform/parse-server/pull/865) (gfosco)
* Fix: Delete relation field when \_Join collection not exist [\#864](https://github.com/ParsePlatform/parse-server/pull/864) (Marco129)
* Fix: Related query on non-existing column [\#861](https://github.com/ParsePlatform/parse-server/pull/861) (gfosco)
* Fix: Update markdown in .github/ISSUE\_TEMPLATE.md [\#859](https://github.com/ParsePlatform/parse-server/pull/859) (igorshubovych)
* Fix: Issue with creating wrong \_Session for Facebook login [\#857](https://github.com/ParsePlatform/parse-server/pull/857) (tobernguyen)
* Fix: Leak warnings in tests, use mongodb-runner from node\_modules [\#843](https://github.com/ParsePlatform/parse-server/pull/843) (drew-gross)
* Fix: Reversed roles lookup [\#841](https://github.com/ParsePlatform/parse-server/pull/841) (flovilmart)
* Fix: Improves loading of Push Adapter, fix loading of S3Adapter [\#833](https://github.com/ParsePlatform/parse-server/pull/833) (flovilmart)
* Fix: Add field to system schema [\#828](https://github.com/ParsePlatform/parse-server/pull/828) (Marco129)

### 2.1.4 (3/3/2016)

* New: serverInfo endpoint that returns server version and info about the server's features
* Improvement: Add support for badges on iOS
* Improvement: Improve failure handling in cloud code http requests
* Improvement: Add support for queries on pointers and relations
* Improvement: Add support for multiple $in clauses in a query
* Improvement: Add allowClientClassCreation config option
* Improvement: Allow atomically setting subdocument keys
* Improvement: Allow arbitrarily deeply nested roles
* Improvement: Set proper content-type in S3 File Adapter
* Improvement: S3 adapter auto-creates buckets
* Improvement: Better error messages for many errors
* Performance: Improved algorithm for validating client keys
* Experimental: Parse Hooks and Hooks API
* Experimental: Email verification and password reset emails
* Experimental: Improve compatability of logs feature with Parse.com
* Fix: Fix for attempting to delete missing classes via schemas API
* Fix: Allow creation of system classes via schemas API
* Fix: Allow missing where cause in $select
* Fix: Improve handling of invalid object ids
* Fix: Replace query overwriting existing query
* Fix: Propagate installationId in cloud code triggers
* Fix: Session expiresAt is now a Date instead of a string
* Fix: Fix count queries
* Fix: Disallow _Role objects without names or without ACL
* Fix: Better handling of invalid types submitted
* Fix: beforeSave will not be triggered for attempts to save with invalid authData
* Fix: Fix duplicate device token issues on Android
* Fix: Allow empty authData on signup
* Fix: Allow Master Key Headers (CORS)
* Fix: Fix bugs if JavaScript key was not provided in server configuration
* Fix: Parse Files on objects can now be stored without URLs
* Fix: allow both objectId or installationId when modifying installation
* Fix: Command line works better when not given options

### 2.1.3 (2/24/2016)

* Feature: Add initial support for in-app purchases
* Feature: Better error messages when attempting to run the server on a port that is already in use or without a server URL
* Feature: Allow customization of max file size
* Performance: Faster saves if not using beforeSave triggers
* Fix: Send session token in response to current user endpoint
* Fix: Remove triggers for _Session collection
* Fix: Improve compatability of cloud code beforeSave hook for newly created object
* Fix: ACL creation for master key only objects
* Fix: Allow uploading files without Content-Type
* Fix: Add features to http requrest to match Parse.com
* Fix: Bugs in development script when running from locations other than project root
* Fix: Can pass query constraints in URL
* Fix: Objects with legacy "_tombstone" key now don't cause issues.
* Fix: Allow nested keys in objects to begin with underscores
* Fix: Allow correct headers for CORS

### 2.1.2 (2/19/2016)

* Change: The S3 file adapter constructor requires a bucket name
* Fix: Parse Query should throw if improperly encoded
* Fix: Issue where roles were not used in some requests
* Fix: serverURL will no longer default to api.parse.com/1

### 2.1.1 (2/18/2016)

* Experimental: Schemas API support for DELETE operations
* Fix: Session token issue fetching Users
* Fix: Facebook auth validation
* Fix: Invalid error when deleting missing session

### 2.1.0 (2/17/2016)

* Feature: Support for additional OAuth providers
* Feature: Ability to implement custom OAuth providers
* Feature: Support for deleting Parse Files
* Feature: Allow querying roles
* Feature: Support for logs, extensible via Log Adapter
* Feature: New Push Adapter for sending push notifications through OneSignal
* Feature: Tighter default security for Users
* Feature: Pass parameters to cloud code in query string
* Feature: Disable anonymous users via configuration.
* Experimental: Schemas API support for PUT operations
* Fix: Prevent installation ID from being added to User
* Fix: Becoming a user works properly with sessions
* Fix: Including multiple object when some object are unavailable will get all the objects that are available
* Fix: Invalid URL for Parse Files
* Fix: Making a query without a limit now returns 100 results
* Fix: Expose installation id in cloud code
* Fix: Correct username for Anonymous users
* Fix: Session token issue after fetching user
* Fix: Issues during install process
* Fix: Issue with Unity SDK sending _noBody

### 2.0.8 (2/11/2016)

* Add: support for Android and iOS push notifications
* Experimental: cloud code validation hooks (can mark as non-experimental after we have docs)
* Experimental: support for schemas API (GET and POST only)
* Experimental: support for Parse Config (GET and POST only)
* Fix: Querying objects with equality constraint on array column
* Fix: User logout will remove session token
* Fix: Various files related bugs
* Fix: Force minimum node version 4.3 due to security issues in earlier version
* Performance Improvement: Improved caching
