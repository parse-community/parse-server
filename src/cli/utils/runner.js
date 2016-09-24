
import program from './commander';
import { mergeWithOptions } from './commander';

function logStartupOptions(options) {
  for (let key in options) {
    let value = options[key];
    if (key == "masterKey") {
      value = "***REDACTED***";
    }
    if (typeof value === 'object') {
      value = JSON.stringify(value);
    }
    console.log(`${key}: ${value}`);
  }
}

export default function({
  definitions,
  help,
  usage,
  start
}) {
  program.loadDefinitions(definitions);
  if (usage) {
    program.usage(usage);
  }
  if (help) {
    program.on('--help', help);
  }
  program.parse(process.argv, process.env);

  let options = program.getOptions();
  start(program, options, function() {
    logStartupOptions(options);
  });
}