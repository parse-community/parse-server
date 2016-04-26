var propertiesItem = require("./item");
var propertiesMenuItem = require("./menu-item");
var propertiesMenu = require("./menu");
var propertiesSetting = require("./setting");
var propertiesShare = require("./share");
var propertiesStyle = require("./style");
var cfg = require("../constraint-type");
var objectProperties = {};
objectProperties[cfg.constraintType.item] = propertiesItem;
objectProperties[cfg.constraintType.menuItem] = propertiesMenuItem;
objectProperties[cfg.constraintType.menu] = propertiesMenu;
objectProperties[cfg.constraintType.setting] = propertiesSetting;
objectProperties[cfg.constraintType.share] = propertiesShare;
objectProperties[cfg.constraintType.style] = propertiesStyle;

module.exports = {

    //validate Schema Item
    validateSchema: function(obj, type) {
        validateGeneral(obj, type);
    },

};

//validate data general
function validateGeneral(obj, type, properties) {
    if (!properties) {
        // get properties follow type
        properties = objectProperties[type];
    }
    // properties check list
    var keyPropertiesCheck;
    var keyRejects = [];
    var checkValidate = true;
    // get model from req
    var model = obj.req.object.toJSON();
    // check primary properties follow type
    if ((type === cfg.constraintType.item || type === cfg.constraintType.menu || type === cfg.constraintType.setting || type === cfg.constraintType.style) && model && model.properties) {
        keyPropertiesCheck = Object.keys(model.properties);
    } else if (type === cfg.constraintType.menuItem && model && model.items && model.items.properties) {
        keyPropertiesCheck = Object.keys(model.items.properties);
    } else if (type === cfg.constraintType.share && model) {
        keyPropertiesCheck = Object.keys(model);
        // default key
        properties.push("objectId");
        properties.push("updatedAt");
        properties.push("createdAt");
    }
    if (keyPropertiesCheck) {
        keyPropertiesCheck.map(function(itemProperties) {
            if (!(properties.indexOf(itemProperties) > -1)) {
                keyRejects.push(itemProperties);
                checkValidate = false;
            }
        });
    }
    if (checkValidate) {
        obj.res.success();
    } else {
        obj.res.error("Schemal " + type + " invalid. Reject: [" + keyRejects.join() + "]");
    }
};
