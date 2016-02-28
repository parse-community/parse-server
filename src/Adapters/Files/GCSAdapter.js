// GCSAdapter
// Store Parse Files in Google Cloud Storage: https://cloud.google.com/storage
import * as gcloud from 'gcloud';
import { FilesAdapter } from './FilesAdapter';

export class GCSAdapter extends FilesAdapter {
  // GCS Project ID and the name of a corresponding Keyfile are required.
  // See https://googlecloudplatform.github.io/gcloud-node/#/docs/master/guides/authentication
  // for more details.
  constructor(
    projectId,
    keyFilename,
    bucket,
    { bucketPrefix = '',
      directAccess = false } = {}
  ) {
    super();

    this._bucket = bucket;
    this._bucketPrefix = bucketPrefix;
    this._directAccess = directAccess;

    let gcsOptions = {
      projectId: projectId,
      keyFilename: keyFilename
    };

    this._gcsClient = new gcloud.storage(gcsOptions);
  }

  // For a given config object, filename, and data, store a file in GCS.
  // Resolves the promise or fails with an error.
  createFile(config, filename, data) {
    return new Promise((resolve, reject) => {
      let file = this._gcsClient.bucket(this._bucket).file(this._bucketPrefix + filename);
      // gcloud supports upload(file) not upload(bytes), so we need to stream.
      var uploadStream = file.createWriteStream();
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
      file.download((err, data) => {
        if (err !== null) {
          return reject(err);
        }
        resolve(data);
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
