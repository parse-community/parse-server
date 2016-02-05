const path = require("path"),
  fs = require("fs");

export class JSONStorageController {
  
  constructor(basePath = null) {
    this.basePath = basePath;
  }
  
  getDirectoryForAppId(appId) {
    var dir = this.basePath+"/"+appId;
    dir = path.resolve(dir);
    try {
      fs.statSync(this.basePath);
    } catch(e) {
      fs.mkdir(this.basePath);
    }
    try {
      fs.statSync(dir);
    } catch(e) {
      fs.mkdir(dir);
    }
    return dir;
  }
  
  read(file, appId) {
    var dir = this.getDirectoryForAppId(appId);
    var json = {};
    try {
      json = require(dir+"/"+file);
    } catch (e) {}
    return json;
  }
  
  write(file, data, appId) {
    var dir = this.getDirectoryForAppId(appId);
    // Write sync to prevent concurrent writes on the same file
    fs.writeFileSync(dir+"/"+file, JSON.stringify(data));
  }
}

export class JSONStorageProvider {
  static setAdapter(controller) {
    JSONStorageProvider.adapter = controller;    
  }
  static getAdapter() {
    return JSONStorageProvider.adapter;
  }
}
