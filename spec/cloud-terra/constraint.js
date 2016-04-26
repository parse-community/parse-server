const deepcopy = require('deepcopy');
var cfg = require("./constraint-type");

//default constraint from data file.
//var memCache = require("./parse-server-constraints");
var memCache = buildFullConstraints();

//store all controlled objectId and constraint Type from DB
var objCache =[];

//the last time edited cache memory
var lastTime = -1;

function buildShareConstraint(share){
    //todo need to dynamic column name here.
    //hardcode temporary
    memCache.definitions.Channel = share.Channel;
    memCache.definitions.PremiumFeeds = share.PremiumFeeds;
    memCache.definitions.Search = share.Search;
    memCache.definitions.PushBehavior = share.PushBehavior;
    memCache.definitions.Analytics = share.Analytics;
    memCache.definitions.Advertising = share.Advertising;
    memCache.definitions.BreakingNews = share.BreakingNews;
    memCache.definitions.Weather = share.Weather;
    memCache.definitions.Connect = share.Connect;
    memCache.definitions.Video = share.Video;
    memCache.definitions.StoreAccounts = share.StoreAccounts;
}
function buildFullConstraints(){

    var item = require("./collection-config/item");
    delete item.constraintType; // remove constraint type key

    var menu = require("./collection-config/menu");
    delete menu.constraintType;

    var menuItem = require("./collection-config/menu-item");
    delete menuItem.constraintType;

    var setting = require("./collection-config/setting");
    delete setting.constraintType;

    var share = require("./collection-config/share");
    delete share.constraintType;

    var style = require("./collection-config/style");
    delete style.constraintType;

    var cfgData = {definitions:share};
    cfgData.definitions.StyleConfig = style;
    cfgData.definitions.ItemConfig = item;
    cfgData.definitions.SettingConfig = setting;
    cfgData.definitions.MenuConfig = menu;
    cfgData.definitions.MenuItem = menuItem;

    //the last menu Item
    var childMenuItem = deepcopy(menuItem);
    delete childMenuItem.items.properties["menu"];
    cfgData.definitions.ChildMenuItem = childMenuItem;

    cfgData = refineJson(cfgData);

    return cfgData;
}

function refineJson(data){
    if (data) {
        var str = JSON.stringify(data);
        str = str.replace(/\"\#\$ref\":/g , "\"$ref\":");
        return JSON.parse(str);
    }
    return data;
}

function removeMemCache(constraintType){
    if(constraintType ==="style"){
        delete memCache.definitions["StyleConfig"];
        return;
    }

    if(constraintType ==="item"){
        delete memCache.definitions["ItemConfig"];
        return;
    }

    if(constraintType ==="setting"){
        delete memCache.definitions["SettingConfig"];
        return;
    }

    if(constraintType ==="menu"){
        delete memCache.definitions["MenuConfig"];
        return;
    }
    
    if(constraintType ==="menuItem"){
        delete memCache.definitions["MenuItem"];
        delete memCache.definitions["ChildMenuItem"];
        return;
    }

    if(constraintType ==="share"){

        delete memCache.definitions["Channel"];
        delete memCache.definitions["PremiumFeeds"];
        delete memCache.definitions["Search"];
        delete memCache.definitions["PushBehavior"];
        delete memCache.definitions["Analytics"];
        delete memCache.definitions["Advertising"];
        delete memCache.definitions["BreakingNews"];
        delete memCache.definitions["Weather"];
        delete memCache.definitions["Connect"];
        delete memCache.definitions["Video"];
        delete memCache.definitions["StoreAccounts"];
    }
}

function setConstraint(parseOjbArr){
    var style =  getSpecificConstraint(cfg.constraintType.style,parseOjbArr);
    var item = getSpecificConstraint(cfg.constraintType.item,parseOjbArr);
    var setting = getSpecificConstraint(cfg.constraintType.setting,parseOjbArr);
    var menu = getSpecificConstraint(cfg.constraintType.menu,parseOjbArr);
    var menuItem = getSpecificConstraint(cfg.constraintType.menuItem,parseOjbArr);
    var share = getSpecificConstraint(cfg.constraintType.share,parseOjbArr);

    //for style
    if (style != null) {
        memCache.definitions.StyleConfig = style;
    }

    //for share
    if (share != null) {
        buildShareConstraint(share);
    }

    //for item constraint
    if (item != null) {
        memCache.definitions.ItemConfig = item;
    }

    //for setting constraint
    if (setting != null) {
        memCache.definitions.SettingConfig = setting;
    }

    //for menu constraint
    if (menu != null) {
        memCache.definitions.MenuConfig = menu;
    }

    //for menu item constraint
    if (menuItem != null) {
        memCache.definitions.MenuItem = menuItem;

        //for child menu constraint
        var childMenuItem = deepcopy(menuItem);
        delete childMenuItem.items.properties["menu"];

        memCache.definitions.ChildMenuItem = childMenuItem;
    }

    //set last time for constraint.
    if(lastTime == -1){
        var d = new Date();
        lastTime = d.getTime();
    }

}

function getSpecificConstraint(constraintType, parseOjbArr){
    var constraint = null;
    for (var i = 0; i < parseOjbArr.length; i++) {

        //start. append cache object information
        var existed = false;
        for(var j =0;j< objCache.length;j++){
            if(objCache[j].objectId === parseOjbArr[i].id
            || objCache[j].constraintType === parseOjbArr[i].get("constraintType"))
            {
                existed = true;
                break;
            }
        }

        if(!existed){
            objCache.push({objectId:parseOjbArr[i].id
                                ,constraintType:parseOjbArr[i].get("constraintType")});
        }
        //end. append cache object information


        if (parseOjbArr[i].get("constraintType") === constraintType) {
            constraint = parseOjbArr[i].toJSON();

            lastTime = Math.max(lastTime, parseOjbArr[i].get("updatedAt").getTime());
            //remove unused fields
            delete constraint["constraintType"];
            delete constraint["createdAt"];
            delete constraint["updatedAt"];
            delete constraint["objectId"];
            break;
        }
    }

    return constraint;
};

module.exports = {
    notifySaved: function(parseOjbArr){
        setConstraint(parseOjbArr);
    },
    getConstraint: function(json){
        if(lastTime === json.lastTime){
            return {};
        }
        var key = json ? (json.key ? json.key : "" ) : "";
        if (key != "") {
           return memCache.definitions[key];
        }

        memCache.lastTime = lastTime;
        return memCache;

    },
    initConstraint: function(){
        var query = new Parse.Query(cfg.collectionName);
        query.find().then(function(result){
            if (result) {
              setConstraint(result);
            }

        }).catch(function(error){
            console.log("initConstraint",error);
        });
    },
    isExisted : function(json){
        var objectId = (json && json.objectId) ? json.objectId : "";
        var constraintType = (json && json.constraintType) ? json.constraintType : "";
        var exist = false;
        var count = 0;
        for(var i=0;i< objCache.length;i++){
          //by objectId
          if(objCache[i].objectId === objectId && constraintType ==="" ){
              count++;
          }

          //by constraintType
          if(objCache[i].constraintType === constraintType && objectId === ""){
              exist = true;
              break;
          }
        }

        exist = exist ? exist:(count > 1 ? true :false);
        return exist;
    },
    removeItems:function(json){

        //remove object cache
        var objectId = (json && json.objectId)? json.objectId : "";
        var constraintType = (json && json.constraintType)? json.constraintType : "";

        for(var i=0;i< objCache.length;i++){
            if(objCache[i].objectId === objectId || objCache[i].constraintType === constraintType ){
                objCache.splice(i,1);
                break;
            }
        }

        //remove memory cache.
        removeMemCache(constraintType);

        //set time to current
        var d = new Date();
        lastTime = d.getTime();
    }
}
