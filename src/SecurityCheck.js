import { _registerCheck, _getChecks } from './SecurityCheckStore';
import logger from './logger';
class SecurityCheck {
  constructor(data) {
    const { group, title, warning, check, failed, success } = data;
    try {
      if (!group || !title || !warning) {
        throw 'Security checks must have a group, title, and a warning.';
      }
      if (typeof group !== 'string') {
        throw '"group" of the security check must be a string, e.g Parse.SecurityCheck.Category.Database';
      }
      if (typeof success !== 'string') {
        throw '"success" message of the security check must be a string.';
      }
      if (typeof title !== 'string') {
        throw '"title" of the security check must be a string.';
      }
      if (typeof warning !== 'string') {
        throw '"warning" message of the security check must be a string.';
      }
      if (check && typeof check !== 'function') {
        throw '"check" of the security check must be a function.';
      }
      this.group = group;
      this.title = title;
      this.warning = warning;
      this.check = check;
      this.failed = failed;
      this.success = success;
    } catch (e) {
      logger.error(e);
      return;
    }
    _registerCheck(this);
  }
  async run() {
    try {
      if (this.failed) {
        throw 'Check failed.';
      }
      if (!this.check) {
        return {
          result: 'success',
        };
      }
      const result = await this.check();
      if (result != null && result === false) {
        throw 'Check failed.';
      }
      return {
        result: 'success',
      };
    } catch (error) {
      return {
        result: 'fail',
        error,
      };
    }
  }
  setFailed() {
    this.failed = true;
  }
}
SecurityCheck.Category = {
  Database: 'Database',
  CLP: 'CLP',
  ServerConfiguration: 'ServerConfiguration',
};
SecurityCheck.getChecks = async () => {
  const checks = _getChecks();
  const resultsByGroup = {};
  let total = 0;
  const resolveSecurityCheck = async check => {
    const { group, title, warning, success } = check;
    const { result, error } = await check.run();
    const category = resultsByGroup[group] || [];
    category.push({
      title,
      warning,
      error,
      result,
      success,
    });
    resultsByGroup[group] = category;
    if (result != 'success') {
      total++;
    }
  };
  const promises = [];
  for (const check of checks) {
    promises.push(resolveSecurityCheck(check));
  }
  await Promise.all(promises);
  resultsByGroup.Total = total;
  return resultsByGroup;
};
module.exports = SecurityCheck;
