/*jshint node:true */

var CloudCodeServer = function(config) {
    'use strict';
    var path = require("path");
    config.cloudServerURL = config.cloudServerURL || `http://localhost:${config.port}`;
    config.mountPath = config.mountPath || "/_hooks";
    var Parse = require("parse/node");
    
    global.Parse = Parse;
    Parse.initialize(config.applicationId, config.javascriptKey, config.masterKey);
    var ParseCloudExpress = require('parse-cloud-express');
    require("./Parse.Cloud");
    Parse.Cloud.injectAutoRegistration(config);

    var express = require("express");
    var bodyParser = require('body-parser');
    var app = require("express/lib/application");


    var cloudCodeHooksApp = express();
    cloudCodeHooksApp.use(bodyParser.json({ 'type': '*/*' }));
    this.httpServer = cloudCodeHooksApp.listen(config.port);
    if (process.env.NODE_ENV !== "test") {
        console.log("[%s] Running Cloud Code for "+Parse.applicationId+" on http://localhost:%s", process.pid, config.port);
    }
    
    Parse.Cloud.serverURL = config.cloudServerURL;
    Parse.Cloud.app = cloudCodeHooksApp;
    
    cloudCodeHooksApp.use(config.mountPath, ParseCloudExpress.app);
    
    this.app = cloudCodeHooksApp;
    require(config.main);
}
CloudCodeServer.prototype.close = function() {
    this.httpServer.close();
}

if (require.main === module) {
    new CloudCodeServer(JSON.parse(process.argv[2]));
}

module.exports = CloudCodeServer;
