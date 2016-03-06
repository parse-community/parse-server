/**
 * features.js
 * Feature config file that holds information on the features that are currently
 * available on Parse Server. This is primarily created to work with an UI interface
 * like the web dashboard. The list of features will change depending on the your
 * app, choice of adapter as well as Parse Server version. This approach will enable
 * the dashboard to be built independently and still support these use cases.
 *
 *
 * Default features and feature options are listed in the features object.
 *
 * featureSwitch is a convenient way to turn on/off features without changing the config
 *
 * Features that use Adapters should specify the feature options through
 * the setFeature method in your controller and feature
 * Reference PushController and ParsePushAdapter as an example.
 *
 * NOTE: When adding new endpoints be sure to update this list both (features, featureSwitch)
 * if you are planning to have a UI consume it.
 */

// default features
let features = require('../package.json').features;

// master switch for features
let featuresSwitch = {
  globalConfig: true,
  hooks: true,
  logs: true,
  push: true,
  schemas: true,
};

/**
 * set feature config options
 */
function setFeature(key, value) {
  features[key] = value;
}

/**
 * get feature config options
 */
function getFeatures() {
  return Object.keys(features).reduce((result, key) => {
    if (featuresSwitch[key] && features[key]) {
      result[key] = features[key];
    }
    return result;
  }, {});
}

module.exports = {
  getFeatures,
  setFeature,
};
