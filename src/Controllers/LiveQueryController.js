import { ParseCloudCodePublisher } from '../LiveQuery/ParseCloudCodePublisher';
import { LiveQueryOptions } from '../Options';
export class LiveQueryController {
  classNames: any;
  liveQueryPublisher: any;

  constructor(config: ?LiveQueryOptions) {
    // If config is empty, we just assume no classs needs to be registered as LiveQuery
    if (!config || !config.classNames) {
      this.classNames = new Set();
    } else if (config.classNames instanceof Array) {
      const classNames = config.classNames.map(name => new RegExp('^' + name + '$'));
      this.classNames = new Set(classNames);
    } else {
      throw 'liveQuery.classes should be an array of string';
    }
    this.liveQueryPublisher = new ParseCloudCodePublisher(config);
  }

  onAfterSave(
    className: string,
    currentObject: any,
    originalObject: any,
    classLevelPermissions: ?any
  ) {
    if (!this.hasLiveQuery(className)) {
      return;
    }
    const req = this._makePublisherRequest(currentObject, originalObject, classLevelPermissions);
    this.liveQueryPublisher.onCloudCodeAfterSave(req);
  }

  onAfterDelete(
    className: string,
    currentObject: any,
    originalObject: any,
    classLevelPermissions: any
  ) {
    if (!this.hasLiveQuery(className)) {
      return;
    }
    const req = this._makePublisherRequest(currentObject, originalObject, classLevelPermissions);
    this.liveQueryPublisher.onCloudCodeAfterDelete(req);
  }

  hasLiveQuery(className: string): boolean {
    for (const name of this.classNames) {
      if (name.test(className)) {
        return true;
      }
    }
    return false;
  }

  _makePublisherRequest(currentObject: any, originalObject: any, classLevelPermissions: ?any): any {
    const req = {
      object: currentObject,
    };
    if (currentObject) {
      req.original = originalObject;
    }
    if (classLevelPermissions) {
      req.classLevelPermissions = classLevelPermissions;
    }
    return req;
  }
}

export default LiveQueryController;
