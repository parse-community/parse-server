'use strict';

const CiVersionCheck = require('./CiVersionCheck');
const mongoVersionList = require('mongodb-version-list');
const allNodeVersions = require('all-node-versions');

async function check() {
  // Run checks
  await checkMongoDbVersions();
  await checkNodeVersions();
}

/**
 * Check the MongoDB versions used in test environments.
 */
async function checkMongoDbVersions() {
  const releasedVersions = await new Promise((resolve, reject) => {
    mongoVersionList(function (error, versions) {
      if (error) {
        reject(error);
      }
      resolve(versions);
    });
  });

  await new CiVersionCheck({
    packageName: 'MongoDB',
    packageSupportUrl: 'https://www.mongodb.com/support-policy',
    yamlFilePath: './.github/workflows/ci.yml',
    ciEnvironmentsKeyPath: 'jobs.check-mongo.strategy.matrix.include',
    ciVersionKey: 'MONGODB_VERSION',
    releasedVersions,
    latestComponent: CiVersionCheck.versionComponents.path,
    ignoreReleasedVersions: [
      '<4.0.0', // Versions reached their MongoDB end-of-life support date
      '~4.1.0', // Development release according to MongoDB support
      '~4.3.0', // Development release according to MongoDB support
      '~4.7.0', // Development release according to MongoDB support

      '4.0.26', // Temporarily disabled because not yet available for download via mongodb-runner
    ],
  }).check();
}

/**
 * Check the Nodejs versions used in test environments.
 */
async function checkNodeVersions() {
  const allVersions = await allNodeVersions();
  const releasedVersions = allVersions.versions;

  await new CiVersionCheck({
    packageName: 'Node.js',
    packageSupportUrl: 'https://github.com/nodejs/node/blob/master/CHANGELOG.md',
    yamlFilePath: './.github/workflows/ci.yml',
    ciEnvironmentsKeyPath: 'jobs.check-mongo.strategy.matrix.include',
    ciVersionKey: 'NODE_VERSION',
    releasedVersions,
    latestComponent: CiVersionCheck.versionComponents.minor,
    ignoreReleasedVersions: [
      '<12.0.0', // These versions have reached their end-of-life support date
      '>=13.0.0 <14.0.0', // These versions have reached their end-of-life support date
      '>=15.0.0 <16.0.0', // These versions have reached their end-of-life support date
      '>=17.0.0', // These versions are not officially supported yet
    ],
  }).check();
}

check();
