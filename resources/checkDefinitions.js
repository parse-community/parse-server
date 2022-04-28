const fs = require('fs').promises;
const { exec } = require('child_process');
(async () => {
  const [currentDefinitions, currentDocs] = await Promise.all([
    fs.readFile('./src/options/Definitions.js', 'utf8'),
    fs.readFile('./src/options/Docs.js', 'utf8'),
  ]);
  exec('npm run definitions');
  await new Promise(resolve => setTimeout(resolve, 2000));
  const [nowDefinitions, nowDocs] = await Promise.all([
    fs.readFile('./src/options/Definitions.js', 'utf8'),
    fs.readFile('./src/options/Docs.js', 'utf8'),
  ]);
  if (currentDefinitions !== nowDefinitions || currentDocs !== nowDocs) {
    console.error(
      '\x1b[31m%s\x1b[0m',
      'Definitions files cannot be updated manually. Please update index.js then run npm run definitions to generate definitions.'
    );
    process.exit(1);
  } else {
    process.exit(0);
  }
})();
