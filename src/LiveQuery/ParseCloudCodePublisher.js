import { ParsePubSub } from './ParsePubSub';
import Parse from 'parse/node';
import logger from '../logger';

class ParseCloudCodePublisher {
  parsePublisher: Object;

  // config object of the publisher, right now it only contains the redisURL,
  // but we may extend it later.
  constructor(config: any = {}) {
    this.parsePublisher = ParsePubSub.createPublisher(config);
  }

  async connect() {
    if (typeof this.parsePublisher.connect === 'function') {
      if (this.parsePublisher.isOpen) {
        return;
      }
      return Promise.resolve(this.parsePublisher.connect());
    }
  }

  onCloudCodeAfterSave(request: any): void {
    this._onCloudCodeMessage(Parse.applicationId + 'afterSave', request);
  }

  onCloudCodeAfterDelete(request: any): void {
    this._onCloudCodeMessage(Parse.applicationId + 'afterDelete', request);
  }

  onClearCachedRoles(user: ?Parse.Object) {
    // A role write or delete changes the effective role closure of every member
    // of that role and of any role inheriting from it, not just the acting
    // user, and a master key request has no acting user at all. `clearAll` asks
    // subscribers to drop every cached auth. `userId` is still sent when it is
    // known so that a LiveQuery server running an older version, which only
    // understands the targeted form, keeps behaving as it does today.
    this.parsePublisher.publish(
      Parse.applicationId + 'clearCache',
      JSON.stringify({ userId: user?.id, clearAll: true })
    );
  }

  // Request is the request object from cloud code functions. request.object is a ParseObject.
  _onCloudCodeMessage(type: string, request: any): void {
    logger.verbose(
      'Raw request from cloud code current : %j | original : %j',
      request.object,
      request.original
    );
    // We need the full JSON which includes className
    const message = {
      currentParseObject: request.object._toFullJSON(),
    };
    if (request.original) {
      message.originalParseObject = request.original._toFullJSON();
    }
    if (request.classLevelPermissions) {
      message.classLevelPermissions = request.classLevelPermissions;
    }
    this.parsePublisher.publish(type, JSON.stringify(message));
  }
}

export { ParseCloudCodePublisher };
