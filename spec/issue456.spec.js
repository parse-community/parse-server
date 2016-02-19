

describe("issue 456", () => {
  
  it("should properly run promises together", (done) => {
    const obj1 = new Parse.Object("ObjectA");
    obj1.set({
      "foo": "bar"
    })
    
    const obj2 = new Parse.Object("ObjectB");
    obj2.set({
      "bar": "baz"
    });
    
    Parse.Promise.when(obj1.save(), obj2.save()).then((obj1Again, obj2Again) => {
      expect(obj1Again.get("foo")).toEqual("bar");
      expect(obj2Again.get("bar")).toEqual("baz");
      done();
    }, function(err){
      fail(err);
      done();
    });
    
  })
  
  it("should properly run query promises together", (done) => {
    const obj1 = new Parse.Object("ObjectA");
    obj1.set({
      "foo": "bar"
    })
    
    const obj2 = new Parse.Object("ObjectB");
    obj2.set({
      "bar": "baz"
    });
    
    Parse.Promise.when(obj1.save(), obj2.save()).then((obj1Again, obj2Again) => {
      expect(obj1Again.get("foo")).toEqual("bar");
      expect(obj2Again.get("bar")).toEqual("baz");
      
      const q1 = new Parse.Query("ObjectA");
      const q2 = new Parse.Query("ObjectB");
      
      return Parse.Promise.when(q1.first(), q2.first())
      
    }).then((obj1Again, obj2Again) => {
      expect(obj1Again.get("foo")).toEqual("bar");
      expect(obj2Again.get("bar")).toEqual("baz");
      done();
    }).fail((err) => {
      fail(err);
      done();
    });
    
  });
  
  it("should properly run query promises together in cloud code", (done) => {
    
    Parse.Cloud.define("testRunQueriesTogether", (req, res) => {
      const obj1 = new Parse.Object("ObjectA");
      obj1.set({
        "foo": "bar"
      })
      
      const obj2 = new Parse.Object("ObjectB");
      obj2.set({
        "bar": "baz"
      });
      
      Parse.Promise.when(obj1.save(), obj2.save()).then((obj1Again, obj2Again) => {
        expect(obj1Again.get("foo")).toEqual("bar");
        expect(obj2Again.get("bar")).toEqual("baz");
        
        const q1 = new Parse.Query("ObjectA");
        const q2 = new Parse.Query("ObjectB");
        
        return Parse.Promise.when(q1.first(), q2.first())
        
      }).then((obj1Again, obj2Again) => {
        expect(obj1Again.get("foo")).toEqual("bar");
        expect(obj2Again.get("bar")).toEqual("baz");
        res.success([obj1Again, obj2Again]);
      });
    });
    
    Parse.Cloud.run("testRunQueriesTogether").then( (res) => {
      expect(res.length).toBe(2);
      expect(res[0].get("foo")).toEqual("bar");
      expect(res[1].get("bar")).toEqual("baz");
      delete Parse.Cloud.Functions['testRunQueriesTogether'];
      done();
    }).fail((err) => {
      delete Parse.Cloud.Functions['testRunQueriesTogether'];
      fail(err);
      done();
    });
    
  })
})