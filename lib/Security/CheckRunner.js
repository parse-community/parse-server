"use strict";

var _Utils = _interopRequireDefault(require("../Utils"));
var _Check = require("./Check");
var CheckGroups = _interopRequireWildcard(require("./CheckGroups/CheckGroups"));
var _logger = _interopRequireDefault(require("../logger"));
var _lodash = require("lodash");
function _getRequireWildcardCache(nodeInterop) { if (typeof WeakMap !== "function") return null; var cacheBabelInterop = new WeakMap(); var cacheNodeInterop = new WeakMap(); return (_getRequireWildcardCache = function (nodeInterop) { return nodeInterop ? cacheNodeInterop : cacheBabelInterop; })(nodeInterop); }
function _interopRequireWildcard(obj, nodeInterop) { if (!nodeInterop && obj && obj.__esModule) { return obj; } if (obj === null || typeof obj !== "object" && typeof obj !== "function") { return { default: obj }; } var cache = _getRequireWildcardCache(nodeInterop); if (cache && cache.has(obj)) { return cache.get(obj); } var newObj = {}; var hasPropertyDescriptor = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var key in obj) { if (key !== "default" && Object.prototype.hasOwnProperty.call(obj, key)) { var desc = hasPropertyDescriptor ? Object.getOwnPropertyDescriptor(obj, key) : null; if (desc && (desc.get || desc.set)) { Object.defineProperty(newObj, key, desc); } else { newObj[key] = obj[key]; } } } newObj.default = obj; if (cache) { cache.set(obj, newObj); } return newObj; }
function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }
/**
 * The security check runner.
 * @memberof module:SecurityCheck
 */
class CheckRunner {
  /**
   * The security check runner.
   * @param {Object} [config] The configuration options.
   * @param {Boolean} [config.enableCheck=false] Is true if Parse Server should report weak security settings.
   * @param {Boolean} [config.enableCheckLog=false] Is true if the security check report should be written to logs.
   * @param {Object} [config.checkGroups] The check groups to run. Default are the groups defined in `./CheckGroups/CheckGroups.js`.
   */
  constructor(config = {}) {
    this._validateParams(config);
    const {
      enableCheck = false,
      enableCheckLog = false,
      checkGroups = CheckGroups
    } = config;
    this.enableCheck = enableCheck;
    this.enableCheckLog = enableCheckLog;
    this.checkGroups = checkGroups;
  }

  /**
   * Runs all security checks and returns the results.
   * @params
   * @returns {Object} The security check report.
   */
  async run({
    version = '1.0.0'
  } = {}) {
    // Instantiate check groups
    const groups = Object.values(this.checkGroups).filter(c => typeof c === 'function').map(CheckGroup => new CheckGroup());

    // Run checks
    groups.forEach(group => group.run());

    // Generate JSON report
    const report = this._generateReport({
      groups,
      version
    });

    // If report should be written to logs
    if (this.enableCheckLog) {
      this._logReport(report);
    }
    return report;
  }

  /**
   * Generates a security check report in JSON format with schema:
   * ```
   * {
   *    report: {
   *      version: "1.0.0", // The report version, defines the schema
   *      state: "fail"     // The disjunctive indicator of failed checks in all groups.
   *      groups: [         // The check groups
   *        {
   *          name: "House",            // The group name
   *          state: "fail"             // The disjunctive indicator of failed checks in this group.
   *          checks: [                 // The checks
   *            title: "Door locked",   // The check title
   *            state: "fail"           // The check state
   *            warning: "Anyone can enter your house."   // The warning.
   *            solution: "Lock your door."               // The solution.
   *          ]
   *        },
   *        ...
   *      ]
   *    }
   * }
   * ```
   * @param {Object} params The parameters.
   * @param {Array<CheckGroup>} params.groups The check groups.
   * @param {String} params.version: The report schema version.
   * @returns {Object} The report.
   */
  _generateReport({
    groups,
    version
  }) {
    // Create report template
    const report = {
      report: {
        version,
        state: _Check.CheckState.success,
        groups: []
      }
    };

    // Identify report version
    switch (version) {
      case '1.0.0':
      default:
        // For each check group
        for (const group of groups) {
          // Create group report
          const groupReport = {
            name: group.name(),
            state: _Check.CheckState.success,
            checks: []
          };

          // Create check reports
          groupReport.checks = group.checks().map(check => {
            const checkReport = {
              title: check.title,
              state: check.checkState()
            };
            if (check.checkState() == _Check.CheckState.fail) {
              checkReport.warning = check.warning;
              checkReport.solution = check.solution;
              report.report.state = _Check.CheckState.fail;
              groupReport.state = _Check.CheckState.fail;
            }
            return checkReport;
          });
          report.report.groups.push(groupReport);
        }
    }
    return report;
  }

  /**
   * Logs the security check report.
   * @param {Object} report The report to log.
   */
  _logReport(report) {
    // Determine log level depending on whether any check failed
    const log = report.report.state == _Check.CheckState.success ? s => _logger.default.info(s) : s => _logger.default.warn(s);

    // Declare output
    const indent = '   ';
    let output = '';
    let checksCount = 0;
    let failedChecksCount = 0;
    let skippedCheckCount = 0;

    // Traverse all groups and checks for compose output
    for (const group of report.report.groups) {
      output += `\n- ${group.name}`;
      for (const check of group.checks) {
        checksCount++;
        output += `\n${indent}${this._getLogIconForState(check.state)} ${check.title}`;
        if (check.state == _Check.CheckState.fail) {
          failedChecksCount++;
          output += `\n${indent}${indent}Warning: ${check.warning}`;
          output += ` ${check.solution}`;
        } else if (check.state == _Check.CheckState.none) {
          skippedCheckCount++;
          output += `\n${indent}${indent}Test did not execute, this is likely an internal server issue, please report.`;
        }
      }
    }
    output = `\n###################################` + `\n#                                 #` + `\n#   Parse Server Security Check   #` + `\n#                                 #` + `\n###################################` + `\n` + `\n${failedChecksCount > 0 ? 'Warning: ' : ''}${failedChecksCount} weak security setting(s) found${failedChecksCount > 0 ? '!' : ''}` + `\n${checksCount} check(s) executed` + `\n${skippedCheckCount} check(s) skipped` + `\n` + `${output}`;

    // Write log
    log(output);
  }

  /**
   * Returns an icon for use in the report log output.
   * @param {CheckState} state The check state.
   * @returns {String} The icon.
   */
  _getLogIconForState(state) {
    switch (state) {
      case _Check.CheckState.success:
        return '✅';
      case _Check.CheckState.fail:
        return '❌';
      default:
        return 'ℹ️';
    }
  }

  /**
   * Validates the constructor parameters.
   * @param {Object} params The parameters to validate.
   */
  _validateParams(params) {
    _Utils.default.validateParams(params, {
      enableCheck: {
        t: 'boolean',
        v: _lodash.isBoolean,
        o: true
      },
      enableCheckLog: {
        t: 'boolean',
        v: _lodash.isBoolean,
        o: true
      },
      checkGroups: {
        t: 'array',
        v: _lodash.isArray,
        o: true
      }
    });
  }
}
module.exports = CheckRunner;
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJDaGVja1J1bm5lciIsImNvbnN0cnVjdG9yIiwiY29uZmlnIiwiX3ZhbGlkYXRlUGFyYW1zIiwiZW5hYmxlQ2hlY2siLCJlbmFibGVDaGVja0xvZyIsImNoZWNrR3JvdXBzIiwiQ2hlY2tHcm91cHMiLCJydW4iLCJ2ZXJzaW9uIiwiZ3JvdXBzIiwiT2JqZWN0IiwidmFsdWVzIiwiZmlsdGVyIiwiYyIsIm1hcCIsIkNoZWNrR3JvdXAiLCJmb3JFYWNoIiwiZ3JvdXAiLCJyZXBvcnQiLCJfZ2VuZXJhdGVSZXBvcnQiLCJfbG9nUmVwb3J0Iiwic3RhdGUiLCJDaGVja1N0YXRlIiwic3VjY2VzcyIsImdyb3VwUmVwb3J0IiwibmFtZSIsImNoZWNrcyIsImNoZWNrIiwiY2hlY2tSZXBvcnQiLCJ0aXRsZSIsImNoZWNrU3RhdGUiLCJmYWlsIiwid2FybmluZyIsInNvbHV0aW9uIiwicHVzaCIsImxvZyIsInMiLCJsb2dnZXIiLCJpbmZvIiwid2FybiIsImluZGVudCIsIm91dHB1dCIsImNoZWNrc0NvdW50IiwiZmFpbGVkQ2hlY2tzQ291bnQiLCJza2lwcGVkQ2hlY2tDb3VudCIsIl9nZXRMb2dJY29uRm9yU3RhdGUiLCJub25lIiwicGFyYW1zIiwiVXRpbHMiLCJ2YWxpZGF0ZVBhcmFtcyIsInQiLCJ2IiwiaXNCb29sZWFuIiwibyIsImlzQXJyYXkiLCJtb2R1bGUiLCJleHBvcnRzIl0sInNvdXJjZXMiOlsiLi4vLi4vc3JjL1NlY3VyaXR5L0NoZWNrUnVubmVyLmpzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydCBVdGlscyBmcm9tICcuLi9VdGlscyc7XG5pbXBvcnQgeyBDaGVja1N0YXRlIH0gZnJvbSAnLi9DaGVjayc7XG5pbXBvcnQgKiBhcyBDaGVja0dyb3VwcyBmcm9tICcuL0NoZWNrR3JvdXBzL0NoZWNrR3JvdXBzJztcbmltcG9ydCBsb2dnZXIgZnJvbSAnLi4vbG9nZ2VyJztcbmltcG9ydCB7IGlzQXJyYXksIGlzQm9vbGVhbiB9IGZyb20gJ2xvZGFzaCc7XG5cbi8qKlxuICogVGhlIHNlY3VyaXR5IGNoZWNrIHJ1bm5lci5cbiAqIEBtZW1iZXJvZiBtb2R1bGU6U2VjdXJpdHlDaGVja1xuICovXG5jbGFzcyBDaGVja1J1bm5lciB7XG4gIC8qKlxuICAgKiBUaGUgc2VjdXJpdHkgY2hlY2sgcnVubmVyLlxuICAgKiBAcGFyYW0ge09iamVjdH0gW2NvbmZpZ10gVGhlIGNvbmZpZ3VyYXRpb24gb3B0aW9ucy5cbiAgICogQHBhcmFtIHtCb29sZWFufSBbY29uZmlnLmVuYWJsZUNoZWNrPWZhbHNlXSBJcyB0cnVlIGlmIFBhcnNlIFNlcnZlciBzaG91bGQgcmVwb3J0IHdlYWsgc2VjdXJpdHkgc2V0dGluZ3MuXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gW2NvbmZpZy5lbmFibGVDaGVja0xvZz1mYWxzZV0gSXMgdHJ1ZSBpZiB0aGUgc2VjdXJpdHkgY2hlY2sgcmVwb3J0IHNob3VsZCBiZSB3cml0dGVuIHRvIGxvZ3MuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBbY29uZmlnLmNoZWNrR3JvdXBzXSBUaGUgY2hlY2sgZ3JvdXBzIHRvIHJ1bi4gRGVmYXVsdCBhcmUgdGhlIGdyb3VwcyBkZWZpbmVkIGluIGAuL0NoZWNrR3JvdXBzL0NoZWNrR3JvdXBzLmpzYC5cbiAgICovXG4gIGNvbnN0cnVjdG9yKGNvbmZpZyA9IHt9KSB7XG4gICAgdGhpcy5fdmFsaWRhdGVQYXJhbXMoY29uZmlnKTtcbiAgICBjb25zdCB7IGVuYWJsZUNoZWNrID0gZmFsc2UsIGVuYWJsZUNoZWNrTG9nID0gZmFsc2UsIGNoZWNrR3JvdXBzID0gQ2hlY2tHcm91cHMgfSA9IGNvbmZpZztcbiAgICB0aGlzLmVuYWJsZUNoZWNrID0gZW5hYmxlQ2hlY2s7XG4gICAgdGhpcy5lbmFibGVDaGVja0xvZyA9IGVuYWJsZUNoZWNrTG9nO1xuICAgIHRoaXMuY2hlY2tHcm91cHMgPSBjaGVja0dyb3VwcztcbiAgfVxuXG4gIC8qKlxuICAgKiBSdW5zIGFsbCBzZWN1cml0eSBjaGVja3MgYW5kIHJldHVybnMgdGhlIHJlc3VsdHMuXG4gICAqIEBwYXJhbXNcbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIHNlY3VyaXR5IGNoZWNrIHJlcG9ydC5cbiAgICovXG4gIGFzeW5jIHJ1bih7IHZlcnNpb24gPSAnMS4wLjAnIH0gPSB7fSkge1xuICAgIC8vIEluc3RhbnRpYXRlIGNoZWNrIGdyb3Vwc1xuICAgIGNvbnN0IGdyb3VwcyA9IE9iamVjdC52YWx1ZXModGhpcy5jaGVja0dyb3VwcylcbiAgICAgIC5maWx0ZXIoYyA9PiB0eXBlb2YgYyA9PT0gJ2Z1bmN0aW9uJylcbiAgICAgIC5tYXAoQ2hlY2tHcm91cCA9PiBuZXcgQ2hlY2tHcm91cCgpKTtcblxuICAgIC8vIFJ1biBjaGVja3NcbiAgICBncm91cHMuZm9yRWFjaChncm91cCA9PiBncm91cC5ydW4oKSk7XG5cbiAgICAvLyBHZW5lcmF0ZSBKU09OIHJlcG9ydFxuICAgIGNvbnN0IHJlcG9ydCA9IHRoaXMuX2dlbmVyYXRlUmVwb3J0KHsgZ3JvdXBzLCB2ZXJzaW9uIH0pO1xuXG4gICAgLy8gSWYgcmVwb3J0IHNob3VsZCBiZSB3cml0dGVuIHRvIGxvZ3NcbiAgICBpZiAodGhpcy5lbmFibGVDaGVja0xvZykge1xuICAgICAgdGhpcy5fbG9nUmVwb3J0KHJlcG9ydCk7XG4gICAgfVxuICAgIHJldHVybiByZXBvcnQ7XG4gIH1cblxuICAvKipcbiAgICogR2VuZXJhdGVzIGEgc2VjdXJpdHkgY2hlY2sgcmVwb3J0IGluIEpTT04gZm9ybWF0IHdpdGggc2NoZW1hOlxuICAgKiBgYGBcbiAgICoge1xuICAgKiAgICByZXBvcnQ6IHtcbiAgICogICAgICB2ZXJzaW9uOiBcIjEuMC4wXCIsIC8vIFRoZSByZXBvcnQgdmVyc2lvbiwgZGVmaW5lcyB0aGUgc2NoZW1hXG4gICAqICAgICAgc3RhdGU6IFwiZmFpbFwiICAgICAvLyBUaGUgZGlzanVuY3RpdmUgaW5kaWNhdG9yIG9mIGZhaWxlZCBjaGVja3MgaW4gYWxsIGdyb3Vwcy5cbiAgICogICAgICBncm91cHM6IFsgICAgICAgICAvLyBUaGUgY2hlY2sgZ3JvdXBzXG4gICAqICAgICAgICB7XG4gICAqICAgICAgICAgIG5hbWU6IFwiSG91c2VcIiwgICAgICAgICAgICAvLyBUaGUgZ3JvdXAgbmFtZVxuICAgKiAgICAgICAgICBzdGF0ZTogXCJmYWlsXCIgICAgICAgICAgICAgLy8gVGhlIGRpc2p1bmN0aXZlIGluZGljYXRvciBvZiBmYWlsZWQgY2hlY2tzIGluIHRoaXMgZ3JvdXAuXG4gICAqICAgICAgICAgIGNoZWNrczogWyAgICAgICAgICAgICAgICAgLy8gVGhlIGNoZWNrc1xuICAgKiAgICAgICAgICAgIHRpdGxlOiBcIkRvb3IgbG9ja2VkXCIsICAgLy8gVGhlIGNoZWNrIHRpdGxlXG4gICAqICAgICAgICAgICAgc3RhdGU6IFwiZmFpbFwiICAgICAgICAgICAvLyBUaGUgY2hlY2sgc3RhdGVcbiAgICogICAgICAgICAgICB3YXJuaW5nOiBcIkFueW9uZSBjYW4gZW50ZXIgeW91ciBob3VzZS5cIiAgIC8vIFRoZSB3YXJuaW5nLlxuICAgKiAgICAgICAgICAgIHNvbHV0aW9uOiBcIkxvY2sgeW91ciBkb29yLlwiICAgICAgICAgICAgICAgLy8gVGhlIHNvbHV0aW9uLlxuICAgKiAgICAgICAgICBdXG4gICAqICAgICAgICB9LFxuICAgKiAgICAgICAgLi4uXG4gICAqICAgICAgXVxuICAgKiAgICB9XG4gICAqIH1cbiAgICogYGBgXG4gICAqIEBwYXJhbSB7T2JqZWN0fSBwYXJhbXMgVGhlIHBhcmFtZXRlcnMuXG4gICAqIEBwYXJhbSB7QXJyYXk8Q2hlY2tHcm91cD59IHBhcmFtcy5ncm91cHMgVGhlIGNoZWNrIGdyb3Vwcy5cbiAgICogQHBhcmFtIHtTdHJpbmd9IHBhcmFtcy52ZXJzaW9uOiBUaGUgcmVwb3J0IHNjaGVtYSB2ZXJzaW9uLlxuICAgKiBAcmV0dXJucyB7T2JqZWN0fSBUaGUgcmVwb3J0LlxuICAgKi9cbiAgX2dlbmVyYXRlUmVwb3J0KHsgZ3JvdXBzLCB2ZXJzaW9uIH0pIHtcbiAgICAvLyBDcmVhdGUgcmVwb3J0IHRlbXBsYXRlXG4gICAgY29uc3QgcmVwb3J0ID0ge1xuICAgICAgcmVwb3J0OiB7XG4gICAgICAgIHZlcnNpb24sXG4gICAgICAgIHN0YXRlOiBDaGVja1N0YXRlLnN1Y2Nlc3MsXG4gICAgICAgIGdyb3VwczogW10sXG4gICAgICB9LFxuICAgIH07XG5cbiAgICAvLyBJZGVudGlmeSByZXBvcnQgdmVyc2lvblxuICAgIHN3aXRjaCAodmVyc2lvbikge1xuICAgICAgY2FzZSAnMS4wLjAnOlxuICAgICAgZGVmYXVsdDpcbiAgICAgICAgLy8gRm9yIGVhY2ggY2hlY2sgZ3JvdXBcbiAgICAgICAgZm9yIChjb25zdCBncm91cCBvZiBncm91cHMpIHtcbiAgICAgICAgICAvLyBDcmVhdGUgZ3JvdXAgcmVwb3J0XG4gICAgICAgICAgY29uc3QgZ3JvdXBSZXBvcnQgPSB7XG4gICAgICAgICAgICBuYW1lOiBncm91cC5uYW1lKCksXG4gICAgICAgICAgICBzdGF0ZTogQ2hlY2tTdGF0ZS5zdWNjZXNzLFxuICAgICAgICAgICAgY2hlY2tzOiBbXSxcbiAgICAgICAgICB9O1xuXG4gICAgICAgICAgLy8gQ3JlYXRlIGNoZWNrIHJlcG9ydHNcbiAgICAgICAgICBncm91cFJlcG9ydC5jaGVja3MgPSBncm91cC5jaGVja3MoKS5tYXAoY2hlY2sgPT4ge1xuICAgICAgICAgICAgY29uc3QgY2hlY2tSZXBvcnQgPSB7XG4gICAgICAgICAgICAgIHRpdGxlOiBjaGVjay50aXRsZSxcbiAgICAgICAgICAgICAgc3RhdGU6IGNoZWNrLmNoZWNrU3RhdGUoKSxcbiAgICAgICAgICAgIH07XG4gICAgICAgICAgICBpZiAoY2hlY2suY2hlY2tTdGF0ZSgpID09IENoZWNrU3RhdGUuZmFpbCkge1xuICAgICAgICAgICAgICBjaGVja1JlcG9ydC53YXJuaW5nID0gY2hlY2sud2FybmluZztcbiAgICAgICAgICAgICAgY2hlY2tSZXBvcnQuc29sdXRpb24gPSBjaGVjay5zb2x1dGlvbjtcbiAgICAgICAgICAgICAgcmVwb3J0LnJlcG9ydC5zdGF0ZSA9IENoZWNrU3RhdGUuZmFpbDtcbiAgICAgICAgICAgICAgZ3JvdXBSZXBvcnQuc3RhdGUgPSBDaGVja1N0YXRlLmZhaWw7XG4gICAgICAgICAgICB9XG4gICAgICAgICAgICByZXR1cm4gY2hlY2tSZXBvcnQ7XG4gICAgICAgICAgfSk7XG5cbiAgICAgICAgICByZXBvcnQucmVwb3J0Lmdyb3Vwcy5wdXNoKGdyb3VwUmVwb3J0KTtcbiAgICAgICAgfVxuICAgIH1cbiAgICByZXR1cm4gcmVwb3J0O1xuICB9XG5cbiAgLyoqXG4gICAqIExvZ3MgdGhlIHNlY3VyaXR5IGNoZWNrIHJlcG9ydC5cbiAgICogQHBhcmFtIHtPYmplY3R9IHJlcG9ydCBUaGUgcmVwb3J0IHRvIGxvZy5cbiAgICovXG4gIF9sb2dSZXBvcnQocmVwb3J0KSB7XG4gICAgLy8gRGV0ZXJtaW5lIGxvZyBsZXZlbCBkZXBlbmRpbmcgb24gd2hldGhlciBhbnkgY2hlY2sgZmFpbGVkXG4gICAgY29uc3QgbG9nID1cbiAgICAgIHJlcG9ydC5yZXBvcnQuc3RhdGUgPT0gQ2hlY2tTdGF0ZS5zdWNjZXNzID8gcyA9PiBsb2dnZXIuaW5mbyhzKSA6IHMgPT4gbG9nZ2VyLndhcm4ocyk7XG5cbiAgICAvLyBEZWNsYXJlIG91dHB1dFxuICAgIGNvbnN0IGluZGVudCA9ICcgICAnO1xuICAgIGxldCBvdXRwdXQgPSAnJztcbiAgICBsZXQgY2hlY2tzQ291bnQgPSAwO1xuICAgIGxldCBmYWlsZWRDaGVja3NDb3VudCA9IDA7XG4gICAgbGV0IHNraXBwZWRDaGVja0NvdW50ID0gMDtcblxuICAgIC8vIFRyYXZlcnNlIGFsbCBncm91cHMgYW5kIGNoZWNrcyBmb3IgY29tcG9zZSBvdXRwdXRcbiAgICBmb3IgKGNvbnN0IGdyb3VwIG9mIHJlcG9ydC5yZXBvcnQuZ3JvdXBzKSB7XG4gICAgICBvdXRwdXQgKz0gYFxcbi0gJHtncm91cC5uYW1lfWA7XG5cbiAgICAgIGZvciAoY29uc3QgY2hlY2sgb2YgZ3JvdXAuY2hlY2tzKSB7XG4gICAgICAgIGNoZWNrc0NvdW50Kys7XG4gICAgICAgIG91dHB1dCArPSBgXFxuJHtpbmRlbnR9JHt0aGlzLl9nZXRMb2dJY29uRm9yU3RhdGUoY2hlY2suc3RhdGUpfSAke2NoZWNrLnRpdGxlfWA7XG5cbiAgICAgICAgaWYgKGNoZWNrLnN0YXRlID09IENoZWNrU3RhdGUuZmFpbCkge1xuICAgICAgICAgIGZhaWxlZENoZWNrc0NvdW50Kys7XG4gICAgICAgICAgb3V0cHV0ICs9IGBcXG4ke2luZGVudH0ke2luZGVudH1XYXJuaW5nOiAke2NoZWNrLndhcm5pbmd9YDtcbiAgICAgICAgICBvdXRwdXQgKz0gYCAke2NoZWNrLnNvbHV0aW9ufWA7XG4gICAgICAgIH0gZWxzZSBpZiAoY2hlY2suc3RhdGUgPT0gQ2hlY2tTdGF0ZS5ub25lKSB7XG4gICAgICAgICAgc2tpcHBlZENoZWNrQ291bnQrKztcbiAgICAgICAgICBvdXRwdXQgKz0gYFxcbiR7aW5kZW50fSR7aW5kZW50fVRlc3QgZGlkIG5vdCBleGVjdXRlLCB0aGlzIGlzIGxpa2VseSBhbiBpbnRlcm5hbCBzZXJ2ZXIgaXNzdWUsIHBsZWFzZSByZXBvcnQuYDtcbiAgICAgICAgfVxuICAgICAgfVxuICAgIH1cblxuICAgIG91dHB1dCA9XG4gICAgICBgXFxuIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNgICtcbiAgICAgIGBcXG4jICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgI2AgK1xuICAgICAgYFxcbiMgICBQYXJzZSBTZXJ2ZXIgU2VjdXJpdHkgQ2hlY2sgICAjYCArXG4gICAgICBgXFxuIyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICNgICtcbiAgICAgIGBcXG4jIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjI2AgK1xuICAgICAgYFxcbmAgK1xuICAgICAgYFxcbiR7XG4gICAgICAgIGZhaWxlZENoZWNrc0NvdW50ID4gMCA/ICdXYXJuaW5nOiAnIDogJydcbiAgICAgIH0ke2ZhaWxlZENoZWNrc0NvdW50fSB3ZWFrIHNlY3VyaXR5IHNldHRpbmcocykgZm91bmQke2ZhaWxlZENoZWNrc0NvdW50ID4gMCA/ICchJyA6ICcnfWAgK1xuICAgICAgYFxcbiR7Y2hlY2tzQ291bnR9IGNoZWNrKHMpIGV4ZWN1dGVkYCArXG4gICAgICBgXFxuJHtza2lwcGVkQ2hlY2tDb3VudH0gY2hlY2socykgc2tpcHBlZGAgK1xuICAgICAgYFxcbmAgK1xuICAgICAgYCR7b3V0cHV0fWA7XG5cbiAgICAvLyBXcml0ZSBsb2dcbiAgICBsb2cob3V0cHV0KTtcbiAgfVxuXG4gIC8qKlxuICAgKiBSZXR1cm5zIGFuIGljb24gZm9yIHVzZSBpbiB0aGUgcmVwb3J0IGxvZyBvdXRwdXQuXG4gICAqIEBwYXJhbSB7Q2hlY2tTdGF0ZX0gc3RhdGUgVGhlIGNoZWNrIHN0YXRlLlxuICAgKiBAcmV0dXJucyB7U3RyaW5nfSBUaGUgaWNvbi5cbiAgICovXG4gIF9nZXRMb2dJY29uRm9yU3RhdGUoc3RhdGUpIHtcbiAgICBzd2l0Y2ggKHN0YXRlKSB7XG4gICAgICBjYXNlIENoZWNrU3RhdGUuc3VjY2VzczpcbiAgICAgICAgcmV0dXJuICfinIUnO1xuICAgICAgY2FzZSBDaGVja1N0YXRlLmZhaWw6XG4gICAgICAgIHJldHVybiAn4p2MJztcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIHJldHVybiAn4oS577iPJztcbiAgICB9XG4gIH1cblxuICAvKipcbiAgICogVmFsaWRhdGVzIHRoZSBjb25zdHJ1Y3RvciBwYXJhbWV0ZXJzLlxuICAgKiBAcGFyYW0ge09iamVjdH0gcGFyYW1zIFRoZSBwYXJhbWV0ZXJzIHRvIHZhbGlkYXRlLlxuICAgKi9cbiAgX3ZhbGlkYXRlUGFyYW1zKHBhcmFtcykge1xuICAgIFV0aWxzLnZhbGlkYXRlUGFyYW1zKHBhcmFtcywge1xuICAgICAgZW5hYmxlQ2hlY2s6IHsgdDogJ2Jvb2xlYW4nLCB2OiBpc0Jvb2xlYW4sIG86IHRydWUgfSxcbiAgICAgIGVuYWJsZUNoZWNrTG9nOiB7IHQ6ICdib29sZWFuJywgdjogaXNCb29sZWFuLCBvOiB0cnVlIH0sXG4gICAgICBjaGVja0dyb3VwczogeyB0OiAnYXJyYXknLCB2OiBpc0FycmF5LCBvOiB0cnVlIH0sXG4gICAgfSk7XG4gIH1cbn1cblxubW9kdWxlLmV4cG9ydHMgPSBDaGVja1J1bm5lcjtcbiJdLCJtYXBwaW5ncyI6Ijs7QUFBQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQTRDO0FBQUE7QUFBQTtBQUU1QztBQUNBO0FBQ0E7QUFDQTtBQUNBLE1BQU1BLFdBQVcsQ0FBQztFQUNoQjtBQUNGO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtFQUNFQyxXQUFXLENBQUNDLE1BQU0sR0FBRyxDQUFDLENBQUMsRUFBRTtJQUN2QixJQUFJLENBQUNDLGVBQWUsQ0FBQ0QsTUFBTSxDQUFDO0lBQzVCLE1BQU07TUFBRUUsV0FBVyxHQUFHLEtBQUs7TUFBRUMsY0FBYyxHQUFHLEtBQUs7TUFBRUMsV0FBVyxHQUFHQztJQUFZLENBQUMsR0FBR0wsTUFBTTtJQUN6RixJQUFJLENBQUNFLFdBQVcsR0FBR0EsV0FBVztJQUM5QixJQUFJLENBQUNDLGNBQWMsR0FBR0EsY0FBYztJQUNwQyxJQUFJLENBQUNDLFdBQVcsR0FBR0EsV0FBVztFQUNoQzs7RUFFQTtBQUNGO0FBQ0E7QUFDQTtBQUNBO0VBQ0UsTUFBTUUsR0FBRyxDQUFDO0lBQUVDLE9BQU8sR0FBRztFQUFRLENBQUMsR0FBRyxDQUFDLENBQUMsRUFBRTtJQUNwQztJQUNBLE1BQU1DLE1BQU0sR0FBR0MsTUFBTSxDQUFDQyxNQUFNLENBQUMsSUFBSSxDQUFDTixXQUFXLENBQUMsQ0FDM0NPLE1BQU0sQ0FBQ0MsQ0FBQyxJQUFJLE9BQU9BLENBQUMsS0FBSyxVQUFVLENBQUMsQ0FDcENDLEdBQUcsQ0FBQ0MsVUFBVSxJQUFJLElBQUlBLFVBQVUsRUFBRSxDQUFDOztJQUV0QztJQUNBTixNQUFNLENBQUNPLE9BQU8sQ0FBQ0MsS0FBSyxJQUFJQSxLQUFLLENBQUNWLEdBQUcsRUFBRSxDQUFDOztJQUVwQztJQUNBLE1BQU1XLE1BQU0sR0FBRyxJQUFJLENBQUNDLGVBQWUsQ0FBQztNQUFFVixNQUFNO01BQUVEO0lBQVEsQ0FBQyxDQUFDOztJQUV4RDtJQUNBLElBQUksSUFBSSxDQUFDSixjQUFjLEVBQUU7TUFDdkIsSUFBSSxDQUFDZ0IsVUFBVSxDQUFDRixNQUFNLENBQUM7SUFDekI7SUFDQSxPQUFPQSxNQUFNO0VBQ2Y7O0VBRUE7QUFDRjtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7QUFDQTtBQUNBO0FBQ0E7RUFDRUMsZUFBZSxDQUFDO0lBQUVWLE1BQU07SUFBRUQ7RUFBUSxDQUFDLEVBQUU7SUFDbkM7SUFDQSxNQUFNVSxNQUFNLEdBQUc7TUFDYkEsTUFBTSxFQUFFO1FBQ05WLE9BQU87UUFDUGEsS0FBSyxFQUFFQyxpQkFBVSxDQUFDQyxPQUFPO1FBQ3pCZCxNQUFNLEVBQUU7TUFDVjtJQUNGLENBQUM7O0lBRUQ7SUFDQSxRQUFRRCxPQUFPO01BQ2IsS0FBSyxPQUFPO01BQ1o7UUFDRTtRQUNBLEtBQUssTUFBTVMsS0FBSyxJQUFJUixNQUFNLEVBQUU7VUFDMUI7VUFDQSxNQUFNZSxXQUFXLEdBQUc7WUFDbEJDLElBQUksRUFBRVIsS0FBSyxDQUFDUSxJQUFJLEVBQUU7WUFDbEJKLEtBQUssRUFBRUMsaUJBQVUsQ0FBQ0MsT0FBTztZQUN6QkcsTUFBTSxFQUFFO1VBQ1YsQ0FBQzs7VUFFRDtVQUNBRixXQUFXLENBQUNFLE1BQU0sR0FBR1QsS0FBSyxDQUFDUyxNQUFNLEVBQUUsQ0FBQ1osR0FBRyxDQUFDYSxLQUFLLElBQUk7WUFDL0MsTUFBTUMsV0FBVyxHQUFHO2NBQ2xCQyxLQUFLLEVBQUVGLEtBQUssQ0FBQ0UsS0FBSztjQUNsQlIsS0FBSyxFQUFFTSxLQUFLLENBQUNHLFVBQVU7WUFDekIsQ0FBQztZQUNELElBQUlILEtBQUssQ0FBQ0csVUFBVSxFQUFFLElBQUlSLGlCQUFVLENBQUNTLElBQUksRUFBRTtjQUN6Q0gsV0FBVyxDQUFDSSxPQUFPLEdBQUdMLEtBQUssQ0FBQ0ssT0FBTztjQUNuQ0osV0FBVyxDQUFDSyxRQUFRLEdBQUdOLEtBQUssQ0FBQ00sUUFBUTtjQUNyQ2YsTUFBTSxDQUFDQSxNQUFNLENBQUNHLEtBQUssR0FBR0MsaUJBQVUsQ0FBQ1MsSUFBSTtjQUNyQ1AsV0FBVyxDQUFDSCxLQUFLLEdBQUdDLGlCQUFVLENBQUNTLElBQUk7WUFDckM7WUFDQSxPQUFPSCxXQUFXO1VBQ3BCLENBQUMsQ0FBQztVQUVGVixNQUFNLENBQUNBLE1BQU0sQ0FBQ1QsTUFBTSxDQUFDeUIsSUFBSSxDQUFDVixXQUFXLENBQUM7UUFDeEM7SUFBQztJQUVMLE9BQU9OLE1BQU07RUFDZjs7RUFFQTtBQUNGO0FBQ0E7QUFDQTtFQUNFRSxVQUFVLENBQUNGLE1BQU0sRUFBRTtJQUNqQjtJQUNBLE1BQU1pQixHQUFHLEdBQ1BqQixNQUFNLENBQUNBLE1BQU0sQ0FBQ0csS0FBSyxJQUFJQyxpQkFBVSxDQUFDQyxPQUFPLEdBQUdhLENBQUMsSUFBSUMsZUFBTSxDQUFDQyxJQUFJLENBQUNGLENBQUMsQ0FBQyxHQUFHQSxDQUFDLElBQUlDLGVBQU0sQ0FBQ0UsSUFBSSxDQUFDSCxDQUFDLENBQUM7O0lBRXZGO0lBQ0EsTUFBTUksTUFBTSxHQUFHLEtBQUs7SUFDcEIsSUFBSUMsTUFBTSxHQUFHLEVBQUU7SUFDZixJQUFJQyxXQUFXLEdBQUcsQ0FBQztJQUNuQixJQUFJQyxpQkFBaUIsR0FBRyxDQUFDO0lBQ3pCLElBQUlDLGlCQUFpQixHQUFHLENBQUM7O0lBRXpCO0lBQ0EsS0FBSyxNQUFNM0IsS0FBSyxJQUFJQyxNQUFNLENBQUNBLE1BQU0sQ0FBQ1QsTUFBTSxFQUFFO01BQ3hDZ0MsTUFBTSxJQUFLLE9BQU14QixLQUFLLENBQUNRLElBQUssRUFBQztNQUU3QixLQUFLLE1BQU1FLEtBQUssSUFBSVYsS0FBSyxDQUFDUyxNQUFNLEVBQUU7UUFDaENnQixXQUFXLEVBQUU7UUFDYkQsTUFBTSxJQUFLLEtBQUlELE1BQU8sR0FBRSxJQUFJLENBQUNLLG1CQUFtQixDQUFDbEIsS0FBSyxDQUFDTixLQUFLLENBQUUsSUFBR00sS0FBSyxDQUFDRSxLQUFNLEVBQUM7UUFFOUUsSUFBSUYsS0FBSyxDQUFDTixLQUFLLElBQUlDLGlCQUFVLENBQUNTLElBQUksRUFBRTtVQUNsQ1ksaUJBQWlCLEVBQUU7VUFDbkJGLE1BQU0sSUFBSyxLQUFJRCxNQUFPLEdBQUVBLE1BQU8sWUFBV2IsS0FBSyxDQUFDSyxPQUFRLEVBQUM7VUFDekRTLE1BQU0sSUFBSyxJQUFHZCxLQUFLLENBQUNNLFFBQVMsRUFBQztRQUNoQyxDQUFDLE1BQU0sSUFBSU4sS0FBSyxDQUFDTixLQUFLLElBQUlDLGlCQUFVLENBQUN3QixJQUFJLEVBQUU7VUFDekNGLGlCQUFpQixFQUFFO1VBQ25CSCxNQUFNLElBQUssS0FBSUQsTUFBTyxHQUFFQSxNQUFPLCtFQUE4RTtRQUMvRztNQUNGO0lBQ0Y7SUFFQUMsTUFBTSxHQUNILHVDQUFzQyxHQUN0Qyx1Q0FBc0MsR0FDdEMsdUNBQXNDLEdBQ3RDLHVDQUFzQyxHQUN0Qyx1Q0FBc0MsR0FDdEMsSUFBRyxHQUNILEtBQ0NFLGlCQUFpQixHQUFHLENBQUMsR0FBRyxXQUFXLEdBQUcsRUFDdkMsR0FBRUEsaUJBQWtCLGtDQUFpQ0EsaUJBQWlCLEdBQUcsQ0FBQyxHQUFHLEdBQUcsR0FBRyxFQUFHLEVBQUMsR0FDdkYsS0FBSUQsV0FBWSxvQkFBbUIsR0FDbkMsS0FBSUUsaUJBQWtCLG1CQUFrQixHQUN4QyxJQUFHLEdBQ0gsR0FBRUgsTUFBTyxFQUFDOztJQUViO0lBQ0FOLEdBQUcsQ0FBQ00sTUFBTSxDQUFDO0VBQ2I7O0VBRUE7QUFDRjtBQUNBO0FBQ0E7QUFDQTtFQUNFSSxtQkFBbUIsQ0FBQ3hCLEtBQUssRUFBRTtJQUN6QixRQUFRQSxLQUFLO01BQ1gsS0FBS0MsaUJBQVUsQ0FBQ0MsT0FBTztRQUNyQixPQUFPLEdBQUc7TUFDWixLQUFLRCxpQkFBVSxDQUFDUyxJQUFJO1FBQ2xCLE9BQU8sR0FBRztNQUNaO1FBQ0UsT0FBTyxJQUFJO0lBQUM7RUFFbEI7O0VBRUE7QUFDRjtBQUNBO0FBQ0E7RUFDRTdCLGVBQWUsQ0FBQzZDLE1BQU0sRUFBRTtJQUN0QkMsY0FBSyxDQUFDQyxjQUFjLENBQUNGLE1BQU0sRUFBRTtNQUMzQjVDLFdBQVcsRUFBRTtRQUFFK0MsQ0FBQyxFQUFFLFNBQVM7UUFBRUMsQ0FBQyxFQUFFQyxpQkFBUztRQUFFQyxDQUFDLEVBQUU7TUFBSyxDQUFDO01BQ3BEakQsY0FBYyxFQUFFO1FBQUU4QyxDQUFDLEVBQUUsU0FBUztRQUFFQyxDQUFDLEVBQUVDLGlCQUFTO1FBQUVDLENBQUMsRUFBRTtNQUFLLENBQUM7TUFDdkRoRCxXQUFXLEVBQUU7UUFBRTZDLENBQUMsRUFBRSxPQUFPO1FBQUVDLENBQUMsRUFBRUcsZUFBTztRQUFFRCxDQUFDLEVBQUU7TUFBSztJQUNqRCxDQUFDLENBQUM7RUFDSjtBQUNGO0FBRUFFLE1BQU0sQ0FBQ0MsT0FBTyxHQUFHekQsV0FBVyJ9