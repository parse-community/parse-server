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
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfVXRpbHMiLCJfaW50ZXJvcFJlcXVpcmVEZWZhdWx0IiwicmVxdWlyZSIsIl9DaGVjayIsIkNoZWNrR3JvdXBzIiwiX2ludGVyb3BSZXF1aXJlV2lsZGNhcmQiLCJfbG9nZ2VyIiwiX2xvZGFzaCIsIl9nZXRSZXF1aXJlV2lsZGNhcmRDYWNoZSIsIm5vZGVJbnRlcm9wIiwiV2Vha01hcCIsImNhY2hlQmFiZWxJbnRlcm9wIiwiY2FjaGVOb2RlSW50ZXJvcCIsIm9iaiIsIl9fZXNNb2R1bGUiLCJkZWZhdWx0IiwiY2FjaGUiLCJoYXMiLCJnZXQiLCJuZXdPYmoiLCJoYXNQcm9wZXJ0eURlc2NyaXB0b3IiLCJPYmplY3QiLCJkZWZpbmVQcm9wZXJ0eSIsImdldE93blByb3BlcnR5RGVzY3JpcHRvciIsImtleSIsInByb3RvdHlwZSIsImhhc093blByb3BlcnR5IiwiY2FsbCIsImRlc2MiLCJzZXQiLCJDaGVja1J1bm5lciIsImNvbnN0cnVjdG9yIiwiY29uZmlnIiwiX3ZhbGlkYXRlUGFyYW1zIiwiZW5hYmxlQ2hlY2siLCJlbmFibGVDaGVja0xvZyIsImNoZWNrR3JvdXBzIiwicnVuIiwidmVyc2lvbiIsImdyb3VwcyIsInZhbHVlcyIsImZpbHRlciIsImMiLCJtYXAiLCJDaGVja0dyb3VwIiwiZm9yRWFjaCIsImdyb3VwIiwicmVwb3J0IiwiX2dlbmVyYXRlUmVwb3J0IiwiX2xvZ1JlcG9ydCIsInN0YXRlIiwiQ2hlY2tTdGF0ZSIsInN1Y2Nlc3MiLCJncm91cFJlcG9ydCIsIm5hbWUiLCJjaGVja3MiLCJjaGVjayIsImNoZWNrUmVwb3J0IiwidGl0bGUiLCJjaGVja1N0YXRlIiwiZmFpbCIsIndhcm5pbmciLCJzb2x1dGlvbiIsInB1c2giLCJsb2ciLCJzIiwibG9nZ2VyIiwiaW5mbyIsIndhcm4iLCJpbmRlbnQiLCJvdXRwdXQiLCJjaGVja3NDb3VudCIsImZhaWxlZENoZWNrc0NvdW50Iiwic2tpcHBlZENoZWNrQ291bnQiLCJfZ2V0TG9nSWNvbkZvclN0YXRlIiwibm9uZSIsInBhcmFtcyIsIlV0aWxzIiwidmFsaWRhdGVQYXJhbXMiLCJ0IiwidiIsImlzQm9vbGVhbiIsIm8iLCJpc0FycmF5IiwibW9kdWxlIiwiZXhwb3J0cyJdLCJzb3VyY2VzIjpbIi4uLy4uL3NyYy9TZWN1cml0eS9DaGVja1J1bm5lci5qcyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgVXRpbHMgZnJvbSAnLi4vVXRpbHMnO1xuaW1wb3J0IHsgQ2hlY2tTdGF0ZSB9IGZyb20gJy4vQ2hlY2snO1xuaW1wb3J0ICogYXMgQ2hlY2tHcm91cHMgZnJvbSAnLi9DaGVja0dyb3Vwcy9DaGVja0dyb3Vwcyc7XG5pbXBvcnQgbG9nZ2VyIGZyb20gJy4uL2xvZ2dlcic7XG5pbXBvcnQgeyBpc0FycmF5LCBpc0Jvb2xlYW4gfSBmcm9tICdsb2Rhc2gnO1xuXG4vKipcbiAqIFRoZSBzZWN1cml0eSBjaGVjayBydW5uZXIuXG4gKiBAbWVtYmVyb2YgbW9kdWxlOlNlY3VyaXR5Q2hlY2tcbiAqL1xuY2xhc3MgQ2hlY2tSdW5uZXIge1xuICAvKipcbiAgICogVGhlIHNlY3VyaXR5IGNoZWNrIHJ1bm5lci5cbiAgICogQHBhcmFtIHtPYmplY3R9IFtjb25maWddIFRoZSBjb25maWd1cmF0aW9uIG9wdGlvbnMuXG4gICAqIEBwYXJhbSB7Qm9vbGVhbn0gW2NvbmZpZy5lbmFibGVDaGVjaz1mYWxzZV0gSXMgdHJ1ZSBpZiBQYXJzZSBTZXJ2ZXIgc2hvdWxkIHJlcG9ydCB3ZWFrIHNlY3VyaXR5IHNldHRpbmdzLlxuICAgKiBAcGFyYW0ge0Jvb2xlYW59IFtjb25maWcuZW5hYmxlQ2hlY2tMb2c9ZmFsc2VdIElzIHRydWUgaWYgdGhlIHNlY3VyaXR5IGNoZWNrIHJlcG9ydCBzaG91bGQgYmUgd3JpdHRlbiB0byBsb2dzLlxuICAgKiBAcGFyYW0ge09iamVjdH0gW2NvbmZpZy5jaGVja0dyb3Vwc10gVGhlIGNoZWNrIGdyb3VwcyB0byBydW4uIERlZmF1bHQgYXJlIHRoZSBncm91cHMgZGVmaW5lZCBpbiBgLi9DaGVja0dyb3Vwcy9DaGVja0dyb3Vwcy5qc2AuXG4gICAqL1xuICBjb25zdHJ1Y3Rvcihjb25maWcgPSB7fSkge1xuICAgIHRoaXMuX3ZhbGlkYXRlUGFyYW1zKGNvbmZpZyk7XG4gICAgY29uc3QgeyBlbmFibGVDaGVjayA9IGZhbHNlLCBlbmFibGVDaGVja0xvZyA9IGZhbHNlLCBjaGVja0dyb3VwcyA9IENoZWNrR3JvdXBzIH0gPSBjb25maWc7XG4gICAgdGhpcy5lbmFibGVDaGVjayA9IGVuYWJsZUNoZWNrO1xuICAgIHRoaXMuZW5hYmxlQ2hlY2tMb2cgPSBlbmFibGVDaGVja0xvZztcbiAgICB0aGlzLmNoZWNrR3JvdXBzID0gY2hlY2tHcm91cHM7XG4gIH1cblxuICAvKipcbiAgICogUnVucyBhbGwgc2VjdXJpdHkgY2hlY2tzIGFuZCByZXR1cm5zIHRoZSByZXN1bHRzLlxuICAgKiBAcGFyYW1zXG4gICAqIEByZXR1cm5zIHtPYmplY3R9IFRoZSBzZWN1cml0eSBjaGVjayByZXBvcnQuXG4gICAqL1xuICBhc3luYyBydW4oeyB2ZXJzaW9uID0gJzEuMC4wJyB9ID0ge30pIHtcbiAgICAvLyBJbnN0YW50aWF0ZSBjaGVjayBncm91cHNcbiAgICBjb25zdCBncm91cHMgPSBPYmplY3QudmFsdWVzKHRoaXMuY2hlY2tHcm91cHMpXG4gICAgICAuZmlsdGVyKGMgPT4gdHlwZW9mIGMgPT09ICdmdW5jdGlvbicpXG4gICAgICAubWFwKENoZWNrR3JvdXAgPT4gbmV3IENoZWNrR3JvdXAoKSk7XG5cbiAgICAvLyBSdW4gY2hlY2tzXG4gICAgZ3JvdXBzLmZvckVhY2goZ3JvdXAgPT4gZ3JvdXAucnVuKCkpO1xuXG4gICAgLy8gR2VuZXJhdGUgSlNPTiByZXBvcnRcbiAgICBjb25zdCByZXBvcnQgPSB0aGlzLl9nZW5lcmF0ZVJlcG9ydCh7IGdyb3VwcywgdmVyc2lvbiB9KTtcblxuICAgIC8vIElmIHJlcG9ydCBzaG91bGQgYmUgd3JpdHRlbiB0byBsb2dzXG4gICAgaWYgKHRoaXMuZW5hYmxlQ2hlY2tMb2cpIHtcbiAgICAgIHRoaXMuX2xvZ1JlcG9ydChyZXBvcnQpO1xuICAgIH1cbiAgICByZXR1cm4gcmVwb3J0O1xuICB9XG5cbiAgLyoqXG4gICAqIEdlbmVyYXRlcyBhIHNlY3VyaXR5IGNoZWNrIHJlcG9ydCBpbiBKU09OIGZvcm1hdCB3aXRoIHNjaGVtYTpcbiAgICogYGBgXG4gICAqIHtcbiAgICogICAgcmVwb3J0OiB7XG4gICAqICAgICAgdmVyc2lvbjogXCIxLjAuMFwiLCAvLyBUaGUgcmVwb3J0IHZlcnNpb24sIGRlZmluZXMgdGhlIHNjaGVtYVxuICAgKiAgICAgIHN0YXRlOiBcImZhaWxcIiAgICAgLy8gVGhlIGRpc2p1bmN0aXZlIGluZGljYXRvciBvZiBmYWlsZWQgY2hlY2tzIGluIGFsbCBncm91cHMuXG4gICAqICAgICAgZ3JvdXBzOiBbICAgICAgICAgLy8gVGhlIGNoZWNrIGdyb3Vwc1xuICAgKiAgICAgICAge1xuICAgKiAgICAgICAgICBuYW1lOiBcIkhvdXNlXCIsICAgICAgICAgICAgLy8gVGhlIGdyb3VwIG5hbWVcbiAgICogICAgICAgICAgc3RhdGU6IFwiZmFpbFwiICAgICAgICAgICAgIC8vIFRoZSBkaXNqdW5jdGl2ZSBpbmRpY2F0b3Igb2YgZmFpbGVkIGNoZWNrcyBpbiB0aGlzIGdyb3VwLlxuICAgKiAgICAgICAgICBjaGVja3M6IFsgICAgICAgICAgICAgICAgIC8vIFRoZSBjaGVja3NcbiAgICogICAgICAgICAgICB0aXRsZTogXCJEb29yIGxvY2tlZFwiLCAgIC8vIFRoZSBjaGVjayB0aXRsZVxuICAgKiAgICAgICAgICAgIHN0YXRlOiBcImZhaWxcIiAgICAgICAgICAgLy8gVGhlIGNoZWNrIHN0YXRlXG4gICAqICAgICAgICAgICAgd2FybmluZzogXCJBbnlvbmUgY2FuIGVudGVyIHlvdXIgaG91c2UuXCIgICAvLyBUaGUgd2FybmluZy5cbiAgICogICAgICAgICAgICBzb2x1dGlvbjogXCJMb2NrIHlvdXIgZG9vci5cIiAgICAgICAgICAgICAgIC8vIFRoZSBzb2x1dGlvbi5cbiAgICogICAgICAgICAgXVxuICAgKiAgICAgICAgfSxcbiAgICogICAgICAgIC4uLlxuICAgKiAgICAgIF1cbiAgICogICAgfVxuICAgKiB9XG4gICAqIGBgYFxuICAgKiBAcGFyYW0ge09iamVjdH0gcGFyYW1zIFRoZSBwYXJhbWV0ZXJzLlxuICAgKiBAcGFyYW0ge0FycmF5PENoZWNrR3JvdXA+fSBwYXJhbXMuZ3JvdXBzIFRoZSBjaGVjayBncm91cHMuXG4gICAqIEBwYXJhbSB7U3RyaW5nfSBwYXJhbXMudmVyc2lvbjogVGhlIHJlcG9ydCBzY2hlbWEgdmVyc2lvbi5cbiAgICogQHJldHVybnMge09iamVjdH0gVGhlIHJlcG9ydC5cbiAgICovXG4gIF9nZW5lcmF0ZVJlcG9ydCh7IGdyb3VwcywgdmVyc2lvbiB9KSB7XG4gICAgLy8gQ3JlYXRlIHJlcG9ydCB0ZW1wbGF0ZVxuICAgIGNvbnN0IHJlcG9ydCA9IHtcbiAgICAgIHJlcG9ydDoge1xuICAgICAgICB2ZXJzaW9uLFxuICAgICAgICBzdGF0ZTogQ2hlY2tTdGF0ZS5zdWNjZXNzLFxuICAgICAgICBncm91cHM6IFtdLFxuICAgICAgfSxcbiAgICB9O1xuXG4gICAgLy8gSWRlbnRpZnkgcmVwb3J0IHZlcnNpb25cbiAgICBzd2l0Y2ggKHZlcnNpb24pIHtcbiAgICAgIGNhc2UgJzEuMC4wJzpcbiAgICAgIGRlZmF1bHQ6XG4gICAgICAgIC8vIEZvciBlYWNoIGNoZWNrIGdyb3VwXG4gICAgICAgIGZvciAoY29uc3QgZ3JvdXAgb2YgZ3JvdXBzKSB7XG4gICAgICAgICAgLy8gQ3JlYXRlIGdyb3VwIHJlcG9ydFxuICAgICAgICAgIGNvbnN0IGdyb3VwUmVwb3J0ID0ge1xuICAgICAgICAgICAgbmFtZTogZ3JvdXAubmFtZSgpLFxuICAgICAgICAgICAgc3RhdGU6IENoZWNrU3RhdGUuc3VjY2VzcyxcbiAgICAgICAgICAgIGNoZWNrczogW10sXG4gICAgICAgICAgfTtcblxuICAgICAgICAgIC8vIENyZWF0ZSBjaGVjayByZXBvcnRzXG4gICAgICAgICAgZ3JvdXBSZXBvcnQuY2hlY2tzID0gZ3JvdXAuY2hlY2tzKCkubWFwKGNoZWNrID0+IHtcbiAgICAgICAgICAgIGNvbnN0IGNoZWNrUmVwb3J0ID0ge1xuICAgICAgICAgICAgICB0aXRsZTogY2hlY2sudGl0bGUsXG4gICAgICAgICAgICAgIHN0YXRlOiBjaGVjay5jaGVja1N0YXRlKCksXG4gICAgICAgICAgICB9O1xuICAgICAgICAgICAgaWYgKGNoZWNrLmNoZWNrU3RhdGUoKSA9PSBDaGVja1N0YXRlLmZhaWwpIHtcbiAgICAgICAgICAgICAgY2hlY2tSZXBvcnQud2FybmluZyA9IGNoZWNrLndhcm5pbmc7XG4gICAgICAgICAgICAgIGNoZWNrUmVwb3J0LnNvbHV0aW9uID0gY2hlY2suc29sdXRpb247XG4gICAgICAgICAgICAgIHJlcG9ydC5yZXBvcnQuc3RhdGUgPSBDaGVja1N0YXRlLmZhaWw7XG4gICAgICAgICAgICAgIGdyb3VwUmVwb3J0LnN0YXRlID0gQ2hlY2tTdGF0ZS5mYWlsO1xuICAgICAgICAgICAgfVxuICAgICAgICAgICAgcmV0dXJuIGNoZWNrUmVwb3J0O1xuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgcmVwb3J0LnJlcG9ydC5ncm91cHMucHVzaChncm91cFJlcG9ydCk7XG4gICAgICAgIH1cbiAgICB9XG4gICAgcmV0dXJuIHJlcG9ydDtcbiAgfVxuXG4gIC8qKlxuICAgKiBMb2dzIHRoZSBzZWN1cml0eSBjaGVjayByZXBvcnQuXG4gICAqIEBwYXJhbSB7T2JqZWN0fSByZXBvcnQgVGhlIHJlcG9ydCB0byBsb2cuXG4gICAqL1xuICBfbG9nUmVwb3J0KHJlcG9ydCkge1xuICAgIC8vIERldGVybWluZSBsb2cgbGV2ZWwgZGVwZW5kaW5nIG9uIHdoZXRoZXIgYW55IGNoZWNrIGZhaWxlZFxuICAgIGNvbnN0IGxvZyA9XG4gICAgICByZXBvcnQucmVwb3J0LnN0YXRlID09IENoZWNrU3RhdGUuc3VjY2VzcyA/IHMgPT4gbG9nZ2VyLmluZm8ocykgOiBzID0+IGxvZ2dlci53YXJuKHMpO1xuXG4gICAgLy8gRGVjbGFyZSBvdXRwdXRcbiAgICBjb25zdCBpbmRlbnQgPSAnICAgJztcbiAgICBsZXQgb3V0cHV0ID0gJyc7XG4gICAgbGV0IGNoZWNrc0NvdW50ID0gMDtcbiAgICBsZXQgZmFpbGVkQ2hlY2tzQ291bnQgPSAwO1xuICAgIGxldCBza2lwcGVkQ2hlY2tDb3VudCA9IDA7XG5cbiAgICAvLyBUcmF2ZXJzZSBhbGwgZ3JvdXBzIGFuZCBjaGVja3MgZm9yIGNvbXBvc2Ugb3V0cHV0XG4gICAgZm9yIChjb25zdCBncm91cCBvZiByZXBvcnQucmVwb3J0Lmdyb3Vwcykge1xuICAgICAgb3V0cHV0ICs9IGBcXG4tICR7Z3JvdXAubmFtZX1gO1xuXG4gICAgICBmb3IgKGNvbnN0IGNoZWNrIG9mIGdyb3VwLmNoZWNrcykge1xuICAgICAgICBjaGVja3NDb3VudCsrO1xuICAgICAgICBvdXRwdXQgKz0gYFxcbiR7aW5kZW50fSR7dGhpcy5fZ2V0TG9nSWNvbkZvclN0YXRlKGNoZWNrLnN0YXRlKX0gJHtjaGVjay50aXRsZX1gO1xuXG4gICAgICAgIGlmIChjaGVjay5zdGF0ZSA9PSBDaGVja1N0YXRlLmZhaWwpIHtcbiAgICAgICAgICBmYWlsZWRDaGVja3NDb3VudCsrO1xuICAgICAgICAgIG91dHB1dCArPSBgXFxuJHtpbmRlbnR9JHtpbmRlbnR9V2FybmluZzogJHtjaGVjay53YXJuaW5nfWA7XG4gICAgICAgICAgb3V0cHV0ICs9IGAgJHtjaGVjay5zb2x1dGlvbn1gO1xuICAgICAgICB9IGVsc2UgaWYgKGNoZWNrLnN0YXRlID09IENoZWNrU3RhdGUubm9uZSkge1xuICAgICAgICAgIHNraXBwZWRDaGVja0NvdW50Kys7XG4gICAgICAgICAgb3V0cHV0ICs9IGBcXG4ke2luZGVudH0ke2luZGVudH1UZXN0IGRpZCBub3QgZXhlY3V0ZSwgdGhpcyBpcyBsaWtlbHkgYW4gaW50ZXJuYWwgc2VydmVyIGlzc3VlLCBwbGVhc2UgcmVwb3J0LmA7XG4gICAgICAgIH1cbiAgICAgIH1cbiAgICB9XG5cbiAgICBvdXRwdXQgPVxuICAgICAgYFxcbiMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjYCArXG4gICAgICBgXFxuIyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICNgICtcbiAgICAgIGBcXG4jICAgUGFyc2UgU2VydmVyIFNlY3VyaXR5IENoZWNrICAgI2AgK1xuICAgICAgYFxcbiMgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAjYCArXG4gICAgICBgXFxuIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyNgICtcbiAgICAgIGBcXG5gICtcbiAgICAgIGBcXG4ke1xuICAgICAgICBmYWlsZWRDaGVja3NDb3VudCA+IDAgPyAnV2FybmluZzogJyA6ICcnXG4gICAgICB9JHtmYWlsZWRDaGVja3NDb3VudH0gd2VhayBzZWN1cml0eSBzZXR0aW5nKHMpIGZvdW5kJHtmYWlsZWRDaGVja3NDb3VudCA+IDAgPyAnIScgOiAnJ31gICtcbiAgICAgIGBcXG4ke2NoZWNrc0NvdW50fSBjaGVjayhzKSBleGVjdXRlZGAgK1xuICAgICAgYFxcbiR7c2tpcHBlZENoZWNrQ291bnR9IGNoZWNrKHMpIHNraXBwZWRgICtcbiAgICAgIGBcXG5gICtcbiAgICAgIGAke291dHB1dH1gO1xuXG4gICAgLy8gV3JpdGUgbG9nXG4gICAgbG9nKG91dHB1dCk7XG4gIH1cblxuICAvKipcbiAgICogUmV0dXJucyBhbiBpY29uIGZvciB1c2UgaW4gdGhlIHJlcG9ydCBsb2cgb3V0cHV0LlxuICAgKiBAcGFyYW0ge0NoZWNrU3RhdGV9IHN0YXRlIFRoZSBjaGVjayBzdGF0ZS5cbiAgICogQHJldHVybnMge1N0cmluZ30gVGhlIGljb24uXG4gICAqL1xuICBfZ2V0TG9nSWNvbkZvclN0YXRlKHN0YXRlKSB7XG4gICAgc3dpdGNoIChzdGF0ZSkge1xuICAgICAgY2FzZSBDaGVja1N0YXRlLnN1Y2Nlc3M6XG4gICAgICAgIHJldHVybiAn4pyFJztcbiAgICAgIGNhc2UgQ2hlY2tTdGF0ZS5mYWlsOlxuICAgICAgICByZXR1cm4gJ+KdjCc7XG4gICAgICBkZWZhdWx0OlxuICAgICAgICByZXR1cm4gJ+KEue+4jyc7XG4gICAgfVxuICB9XG5cbiAgLyoqXG4gICAqIFZhbGlkYXRlcyB0aGUgY29uc3RydWN0b3IgcGFyYW1ldGVycy5cbiAgICogQHBhcmFtIHtPYmplY3R9IHBhcmFtcyBUaGUgcGFyYW1ldGVycyB0byB2YWxpZGF0ZS5cbiAgICovXG4gIF92YWxpZGF0ZVBhcmFtcyhwYXJhbXMpIHtcbiAgICBVdGlscy52YWxpZGF0ZVBhcmFtcyhwYXJhbXMsIHtcbiAgICAgIGVuYWJsZUNoZWNrOiB7IHQ6ICdib29sZWFuJywgdjogaXNCb29sZWFuLCBvOiB0cnVlIH0sXG4gICAgICBlbmFibGVDaGVja0xvZzogeyB0OiAnYm9vbGVhbicsIHY6IGlzQm9vbGVhbiwgbzogdHJ1ZSB9LFxuICAgICAgY2hlY2tHcm91cHM6IHsgdDogJ2FycmF5JywgdjogaXNBcnJheSwgbzogdHJ1ZSB9LFxuICAgIH0pO1xuICB9XG59XG5cbm1vZHVsZS5leHBvcnRzID0gQ2hlY2tSdW5uZXI7XG4iXSwibWFwcGluZ3MiOiI7O0FBQUEsSUFBQUEsTUFBQSxHQUFBQyxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUMsTUFBQSxHQUFBRCxPQUFBO0FBQ0EsSUFBQUUsV0FBQSxHQUFBQyx1QkFBQSxDQUFBSCxPQUFBO0FBQ0EsSUFBQUksT0FBQSxHQUFBTCxzQkFBQSxDQUFBQyxPQUFBO0FBQ0EsSUFBQUssT0FBQSxHQUFBTCxPQUFBO0FBQTRDLFNBQUFNLHlCQUFBQyxXQUFBLGVBQUFDLE9BQUEsa0NBQUFDLGlCQUFBLE9BQUFELE9BQUEsUUFBQUUsZ0JBQUEsT0FBQUYsT0FBQSxZQUFBRix3QkFBQSxZQUFBQSxDQUFBQyxXQUFBLFdBQUFBLFdBQUEsR0FBQUcsZ0JBQUEsR0FBQUQsaUJBQUEsS0FBQUYsV0FBQTtBQUFBLFNB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