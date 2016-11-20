import {
  numberParser
} from '../utils/parsers';


export default {
  "appId": {
    required: true,
    help: "Required. This string should match the appId in use by your Parse Server. If you deploy the LiveQuery server alongside Parse Server, the LiveQuery server will try to use the same appId."
  },
  "masterKey": {
    required: true,
    help: "Required. This string should match the masterKey in use by your Parse Server. If you deploy the LiveQuery server alongside Parse Server, the LiveQuery server will try to use the same masterKey."
  },
  "serverURL": {
    required: true,
    help: "Required. This string should match the serverURL in use by your Parse Server. If you deploy the LiveQuery server alongside Parse Server, the LiveQuery server will try to use the same serverURL."
  },
  "redisURL": {
    help: "Optional. This string should match the masterKey in use by your Parse Server. If you deploy the LiveQuery server alongside Parse Server, the LiveQuery server will try to use the same masterKey."
  },
  "keyPairs": {
    help: "Optional. A JSON object that serves as a whitelist of keys. It is used for validating clients when they try to connect to the LiveQuery server. Check the following Security section and our protocol specification for details."
  },
  "websocketTimeout": {
    help: "Optional. Number of milliseconds between ping/pong frames. The WebSocket server sends ping/pong frames to the clients to keep the WebSocket alive. This value defines the interval of the ping/pong frame from the server to clients. Defaults to 10 * 1000 ms (10 s).",
    action: numberParser("websocketTimeout")
  },
  "cacheTimeout": {
    help: "Optional. Number in milliseconds. When clients provide the sessionToken to the LiveQuery server, the LiveQuery server will try to fetch its ParseUser's objectId from parse server and store it in the cache. The value defines the duration of the cache. Check the following Security section and our protocol specification for details. Defaults to 30 * 24 * 60 * 60 * 1000 ms (~30 days).",
    action: numberParser("cacheTimeout")
  },
  "logLevel": {
    help: "Optional. This string defines the log level of the LiveQuery server. We support VERBOSE, INFO, ERROR, NONE. Defaults to INFO.",
  },
  "port": {
    env: "PORT",
    help: "The port to run the ParseServer. defaults to 1337.",
    default: 1337,
    action: numberParser("port")
  },
};
