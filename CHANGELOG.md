## Parse Server Changelog

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


