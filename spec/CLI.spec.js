var commander = require("../src/cli/utils/commander");

var definitions = {
  "arg0": "PROGRAM_ARG_0",
  "arg1": {
    env: "PROGRAM_ARG_1",
    required: true
  },
  "arg2": {
    env: "PROGRAM_ARG_2",
    action: function(value) {
      return parseInt(value);
    }
  },
  "arg3": {}
}

describe("commander additions", () => {
  
  afterEach((done) => {
    commander.options = [];
    delete commander.arg0;
    delete commander.arg1;
    delete commander.arg2;
    delete commander.arg3;
    done();
  })
  
  it("should load properly definitions from args", (done) => {
    commander.loadDefinitions(definitions);
    commander.parse(["node","./CLI.spec.js","--arg0", "arg0Value", "--arg1", "arg1Value", "--arg2", "2", "--arg3", "some"]);
    expect(commander.arg0).toEqual("arg0Value");
    expect(commander.arg1).toEqual("arg1Value");
    expect(commander.arg2).toEqual(2);
    expect(commander.arg3).toEqual("some");
    done();
  });
  
  it("should load properly definitions from env", (done) => {
    commander.loadDefinitions(definitions);
    commander.parse([], {
      "PROGRAM_ARG_0": "arg0ENVValue",
      "PROGRAM_ARG_1": "arg1ENVValue",
      "PROGRAM_ARG_2": "3",
    });
    expect(commander.arg0).toEqual("arg0ENVValue");
    expect(commander.arg1).toEqual("arg1ENVValue");
    expect(commander.arg2).toEqual(3);
    done();
  });
  
  it("should load properly use args over env", (done) => {
    commander.loadDefinitions(definitions);
    commander.parse(["node","./CLI.spec.js","--arg0", "arg0Value"], {
      "PROGRAM_ARG_0": "arg0ENVValue",
      "PROGRAM_ARG_1": "arg1ENVValue",
      "PROGRAM_ARG_2": "4",
    });
    expect(commander.arg0).toEqual("arg0Value");
    expect(commander.arg1).toEqual("arg1ENVValue");
    expect(commander.arg2).toEqual(4);
    done();
  });
  
})