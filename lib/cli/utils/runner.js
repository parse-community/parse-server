"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = _default;

var _commander = _interopRequireDefault(require("./commander"));

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function logStartupOptions(options) {
  for (const key in options) {
    let value = options[key];

    if (key == 'masterKey') {
      value = '***REDACTED***';
    }

    if (key == 'push' && options.verbose != true) {
      value = '***REDACTED***';
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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJzb3VyY2VzIjpbIi4uLy4uLy4uL3NyYy9jbGkvdXRpbHMvcnVubmVyLmpzIl0sIm5hbWVzIjpbImxvZ1N0YXJ0dXBPcHRpb25zIiwib3B0aW9ucyIsImtleSIsInZhbHVlIiwidmVyYm9zZSIsIkpTT04iLCJzdHJpbmdpZnkiLCJlIiwiY29uc3RydWN0b3IiLCJuYW1lIiwiY29uc29sZSIsImxvZyIsImRlZmluaXRpb25zIiwiaGVscCIsInVzYWdlIiwic3RhcnQiLCJwcm9ncmFtIiwibG9hZERlZmluaXRpb25zIiwib24iLCJwYXJzZSIsInByb2Nlc3MiLCJhcmd2IiwiZW52IiwiZ2V0T3B0aW9ucyJdLCJtYXBwaW5ncyI6Ijs7Ozs7OztBQUFBOzs7O0FBRUEsU0FBU0EsaUJBQVQsQ0FBMkJDLE9BQTNCLEVBQW9DO0FBQ2xDLE9BQUssTUFBTUMsR0FBWCxJQUFrQkQsT0FBbEIsRUFBMkI7QUFDekIsUUFBSUUsS0FBSyxHQUFHRixPQUFPLENBQUNDLEdBQUQsQ0FBbkI7O0FBQ0EsUUFBSUEsR0FBRyxJQUFJLFdBQVgsRUFBd0I7QUFDdEJDLE1BQUFBLEtBQUssR0FBRyxnQkFBUjtBQUNEOztBQUNELFFBQUlELEdBQUcsSUFBSSxNQUFQLElBQWlCRCxPQUFPLENBQUNHLE9BQVIsSUFBbUIsSUFBeEMsRUFBOEM7QUFDNUNELE1BQUFBLEtBQUssR0FBRyxnQkFBUjtBQUNEOztBQUNELFFBQUksT0FBT0EsS0FBUCxLQUFpQixRQUFyQixFQUErQjtBQUM3QixVQUFJO0FBQ0ZBLFFBQUFBLEtBQUssR0FBR0UsSUFBSSxDQUFDQyxTQUFMLENBQWVILEtBQWYsQ0FBUjtBQUNELE9BRkQsQ0FFRSxPQUFPSSxDQUFQLEVBQVU7QUFDVixZQUFJSixLQUFLLElBQUlBLEtBQUssQ0FBQ0ssV0FBZixJQUE4QkwsS0FBSyxDQUFDSyxXQUFOLENBQWtCQyxJQUFwRCxFQUEwRDtBQUN4RE4sVUFBQUEsS0FBSyxHQUFHQSxLQUFLLENBQUNLLFdBQU4sQ0FBa0JDLElBQTFCO0FBQ0Q7QUFDRjtBQUNGO0FBQ0Q7OztBQUNBQyxJQUFBQSxPQUFPLENBQUNDLEdBQVIsQ0FBYSxHQUFFVCxHQUFJLEtBQUlDLEtBQU0sRUFBN0I7QUFDQTtBQUNEO0FBQ0Y7O0FBRWMsa0JBQVM7QUFBRVMsRUFBQUEsV0FBRjtBQUFlQyxFQUFBQSxJQUFmO0FBQXFCQyxFQUFBQSxLQUFyQjtBQUE0QkMsRUFBQUE7QUFBNUIsQ0FBVCxFQUE4QztBQUMzREMscUJBQVFDLGVBQVIsQ0FBd0JMLFdBQXhCOztBQUNBLE1BQUlFLEtBQUosRUFBVztBQUNURSx1QkFBUUYsS0FBUixDQUFjQSxLQUFkO0FBQ0Q7O0FBQ0QsTUFBSUQsSUFBSixFQUFVO0FBQ1JHLHVCQUFRRSxFQUFSLENBQVcsUUFBWCxFQUFxQkwsSUFBckI7QUFDRDs7QUFDREcscUJBQVFHLEtBQVIsQ0FBY0MsT0FBTyxDQUFDQyxJQUF0QixFQUE0QkQsT0FBTyxDQUFDRSxHQUFwQzs7QUFFQSxRQUFNckIsT0FBTyxHQUFHZSxtQkFBUU8sVUFBUixFQUFoQjs7QUFDQVIsRUFBQUEsS0FBSyxDQUFDQyxrQkFBRCxFQUFVZixPQUFWLEVBQW1CLFlBQVc7QUFDakNELElBQUFBLGlCQUFpQixDQUFDQyxPQUFELENBQWpCO0FBQ0QsR0FGSSxDQUFMO0FBR0QiLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgcHJvZ3JhbSBmcm9tICcuL2NvbW1hbmRlcic7XG5cbmZ1bmN0aW9uIGxvZ1N0YXJ0dXBPcHRpb25zKG9wdGlvbnMpIHtcbiAgZm9yIChjb25zdCBrZXkgaW4gb3B0aW9ucykge1xuICAgIGxldCB2YWx1ZSA9IG9wdGlvbnNba2V5XTtcbiAgICBpZiAoa2V5ID09ICdtYXN0ZXJLZXknKSB7XG4gICAgICB2YWx1ZSA9ICcqKipSRURBQ1RFRCoqKic7XG4gICAgfVxuICAgIGlmIChrZXkgPT0gJ3B1c2gnICYmIG9wdGlvbnMudmVyYm9zZSAhPSB0cnVlKSB7XG4gICAgICB2YWx1ZSA9ICcqKipSRURBQ1RFRCoqKic7XG4gICAgfVxuICAgIGlmICh0eXBlb2YgdmFsdWUgPT09ICdvYmplY3QnKSB7XG4gICAgICB0cnkge1xuICAgICAgICB2YWx1ZSA9IEpTT04uc3RyaW5naWZ5KHZhbHVlKTtcbiAgICAgIH0gY2F0Y2ggKGUpIHtcbiAgICAgICAgaWYgKHZhbHVlICYmIHZhbHVlLmNvbnN0cnVjdG9yICYmIHZhbHVlLmNvbnN0cnVjdG9yLm5hbWUpIHtcbiAgICAgICAgICB2YWx1ZSA9IHZhbHVlLmNvbnN0cnVjdG9yLm5hbWU7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG4gICAgLyogZXNsaW50LWRpc2FibGUgbm8tY29uc29sZSAqL1xuICAgIGNvbnNvbGUubG9nKGAke2tleX06ICR7dmFsdWV9YCk7XG4gICAgLyogZXNsaW50LWVuYWJsZSBuby1jb25zb2xlICovXG4gIH1cbn1cblxuZXhwb3J0IGRlZmF1bHQgZnVuY3Rpb24oeyBkZWZpbml0aW9ucywgaGVscCwgdXNhZ2UsIHN0YXJ0IH0pIHtcbiAgcHJvZ3JhbS5sb2FkRGVmaW5pdGlvbnMoZGVmaW5pdGlvbnMpO1xuICBpZiAodXNhZ2UpIHtcbiAgICBwcm9ncmFtLnVzYWdlKHVzYWdlKTtcbiAgfVxuICBpZiAoaGVscCkge1xuICAgIHByb2dyYW0ub24oJy0taGVscCcsIGhlbHApO1xuICB9XG4gIHByb2dyYW0ucGFyc2UocHJvY2Vzcy5hcmd2LCBwcm9jZXNzLmVudik7XG5cbiAgY29uc3Qgb3B0aW9ucyA9IHByb2dyYW0uZ2V0T3B0aW9ucygpO1xuICBzdGFydChwcm9ncmFtLCBvcHRpb25zLCBmdW5jdGlvbigpIHtcbiAgICBsb2dTdGFydHVwT3B0aW9ucyhvcHRpb25zKTtcbiAgfSk7XG59XG4iXX0=