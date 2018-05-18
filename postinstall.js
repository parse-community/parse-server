const pkg = require('./package.json');

const version = parseFloat(process.version.substr(1));
const minimum = parseFloat(pkg.engines.node.match(/\d+/g).join('.'));

module.exports = function () {
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
