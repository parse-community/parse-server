/*jshint node:true */
var ParseCloudExpressApp = require('parse-cloud-express').app;
var express = require("express");
var bodyParser = require('body-parser');

var CloudCodeServer = function(config) {
    'use strict';
    
    var Parse = require("parse/node");
    
    config.cloudServerURL =  config.cloudServerURL || `http://localhost:${config.port}`;
    config.mountPath =  config.mountPath || "/_hooks";
    
    global.Parse = require("parse/node");
    
    // Mount Parse.Cloud
    require("./Parse.Cloud");
    // Register the current configuration
    Parse.Cloud.registerConfiguration(config);
    
    // Setup the Parse app
    Parse.applicationId = config.applicationId;
    Parse.javascriptKey = config.javascriptKey;
    Parse.masterKey = config.masterKey;    

    const cloudCodeHooksApp = express();
    cloudCodeHooksApp.use(bodyParser.json({ 'type': '*/*' }));
    this.httpServer = cloudCodeHooksApp.listen(config.port);        
    
    
    cloudCodeHooksApp.use(config.mountPath, ParseCloudExpressApp);
    
    this.app = cloudCodeHooksApp;
    require(config.main);
    
    if (process.env.NODE_ENV !== "test") {
        console.log("[%s] Running Cloud Code for "+Parse.applicationId+" on http://localhost:%s", process.pid, config.port);
    }
}
CloudCodeServer.prototype.close = function() {
    this.httpServer.close();
}

if (require.main === module) {
    new CloudCodeServer(JSON.parse(process.argv[2]));
}

module.exports = CloudCodeServer;
