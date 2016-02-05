# Standalone Cloud Code

to create a new CloudCode server:

```
var CloudCodeServer = require("parse-server/lib/cloud-code");

var config = {
  applicationId: "",
  javascriptKey: "",
  masterKey: "",
  port: 12345,
  main: "path/to/main.js",
  serverURL: Parse.serverURL, // or the server URL of your parse server
  hooksCreationStrategy: "always" | "try" | "never"
};
var server = new CloudCodeServer(config);

// From there the cloud code server started on port 12345;
server.app; // the express app running the server
server.stop() // stops the server from listening

```
