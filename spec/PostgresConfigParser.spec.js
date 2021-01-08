const parser = require('../lib/Adapters/Storage/Postgres/PostgresConfigParser');
const fs = require('fs');

const queryParamTests = {
  'a=1&b=2': { a: '1', b: '2' },
  'a=abcd%20efgh&b=abcd%3Defgh': { a: 'abcd efgh', b: 'abcd=efgh' },
  'a=1&b&c=true': { a: '1', b: '', c: 'true' },
};

describe('PostgresConfigParser.parseQueryParams', () => {
  it('creates a map from a query string', () => {
    for (const key in queryParamTests) {
      const result = parser.parseQueryParams(key);

      const testObj = queryParamTests[key];

      expect(Object.keys(result).length).toEqual(Object.keys(testObj).length);

      for (const k in result) {
        expect(result[k]).toEqual(testObj[k]);
      }
    }
  });
});

const baseURI = 'postgres://username:password@localhost:5432/db-name';
const testfile = fs.readFileSync('./Dockerfile').toString();
const dbOptionsTest = {};
dbOptionsTest[
  `${baseURI}?ssl=true&binary=true&application_name=app_name&fallback_application_name=f_app_name&poolSize=10`
] = {
  ssl: true,
  binary: true,
  application_name: 'app_name',
  fallback_application_name: 'f_app_name',
  poolSize: 10,
};
dbOptionsTest[`${baseURI}?ssl=&binary=aa`] = {
  binary: false,
};
dbOptionsTest[
  `${baseURI}?ssl=true&ca=./Dockerfile&pfx=./Dockerfile&cert=./Dockerfile&key=./Dockerfile&binary=aa&passphrase=word&secureOptions=20`
] = {
  ssl: {
    ca: testfile,
    pfx: testfile,
    cert: testfile,
    key: testfile,
    passphrase: 'word',
    secureOptions: 20,
  },
  binary: false,
};
dbOptionsTest[
  `${baseURI}?ssl=false&ca=./Dockerfile&pfx=./Dockerfile&cert=./Dockerfile&key=./Dockerfile&binary=aa`
] = {
  ssl: { ca: testfile, pfx: testfile, cert: testfile, key: testfile },
  binary: false,
};
dbOptionsTest[`${baseURI}?rejectUnauthorized=true`] = {
  ssl: { rejectUnauthorized: true },
};
dbOptionsTest[`${baseURI}?max=5&query_timeout=100&idleTimeoutMillis=1000&keepAlive=true`] = {
  max: 5,
  query_timeout: 100,
  idleTimeoutMillis: 1000,
  keepAlive: true,
};

describe('PostgresConfigParser.getDatabaseOptionsFromURI', () => {
  it('creates a db options map from a query string', () => {
    for (const key in dbOptionsTest) {
      const result = parser.getDatabaseOptionsFromURI(key);

      const testObj = dbOptionsTest[key];

      for (const k in testObj) {
        expect(result[k]).toEqual(testObj[k]);
      }
    }
  });

  it('sets the poolSize to 10 if the it is not a number', () => {
    const result = parser.getDatabaseOptionsFromURI(`${baseURI}?poolSize=sdf`);

    expect(result.poolSize).toEqual(10);
  });
});
