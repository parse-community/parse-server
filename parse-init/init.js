#!/usr/bin/env node

const shell = require("shelljs");
const chalk = require("chalk");
const fs = require("fs");
const inquirer = require('inquirer');
const path = require('path');
const CWD = process.cwd();
const crypto = require('crypto');
const DEFAULT_MONGODB_URI = 'mongodb://127.0.0.1:27017/parse';

let useYarn = false;
if (shell.which("yarn")) {
  useYarn = true;
}

function generateKey() {
  return crypto.randomBytes(16).toString('hex');
}

async function getInstallationsDir() {
  const questions = [
    {
      type: 'input',
      name: 'target_directory',
      message: 'Enter an installation directory',
      default: CWD,
    },
  ];
  const answers = await inquirer.prompt(questions);
  console.log(`This will setup parse-server in ${answers.target_directory}`);
  await confirm(`Do you want to continue?`);
  console.log(`Setting up parse-server in ${answers.target_directory}`);
  return answers;
}

async function getAppConfiguration() {
  const questions = [
    {
      type: 'input',
      name: 'appName',
      message: 'Enter your Application Name',
      validate: (value) => {
        return value && value.length > 0
      }
    },
    {
      type: 'input',
      name: 'appId',
      message: 'Enter your Application Id (leave empty to generate)',
      default: generateKey(),
    },
    {
      type: 'input',
      name: 'masterKey',
      message: 'Enter your Master Key (leave empty to generate)',
      default: generateKey(),
    },
    {
      type: 'input',
      name: 'databaseURI',
      message: 'Enter your Database URL (valid mongodb or postgres)',
      default: DEFAULT_MONGODB_URI,
    }
  ];

  return await inquirer.prompt(questions);
}

async function confirm(message, defaults = true) {
  return inquirer.prompt([
    {
      type: 'confirm',
      name: 'continue',
      message: message,
      default: defaults,
    }
  ]).then(result => {
    if (!result.continue) {
      process.exit(1);
    }
  });
}

(async function main() {
  let { target_directory } = await getInstallationsDir();
  target_directory = path.resolve(target_directory);
  if (!fs.existsSync(target_directory)) {
    shell.mkdir(target_directory);
  }
  if (fs.existsSync(`${target_directory}/package.json`)) {
    await confirm(`package.json exists\nDo you want to continue? ${chalk.red(`this will erase your configuration`)}`, false);
  }

  if (fs.existsSync(`${target_directory}/config.js`)) {
    await confirm(`config.js exists\nDo you want to continue? \n${chalk.red(`this will erase your configuration`)}`, false);
  }
  const config = await getAppConfiguration();
  shell.cd(target_directory);

  const packageContent = { scripts: { start: "parse-server config.js" } };
  fs.writeFileSync(
    target_directory + "/package.json",
    JSON.stringify(packageContent, null, 2) + "\n"
  );

  fs.writeFileSync(
    target_directory + "/config.js",
    `module.exports = ` + JSON.stringify(config, null, 2) + ";\n"
  );

  if (useYarn) {
    shell.exec("yarn add parse-server");
  } else {
    shell.exec("npm install parse-server --save");
  }

  console.log(chalk.green(`parse-server is installed in ${target_directory}!\n`));
  if (useYarn) {
    shell.exec("yarn start");
  } else {
    shell.exec("npm start");
  }
})();
