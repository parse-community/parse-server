const fs = require('fs').promises;
const { exec } = require('child_process');
const core = require('@actions/core');
(async () => {
  const dir = await fs.readdir('./src');
  console.log(dir);
  const [currentDefinitions, currentDocs] = await Promise.all([
    fs.readFile('./src/options/Definitions.js', 'utf8'),
    fs.readFile('./src/options/Docs.js', 'utf8'),
  ]);
  await exec('npm run definitions');
  const [newDefinitions, newDocs] = await Promise.all([
    fs.readFile('./src/options/Definitions.js', 'utf8'),
    fs.readFile('./src/options/Docs.js', 'utf8'),
  ]);
  if (currentDefinitions !== newDefinitions || currentDocs !== newDocs) {
    console.error(
      '\x1b[31m%s\x1b[0m',
      'Definitions files cannot be updated manually. Please update index.js then run npm run definitions to generate definitions.'
    );
    core.setFailed('Definitions files cannot be updated manually. Please update index.js then run npm run definitions to generate definitions.');
    process.exit(1);
  } else {
    process.exit(0);
  }
})();
