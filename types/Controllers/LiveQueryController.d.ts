export var __esModule: boolean;
export default _default;
export class LiveQueryController {
    constructor(config: any);
    classNames: Set<any>;
    liveQueryPublisher: _ParseCloudCodePublisher.ParseCloudCodePublisher;
    onAfterSave(className: any, currentObject: any, originalObject: any, classLevelPermissions: any): void;
    onAfterDelete(className: any, currentObject: any, originalObject: any, classLevelPermissions: any): void;
    hasLiveQuery(className: any): boolean;
    _makePublisherRequest(currentObject: any, originalObject: any, classLevelPermissions: any): {
        object: any;
    };
}
declare var _default: typeof LiveQueryController;
import _ParseCloudCodePublisher = require("../LiveQuery/ParseCloudCodePublisher");
