import { JSONStorageProvider } from './JSONStorageController';

export class HooksFileCache {
  constructor(appId) {
    this.appId = appId;
    this.fileName = "hooks-"+this.appId+".json";
  }
  
  addHook(hook) {
    var json = this.getHooks();
    if (hook.triggerName) {
      json.triggers[hook.triggerName+"_"+hook.className] = hook;
    } else {
      json.functions[hook.functionName] = hook;
    } 
    this.saveHooks(json);
  }
  
  saveHooks(json) {
    JSONStorageProvider.getAdapter().write(this.fileName, json, this.appId);
  }
  
  getHooks() {
    var json = JSONStorageProvider.getAdapter().read(this.fileName, this.appId);
    json.triggers = json.triggers || {};
    json.functions = json.functions || {};
    return json;
  }
  
  getFunction(functionName) {
    return this.getHooks().functions[functionName];
    
  }
  
  getTrigger(className, triggerName) {
    var triggersMap = this.getHooks().triggers;
    return triggersMap[`${triggerName}_${className}`];
  }
  
  getTriggers() {
    var triggersMap = this.getHooks().triggers;
    return Object.keys(triggersMap).map(function(key){
        return triggersMap[key];
    });
  }
  
  getFunctions() {
    var functions = this.getHooks().functions;
    return Object.keys(functions).map(function(key){
        return functions[key];
    });
  }
  
  removeHook(functionName, triggerName = null) {
    var hooks = this.getHooks();
    var changed = false;
    if (!triggerName) {
      if (hooks.functions[functionName]) {
        delete hooks.functions[functionName];
        changed = true;
      }
    } else {
      if (hooks.triggers[triggerName+"_"+functionName]) {
        delete hooks.triggers[triggerName+"_"+functionName];
        changed = true;
      }
    }
    if (changed) {
      this.saveHooks(hooks)
    }
    return changed;
  }
}
