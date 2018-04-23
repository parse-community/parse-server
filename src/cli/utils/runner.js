
import program from './commander';

function logStartupOptions(options) {
  for (const key in options) {
    let value = options[key];
    if (key == "masterKey") {
      value = "***REDACTED***";
    }
    if (typeof value === 'object') {
      try {
        value = JSON.stringify(value)
      } catch(e) {
        if (value && value.constructor && value.constructor.name) {
          value = value.constructor.name;
        }
      }
    }
    /* eslint-disable no-console */
    console.log(`${key}: ${value}`);
    /* eslint-enable no-console */
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

  const options = program.getOptions();
  start(program, options, function() {
    logStartupOptions(options);
  });
}
