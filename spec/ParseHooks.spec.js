/* global describe, it, expect, fail, Parse */
var request = require('request');
var triggers = require('../src/triggers');
var HooksController = require('../src/Controllers/HooksController').default;
var express = require("express");
var bodyParser = require('body-parser');
// Inject the hooks API
Parse.Hooks = require("../src/cloud-code/Parse.Hooks");

var port = 12345;
var hookServerURL = "http://localhost:"+port;

var app = express();
app.use(bodyParser.json({ 'type': '*/*' }))
app.listen(12345);


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
         "X-Parse-REST-API-Key": Parse.restKey,
       },
       body: JSON.stringify({ url: "http://hello.word", functionName: "SomeFunction"})
     }, (err, res, body) => {
       body = JSON.parse(body);
       expect(body.error).toBe("unauthorized");
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
   
   
   it("should create hooks and properly preload them", (done) => {
     
     var promises = [];
     for (var i = 0; i<5; i++) {
       promises.push(Parse.Hooks.createTrigger("MyClass"+i, "beforeSave", "http://url.com/beforeSave/"+i));
       promises.push(Parse.Hooks.createFunction("AFunction"+i, "http://url.com/function"+i));
     }
     
     Parse.Promise.when(promises).then(function(results){
       for (var i=0; i<5; i++) {
         // Delete everything from memory, as the server just started
         triggers.removeTrigger("beforeSave", "MyClass"+i, Parse.applicationId);
         triggers.removeFunction("AFunction"+i, Parse.applicationId);
         expect(triggers.getTrigger("MyClass"+i, "beforeSave", Parse.applicationId)).toBeUndefined();
         expect(triggers.getFunction("AFunction"+i, Parse.applicationId)).toBeUndefined();
       }
       const hooksController = new HooksController(Parse.applicationId);
       return hooksController.load()
     }, (err) => {
       console.error(err);
       fail();
       done();
     }).then(function() {
       for (var i=0; i<5; i++) {
         expect(triggers.getTrigger("MyClass"+i, "beforeSave", Parse.applicationId)).not.toBeUndefined();
         expect(triggers.getFunction("AFunction"+i, Parse.applicationId)).not.toBeUndefined();
       }
       done();
     }, (err) => {
       console.error(err);
       fail();
       done();
     })
   });
   
   it("should run the function on the test server", (done) => {
     
     app.post("/SomeFunction", function(req, res) {
        res.json({success:"OK!"});
     });
     
     Parse.Hooks.createFunction("SOME_TEST_FUNCTION", hookServerURL+"/SomeFunction").then(function(){
       return Parse.Cloud.run("SOME_TEST_FUNCTION")
     }, (err) => {
       console.error(err);
       fail("Should not fail creating a function");
       done();
     }).then(function(res){
       expect(res).toBe("OK!");
       done();
     }, (err) => {
       console.error(err);
       fail("Should not fail calling a function");
       done();
     })
   });
   
   it("should run the function on the test server", (done) => {
     
     app.post("/SomeFunctionError", function(req, res) {
        res.json({error: {code: 1337, error: "hacking that one!"}});
     });
     // The function is delete as the DB is dropped between calls
     Parse.Hooks.createFunction("SOME_TEST_FUNCTION", hookServerURL+"/SomeFunctionError").then(function(){
       return Parse.Cloud.run("SOME_TEST_FUNCTION")
     }, (err) => {
       console.error(err);
       fail("Should not fail creating a function");
       done();
     }).then(function(res){
       fail("Should not succeed calling that function");
       done();
     }, (err) => {
       expect(err.code).toBe(141);
       expect(err.message.code).toEqual(1337)
       expect(err.message.error).toEqual("hacking that one!");
       done();
     });
   });
   
   
   it("should run the beforeSave hook on the test server", (done) => {
     var triggerCount = 0;
     app.post("/BeforeSaveSome", function(req, res) {
       triggerCount++;
       var object = req.body.object;
       object.hello = "world";
       // Would need parse cloud express to set much more
       // But this should override the key upon return
        res.json({success: {object: object}});
     });
     // The function is delete as the DB is dropped between calls
     Parse.Hooks.createTrigger("SomeRandomObject", "beforeSave" ,hookServerURL+"/BeforeSaveSome").then(function(){
       const obj = new Parse.Object("SomeRandomObject");
       return obj.save();
     }).then(function(res){
       expect(triggerCount).toBe(1);
       return res.fetch();
     }).then(function(res){
       expect(res.get("hello")).toEqual("world");
       done();
     }).fail((err) => {
       console.error(err);
       fail("Should not fail creating a function");
       done();
     });
   });
   
   it("should run the afterSave hook on the test server", (done) => {
     var triggerCount = 0;
     var newObjectId;
     app.post("/AfterSaveSome", function(req, res) {
       triggerCount++;
       var obj = new Parse.Object("AnotherObject");
       obj.set("foo", "bar");
       obj.save().then(function(obj){
         newObjectId = obj.id;
         res.json({success: {}});
       })
     });
     // The function is delete as the DB is dropped between calls
     Parse.Hooks.createTrigger("SomeRandomObject", "afterSave" ,hookServerURL+"/AfterSaveSome").then(function(){
       const obj = new Parse.Object("SomeRandomObject");
       return obj.save();
     }).then(function(res){
       var promise = new Parse.Promise();
       // Wait a bit here as it's an after save
       setTimeout(function(){
        expect(triggerCount).toBe(1);
        var q = new Parse.Query("AnotherObject");
        q.get(newObjectId).then(function(r){
           promise.resolve(r);
        });
       }, 300)
       return promise;
     }).then(function(res){
       expect(res.get("foo")).toEqual("bar");
       done();
     }).fail((err) => {
       console.error(err);
       fail("Should not fail creating a function");
       done();
     });
   });
});