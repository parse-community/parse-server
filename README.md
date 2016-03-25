![Parse Server logo](.github/parse-server-logo.png?raw=true)

[![Build Status](https://img.shields.io/travis/ParsePlatform/parse-server/master.svg?style=flat)](https://travis-ci.org/ParsePlatform/parse-server)
[![Coverage Status](https://img.shields.io/codecov/c/github/ParsePlatform/parse-server/master.svg)](https://codecov.io/github/ParsePlatform/parse-server?branch=master)
[![npm version](https://img.shields.io/npm/v/parse-server.svg?style=flat)](https://www.npmjs.com/package/parse-server)

Parse Server is an [open source version of the Parse backend](http://blog.parse.com/announcements/introducing-parse-server-and-the-database-migration-tool/) that can be deployed to any infrastructure that can run Node.js.

Parse Server works with the Express web application framework. It can be added to existing web applications, or run by itself.

# Getting Started

The fastest and easiest way to get started is to run MongoDB and Parse Server locally.

## Running Parse Server locally

```
$ npm install -g parse-server mongodb-runner
$ mongodb-runner start
$ parse-server --appId APPLICATION_ID --masterKey MASTER_KEY
```

You can use any arbitrary string as your application id and master key. These will be used by your clients to authenticate with the Parse Server.

That's it! You are now running a standalone version of Parse Server on your machine.

**Using a remote MongoDB?** Pass the  `--databaseURI DATABASE_URI` parameter when starting `parse-server`. Learn more about configuring Parse Server [here](#configuration). For a full list of available options, run `parse-server --help`.

### Saving your first object

Now that you're running Parse Server, it is time to save your first object. We'll use the [REST API](https://parse.com/docs/rest/guide), but you can easily do the same using any of the [Parse SDKs](https://parseplatform.github.io/#sdks). Run the following:

```bash
curl -X POST \
-H "X-Parse-Application-Id: APPLICATION_ID" \
-H "Content-Type: application/json" \
-d '{"score":1337,"playerName":"Sean Plott","cheatMode":false}' \
http://localhost:1337/parse/classes/GameScore
```

You should get a response similar to this:

```js
{
  "objectId": "2ntvSpRGIK",
  "createdAt": "2016-03-11T23:51:48.050Z"
}
```

You can now retrieve this object directly (make sure to replace `2ntvSpRGIK` with the actual `objectId` you received when the object was created):

```bash
$ curl -X GET \
  -H "X-Parse-Application-Id: APPLICATION_ID" \
  http://localhost:1337/parse/classes/GameScore/2ntvSpRGIK
```
```json
// Response
{
  "objectId": "2ntvSpRGIK",
  "score": 1337,
  "playerName": "Sean Plott",
  "cheatMode": false,
  "updatedAt": "2016-03-11T23:51:48.050Z",
  "createdAt": "2016-03-11T23:51:48.050Z"
}
```

Keeping tracks of individual object ids is not ideal, however. In most cases you will want to run a query over the collection, like so:

```
$ curl -X GET \
  -H "X-Parse-Application-Id: APPLICATION_ID" \
  http://localhost:1337/parse/classes/GameScore
```
```json
// The response will provide all the matching objects within the `results` array:
{
  "results": [
    {
      "objectId": "2ntvSpRGIK",
      "score": 1337,
      "playerName": "Sean Plott",
      "cheatMode": false,
      "updatedAt": "2016-03-11T23:51:48.050Z",
      "createdAt": "2016-03-11T23:51:48.050Z"
    }
  ]
}

```

To learn more about using saving and querying objects on Parse Server, check out the [Parse documentation](https://parse.com/docs).

### Connect your app to Parse Server

Parse provides SDKs for all the major platforms. Refer to the Parse Server guide to [learn how to connect your app to Parse Server](https://github.com/ParsePlatform/parse-server/wiki/Parse-Server-Guide#using-parse-sdks-with-parse-server).

## Running Parse Server elsewhere

Once you have a better understanding of how the project works, please refer to the [Parse Server wiki](https://github.com/ParsePlatform/parse-server/wiki) for in-depth guides to deploy Parse Server to major infrastructure providers. Read on to learn more about additional ways of running Parse Server.

### Parse Server Sample Application

We have provided a basic [Node.js application](https://github.com/ParsePlatform/parse-server-example) that uses the Parse Server module on Express and can be easily deployed to various infrastructure providers:

* [Heroku and mLab](https://github.com/ParsePlatform/parse-server/wiki/Deploying-Parse-Server#deploying-to-heroku-and-mLab)
* [AWS and Elastic Beanstalk](http://mobile.awsblog.com/post/TxCD57GZLM2JR/How-to-set-up-Parse-Server-on-AWS-using-AWS-Elastic-Beanstalk)
* [Digital Ocean](https://www.digitalocean.com/community/tutorials/how-to-run-parse-server-on-ubuntu-14-04)
* [NodeChef](https://nodechef.com/blog/post/6/migrate-from-parse-to-nodechef%E2%80%99s-managed-parse-server)
* [Google App Engine](https://medium.com/@justinbeckwith/deploying-parse-server-to-google-app-engine-6bc0b7451d50)
* [Microsoft Azure](https://azure.microsoft.com/en-us/blog/azure-welcomes-parse-developers/)
* [Pivotal Web Services](https://github.com/cf-platform-eng/pws-parse-server)
* [Back4app](http://blog.back4app.com/2016/03/01/quick-wizard-migration/)

### Parse Server + Express

You can also create an instance of Parse Server, and mount it on a new or existing Express website:

```js
var express = require('express');
var ParseServer = require('parse-server').ParseServer;
var app = express();

var api = new ParseServer({
  databaseURI: 'mongodb://localhost:27017/dev', // Connection string for your MongoDB database
  cloud: '/home/myApp/cloud/main.js', // Absolute path to your Cloud Code
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

For a full list of available options, run `parse-server --help`.

# Documentation

The full documentation for Parse Server is available in the [wiki](https://github.com/ParsePlatform/parse-server/wiki). The [Parse Server guide](https://github.com/ParsePlatform/parse-server/wiki/Parse-Server-Guide) is a good place to get started. If you're interested in developing for Parse Server, the [Development guide](https://github.com/ParsePlatform/parse-server/wiki/Development-Guide) will help you get set up.

## Migrating an Existing Parse App

The hosted version of Parse will be fully retired on January 28th, 2017. If you are planning to migrate an app, you need to begin work as soon as possible. There are a few areas where Parse Server does not provide compatibility with the hosted version of Parse. Learn more in the [Migration guide](https://github.com/ParsePlatform/parse-server/wiki/Migrating-an-Existing-Parse-App).

## Configuration

Parse Server can be configured using the following options. You may pass these as parameters when running a standalone `parse-server`, or by loading a configuration file in JSON format using `parse-server path/to/configuration.json`. If you're using Parse Server on Express, you may also pass these to the `ParseServer` object as options.

For the full list of available options, run `parse-server --help`.

#### Basic options

* `appId` **(required)** - The application id to host with this server instance. You can use any arbitrary string. For migrated apps, this should match your hosted Parse app.
* `masterKey` **(required)** - The master key to use for overriding ACL security.  You can use any arbitrary string. Keep it secret! For migrated apps, this should match your hosted Parse app.
* `databaseURI` **(required)** - The connection string for your database, i.e. `mongodb://user:pass@host.com/dbname`.
* `port` - The default port is 1337, specify this parameter to use a different port.
* `serverURL` - URL to your Parse Server (don't forget to specify http:// or https://). This URL will be used when making requests to Parse Server from Cloud Code.
* `cloud` - The absolute path to your cloud code `main.js` file.
* `push` - Configuration options for APNS and GCM push. See the [Push Notifications wiki entry](https://github.com/ParsePlatform/parse-server/wiki/Push).

#### Client key options

The client keys used with Parse are no longer necessary with Parse Server. If you wish to still require them, perhaps to be able to refuse access to older clients, you can set the keys at initialization time. Setting any of these keys will require all requests to provide one of the configured keys.

* `clientKey`
* `javascriptKey`
* `restAPIKey`
* `dotNetKey`

#### Advanced options

* `fileKey` - For migrated apps, this is necessary to provide access to files already hosted on Parse.
* `allowClientClassCreation` - Set to false to disable client class creation. Defaults to true.
* `enableAnonymousUsers` - Set to false to disable anonymous users. Defaults to true.
* `oauth` - Used to configure support for [3rd party authentication](https://github.com/ParsePlatform/parse-server/wiki/Parse-Server-Guide#oauth).
* `facebookAppIds` - An array of valid Facebook application IDs that users may authenticate with.
* `mountPath` - Mount path for the server. Defaults to `/parse`.
* `filesAdapter` - The default behavior (GridStore) can be changed by creating an adapter class (see [`FilesAdapter.js`](https://github.com/ParsePlatform/parse-server/blob/master/src/Adapters/Files/FilesAdapter.js)).
* `maxUploadSize` - Max file size for uploads. Defaults to 20 MB.
* `loggerAdapter` - The default behavior/transport (File) can be changed by creating an adapter class (see [`LoggerAdapter.js`](https://github.com/ParsePlatform/parse-server/blob/master/src/Adapters/Logger/LoggerAdapter.js)).
* `databaseAdapter` - The backing store can be changed by creating an adapter class (see `DatabaseAdapter.js`). Defaults to `MongoStorageAdapter`.

##### Email verification and password reset

Verifying user email addresses and enabling password reset via email requries an email adapter. As part of the `parse-server` package we provide an adapter for sending email through Mailgun. To use it, sign up for Mailgun, and add this to your initialization code:

```js
var server = ParseServer({
  ...otherOptions,
  // Enable email verification
  verifyUserEmails: true,
  // The public URL of your app.
  // This will appear in the link that is used to verify email addresses and reset passwords.
  publicServerURL: 'https://example.com',
  // Your apps name. This will appear in the subject and body of the emails that are sent.
  appName: 'Parse App',
  // The email adapter
  emailAdapter: {
    module: 'parse-server-simple-mailgun-adapter',
    options: {
      // The address that your emails come from
      fromAddress: 'parse@example.com',
      // Your domain from mailgun.com
      domain: 'example.com',
      // Your API key from mailgun.com
      apiKey: 'key-mykey',
    }
  }
});
```

You can also use other email adapters contributed by the community such as [parse-server-sendgrid-adapter](https://www.npmjs.com/package/parse-server-sendgrid-adapter).

### Using environment variables to configure Parse Server

You may configure the Parse Server using environment variables:

```bash
PORT
PARSE_SERVER_APPLICATION_ID
PARSE_SERVER_MASTER_KEY
PARSE_SERVER_DATABASE_URI
PARSE_SERVER_URL
PARSE_SERVER_CLOUD_CODE_MAIN
```

The default port is 1337, to use a different port set the PORT environment variable:

```bash
$ PORT=8080 parse-server --appId APPLICATION_ID --masterKey MASTER_KEY
```

For the full list of configurable environment variables, run `parse-server --help`.

### Configuring File Adapters

Parse Server allows developers to choose from several options when hosting files:

* `GridStoreAdapter`, which is backed by MongoDB;
* `S3Adapter`, which is backed by [Amazon S3](https://aws.amazon.com/s3/); or
* `GCSAdapter`, which is backed by [Google Cloud Storage](https://cloud.google.com/storage/)

`GridStoreAdapter` is used by default and requires no setup, but if you're interested in using S3 or Google Cloud Storage, additional configuration information is available in the [Parse Server wiki](https://github.com/ParsePlatform/parse-server/wiki/Configuring-File-Adapters).

# Support

For implementation related questions or technical support, please refer to the [Stack Overflow](http://stackoverflow.com/questions/tagged/parse.com) and [Server Fault](https://serverfault.com/tags/parse) communities.

If you believe you've found an issue with Parse Server, make sure these boxes are checked before [reporting an issue](https://github.com/ParsePlatform/parse-server/issues):

- [ ] You've met the [prerequisites](https://github.com/ParsePlatform/parse-server/wiki/Parse-Server-Guide#prerequisites).

- [ ] You're running the [latest version](https://github.com/ParsePlatform/parse-server/releases) of Parse Server.

- [ ] You've searched through [existing issues](https://github.com/ParsePlatform/parse-server/issues?utf8=%E2%9C%93&q=). Chances are that your issue has been reported or resolved before.

# Contributing

We really want Parse to be yours, to see it grow and thrive in the open source community. Please see the [Contributing to Parse Server guide](CONTRIBUTING.md).
