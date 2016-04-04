## Parse Server Changelog

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
* Update README.md - remove deploy buttons - replace with community links [\#1139](https://github.com/ParsePlatform/parse-server/pull/1139) (drew-gross)
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


