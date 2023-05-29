const fs = require('fs').promises;
const { exec } = require('child_process');
const core = require('@actions/core');
const util = require('util');
(async () => {
  const [currentDefinitions, currentDocs] = await Promise.all([
    fs.readFile('./src/Options/Definitions.js', 'utf8'),
    fs.readFile('./src/Options/docs.js', 'utf8'),
  ]);
  const execute = util.promisify(exec);
  await execute('npm run definitions');
  const [newDefinitions, newDocs] = await Promise.all([
    fs.readFile('./src/Options/Definitions.js', 'utf8'),
    fs.readFile('./src/Options/docs.js', 'utf8'),
  ]);
  if (currentDefinitions !== newDefinitions || currentDocs !== newDocs) {
    console.error(
      '\x1b[31m%s\x1b[0m',
      'Definitions files cannot be updated manually. Please update src/Options/index.js then run `npm run definitions` to generate definitions.'
    );
    core.error('Definitions files cannot be updated manually. Please update src/Options/index.js then run `npm run definitions` to generate definitions.');
    process.exit(1);
  } else {
    process.exit(0);
  }
})();
