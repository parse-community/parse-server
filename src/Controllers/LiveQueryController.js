import { ParseCloudCodePublisher } from '../LiveQuery/ParseCloudCodePublisher';

export class LiveQueryController {
  classNames: any;
  liveQueryPublisher: any;

  constructor(config: any) {
    let classNames;
    // If config is empty, we just assume no classs needs to be registered as LiveQuery
    if (!config || !config.classNames) {
      this.classNames = new Set();
    } else if (config.classNames instanceof Array) {
      this.classNames = new Set(config.classNames);
    } else {
      throw 'liveQuery.classes should be an array of string'
    }
    this.liveQueryPublisher = new ParseCloudCodePublisher(config);
  }

  onAfterSave(className: string, currentObject: any, originalObject: any) {
    if (!this.hasLiveQuery(className)) {
      return;
    }
    let req = this._makePublisherRequest(currentObject, originalObject);
    this.liveQueryPublisher.onCloudCodeAfterSave(req);
  }

  onAfterDelete(className: string, currentObject: any, originalObject: any) {
    if (!this.hasLiveQuery(className)) {
      return;
    }
    let req = this._makePublisherRequest(currentObject, originalObject);
    this.liveQueryPublisher.onCloudCodeAfterDelete(req);
  }

  hasLiveQuery(className: string): boolean {
    return this.classNames.has(className);
  }

  _makePublisherRequest(currentObject: any, originalObject: any): any {
    let req = {
      object: currentObject
    };
    if (currentObject) {
      req.original = originalObject;
    }
    return req;
  }
}

export default LiveQueryController;
