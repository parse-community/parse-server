export var __esModule: boolean;
export class Client {
    static pushResponse(parseWebSocket: any, message: any): void;
    static pushError(parseWebSocket: any, code: any, error: any, reconnect?: boolean, requestId?: any): void;
    constructor(id: any, parseWebSocket: any, hasMasterKey: boolean, sessionToken: any, installationId: any);
    id: any;
    parseWebSocket: any;
    hasMasterKey: boolean;
    sessionToken: any;
    installationId: any;
    roles: any[];
    subscriptionInfos: Map<any, any>;
    pushConnect: (subscriptionId: any, parseObjectJSON: any, parseOriginalObjectJSON: any) => void;
    pushSubscribe: (subscriptionId: any, parseObjectJSON: any, parseOriginalObjectJSON: any) => void;
    pushUnsubscribe: (subscriptionId: any, parseObjectJSON: any, parseOriginalObjectJSON: any) => void;
    pushCreate: (subscriptionId: any, parseObjectJSON: any, parseOriginalObjectJSON: any) => void;
    pushEnter: (subscriptionId: any, parseObjectJSON: any, parseOriginalObjectJSON: any) => void;
    pushUpdate: (subscriptionId: any, parseObjectJSON: any, parseOriginalObjectJSON: any) => void;
    pushDelete: (subscriptionId: any, parseObjectJSON: any, parseOriginalObjectJSON: any) => void;
    pushLeave: (subscriptionId: any, parseObjectJSON: any, parseOriginalObjectJSON: any) => void;
    addSubscriptionInfo(requestId: any, subscriptionInfo: any): void;
    getSubscriptionInfo(requestId: any): any;
    deleteSubscriptionInfo(requestId: any): boolean;
    _pushEvent(type: any): (subscriptionId: any, parseObjectJSON: any, parseOriginalObjectJSON: any) => void;
    _toJSONWithFields(parseObjectJSON: any, fields: any): any;
}
