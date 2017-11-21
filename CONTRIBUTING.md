### Contributing to Parse Server

#### Pull Requests Welcome!

We really want Parse to be yours, to see it grow and thrive in the open source community.  

##### Please Do's

* Begin by reading the [Development Guide](http://docs.parseplatform.org/parse-server/guide/#development-guide) to learn how to get started running the parse-server.
* Take testing seriously! Aim to increase the test coverage with every pull request. To obtain the test coverage of the project, run:
    * **Windows**: `npm run coverage:win`
    * **Unix**: `npm run coverage`
* Run the tests for the file you are working on with the following command:
    * **Windows**: `npm run test:win spec/MyFile.spec.js`
    * **Unix**: `npm test spec/MyFile.spec.js`
* Run the tests for the whole project to make sure the code passes all tests. This can be done by running the test command for a single file but removing the test file argument. The results can be seen at *<PROJECT_ROOT>/coverage/lcov-report/index.html*.
* Lint your code by running `npm run lint` to make sure the code is not going to be rejected by the CI.
* **Do not** publish the *lib* folder.

##### Run your tests against Postgres (optional)

If your pull request introduces a change that may affect the storage or retrieval of objects, you may want to make sure it plays nice with Postgres.

* Run the tests against the postgres database with `PARSE_SERVER_TEST_DB=postgres npm test`. You'll need to have postgres running on your machine and setup [appropriately](https://github.com/parse-community/parse-server/blob/master/.travis.yml#L37)
* If your feature is intended to only work with MongoDB, you should disable PostgreSQL-specific tests with:
   
  - `describe_only_db('mongo')` // will create a `describe` that runs only on mongoDB
  - `it_only_db('mongo')` // will make a test that only runs on mongo
  - `it_exclude_dbs(['postgres'])` // will make a test that runs against all DB's but postgres

##### Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](https://github.com/parse-community/parse-server/blob/master/CODE_OF_CONDUCT.md). By participating, you are expected to honor this code.
