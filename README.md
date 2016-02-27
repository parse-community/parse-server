![Parse Server logo](.github/parse-server-logo.png?raw=true)

[![Build Status](https://img.shields.io/travis/ParsePlatform/parse-server/master.svg?style=flat)](https://travis-ci.org/ParsePlatform/parse-server)
[![Coverage Status](https://img.shields.io/codecov/c/github/ParsePlatform/parse-server/master.svg)](https://codecov.io/github/ParsePlatform/parse-server?branch=master)
[![npm version](https://img.shields.io/npm/v/parse-server.svg?style=flat)](https://www.npmjs.com/package/parse-server)

Parse Server is an [open source version of the Parse backend](http://blog.parse.com/announcements/introducing-parse-server-and-the-database-migration-tool/) that can be deployed to any infrastructure that can run Node.js.

Parse Server works with the Express web application framework. It can be added to existing web applications, or run by itself.

## Getting Started

We have provided a basic [Node.js application](https://github.com/ParsePlatform/parse-server-example) that uses the Parse Server module on Express and can be easily deployed using any of the following buttons:

<a title="Deploy to AWS" href="https://console.aws.amazon.com/elasticbeanstalk/home?region=us-west-2#/newApplication?applicationName=ParseServer&solutionStackName=Node.js&tierName=WebServer&sourceBundleUrl=https://s3.amazonaws.com/elasticbeanstalk-samples-us-east-1/eb-parse-server-sample/parse-server-example.zip" target="_blank"><img src="http://d0.awsstatic.com/product-marketing/Elastic%20Beanstalk/deploy-to-aws.png" height="40"></a> <a title="Deploy to Heroku" href="https://heroku.com/deploy?template=https://github.com/parseplatform/parse-server-example" target="_blank"><img src="https://www.herokucdn.com/deploy/button.png"></a> <a title="Deploy to Azure" href="https://azuredeploy.net/?repository=https://github.com/parseplatform/parse-server-example" target="_blank"><img src="http://azuredeploy.net/deploybutton.png"></a> <a title="Deploy to GCP" href="https://cloud.google.com/nodejs/resources/frameworks/parse-server" target="_blank"><img src="https://gcpstatic.storage.googleapis.com/deploy%402x.png" height="36"></a>

### Parse Server + Express

You can also create an instance of Parse Server, and mount it on a new or existing Express website:

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
  masterKey: 'myMasterKey', // Keep this key secret!
  fileKey: 'optionalFileKey',
  serverURL: 'http://localhost:1337/parse' // Don't forget to change to https if needed
});

// Serve the Parse API on the /parse URL prefix
app.use('/parse', api);

app.listen(1337, function() {
  console.log('parse-server-example running on port 1337.');
});
```

### Standalone Parse Server

Parse Server can also run as a standalone API server.
You can configure Parse Server with a configuration file, arguments and environment variables.

To start the server:

`npm start -- --appId MYAPP --masterKey MASTER_KEY --serverURL http://localhost:1337/parse`.

To get more help for running the parse-server standalone, you can run:

`$ npm start -- --help`

The standalone API server supports loading a configuration file in JSON format:

`$ npm start -- path/to/your/config.json`

The default port is 1337, to use a different port set the PORT environment variable:

`$ PORT=8080 npm start -- path/to/your/config.json`

The standalone Parse Server can be configured using [environment variables](#configuration).

Please refer to the [configuration section](#configuration) or help;

To get more help for running the parse-server standalone, you can run:

`$ npm start -- --help`

The standalone API server supports loading a configuration file in JSON format:

`$ npm start -- path/to/your/config.json`

The default port is 1337, to use a different port set the `--port` option:

`$ npm start -- --port=8080 path/to/your/config.json`

Please refer to the [configuration section](#configuration) or help;

You can also install Parse Server globally:

`$ npm install -g parse-server`

Now you can just run `$ parse-server` from your command line.


## Documentation

The full documentation for Parse Server is available in the [wiki](https://github.com/ParsePlatform/parse-server/wiki). The [Parse Server guide](https://github.com/ParsePlatform/parse-server/wiki/Parse-Server-Guide) is a good place to get started. If you're interested in developing for Parse Server, the [Development guide](https://github.com/ParsePlatform/parse-server/wiki/Development-Guide) will help you get set up.

#### Migrating an Existing Parse App

The hosted version of Parse will be fully retired on January 28th, 2017. If you are planning to migrate an app, you need to begin work as soon as possible. There are a few areas where Parse Server does not provide compatibility with the hosted version of Parse. Learn more in the [Migration guide](https://github.com/ParsePlatform/parse-server/wiki/Migrating-an-Existing-Parse-App).

### Configuration

The following options can be passed to the `ParseServer` object during initialization. Alternatively, you can use the `PARSE_SERVER_OPTIONS` environment variable set to the JSON of your configuration.

#### Basic options

* `databaseURI` (required) - The connection string for your database, i.e. `mongodb://user:pass@host.com/dbname`
* `appId` (required) - The application id to host with this server instance
* `masterKey` (required) - The master key to use for overriding ACL security
* `cloud` - The absolute path to your cloud code main.js file
* `fileKey` - For migrated apps, this is necessary to provide access to files already hosted on Parse.
* `facebookAppIds` - An array of valid Facebook application IDs.
* `serverURL` - URL which will be used by Cloud Code functions to make requests against.
* `push` - Configuration options for APNS and GCM push. See the [wiki entry](https://github.com/ParsePlatform/parse-server/wiki/Push).

#### Client key options

The client keys used with Parse are no longer necessary with Parse Server. If you wish to still require them, perhaps to be able to refuse access to older clients, you can set the keys at initialization time. Setting any of these keys will require all requests to provide one of the configured keys.

* `clientKey`
* `javascriptKey`
* `restAPIKey`
* `dotNetKey`

#### Advanced options

* `filesAdapter` - The default behavior (GridStore) can be changed by creating an adapter class (see [`FilesAdapter.js`](https://github.com/ParsePlatform/parse-server/blob/master/src/Adapters/Files/FilesAdapter.js))
* `databaseAdapter` (unfinished) - The backing store can be changed by creating an adapter class (see `DatabaseAdapter.js`)
* `loggerAdapter` - The default behavior/transport (File) can be changed by creating an adapter class (see [`LoggerAdapter.js`](https://github.com/ParsePlatform/parse-server/blob/master/src/Adapters/Logger/LoggerAdapter.js))
* `enableAnonymousUsers` - Defaults to true. Set to false to disable anonymous users.
* `allowClientClassCreation` - Defaults to true. Set to false to disable client class creation.
* `oauth` - Used to configure support for [3rd party authentication](https://github.com/ParsePlatform/parse-server/wiki/Parse-Server-Guide#oauth).
* `maxUploadSize` - Defaults to 20mb. Max file size for uploads

#### Using environment variables

You may also configure the Parse Server using environment variables:

```js
PARSE_SERVER_DATABASE_URI
PARSE_SERVER_CLOUD_CODE_MAIN
PARSE_SERVER_COLLECTION_PREFIX
PARSE_SERVER_APPLICATION_ID // required
PARSE_SERVER_MASTER_KEY // required
PARSE_SERVER_CLIENT_KEY
PARSE_SERVER_REST_API_KEY
PARSE_SERVER_DOTNET_KEY
PARSE_SERVER_JAVASCRIPT_KEY
PARSE_SERVER_DOTNET_KEY
PARSE_SERVER_FILE_KEY
PARSE_SERVER_FACEBOOK_APP_IDS // string of comma separated list
PARSE_SERVER_MAX_UPLOAD_SIZE

```

## Contributing

We really want Parse to be yours, to see it grow and thrive in the open source community. Please see the [Contributing to Parse Server guide](CONTRIBUTING.md).
