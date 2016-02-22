/**g
   * Classify the device token of installations based on its device type.
   * @param {Object} installations An array of installations
   * @param {Array} validPushTypes An array of valid push types(string)
   * @returns {Object} A map whose key is device type and value is an array of device
   */
export function classifyInstallations(installations, validPushTypes) {
  // Init deviceTokenMap, create a empty array for each valid pushType
  let deviceMap = {};
  for (let validPushType of validPushTypes) {
    deviceMap[validPushType] = [];
  }
  for (let installation of installations) {
    // No deviceToken, ignore
    if (!installation.deviceToken) {
      continue;
    }
    let pushType = installation.deviceType;
    if (deviceMap[pushType]) {
      deviceMap[pushType].push({
        deviceToken: installation.deviceToken,
        appIdentifier: installation.appIdentifier
      });
    } else {
      console.log('Unknown push type from installation %j', installation);
    }
  }
  return deviceMap;
}

