const semver = require('semver');
const pkg = require('./package.json');

// Get current Node version without leading 'v'
const currentNodeVersion = process.version;
const normalizedNodeVersion = currentNodeVersion.startsWith('v') ? currentNodeVersion.slice(1) : currentNodeVersion;

// Check if current Node version satisfies the engines.node version
const requiredNodeVersion = pkg.engines.node;
const isNodeVersionSatisfied = semver.satisfies(normalizedNodeVersion, requiredNodeVersion);

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
 
 
      Thank you for using Parse Platform 🙏
          https://parseplatform.org
 
Please consider donating to help us maintain
                this package.
👉 https://opencollective.com/parse-server
`;

const errorMessage = `

  Parse Server requires Node.js versions '${requiredNodeVersion}'.
  The current Node version ${currentNodeVersion} is not supported.
`;

function main() {
  process.stdout.write(openCollective);

  if (isNodeVersionSatisfied) {
    process.exit(0);
  }

  process.stdout.write(errorMessage);
  process.exit(1);
}

module.exports = main;
