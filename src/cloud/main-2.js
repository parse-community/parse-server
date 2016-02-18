Parse.Cloud.define('hello', function(req, res) {
  	res.success('Hello world');
});

Parse.Cloud.beforeSave("InjectAppId",  (req, res) => {
  req.object.set('applicationId', Parse.applicationId);
  req.object.set('javascriptKey', Parse.javascriptKey);
  req.object.set('masterKey', Parse.masterKey);
  res.success();
});

Parse.Cloud.define("echoParseKeys",  (req, res) => {
    res.success({ applicationId: Parse.applicationId, 
                  javascriptKey: Parse.javascriptKey,
                  masterKey: Parse.masterKey });
});
