# Contributing to Parse Server <!-- omit in toc -->

## Table of Contents <!-- omit in toc -->
- [Contributing](#contributing)
  - [Issue vs. Pull Request](#issue-vs-pull-request)
  - [Scope](#scope)
  - [Templates](#templates)
- [Why Contributing?](#why-contributing)
- [Contribution FAQs](#contribution-faqs)
  - [Reviewer Role](#reviewer-role)
  - [Review Feedback](#review-feedback)
  - [Merge Readiness](#merge-readiness)
  - [Review Validity](#review-validity)
  - [Code Ownership](#code-ownership)
  - [Access Permissions](#access-permissions)
  - [New Private Repository](#new-private-repository)
  - [New Public Repository](#new-public-repository)
- [Environment Setup](#environment-setup)
  - [Recommended Tools](#recommended-tools)
  - [Setting up your local machine](#setting-up-your-local-machine)
  - [Good to Know](#good-to-know)
  - [Troubleshooting](#troubleshooting)
  - [Please Do's](#please-dos)
  - [Test against Postgres](#test-against-postgres)
    - [Postgres with Docker](#postgres-with-docker)
- [Breaking Changes](#breaking-changes)
  - [Deprecation Policy](#deprecation-policy)
- [Feature Considerations](#feature-considerations)
  - [Security Checks](#security-checks)
    - [Add Security Check](#add-security-check)
    - [Wording Guideline](#wording-guideline)
  - [Parse Error](#parse-error)
  - [Parse Server Configuration](#parse-server-configuration)
- [Pull Request](#pull-request)
  - [Commit Message](#commit-message)
  - [Breaking Change](#breaking-change)
- [Merging](#merging)
  - [Breaking Change](#breaking-change-1)
  - [Reverting](#reverting)
  - [Security Vulnerability](#security-vulnerability)
    - [Local Testing](#local-testing)
    - [Merging](#merging-1)
- [Releasing](#releasing)
  - [General Considerations](#general-considerations)
  - [Major Release / Long-Term-Support](#major-release--long-term-support)
  - [Preparing Release](#preparing-release)
  - [Publishing Release (forward-merge):](#publishing-release-forward-merge)
  - [Publishing Hotfix (back-merge):](#publishing-hotfix-back-merge)
  - [Publishing Major Release (Yearly Release)](#publishing-major-release-yearly-release)
- [Versioning](#versioning)
- [Code of Conduct](#code-of-conduct)

## Contributing

Before you start to code, please open a [new issue](https://github.com/parse-community/parse-server/issues/new/choose) to describe your idea, or search for and continue the discussion in an [existing issue](https://github.com/parse-community/parse-server/issues).

> ⚠️ Please do not post a security vulnerability on GitHub or in the Parse Community Forum. Instead, follow the [Parse Community Security Policy](https://github.com/parse-community/parse-server/security/policy).

Please completely fill out any templates to provide essential information about your new feature or the bug you discovered.

Together we will plan out the best conceptual approach for your contribution, so that your and our time is invested in the best possible approach. The discussion often reveals how to leverage existing features of Parse Server to reach your goal with even less effort and in a more sustainable way.

When you are ready to code, you can find more information about opening a pull request in the [GitHub docs](https://help.github.com/articles/creating-a-pull-request/).

Whether this is your first contribution or you are already an experienced contributor, the Parse Community has your back – don't hesitate to ask for help!

### Issue vs. Pull Request

An issue is required to be linked in every pull request. We understand that no-one likes to create an issue for something that appears to be a simple pull request, but here is why this is beneficial for everyone:

- An issue get more visibility than a pull request as issues can be pinned, receive bounties and it is primarily the issue list that people browse through rather than the more technical pull request list. Visibility is a key aspect so others can weigh in on issues and contribute their opinion.
- The discussion in the issue is different from the discussion in the pull request. The issue discussion is focused on the issue and how to address it, whereas the discussion in the pull request is focused on a specific implemention. An issue may even have multiple pull requests because either the issue requires multiple implementations or multiple pull requests are opened to compare and test different approaches to later decide for one.
- High-level conceptual discussions about the issue should be still available, even if a pull request is closed because its appraoch was discarded. If these discussions are in the pull request instead, they can easily become fragmented over multiple pull requests and issues, which can make it very hard to make sense of all aspects of an issue.

### Scope

An issue and pull request must limit its scope on a distinct issue. Pull requests can only contain changes that are required to address the scoped issue. While it may seem quick and easy to add unrelated changes to the pull request, it can cause singificant complications after merging. Some of the reasons are:

- A pull request corresponds to a single changelog entry. A changelog entry should not describe multiple unrelated changes in one entry for better readability.
- A pull request creates a distinct commit; having an individual commit for each limited scope makes it easier for others to go back in the commit history and debug. Bugs are generally more difficult to identify and fix if there are various unrelated changes merged at once.
- If a pull request needs to be reverted, unrelated changes will be reverted as well. That makes it more complex and time consuming to revert, having to consider its effects and possibly publishing a broken release or requiring a follow-up pull request with code manipulation.

### Templates

You are required to use and completely fill out the templates for new issues and pull requests. We understand that no-one enjoys filling out forms, but here is why this is beneficial for everyone:

- It may take you 30 seconds longer, but will save even more time for everyone else trying to understand your issue.
- It helps to fix issues and merge pull requests faster as reviewers spend less time trying to understand your issue.
- It makes investigations easier when others try to understand your issue and code changes made even years later.

## Why Contributing?

Buy cheap, buy twice. What? No, this is not the Economics 101 class, but the same is true for contributing.

There are two ways of writing a feature or fixing a bug. Sometimes the quick solution is to just write a Cloud Code function that does what you want. Contributing by making the change directly in Parse Server may take a bit longer, but it actually saves you much more time in the long run.

Consider the benefits you get:

- #### 🚀 Higher efficiency
  Your code is examined for efficiency and interoperability with existing features by the community.
- #### 🛡 Stronger security
  Your code is scrutinized for bugs and vulnerabilities and automated checks help to identify security issues that may arise in the future.
- #### 🧬 Continuous improvement
  If your feature is used by others it is likely to be continuously improved and extended by the community.
- #### 💝 Giving back
  You give back to the community that contributed to make the Parse Platform become what it is today and for future developers to come.
- #### 🧑‍🎓 Improving yourself
  You learn to better understand the inner workings of Parse Server, which will help you to write more efficient and resilient code for your own application.

Most importantly, with every contribution you improve your skills so that future contributions take even less time and you get all the benefits above for free — easy choice, right?

## Contribution FAQs

### Reviewer Role

> *Instead of writing review comments back-and-forth, why doesn't the reviewer just write the code themselves?*

A reviewer is already helping you to make a code contribution through their review. A reviewer *may* even help you to write code by actually writing it for you, but is not obliged to do so.

GitHub allows reviewers to suggest and write code changes as part of the review feedback. These code suggestions are likely to contain mistakes due to the lack of code syntax checks when writing code directly on GitHub. You should therefore always review these suggestions before accepting them, ideally in an IDE. If you merge a code suggestion and the CI then fails, take another look at the code change before asking the reviewer for help.

### Review Feedback

> *It takes too much effort to incorporate the review feedback, why why can't you just merge my pull request?*

If you are a new contributor, it's naturally a learning experience for you and therefore takes longer. We welcome contributors of any experience levels and gladly support you in getting familiar with the code base and our quality standards and contribution requirements. In return we expect you to be open to and appreciative of the reviewers' feedback.

In a large pull request, it can be a significant effort to bring it over the finish line. Luckily this is a collaborative environment and others are free to jump in to contribute to the pull request to share the effort. You can either give others access to your fork or they can open their own pull request based on your previous work.

If you are out of resources stay calm, explain your personal constraints (expertise or time) and ask for help. Wasting time by complaining about the amount of review comments will neither use your own time in a meaningful way, nor the time of others who read your complaint.

This is a collaborative enviroment in which everyone works on a common goal - to get a pull request ready for merging. Reviewers are working *with* you to get your pull request ready, *not against you*.

**❗️ Always be mindful that the reviewers' efforts are an integral part of code contribution. Their review is as important as your written code and their review time is a valuable as your coding time.**

### Merge Readiness

> *The feature already works, why do you request more changes instead of just merging my pull request?*

A feature may work for your own use case or in your own environment, but that doesn't necessarily mean that it's ready for merging. Aside from code quality and code style requirements, reviewers also review based on strategic and architectural considerations. It's often easy to just get a feature to work, but it needs to be also maintained in the future, robust therefore well tested and validated, intuitive for other developers to use, well documented, and not cause a forseeable breaking change in the near future.

### Review Validity

> *The reviewer has never worked on the issue and was never part of any previous discussion, why would I care about their opinion?*

It's contrary to an open, collaborative environment to expect others to be involved in an issue or discussion since its beginning. Such a mindset would close out any new views, which are important for a differentiated discussion.

> *The reviewer doesn't have any expertise in that matter, why would I care about their opinion?*

Your arguments must focus on the issue, not on your assumption of someone else's personal experience. We will take immediate and appropriate action in case of personal attacks, regardless of your previous contributions. Personal attacks are not permissible. If you became a victim of personal attacks, you can privately [report](https://docs.github.com/en/communities/maintaining-your-safety-on-github/reporting-abuse-or-spam) the GitHub comment to the Parse Platform PMC.

### Code Ownership

> *Can I open a new pull request based on another author's pull request?*

If your pull request contains work from someone else then you are required to get their permission to use their work in your pull request. Please make sure to observe the [license](LICENSE) for more details. In addition, as an appreciative gesture you should clearly mention that your pull request is based on another pull request with a link in the top-most comment of your pull request. To avoid this issue we encourage contributors to collaborate on a single pull request to preserve the commit history and clearly identify each author's contribution. To do so, you can review the other author's pull request and submit your code suggestions, or ask the original author to grant you write access to their repository to also be able to make commits directly to their pull request.

### Access Permissions

> *Can I get write access to the repository to make changes faster?*

Keeping our products safe and secure is one of your top priorities. Our security policy mandates that write access to repositories is only provided to as few people as necessary. All usual contributions can be made via public pull requests. If you think you need write access, contact the repository team and explain in detail what the constraint is that you are trying to overcome. We want to make contributing for you as easy as possible. If there are any bottlenecks that are slowing you down we are happy to receive your feedback to see where we can improve.

### New Private Repository

> *Can I get a new private repository within the Parse Platform organization to work on some stuff?*

Private repositories are not provided unless there is a significant constraint or requirement that makes it necessary. For example, when collaborating on fixing a security vulnerability we provide private repositories to allow collaborators to share sensitive information within a select group.

### New Public Repository

> *Can I get a new public repository within the Parse Platform organization to work on some stuff?*

First of all, we appreciate your contribution. In rare cases, where we consider it beneficial to the advancement of the repository, a new public repository for a specific purpose may be provided, for example for increased visibility or to provide the organization's GitHub ressources. In other cases, we encourage you to start your contribution in a personal repository of your own GitHub account, and later transfer it to the Parse Platform organization. We will be happy to assist you in the repository transfer.

## Environment Setup

### Recommended Tools

* [Visual Studio Code](https://code.visualstudio.com), the popular IDE.
* [Jasmine Test Explorer](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-jasmine-test-adapter), a very practical test exploration plugin which let you run, debug and see the test results inline.

### Setting up your local machine

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

### Good to Know

* The `lib/` folder is not committed, so never make changes in there.
* Always make changes to files in the `src/` folder.
* All the tests should point to sources in the `lib/` folder.
* The `lib/` folder is produced by `babel` using either the `npm run build`, `npm run watch`, or the `npm run prepare` step.
* The `npm run prepare` step is automatically invoked when your package depends on forked parse-server installed via git for example using `npm install --save git+https://github.com/[username]/parse-server#[branch/commit]`.
* The tests are run against a single server instance. You can change the server configurations using `await reconfigureServer({ ... some configuration })` found in `spec/helper.js`.
* The tests are ran at random.
* Caches and Configurations are reset after every test.
* Users are logged out after every test.
* Cloud Code hooks are removed after every test.
* Database is deleted after every test (indexes are not removed for speed)
* Tests are located in the `spec` folder
* For better test reporting enable `PARSE_SERVER_LOG_LEVEL=debug`

### Troubleshooting

*Question*: I modify the code in the src folder but it doesn't seem to have any effect.<br/>
*Answer*: Check that `npm run watch` is running

*Question*: How do I use breakpoints and debug step by step?<br/>
*Answer*: The easiest way is to install [Jasmine Test Explorer](https://marketplace.visualstudio.com/items?itemName=hbenl.vscode-test-explorer), it will let you run selectively tests and debug them.

*Question*: How do I deploy my forked version on my servers?<br/>
*Answer*: In your `package.json`, update the `parse-server` dependency to `https://github.com/[username]/parse-server#[branch/commit]`. Run `npm install`, commit the changes and deploy to your servers.

*Question*: How do I deploy my forked version using docker?<br/>
*Answer*: In your `package.json`, update the `parse-server` dependency to `https://github.com/[username]/parse-server#[branch/commit]`. Make sure the `npm install` step in your `Dockerfile` is running under non-privileged user for the ``npm run prepare`` step to work correctly. For official node images from hub.docker.com that non-privileged user is `node` with `/home/node` working directory.


### Please Do's

* Begin by reading the [Development Guide](http://docs.parseplatform.org/parse-server/guide/#development-guide) to learn how to get started running the parse-server.
* Take testing seriously! Aim to increase the test coverage with every pull request. To obtain the test coverage of the project, run: `npm run coverage`
* Run the tests for the file you are working on with the following command: `npm test spec/MyFile.spec.js`
* Run the tests for the whole project to make sure the code passes all tests. This can be done by running the test command for a single file but removing the test file argument. The results can be seen at *<PROJECT_ROOT>/coverage/lcov-report/index.html*.
* Lint your code by running `npm run lint` to make sure the code is not going to be rejected by the CI.
* **Do not** publish the *lib* folder.
* Mocks belong in the `spec/support` folder.
* Please consider if any changes to the [docs](http://docs.parseplatform.org) are needed or add additional sections in the case of an enhancement or feature.

### Test against Postgres

If your pull request introduces a change that may affect the storage or retrieval of objects, you may want to make sure it plays nice with Postgres.

* Run the tests against the postgres database with `PARSE_SERVER_TEST_DB=postgres PARSE_SERVER_TEST_DATABASE_URI=postgres://postgres:password@localhost:5432/parse_server_postgres_adapter_test_database npm run testonly`. You'll need to have postgres running on your machine and setup [appropriately](https://github.com/parse-community/parse-server/blob/master/scripts/before_script_postgres.sh) or use [`Docker`](#run-a-parse-postgres-with-docker).
* The Postgres adapter has a special debugger that traces all the sql commands. You can enable it with setting the environment variable `PARSE_SERVER_LOG_LEVEL=debug`
* If your feature is intended to only work with MongoDB, you should disable PostgreSQL-specific tests with:

  - `describe_only_db('mongo')` // will create a `describe` that runs only on mongoDB
  - `it_only_db('mongo')` // will make a test that only runs on mongo
  - `it_exclude_dbs(['postgres'])` // will make a test that runs against all DB's but postgres
* Similarly, if your feature is intended to only work with PostgreSQL, you should disable MongoDB-specific tests with:
 
  - `describe_only_db('postgres')` // will create a `describe` that runs only on postgres
  - `it_only_db('postgres')` // will make a test that only runs on postgres
  - `it_exclude_dbs(['mongo'])` // will make a test that runs against all DB's but mongo

* If your feature is intended to work with MongoDB and PostgreSQL, you can include or exclude tests more granularly with:

  - `it_only_mongodb_version('>=4.4')` // will test with any version of Postgres but only with version >=4.4 of MongoDB; accepts semver notation to specify a version range
  - `it_exclude_mongodb_version('<4.4')` // will test with any version of Postgres and MongoDB, excluding version <4.4 of MongoDB; accepts semver notation to specify a version range
  - `it_only_postgres_version('>=13')` // will test with any version of Mongo but only with version >=13 of Postgres; accepts semver notation to specify a version range
  - `it_exclude_postgres_version('<13')` // will test with any version of Postgres and MongoDB, excluding version <13 of Postgres; accepts semver notation to specify a version range

#### Postgres with Docker

[PostGIS images (select one with v2.2 or higher) on docker dashboard](https://hub.docker.com/r/postgis/postgis) is based off of the official [postgres](https://registry.hub.docker.com/_/postgres/) image and will work out-of-the-box (as long as you create a user with the necessary extensions for each of your Parse databases; see below). To launch the compatible Postgres instance, copy and paste the following line into your shell:

```
docker run -d --name parse-postgres -p 5432:5432 -e POSTGRES_PASSWORD=password --rm postgis/postgis:13-3.2-alpine && sleep 20 && docker exec -it parse-postgres psql -U postgres -c 'CREATE DATABASE parse_server_postgres_adapter_test_database;' && docker exec -it parse-postgres psql -U postgres -c 'CREATE EXTENSION pgcrypto; CREATE EXTENSION postgis;' -d parse_server_postgres_adapter_test_database && docker exec -it parse-postgres psql -U postgres -c 'CREATE EXTENSION postgis_topology;' -d parse_server_postgres_adapter_test_database
```
To stop the Postgres instance:

```
docker stop parse-postgres
```

You can also use the [postgis/postgis:13-3.2-alpine](https://hub.docker.com/r/postgis/postgis) image in a Dockerfile and copy this [script](https://github.com/parse-community/parse-server/blob/master/scripts/before_script_postgres.sh) to the image by adding the following lines:

```
#Install additional scripts. These are run in abc order during initial start
COPY ./scripts/setup-dbs.sh /docker-entrypoint-initdb.d/setup-dbs.sh
RUN chmod +x /docker-entrypoint-initdb.d/setup-dbs.sh
```

Note that the script above will ONLY be executed during initialization of the container with no data in the database, see the official [Postgres image](https://hub.docker.com/_/postgres) for details. If you want to use the script to run again be sure there is no data in the /var/lib/postgresql/data of the container.

## Breaking Changes

Breaking changes should be avoided whenever possible. For a breaking change to be accepted, the benefits of the change have to clearly outweigh the costs of developers having to adapt their deployments. If a breaking change is only cosmetic it will likely be rejected and preferred to become obsolete organically during the course of further development, unless it is required as part of a larger change. Breaking changes should follow the [Deprecation Policy](#deprecation-policy).

Please consider that Parse Server is just one component in a stack that requires attention. A breaking change requires resources and effort to adapt an environment. An unnecessarily high frequency of breaking changes can have detrimental side effects such as:
- "upgrade fatigue" where developers run old versions of Parse Server because they cannot always attend to every update that contains a breaking change
- less secure Parse Server deployments that run on old versions which is contrary to the security evangelism Parse Server intends to facilitate for developers
- less feedback and slower identification of bugs and an overall slow-down of Parse Server development because new versions with breaking changes also include new features we want to get feedback on

### Deprecation Policy

If you change or remove an existing feature that would lead to a breaking change, use the following deprecation pattern:
  - Make the new feature or change optional, if necessary with a new Parse Server option parameter.
  - Use a default value that falls back to existing behavior.
  - Add a deprecation definition in `Deprecator/Deprecations.js` that will output a deprecation warning log message on Parse Server launch, for example:
    > DeprecationWarning: The Parse Server option 'example' will be removed in a future release.

For deprecations that can only be determined ad-hoc during runtime, for example Parse Query syntax deprecations, use the `Deprecator.logRuntimeDeprecation()` method.

Deprecations become breaking changes after notifying developers through deprecation warnings for at least one entire previous major release. For example:
  - `4.5.0` is the current version
  - `4.6.0` adds a new optional feature and a deprecation warning for the existing feature
  - `5.0.0` marks the beginning of logging the deprecation warning for one entire major release
  - `6.0.0` makes the breaking change by removing the deprecation warning and making the new feature replace the existing feature

See the [Deprecation Plan](https://github.com/parse-community/parse-server/blob/master/DEPRECATIONS.md) for an overview of deprecations and planned breaking changes.

## Feature Considerations
### Security Checks

The Parse Server security checks feature warns developers about weak security settings in their Parse Server deployment.

A security check needs to be added for every new feature or enhancement that allows the developer to configure it in a way that weakens security mechanisms or exposes functionality which creates a weak spot for malicious attacks. If you are not sure whether your feature or enhancements requires a security check, feel free to ask.

For example, allowing public read and write to a class may be useful to simplify development but should be disallowed in a production environment.

Security checks are added in [CheckGroups](https://github.com/parse-community/parse-server/tree/master/src/Security/CheckGroups).

#### Add Security Check
Adding a new security check for your feature is easy and fast:
1. Look into [CheckGroups](https://github.com/parse-community/parse-server/tree/master/src/Security/CheckGroups) whether there is an existing `CheckGroup[Category].js` file for the category of check to add. For example, a check regarding the database connection is added to `CheckGroupDatabase.js`.
2. If you did not find a file, duplicate an existing file and replace the category name in `setName()` and the checks in `setChecks()`:
    ```js
    class CheckGroupNewCategory extends CheckGroup {
      setName() {
        return 'House';
      }
      setChecks() {
        return [
          new Check({
            title: 'Door locked',
            warning: 'Anyone can enter your house.',
            solution: 'Lock the door.',
            check: () => {    
              return;     // Example of a passing check
            }
          }),
          new Check({
            title: 'Camera online',
            warning: 'Security camera is offline.',
            solution: 'Check the camera.',
            check: async () => {  
              throw 1;     // Example of a failing check
            }
          }),
        ];
      }
    }
    ```

3. If you added a new file in the previous step, reference the file in [CheckGroups.js](https://github.com/parse-community/parse-server/blob/master/src/Security/CheckGroups/CheckGroups.js), which is the collector of all security checks:
    ```
    export { default as CheckGroupNewCategory } from './CheckGroupNewCategory';
    ```
4. Add a test that covers the new check to [SecurityCheckGroups.js](https://github.com/parse-community/parse-server/blob/master/spec/SecurityCheckGroups.js) for the cases of success and failure.

#### Wording Guideline
Consider the following when adding a new security check:
- *Group.name*: The category name; ends without period as this is a headline.
- *Check.title*: Is the positive hypothesis that should be checked, for example "Door locked" instead of "Door unlocked"; ends without period as this is a title.
- *Check.warning*: The warning if the test fails; ends with period as this is a description.
- *Check.solution*: The recommended solution if the test fails; ends with period as this is an instruction.
- The wordings must not contain any sensitive information such as keys, as the security report may be exposed in logs.
- The wordings should be concise and not contain verbose explanations, for example "Door locked" instead of "Door has been locked securely".
- Do not use pronouns such as "you" or "your" because log files can have various readers with different roles. Do not use pronouns such as "I" or "me" because although we love it dearly, Parse Server is not a human.

### Parse Error

Introducing new Parse Errors requires the following steps:

1. Research whether an existing Parse Error already covers the error scenario. Keep in mind that reusing an already existing Parse Error does not allow to distinguish between scenarios in which the same error is thrown, so it may be necessary to add a new and more specific Parse Error, even though a more general Parse Error already exists.
⚠️ Currently (as of Dec. 2020), there are inconsistencies between the Parse Errors documented in the Parse Guides, coded in the Parse JS SDK and coded in Parse Server, therefore research regarding the availability of error codes has to be conducted in all of these sources.
1. Add the new Parse Error to [/src/ParseError.js](https://github.com/parse-community/Parse-SDK-JS/blob/master/src/ParseError.js) in the Parse JavaScript SDK. This is the primary reference for Parse Errors for the Parse JavaScript SDK and Parse Server.
1. Create a pull request for the Parse JavaScript SDK including the new Parse Errors. The PR needs to be merged and a new Parse JS SDK version needs to be released.
1. Change the Parse JS SDK dependency in [package.json](https://github.com/parse-community/parse-server/blob/master/package.json) of Parse Server to the newly released Parse JS SDK version, so that the new Parse Error is recognized by Parse Server.
1. When throwing the new Parse Error in code, do not hard-code the error code but instead reference the error code from the Parse Error. For example:
    ```javascript
    throw new Parse.Error(Parse.Error.EXAMPLE_ERROR_CODE, 'Example error message.');
    ```
1. Choose a descriptive error message that provdes more details about the specific error scenario. Different error messages may be used for the same error code. For example:
    ```javascript
    throw new Parse.Error(Parse.Error.FILE_SAVE_ERROR, 'The file could not be saved because it exceeded the maximum allowed file size.');
    throw new Parse.Error(Parse.Error.FILE_SAVE_ERROR, 'The file could not be saved because the file format was incorrect.');
    ```
1. Add the new Parse Error to the [docs](https://github.com/parse-community/docs/blob/gh-pages/_includes/common/errors.md).

### Parse Server Configuration

Introducing new [Parse Server configuration][config] parameters requires the following steps:

1. Add parameters definitions in [/src/Options/index.js][config-index].
2. If the new parameter does not have one single value but is a parameter group (an object containing multiple sub-parameters):
   - add the environment variable prefix for the parameter group to `nestedOptionEnvPrefix` in [/resources/buildConfigDefinition.js](https://github.com/parse-community/parse-server/blob/master/resources/buildConfigDefinition.js)
   - add the parameter group type to `nestedOptionTypes` in [/resources/buildConfigDefinition.js](https://github.com/parse-community/parse-server/blob/master/resources/buildConfigDefinition.js)
  
    For example, take a look at the existing Parse Server `security` parameter. It is a parameter group, because it has multiple sub-parameter such as `checkGroups`. Its interface is defined in [index.js][config-index] as `export interface SecurityOptions`. Therefore, the value to add to `nestedOptionTypes` would be `SecurityOptions`, the value to add to `nestedOptionEnvPrefix` would be `PARSE_SERVER_SECURITY_`.

3. Execute `npm run definitions` to automatically create the definitions in [/src/Options/Definitions.js][config-def] and [/src/Options/docs.js][config-docs].
4. Add parameter value validation in [/src/Config.js](https://github.com/parse-community/parse-server/blob/master/src/Config.js).
5. Add test cases to ensure the correct parameter value validation. Parse Server throws an error at launch if an invalid value is set for any configuration parameter.
6. Execute `npm run docs` to generate the documentation in the `/out` directory. Take a look at the documentation whether the description and formatting of the newly introduced parameters is satisfactory.

## Pull Request

### Commit Message

For release automation, the title of pull requests needs to be written in a defined syntax. We loosely follow the [Conventional Commits](https://www.conventionalcommits.org) specification, which defines this syntax:

```
<type>: <summary>
```

The _type_ is the category of change that is made, possible types are:
- `feat` - add a new feature or improve an existing feature
- `fix` - fix a bug
- `refactor` - refactor code without impact on features or performance
- `docs` - add or edit code comments, documentation, GitHub pages
- `style` - edit code style
- `build` - retry failing build and anything build process related
- `perf` - performance optimization
- `ci` - continuous integration
- `test` - tests

The _summary_ is a short change description in present tense, not capitalized, without period at the end. This summary will also be used as the changelog entry.
- It must be short and self-explanatory for a reader who does not see the details of the full pull request description
- It must not contain abbreviations, e.g. instead of `LQ` write `LiveQuery`
- It must use the correct product and feature names as referenced in the documentation, e.g. instead of `Cloud Validator` use `Cloud Function validation`
- In case of a breaking change, the summary must not contain duplicate information that is also in the [BREAKING CHANGE](#breaking-change) chapter of the pull request description. It must not contain a note that it is a breaking change, as this will be automatically flagged as such if the pull request description contains the BREAKING CHANGE chapter.

For example:

```
feat: add handle to door for easy opening
```

Currently, we are not making use of the commit _scope_, which would be written as `<type>(<scope>): <summary>`, that attributes a change to a specific part of the product.

### Breaking Change

If a pull request contains a braking change, the description of the pull request must contain a dedicated chapter at the bottom to indicate this. This is to assist the committer of the pull request to avoid merging a breaking change as non-breaking.

## Merging

The following guide is for anyone who merges a contributor pull request into the working branch, the working branch into a release branch, a release branch into another release branch, or any other direct commits such as hotfixes into release branches or the working branch.

- A contributor pull request must be merged into the working branch using `Squash and Merge`, to create a single commit message that describes the change.
- A release branch or the default branch must be merged into another release branch using `Merge Commit`, to preserve each individual commit message that describes its respective change.
- For changelog generation, only the commit message set when merging the pull request is relevant. The title and description of the GitHub pull request as authored by the contributor have no influence on the changelog generation. However, the title of the GitHub pull request should be used as the commit message. See the following chapters for considerations in special scenarios, e.g. merging a breaking change or reverting a commit.

### Breaking Change

If the pull request contains a breaking change, the commit message must contain the phrase `BREAKING CHANGE`, capitalized and without any formatting, followed by a short description of the breaking change and ideally how the developer should address it, all in a single line. This line should contain more details focusing on the "breaking” aspect of the change and is intended to assist the developer in adapting. Keep it concise, as it will become part of the changelog entry, for example:

  ```
  fix: remove handle from door
  
  BREAKING CHANGE: You cannot open the door anymore by using a handle. See the [#migration guide](http://example.com) for more details.
  ```
  Keep in mind that in a repository with release automation, merging such a commit message will trigger a release with a major version increment.

### Reverting

If the commit reverts a previous commit, use the prefix `revert:`, followed by the header of the reverted commit. In the body of the commit message add `This reverts commit <hash>.`, where the hash is the SHA of the commit being reverted. For example:

  ```
  revert: fix: remove handle from door
  
  This reverts commit 1234567890abcdef.
  ```

⚠️ A `revert` prefix will *always* trigger a release. Generally, a commit that did not trigger a release when it was initially merged should also not trigger a release when it is reverted. For example, do not use the `revert` prefix when reverting a commit that has a `ci` prefix:

  ```
  ci: add something
  ```
  is reverted with:
  ```
  ci: remove something
  ```
  instead of:
  ```
  revert: ci: add something
  
  This reverts commit 1234567890abcdef.
  ```

### Security Vulnerability

#### Local Testing

Fixes for securify vulnerabilities are developed in private forks with a closed audience, inaccessible to the public. A current GitHub limitation does not allow to run CI tests on pull requests in private forks. Whether a pull requests fully passes all CI tests can only be determined by publishing the fix as a public pull request and running the CI. This means the fix and implicitly information about the vulnerabilty are made accessible to the public. This increases the risk that a vulnerability fix is published, but then cannot be merged immediately due to a CI issue. To mitigate that risk, before publishing a vulnerability fix, the following tests needs to be run locally and pass:

- `npm run test` (MongoDB)
- `npm run test` (Postgres)
- `npm run madge:circular` (circular dependencies)
- `npm run lint` (Lint)
- `npm run definitions` (Parse Server options definitions)

#### Merging

A current GitHub limitation does not allow to customize the commit message when merging pull requests of a private fork that was created to fix a security vulnerabilty. Our release automation framework demands a specific commit message syntax which therefore cannot be met. This prohibits to follow the process that GitHub suggest, which is to merge a pull request from a private fork directly to a public branch. Instead, after [local testing](#local-testing), a public pull request needs to be created with the code fix copied over from the private pull request.

This creates a risk that a vulnerability is indirectly disclosed by publishing a pull request with the fix, but the fix cannot be merged due to a CI issue. To mitigate that risk, the pull request title and description should be kept marginal or generic, not hiting to a vulnerabilty or giving any details about the vulnerabilty, until the pull request has been successfully merged.

## Releasing

### General Considerations

- The `package-lock.json` file has to be deleted and recreated by npm from scratch in regular intervals using the `npm i` command. It is not enough to only update the file via automated security pull requests (e.g. dependabot, snyk), that can create inconsistencies between sub-dependencies of a dependency and increase the chances of vulnerabilities. The file should be recreated once every release cycle which is usually monthly.

### Major Release / Long-Term-Support

While the current major version is published on branch `release`, a Long-Term-Support (LTS) version is published on branch `release-#.x.x`, for example `release-4.x.x` for the Parse Server 4.x LTS branch.

### Preparing Release

The following changes are done in the `alpha` branch, before publishing the last `beta` version that will eventually become the major release. This way the changes trickle naturally through all branches and code consistency is ensured among branches.

- Make sure all [deprecations](https://github.com/parse-community/parse-server/blob/alpha/DEPRECATIONS.md) are reflected in code, old code is removed and the deprecations table is updated.
- Add the future LTS branch `release-#.x.x` to the branch list in [release.config.js](https://github.com/parse-community/parse-server/blob/alpha/release.config.js) so that the branch will later be recognized for release automation.

### Publishing Release (forward-merge):

1. Create new temporary branch `build` on branch `beta`.
2. Create PR to merge `build` into `release`:
   - PR title: `build: release`
   - PR description: (leave empty)
3. Resolve any conflicts:
   - For conflicts regarding the package version in `package.json` and `package-lock.json` it doesn't matter which version is chosen, as the version will be set by auto-release in a commit after merging. However, for both files the same version should be chosen when resolving the conflict.
4. Merge PR with a "merge commit", do not "squash and merge":
   - Commit message: (use PR title)
   - Description: (leave empty)
5. Wait for GitHub Action `release-automated` to finish:
   - If GitHub Action fails, investigate why; manual correction may be needed.
6. Pull all remote branches into local branches.
7. Delete temporary branch `build`.
8. Create new temporary branch `build` on branch `alpha`.
9. Create PR to merge `build` into `beta`:
   - PR title: `build: release`
   - PR description: (leave empty)
8. Repeat steps 3-7 for PR from step 9.

### Publishing Hotfix (back-merge):

1. Create PR to merge hotfix PR into `release`:
   - Merge PR following the same rules as any PR would be merged into the working branch `alpha`.
2. Wait for GitHub Action `release-automated` to finish:
   - GitHub Action will fail with error `! [rejected] HEAD -> beta (non-fast-forward)`; this is expected as auto-release currently cannot fully handle back-merging; docker will not publish the new release, so this has to be done manually using the GitHub workflow `release-manual-docker` and entering the version tag that has been created by auto-release.
3. Pull all remote branches into local branches.
4. Create a new temporary branch `backmerge` on branch `release`.
5. Create PR to merge `backmerge` into `beta`:
   - PR title: `refactor: <commit-summary>` where `<commit-summary>` is the commit summary of step 1. The commit type needs to be `refactor`, otherwise the commit will show in the changelog of the `release` branch, once the `beta` branch is merged into release; this would a duplicate entry because the same changelog entry has already been generated when the PR was merged into the `release` branch in step 1.
   - PR description: (leave empty)
6. Resolve any conflicts:
   - During back-merging, usually all changes are preserved; current changes come from the hotfix in the `release` branch, the incoming changes come from the `beta` branch usually being ahead of the `release` branch. This makes back-merging so complex and bug-prone and is the main reason why it should be avoided if possible.
7. Merge PR with "squash and merge", do not do a "merge commit":
   - Commit message: (use PR title)
   - Description: (leave empty)
  
   ℹ️ Merging this PR will not trigger a release; the back-merge will not appear in changelogs of the `beta`, `alpha` branches; the back-merged fix will be an undocumented change of these branches' next releases; if necessary, the change needs to be added manually to the pre-release changelogs *after* the next pre-releases.
8. Delete temporary branch `backmerge`.
10. Create a new temporary branch `backmerge` on branch `beta`.
11. Repeat steps 4-8 to merge PR into `alpha`.

⚠️ Long-term-support branches are excluded from the processes above and handled individually as they do not have pre-releases branches and are not considered part of the current codebase anymore. It may be necessary to significantly adapt a PR for a LTS branch due to the differences in codebase and CI tests. This adaption should be done in advance before merging any related PR, especially for security fixes, as to not publish a vulnerability while it may still take significant time to adapt the fix for the older codebase of a LTS branch.

### Publishing Major Release (Yearly Release)

1. Create LTS branch `release-#.x.x` off the latest version tag on `release` branch.
2. Create temporary branch `build-release` off branch `beta` and create a pull request with `release` as the base branch.
3. Merge branch `build-release` into `release`. Given that there will be breaking changes, a new major release will be created. In the unlikely case that there have been no breaking changes between the previous major release and the upcoming release, a major version increment has to be triggered manually. See the docs of the release automation framework for how to do that.
4. Add newly created LTS branch `release-#.x.x` from step 1 to [Snyk](https://snyk.io) so that Snyk opens pull requests for the LTS branch; remove previously existing LTS branch `release-#.x.x` from Snyk.

## Versioning

> The following versioning system is applied since Parse Server 5.0.0 and does not necessarily apply to previous releases.

Parse Server follows [semantic versioning](https://semver.org) with a flavor of [calendric versioning](https://calver.org). Semantic versioning makes Parse Server easy to upgrade because breaking changes only occur in major releases. Calendric versioning gives an additional sense of how old a Parse Server release is and allows for Long-Term Support of previous major releases.

Example version: `5.0.0-alpha.1`

Syntax: `[major]`**.**`[minor]`**.**`[patch]`**-**`[pre-release-label]`**.**`[pre-release-increment]`

- The `major` version increments with the first release of every year and may include changes that are *not backwards compatible*.
- The `minor` version increments during the year and may include new features or improvements of existing features that are backwards compatible.
- The `patch` version increments during the year and may include bug fixes that are backwards compatible.
- The `pre-release-label` is optional for pre-release versions such as:
  - `-alpha` (likely to contain bugs, likely to change in features until release)
  - `-beta` (likely to contain bugs, no change in features until release)
- The `[pre-release-increment]` is a number that increments with every new version of a pre-release

Exceptions:
- The `major` version may increment during the year in the unlikely event that a breaking change is so urgent that it cannot wait for the next yearly release. An example would be a vulnerability fix that leads to an unavoidable breaking change. However, security requirements depend on the application and not every vulnerability may affect every deployment, depending on the features used. Therefore we usually prefer to deprecate insecure functionality and introduce the breaking change following our [deprecation policy](#deprecation-policy).

## Code of Conduct

This project adheres to the [Contributor Covenant Code of Conduct](https://github.com/parse-community/parse-server/blob/master/CODE_OF_CONDUCT.md). By participating, you are expected to honor this code.

[config]: http://parseplatform.org/parse-server/api/master/ParseServerOptions.html
[config-def]: https://github.com/parse-community/parse-server/blob/master/src/Options/Definitions.js
[config-docs]: https://github.com/parse-community/parse-server/blob/master/src/Options/docs.js
[config-index]: https://github.com/parse-community/parse-server/blob/master/src/Options/index.js
