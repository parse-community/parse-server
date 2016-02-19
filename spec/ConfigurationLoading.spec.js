var configuration = require("./support/parse-server-config.json");
var Parse = require("parse/node");
var apps = configuration.applications;
var configLoader = require("../bin/config");

describe('Configuration loading', () => {

  it('should load a JSON from arguments', done => {
    var config = configLoader.loadFromCommandLine(["--config", "./spec/support/parse-server-config.json"]);
    expect(config).not.toBe(undefined);
    expect(config.applications.length).toBe(2);
    done();
  });

  it('should throw when json does not exist', done => {
    function load() {
      return configLoader.loadFromCommandLine(["--config", "./spec/support/bar.json"]); 
    }
    expect(load).toThrow();
    done();
  });
  
  it('should throw when json is missing', done => {
    function load() {
      return configLoader.loadFromCommandLine(["--config"]);  
    }
    expect(load).toThrow("Please specify the configuration file (json)");
    done();
  });
  
  it('should retun nothing when nothing is specified', done => {
    var config = configLoader.loadFromCommandLine();
    expect(config).toBe(undefined);
    done();
  });
  
  it('should support more arguments', done => {
    var config = configLoader.loadFromCommandLine(["--some","--config", "./spec/support/parse-server-config.json", "--other"]);
    expect(config).not.toBe(undefined);
    expect(config.applications.length).toBe(2);
    done();
  });
  
  it('should load from environment', done => {
    var env = {
      PARSE_SERVER_DATABASE_URI: "",
      PARSE_SERVER_CLOUD_CODE_MAIN: "",
      PARSE_SERVER_COLLECTION_PREFIX: "",
      PARSE_SERVER_APPLICATION_ID: "",
      PARSE_SERVER_CLIENT_KEY: "",
      PARSE_SERVER_REST_API_KEY: "",
      PARSE_SERVER_DOTNET_KEY: "",
      PARSE_SERVER_JAVASCRIPT_KEY: "",
      PARSE_SERVER_DOTNET_KEY: "",
      PARSE_SERVER_MASTER_KEY: "",
      PARSE_SERVER_FILE_KEY: "",
      PARSE_SERVER_FACEBOOK_APP_IDS: "hello,world"
    }

    var config = configLoader.loadFromEnvironment(env);
    expect(config).not.toBe(undefined);
    expect(Object.keys(config).length).toBe(Object.keys(env).length);
    expect(config.facebookAppIds.length).toBe(2);
    expect(config.facebookAppIds).toContain("hello");
    expect(config.facebookAppIds).toContain("world");
    done();
  });
  
  it('should load from environment options', done => {
    var env = {
      PARSE_SERVER_OPTIONS: require("fs").readFileSync("./spec/support/parse-server-config.json")
    }

    var config = configLoader.loadFromEnvironment(env);
    expect(config).not.toBe(undefined);
    expect(config.applications.length).toBe(2);
    done();
  });

  it('should load empty configuration options', done => {
    var config = configLoader();
    expect(config).not.toBe(undefined);
    expect(config).not.toBe({});
    expect(config.appId).toBe(undefined);
    done();
  });
  
});