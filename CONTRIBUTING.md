### Contributing to Parse Server

#### Pull Requests Welcome!

We really want Parse to be yours, to see it grow and thrive in the open source community.  

##### Parse-server running on master

Get started by cloning the [parser-server-example](https://github.com/parse-community/parse-server-example) repository and running `npm install` inside it. Update `parse-clients-config.json` inside the repo.

Then add parse-server from master branch as a submodule

```
git submodule add https://github.com/parse-community/parse-server

```

Now link parse-server to use the repo instead of the package

```
npm link parse-server ./parse-server
```

##### Please Do's

* Take testing seriously! Aim to increase the test coverage with every pull request.
* Run the tests for the file you are working on with `npm test spec/MyFile.spec.js`
* Run the tests for the whole project and look at the coverage report to make sure your tests are exhaustive by running `npm test` and looking at (project-root)/lcov-report/parse-server/FileUnderTest.js.html
* Lint your code by running `npm run lint` to make sure all your code is not gonna be rejected by the CI.

##### Code of Conduct

This project adheres to the [Open Code of Conduct](http://todogroup.org/opencodeofconduct/#Parse Server/fjm@fb.com). By participating, you are expected to honor this code.
