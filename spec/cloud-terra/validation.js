var tv4 = require('tv4');
// var constraints = require('./parse-server-constraints.json');
var cacheConstraint = require("./constraint");
var constraints = cacheConstraint.getConstraint({});

tv4.addSchema('#/definitions/PremiumFeeds', constraints.definitions.PremiumFeeds);
tv4.addSchema('#/definitions/Search', constraints.definitions.Search);
tv4.addSchema('#/definitions/PushBehavior', constraints.definitions.PushBehavior);
tv4.addSchema('#/definitions/Analytics', constraints.definitions.Analytics);
tv4.addSchema('#/definitions/Advertising', constraints.definitions.Advertising);
tv4.addSchema('#/definitions/BreakingNews', constraints.definitions.BreakingNews);
tv4.addSchema('#/definitions/Weather', constraints.definitions.Weather);
tv4.addSchema('#/definitions/Connect', constraints.definitions.Connect);
tv4.addSchema('#/definitions/Video', constraints.definitions.Video);
tv4.addSchema('#/definitions/StoreAccounts', constraints.definitions.StoreAccounts);
tv4.addSchema('#/definitions/Channel', constraints.definitions.Channel);

tv4.addSchema('#/definitions/MenuItem', constraints.definitions.MenuItem);
tv4.addSchema('#/definitions/ChildMenuItem', constraints.definitions.ChildMenuItem);

/**
  Checking field data with date time format
*/
tv4.addFormat('date-time', function (data, schema) {
    if (!data) {
      return null;
    }
    var check = new Date(data);
    var valid = !isNaN(check.valueOf());

    if (!valid) {
      return "Invalid datetime format.";
    } else {
      return null;
    }
});
/**
  Set custome message
*/
tv4.setErrorReporter(function (error, data, schema) {
  if(schema.errorMessage && schema.errorMessage[error.code]){
      return schema.errorMessage[error.code];
  }
  return;
});

module.exports = {
  //validate menu
  validateMenu: function(object) {
    console.log(">>>>>validate Menu Config");
    validate(object, constraints.definitions.MenuConfig);
  },

  //validate style
  validateStyle: function(object) {
    console.log(">>>>>validate Style Config");
    validate(object, constraints.definitions.StyleConfig);
  },

  //validate setting
  validateSetting: function(object) {
    console.log(">>>>>validate Setting Config");
    validate(object, constraints.definitions.SettingConfig);
  },

  //validate setting
  validateItem: function(object) {
    console.log(">>>>>validate Item Config");
    validate(object, constraints.definitions.ItemConfig);
  }
};

function validate(object, constraints) {
  var result = {};
  // model
  var model = object.req.object.toJSON();
  model = removeEmptyFields(model);

  result = tv4.validateMultiple(model, constraints);
  console.log("valid: " + result.valid);
  //check validate
  if (!result.valid) {
    var endResult = customizeErrors(result.errors);
      console.log("Errors: " + JSON.stringify(endResult));
      object.res.error(endResult);
  } else {
      // business logic validation
//    //validate data
//    if (object.modelName.indexOf("StyleConfig") >= 0) {
//        //validate data style config
//        validateDataStyleSetting("StyleConfig",object);
//     } else if(object.modelName.indexOf("SettingConfig")>=0) {
//        //validate data setting config
//        validateDataStyleSetting("SettingConfig",object);
//    } else if(object.modelName.indexOf("ItemConfig") >= 0){
//        //validate data item config
//        validateDataItemConfig(object);
//        object.res.success();
//    }
      object.res.success();
  }

}

function customizeErrors(jsonError) {
  for (var i = 0; i < jsonError.length; i ++) {
    var dataPath = jsonError[i]["dataPath"];
    dataPath = dataPath.substring(1, dataPath.length).replace(/[/]/g, '.');
    jsonError[i]["dataPath"] = dataPath;
    delete jsonError[i]["params"];
    delete jsonError[i]["schemaPath"];
    delete jsonError[i]["subErrors"];
    delete jsonError[i]["stack"];
  }
  return jsonError;
}

/**
* Validate data of item config
*/
function validateDataItemConfig(object){
  // check duplicate name
  var queryDuplicateName = new Parse.Query(object.modelName);
  queryDuplicateName.equalTo("name", object.req.object.get("name"));
  if(object.req.object.id){
    queryDuplicateName.notEqualTo("objectId", object.req.object.id);
  }

  // check exit app
  var queryExistApp = new Parse.Query("AppConfig");
  queryExistApp.equalTo("objectId", object.req.object.get("uniqueAppId"));

  // check duplicate uniqueAppId
  var queryDuplicateUniqueAppId = new Parse.Query(object.modelName);
  queryDuplicateUniqueAppId.equalTo("uniqueAppId", object.req.object.get("uniqueAppId"));
  if(object.req.object.id){
    queryDuplicateUniqueAppId.notEqualTo("objectId", object.req.object.id);
  }

  // check exist menu
  var queryExistMenu = new Parse.Query("MenuConfig");
  if(object.req.object.get("menuId")){
    queryExistMenu.equalTo("objectId", object.req.object.get("menuId"));
  }

  var promises =[];
  promises.push(queryDuplicateName.first()); //0
  promises.push(queryExistApp.first()); //1
  promises.push(queryDuplicateUniqueAppId.first()); //2
  promises.push(queryExistMenu.first()); //3

  Promise.all(promises).then(function(results){
    var arrErr = [];
    // check duplicate name
    if(results[0]){
      arrErr.push("App name is existed. ");
    }
    //check exist app
    if(!results[1]){
      arrErr.push("uniqueAppId is not existed (AppConfig). ");
    }

    // check duplicate uniqueAppId
    if(results[2]){
      arrErr.push("uniqueAppId is existed.");
    }

    //check exist menu
    if(object.req.object.get("menuId") && !results[3]){
      arrErr.push("menuId is not existed (MenuConfig). ");
    }
    //show list message
    if(arrErr.length >0){
      object.res.error(arrErr.join(","));
    }else{
      object.res.success();
    }

  }).catch(function(error){
    object.res.success();
  });
}

/**
* Validate data style config and setting config
*/
function validateDataStyleSetting(schemal,object){
  // check duplicate affiliateId
  var queryDuplicateAffiliate = new Parse.Query(object.modelName);
  queryDuplicateAffiliate.equalTo("affiliateId", object.req.object.get("affiliateId"));
  if(object.req.object.id){
    queryDuplicateAffiliate.notEqualTo("objectId", object.req.object.id);
  }

  var promises =[];
  promises.push(queryDuplicateAffiliate.first()); //0

  Promise.all(promises).then(function(results){
    var arrErr = [];
    // check duplicate affiliateId
    if(results[0]){
      arrErr.push("affiliateId "+object.req.object.get("affiliateId")+" is existed. ");
    }
    //show list message
    if(arrErr.length >0){
      object.res.error(arrErr.join(","));
    }else{
      object.res.success();
    }

  }).catch(function(error){
    object.res.success();
  });
}

/**
  Remove null, empty fields
*/
function removeEmptyFields(json) {
  for (var att in json) {
    if (isEmpty(json[att])) {
      if (typeof(json[att]) != 'object') {
         json[att] = null;
      }
    } else {
      var child = json[att];
      if (typeof(child) == 'object') {
        if (Array.isArray(child)) {
          for (var i = 0; i < child.length; i ++) {
            removeEmptyFields(child[i]);
          }
        } else {
          removeEmptyFields(child);
        }
      }
    }
  }
  return json;
}

/**
  Check if a properties is empty or not
*/
function isEmpty(obj) {
  if (typeof(obj) === 'boolean') {
    return false;
  }

  if (!obj) {
    return true;
  }

  if (Array.isArray(obj)) {
    return obj.length == 0 ? true : false;
  }

  for (var prop in obj) {
    if (obj.hasOwnProperty(prop))
      return false;
  }

  return true && JSON.stringify(obj) === JSON.stringify({});
}
