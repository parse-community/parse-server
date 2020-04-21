# Contributing to Parse Server

We really want Parse to be yours, to see it grow and thrive in the open source community.

If you are not familiar with Pull Requests and want to know more about them, you can visit the [Creating a pull request](https://help.github.com/articles/creating-a-pull-request/) article. It contains detailed informations about the process.

## Setting up the project for debugging and contributing:

### Recommended setup:

* [vscode](https://code.visualstudio.com), the popular IDE.
* [Jasmine Test Explorer](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-jasmine-test-adapter), a very practical test exploration plugin which let you run, debug and see the test results inline.

### Setting up you local machine:

* [Fork](https://github.com/parse-community/parse-server) this project and clone the fork on your local machine:

```sh
$ git clone https://github.com/parse-community/parse-server
$ cd parse-server # go into the clone directory
$ npm install # install all the node dependencies
$ code . # launch vscode
$ npm run watch # run babel watching for local file changes
```

> To launch VS Code from the terminal with the `code` command you first need to follow the [launching from the command line section](https://code.visualstudio.com/docs/setup/mac#_launching-from-the-command-line) in the VS Code setup documentation.

Once you have babel running in watch mode, you can start making changes to parse-server.

### Good to know:

* The `lib/` folder is not commited, so never make changes in there.
* Always make changes to files in the `src/` folder.
* All the tests should point to sources in the `lib/` folder.

### Troubleshooting:

*Question*: I modify the code in the src folder but it doesn't seem to have any effect.<br/>
*Answer*: Check that `npm run watch` is running

*Question*: How do I use breakpoints and debug step by step?<br/>
*Answer*: The easiest way is to install [Jasmine Test Explorer](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer), it will let you run selectively tests and debug them.

*Question*: How do I deploy my forked version on my servers?<br/>
*Answer*: In your `package.json`, update the `parse-server` dependency to `https://github.com/MY_USERNAME/parse-server#MY_FEATURE`. Run `npm install`, commit the changes and deploy to your servers.


### Please Do's

* Begin by reading the [Development Guide](http://docs.parseplatform.org/parse-server/guide/#development-guide) to learn how to get started running the parse-server.
* Take testing seriously! Aim to increase the test coverage with every pull request. To obtain the test coverage of the project, run: `npm run coverage`
* Run the tests for the file you are working on with the following command: `npm test spec/MyFile.spec.js`
* Run the tests for the whole project to make sure the code passes all tests. This can be done by running the test command for a single file but removing the test file argument. The results can be seen at *<PROJECT_ROOT>/coverage/lcov-report/index.html*.
* Lint your code by running `npm run lint` to make sure the code is not going to be rejected by the CI.
* **Do not** publish the *lib* folder.

### Run your tests against Postgres (optional)

If your pull request introduces a change that may affect the storage or retrieval of objects, you may want to make sure it plays nice with Postgres.

* Run the tests against the postgres database with `PARSE_SERVER_TEST_DB=postgres PARSE_SERVER_TEST_DATABASE_URI=postgres://postgres:password@localhost:5432/parse_server_postgres_adapter_test_database npm run testonly`. You'll need to have postgres running on your machine and setup [appropriately](https://github.com/parse-community/parse-server/blob/master/.travis.yml#L43) or use [`Docker`](#run-a-parse-postgres-with-docker).
* The Postgres adapter has a special debugger that traces all the sql commands. You can enable it with setting the environment variable `PARSE_SERVER_LOG_LEVEL=debug`
* If your feature is intended to only work with MongoDB, you should disable PostgreSQL-specific tests with:

  - `describe_only_db('mongo')` // will create a `describe` that runs only on mongoDB
  - `it_only_db('mongo')` // will make a test that only runs on mongo
  - `it_exclude_dbs(['postgres'])` // will make a test that runs against all DB's but postgres
* Similarly, if your feature is intended to only work with PostgreSQL, you should disable MongoDB-specific tests with:
 
  - `describe_only_db('postgres')` // will create a `describe` that runs only on postgres
  - `it_only_db('postgres')` // will make a test that only runs on postgres
  - `it_exclude_dbs(['mongo'])` // will make a test that runs against all DB's but mongo

#### Run Postgres setup for Parse with Docker

[PostGIS images (select one with v2.2 or higher) on docker dashboard](https://hub.docker.com/r/postgis/postgis) is based off of the official [postgres](https://registry.hub.docker.com/_/postgres/) image and will work out-of-the-box (as long as you create a user with the necessary extensions for each of your Parse databases; see below). To launch the compatible Postgres instance, copy and paste the following line into your shell:

```
docker run -d --name parse-postgres -p 5432:5432 -e POSTGRES_PASSWORD=password --rm postgis/postgis:11-3.0-alpine && sleep 20 && docker exec -it parse-postgres psql -U postgres -c 'CREATE DATABASE parse_server_postgres_adapter_test_database;' && docker exec -it parse-postgres psql -U postgres -c 'CREATE EXTENSION postgis;' -d parse_server_postgres_adapter_test_database && docker exec -it parse-postgres psql -U postgres -c 'CREATE EXTENSION postgis_topology;' -d parse_server_postgres_adapter_test_database
```
To stop the Postgres instance:

```
docker stop parse-postgres
```

You can also use the [postgis/postgis:11-2.5-alpine](https://hub.docker.com/r/postgis/postgis) image in a Dockerfile and copy this [script](https://github.com/parse-community/parse-server/blob/master/scripts/before_script_postgres.sh) to the image by adding the following lines:

```
#Install additional scripts. These are run in abc order during initial start
COPY ./scripts/setup-dbs.sh /docker-entrypoint-initdb.d/setup-dbs.sh
RUN chmod +x /docker-entrypoint-initdb.d/setup-dbs.sh
```

Note that the script above will ONLY be executed during initialization of the container with no data in the database, see the official [Postgres image](https://hub.docker.com/_/postgres) for details. If you want to use the script to run again be sure there is no data in the /var/lib/postgresql/data of the container.

### Generate Parse Server Config Definition

If you want to make changes to [Parse Server Configuration][config] add the desired configuration to [src/Options/index.js][config-index] and run `npm run definitions`. This will output [src/Options/Definitions.js][config-def] and [src/Options/docs.js][config-docs].

To view docs run `npm run docs` and check the `/out` directory.

### Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](https://github.com/parse-community/parse-server/blob/master/CODE_OF_CONDUCT.md). By participating, you are expected to honor this code.

[config]: http://parseplatform.org/parse-server/api/master/ParseServerOptions.html
[config-def]: https://github.com/parse-community/parse-server/blob/master/src/Options/Definitions.js
[config-docs]: https://github.com/parse-community/parse-server/blob/master/src/Options/docs.js
[config-index]: https://github.com/parse-community/parse-server/blob/master/src/Options/index.js
