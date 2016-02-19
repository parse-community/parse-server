/* global describe, it, expect, fail, Parse */
var request = require('request');
// Inject the hooks API
Parse.Hooks = require("../src/cloud-code/Parse.Hooks");

describe('Hooks', () => {
  
   it("should have some hooks registered", (done) => {
     Parse.Hooks.getFunctions().then((res) => {
       expect(res.constructor).toBe(Array.prototype.constructor);
       done();
     }, (err) => {
       fail(err);
       done();
     });
   });
   
   it("should have some triggers registered", (done) => {
     Parse.Hooks.getTriggers().then( (res) => {
       expect(res.constructor).toBe(Array.prototype.constructor);
       done();
     }, (err) => {
       fail(err);
       done();
     });
   });

   it("should CRUD a function registration", (done) => {
     // Create
     Parse.Hooks.createFunction("My-Test-Function", "http://someurl").then((res) => {
       expect(res.functionName).toBe("My-Test-Function");
       expect(res.url).toBe("http://someurl")
       // Find
       return Parse.Hooks.getFunction("My-Test-Function");
     }, (err) => {
       fail(err);
       done();
     }).then((res) => {
       expect(res).not.toBe(null);
       expect(res).not.toBe(undefined);
       expect(res.url).toBe("http://someurl");
       // delete
        return Parse.Hooks.updateFunction("My-Test-Function", "http://anotherurl");
     }, (err) => {
       fail(err);
       done();
     }).then((res) => {
       expect(res.functionName).toBe("My-Test-Function");
       expect(res.url).toBe("http://anotherurl")
       
       return Parse.Hooks.deleteFunction("My-Test-Function");
     }, (err) => {
       fail(err);
       done();
     }).then((res) => {
       // Find again! but should be deleted
       return Parse.Hooks.getFunction("My-Test-Function");
     }, (err) => {
       fail(err);
       done();
     }).then((res) => {
       fail("Should not succeed")
       done();
     }, (err) => {
       expect(err).not.toBe(null);
       expect(err).not.toBe(undefined);
       expect(err.code).toBe(143);
       expect(err.error).toBe("no function named: My-Test-Function is defined")
       done();
     })
   });
   
   it("should CRUD a trigger registration", (done) => {
     // Create
     Parse.Hooks.createTrigger("MyClass","beforeDelete", "http://someurl").then((res) => {
       expect(res.className).toBe("MyClass");
       expect(res.triggerName).toBe("beforeDelete");
       expect(res.url).toBe("http://someurl")
       // Find
       return Parse.Hooks.getTrigger("MyClass","beforeDelete");
     }, (err) => {
       fail(err);
       done();
     }).then((res) => {
       expect(res).not.toBe(null);
       expect(res).not.toBe(undefined);
       expect(res.url).toBe("http://someurl");
       // delete
        return Parse.Hooks.updateTrigger("MyClass","beforeDelete", "http://anotherurl");
     }, (err) => {
       fail(err);
       done();
     }).then((res) => {
       expect(res.className).toBe("MyClass");
       expect(res.url).toBe("http://anotherurl")
       
       return Parse.Hooks.deleteTrigger("MyClass","beforeDelete");
     }, (err) => {
       fail(err);
       done();
     }).then((res) => {
       // Find again! but should be deleted
       return Parse.Hooks.getTrigger("MyClass","beforeDelete");
     }, (err) => {
       fail(err);
       done();
     }).then(function(){
       fail("should not succeed");
       done();
     }, (err) => {
       expect(err).not.toBe(null);
       expect(err).not.toBe(undefined);
       expect(err.code).toBe(143);
       expect(err.error).toBe("class MyClass does not exist")
       done();
     });
   });
   
   it("should fail to register hooks without Master Key", (done) => {
     request.post(Parse.serverURL+"/hooks/functions", {
       headers: {
         "X-Parse-Application-Id": Parse.applicationId,
         "X-Parse-Javascript-Key": Parse.javascriptKey,
       },
       body: JSON.stringify({ url: "http://hello.word", functionName: "SomeFunction"})
     }, (err, res, body) => {
       body = JSON.parse(body);
       expect(body.error).toBe("unauthorized");
       expect(res.statusCode).toBe(403);
       done();
     })
   });
   
   it("should fail trying to create two times the same function", (done) => {
      Parse.Hooks.createFunction("my_new_function", "http://url.com").then( () => {
        return  Parse.Hooks.createFunction("my_new_function", "http://url.com")
      }, () => {
        fail("should create a new function");
      }).then( () => {
        fail("should not be able to create the same function");
      }, (err) => {
        expect(err).not.toBe(undefined);
        expect(err).not.toBe(null);
        expect(err.code).toBe(143);
        expect(err.error).toBe('function name: my_new_function already exits')
        return Parse.Hooks.deleteFunction("my_new_function");
      }).then(() => {
        done();
      }, (err) => {
        fail(err);
        done();
      })
   });
   
   it("should fail trying to create two times the same trigger", (done) => {
      Parse.Hooks.createTrigger("MyClass", "beforeSave", "http://url.com").then( () => {
        return  Parse.Hooks.createTrigger("MyClass", "beforeSave", "http://url.com")
      }, () => {
        fail("should create a new trigger");
      }).then( () => {
        fail("should not be able to create the same trigger");
      }, (err) => {
        expect(err.code).toBe(143);
        expect(err.error).toBe('class MyClass already has trigger beforeSave')
        return Parse.Hooks.deleteTrigger("MyClass", "beforeSave");
      }).then(() => {
        done();
      }, (err) => {
        fail(err);
        done();
      })
   });
   
   it("should fail trying to update a function that don't exist", (done) => {
      Parse.Hooks.updateFunction("A_COOL_FUNCTION", "http://url.com").then( () => {
        fail("Should not succeed")
      }, (err) => {
        expect(err.code).toBe(143);
        expect(err.error).toBe('no function named: A_COOL_FUNCTION is defined');
        return Parse.Hooks.getFunction("A_COOL_FUNCTION")
      }).then( (res) => {
        fail("the function should not exist");
        done();
      }, (err) => {
        expect(err.code).toBe(143);
        expect(err.error).toBe('no function named: A_COOL_FUNCTION is defined');
        done();
      });
   });
   
   it("should fail trying to update a trigger that don't exist", (done) => {
      Parse.Hooks.updateTrigger("AClassName","beforeSave",  "http://url.com").then( () => {
        fail("Should not succeed")
      }, (err) => {
        expect(err.code).toBe(143);
        expect(err.error).toBe('class AClassName does not exist');
        return Parse.Hooks.getTrigger("AClassName","beforeSave")
      }).then( (res) => {
        fail("the function should not exist");
        done();
      }, (err) => {
        expect(err.code).toBe(143);
        expect(err.error).toBe('class AClassName does not exist');
        done();
      });
   });
   
   
   it("should fail trying to create a malformed function", (done) => {
      Parse.Hooks.createFunction("MyFunction").then( (res) => {
        fail(res);
      }, (err) => {
        expect(err.code).toBe(143);
        expect(err.error).toBe("invalid hook declaration");
        done();
      });
   });
   
   it("should fail trying to create a malformed function (REST)", (done) => {
     request.post(Parse.serverURL+"/hooks/functions", {
       headers: {
         "X-Parse-Application-Id": Parse.applicationId,
         "X-Parse-Master-Key": Parse.masterKey,
       },
       body: JSON.stringify({ functionName: "SomeFunction"})
     }, (err, res, body) => {
       body = JSON.parse(body);
       expect(body.error).toBe("invalid hook declaration");
       expect(body.code).toBe(143);
       done();
     })
   });
});