![Parse Server logo](https://github.com/parse-community/parse-server/raw/master/.github/parse-server-logo.png)

[![Backers on Open Collective](https://opencollective.com/parse-server/backers/badge.svg)](#backers) [![Sponsors on Open Collective](https://opencollective.com/parse-server/sponsors/badge.svg)](#sponsors)
[![Build Status](https://img.shields.io/travis/parse-community/parse-server/master.svg?style=flat)](https://travis-ci.org/parse-community/parse-server)
[![Coverage Status](https://img.shields.io/codecov/c/github/parse-community/parse-server/master.svg)](https://codecov.io/github/parse-community/parse-server?branch=master)
[![npm version](https://img.shields.io/npm/v/parse-server.svg?style=flat)](https://www.npmjs.com/package/parse-server)
[![Join The Conversation](https://img.shields.io/discourse/https/community.parseplatform.org/topics.svg)](https://community.parseplatform.org/c/parse-server)
[![Greenkeeper badge](https://badges.greenkeeper.io/parse-community/parse-server.svg)](https://greenkeeper.io/)
[![Twitter Follow](https://img.shields.io/twitter/follow/ParsePlatform.svg?label=Follow%20us%20on%20Twitter&style=social)](https://twitter.com/intent/follow?screen_name=ParsePlatform)

[![](https://img.shields.io/badge/mongodb-3.2-green.svg?logo=mongodb&style=flat)]()
[![](https://img.shields.io/badge/mongodb-3.4-green.svg?logo=mongodb&style=flat)]()
[![](https://img.shields.io/badge/mongodb-3.6-green.svg?logo=mongodb&style=flat)]()
[![](https://img.shields.io/badge/mongodb-4.0-green.svg?logo=mongodb&style=flat)]()

Parse Server is an [open source version of the Parse backend](http://blog.parseplatform.org/announcements/introducing-parse-server-and-the-database-migration-tool/) that can be deployed to any infrastructure that can run Node.js.

Parse Server works with the Express web application framework. It can be added to existing web applications, or run by itself.

The full documentation for Parse Server is available in the [wiki](https://github.com/parse-community/parse-server/wiki). The [Parse Server guide](http://docs.parseplatform.org/parse-server/guide/) is a good place to get started. An [API reference](http://parseplatform.org/parse-server/api/) is also available. If you're interested in developing for Parse Server, the [Development guide](http://docs.parseplatform.org/parse-server/guide/#development-guide) will help you get set up.

- [Getting Started](#getting-started)
    - [Running Parse Server](#running-parse-server)
        - [Locally](#locally)
        - [Docker](#inside-a-docker-container)
        - [Saving an Object](#saving-your-first-object)
        - [Connect an SDK](#connect-your-app-to-parse-server)
    - [Running elsewhere](#running-parse-server-elsewhere)
        - [Sample Application](#parse-server-sample-application)
        - [Parse Server + Express](#parse-server--express)
    - [Configuration](#configuration)
        - [Basic Options](#basic-options)
        - [Client Key Options](#client-key-options)
        - [Email Verification & Password Reset](#email-verification-and-password-reset)
        - [Using Environment Variables](#using-environment-variables-to-configure-parse-server)
        - [Available Adapters](#available-adapters)
        - [Configuring File Adapters](#configuring-file-adapters)
        - [Logging](#logging)
- [Live Queries](#live-queries)
- [GraphQL](#graphql)
- [Upgrading to 3.0.0](#upgrading-to-300)
- [Support](#support)
- [Ride the Bleeding Edge](#want-to-ride-the-bleeding-edge)
- [Contributing](#contributing)
- [Backers](#backers)
- [Sponsors](#sponsors)

# Getting Started

The fastest and easiest way to get started is to run MongoDB and Parse Server locally.

## Running Parse Server

### Locally
```
$ npm install -g parse-server mongodb-runner
$ mongodb-runner start
$ parse-server --appId APPLICATION_ID --masterKey MASTER_KEY --databaseURI mongodb://localhost/test
```
***Note:*** *If installation with* `-g` *fails due to permission problems* (`npm ERR! code 'EACCES'`), *please refer to [this link](https://docs.npmjs.com/getting-started/fixing-npm-permissions).*


### Inside a Docker container
```
$ git clone https://github.com/parse-community/parse-server
$ cd parse-server
$ docker build --tag parse-server .
$ docker run --name my-mongo -d mongo
$ docker run --name my-parse-server --link my-mongo:mongo -d parse-server --appId APPLICATION_ID --masterKey MASTER_KEY --databaseURI mongodb://mongo/test
```

You can use any arbitrary string as your application id and master key. These will be used by your clients to authenticate with the Parse Server.

That's it! You are now running a standalone version of Parse Server on your machine.

**Using a remote MongoDB?** Pass the  `--databaseURI DATABASE_URI` parameter when starting `parse-server`. Learn more about configuring Parse Server [here](#configuration). For a full list of available options, run `parse-server --help`.

### Saving your first object

Now that you're running Parse Server, it is time to save your first object. We'll use the [REST API](http://docs.parseplatform.org/rest/guide), but you can easily do the same using any of the [Parse SDKs](http://parseplatform.org/#sdks). Run the following:

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

To learn more about using saving and querying objects on Parse Server, check out the [Parse documentation](http://docs.parseplatform.org).

### Connect your app to Parse Server

Parse provides SDKs for all the major platforms. Refer to the Parse Server guide to [learn how to connect your app to Parse Server](https://docs.parseplatform.org/parse-server/guide/#using-parse-sdks-with-parse-server).

## Running Parse Server elsewhere

Once you have a better understanding of how the project works, please refer to the [Parse Server wiki](https://github.com/parse-community/parse-server/wiki) for in-depth guides to deploy Parse Server to major infrastructure providers. Read on to learn more about additional ways of running Parse Server.

### Parse Server Sample Application

We have provided a basic [Node.js application](https://github.com/parse-community/parse-server-example) that uses the Parse Server module on Express and can be easily deployed to various infrastructure providers:

* [Heroku and mLab](https://devcenter.heroku.com/articles/deploying-a-parse-server-to-heroku)
* [AWS and Elastic Beanstalk](http://mobile.awsblog.com/post/TxCD57GZLM2JR/How-to-set-up-Parse-Server-on-AWS-using-AWS-Elastic-Beanstalk)
* [Google App Engine](https://medium.com/@justinbeckwith/deploying-parse-server-to-google-app-engine-6bc0b7451d50)
* [Microsoft Azure](https://azure.microsoft.com/en-us/blog/azure-welcomes-parse-developers/)
* [SashiDo](https://blog.sashido.io/tag/migration/)
* [Digital Ocean](https://www.digitalocean.com/community/tutorials/how-to-run-parse-server-on-ubuntu-14-04)
* [Pivotal Web Services](https://github.com/cf-platform-eng/pws-parse-server)
* [Back4app](http://blog.back4app.com/2016/03/01/quick-wizard-migration/)
* [Glitch](https://glitch.com/edit/#!/parse-server)
* [Flynn](https://flynn.io/blog/parse-apps-on-flynn)

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

For a full list of available options, run `parse-server --help` or take a look at [Parse Server Configurations](http://parseplatform.org/parse-server/api/master/ParseServerOptions.html).

## Configuration

Parse Server can be configured using the following options. You may pass these as parameters when running a standalone `parse-server`, or by loading a configuration file in JSON format using `parse-server path/to/configuration.json`. If you're using Parse Server on Express, you may also pass these to the `ParseServer` object as options.

For the full list of available options, run `parse-server --help` or take a look at [Parse Server Configurations](http://parseplatform.org/parse-server/api/master/ParseServerOptions.html).

### Basic options

* `appId` **(required)** - The application id to host with this server instance. You can use any arbitrary string. For migrated apps, this should match your hosted Parse app.
* `masterKey` **(required)** - The master key to use for overriding ACL security.  You can use any arbitrary string. Keep it secret! For migrated apps, this should match your hosted Parse app.
* `databaseURI` **(required)** - The connection string for your database, i.e. `mongodb://user:pass@host.com/dbname`. Be sure to [URL encode your password](https://app.zencoder.com/docs/guides/getting-started/special-characters-in-usernames-and-passwords) if your password has special characters.
* `port` - The default port is 1337, specify this parameter to use a different port.
* `serverURL` - URL to your Parse Server (don't forget to specify http:// or https://). This URL will be used when making requests to Parse Server from Cloud Code.
* `cloud` - The absolute path to your cloud code `main.js` file.
* `push` - Configuration options for APNS and GCM push. See the [Push Notifications quick start](http://docs.parseplatform.org/parse-server/guide/#push-notifications_push-notifications-quick-start).

### Client key options

The client keys used with Parse are no longer necessary with Parse Server. If you wish to still require them, perhaps to be able to refuse access to older clients, you can set the keys at initialization time. Setting any of these keys will require all requests to provide one of the configured keys.

* `clientKey`
* `javascriptKey`
* `restAPIKey`
* `dotNetKey`

### Email verification and password reset

Verifying user email addresses and enabling password reset via email requires an email adapter. As part of the `parse-server` package we provide an adapter for sending email through Mailgun. To use it, sign up for Mailgun, and add this to your initialization code:

```js
var server = ParseServer({
  ...otherOptions,
  // Enable email verification
  verifyUserEmails: true,

  // if `verifyUserEmails` is `true` and
  //     if `emailVerifyTokenValidityDuration` is `undefined` then
  //        email verify token never expires
  //     else
  //        email verify token expires after `emailVerifyTokenValidityDuration`
  //
  // `emailVerifyTokenValidityDuration` defaults to `undefined`
  //
  // email verify token below expires in 2 hours (= 2 * 60 * 60 == 7200 seconds)
  emailVerifyTokenValidityDuration: 2 * 60 * 60, // in seconds (2 hours = 7200 seconds)

  // set preventLoginWithUnverifiedEmail to false to allow user to login without verifying their email
  // set preventLoginWithUnverifiedEmail to true to prevent user from login if their email is not verified
  preventLoginWithUnverifiedEmail: false, // defaults to false

  // The public URL of your app.
  // This will appear in the link that is used to verify email addresses and reset passwords.
  // Set the mount path as it is in serverURL
  publicServerURL: 'https://example.com/parse',
  // Your apps name. This will appear in the subject and body of the emails that are sent.
  appName: 'Parse App',
  // The email adapter
  emailAdapter: {
    module: '@parse/simple-mailgun-adapter',
    options: {
      // The address that your emails come from
      fromAddress: 'parse@example.com',
      // Your domain from mailgun.com
      domain: 'example.com',
      // Your API key from mailgun.com
      apiKey: 'key-mykey',
    }
  },

  // account lockout policy setting (OPTIONAL) - defaults to undefined
  // if the account lockout policy is set and there are more than `threshold` number of failed login attempts then the `login` api call returns error code `Parse.Error.OBJECT_NOT_FOUND` with error message `Your account is locked due to multiple failed login attempts. Please try again after <duration> minute(s)`. After `duration` minutes of no login attempts, the application will allow the user to try login again.
  accountLockout: {
    duration: 5, // duration policy setting determines the number of minutes that a locked-out account remains locked out before automatically becoming unlocked. Set it to a value greater than 0 and less than 100000.
    threshold: 3, // threshold policy setting determines the number of failed sign-in attempts that will cause a user account to be locked. Set it to an integer value greater than 0 and less than 1000.
  },
  // optional settings to enforce password policies
  passwordPolicy: {
    // Two optional settings to enforce strong passwords. Either one or both can be specified.
    // If both are specified, both checks must pass to accept the password
    // 1. a RegExp object or a regex string representing the pattern to enforce
    validatorPattern: /^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.{8,})/, // enforce password with at least 8 char with at least 1 lower case, 1 upper case and 1 digit
    // 2. a callback function to be invoked to validate the password
    validatorCallback: (password) => { return validatePassword(password) },
    validationError: 'Password must contain at least 1 digit.' // optional error message to be sent instead of the default "Password does not meet the Password Policy requirements." message.
    doNotAllowUsername: true, // optional setting to disallow username in passwords
    maxPasswordAge: 90, // optional setting in days for password expiry. Login fails if user does not reset the password within this period after signup/last reset.
    maxPasswordHistory: 5, // optional setting to prevent reuse of previous n passwords. Maximum value that can be specified is 20. Not specifying it or specifying 0 will not enforce history.
    //optional setting to set a validity duration for password reset links (in seconds)
    resetTokenValidityDuration: 24*60*60, // expire after 24 hours
  }
});
```

You can also use other email adapters contributed by the community such as:
- [parse-server-postmark-adapter](https://www.npmjs.com/package/parse-server-postmark-adapter)
- [parse-server-sendgrid-adapter](https://www.npmjs.com/package/parse-server-sendgrid-adapter)
- [parse-server-mandrill-adapter](https://www.npmjs.com/package/parse-server-mandrill-adapter)
- [parse-server-simple-ses-adapter](https://www.npmjs.com/package/parse-server-simple-ses-adapter)
- [parse-server-mailgun-adapter-template](https://www.npmjs.com/package/parse-server-mailgun-adapter-template)
- [parse-server-sendinblue-adapter](https://www.npmjs.com/package/parse-server-sendinblue-adapter)
- [parse-server-mailjet-adapter](https://www.npmjs.com/package/parse-server-mailjet-adapter)
- [simple-parse-smtp-adapter](https://www.npmjs.com/package/simple-parse-smtp-adapter)
- [parse-server-generic-email-adapter](https://www.npmjs.com/package/parse-server-generic-email-adapter)

### Using environment variables to configure Parse Server

You may configure the Parse Server using environment variables:

```bash
PORT
PARSE_SERVER_APPLICATION_ID
PARSE_SERVER_MASTER_KEY
PARSE_SERVER_DATABASE_URI
PARSE_SERVER_URL
PARSE_SERVER_CLOUD
```

The default port is 1337, to use a different port set the PORT environment variable:

```bash
$ PORT=8080 parse-server --appId APPLICATION_ID --masterKey MASTER_KEY
```

For the full list of configurable environment variables, run `parse-server --help` or take a look at [Parse Server Configuration](https://github.com/parse-community/parse-server/blob/master/src/Options/Definitions.js).

### Available Adapters

All official adapters are distributed as scoped pacakges on [npm (@parse)](https://www.npmjs.com/search?q=scope%3Aparse).

Some well maintained adapters are also available on the [Parse Server Modules](https://github.com/parse-server-modules) organization.

You can also find more adapters maintained by the community by searching on [npm](https://www.npmjs.com/search?q=parse-server%20adapter&page=1&ranking=optimal).

### Configuring File Adapters

Parse Server allows developers to choose from several options when hosting files:

* `GridFSBucketAdapter`, which is backed by MongoDB;
* `S3Adapter`, which is backed by [Amazon S3](https://aws.amazon.com/s3/); or
* `GCSAdapter`, which is backed by [Google Cloud Storage](https://cloud.google.com/storage/)

`GridFSBucketAdapter` is used by default and requires no setup, but if you're interested in using S3 or Google Cloud Storage, additional configuration information is available in the [Parse Server guide](http://docs.parseplatform.org/parse-server/guide/#configuring-file-adapters).

### Logging

Parse Server will, by default, log:
* to the console
* daily rotating files as new line delimited JSON

Logs are also viewable in Parse Dashboard.

**Want to log each request and response?** Set the `VERBOSE` environment variable when starting `parse-server`. Usage :-  `VERBOSE='1' parse-server --appId APPLICATION_ID --masterKey MASTER_KEY`

**Want logs to be in placed in a different folder?** Pass the `PARSE_SERVER_LOGS_FOLDER` environment variable when starting `parse-server`. Usage :-  `PARSE_SERVER_LOGS_FOLDER='<path-to-logs-folder>' parse-server --appId APPLICATION_ID --masterKey MASTER_KEY`

**Want to log specific levels?** Pass the `logLevel` parameter when starting `parse-server`. Usage :-  `parse-server --appId APPLICATION_ID --masterKey MASTER_KEY --logLevel LOG_LEVEL`

**Want new line delimited JSON error logs (for consumption by CloudWatch, Google Cloud Logging, etc)?** Pass the `JSON_LOGS` environment variable when starting `parse-server`. Usage :-  `JSON_LOGS='1' parse-server --appId APPLICATION_ID --masterKey MASTER_KEY`

# Live Queries

Live queries are meant to be used in real-time reactive applications, where just using the traditional query paradigm could cause several problems, like increased response time and high network and server usage. Live queries should be used in cases where you need to continuously update a page with fresh data coming from the database, which often happens in (but is not limited to) online games, messaging clients and shared to-do lists.

Take a look at [Live Query Guide](https://docs.parseplatform.org/parse-server/guide/#live-queries), [Live Query Server Setup Guide](https://docs.parseplatform.org/parse-server/guide/#scalability) and [Live Query Protocol Specification](https://github.com/parse-community/parse-server/wiki/Parse-LiveQuery-Protocol-Specification). You can setup a standalone server or multiple instances for scalability (recommended).

# GraphQL

[GraphQL](https://graphql.org/), developed by Facebook, is an open-source data query and manipulation language for APIs. In addition to the traditional REST API, Parse Server automatically generates a GraphQL API based on your current application schema.

## Running

```
$ npm install -g parse-server mongodb-runner
$ mongodb-runner start
$ parse-server --appId APPLICATION_ID --masterKey MASTER_KEY --databaseURI mongodb://localhost/test --mountGraphQL --mountPlayground
```

After starting the server, you can visit http://localhost:1337/playground in your browser to start playing with your GraphQL API.

***Note:*** Do ***NOT*** use --mountPlayground option in production.

## Checking the API health

Run the following:

```graphql
query Health {
  health
}
```

You should receive the following response:

```json
{
  "data": {
    "health": true
  }
}
```

## Creating your first object

Since your application does not have a schema yet, you can use the generic `create` mutation to create your first object. Run the following:

```graphql
mutation CreateObject {
  objects {
    create(className: "GameScore" fields: { score: 1337 playerName: "Sean Plott" cheatMode: false }) {
      objectId
      createdAt
    }
  }
}
```

You should receive a response similar to this:

```json
{
  "data": {
    "objects": {
      "create": {
        "objectId": "7jfBmbGgyF",
        "createdAt": "2019-06-20T23:50:50.825Z"
      }
    }
  }
}
```

## Using automatically generated operations

Parse Server learned from the first object that you created and now you have the `GameScore` class in your schema. You can now start using the automatically generated operations!

Run the following to create a second object:

```graphql
mutation CreateGameScore {
  objects {
    createGameScore(fields: { score: 2558 playerName: "Luke Skywalker" cheatMode: false }) {
      objectId
      createdAt
    }
  }
}
```

You should receive a response similar to this:

```json
{
  "data": {
    "objects": {
      "createGameScore": {
        "objectId": "gySYolb2CL",
        "createdAt": "2019-06-20T23:56:37.114Z"
      }
    }
  }
}
```

You can also run a query to this new class:

```graphql
query FindGameScore {
  objects {
    findGameScore {
      results {
        playerName
        score
      }
    }
  }
}
```

You should receive a response similar to this:

```json
{
  "data": {
    "objects": {
      "findGameScore": {
        "results": [
          {
            "playerName": "Sean Plott",
            "score": 1337
          },
          {
            "playerName": "Luke Skywalker",
            "score": 2558
          }
        ]
      }
    }
  }
}
```

## Learning more

Please look at the right side of your GraphQL Playground. You will see the `DOCS` and `SCHEMA` menus. They are automatically generated by analysing your application schema. Please refer to them and learn more about everything that you can do with your Parse GraphQL API.

Additionally, the [GraphQL Learn Section](https://graphql.org/learn/) is a very good source to start learning about the power of the GraphQL language.

# Upgrading to 3.0.0

Starting 3.0.0, parse-server uses the JS SDK version 2.0.
In short, parse SDK v2.0 removes the backbone style callbacks as well as the Parse.Promise object in favor of native promises.
All the Cloud Code interfaces also have been updated to reflect those changes, and all backbone style response objects are removed and replaced by Promise style resolution.

We have written up a [migration guide](3.0.0.md), hoping this will help you transition to the next major release.

# Support

For implementation related questions or any other questions please refer to [Parse Community's Discourse forum](https://community.parseplatform.org/c/parse-server).


If you believe you've found an issue with Parse Server, make sure these boxes are checked before [reporting an issue](https://github.com/parse-community/parse-server/issues):

- [ ] You've met the [prerequisites](http://docs.parseplatform.org/parse-server/guide/#prerequisites).

- [ ] You're running the [latest version](https://github.com/parse-community/parse-server/releases) of Parse Server.

- [ ] You've searched through [existing issues](https://github.com/parse-community/parse-server/issues?utf8=%E2%9C%93&q=). Chances are that your issue has been reported or resolved before.

# Want to ride the bleeding edge?

It is recommend to use builds deployed npm for many reasons, but if you want to use
the latest not-yet-released version of parse-server, you can do so by depending
directly on this branch:

```
npm install parse-community/parse-server.git#master
```

## Experimenting

You can also use your own forks, and work in progress branches by specifying them:

```
npm install github:myUsername/parse-server#my-awesome-feature
```

And don't forget, if you plan to deploy it remotely, you should run `npm install` with the `--save` option.

# Contributing

We really want Parse to be yours, to see it grow and thrive in the open source community. Please see the [Contributing to Parse Server guide](CONTRIBUTING.md).

# Backers

Support us with a monthly donation and help us continue our activities. [[Become a backer](https://opencollective.com/parse-server#backer)]

<a href="https://opencollective.com/parse-server/backer/0/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/0/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/1/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/1/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/2/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/2/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/3/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/3/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/4/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/4/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/5/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/5/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/6/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/6/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/7/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/7/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/8/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/8/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/9/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/9/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/10/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/10/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/11/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/11/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/12/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/12/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/13/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/13/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/14/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/14/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/15/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/15/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/16/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/16/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/17/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/17/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/18/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/18/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/19/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/19/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/20/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/20/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/21/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/21/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/22/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/22/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/23/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/23/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/24/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/24/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/25/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/25/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/26/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/26/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/27/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/27/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/28/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/28/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/backer/29/website" target="_blank"><img src="https://opencollective.com/parse-server/backer/29/avatar.svg"></a>


# Sponsors

Become a sponsor and get your logo on our README on Github with a link to your site. [[Become a sponsor](https://opencollective.com/parse-server#sponsor)]

<a href="https://opencollective.com/parse-server/sponsor/0/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/0/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/1/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/1/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/2/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/2/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/3/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/3/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/4/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/4/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/5/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/5/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/6/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/6/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/7/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/7/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/8/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/8/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/9/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/9/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/10/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/10/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/11/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/11/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/12/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/12/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/13/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/13/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/14/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/14/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/15/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/15/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/16/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/16/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/17/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/17/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/18/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/18/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/19/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/19/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/20/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/20/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/21/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/21/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/22/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/22/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/23/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/23/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/24/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/24/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/25/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/25/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/26/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/26/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/27/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/27/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/28/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/28/avatar.svg"></a>
<a href="https://opencollective.com/parse-server/sponsor/29/website" target="_blank"><img src="https://opencollective.com/parse-server/sponsor/29/avatar.svg"></a>

-----

As of April 5, 2017, Parse, LLC has transferred this code to the parse-community organization, and will no longer be contributing to or distributing this code.
