"use strict"
var Parse = require('parse/node').Parse;

class Job {

  constructor(){
    require('./cloud/main.js');
    this.jobs = {};
  }

  put(name, req){
    var res = {
      success: (message) => {console.log(message)},
      error: (message) => {console.error(message)}
    }
    this.jobs[name] = function(){Parse.Cloud.Functions[name](req, res);};
    return this;
  }

  get(name){
    return this.jobs[name];
  }
	
}

module.exports = Job;
