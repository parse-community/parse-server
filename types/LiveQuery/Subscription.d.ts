export var __esModule: boolean;
export class Subscription {
    constructor(className: any, query: any, queryHash: any);
    className: any;
    query: any;
    hash: any;
    clientRequestIds: Map<any, any>;
    addClientSubscription(clientId: any, requestId: any): void;
    deleteClientSubscription(clientId: any, requestId: any): void;
    hasSubscribingClient(): boolean;
}
