// S3Adapter
//
// Stores Parse files in AWS S3.

var AWS = require('aws-sdk');
var path = require('path');

var DEFAULT_REGION = "us-east-1";
var DEFAULT_BUCKET = "parse-files";

// Creates an S3 session.
// Providing AWS access and secret keys is mandatory
// Region and bucket will use sane defaults if omitted
function S3Adapter(accessKey, secretKey, options) {
  options = options || {};

  this.region = options.region || DEFAULT_REGION;
  this.bucket = options.bucket || DEFAULT_BUCKET;
  this.bucketPrefix = options.bucketPrefix || "";
  this.directAccess = options.directAccess || false;

  s3Options = {
    accessKeyId: accessKey,
    secretAccessKey: secretKey,
    params: {Bucket: this.bucket}
  };
  AWS.config.region = this.region;
  this.s3 = new AWS.S3(s3Options);
}

// For a given config object, filename, and data, store a file in S3
// Returns a promise containing the S3 object creation response
S3Adapter.prototype.create = function(config, filename, data) {
  var params = {
    Key: this.bucketPrefix + filename,
    Body: data,
  };
  if (this.directAccess) {
    params.ACL = "public-read"
  }

  return new Promise((resolve, reject) => {
    this.s3.upload(params, (err, data) => {
      if (err !== null) return reject(err);
      resolve(data);
    });
  });
}

// Search for and return a file if found by filename
// Returns a promise that succeeds with the buffer result from S3
S3Adapter.prototype.get = function(config, filename) {
  var params = {Key: this.bucketPrefix + filename};

  return new Promise((resolve, reject) => {
    this.s3.getObject(params, (err, data) => {
      if (err !== null) return reject(err);
      resolve(data.Body);
    });
  });
}

// Generates and returns the location of a file stored in S3 for the given request and
// filename
// The location is the direct S3 link if the option is set, otherwise we serve
// the file through parse-server
S3Adapter.prototype.location = function(config, req, filename) {
  if (this.directAccess) {
    return ('https://' + this.bucket + '.s3.amazonaws.com' + '/' +
      this.bucketPrefix + filename);
  }
  return (req.protocol + '://' + req.get('host') +
    path.dirname(req.originalUrl) + '/' + req.config.applicationId +
    '/' + encodeURIComponent(filename));
}

module.exports = S3Adapter;
