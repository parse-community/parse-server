// GCSAdapter
// Store Parse Files in Google Cloud Storage: https://cloud.google.com/storage
import { storage } from 'gcloud';
import { FilesAdapter } from './FilesAdapter';
import requiredParameter from '../../requiredParameter';

function requiredOrFromEnvironment(env, name) {
  let environmentVariable = process.env[env];
  if (!environmentVariable) {
    requiredParameter(`GCSAdapter requires an ${name}`);
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

export class GCSAdapter extends FilesAdapter {
  // GCS Project ID and the name of a corresponding Keyfile are required.
  // Unlike the S3 adapter, you must create a new Cloud Storage bucket, as this is not created automatically.
  // See https://googlecloudplatform.github.io/gcloud-node/#/docs/master/guides/authentication
  // for more details.
  constructor(
    projectId = requiredOrFromEnvironment('GCP_PROJECT_ID', 'projectId'),
    keyFilename = requiredOrFromEnvironment('GCP_KEYFILE_PATH', 'keyfile path'),
    bucket = requiredOrFromEnvironment('GCS_BUCKET_NAME', 'bucket name'),
    { bucketPrefix = fromEnvironmentOrDefault('GCS_BUCKET_PREFIX', ''),
      directAccess = fromEnvironmentOrDefault('GCS_DIRECT_ACCESS', false) } = {}) {
    super();

    this._bucket = bucket;
    this._bucketPrefix = bucketPrefix;
    this._directAccess = directAccess;

    let options = {
      projectId: projectId,
      keyFilename: keyFilename
    };

    this._gcsClient = new storage(options);
  }

  // For a given config object, filename, and data, store a file in GCS.
  // Resolves the promise or fails with an error.
  createFile(config, filename, data, contentType) {
    let params = {
      contentType: contentType || 'application/octet-stream'
    };

    return new Promise((resolve, reject) => {
      let file = this._gcsClient.bucket(this._bucket).file(this._bucketPrefix + filename);
      // gcloud supports upload(file) not upload(bytes), so we need to stream.
      var uploadStream = file.createWriteStream(params);
      uploadStream.on('error', (err) => {
        return reject(err);
      }).on('finish', () => {
        // Second call to set public read ACL after object is uploaded.
        if (this._directAccess) {
          file.makePublic((err, res) => {
            if (err !== null) {
              return reject(err);
            }
            resolve();
          });
        } else {
          resolve();
        }
      });
      uploadStream.write(data);
      uploadStream.end();
    });
  }

  // Deletes a file with the given file name.
  // Returns a promise that succeeds with the delete response, or fails with an error.
  deleteFile(config, filename) {
    return new Promise((resolve, reject) => {
      let file = this._gcsClient.bucket(this._bucket).file(this._bucketPrefix + filename);
      file.delete((err, res) => {
        if(err !== null) {
          return reject(err);
        }
        resolve(res);
      });
    });
  }

  // Search for and return a file if found by filename.
  // Returns a promise that succeeds with the buffer result from GCS, or fails with an error.
  getFileData(config, filename) {
    return new Promise((resolve, reject) => {
      let file = this._gcsClient.bucket(this._bucket).file(this._bucketPrefix + filename);
      // Check for existence, since gcloud-node seemed to be caching the result
      file.exists((err, exists) => {
        if (exists) {
          file.download((err, data) => {
            if (err !== null) {
              return reject(err);
            }
            return resolve(data);
          });
        } else {
          reject(err);
        }
      });
    });
  }

  // Generates and returns the location of a file stored in GCS for the given request and filename.
  // The location is the direct GCS link if the option is set,
  // otherwise we serve the file through parse-server.
  getFileLocation(config, filename) {
    if (this._directAccess) {
      return `https://${this._bucket}.storage.googleapis.com/${this._bucketPrefix + filename}`;
    }
    return (config.mount + '/files/' + config.applicationId + '/' + encodeURIComponent(filename));
  }
}

export default GCSAdapter;
