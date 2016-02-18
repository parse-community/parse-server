![Parse Server logo](.github/parse-server-logo.png?raw=true)

[![Build Status](https://img.shields.io/travis/ParsePlatform/parse-server/master.svg?style=flat)](https://travis-ci.org/ParsePlatform/parse-server)
[![Coverage Status](https://img.shields.io/codecov/c/github/ParsePlatform/parse-server/master.svg)](https://codecov.io/github/ParsePlatform/parse-server?branch=master)
[![npm version](https://img.shields.io/npm/v/parse-server.svg?style=flat)](https://www.npmjs.com/package/parse-server)

Parse Server is an open source version of the Parse backend that can be deployed to any infrastructure that can run Node.js.

Parse Server works with the Express web application framework. It can be added to existing web applications, or run by itself.

Read the announcement blog post here:  http://blog.parse.com/announcements/introducing-parse-server-and-the-database-migration-tool/

## Documentation

Documentation for Parse Server is available in the [wiki](https://github.com/ParsePlatform/parse-server/wiki) for this repository. The [Parse Server guide](https://github.com/ParsePlatform/parse-server/wiki/Parse-Server-Guide) is a good place to get started.

If you're interested in developing for Parse Server, the [Development guide](https://github.com/ParsePlatform/parse-server/wiki/Development-Guide) will help you get set up.

### Migration Guide

The hosted version of Parse will be fully retired on January 28th, 2017. If you are planning to migrate an app, you need to begin work as soon as possible. Learn more in the [Migration guide](https://github.com/ParsePlatform/parse-server/wiki/Migrating-an-Existing-Parse-App).


---


#### Basic options:

* databaseURI (required) - The connection string for your database, i.e. `mongodb://user:pass@host.com/dbname`
* appId (required) - The application id to host with this server instance
* masterKey (required) - The master key to use for overriding ACL security
* cloud - The absolute path to your cloud code main.js file
* fileKey - For migrated apps, this is necessary to provide access to files already hosted on Parse.
* facebookAppIds - An array of valid Facebook application IDs.
* serverURL - URL which will be used by Cloud Code functions to make requests against.
* push - Configuration options for APNS and GCM push.  See the [wiki entry](https://github.com/ParsePlatform/parse-server/wiki/Push).

#### Client key options:

The client keys used with Parse are no longer necessary with parse-server.  If you wish to still require them, perhaps to be able to refuse access to older clients, you can set the keys at initialization time.  Setting any of these keys will require all requests to provide one of the configured keys.

* clientKey
* javascriptKey
* restAPIKey
* dotNetKey

#### OAuth Support

parse-server supports 3rd party authentication with

* Twitter
* Meetup
* Linkedin
* Google
* Instagram
* Facebook


Configuration options for these 3rd-party modules is done with the oauth option passed to ParseServer:

```
{
  oauth: {
   twitter: {
     consumer_key: "", // REQUIRED
     consumer_secret: "" // REQUIRED
   },
   facebook: {
     appIds: "FACEBOOK APP ID"
   }
  }

}
```

#### Custom Authentication

It is possible to leverage the OAuth support with any 3rd party authentication that you bring in.

```
{

  oauth: {
   my_custom_auth: {
     module: "PATH_TO_MODULE" // OR object,
     option1: "",
     option2: "",
   }
  }
}
```

On this module, you need to implement and export those two functions `validateAuthData(authData, options) {} ` and `validateAppId(appIds, authData) {}`.

For more informations about custom auth please see the examples:

- [facebook OAuth](https://github.com/ParsePlatform/parse-server/blob/master/src/oauth/facebook.js)
- [twitter OAuth](https://github.com/ParsePlatform/parse-server/blob/master/src/oauth/twitter.js)
- [instagram OAuth](https://github.com/ParsePlatform/parse-server/blob/master/src/oauth/instagram.js)


#### Advanced options:

* filesAdapter - The default behavior (GridStore) can be changed by creating an adapter class (see [`FilesAdapter.js`](https://github.com/ParsePlatform/parse-server/blob/master/src/Adapters/Files/FilesAdapter.js))
* databaseAdapter (unfinished) - The backing store can be changed by creating an adapter class (see `DatabaseAdapter.js`)
* loggerAdapter - The default behavior/transport (File) can be changed by creating an adapter class (see [`LoggerAdapter.js`](https://github.com/ParsePlatform/parse-server/blob/master/src/Adapters/Logger/LoggerAdapter.js))
* enableAnonymousUsers - Defaults to true. Set to false to disable anonymous users.
---

### Usage

You can create an instance of ParseServer, and mount it on a new or existing Express website:

```js
var express = require('express');
var ParseServer = require('parse-server').ParseServer;

var app = express();

var port = process.env.PORT || 1337;

// Specify the connection string for your mongodb database
// and the location to your Parse cloud code
var api = new ParseServer({
  databaseURI: 'mongodb://localhost:27017/dev',
  cloud: '/home/myApp/cloud/main.js', // Provide an absolute path
  appId: 'myAppId',
  masterKey: '', //Add your master key here. Keep it secret!
  fileKey: 'optionalFileKey',
  serverURL: 'http://localhost:' + port + '/parse' // Don't forget to change to https if needed
});

// Serve the Parse API on the /parse URL prefix
app.use('/parse', api);

// Hello world
app.get('/', function(req, res) {
  res.status(200).send('Express is running here.');
});

app.listen(port, function() {
  console.log('parse-server-example running on port ' + port + '.');
});

```


#### Standalone usage

You can configure the Parse Server with environment variables:

```js
PARSE_SERVER_DATABASE_URI
PARSE_SERVER_CLOUD_CODE_MAIN
PARSE_SERVER_COLLECTION_PREFIX
PARSE_SERVER_APPLICATION_ID // required
PARSE_SERVER_CLIENT_KEY
PARSE_SERVER_REST_API_KEY
PARSE_SERVER_DOTNET_KEY
PARSE_SERVER_JAVASCRIPT_KEY
PARSE_SERVER_DOTNET_KEY
PARSE_SERVER_MASTER_KEY // required
PARSE_SERVER_FILE_KEY
PARSE_SERVER_FACEBOOK_APP_IDS // string of comma separated list

```



Alernatively, you can use the `PARSE_SERVER_OPTIONS` environment variable set to the JSON of your configuration (see Usage).

To start the server, just run `npm start`.

##### Global installation

You can install parse-server globally

`$ npm install -g parse-server`

Now you can just run `$ parse-server` from your command line.


### Supported

* CRUD operations
* Schema validation
* Pointers
* Users, including Facebook login and anonymous users
* Files
* Push Notifications - See the [wiki entry](https://github.com/ParsePlatform/parse-server/wiki/Push).
* Installations
* Sessions
* Geopoints
* Roles
* Class-level Permissions (see below)

Parse server does not include a web-based dashboard, which is where class-level permissions have always been configured.  If you migrate an app from Parse, you'll see the format for CLPs in the SCHEMA collection.  There is also a `setPermissions` method on the `Schema` class, which you can see used in the unit-tests in `Schema.spec.js`
You can also set up an app on Parse, providing the connection string for your mongo database, and continue to use the dashboard on Parse.com.

### Not supported

* `Parse.User.current()` or `Parse.Cloud.useMasterKey()` in cloud code. Instead of `Parse.User.current()` use `request.user` and instead of `Parse.Cloud.useMasterKey()` pass `useMasterKey: true` to each query. To make queries and writes as a specific user within Cloud Code, you need the user's session token, which is available in `request.user.getSessionToken()`.

## Contributing

We really want Parse to be yours, to see it grow and thrive in the open source community. Please see the [Contributing to Parse Server guide](CONTRIBUTING.md).
