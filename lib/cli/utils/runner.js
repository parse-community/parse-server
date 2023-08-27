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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJsb2dTdGFydHVwT3B0aW9ucyIsIm9wdGlvbnMiLCJ2ZXJib3NlIiwia2V5c1RvUmVkYWN0Iiwia2V5IiwidmFsdWUiLCJpbmNsdWRlcyIsIkpTT04iLCJzdHJpbmdpZnkiLCJlIiwiY29uc3RydWN0b3IiLCJuYW1lIiwiY29uc29sZSIsImxvZyIsImRlZmluaXRpb25zIiwiaGVscCIsInVzYWdlIiwic3RhcnQiLCJwcm9ncmFtIiwibG9hZERlZmluaXRpb25zIiwib24iLCJwYXJzZSIsInByb2Nlc3MiLCJhcmd2IiwiZW52IiwiZ2V0T3B0aW9ucyJdLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9jbGkvdXRpbHMvcnVubmVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBwcm9ncmFtIGZyb20gJy4vY29tbWFuZGVyJztcblxuZnVuY3Rpb24gbG9nU3RhcnR1cE9wdGlvbnMob3B0aW9ucykge1xuICBpZiAoIW9wdGlvbnMudmVyYm9zZSkge1xuICAgIHJldHVybjtcbiAgfVxuICAvLyBLZXlzIHRoYXQgbWF5IGluY2x1ZGUgc2Vuc2l0aXZlIGluZm9ybWF0aW9uIHRoYXQgd2lsbCBiZSByZWRhY3RlZCBpbiBsb2dzXG4gIGNvbnN0IGtleXNUb1JlZGFjdCA9IFtcbiAgICAnZGF0YWJhc2VVUkknLFxuICAgICdtYXN0ZXJLZXknLFxuICAgICdtYWludGVuYW5jZUtleScsXG4gICAgJ3B1c2gnLFxuICBdO1xuICBmb3IgKGNvbnN0IGtleSBpbiBvcHRpb25zKSB7XG4gICAgbGV0IHZhbHVlID0gb3B0aW9uc1trZXldO1xuICAgIGlmIChrZXlzVG9SZWRhY3QuaW5jbHVkZXMoa2V5KSkge1xuICAgICAgdmFsdWUgPSAnPFJFREFDVEVEPic7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICB0cnkge1xuICAgICAgICB2YWx1ZSA9IEpTT04uc3RyaW5naWZ5KHZhbHVlKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgaWYgKHZhbHVlICYmIHZhbHVlLmNvbnN0cnVjdG9yICYmIHZhbHVlLmNvbnN0cnVjdG9yLm5hbWUpIHtcbiAgICAgICAgICB2YWx1ZSA9IHZhbHVlLmNvbnN0cnVjdG9yLm5hbWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgIGNvbnNvbGUubG9nKGAke2tleX06ICR7dmFsdWV9YCk7XG4gICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25zb2xlICovXG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24gKHsgZGVmaW5pdGlvbnMsIGhlbHAsIHVzYWdlLCBzdGFydCB9KSB7XG4gIHByb2dyYW0ubG9hZERlZmluaXRpb25zKGRlZmluaXRpb25zKTtcbiAgaWYgKHVzYWdlKSB7XG4gICAgcHJvZ3JhbS51c2FnZSh1c2FnZSk7XG4gIH1cbiAgaWYgKGhlbHApIHtcbiAgICBwcm9ncmFtLm9uKCctLWhlbHAnLCBoZWxwKTtcbiAgfVxuICBwcm9ncmFtLnBhcnNlKHByb2Nlc3MuYXJndiwgcHJvY2Vzcy5lbnYpO1xuXG4gIGNvbnN0IG9wdGlvbnMgPSBwcm9ncmFtLmdldE9wdGlvbnMoKTtcbiAgc3RhcnQocHJvZ3JhbSwgb3B0aW9ucywgZnVuY3Rpb24gKCkge1xuICAgIGxvZ1N0YXJ0dXBPcHRpb25zKG9wdGlvbnMpO1xuICB9KTtcbn1cbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUE7QUFBa0M7QUFFbEMsU0FBU0EsaUJBQWlCLENBQUNDLE9BQU8sRUFBRTtFQUNsQyxJQUFJLENBQUNBLE9BQU8sQ0FBQ0MsT0FBTyxFQUFFO0lBQ3BCO0VBQ0Y7RUFDQTtFQUNBLE1BQU1DLFlBQVksR0FBRyxDQUNuQixhQUFhLEVBQ2IsV0FBVyxFQUNYLGdCQUFnQixFQUNoQixNQUFNLENBQ1A7RUFDRCxLQUFLLE1BQU1DLEdBQUcsSUFBSUgsT0FBTyxFQUFFO0lBQ3pCLElBQUlJLEtBQUssR0FBR0osT0FBTyxDQUFDRyxHQUFHLENBQUM7SUFDeEIsSUFBSUQsWUFBWSxDQUFDRyxRQUFRLENBQUNGLEdBQUcsQ0FBQyxFQUFFO01BQzlCQyxLQUFLLEdBQUcsWUFBWTtJQUN0QjtJQUNBLElBQUksT0FBT0EsS0FBSyxLQUFLLFFBQVEsRUFBRTtNQUM3QixJQUFJO1FBQ0ZBLEtBQUssR0FBR0UsSUFBSSxDQUFDQyxTQUFTLENBQUNILEtBQUssQ0FBQztNQUMvQixDQUFDLENBQUMsT0FBT0ksQ0FBQyxFQUFFO1FBQ1YsSUFBSUosS0FBSyxJQUFJQSxLQUFLLENBQUNLLFdBQVcsSUFBSUwsS0FBSyxDQUFDSyxXQUFXLENBQUNDLElBQUksRUFBRTtVQUN4RE4sS0FBSyxHQUFHQSxLQUFLLENBQUNLLFdBQVcsQ0FBQ0MsSUFBSTtRQUNoQztNQUNGO0lBQ0Y7SUFDQTtJQUNBQyxPQUFPLENBQUNDLEdBQUcsQ0FBRSxHQUFFVCxHQUFJLEtBQUlDLEtBQU0sRUFBQyxDQUFDO0lBQy9CO0VBQ0Y7QUFDRjs7QUFFZSxrQkFBVTtFQUFFUyxXQUFXO0VBQUVDLElBQUk7RUFBRUMsS0FBSztFQUFFQztBQUFNLENBQUMsRUFBRTtFQUM1REMsa0JBQU8sQ0FBQ0MsZUFBZSxDQUFDTCxXQUFXLENBQUM7RUFDcEMsSUFBSUUsS0FBSyxFQUFFO0lBQ1RFLGtCQUFPLENBQUNGLEtBQUssQ0FBQ0EsS0FBSyxDQUFDO0VBQ3RCO0VBQ0EsSUFBSUQsSUFBSSxFQUFFO0lBQ1JHLGtCQUFPLENBQUNFLEVBQUUsQ0FBQyxRQUFRLEVBQUVMLElBQUksQ0FBQztFQUM1QjtFQUNBRyxrQkFBTyxDQUFDRyxLQUFLLENBQUNDLE9BQU8sQ0FBQ0MsSUFBSSxFQUFFRCxPQUFPLENBQUNFLEdBQUcsQ0FBQztFQUV4QyxNQUFNdkIsT0FBTyxHQUFHaUIsa0JBQU8sQ0FBQ08sVUFBVSxFQUFFO0VBQ3BDUixLQUFLLENBQUNDLGtCQUFPLEVBQUVqQixPQUFPLEVBQUUsWUFBWTtJQUNsQ0QsaUJBQWlCLENBQUNDLE9BQU8sQ0FBQztFQUM1QixDQUFDLENBQUM7QUFDSiJ9