var path = require("path");
function loadFromCommandLine(args) {
  args = args || [];
  while (args.length > 0) {
    if (args[0] == "--config") {
      if (args.length < 2) {
        throw "Please specify the configuration file (json)";
      }
      return require(path.resolve(args[1]));
    }
    args = args.slice(1, args.length);
  }
}

function loadFromEnvironment(env) {
  env = env || {};
  var options = {};
  if (env.PARSE_SERVER_OPTIONS) {

    options = JSON.parse(env.PARSE_SERVER_OPTIONS);

  } else {

    options.databaseURI = env.PARSE_SERVER_DATABASE_URI;
    options.cloud = env.PARSE_SERVER_CLOUD_CODE_MAIN;
    options.collectionPrefix = env.PARSE_SERVER_COLLECTION_PREFIX;

    // Keys and App ID
    options.appId = env.PARSE_SERVER_APPLICATION_ID;
    options.clientKey = env.PARSE_SERVER_CLIENT_KEY;
    options.restAPIKey = env.PARSE_SERVER_REST_API_KEY;
    options.dotNetKey = env.PARSE_SERVER_DOTNET_KEY;
    options.javascriptKey = env.PARSE_SERVER_JAVASCRIPT_KEY;
    options.dotNetKey = env.PARSE_SERVER_DOTNET_KEY;
    options.masterKey = env.PARSE_SERVER_MASTER_KEY;
    options.fileKey = env.PARSE_SERVER_FILE_KEY;
    // Comma separated list of facebook app ids
    var facebookAppIds = env.PARSE_SERVER_FACEBOOK_APP_IDS;

    if (facebookAppIds) {
      facebookAppIds = facebookAppIds.split(",");
      options.facebookAppIds = facebookAppIds;
    }
    var oauth = process.env.PARSE_SERVER_OAUTH_PROVIDERS;
    if (oauth) {
      options.oauth = JSON.parse(oauth);
    };
  }
  return options;
}


module.exports = function() {
  var options = loadFromCommandLine(process.argv);
  if (typeof options == "undefined") {
    options = loadFromEnvironment(process.env);
  }
  return options;
}

module.exports.loadFromEnvironment = loadFromEnvironment;
module.exports.loadFromCommandLine = loadFromCommandLine;