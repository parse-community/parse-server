const securityCheckStore = [];
module.exports = {
  _registerCheck(securityCheck) {
    for (const [i, check] of securityCheckStore.entries()) {
      if (check.title == securityCheck.title && check.warning == securityCheck.warning) {
        securityCheckStore[i] = securityCheck;
        return;
      }
    }
    securityCheckStore.push(securityCheck);
  },
  _getChecks() {
    return securityCheckStore;
  },
};
