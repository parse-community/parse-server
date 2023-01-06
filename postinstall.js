const pkg = require('./package.json');
const fs = require('fs').promises;

const version = parseFloat(process.version.substr(1));
const minimum = parseFloat(pkg.engines.node.match(/\d+/g).join('.'));

module.exports = async function () {
  // support node 14
  const lockFile = await fs.readFile('./package-lock.json').then(res => res.toString());
  const file = lockFile.split('git+ssh://git@github.com/mongodb-js/mongodb-tools.git').join('https://github.com/mongodb-js/mongodb-tools.git');
  await fs.writeFile('./package-lock.json', file);
  const openCollective = `
                  1111111111
               1111111111111111
            1111111111111111111111
          11111111111111111111111111
        111111111111111       11111111
       1111111111111             111111
      1111111111111   111111111   111111
      111111111111   11111111111   111111
     1111111111111   11111111111   111111
     1111111111111   1111111111    111111
     1111111111111111111111111    1111111
     11111111                    11111111
      111111         1111111111111111111
      11111   11111  111111111111111111
       11111         11111111111111111
        111111     111111111111111111
          11111111111111111111111111
            1111111111111111111111
              111111111111111111
                  11111111111


        Thanks for installing parse 🙏
  Please consider donating to our open collective
      to help us maintain this package.

  👉 https://opencollective.com/parse-server

  `;
  process.stdout.write(openCollective);
  if (version >= minimum) {
    process.exit(0);
  }

  const errorMessage = `
    ⚠️  parse-server requires at least node@${minimum}!
    You have node@${version}

  `;

  process.stdout.write(errorMessage);
  process.exit(1);
};
