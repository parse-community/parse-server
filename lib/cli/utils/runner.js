"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = _default;
var _commander = _interopRequireDefault(require("./commander"));
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
function logStartupOptions(options) {
  if (!options.verbose) {
    return;
  }
  // Keys that may include sensitive information that will be redacted in logs
  const keysToRedact = ['databaseURI', 'masterKey', 'maintenanceKey', 'push'];
  for (const key in options) {
    let value = options[key];
    if (keysToRedact.includes(key)) {
      value = '<REDACTED>';
    }
    if (typeof value === 'object') {
      try {
        value = JSON.stringify(value);
      } catch (e) {
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

function _default({
  definitions,
  help,
  usage,
  start
}) {
  _commander.default.loadDefinitions(definitions);
  if (usage) {
    _commander.default.usage(usage);
  }
  if (help) {
    _commander.default.on('--help', help);
  }
  _commander.default.parse(process.argv, process.env);
  const options = _commander.default.getOptions();
  start(_commander.default, options, function () {
    logStartupOptions(options);
  });
}
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJsb2dTdGFydHVwT3B0aW9ucyIsIm9wdGlvbnMiLCJ2ZXJib3NlIiwia2V5c1RvUmVkYWN0Iiwia2V5IiwidmFsdWUiLCJpbmNsdWRlcyIsIkpTT04iLCJzdHJpbmdpZnkiLCJlIiwiY29uc3RydWN0b3IiLCJuYW1lIiwiY29uc29sZSIsImxvZyIsImRlZmluaXRpb25zIiwiaGVscCIsInVzYWdlIiwic3RhcnQiLCJwcm9ncmFtIiwibG9hZERlZmluaXRpb25zIiwib24iLCJwYXJzZSIsInByb2Nlc3MiLCJhcmd2IiwiZW52IiwiZ2V0T3B0aW9ucyJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9jbGkvdXRpbHMvcnVubmVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBwcm9ncmFtIGZyb20gJy4vY29tbWFuZGVyJztcblxuZnVuY3Rpb24gbG9nU3RhcnR1cE9wdGlvbnMob3B0aW9ucykge1xuICBpZiAoIW9wdGlvbnMudmVyYm9zZSkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBLZXlzIHRoYXQgbWF5IGluY2x1ZGUgc2Vuc2l0aXZlIGluZm9ybWF0aW9uIHRoYXQgd2lsbCBiZSByZWRhY3RlZCBpbiBsb2dzXG4gIGNvbnN0IGtleXNUb1JlZGFjdCA9IFsnZGF0YWJhc2VVUkknLCAnbWFzdGVyS2V5JywgJ21haW50ZW5hbmNlS2V5JywgJ3B1c2gnXTtcbiAgZm9yIChjb25zdCBrZXkgaW4gb3B0aW9ucykge1xuICAgIGxldCB2YWx1ZSA9IG9wdGlvbnNba2V5XTtcbiAgICBpZiAoa2V5c1RvUmVkYWN0LmluY2x1ZGVzKGtleSkpIHtcbiAgICAgIHZhbHVlID0gJzxSRURBQ1RFRD4nO1xuICAgIH1cbiAgICBpZiAodHlwZW9mIHZhbHVlID09PSAnb2JqZWN0Jykge1xuICAgICAgdHJ5IHtcbiAgICAgICAgdmFsdWUgPSBKU09OLnN0cmluZ2lmeSh2YWx1ZSk7XG4gICAgICB9IGNhdGNoIChlKSB7XG4gICAgICAgIGlmICh2YWx1ZSAmJiB2YWx1ZS5jb25zdHJ1Y3RvciAmJiB2YWx1ZS5jb25zdHJ1Y3Rvci5uYW1lKSB7XG4gICAgICAgICAgdmFsdWUgPSB2YWx1ZS5jb25zdHJ1Y3Rvci5uYW1lO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfVxuICAgIC8qIGVzbGludC1kaXNhYmxlIG5vLWNvbnNvbGUgKi9cbiAgICBjb25zb2xlLmxvZyhgJHtrZXl9OiAke3ZhbHVlfWApO1xuICAgIC8qIGVzbGludC1lbmFibGUgbm8tY29uc29sZSAqL1xuICB9XG59XG5cbmV4cG9ydCBkZWZhdWx0IGZ1bmN0aW9uICh7IGRlZmluaXRpb25zLCBoZWxwLCB1c2FnZSwgc3RhcnQgfSkge1xuICBwcm9ncmFtLmxvYWREZWZpbml0aW9ucyhkZWZpbml0aW9ucyk7XG4gIGlmICh1c2FnZSkge1xuICAgIHByb2dyYW0udXNhZ2UodXNhZ2UpO1xuICB9XG4gIGlmIChoZWxwKSB7XG4gICAgcHJvZ3JhbS5vbignLS1oZWxwJywgaGVscCk7XG4gIH1cbiAgcHJvZ3JhbS5wYXJzZShwcm9jZXNzLmFyZ3YsIHByb2Nlc3MuZW52KTtcblxuICBjb25zdCBvcHRpb25zID0gcHJvZ3JhbS5nZXRPcHRpb25zKCk7XG4gIHN0YXJ0KHByb2dyYW0sIG9wdGlvbnMsIGZ1bmN0aW9uICgpIHtcbiAgICBsb2dTdGFydHVwT3B0aW9ucyhvcHRpb25zKTtcbiAgfSk7XG59XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBO0FBQWtDO0FBRWxDLFNBQVNBLGlCQUFpQixDQUFDQyxPQUFPLEVBQUU7RUFDbEMsSUFBSSxDQUFDQSxPQUFPLENBQUNDLE9BQU8sRUFBRTtJQUNwQjtFQUNGO0VBQ0E7RUFDQSxNQUFNQyxZQUFZLEdBQUcsQ0FBQyxhQUFhLEVBQUUsV0FBVyxFQUFFLGdCQUFnQixFQUFFLE1BQU0sQ0FBQztFQUMzRSxLQUFLLE1BQU1DLEdBQUcsSUFBSUgsT0FBTyxFQUFFO0lBQ3pCLElBQUlJLEtBQUssR0FBR0osT0FBTyxDQUFDRyxHQUFHLENBQUM7SUFDeEIsSUFBSUQsWUFBWSxDQUFDRyxRQUFRLENBQUNGLEdBQUcsQ0FBQyxFQUFFO01BQzlCQyxLQUFLLEdBQUcsWUFBWTtJQUN0QjtJQUNBLElBQUksT0FBT0EsS0FBSyxLQUFLLFFBQVEsRUFBRTtNQUM3QixJQUFJO1FBQ0ZBLEtBQUssR0FBR0UsSUFBSSxDQUFDQyxTQUFTLENBQUNILEtBQUssQ0FBQztNQUMvQixDQUFDLENBQUMsT0FBT0ksQ0FBQyxFQUFFO1FBQ1YsSUFBSUosS0FBSyxJQUFJQSxLQUFLLENBQUNLLFdBQVcsSUFBSUwsS0FBSyxDQUFDSyxXQUFXLENBQUNDLElBQUksRUFBRTtVQUN4RE4sS0FBSyxHQUFHQSxLQUFLLENBQUNLLFdBQVcsQ0FBQ0MsSUFBSTtRQUNoQztNQUNGO0lBQ0Y7SUFDQTtJQUNBQyxPQUFPLENBQUNDLEdBQUcsQ0FBRSxHQUFFVCxHQUFJLEtBQUlDLEtBQU0sRUFBQyxDQUFDO0lBQy9CO0VBQ0Y7QUFDRjs7QUFFZSxrQkFBVTtFQUFFUyxXQUFXO0VBQUVDLElBQUk7RUFBRUMsS0FBSztFQUFFQztBQUFNLENBQUMsRUFBRTtFQUM1REMsa0JBQU8sQ0FBQ0MsZUFBZSxDQUFDTCxXQUFXLENBQUM7RUFDcEMsSUFBSUUsS0FBSyxFQUFFO0lBQ1RFLGtCQUFPLENBQUNGLEtBQUssQ0FBQ0EsS0FBSyxDQUFDO0VBQ3RCO0VBQ0EsSUFBSUQsSUFBSSxFQUFFO0lBQ1JHLGtCQUFPLENBQUNFLEVBQUUsQ0FBQyxRQUFRLEVBQUVMLElBQUksQ0FBQztFQUM1QjtFQUNBRyxrQkFBTyxDQUFDRyxLQUFLLENBQUNDLE9BQU8sQ0FBQ0MsSUFBSSxFQUFFRCxPQUFPLENBQUNFLEdBQUcsQ0FBQztFQUV4QyxNQUFNdkIsT0FBTyxHQUFHaUIsa0JBQU8sQ0FBQ08sVUFBVSxFQUFFO0VBQ3BDUixLQUFLLENBQUNDLGtCQUFPLEVBQUVqQixPQUFPLEVBQUUsWUFBWTtJQUNsQ0QsaUJBQWlCLENBQUNDLE9BQU8sQ0FBQztFQUM1QixDQUFDLENBQUM7QUFDSiJ9