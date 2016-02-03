var Parse = require('parse/node').Parse;

Parse.Cloud.define('hello', function(req, res) {
  res.success('Hello world!');
});

Parse.Cloud.beforeSave('BeforeSaveFailure', function(req, res) {
  res.error('You shall not pass!');
});

Parse.Cloud.beforeSave('BeforeSaveUnchanged', function(req, res) {
  res.success();
});

Parse.Cloud.beforeSave('BeforeSaveChanged', function(req, res) {
  req.object.set('foo', 'baz');
  res.success();
});

Parse.Cloud.afterSave('AfterSaveTest', function(req) {
  var obj = new Parse.Object('AfterSaveProof');
  obj.set('proof', req.object.id);
  obj.save();
});

Parse.Cloud.beforeDelete('BeforeDeleteFail', function(req, res) {
  res.error('Nope');
});

Parse.Cloud.beforeDelete('BeforeDeleteTest', function(req, res) {
  res.success();
});

Parse.Cloud.afterDelete('AfterDeleteTest', function(req) {
  var obj = new Parse.Object('AfterDeleteProof');
  obj.set('proof', req.object.id);
  obj.save();
});

Parse.Cloud.beforeSave('SaveTriggerUser', function(req, res) {
  if (req.user && req.user.id) {
    res.success();
  } else {
    res.error('No user present on request object for beforeSave.');
  }
});

Parse.Cloud.afterSave('SaveTriggerUser', function(req) {
  if (!req.user || !req.user.id) {
    console.log('No user present on request object for afterSave.');
  }
});

Parse.Cloud.define('foo', function(req, res) {
  res.success({
    object: {
      __type: 'Object',
      className: 'Foo',
      objectId: '123',
      x: 2,
      relation: {
        __type: 'Object',
        className: 'Bar',
        objectId: '234',
        x: 3
      }
    },
    array: [{
      __type: 'Object',
      className: 'Bar',
      objectId: '345',
      x: 2
    }],
    a: 2
  });
});

Parse.Cloud.define('bar', function(req, res) {
  res.error('baz');
});

Parse.Cloud.define('requiredParameterCheck', function(req, res) {
  res.success();
}, function(params) {
  return params.name;
});
