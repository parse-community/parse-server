## parse-server

[![Build Status](https://api.travis-ci.org/ParsePlatform/parse-server.svg)](https://travis-ci.org/ParsePlatform/parse-server)

A Parse.com API compatible router package for Express

Read the announcement blog post here:  http://blog.parse.com/announcements/introducing-parse-server-and-the-database-migration-tool/

Read the migration guide here: https://parse.com/docs/server/guide#migrating

There is a development wiki here on GitHub: https://github.com/ParsePlatform/parse-server/wiki

---

#### Basic options:

* databaseURI (required) - The connection string for your database, i.e. `mongodb://user:pass@host.com/dbname`
* appId (required) - The application id to host with this server instance
* masterKey (required) - The master key to use for overriding ACL security
* cloud - The absolute path to your cloud code main.js file
* fileKey - For migrated apps, this is necessary to provide access to files already hosted on Parse.
* facebookAppIds - An array of valid Facebook application IDs.

#### Client key options:

The client keys used with Parse are no longer necessary with parse-server.  If you wish to still require them, perhaps to be able to refuse access to older clients, you can set the keys at intialization time.  Setting any of these keys will require all requests to provide one of the configured keys.

* clientKey
* javascriptKey
* restAPIKey
* dotNetKey

#### Advanced options:

* filesAdapter - The default behavior (GridStore) can be changed by creating an adapter class (see `FilesAdapter.js`)
* databaseAdapter (unfinished) - The backing store can be changed by creating an adapter class (see `DatabaseAdapter.js`)

---

### Usage

You can create an instance of ParseServer, and mount it on a new or existing Express website:

```js
var express = require('express');
var ParseServer = require('parse-server').ParseServer;

var app = express();

// Specify the connection string for your mongodb database
// and the location to your Parse cloud code
var api = new ParseServer({
  databaseURI: 'mongodb://localhost:27017/dev',
  cloud: '/home/myApp/cloud/main.js', // Provide an absolute path
  appId: 'myAppId',
  masterKey: 'mySecretMasterKey',
  fileKey: 'optionalFileKey'
});

// Serve the Parse API on the /parse URL prefix
app.use('/parse', api);

// Hello world
app.get('/', function(req, res) {
  res.status(200).send('Express is running here.');
});

var port = process.env.PORT || 1337;
app.listen(port, function() {
  console.log('parse-server-example running on port ' + port + '.');
});

```

### Supported

* CRUD operations
* Schema validation
* Pointers
* Users, including Facebook login and anonymous users
* Files
* Installations
* Sessions
* Geopoints
* Roles
* Class-level Permissions (see below)

Parse server does not include a web-based dashboard, which is where class-level permissions have always been configured.  If you migrate an app from Parse, you'll see the format for CLPs in the SCHEMA collection.  There is also a `setPermissions` method on the `Schema` class, which you can see used in the unit-tests in `Schema.spec.js`
You can also set up an app on Parse, providing the connection string for your mongo database, and continue to use the dashboard on Parse.com.

### Not supported

* Push - We did not rebuild a new push delivery system for parse-server, but we are open to working on one together with the community.
