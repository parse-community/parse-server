## Parse Server Changelog

### 2.1.3 (2/24/2016)

* Feature: Add initial support for in-app purchases
* Feature: Better error messages when attempting to run the server on a port that is already in use or without a server URL
* Feature: Allow customization of max file size
* Performance: Faster saves if not using beforeSave triggers
* Fix: Remove triggers for _Session collection
* Fix: Improve compatability of Cloud Code beforeSave hook for newly created object
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
* Feature: Pass parameters to Cloud Code in query string
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
* Experimental: Cloud Code validation hooks (can mark as non-experimental after we have docs)
* Experimental: support for schemas API (GET and POST only)
* Experimental: support for Parse Config (GET and POST only)
* Fix: Querying objects with equality constraint on array column
* Fix: User logout will remove session token
* Fix: Various files related bugs
* Fix: Force minimum node version 4.3 due to security issues in earlier version
* Performance Improvement: Improved caching


