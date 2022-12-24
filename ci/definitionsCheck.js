const fs = require('fs').promises;
const { exec } = require('child_process');
const core = require('@actions/core');
const { nextTick } = require('process');
const { AbortController } = require("node-abort-controller");
(async () => {
  const [currentDefinitions, currentDocs] = await Promise.all([
    fs.readFile('./src/Options/Definitions.js', 'utf8'),
    fs.readFile('./src/Options/docs.js', 'utf8'),
  ]);
  exec('npm run definitions');
  const ac = new AbortController();
  const { signal } = ac;
  const watcher = fs.watch('./src/Options/docs.js', {signal});
  let i = 0;
  // eslint-disable-next-line
  for await (const _ of watcher) {
    i++;
    if (i === 3) {
      ac.abort();
      break;
    }
  }
  await new Promise(resolve => nextTick(resolve));
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
