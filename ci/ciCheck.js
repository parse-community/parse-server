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
  let latestStableVersions = await new Promise((resolve, reject) => {
    exec('m ls', (error, stdout) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(stdout.trim());
    });
  });
  latestStableVersions = latestStableVersions.split('\n').map(version => version.trim());

  await new CiVersionCheck({
    packageName: 'MongoDB',
    packageSupportUrl: 'https://www.mongodb.com/support-policy',
    yamlFilePath: './.github/workflows/ci.yml',
    ciEnvironmentsKeyPath: 'jobs.check-mongo.strategy.matrix.include',
    ciVersionKey: 'MONGODB_VERSION',
    releasedVersions: latestStableVersions,
    latestComponent: CiVersionCheck.versionComponents.patch,
    ignoreReleasedVersions: [
      '<4.2.0', // These versions have reached their end-of-life support date
      '>=4.3.0 <5.0.0', // Unsupported rapid release versions
      '>=5.1.0 <6.0.0', // Unsupported rapid release versions
      '>=6.1.0 <7.0.0', // Unsupported rapid release versions
      '>=7.1.0 <8.0.0', // Unsupported rapid release versions
    ],
  }).check();
}

/**
 * Check the Nodejs versions used in test environments.
 */
async function checkNodeVersions() {
  const allVersions = (await import('all-node-versions')).default;
  const { versions } = await allVersions();
  const nodeVersions = versions.map(version => version.node);

  await new CiVersionCheck({
    packageName: 'Node.js',
    packageSupportUrl: 'https://github.com/nodejs/node/blob/master/CHANGELOG.md',
    yamlFilePath: './.github/workflows/ci.yml',
    ciEnvironmentsKeyPath: 'jobs.check-mongo.strategy.matrix.include',
    ciVersionKey: 'NODE_VERSION',
    releasedVersions: nodeVersions,
    latestComponent: CiVersionCheck.versionComponents.minor,
    ignoreReleasedVersions: [
      '<18.0.0', // These versions have reached their end-of-life support date
      '>=19.0.0 <20.0.0', // These versions have reached their end-of-life support date
      '>=21.0.0', // These versions are not officially supported yet
    ],
  }).check();
}

check();
