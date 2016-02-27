"use strict"
var Parse = require('parse/node').Parse;
var Cron = require('./Cron');
var Job = require('./Job');

class CloudCode {

  constructor(timezone){
    this.cron = new Cron(timezone);
    this.job = new Job();
  }
	
  putJob(name, req){
    this.job.put(name, req);
    return this;
  }

  addCron(name, timeFormat){
    this.cron.addJob(timeFormat, this.job.get(name));
    return this;
  }

  start(){
    this.cron.on();
  }

  stop(){
    this.cron.off();
  }

}

module.exports = CloudCode;
