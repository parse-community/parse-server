export var __esModule: boolean;
export default _default;
export class PushWorker {
    constructor(pushAdapter: any, subscriberConfig?: {});
    adapter: any;
    channel: any;
    subscriber: any;
    run({ body, query, pushStatus, applicationId, UTCOffset }: {
        body: any;
        query: any;
        pushStatus: any;
        applicationId: any;
        UTCOffset: any;
    }): any;
    sendToAdapter(body: any, installations: any, pushStatus: any, config: any, UTCOffset: any): any;
}
declare var _default: typeof PushWorker;
