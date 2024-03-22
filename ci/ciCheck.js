'use strict';

const CiVersionCheck = require('./CiVersionCheck');
const { exec } = require('child_process');

async function check() {
  // Run checks
  await checkMongoDbVersions();
  await checkNodeVersions();
}

/**
 * Check the MongoDB versions used in test environments.
 */
async function checkMongoDbVersions() {
  const latestStableVersion = await new Promise((resolve, reject) => {
    exec('m --latest', (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });

  await new CiVersionCheck({
    packageName: 'MongoDB',
    packageSupportUrl: 'https://www.mongodb.com/support-policy',
    yamlFilePath: './.github/workflows/ci.yml',
    ciEnvironmentsKeyPath: 'jobs.check-mongo.strategy.matrix.include',
    ciVersionKey: 'MONGODB_VERSION',
    releasedVersions: [latestStableVersion],
    latestComponent: CiVersionCheck.versionComponents.major,
    ignoreReleasedVersions: [],
  }).check();
}

/**
 * Check the Nodejs versions used in test environments.
 */
async function checkNodeVersions() {
  const allVersions = await import('all-node-versions');
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
      '>=19.0.0', // These versions are not officially supported yet
    ],
  }).check();
}

check();
