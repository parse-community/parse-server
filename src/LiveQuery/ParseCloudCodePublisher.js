import { ParsePubSub } from './ParsePubSub';
import PLog from './PLog';

class ParseCloudCodePublisher {
  parsePublisher: Object;

  // config object of the publisher, right now it only contains the redisURL,
  // but we may extend it later.
  constructor(config: any = {}) {
    this.parsePublisher = ParsePubSub.createPublisher(config);
  }

  onCloudCodeAfterSave(request: any): void {
    this._onCloudCodeMessage('afterSave', request);
  }

  onCloudCodeAfterDelete(request: any): void {
    this._onCloudCodeMessage('afterDelete', request);
  }

  // Request is the request object from cloud code functions. request.object is a ParseObject.
  _onCloudCodeMessage(type: string, request: any): void {
    PLog.verbose('Raw request from cloud code current : %j | original : %j', request.object, request.original);
    // We need the full JSON which includes className
    let message = {
      currentParseObject: request.object._toFullJSON()
    }
    if (request.original) {
      message.originalParseObject = request.original._toFullJSON();
    }
    this.parsePublisher.publish(type, JSON.stringify(message));
  }
}

export {
  ParseCloudCodePublisher
}
