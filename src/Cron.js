"use strict"
class Cron {

  constructor(timezone){
    this.cronJob = require('cron').CronJob;
	  this.jobs = [];
	  this.timezone = timezone;
  }
	
  addJob(timeFormat, func){
    var job = new this.cronJob(timeFormat, func, null, false, this.timezone);
    this.jobs.push(job);
    return this;
  }
  
  on(){
    for(let job of this.jobs){
      job.start(); 
    }
    console.log("cron on");
  }

  off(){
    for(let job of this.jobs){
      job.stop(); 
    }
    console.log("cron off");
  }

  static getTimeFormat(min, hour, day, month, weekday){
    return [min, hour, day, month, weekday].join(" ");
  }
}

module.exports = Cron;
