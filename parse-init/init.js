#!/usr/bin/env node

const shell = require("shelljs");
const chalk = require("chalk");
const fs = require("fs");
const inquirer = require('inquirer');
const path = require('path');
const CWD = process.cwd();
const crypto = require('crypto');
const DEFAULT_MONGODB_URI = 'mongodb://127.0.0.1:27017/parse';
const CHECK = '✓';

let useYarn = false;
if (shell.which("yarn")) {
  useYarn = true;
}

function generateKey() {
  return crypto.randomBytes(16).toString('hex');
}

function ok(message) {
  console.log(chalk.green(`${CHECK} ${message}`));
}

async function getInstallationsDir() {
  let target_directory;
  if (process.argv.length == 3) {
    target_directory =  process.argv[2];
  } else {
    const answer = await inquirer.prompt([
      {
        type: 'input',
        name: 'target_directory',
        message: 'Enter an installation directory',
        default: CWD,
      },
    ]);
    target_directory = answer.target_directory;
  }
  console.log(`This will setup parse-server in ${target_directory}`);
  await confirm(`Do you want to continue?`);
  console.log(`Setting up parse-server in ${target_directory}`);
  return target_directory;
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
  let target_directory = await getInstallationsDir();
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

  const packageContent = {
    scripts: {
      start: "parse-server config.js"
    }
  };
  fs.writeFileSync(
    target_directory + "/package.json",
    JSON.stringify(packageContent, null, 2) + "\n"
  );

  fs.writeFileSync(
    target_directory + "/config.js",
    `module.exports = ` + JSON.stringify(config, null, 2) + ";\n"
  );

  if (fs.existsSync(target_directory + '/cloud')) {
    ok('cloud/ exists');
  } else {
    shell.mkdir(target_directory + '/cloud');
    ok('Created cloud/');
  }

  if (fs.existsSync(target_directory + '/cloud/main.js')) {
    ok('cloud/main.js exists');
  } else {
    fs.writeFileSync(target_directory + '/cloud/main.js', `// Cloud Code entry point\n`);
    ok('Created cloud/main.js');
  }

  if (fs.existsSync(target_directory + '/public')) {
    ok('public/ exists');
  } else {
    shell.mkdir(target_directory + '/public');
    ok('Created public/');
  }

  if (useYarn) {
    shell.exec("yarn add parse-server");
  } else {
    shell.exec("npm install parse-server --save");
  }

  console.log(chalk.green(`parse-server is installed in \n\t${target_directory}!\n`));
  await confirm('Do you want to start the server now?');
  if (useYarn) {
    shell.exec("yarn start");
  } else {
    shell.exec("npm start");
  }
})();
