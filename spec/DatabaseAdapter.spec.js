'use strict';

let DatabaseAdapter = require('../src/DatabaseAdapter');

describe('DatabaseAdapter', () => {
  it('options and URI are available to adapter', done => {
    DatabaseAdapter.setAppDatabaseURI('optionsTest', 'mongodb://localhost:27017/optionsTest');
    DatabaseAdapter.setAppDatabaseOptions('optionsTest', {foo: "bar"});
    let optionsTestDatabaseConnection = DatabaseAdapter.getDatabaseConnection('optionsTest');

    expect(optionsTestDatabaseConnection).toEqual(jasmine.any(Object));
    expect(optionsTestDatabaseConnection.adapter._mongoOptions).toEqual(jasmine.any(Object));
    expect(optionsTestDatabaseConnection.adapter._mongoOptions.foo).toBe("bar");

    DatabaseAdapter.setAppDatabaseURI('noOptionsTest', 'mongodb://localhost:27017/noOptionsTest');
    let noOptionsTestDatabaseConnection = DatabaseAdapter.getDatabaseConnection('noOptionsTest');

    expect(noOptionsTestDatabaseConnection).toEqual(jasmine.any(Object));
    expect(noOptionsTestDatabaseConnection.adapter._mongoOptions).toEqual(jasmine.any(Object));

    done();
  });
});
