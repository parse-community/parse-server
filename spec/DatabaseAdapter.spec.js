'use strict';

let DatabaseAdapter = require('../src/DatabaseAdapter');

describe('DatabaseAdapter', () => {
  it('options and URI are available to adapter', done => {
    DatabaseAdapter.setAppDatabaseURI('optionsTest', 'mongodb://localhost:27017/optionsTest');
    DatabaseAdapter.setAppDatabaseOptions('optionsTest', {foo: "bar"});
    let optionsTestDatabaseConnection = DatabaseAdapter.getDatabaseConnection('optionsTest');

    expect(optionsTestDatabaseConnection instanceof Object).toBe(true);
    expect(optionsTestDatabaseConnection.adapter._options instanceof Object).toBe(true);
    expect(optionsTestDatabaseConnection.adapter._options.foo).toBe("bar");

    DatabaseAdapter.setAppDatabaseURI('noOptionsTest', 'mongodb://localhost:27017/noOptionsTest');
    let noOptionsTestDatabaseConnection = DatabaseAdapter.getDatabaseConnection('noOptionsTest');

    expect(noOptionsTestDatabaseConnection instanceof Object).toBe(true);
    expect(noOptionsTestDatabaseConnection.adapter._options instanceof Object).toBe(false);

    done();
  });
});
