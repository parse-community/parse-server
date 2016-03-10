// S3Adapter
//
// Stores Parse files in AWS S3.

import * as AWS from 'aws-sdk';
import { FilesAdapter } from './FilesAdapter';
import requiredParameter from '../../requiredParameter';

const DEFAULT_S3_REGION = "us-east-1";

function requiredOrFromEnvironment(env, name) {
  let environmentVariable = process.env[env];
  if (!environmentVariable) {
    requiredParameter(`S3Adapter requires an ${name}`);
  }
  return environmentVariable;
}

function fromEnvironmentOrDefault(env, defaultValue) {
  let environmentVariable = process.env[env];
  if (environmentVariable) {
    return environmentVariable;
  }
  return defaultValue;
}

export class S3Adapter extends FilesAdapter {
  // Creates an S3 session.
  // Providing AWS access and secret keys is mandatory
  // Region and bucket will use sane defaults if omitted
  constructor(
     accessKey = requiredOrFromEnvironment('S3_ACCESS_KEY', 'accessKey'),
     secretKey = requiredOrFromEnvironment('S3_SECRET_KEY', 'secretKey'),
     bucket = fromEnvironmentOrDefault('S3_BUCKET', undefined),
     { region = fromEnvironmentOrDefault('S3_REGION', DEFAULT_S3_REGION),
       bucketPrefix = fromEnvironmentOrDefault('S3_BUCKET_PREFIX', ''),
       directAccess =  fromEnvironmentOrDefault('S3_DIRECT_ACCESS', false) } = {}) {
    super();
    
    this._region = region;
    this._bucket = bucket;
    this._bucketPrefix = bucketPrefix;
    this._directAccess = directAccess;

    let s3Options = {
      accessKeyId: accessKey,
      secretAccessKey: secretKey,
      params: { Bucket: this._bucket }
    };
    AWS.config._region = this._region;
    this._s3Client = new AWS.S3(s3Options);
    this._hasBucket = false;
  }
  
  createBucket() {
    var promise;
    if (this._hasBucket) {
      promise = Promise.resolve();
    } else {
      promise = new Promise((resolve, reject) => {
        this._s3Client.createBucket(() => {
          this._hasBucket = true;
          resolve();
        });
      }); 
    }
    return promise;
  }

  // For a given config object, filename, and data, store a file in S3
  // Returns a promise containing the S3 object creation response
  createFile(config, filename, data, contentType) {
    let params = {
      Key: this._bucketPrefix + filename,
      Body: data
    };
    if (this._directAccess) {
      params.ACL = "public-read"
    }
    if (contentType) {
      params.ContentType = contentType;
    }
    return this.createBucket().then(() => {
      return new Promise((resolve, reject) => {
        this._s3Client.upload(params, (err, data) => {
          if (err !== null) {
            return reject(err);
          }
          resolve(data);
        });
      });
    });
  }

  deleteFile(config, filename) {
    return this.createBucket().then(() => {
      return new Promise((resolve, reject) => {
        let params = {
          Key: this._bucketPrefix + filename
        };
        this._s3Client.deleteObject(params, (err, data) =>{
          if(err !== null) {
            return reject(err);
          }
          resolve(data);
        });
      });
    });
  }

  // Search for and return a file if found by filename
  // Returns a promise that succeeds with the buffer result from S3
  getFileData(config, filename) {
    let params = {Key: this._bucketPrefix + filename};
    return this.createBucket().then(() => {
      return new Promise((resolve, reject) => {
        this._s3Client.getObject(params, (err, data) => {
          if (err !== null) {
            return reject(err);
          }
          // Something happend here...
          if (data && !data.Body) {
            return reject(data);
          }
          resolve(data.Body);
        });
      });
    });
  }

  // Generates and returns the location of a file stored in S3 for the given request and filename
  // The location is the direct S3 link if the option is set, otherwise we serve the file through parse-server
  getFileLocation(config, filename) {
    if (this._directAccess) {
      return `https://${this._bucket}.s3.amazonaws.com/${this._bucketPrefix + filename}`;
    }
    return (config.mount + '/files/' + config.applicationId + '/' + encodeURIComponent(filename));
  }
}

export default S3Adapter;
